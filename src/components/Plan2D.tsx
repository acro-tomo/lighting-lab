import { useEffect, useMemo, useRef, useState } from "react";
import type {
  FloorPlanBackground,
  FurnitureItem,
  LightFixture,
  Project,
  Selection,
  Vec2M,
  WallSegment,
  WindowOpening
} from "../types";
import { useProjectStore } from "../store/projectStore";
import { ScaleCalibrationModal } from "./ScaleCalibrationModal";
import { EditToolbar, type EditMode } from "./EditToolbar";

type Plan2DProps = {
  project: Project;
  selection: Selection;
  onSelect: (selection: Selection) => void;
  mode: EditMode;
  onModeChange: (mode: EditMode) => void;
  onAdd: (kind: string) => void;
  pendingAdd: string | null;
  onPlaceObject: (at: { x: number; z: number }) => void;
  onPlaceOnWall: (wallId: string, centerRatio: number) => void;
  focusPlan: boolean;
  onToggleFocusPlan: () => void;
};

// App側のmode(選択/移動/削除)に加え、2D固有のナビ(パン)だけをパレットに残す。
// 縮尺合わせは専用ボタン→モーダルで行う。追加系ツール(壁/窓/開口/家具/照明/吹抜)は
// Appのコンボボックスに一本化済み。
type NavTool = "パン";

type DragState =
  | { kind: "furniture"; id: string; offset: Vec2M }
  | { kind: "light"; id: string; offset: Vec2M }
  | { kind: "void"; id: string; offset: Vec2M }
  | { kind: "ceilingZone"; id: string; offset: Vec2M }
  | { kind: "floorZone"; id: string; offset: Vec2M }
  | { kind: "window"; id: string }
  | { kind: "pan"; clientStart: { x: number; y: number }; panStart: { x: number; y: number } }
  | null;

// パワポ風の辺ドラッグリサイズ対象。矩形フットプリント(幅x・奥行z)を持つ物のみ。
type ResizeKind = "furniture" | "void" | "ceilingZone" | "floorZone";
type ResizeEdge =
  | "left"
  | "right"
  | "top"
  | "bottom"
  | "topLeft"
  | "topRight"
  | "bottomLeft"
  | "bottomRight";
type ResizeState = { kind: ResizeKind; id: string; edge: ResizeEdge } | null;

const MIN_SIZE_M = 0.2;
// 窓/扉をクリックで壁に設置するときの許容距離(m)。これ以内の最寄り壁に付く。
const WALL_SNAP_M = 1.2;

// 壁に付く追加物（窓カタログ "window:<id>" / 扉 "door"）の判定。
const isWallOpening = (kind: string | null): boolean =>
  !!kind && (kind === "door" || kind.startsWith("window"));

const NAV_TOOLS: NavTool[] = ["パン"];

// SVG空間で線分 s→e に対する単位法線。side="left"/"right" は start→end を歩いた
// ときの左/右（worldToSvg は x→x, z→y で向きを保つので world の左右と一致する）。
// SVGはy下向きなので、left法線は (dy, -dx) を正規化したものとする。
const svgSideNormal = (
  s: { x: number; y: number },
  e: { x: number; y: number },
  side: "left" | "right"
): { x: number; y: number } => {
  const dx = e.x - s.x;
  const dy = e.y - s.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = dy / len;
  const ny = -dx / len;
  return side === "left" ? { x: nx, y: ny } : { x: -nx, y: -ny };
};

const distance = (a: Vec2M, b: Vec2M) => Math.hypot(a.x - b.x, a.z - b.z);

const snap = (value: number, grid = 0.1) => Math.round(value / grid) * grid;

const snapPoint = (point: Vec2M): Vec2M => ({ x: snap(point.x), z: snap(point.z) });

const uid = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

// 前頂点 prev から見て生の点 raw が水平/垂直に近ければ直角に吸着する。
const angleSnap = (prev: Vec2M, raw: Vec2M): Vec2M => {
  const dx = raw.x - prev.x;
  const dz = raw.z - prev.z;
  const a = Math.atan2(Math.abs(dz), Math.abs(dx)); // 0=水平, π/2=垂直
  if (a < (15 * Math.PI) / 180) return { x: raw.x, z: prev.z }; // 水平
  if (a > (75 * Math.PI) / 180) return { x: prev.x, z: raw.z }; // 垂直
  return raw;
};

// 点 p を壁線分に射影した壁上比率(0..1)と垂直距離(m)を返す。窓/扉のクリック配置に使う。
const projectOntoWall = (p: Vec2M, wall: WallSegment) => {
  const dx = wall.end.x - wall.start.x;
  const dz = wall.end.z - wall.start.z;
  const len2 = dx * dx + dz * dz;
  const t = len2 > 1e-9 ? ((p.x - wall.start.x) * dx + (p.z - wall.start.z) * dz) / len2 : 0;
  const ratio = Math.max(0, Math.min(1, t));
  const dist = Math.hypot(p.x - (wall.start.x + dx * ratio), p.z - (wall.start.z + dz * ratio));
  return { ratio, dist };
};

// クリック点に最も近い壁とその壁上比率。壁が無ければ null。
const nearestWall = (p: Vec2M, walls: WallSegment[]) => {
  let best: { wallId: string; ratio: number; dist: number } | null = null;
  for (const wall of walls) {
    const { ratio, dist } = projectOntoWall(p, wall);
    if (!best || dist < best.dist) best = { wallId: wall.id, ratio, dist };
  }
  return best;
};

// 矩形(中心center/幅x・奥行z/回転deg)の1辺をカーソルまで動かしてリサイズする。
// 反対側の辺は固定（パワポの図形リサイズと同じ挙動）。回転していてもローカル軸で処理する。
const resizeRect = (
  center: Vec2M,
  size: { x: number; z: number },
  rotationDeg: number,
  edge: ResizeEdge,
  cursor: Vec2M
): { center: Vec2M; size: { x: number; z: number } } => {
  const th = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(th);
  const sin = Math.sin(th);
  const dx = cursor.x - center.x;
  const dz = cursor.z - center.z;
  const lx = dx * cos + dz * sin; // ローカルx（幅方向）
  const lz = -dx * sin + dz * cos; // ローカルz（奥行方向）
  const halfX0 = size.x / 2;
  const halfZ0 = size.z / 2;
  let halfX = halfX0;
  let halfZ = halfZ0;
  let cLocalX = 0;
  let cLocalZ = 0;
  // 角ハンドルはアスペクト比を保ったまま等倍リサイズ。対角の角を固定点にする。
  if (edge === "topLeft" || edge === "topRight" || edge === "bottomLeft" || edge === "bottomRight") {
    const sx = edge === "topRight" || edge === "bottomRight" ? 1 : -1; // 掴んだ角のローカルx符号
    const sz = edge === "bottomLeft" || edge === "bottomRight" ? 1 : -1; // ローカルz符号(下が正)
    const anchorX = -sx * halfX0; // 対角(固定)の角
    const anchorZ = -sz * halfZ0;
    const rawW = Math.abs(lx - anchorX);
    const rawD = Math.abs(lz - anchorZ);
    let s = Math.max(rawW / size.x, rawD / size.z);
    s = Math.max(s, MIN_SIZE_M / size.x, MIN_SIZE_M / size.z);
    const finalW = size.x * s;
    const finalD = size.z * s;
    halfX = finalW / 2;
    halfZ = finalD / 2;
    cLocalX = anchorX + (sx * finalW) / 2;
    cLocalZ = anchorZ + (sz * finalD) / 2;
  } else if (edge === "right") {
    const left = -halfX;
    const right = Math.max(lx, left + MIN_SIZE_M);
    halfX = (right - left) / 2;
    cLocalX = (right + left) / 2;
  } else if (edge === "left") {
    const right = halfX;
    const left = Math.min(lx, right - MIN_SIZE_M);
    halfX = (right - left) / 2;
    cLocalX = (right + left) / 2;
  } else if (edge === "bottom") {
    const top = -halfZ;
    const bottom = Math.max(lz, top + MIN_SIZE_M);
    halfZ = (bottom - top) / 2;
    cLocalZ = (bottom + top) / 2;
  } else {
    const bottom = halfZ;
    const top = Math.min(lz, bottom - MIN_SIZE_M);
    halfZ = (bottom - top) / 2;
    cLocalZ = (bottom + top) / 2;
  }
  const wx = cLocalX * cos - cLocalZ * sin;
  const wz = cLocalX * sin + cLocalZ * cos;
  return {
    center: { x: center.x + wx, z: center.z + wz },
    size: { x: halfX * 2, z: halfZ * 2 }
  };
};

export const Plan2D = ({
  project,
  selection,
  onSelect,
  mode,
  onModeChange,
  onAdd,
  pendingAdd,
  onPlaceObject,
  onPlaceOnWall,
  focusPlan,
  onToggleFocusPlan
}: Plan2DProps) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  // navTool は2D固有ナビ(パン)・縮尺のみ。null のときは App の mode に従う。
  const [navTool, setNavTool] = useState<NavTool | null>(null);
  const [dragging, setDragging] = useState<DragState>(null);
  // ダブルクリックで開始する辺ドラッグリサイズ。
  // resizeTarget=ハンドル表示中のオブジェクト、resizing=ドラッグ中の辺。
  const [resizeTarget, setResizeTarget] = useState<{ kind: ResizeKind; id: string } | null>(null);
  const [resizing, setResizing] = useState<ResizeState>(null);
  const [scaleModalOpen, setScaleModalOpen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [bgNaturalSize, setBgNaturalSize] = useState<{ width: number; height: number } | null>(null);
  // 壁トレース: 確定済み頂点列とプレビュー用カーソル位置。
  const [wallDraft, setWallDraft] = useState<Vec2M[]>([]);
  const [wallCursor, setWallCursor] = useState<Vec2M | null>(null);
  // 窓/扉の追加待ち中、カーソル直下で設置先になる壁。クリック前に青くハイライトして
  // 「どの壁に付くか」を示し、無反応に見える問題を防ぐ。
  const [wallTarget, setWallTarget] = useState<{ wallId: string; ratio: number } | null>(null);

  // オブジェクト操作可否は navTool が無効(=Appのmode優先)のときだけ。
  // pendingAdd 中・wall モード中は背景SVGにクリックを通す（オブジェクトは pointerEvents:none）。
  const isPanMode = navTool === "パン";
  const canSelectObjects = !navTool && !pendingAdd && (mode === "select" || mode === "move");
  // 選択モードでもドラッグで動かせるほうが直感的。クリックのみなら移動は起きず選択だけ。
  const canDragObjects = !navTool && (mode === "select" || mode === "move");

  // 壁トレース中の内側(室内側)。start→end に対し左/右。undefined=未指定(中心対称)。
  const [draftInnerSide, setDraftInnerSide] = useState<"left" | "right" | undefined>(undefined);

  const updateFurniture = useProjectStore((state) => state.updateFurniture);
  const updateLight = useProjectStore((state) => state.updateLight);
  const updateVoid = useProjectStore((state) => state.updateVoid);
  const setBackgroundPlan = useProjectStore((state) => state.setBackgroundPlan);
  const updateWindow = useProjectStore((state) => state.updateWindow);
  const updateCeilingZone = useProjectStore((state) => state.updateCeilingZone);
  const updateFloorZone = useProjectStore((state) => state.updateFloorZone);
  const addWall = useProjectStore((state) => state.addWall);
  // 3Dビューの現在カメラ位置/注視点(ワールドm)。null のとき平面図にマーカーを描かない。
  const liveCamera = useProjectStore((state) => state.liveCamera);

  const backgroundUrl = project.backgroundPlan?.dataUrl;
  useEffect(() => {
    if (!backgroundUrl) {
      setBgNaturalSize(null);
      return;
    }
    let cancelled = false;
    const image = new Image();
    image.onload = () => {
      if (!cancelled) setBgNaturalSize({ width: image.naturalWidth, height: image.naturalHeight });
    };
    image.src = backgroundUrl;
    return () => {
      cancelled = true;
    };
  }, [backgroundUrl]);

  // 間取り図が新たに読み込まれ、まだ縮尺(scale/placement)が未設定なら
  // 自動的に縮尺合わせモーダルを開いて誘導する（要望10）。
  const hasScale = Boolean(project.backgroundPlan?.scale);
  useEffect(() => {
    if (backgroundUrl && !hasScale) {
      setScaleModalOpen(true);
    }
  }, [backgroundUrl, hasScale]);

  // 壁モードを抜けたら下書きをクリア。
  useEffect(() => {
    if (mode !== "wall") {
      setWallDraft([]);
      setWallCursor(null);
      setDraftInnerSide(undefined);
    }
  }, [mode]);

  // 窓/扉の追加待ちを抜けたら設置先ハイライトを消す。
  useEffect(() => {
    if (!isWallOpening(pendingAdd)) setWallTarget(null);
  }, [pendingAdd]);

  // 壁モード中: Enter でトレース終了。矢印キーで内側(室内側)の左右を反転する。
  // キーが平面図(SVG)にフォーカスしている / SVG内のイベント時のみ反応させ、
  // 3Dカメラ操作の矢印キーと二重発火しないようにする。
  useEffect(() => {
    if (mode !== "wall") return;
    const onKeyDown = (event: KeyboardEvent) => {
      const svg = svgRef.current;
      const target = event.target as Node | null;
      const planFocused = !!svg && (svg === target || (target ? svg.contains(target) : false));
      if (!planFocused) return;
      if (event.key === "Enter") {
        setWallDraft([]);
        setWallCursor(null);
        setDraftInnerSide(undefined);
        return;
      }
      if (
        event.key === "ArrowLeft" ||
        event.key === "ArrowRight" ||
        event.key === "ArrowUp" ||
        event.key === "ArrowDown"
      ) {
        event.preventDefault();
        // 3状態サイクル: その側を指している状態で同方向を再度押すと undefined
        // (=外壁無し・室内間仕切り=中心対称)になる。反対方向ならその側へ寄せる。
        const toLeft = event.key === "ArrowLeft" || event.key === "ArrowUp";
        setDraftInnerSide((current) => {
          if (toLeft) return current === "left" ? undefined : "left";
          return current === "right" ? undefined : "right";
        });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mode]);

  // 壁の既定値: 高さは天井高、厚みは既存壁を踏襲(無ければ0.12)、材質も既存壁を踏襲。
  // innerSide はトレース中に矢印キーで選んだ内側を保存（未指定なら中心対称）。
  const commitWallSegment = (start: Vec2M, end: Vec2M, innerSide: "left" | "right" | undefined) => {
    const reference = project.walls[project.walls.length - 1];
    addWall({
      id: uid("wall"),
      name: "追加壁",
      start,
      end,
      thicknessM: reference?.thicknessM ?? 0.12,
      heightM: project.room.ceilingHeightM,
      materialId: reference?.materialId ?? "wall-white",
      ...(innerSide ? { innerSide } : {})
    });
  };

  // コンテンツ全体(壁/room矩形/窓が乗る壁/家具/void/天井・床ゾーン/背景画像)を
  // 内包する world(m) バウンディングボックス。これを基準に planSize/座標系を作る。
  // room 矩形より壁が外に広がっていても 100%(=fit) で全体が映るようにするのが目的。
  const contentBox = useMemo(() => {
    let minX = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxZ = -Infinity;
    const include = (x: number, z: number) => {
      if (x < minX) minX = x;
      if (z < minZ) minZ = z;
      if (x > maxX) maxX = x;
      if (z > maxZ) maxZ = z;
    };
    // room 矩形(中心原点)は常に含める。
    include(-project.room.widthM / 2, -project.room.depthM / 2);
    include(project.room.widthM / 2, project.room.depthM / 2);
    for (const wall of project.walls) {
      include(wall.start.x, wall.start.z);
      include(wall.end.x, wall.end.z);
    }
    const includeRect = (c: Vec2M, s: { x: number; z: number }) => {
      include(c.x - s.x / 2, c.z - s.z / 2);
      include(c.x + s.x / 2, c.z + s.z / 2);
    };
    for (const item of project.furniture) includeRect(item.position, item.size);
    for (const v of project.voids) includeRect(v.center, v.size);
    for (const zone of project.ceilingZones ?? []) includeRect(zone.center, zone.size);
    for (const zone of project.floorZones ?? []) includeRect(zone.center, zone.size);
    const place = project.backgroundPlan?.placement;
    if (place && bgNaturalSize) {
      include(place.originXM, place.originZM);
      include(
        place.originXM + bgNaturalSize.width * place.metersPerPixel,
        place.originZM + bgNaturalSize.height * place.metersPerPixel
      );
    }
    if (!Number.isFinite(minX)) {
      // フォールバック: room 矩形のみ。
      minX = -project.room.widthM / 2;
      minZ = -project.room.depthM / 2;
      maxX = project.room.widthM / 2;
      maxZ = project.room.depthM / 2;
    }
    return { minX, minZ, maxX, maxZ };
    // 背景 placement は project.backgroundPlan 内なので依存に含める。
  }, [
    project.room.widthM,
    project.room.depthM,
    project.walls,
    project.furniture,
    project.voids,
    project.ceilingZones,
    project.floorZones,
    project.backgroundPlan,
    bgNaturalSize
  ]);

  // bbox 全体が 100%(zoom=1) で余白付きに収まるよう planSize/pxPerM を決める。
  // worldToSvg は (x - minX + MARGIN_M) * pxPerM。原点は bbox の min を使う。
  const MARGIN_M = 0.8;
  const planSize = useMemo(() => {
    const targetWidth = 920;
    const bboxW = Math.max(0.5, contentBox.maxX - contentBox.minX) + MARGIN_M * 2;
    const bboxH = Math.max(0.5, contentBox.maxZ - contentBox.minZ) + MARGIN_M * 2;
    const pxPerM = targetWidth / bboxW;
    return { width: targetWidth, height: bboxH * pxPerM, pxPerM };
  }, [contentBox]);

  // 外周(部屋の端)に来る太い壁ストロークがクリップされないよう、viewBoxを
  // 表示用の余白ぶん広げる。座標系は getScreenCTM 逆行列で扱うため
  // worldToSvg/svgPointToWorld は viewBox(pad) の影響を受けない。
  const VIEW_PAD = 60;
  const viewBox = {
    x: pan.x - VIEW_PAD,
    y: pan.y - VIEW_PAD,
    width: planSize.width / zoom + VIEW_PAD * 2,
    height: planSize.height / zoom + VIEW_PAD * 2
  };

  const worldToSvg = (point: Vec2M) => ({
    x: (point.x - contentBox.minX + MARGIN_M) * planSize.pxPerM,
    y: (point.z - contentBox.minZ + MARGIN_M) * planSize.pxPerM
  });

  const svgPointToWorld = (point: { x: number; y: number }): Vec2M => ({
    x: point.x / planSize.pxPerM + contentBox.minX - MARGIN_M,
    z: point.y / planSize.pxPerM + contentBox.minZ - MARGIN_M
  });

  // SVGのgetScreenCTMで画面座標→viewBoxユーザー座標へ変換する。
  // viewBox/preserveAspectRatio(レターボックス)・pan/zoomを正しく扱うため、
  // 比例計算ではなくCTM逆行列を使う（要素のアスペクト不一致でもズレない）。
  const clientToSvgPoint = (clientX: number, clientY: number) => {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return { x: 0, y: 0 };
    const point = svg.createSVGPoint();
    point.x = clientX;
    point.y = clientY;
    const mapped = point.matrixTransform(ctm.inverse());
    return { x: mapped.x, y: mapped.y };
  };

  const svgToWorld = (clientX: number, clientY: number): Vec2M =>
    svgPointToWorld(clientToSvgPoint(clientX, clientY));

  // 縮尺未設定の背景は従来どおりキャンバスに meet フィットさせる。
  // その配置をワールド座標(m)の placement として表現し、縮尺ツールの
  // 計算と描画の両方で同じ式を使えるようにする。
  const defaultPlacement = useMemo(() => {
    if (!bgNaturalSize || bgNaturalSize.width === 0 || bgNaturalSize.height === 0) return null;
    const scalePx = Math.min(
      planSize.width / bgNaturalSize.width,
      planSize.height / bgNaturalSize.height
    );
    const offsetX = (planSize.width - bgNaturalSize.width * scalePx) / 2;
    const offsetY = (planSize.height - bgNaturalSize.height * scalePx) / 2;
    const origin = svgPointToWorld({ x: offsetX, y: offsetY });
    return {
      originXM: origin.x,
      originZM: origin.z,
      metersPerPixel: scalePx / planSize.pxPerM
    } satisfies NonNullable<FloorPlanBackground["placement"]>;
    // svgPointToWorld は contentBox 基準（min/MARGIN）で原点が決まるため依存に含める。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bgNaturalSize, planSize.width, planSize.height, planSize.pxPerM, contentBox]);

  const placement = project.backgroundPlan?.placement ?? defaultPlacement;

  // 画像ピクセル座標 → ワールド座標(m)
  const imagePixelToWorld = (ipx: number, ipy: number): Vec2M | null => {
    if (!placement) return null;
    return {
      x: placement.originXM + ipx * placement.metersPerPixel,
      z: placement.originZM + ipy * placement.metersPerPixel
    };
  };

  // モーダルで選んだ画像ピクセル2点と実距離(mm)を placement(原点・m/px)へ変換して
  // 保存する。2点の中点は現 placement のワールド位置に固定し、縮尺変更で図面が
  // 大きくずれないようにする（旧world版と同じ思想）。
  const calibrateFromImagePixels = (
    pix1: { x: number; y: number },
    pix2: { x: number; y: number },
    millimeters: number
  ) => {
    const background = project.backgroundPlan;
    if (!background) return;
    const pixels = Math.hypot(pix2.x - pix1.x, pix2.y - pix1.y);
    if (pixels <= 1 || !(millimeters > 0)) return;

    const metersPerPixel = millimeters / 1000 / pixels;
    const midPix = { x: (pix1.x + pix2.x) / 2, y: (pix1.y + pix2.y) / 2 };
    const midWorld = imagePixelToWorld(midPix.x, midPix.y);
    if (!midWorld) return;

    setBackgroundPlan({
      ...background,
      scale: { pixels, millimeters },
      placement: {
        originXM: midWorld.x - midPix.x * metersPerPixel,
        originZM: midWorld.z - midPix.y * metersPerPixel,
        metersPerPixel
      }
    });
  };

  const handleSelect = (nextSelection: Selection) => {
    if (isPanMode) return;
    // 別オブジェクトを選んだらリサイズハンドルを閉じる。
    if (!nextSelection || resizeTarget?.id !== nextSelection.id) setResizeTarget(null);
    // 削除モードは廃止。選択中のオブジェクトはDeleteキーで消す（App側で処理）。
    onSelect(nextSelection);
  };

  // ダブルクリックでリサイズハンドルを表示する（矩形フットプリント物のみ）。
  const startResize = (kind: ResizeKind, id: string) => {
    onSelect({ kind, id });
    setResizeTarget({ kind, id });
  };

  const handleCanvasPointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    if (isPanMode || event.button === 1) {
      setDragging({ kind: "pan", clientStart: { x: event.clientX, y: event.clientY }, panStart: pan });
      return;
    }

    if (event.button !== 0) return;

    // pendingAdd 中はクリック位置にオブジェクトを配置（生成はApp側）。
    if (pendingAdd) {
      const world = svgToWorld(event.clientX, event.clientY);
      // 窓/扉は「クリックした壁」に付ける。壁の近く(0.7m以内)を押したときだけ設置し、
      // 室内の何もない所では設置しない（遠い壁へ勝手に付くのを防ぐ＝要望: 壁を自分で選ぶ）。
      if (isWallOpening(pendingAdd)) {
        const hit = nearestWall(world, project.walls);
        // 1.2m まで許容して取りこぼしを減らす。クリック前に対象壁を青くハイライト
        // しているので、どこに付くかは見て分かる。離れすぎなら維持して再クリックさせる。
        if (hit && hit.dist <= WALL_SNAP_M) {
          setWallTarget(null);
          onPlaceOnWall(hit.wallId, hit.ratio);
        }
      } else {
        onPlaceObject(snapPoint(world));
      }
      return;
    }

    // 壁モード: クリックで頂点を連続配置。前頂点があれば線分を即コミット。
    if (mode === "wall") {
      const raw = svgToWorld(event.clientX, event.clientY);
      const prev = wallDraft[wallDraft.length - 1];
      const v = prev ? snapPoint(angleSnap(prev, raw)) : snapPoint(raw);
      if (prev) commitWallSegment(prev, v, draftInnerSide);
      setWallDraft([...wallDraft, v]);
      return;
    }

    // select/move で何も無い背景を掴んだら平面図をパンする（要望: 空白ドラッグでパン）。
    setDragging({ kind: "pan", clientStart: { x: event.clientX, y: event.clientY }, panStart: pan });
  };

  const onPointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    // 壁モードはドラッグでなくてもカーソル追従でラバーバンドを更新する。
    if (mode === "wall" && wallDraft.length > 0) {
      const prev = wallDraft[wallDraft.length - 1];
      setWallCursor(snapPoint(angleSnap(prev, svgToWorld(event.clientX, event.clientY))));
    }

    // 窓/扉の追加待ち中: カーソル直下の最寄り壁を設置先候補としてハイライト。
    if (isWallOpening(pendingAdd)) {
      const hit = nearestWall(svgToWorld(event.clientX, event.clientY), project.walls);
      setWallTarget(hit && hit.dist <= WALL_SNAP_M ? { wallId: hit.wallId, ratio: hit.ratio } : null);
    }

    // 辺ドラッグによるリサイズ（3Dへ即連動）。
    if (resizing) {
      const cursor = svgToWorld(event.clientX, event.clientY);
      if (resizing.kind === "furniture") {
        const item = project.furniture.find((candidate) => candidate.id === resizing.id);
        if (!item) return;
        const r = resizeRect({ x: item.position.x, z: item.position.z }, { x: item.size.x, z: item.size.z }, item.rotationYDeg, resizing.edge, cursor);
        updateFurniture(item.id, {
          position: { ...item.position, x: r.center.x, z: r.center.z },
          size: { ...item.size, x: r.size.x, z: r.size.z }
        });
      } else if (resizing.kind === "void") {
        const voidArea = project.voids.find((candidate) => candidate.id === resizing.id);
        if (!voidArea) return;
        const r = resizeRect(voidArea.center, voidArea.size, 0, resizing.edge, cursor);
        updateVoid(voidArea.id, { center: r.center, size: r.size });
      } else if (resizing.kind === "ceilingZone") {
        const zone = (project.ceilingZones ?? []).find((candidate) => candidate.id === resizing.id);
        if (!zone) return;
        const r = resizeRect(zone.center, zone.size, 0, resizing.edge, cursor);
        updateCeilingZone(zone.id, { center: r.center, size: r.size });
      } else {
        const zone = (project.floorZones ?? []).find((candidate) => candidate.id === resizing.id);
        if (!zone) return;
        const r = resizeRect(zone.center, zone.size, 0, resizing.edge, cursor);
        updateFloorZone(zone.id, { center: r.center, size: r.size });
      }
      return;
    }

    if (!dragging) return;

    const point = snapPoint(svgToWorld(event.clientX, event.clientY));

    if (dragging.kind === "pan") {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return;
      const dx = ((event.clientX - dragging.clientStart.x) / rect.width) * viewBox.width;
      const dy = ((event.clientY - dragging.clientStart.y) / rect.height) * viewBox.height;
      setPan({ x: dragging.panStart.x - dx, y: dragging.panStart.y - dy });
      return;
    }

    // 窓/扉は属する壁の線上を滑らせる（壁上比率を更新）。
    if (dragging.kind === "window") {
      const win = project.windows.find((candidate) => candidate.id === dragging.id);
      const wall = win && project.walls.find((candidate) => candidate.id === win.wallId);
      if (win && wall) {
        const world = svgToWorld(event.clientX, event.clientY);
        updateWindow(win.id, { centerRatio: projectOntoWall(world, wall).ratio });
      }
      return;
    }

    const next = {
      x: point.x - dragging.offset.x,
      z: point.z - dragging.offset.z
    };

    if (dragging.kind === "furniture") {
      const item = project.furniture.find((candidate) => candidate.id === dragging.id);
      if (!item) return;
      updateFurniture(item.id, {
        position: { ...item.position, x: next.x, z: next.z }
      });
    } else if (dragging.kind === "light") {
      const fixture = project.lights.find((candidate) => candidate.id === dragging.id);
      if (!fixture) return;
      updateLight(fixture.id, {
        position: { ...fixture.position, x: next.x, z: next.z },
        target: fixture.target ? { ...fixture.target, x: next.x, z: next.z } : undefined
      });
    } else if (dragging.kind === "void") {
      const voidArea = project.voids.find((candidate) => candidate.id === dragging.id);
      if (!voidArea) return;
      updateVoid(voidArea.id, { center: next });
    } else if (dragging.kind === "ceilingZone") {
      const zone = (project.ceilingZones ?? []).find((candidate) => candidate.id === dragging.id);
      if (!zone) return;
      updateCeilingZone(zone.id, { center: next });
    } else if (dragging.kind === "floorZone") {
      const zone = (project.floorZones ?? []).find((candidate) => candidate.id === dragging.id);
      if (!zone) return;
      updateFloorZone(zone.id, { center: next });
    }
  };

  // ズーム時にアンカー点(ユーザー空間座標 u)が画面上の同じ位置に留まるよう pan を補正する。
  // viewBox.x = pan - VIEW_PAD, viewBox.width = planSize/zoom + VIEW_PAD*2 の関係から、
  // u = viewBox.x + frac*viewBox.width（frac=アンカーの viewBox 内相対位置）を不変に保つ。
  // → 新 viewBox.x = u - frac*newWidth、新 pan = viewBox.x + VIEW_PAD。
  const zoomAtUserPoint = (nextZoom: number, anchorX: number, anchorY: number) => {
    const clamped = Math.min(8, Math.max(0.2, nextZoom));
    if (clamped === zoom) return;
    const newWidth = planSize.width / clamped + VIEW_PAD * 2;
    const newHeight = planSize.height / clamped + VIEW_PAD * 2;
    const fracX = (anchorX - viewBox.x) / viewBox.width;
    const fracY = (anchorY - viewBox.y) / viewBox.height;
    setPan({
      x: anchorX - fracX * newWidth + VIEW_PAD,
      y: anchorY - fracY * newHeight + VIEW_PAD
    });
    setZoom(clamped);
  };

  // ホイール/トラックパッドでカーソル位置を中心にズーム。
  // トラックパッドのピンチは ctrlKey 付き wheel、2本指スクロールは通常 wheel として届く。
  // deltaY に比例した倍率にして、ピンチでも2本指スクロールでも滑らかにする。
  // ページスクロールを誘発しないよう必ず preventDefault する（native リスナで passive:false）。
  const handleWheel = (event: WheelEvent) => {
    event.preventDefault();
    // clientToSvgPoint は viewBox 変換込みのユーザー空間座標を返す（=固定したいアンカー点）。
    const anchor = clientToSvgPoint(event.clientX, event.clientY);
    // ピンチ(ctrlKey)は感度を上げる。指数で倍率化すると方向反転や大きなdeltaでも破綻しない。
    const intensity = event.ctrlKey ? 0.01 : 0.0015;
    const factor = Math.exp(-event.deltaY * intensity);
    zoomAtUserPoint(zoom * factor, anchor.x, anchor.y);
  };

  // wheel は passive 既定だと preventDefault が効かずページスクロールを誘発する。
  // SVG へ passive:false の native リスナで付ける。最新の zoom/座標系を参照するため
  // ref に最新ハンドラを保持し、リスナ自体は一度だけ登録する。
  const wheelHandlerRef = useRef(handleWheel);
  wheelHandlerRef.current = handleWheel;
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const listener = (event: WheelEvent) => wheelHandlerRef.current(event);
    svg.addEventListener("wheel", listener, { passive: false });
    return () => svg.removeEventListener("wheel", listener);
  }, []);

  // ＋/－ボタンはカーソルが無いため平面図の中心をアンカーにズームする。
  const zoomAtCenter = (factor: number) => {
    zoomAtUserPoint(zoom * factor, planSize.width / 2, planSize.height / 2);
  };

  // 背景画像を placement に従って SVG ユーザー空間へ配置する transform。
  // 画像ピクセル(0,0)の SVG 位置へ平行移動し、m/px × pxPerM で等倍拡大する。
  const bgRender = useMemo(() => {
    if (!bgNaturalSize || !placement) return null;
    const topLeftWorld = imagePixelToWorld(0, 0);
    if (!topLeftWorld) return null;
    const topLeftSvg = worldToSvg(topLeftWorld);
    return {
      width: bgNaturalSize.width,
      height: bgNaturalSize.height,
      tx: topLeftSvg.x,
      ty: topLeftSvg.y,
      scale: placement.metersPerPixel * planSize.pxPerM
    };
    // imagePixelToWorld/worldToSvg は placement・contentBox(min/MARGIN) から導出される。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bgNaturalSize, placement, planSize.pxPerM, contentBox]);

  const scaleLabel = project.backgroundPlan?.scale
    ? `実寸合わせ済み（${Math.round(project.backgroundPlan.scale.millimeters).toLocaleString("ja-JP")}mm基準）`
    : project.backgroundPlan
    ? "縮尺未設定（フィット表示）"
    : "背景なし";

  return (
    <section className="plan-panel" aria-label="2D平面図エディタ">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">2D Plan</p>
          <h2>平面配置</h2>
        </div>
        <div className="panel-heading-actions">
          <span className="unit-chip">{scaleLabel}</span>
          <button
            type="button"
            className="focus-toggle"
            title={focusPlan ? "通常表示に戻す" : "2Dを最大化"}
            aria-label={focusPlan ? "通常表示に戻す" : "2Dを最大化"}
            onClick={onToggleFocusPlan}
          >
            {focusPlan ? "🗗" : "⤢"}
          </button>
        </div>
      </div>

      {/* 操作(コンボボックス)＋追加(ポップアップ)。2D集中表示でもここから追加できる（要望1）。 */}
      <EditToolbar mode={mode} onModeChange={onModeChange} onAdd={onAdd} pendingAdd={pendingAdd} />

      <div className="tool-strip" role="toolbar" aria-label="2Dナビゲーション">
        {NAV_TOOLS.map((label) => (
          <button
            key={label}
            className={navTool === label ? "tool is-active" : "tool"}
            onClick={() => {
              // トグル: 同じナビを再押下で解除し App の mode に戻す。
              setNavTool((current) => (current === label ? null : label));
            }}
          >
            {label}
          </button>
        ))}
        {/* 縮尺合わせは専用モーダルで実施。背景画像があるときだけ押せる。 */}
        {project.backgroundPlan && (
          <button className="tool" onClick={() => setScaleModalOpen(true)}>
            縮尺
          </button>
        )}
      </div>

      <div className="plan-meta">
        <span>ズーム {Math.round(zoom * 100)}%</span>
        <button type="button" onClick={() => zoomAtCenter(1.2)} aria-label="拡大">+</button>
        <button type="button" onClick={() => zoomAtCenter(1 / 1.2)} aria-label="縮小">-</button>
        {/* zoom=1/pan=0 がコンテンツbbox全体のフィット表示（座標系をbbox基準にしたため）。 */}
        <button type="button" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}>全体表示</button>
      </div>

      <p className="tool-help">
        {isPanMode && "ドラッグで平面図をパン。ホイールでズーム。"}
        {!navTool && isWallOpening(pendingAdd) && "壁に近づけると青くハイライト。その壁をクリックで設置。設置後は壁上をドラッグで位置調整。"}
        {!navTool && pendingAdd && !isWallOpening(pendingAdd) && "クリックした位置にオブジェクトを配置します。"}
        {!navTool && !pendingAdd && mode === "select" && "オブジェクトをクリックで選択、ドラッグで移動。何もない所のドラッグで平面図をパン。Deleteで削除。"}
        {!navTool && !pendingAdd && mode === "move" && "オブジェクトをドラッグで移動。何もない所のドラッグで平面図をパン。"}
        {!navTool && !pendingAdd && mode === "wall" && "クリックで壁の頂点を連続配置。水平/垂直に自動スナップ。△が室内側＝矢印キーで左右反転。Enter/ダブルクリックで終了。"}
      </p>

      <div className="plan-canvas-wrap">
        <svg
          ref={svgRef}
          className="plan-canvas"
          tabIndex={0}
          style={{ cursor: mode === "wall" || pendingAdd ? "crosshair" : undefined, outline: "none" }}
          viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
          onPointerDown={handleCanvasPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={() => {
            setDragging(null);
            setResizing(null);
          }}
          onPointerLeave={() => {
            setDragging(null);
            setResizing(null);
          }}
          onDoubleClick={() => {
            setWallDraft([]);
            setWallCursor(null);
            setDraftInnerSide(undefined);
          }}
        >
          <defs>
            <pattern id="smallGrid" width={planSize.pxPerM / 2} height={planSize.pxPerM / 2} patternUnits="userSpaceOnUse">
              <path d={`M ${planSize.pxPerM / 2} 0 L 0 0 0 ${planSize.pxPerM / 2}`} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="1" />
            </pattern>
            <pattern id="meterGrid" width={planSize.pxPerM} height={planSize.pxPerM} patternUnits="userSpaceOnUse">
              <rect width={planSize.pxPerM} height={planSize.pxPerM} fill="url(#smallGrid)" />
              <path d={`M ${planSize.pxPerM} 0 L 0 0 0 ${planSize.pxPerM}`} fill="none" stroke="rgba(255,255,255,.16)" strokeWidth="1.4" />
            </pattern>
          </defs>
          <rect
            x={-VIEW_PAD}
            y={-VIEW_PAD}
            width={planSize.width + VIEW_PAD * 2}
            height={planSize.height + VIEW_PAD * 2}
            fill="#141414"
          />
          {project.backgroundPlan && bgRender && (
            <image
              href={project.backgroundPlan.dataUrl}
              x="0"
              y="0"
              width={bgRender.width}
              height={bgRender.height}
              transform={`translate(${bgRender.tx} ${bgRender.ty}) scale(${bgRender.scale})`}
              opacity="0.42"
            />
          )}
          <rect
            x={-VIEW_PAD}
            y={-VIEW_PAD}
            width={planSize.width + VIEW_PAD * 2}
            height={planSize.height + VIEW_PAD * 2}
            fill="url(#meterGrid)"
          />
          {/* パン/縮尺中はオブジェクトがクリックを奪わないよう pointerEvents を切り、
              背景の handleCanvasPointerDown に素通りさせる。select/move/delete のみ受け取る。 */}
          <g style={{ pointerEvents: canSelectObjects ? "auto" : "none" }}>
            <RoomOutline
              project={project}
              selection={selection}
              worldToSvg={worldToSvg}
              onSelect={handleSelect}
            />
            {project.windows.map((windowItem) => (
              <OpeningPlanItem
                key={windowItem.id}
                windowItem={windowItem}
                walls={project.walls}
                selection={selection}
                worldToSvg={worldToSvg}
                onSelect={handleSelect}
                canDrag={canDragObjects}
                onDragStart={() => setDragging({ kind: "window", id: windowItem.id })}
              />
            ))}
            {project.voids.map((voidArea) => (
              <VoidPlanItem
                key={voidArea.id}
                voidArea={voidArea}
                planSize={planSize}
                worldToSvg={worldToSvg}
                selected={selection?.kind === "void" && selection.id === voidArea.id}
                onSelect={handleSelect}
                onDragStart={(offset) => setDragging({ kind: "void", id: voidArea.id, offset })}
                onResize={() => startResize("void", voidArea.id)}
                svgToWorld={svgToWorld}
                canDrag={canDragObjects}
              />
            ))}
            {(project.ceilingZones ?? []).map((zone) => (
              <CeilingZonePlanItem
                key={zone.id}
                zone={zone}
                planSize={planSize}
                worldToSvg={worldToSvg}
                selected={selection?.kind === "ceilingZone" && selection.id === zone.id}
                onSelect={handleSelect}
                onDragStart={(offset) => setDragging({ kind: "ceilingZone", id: zone.id, offset })}
                onResize={() => startResize("ceilingZone", zone.id)}
                svgToWorld={svgToWorld}
                canDrag={canDragObjects}
              />
            ))}
            {(project.floorZones ?? []).map((zone) => (
              <FloorZonePlanItem
                key={zone.id}
                zone={zone}
                planSize={planSize}
                worldToSvg={worldToSvg}
                selected={selection?.kind === "floorZone" && selection.id === zone.id}
                onSelect={handleSelect}
                onDragStart={(offset) => setDragging({ kind: "floorZone", id: zone.id, offset })}
                onResize={() => startResize("floorZone", zone.id)}
                svgToWorld={svgToWorld}
                canDrag={canDragObjects}
              />
            ))}
            {project.furniture.map((item) => (
              <FurniturePlanItem
                key={item.id}
                item={item}
                planSize={planSize}
                worldToSvg={worldToSvg}
                selected={selection?.kind === "furniture" && selection.id === item.id}
                onSelect={handleSelect}
                onDragStart={(offset) => setDragging({ kind: "furniture", id: item.id, offset })}
                onResize={() => startResize("furniture", item.id)}
                svgToWorld={svgToWorld}
                canDrag={canDragObjects}
              />
            ))}
            {project.lights.map((fixture) => (
              <LightPlanItem
                key={fixture.id}
                fixture={fixture}
                worldToSvg={worldToSvg}
                selected={selection?.kind === "light" && selection.id === fixture.id}
                onSelect={handleSelect}
                onDragStart={(offset) => setDragging({ kind: "light", id: fixture.id, offset })}
                svgToWorld={svgToWorld}
                canDrag={canDragObjects}
              />
            ))}
          </g>

          {/* ダブルクリックで開いた矩形オブジェクトの辺リサイズハンドル（最前面）。 */}
          {resizeTarget && !pendingAdd && (
            <ResizeHandles
              target={resizeTarget}
              project={project}
              worldToSvg={worldToSvg}
              onEdgePointerDown={(edge) => setResizing({ kind: resizeTarget.kind, id: resizeTarget.id, edge })}
            />
          )}

          {/* 窓/扉の設置先になる壁のハイライト（最前面・クリック非対象）。 */}
          {isWallOpening(pendingAdd) && wallTarget && (() => {
            const wall = project.walls.find((candidate) => candidate.id === wallTarget.wallId);
            if (!wall) return null;
            const s = worldToSvg(wall.start);
            const e = worldToSvg(wall.end);
            return (
              <line
                x1={s.x}
                y1={s.y}
                x2={e.x}
                y2={e.y}
                stroke="#7fd1ff"
                strokeWidth={Math.max(10, wall.thicknessM * 100 + 6)}
                strokeOpacity={0.5}
                strokeLinecap="round"
                style={{ pointerEvents: "none" }}
              />
            );
          })()}

          {/* 壁トレースのプレビュー（頂点マーカー＋カーソルへのラバーバンド）。最前面・クリック非対象。 */}
          {mode === "wall" && (wallDraft.length > 0 || wallCursor) && (
            <g style={{ pointerEvents: "none" }}>
              {wallDraft.map((vertex, index) => {
                const p = worldToSvg(vertex);
                return <circle key={index} cx={p.x} cy={p.y} r={5} fill="#7fd1ff" stroke="#0b3a52" strokeWidth={1.5} />;
              })}
              {wallDraft.length > 0 && wallCursor && (
                <line
                  x1={worldToSvg(wallDraft[wallDraft.length - 1]).x}
                  y1={worldToSvg(wallDraft[wallDraft.length - 1]).y}
                  x2={worldToSvg(wallCursor).x}
                  y2={worldToSvg(wallCursor).y}
                  stroke="#7fd1ff"
                  strokeWidth={2}
                  strokeDasharray="8 6"
                />
              )}
              {/* 内側(室内側)を指す△マーカー。現在引いている辺の中点に法線方向で描く。
                  draftInnerSide が left/right のときは片側に1つ。undefined のときは
                  「外壁無し(室内間仕切り＝両側が室内)」を示すため両側に△を出す。 */}
              {(() => {
                // 現在の辺: 最後の確定点→カーソル。カーソルが無ければ直近2点の辺。
                const last = wallDraft[wallDraft.length - 1];
                const edgeStart = wallCursor ? last : wallDraft[wallDraft.length - 2];
                const edgeEnd = wallCursor ?? last;
                if (!edgeStart || !edgeEnd) return null;
                const s = worldToSvg(edgeStart);
                const e = worldToSvg(edgeEnd);
                if (Math.hypot(e.x - s.x, e.y - s.y) < 1) return null;
                const mid = { x: (s.x + e.x) / 2, y: (s.y + e.y) / 2 };
                const gap = 10;
                const size = 9;
                const len = Math.hypot(e.x - s.x, e.y - s.y) || 1;
                const tx = (e.x - s.x) / len; // 辺方向（三角形の底辺を辺と平行に）
                const ty = (e.y - s.y) / len;
                const triangle = (side: "left" | "right") => {
                  const n = svgSideNormal(s, e, side);
                  const tip = { x: mid.x + n.x * gap, y: mid.y + n.y * gap };
                  const baseC = { x: tip.x - n.x * size, y: tip.y - n.y * size };
                  const b1 = { x: baseC.x + tx * size * 0.7, y: baseC.y + ty * size * 0.7 };
                  const b2 = { x: baseC.x - tx * size * 0.7, y: baseC.y - ty * size * 0.7 };
                  return (
                    <polygon
                      key={side}
                      points={`${tip.x},${tip.y} ${b1.x},${b1.y} ${b2.x},${b2.y}`}
                      fill="#ffd166"
                      stroke="#7a5b00"
                      strokeWidth={1}
                    />
                  );
                };
                // undefined=外壁無し: 両側に△。指定時はその側のみ。
                const sides: ("left" | "right")[] = draftInnerSide
                  ? [draftInnerSide]
                  : ["left", "right"];
                return <>{sides.map(triangle)}</>;
              })()}
            </g>
          )}

          {/* カメラ現在地マーカー: 円=位置、三角=視線方向。最前面・クリック非対象。
              方向は worldToSvg(pos)→worldToSvg(target) の差分から算出（軸向きの取り違え回避）。 */}
          {liveCamera && (() => {
            const cp = worldToSvg({ x: liveCamera.x, z: liveCamera.z });
            const ct = worldToSvg({ x: liveCamera.tx, z: liveCamera.tz });
            const dx = ct.x - cp.x;
            const dy = ct.y - cp.y;
            const len = Math.hypot(dx, dy);
            const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
            // 三角形は +X 方向を向く形で定義し、視線方向へ回転させる。
            const reach = 26;
            const halfW = 13;
            return (
              <g className="plan-camera" style={{ pointerEvents: "none" }}>
                {len > 0.001 && (
                  <polygon
                    points={`0,${-halfW} ${reach},0 0,${halfW}`}
                    transform={`translate(${cp.x} ${cp.y}) rotate(${angle})`}
                    fill="rgba(56,224,255,0.28)"
                    stroke="#38e0ff"
                    strokeWidth={1.5}
                  />
                )}
                <circle cx={cp.x} cy={cp.y} r={7} fill="#38e0ff" stroke="#063946" strokeWidth={2} />
              </g>
            );
          })()}
        </svg>
      </div>

      {scaleModalOpen && project.backgroundPlan?.dataUrl && bgNaturalSize && (
        <ScaleCalibrationModal
          imageUrl={project.backgroundPlan.dataUrl}
          naturalSize={bgNaturalSize}
          onCancel={() => setScaleModalOpen(false)}
          onConfirm={(p1, p2, mm) => {
            calibrateFromImagePixels(p1, p2, mm);
            setScaleModalOpen(false);
          }}
        />
      )}
    </section>
  );
};

const RoomOutline = ({
  project,
  selection,
  worldToSvg,
  onSelect
}: {
  project: Project;
  selection: Selection;
  worldToSvg: (point: Vec2M) => { x: number; y: number };
  onSelect: (selection: Selection) => void;
}) => (
  <>
    {project.walls.map((wall) => {
      const start = worldToSvg(wall.start);
      const end = worldToSvg(wall.end);
      const selected = selection?.kind === "wall" && selection.id === wall.id;
      const displayWidth = Math.max(8, wall.thicknessM * 100);
      // innerSide 指定時は厚みを内側の面が芯線に乗るよう外側へ寄せる。中心線を
      // 外側(=innerSideの反対)へ displayWidth/2 平行移動して描く。
      // undefined は従来どおり中心対称（オフセット0）。後方互換。
      let off = { x: 0, y: 0 };
      if (wall.innerSide) {
        const outer = svgSideNormal(start, end, wall.innerSide === "left" ? "right" : "left");
        off = { x: outer.x * (displayWidth / 2), y: outer.y * (displayWidth / 2) };
      }
      const ds = { x: start.x + off.x, y: start.y + off.y };
      const de = { x: end.x + off.x, y: end.y + off.y };
      return (
        <g key={wall.id}>
          {/* 表示用の線とは別に透明で太いヒット線を重ね、壁を選択しやすくする（要望9）。
              表示の太さは displayWidth のまま変えない。 */}
          <line
            x1={ds.x}
            y1={ds.y}
            x2={de.x}
            y2={de.y}
            stroke="transparent"
            strokeWidth={Math.max(24, displayWidth + 16)}
            strokeLinecap="round"
            style={{ cursor: "pointer" }}
            onPointerDown={(event) => {
              event.stopPropagation();
              onSelect({ kind: "wall", id: wall.id });
            }}
          />
          <line
            x1={ds.x}
            y1={ds.y}
            x2={de.x}
            y2={de.y}
            className={selected ? "plan-wall is-selected" : "plan-wall"}
            strokeWidth={displayWidth}
            style={{ pointerEvents: "none" }}
          />
        </g>
      );
    })}
  </>
);

const OpeningPlanItem = ({
  windowItem,
  walls,
  selection,
  worldToSvg,
  onSelect,
  canDrag,
  onDragStart
}: {
  windowItem: WindowOpening;
  walls: WallSegment[];
  selection: Selection;
  worldToSvg: (point: Vec2M) => { x: number; y: number };
  onSelect: (selection: Selection) => void;
  canDrag: boolean;
  onDragStart: () => void;
}) => {
  const wall = walls.find((item) => item.id === windowItem.wallId);
  if (!wall) return null;
  const ratioA = Math.max(0, windowItem.centerRatio - windowItem.widthM / Math.max(0.1, distance(wall.start, wall.end)) / 2);
  const ratioB = Math.min(1, windowItem.centerRatio + windowItem.widthM / Math.max(0.1, distance(wall.start, wall.end)) / 2);
  const start = worldToSvg({
    x: wall.start.x + (wall.end.x - wall.start.x) * ratioA,
    z: wall.start.z + (wall.end.z - wall.start.z) * ratioA
  });
  const end = worldToSvg({
    x: wall.start.x + (wall.end.x - wall.start.x) * ratioB,
    z: wall.start.z + (wall.end.z - wall.start.z) * ratioB
  });
  const kind = windowItem.hasGlass ? "window" : "opening";
  const selected = selection?.kind === kind && selection.id === windowItem.id;

  return (
    <g
      style={{ cursor: canDrag ? "grab" : "pointer" }}
      onPointerDown={(event) => {
        event.stopPropagation();
        onSelect({ kind, id: windowItem.id });
        if (canDrag) onDragStart();
      }}
    >
      {/* 透明の太いヒット線で掴みやすくする（表示線は細いまま）。 */}
      <line x1={start.x} y1={start.y} x2={end.x} y2={end.y} stroke="transparent" strokeWidth={18} strokeLinecap="round" />
      <line
        x1={start.x}
        y1={start.y}
        x2={end.x}
        y2={end.y}
        className={selected ? `plan-opening ${kind} is-selected` : `plan-opening ${kind}`}
        style={{ pointerEvents: "none" }}
      />
    </g>
  );
};

const VoidPlanItem = ({
  voidArea,
  planSize,
  worldToSvg,
  selected,
  onSelect,
  onDragStart,
  onResize,
  svgToWorld,
  canDrag
}: {
  voidArea: Project["voids"][number];
  planSize: { pxPerM: number };
  worldToSvg: (point: Vec2M) => { x: number; y: number };
  selected: boolean;
  onSelect: (selection: Selection) => void;
  onDragStart: (offset: Vec2M) => void;
  onResize: () => void;
  svgToWorld: (clientX: number, clientY: number) => Vec2M;
  canDrag: boolean;
}) => {
  const topLeft = worldToSvg({
    x: voidArea.center.x - voidArea.size.x / 2,
    z: voidArea.center.z - voidArea.size.z / 2
  });

  const handlePointerDown = (event: React.PointerEvent<SVGGElement>) => {
    event.stopPropagation();
    onSelect({ kind: "void", id: voidArea.id });
    if (!canDrag) return;
    const point = svgToWorld(event.clientX, event.clientY);
    onDragStart({
      x: point.x - voidArea.center.x,
      z: point.z - voidArea.center.z
    });
  };

  return (
    <g onPointerDown={handlePointerDown} onDoubleClick={(event) => { event.stopPropagation(); onResize(); }}>
      <rect
        x={topLeft.x}
        y={topLeft.y}
        width={voidArea.size.x * planSize.pxPerM}
        height={voidArea.size.z * planSize.pxPerM}
        className={selected ? "plan-void is-selected" : "plan-void"}
      />
      <text x={topLeft.x + 12} y={topLeft.y + 24} className="plan-label">
        {voidArea.name}
      </text>
    </g>
  );
};

const CeilingZonePlanItem = ({
  zone,
  planSize,
  worldToSvg,
  selected,
  onSelect,
  onDragStart,
  onResize,
  svgToWorld,
  canDrag
}: {
  zone: NonNullable<Project["ceilingZones"]>[number];
  planSize: { pxPerM: number };
  worldToSvg: (point: Vec2M) => { x: number; y: number };
  selected: boolean;
  onSelect: (selection: Selection) => void;
  onDragStart: (offset: Vec2M) => void;
  onResize: () => void;
  svgToWorld: (clientX: number, clientY: number) => Vec2M;
  canDrag: boolean;
}) => {
  const topLeft = worldToSvg({
    x: zone.center.x - zone.size.x / 2,
    z: zone.center.z - zone.size.z / 2
  });

  const handlePointerDown = (event: React.PointerEvent<SVGGElement>) => {
    event.stopPropagation();
    onSelect({ kind: "ceilingZone", id: zone.id });
    if (!canDrag) return;
    const point = svgToWorld(event.clientX, event.clientY);
    onDragStart({ x: point.x - zone.center.x, z: point.z - zone.center.z });
  };

  return (
    <g onPointerDown={handlePointerDown} onDoubleClick={(event) => { event.stopPropagation(); onResize(); }}>
      <rect
        x={topLeft.x}
        y={topLeft.y}
        width={zone.size.x * planSize.pxPerM}
        height={zone.size.z * planSize.pxPerM}
        className={selected ? "plan-ceiling is-selected" : "plan-ceiling"}
      />
      <text x={topLeft.x + 12} y={topLeft.y + 24} className="plan-label">
        {zone.name}（▼{Math.round(zone.dropM * 1000)}）
      </text>
    </g>
  );
};

const FloorZonePlanItem = ({
  zone,
  planSize,
  worldToSvg,
  selected,
  onSelect,
  onDragStart,
  onResize,
  svgToWorld,
  canDrag
}: {
  zone: NonNullable<Project["floorZones"]>[number];
  planSize: { pxPerM: number };
  worldToSvg: (point: Vec2M) => { x: number; y: number };
  selected: boolean;
  onSelect: (selection: Selection) => void;
  onDragStart: (offset: Vec2M) => void;
  onResize: () => void;
  svgToWorld: (clientX: number, clientY: number) => Vec2M;
  canDrag: boolean;
}) => {
  const topLeft = worldToSvg({
    x: zone.center.x - zone.size.x / 2,
    z: zone.center.z - zone.size.z / 2
  });

  const handlePointerDown = (event: React.PointerEvent<SVGGElement>) => {
    event.stopPropagation();
    onSelect({ kind: "floorZone", id: zone.id });
    if (!canDrag) return;
    const point = svgToWorld(event.clientX, event.clientY);
    onDragStart({ x: point.x - zone.center.x, z: point.z - zone.center.z });
  };

  return (
    <g onPointerDown={handlePointerDown} onDoubleClick={(event) => { event.stopPropagation(); onResize(); }}>
      <rect
        x={topLeft.x}
        y={topLeft.y}
        width={zone.size.x * planSize.pxPerM}
        height={zone.size.z * planSize.pxPerM}
        className={selected ? "plan-floor is-selected" : "plan-floor"}
      />
      <text x={topLeft.x + 12} y={topLeft.y + 24} className="plan-label">
        {zone.name}（▽{Math.round(zone.dropM * 1000)}）
      </text>
    </g>
  );
};

const FurniturePlanItem = ({
  item,
  planSize,
  worldToSvg,
  selected,
  onSelect,
  onDragStart,
  onResize,
  svgToWorld,
  canDrag
}: {
  item: FurnitureItem;
  planSize: { pxPerM: number };
  worldToSvg: (point: Vec2M) => { x: number; y: number };
  selected: boolean;
  onSelect: (selection: Selection) => void;
  onDragStart: (offset: Vec2M) => void;
  onResize: () => void;
  svgToWorld: (clientX: number, clientY: number) => Vec2M;
  canDrag: boolean;
}) => {
  const center = worldToSvg({ x: item.position.x, z: item.position.z });
  const width = item.size.x * planSize.pxPerM;
  const depth = item.size.z * planSize.pxPerM;
  // テレビ等の薄い家具(奥行数cm)は表示が細く、隣接する壁の太いヒット線にクリックを
  // 奪われて選べない。最低限の透明ヒット領域を敷いて確実に掴めるようにする。
  const hitW = Math.max(width, 18);
  const hitD = Math.max(depth, 18);

  const handlePointerDown = (event: React.PointerEvent<SVGGElement>) => {
    event.stopPropagation();
    onSelect({ kind: "furniture", id: item.id });
    if (!canDrag) return;
    const point = svgToWorld(event.clientX, event.clientY);
    onDragStart({
      x: point.x - item.position.x,
      z: point.z - item.position.z
    });
  };

  return (
    <g
      transform={`translate(${center.x} ${center.y}) rotate(${item.rotationYDeg})`}
      onPointerDown={handlePointerDown}
      onDoubleClick={(event) => { event.stopPropagation(); onResize(); }}
      className={selected ? "plan-furniture is-selected" : "plan-furniture"}
    >
      <rect x={-hitW / 2} y={-hitD / 2} width={hitW} height={hitD} fill="transparent" stroke="none" />
      {item.type === "roundTable" ? (
        <circle r={width / 2} />
      ) : (
        <rect x={-width / 2} y={-depth / 2} width={width} height={depth} rx="8" />
      )}
      <text x={-width / 2 + 6} y={-depth / 2 - 8} className="plan-label">
        {item.name}
      </text>
    </g>
  );
};

const LightPlanItem = ({
  fixture,
  worldToSvg,
  selected,
  onSelect,
  onDragStart,
  svgToWorld,
  canDrag
}: {
  fixture: LightFixture;
  worldToSvg: (point: Vec2M) => { x: number; y: number };
  selected: boolean;
  onSelect: (selection: Selection) => void;
  onDragStart: (offset: Vec2M) => void;
  svgToWorld: (clientX: number, clientY: number) => Vec2M;
  canDrag: boolean;
}) => {
  const center = worldToSvg({ x: fixture.position.x, z: fixture.position.z });
  const target = fixture.target ? worldToSvg({ x: fixture.target.x, z: fixture.target.z }) : null;
  const handlePointerDown = (event: React.PointerEvent<SVGGElement>) => {
    event.stopPropagation();
    onSelect({ kind: "light", id: fixture.id });
    if (!canDrag) return;
    const point = svgToWorld(event.clientX, event.clientY);
    onDragStart({
      x: point.x - fixture.position.x,
      z: point.z - fixture.position.z
    });
  };

  return (
    <g onPointerDown={handlePointerDown} className={selected ? "plan-light is-selected" : "plan-light"}>
      {target && <line x1={center.x} y1={center.y} x2={target.x} y2={target.y} className="plan-aim-line" />}
      <circle cx={center.x} cy={center.y} r={selected ? 13 : 10} />
      <text x={center.x + 14} y={center.y - 12} className="plan-label">
        {fixture.name}
      </text>
    </g>
  );
};

// 辺リサイズハンドル。対象矩形の4辺中点に丸ハンドルを置き、ドラッグでその辺を動かす。
const ResizeHandles = ({
  target,
  project,
  worldToSvg,
  onEdgePointerDown
}: {
  target: { kind: ResizeKind; id: string };
  project: Project;
  worldToSvg: (point: Vec2M) => { x: number; y: number };
  onEdgePointerDown: (edge: ResizeEdge) => void;
}) => {
  let center: Vec2M;
  let size: { x: number; z: number };
  let rotationDeg = 0;
  if (target.kind === "furniture") {
    const item = project.furniture.find((candidate) => candidate.id === target.id);
    if (!item) return null;
    center = { x: item.position.x, z: item.position.z };
    size = { x: item.size.x, z: item.size.z };
    rotationDeg = item.rotationYDeg;
  } else if (target.kind === "void") {
    const voidArea = project.voids.find((candidate) => candidate.id === target.id);
    if (!voidArea) return null;
    center = voidArea.center;
    size = voidArea.size;
  } else if (target.kind === "ceilingZone") {
    const zone = (project.ceilingZones ?? []).find((candidate) => candidate.id === target.id);
    if (!zone) return null;
    center = zone.center;
    size = zone.size;
  } else {
    const zone = (project.floorZones ?? []).find((candidate) => candidate.id === target.id);
    if (!zone) return null;
    center = zone.center;
    size = zone.size;
  }

  const th = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(th);
  const sin = Math.sin(th);
  const halfX = size.x / 2;
  const halfZ = size.z / 2;
  const toSvg = (lx: number, lz: number) =>
    worldToSvg({ x: center.x + lx * cos - lz * sin, z: center.z + lx * sin + lz * cos });

  const handles: { edge: ResizeEdge; p: { x: number; y: number }; cursor: string }[] = [
    { edge: "right", p: toSvg(halfX, 0), cursor: "ew-resize" },
    { edge: "left", p: toSvg(-halfX, 0), cursor: "ew-resize" },
    { edge: "bottom", p: toSvg(0, halfZ), cursor: "ns-resize" },
    { edge: "top", p: toSvg(0, -halfZ), cursor: "ns-resize" },
    // 角ハンドル: ドラッグでアスペクト比を保ったまま等倍リサイズ。
    { edge: "topLeft", p: toSvg(-halfX, -halfZ), cursor: "nwse-resize" },
    { edge: "topRight", p: toSvg(halfX, -halfZ), cursor: "nesw-resize" },
    { edge: "bottomLeft", p: toSvg(-halfX, halfZ), cursor: "nesw-resize" },
    { edge: "bottomRight", p: toSvg(halfX, halfZ), cursor: "nwse-resize" }
  ];

  return (
    <g style={{ pointerEvents: "auto" }}>
      {handles.map((handle) => (
        <circle
          key={handle.edge}
          cx={handle.p.x}
          cy={handle.p.y}
          r={7}
          className="plan-resize-handle"
          style={{ cursor: handle.cursor }}
          onPointerDown={(event) => {
            event.stopPropagation();
            onEdgePointerDown(handle.edge);
          }}
        />
      ))}
    </g>
  );
};
