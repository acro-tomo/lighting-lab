import { useEffect, useMemo, useRef, useState } from "react";
import type {
  FloorPlanBackground,
  FurnitureItem,
  LightFixture,
  Project,
  Selection,
  Vec2M,
  VoidSide,
  WallSegment,
  WindowOpening
} from "../types";
import { useProjectStore } from "../store/projectStore";
import { DEFAULT_DAYLIGHT } from "../utils/sun";
import { ScaleCalibrationModal } from "./ScaleCalibrationModal";
import type { EditMode } from "./EditToolbar";
import { isWallLightAddKind } from "../data/fixtureAddKinds";
import {
  isWallMountedFixture,
  WALL_MOUNT_SNAP_M,
  nearestWallMountSurfaceAt,
  parseVoidWallId,
  visibleVoidSides,
  wallMountedLightPlacementAt
} from "../utils/fixtureMounting";
import { constrainFurniturePlacement } from "../utils/furniturePlacement";

type Plan2DProps = {
  project: Project;
  selection: Selection;
  onSelect: (selection: Selection) => void;
  mode: EditMode;
  onModeChange: (mode: EditMode) => void;
  pendingAdd: string | null;
  onPlaceObject: (at: { x: number; z: number }) => void;
  onPlaceOnWall: (wallId: string, centerRatio: number, heightM?: number) => void;
  canEditWalls: boolean;
  focusPlan: boolean;
  onToggleFocusPlan: () => void;
};

type DragState =
  | { kind: "furniture"; id: string; offset: Vec2M }
  | { kind: "light"; id: string; offset: Vec2M }
  | { kind: "void"; id: string; offset: Vec2M }
  | { kind: "ceilingZone"; id: string; offset: Vec2M }
  | { kind: "floorZone"; id: string; offset: Vec2M }
  | { kind: "window"; id: string }
  | { kind: "wall"; id: string; pointerStart: Vec2M; start: Vec2M; end: Vec2M }
  | {
      kind: "background";
      pointerStartSvg: { x: number; y: number };
      pxPerMStart: number;
      placementStart: NonNullable<FloorPlanBackground["placement"]>;
    }
  | { kind: "pan"; clientStart: { x: number; y: number }; panStart: { x: number; y: number }; viewBoxStart: { width: number; height: number }; sensitivity: number }
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
type TouchPoint = { clientX: number; clientY: number };
type PinchState = { distance: number };
type TouchTapState = { pointerId: number; clientX: number; clientY: number } | null;
type TouchWallTraceState = {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  start: Vec2M;
  isDrawing: boolean;
} | null;
type ViewState = { zoom: number; pan: { x: number; y: number } };

const MIN_SIZE_M = 0.2;
// 窓/扉をクリックで壁に設置するときの許容距離(m)。これ以内の最寄り壁に付く。
const WALL_SNAP_M = 1.2;
// ライトをドラッグ移動するとき、他ライトの x/z にこの距離(m)以内なら整列スナップする。
const SNAP_M = 0.12;
const TOUCH_PAN_SENSITIVITY = 0.62;
const TOUCH_PINCH_ZOOM_EXPONENT = 0.58;
const TOUCH_TAP_MAX_MOVE_PX = 10;
const TOUCH_WALL_DRAW_START_PX = 12;
const WALL_VERTEX_SNAP_PX = 30;
const MIN_WALL_SEGMENT_M = 0.03;

// 壁に付く追加物（窓カタログ "window:<id>" / 扉 "door" / 壁付スポット "wallspot"）の判定。
const isWallOpening = (kind: string | null): boolean =>
  !!kind && (kind === "door" || kind.startsWith("window") || isWallLightAddKind(kind));

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

// 尺モジュール: 1尺=303.333...mm。壁トレースは 1/4尺(約75.8mm)へ吸着する。
// グリッド原点はそのトレースの最初の点(origin)。origin + round((p-origin)/WALL_MODULE_M)*WALL_MODULE_M。
const SHAKU_M = 0.30333333333333334;
const WALL_MODULE_M = SHAKU_M / 4;
const snapToShakuModule = (p: Vec2M, origin: Vec2M): Vec2M => ({
  x: origin.x + Math.round((p.x - origin.x) / WALL_MODULE_M) * WALL_MODULE_M,
  z: origin.z + Math.round((p.z - origin.z) / WALL_MODULE_M) * WALL_MODULE_M
});

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

const orthogonalSnap = (prev: Vec2M, raw: Vec2M): Vec2M =>
  Math.abs(raw.x - prev.x) >= Math.abs(raw.z - prev.z)
    ? { x: raw.x, z: prev.z }
    : { x: prev.x, z: raw.z };

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

const voidSideLine = (voidArea: Project["voids"][number], side: VoidSide) => {
  const minX = voidArea.center.x - voidArea.size.x / 2;
  const maxX = voidArea.center.x + voidArea.size.x / 2;
  const minZ = voidArea.center.z - voidArea.size.z / 2;
  const maxZ = voidArea.center.z + voidArea.size.z / 2;
  switch (side) {
    case "north":
      return { start: { x: minX, z: minZ }, end: { x: maxX, z: minZ } };
    case "south":
      return { start: { x: minX, z: maxZ }, end: { x: maxX, z: maxZ } };
    case "west":
      return { start: { x: minX, z: minZ }, end: { x: minX, z: maxZ } };
    case "east":
      return { start: { x: maxX, z: minZ }, end: { x: maxX, z: maxZ } };
  }
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
  pendingAdd,
  onPlaceObject,
  onPlaceOnWall,
  canEditWalls,
  focusPlan,
  onToggleFocusPlan
}: Plan2DProps) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const viewportLayerRef = useRef<SVGGElement | null>(null);
  const touchPointersRef = useRef<Map<number, TouchPoint>>(new Map());
  const pinchRef = useRef<PinchState | null>(null);
  const touchTapRef = useRef<TouchTapState>(null);
  const touchWallTraceRef = useRef<TouchWallTraceState>(null);
  const viewportRef = useRef<ViewState>({ zoom: 1, pan: { x: 0, y: 0 } });
  const viewportFrameRef = useRef<number | null>(null);
  const pendingViewportCommitRef = useRef(false);
  // パン/ピンチ中に<g>のtransformを毎フレーム更新するとSVG全体（背景画像+全ベクター）が
  // CPUで再ラスタライズされ、モバイルでカクつく。ジェスチャー中はGPU合成される
  // CSS transformを<svg>要素へ適用して代用し、指を離した時だけ<g>とstateへ確定する。
  // view=開始時点の確定view、rect=開始時点のレイアウト矩形（CSS transformの影響を受けない基準）。
  const gestureBaseRef = useRef<{ view: ViewState; rect: DOMRect } | null>(null);
  const [dragging, setDragging] = useState<DragState>(null);
  // ライトのドラッグ整列スナップが効いた軸のワールド座標。x/z それぞれ吸着先(m)。
  // null のとき非表示。worldToSvg を通してガイド線を描く。
  const [snapGuides, setSnapGuides] = useState<{ x: number | null; z: number | null }>({ x: null, z: null });
  // ダブルクリックで開始する辺ドラッグリサイズ。
  // resizeTarget=ハンドル表示中のオブジェクト、resizing=ドラッグ中の辺。
  const [resizeTarget, setResizeTarget] = useState<{ kind: ResizeKind; id: string } | null>(null);
  const [resizing, setResizing] = useState<ResizeState>(null);
  const [scaleModalOpen, setScaleModalOpen] = useState(false);
  const [backgroundAlignMode, setBackgroundAlignMode] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [bgNaturalSize, setBgNaturalSize] = useState<{ width: number; height: number } | null>(null);
  // 壁トレース: 確定済み頂点列とプレビュー用カーソル位置。
  const [wallDraft, setWallDraft] = useState<Vec2M[]>([]);
  const [wallCursor, setWallCursor] = useState<Vec2M | null>(null);
  // 窓/扉の追加待ち中、カーソル直下で設置先になる壁。クリック前に青くハイライトして
  // 「どの壁に付くか」を示し、無反応に見える問題を防ぐ。
  const [wallTarget, setWallTarget] = useState<{ wallId: string; ratio: number } | null>(null);

  // pendingAdd 中・wall モード中は背景SVGにクリックを通す（オブジェクトは pointerEvents:none）。
  const canSelectObjects = !backgroundAlignMode && !pendingAdd && mode === "select";
  // 選択モードでもドラッグで動かせるほうが直感的。クリックのみなら移動は起きず選択だけ。
  const canDragObjects = !backgroundAlignMode && mode === "select";

  // 壁トレース中の内側(室内側)。start→end に対し左/右。undefined=未指定(中心対称)。
  const [draftInnerSide, setDraftInnerSide] = useState<"left" | "right" | undefined>(undefined);

  const updateFurniture = useProjectStore((state) => state.updateFurniture);
  const updateLight = useProjectStore((state) => state.updateLight);
  const selectedLightIds = useProjectStore((state) => state.selectedLightIds);
  const toggleLightSelection = useProjectStore((state) => state.toggleLightSelection);
  const clearLightSelection = useProjectStore((state) => state.clearLightSelection);
  const updateVoid = useProjectStore((state) => state.updateVoid);
  const setBackgroundPlan = useProjectStore((state) => state.setBackgroundPlan);
  const updateWindow = useProjectStore((state) => state.updateWindow);
  const updateCeilingZone = useProjectStore((state) => state.updateCeilingZone);
  const updateFloorZone = useProjectStore((state) => state.updateFloorZone);
  const updateWall = useProjectStore((state) => state.updateWall);
  const addWall = useProjectStore((state) => state.addWall);
  const undo = useProjectStore((state) => state.undo);
  const setDaylight = useProjectStore((state) => state.setDaylight);
  // 3Dビューの現在カメラ位置/注視点(ワールドm)。null のとき平面図にマーカーを描かない。
  const liveCamera = useProjectStore((state) => state.liveCamera);

  // 方位ダイヤル。northOffsetDeg は「真北が -Z からY軸まわり時計回りに何度ずれるか」。
  // worldToSvg は -Z を画面上に保つので 0° で N矢印が真上、増やすと画面上で時計回り。
  const northOffsetDeg = project.daylight?.northOffsetDeg ?? DEFAULT_DAYLIGHT.northOffsetDeg;

  // 活性階。オブジェクトの所属階フィルタ・背景の切替・ゴースト壁の基準。
  const activeFloor = project.activeFloor ?? 1;
  // 活性階に紐づく背景（2階なら backgroundPlan2、1階なら backgroundPlan）。
  const activeBackground = activeFloor === 2 ? project.backgroundPlan2 : project.backgroundPlan;
  const canAlignBackground = activeFloor === 2 && Boolean(activeBackground);

  // 活性階に属するオブジェクトだけを編集対象にする（floor 未指定は1階扱い）。
  const onActiveFloor = <T extends { floor?: number }>(obj: T) => (obj.floor ?? 1) === activeFloor;
  const activeWalls = useMemo(() => project.walls.filter(onActiveFloor), [project.walls, activeFloor]);
  const activeFurniture = useMemo(() => project.furniture.filter(onActiveFloor), [project.furniture, activeFloor]);
  const activeLights = useMemo(() => project.lights.filter(onActiveFloor), [project.lights, activeFloor]);
  const activeWindows = useMemo(() => project.windows.filter(onActiveFloor), [project.windows, activeFloor]);
  const activeVoids = useMemo(() => project.voids.filter(onActiveFloor), [project.voids, activeFloor]);
  const activeCeilingZones = useMemo(
    () => (project.ceilingZones ?? []).filter(onActiveFloor),
    [project.ceilingZones, activeFloor]
  );
  const activeFloorZones = useMemo(
    () => (project.floorZones ?? []).filter(onActiveFloor),
    [project.floorZones, activeFloor]
  );
  // 非活性階の壁（ゴースト表示用・操作不可）。2階編集時に1階壁を透かして見せ、
  // それに合わせて2階壁を引けるようにする。
  const ghostWalls = useMemo(
    () => project.walls.filter((wall) => (wall.floor ?? 1) !== activeFloor),
    [project.walls, activeFloor]
  );

  const backgroundUrl = activeBackground?.dataUrl;
  useEffect(() => {
    if (activeFloor !== 2 || !activeBackground) setBackgroundAlignMode(false);
  }, [activeFloor, activeBackground]);

  useEffect(() => {
    if (activeFloor === 2 && activeBackground?.alignmentPending) setBackgroundAlignMode(true);
  }, [activeFloor, activeBackground?.alignmentPending]);

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
  const hasScale = Boolean(activeBackground?.scale);
  useEffect(() => {
    if (backgroundUrl && !hasScale) {
      setScaleModalOpen(true);
    }
  }, [backgroundUrl, hasScale]);

  // 壁モードを抜けたら下書きをクリア。
  useEffect(() => {
    if (mode !== "wall") {
      touchWallTraceRef.current = null;
      setWallDraft([]);
      setWallCursor(null);
      setDraftInnerSide(undefined);
    }
  }, [mode]);

  // 窓/扉の追加待ちを抜けたら設置先ハイライトを消す。
  useEffect(() => {
    if (!isWallOpening(pendingAdd)) setWallTarget(null);
  }, [pendingAdd]);

  // 壁モード中: Enter でトレース終了。
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
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mode]);

  // 壁の既定値: 高さは天井高、厚みは既存壁を踏襲(無ければ0.12)、材質も既存壁を踏襲。
  // innerSide はトレース中に矢印キーで選んだ内側を保存（未指定なら中心対称）。
  const commitWallSegment = (start: Vec2M, end: Vec2M, innerSide: "left" | "right" | undefined) => {
    const reference = activeWalls[activeWalls.length - 1] ?? project.walls[project.walls.length - 1];
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

  const clearWallTrace = () => {
    touchWallTraceRef.current = null;
    setWallDraft([]);
    setWallCursor(null);
    setDraftInnerSide(undefined);
  };

  const finishWallTrace = () => {
    clearWallTrace();
    onModeChange("select");
  };

  const undoWallPoint = () => {
    if (wallDraft.length === 0) return;
    if (wallDraft.length > 1) undo();
    const nextDraft = wallDraft.slice(0, -1);
    setWallDraft(nextDraft);
    setWallCursor(null);
    if (nextDraft.length === 0) setDraftInnerSide(undefined);
    onSelect(null);
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
    // 活性階の壁＋ゴースト(非活性階)壁の両方を内包し、重ねた全体が映るようにする。
    for (const wall of activeWalls) {
      include(wall.start.x, wall.start.z);
      include(wall.end.x, wall.end.z);
    }
    for (const wall of ghostWalls) {
      include(wall.start.x, wall.start.z);
      include(wall.end.x, wall.end.z);
    }
    const includeRect = (c: Vec2M, s: { x: number; z: number }) => {
      include(c.x - s.x / 2, c.z - s.z / 2);
      include(c.x + s.x / 2, c.z + s.z / 2);
    };
    for (const item of activeFurniture) includeRect(item.position, item.size);
    for (const v of activeVoids) includeRect(v.center, v.size);
    for (const zone of activeCeilingZones) includeRect(zone.center, zone.size);
    for (const zone of activeFloorZones) includeRect(zone.center, zone.size);
    const place = activeBackground?.placement;
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
    activeWalls,
    ghostWalls,
    activeFurniture,
    activeVoids,
    activeCeilingZones,
    activeFloorZones,
    activeBackground,
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
  const viewBoxFor = (viewZoom: number, viewPan: { x: number; y: number }) => ({
    x: -VIEW_PAD + viewPan.x,
    y: -VIEW_PAD + viewPan.y,
    width: (planSize.width + VIEW_PAD * 2) / viewZoom,
    height: (planSize.height + VIEW_PAD * 2) / viewZoom
  });
  const viewBoxStringFor = (viewZoom: number, viewPan: { x: number; y: number }) => {
    const box = viewBoxFor(viewZoom, viewPan);
    return `${box.x} ${box.y} ${box.width} ${box.height}`;
  };
  const baseViewBox = viewBoxFor(1, { x: 0, y: 0 });
  const viewBox = viewBoxFor(zoom, pan);
  const viewportTransformFor = (view: ViewState) => {
    const current = viewBoxFor(view.zoom, view.pan);
    const scaleX = baseViewBox.width / current.width;
    const scaleY = baseViewBox.height / current.height;
    const translateX = baseViewBox.x - scaleX * current.x;
    const translateY = baseViewBox.y - scaleY * current.y;
    return `matrix(${scaleX} 0 0 ${scaleY} ${translateX} ${translateY})`;
  };

  // 要素は固定viewBox(baseViewBox)をレターボックス(xMidYMid meet)で表示し、ズーム/パンは
  // <g>のtransformで表現している。その前提で「viewのユーザー座標⇔要素ローカルのスクリーン座標」
  // の写像を求める: screen = offset + scale * (u - box.xy)。
  const screenMappingFor = (rect: { width: number; height: number }, view: ViewState) => {
    const sBase = Math.min(rect.width / baseViewBox.width, rect.height / baseViewBox.height);
    const box = viewBoxFor(view.zoom, view.pan);
    return {
      box,
      scale: (sBase * baseViewBox.width) / box.width,
      offsetX: (rect.width - sBase * baseViewBox.width) / 2,
      offsetY: (rect.height - sBase * baseViewBox.height) / 2
    };
  };

  const applySvgViewport = (view: ViewState) => {
    const gesture = gestureBaseRef.current;
    const svg = svgRef.current;
    if (gesture && svg) {
      // ジェスチャー開始時の描画(m0)から現在view(m1)への差分をスクリーン座標の
      // translate+scaleで表す（transform-originは要素左上）。screen1 = k*screen0 + t。
      const m0 = screenMappingFor(gesture.rect, gesture.view);
      const m1 = screenMappingFor(gesture.rect, view);
      const k = m1.scale / m0.scale;
      const tx = (1 - k) * m1.offsetX + m1.scale * (m0.box.x - m1.box.x);
      const ty = (1 - k) * m1.offsetY + m1.scale * (m0.box.y - m1.box.y);
      // transform-box を border-box に固定する。既定は WebKit だと outer <svg> で view-box に
      // なり、transform-origin:0 0 が viewBox 原点（レターボックスでずれた位置）を指すため
      // ズームが中央寄りにずれる。border-box なら全ブラウザで要素の左上基準に揃う。
      svg.style.transformBox = "border-box";
      svg.style.transformOrigin = "0 0";
      svg.style.transform = `translate(${tx}px, ${ty}px) scale(${k})`;
      return;
    }
    viewportLayerRef.current?.setAttribute("transform", viewportTransformFor(view));
  };

  const beginViewportGesture = () => {
    if (gestureBaseRef.current || !svgRef.current) return;
    gestureBaseRef.current = {
      view: { zoom: viewportRef.current.zoom, pan: { ...viewportRef.current.pan } },
      rect: svgRef.current.getBoundingClientRect()
    };
  };

  // ジェスチャー中はCSS transformがかかっており、WebKitのgetScreenCTMは
  // <svg>要素自身のCSS transformを反映しないことがあるため、CTMに頼らず
  // 開始時rectと現在viewからクライアント座標→ユーザー座標を計算する。
  const gestureUserPoint = (clientX: number, clientY: number) => {
    const rect = gestureBaseRef.current?.rect;
    if (!rect) return clientToSvgPoint(clientX, clientY);
    const m = screenMappingFor(rect, viewportRef.current);
    return {
      x: m.box.x + (clientX - rect.left - m.offsetX) / m.scale,
      y: m.box.y + (clientY - rect.top - m.offsetY) / m.scale
    };
  };

  useEffect(() => {
    viewportRef.current = { zoom, pan };
    applySvgViewport(viewportRef.current);
  }, [zoom, pan, planSize.width, planSize.height]);

  useEffect(() => () => {
    if (viewportFrameRef.current !== null) cancelAnimationFrame(viewportFrameRef.current);
  }, []);

  const commitViewport = () => {
    if (viewportFrameRef.current !== null) {
      cancelAnimationFrame(viewportFrameRef.current);
      viewportFrameRef.current = null;
    }
    pendingViewportCommitRef.current = false;
    // ジェスチャー終了: CSS transformを外し、<g>のtransformとstateへ確定する。
    gestureBaseRef.current = null;
    if (svgRef.current) svgRef.current.style.transform = "";
    const next = viewportRef.current;
    applySvgViewport(next);
    setZoom(next.zoom);
    setPan(next.pan);
  };

  const scheduleViewport = (nextZoom: number, nextPan: { x: number; y: number }, commit = false) => {
    viewportRef.current = { zoom: nextZoom, pan: nextPan };
    pendingViewportCommitRef.current ||= commit;
    if (viewportFrameRef.current !== null) return;
    viewportFrameRef.current = requestAnimationFrame(() => {
      viewportFrameRef.current = null;
      const next = viewportRef.current;
      const shouldCommit = pendingViewportCommitRef.current;
      pendingViewportCommitRef.current = false;
      if (shouldCommit) {
        // state確定時はCSS transformを残すと<g>側の再レンダーと二重適用になるため外す。
        gestureBaseRef.current = null;
        if (svgRef.current) svgRef.current.style.transform = "";
      }
      applySvgViewport(next);
      if (shouldCommit) {
        setZoom(next.zoom);
        setPan(next.pan);
      }
    });
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
    const target = viewportLayerRef.current ?? svg;
    const ctm = target?.getScreenCTM();
    if (!svg || !ctm) return { x: 0, y: 0 };
    const point = svg.createSVGPoint();
    point.x = clientX;
    point.y = clientY;
    const mapped = point.matrixTransform(ctm.inverse());
    return { x: mapped.x, y: mapped.y };
  };

  const svgToWorld = (clientX: number, clientY: number): Vec2M =>
    svgPointToWorld(clientToSvgPoint(clientX, clientY));

  const wallVertexSnapTolerance = () => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect?.width) return WALL_VERTEX_SNAP_PX;
    return (WALL_VERTEX_SNAP_PX * viewBox.width) / rect.width;
  };

  const snapToWallVertex = (point: Vec2M): Vec2M => {
    const candidates = [...activeWalls, ...ghostWalls].flatMap((wall) => [wall.start, wall.end]).concat(wallDraft);
    if (candidates.length === 0) return point;
    const target = worldToSvg(point);
    const tolerance = wallVertexSnapTolerance();
    let best: { point: Vec2M; dist: number } | null = null;
    for (const candidate of candidates) {
      const p = worldToSvg(candidate);
      const dist = Math.hypot(p.x - target.x, p.y - target.y);
      if (dist <= tolerance && (!best || dist < best.dist)) best = { point: candidate, dist };
    }
    return best ? { ...best.point } : point;
  };

  const wallTracePoint = (
    raw: Vec2M,
    prev: Vec2M | undefined,
    origin: Vec2M | undefined,
    forceOrthogonal: boolean
  ): Vec2M => {
    if (!prev || !origin) return snapToWallVertex(raw);
    const aligned = forceOrthogonal ? orthogonalSnap(prev, raw) : angleSnap(prev, raw);
    return snapToWallVertex(snapToShakuModule(aligned, origin));
  };

  const getPinchPoints = (): [TouchPoint, TouchPoint] | null => {
    const points = Array.from(touchPointersRef.current.values());
    return points.length >= 2 ? [points[0], points[1]] : null;
  };

  const startPinch = () => {
    const points = getPinchPoints();
    if (!points) return;
    beginViewportGesture();
    const [a, b] = points;
    pinchRef.current = {
      distance: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
    };
    touchTapRef.current = null;
    touchWallTraceRef.current = null;
    setDragging(null);
    setResizing(null);
    setWallCursor(null);
  };

  const clearTouchGesture = (pointerId?: number) => {
    if (pointerId !== undefined) touchPointersRef.current.delete(pointerId);
    if (touchPointersRef.current.size < 2) pinchRef.current = null;
  };

  const handleObjectPointerDownCapture = (event: React.PointerEvent<SVGGElement>) => {
    if (event.pointerType !== "touch") return;
    touchPointersRef.current.set(event.pointerId, { clientX: event.clientX, clientY: event.clientY });
    if (touchPointersRef.current.size >= 2) {
      event.preventDefault();
      startPinch();
    }
  };

  useEffect(() => {
    if (mode !== "wall") return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
      const svg = svgRef.current;
      const target = event.target as Node | null;
      const planFocused = !!svg && (svg === target || (target ? svg.contains(target) : false));
      if (!planFocused) return;
      const last = wallDraft[wallDraft.length - 1];
      const edgeStart = wallCursor ? last : wallDraft[wallDraft.length - 2];
      const edgeEnd = wallCursor ?? last;
      if (!edgeStart || !edgeEnd) return;
      const s = worldToSvg(edgeStart);
      const e = worldToSvg(edgeEnd);
      if (Math.hypot(e.x - s.x, e.y - s.y) < 1) return;
      event.preventDefault();
      const desired =
        event.key === "ArrowLeft"
          ? { x: -1, y: 0 }
          : event.key === "ArrowRight"
            ? { x: 1, y: 0 }
            : event.key === "ArrowUp"
              ? { x: 0, y: -1 }
              : { x: 0, y: 1 };
      const left = svgSideNormal(s, e, "left");
      const right = svgSideNormal(s, e, "right");
      const next = left.x * desired.x + left.y * desired.y >= right.x * desired.x + right.y * desired.y ? "left" : "right";
      setDraftInnerSide((current) => (current === next ? undefined : next));
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mode, wallDraft, wallCursor, contentBox, planSize.pxPerM]);

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

  const placement = activeBackground?.placement ?? defaultPlacement;

  const confirmBackgroundAlignment = () => {
    if (!activeBackground) return;
    const { alignmentPending, ...confirmedBackground } = activeBackground;
    void alignmentPending;
    setBackgroundPlan(confirmedBackground);
    setBackgroundAlignMode(false);
  };

  const resetBackgroundToFirstFloor = () => {
    if (!activeBackground || !project.backgroundPlan?.placement) return;
    setBackgroundPlan({
      ...activeBackground,
      placement: { ...project.backgroundPlan.placement },
      scale: project.backgroundPlan.scale ? { ...project.backgroundPlan.scale } : activeBackground.scale,
      alignmentPending: true
    });
    setBackgroundAlignMode(true);
  };

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
    const background = activeBackground;
    if (!background) return;
    const pixels = Math.hypot(pix2.x - pix1.x, pix2.y - pix1.y);
    if (pixels <= 1 || !(millimeters > 0)) return;

    const metersPerPixel = millimeters / 1000 / pixels;
    const midPix = { x: (pix1.x + pix2.x) / 2, y: (pix1.y + pix2.y) / 2 };
    const midWorld = imagePixelToWorld(midPix.x, midPix.y);
    if (!midWorld) return;

    const { alignmentPending, ...confirmedBackground } = background;
    void alignmentPending;
    setBackgroundPlan({
      ...confirmedBackground,
      scale: { pixels, millimeters },
      placement: {
        originXM: midWorld.x - midPix.x * metersPerPixel,
        originZM: midWorld.z - midPix.y * metersPerPixel,
        metersPerPixel
      }
    });
  };

  const handleSelect = (nextSelection: Selection) => {
    if (nextSelection?.kind === "wall" && !canEditWalls) return;
    // 別オブジェクトを選んだらリサイズハンドルを閉じる。
    if (!nextSelection || resizeTarget?.id !== nextSelection.id) setResizeTarget(null);
    // 削除モードは廃止。選択中のオブジェクトはDeleteキーで消す（App側で処理）。
    onSelect(nextSelection);
  };

  // ライトのクリック選択。Shift+クリックは複数選択トグル、通常は単一選択。
  const selectLight = (id: string, shiftKey: boolean) => {
    if (shiftKey) {
      toggleLightSelection(id);
      return;
    }
    clearLightSelection();
    handleSelect({ kind: "light", id });
  };

  const startWallDrag = (wall: WallSegment, event: React.PointerEvent<SVGLineElement>) => {
    if (!canEditWalls) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    handleSelect({ kind: "wall", id: wall.id });
    setDragging({
      kind: "wall",
      id: wall.id,
      pointerStart: snapPoint(svgToWorld(event.clientX, event.clientY)),
      start: { ...wall.start },
      end: { ...wall.end }
    });
  };

  // ダブルクリックでリサイズハンドルを表示する（矩形フットプリント物のみ）。
  const startResize = (kind: ResizeKind, id: string) => {
    onSelect({ kind, id });
    setResizeTarget({ kind, id });
  };

  const handleCanvasPlacement = (clientX: number, clientY: number, forceOrthogonalWall = false) => {
    // pendingAdd 中はクリック位置にオブジェクトを配置（生成はApp側）。
    if (pendingAdd) {
      const world = svgToWorld(clientX, clientY);
      // 窓/扉/壁付ライトは「クリックした壁」に付ける。壁の近くを押したときだけ設置し、
      // 室内の何もない所では設置しない（遠い壁へ勝手に付くのを防ぐ＝要望: 壁を自分で選ぶ）。
      if (isWallOpening(pendingAdd)) {
        const isWallLight = isWallLightAddKind(pendingAdd);
        const hit = isWallLight
          ? nearestWallMountSurfaceAt(project, world.x, world.z, activeFloor, { maxDistM: WALL_MOUNT_SNAP_M })
          : nearestWall(world, activeWalls);
        // 1.2m まで許容して取りこぼしを減らす。クリック前に対象壁を青くハイライト
        // しているので、どこに付くかは見て分かる。離れすぎなら維持して再クリックさせる。
        if (hit && hit.dist <= (isWallLight ? WALL_MOUNT_SNAP_M : WALL_SNAP_M)) {
          setWallTarget(null);
          onPlaceOnWall(hit.wallId, hit.ratio);
        }
      } else {
        onPlaceObject(snapPoint(world));
      }
      return true;
    }

    // 壁モード: クリックで頂点を連続配置。前頂点があれば線分を即コミット。
    // 最初の点は自由（=尺グリッドの原点）。2点目以降は直角スナップ後に
    // wallDraft[0] 原点の 1/4尺(約75.8mm)グリッドへ吸着する（プレビューと確定位置を一致させる）。
    if (mode === "wall") {
      const raw = svgToWorld(clientX, clientY);
      const prev = wallDraft[wallDraft.length - 1];
      const origin = wallDraft[0];
      const v = wallTracePoint(raw, prev, origin, forceOrthogonalWall);
      if (prev) {
        if (distance(prev, v) < MIN_WALL_SEGMENT_M) return true;
        commitWallSegment(prev, v, draftInnerSide);
      }
      setWallDraft([...wallDraft, v]);
      return true;
    }

    return false;
  };

  const handleCanvasPointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    if (event.pointerType === "touch") {
      event.currentTarget.setPointerCapture(event.pointerId);
      touchPointersRef.current.set(event.pointerId, { clientX: event.clientX, clientY: event.clientY });
      if (touchPointersRef.current.size >= 2) {
        event.preventDefault();
        startPinch();
        return;
      }
      if (mode === "wall") {
        const rawStart = svgToWorld(event.clientX, event.clientY);
        touchWallTraceRef.current = {
          pointerId: event.pointerId,
          startClientX: event.clientX,
          startClientY: event.clientY,
          start: wallDraft[wallDraft.length - 1] ?? wallTracePoint(rawStart, undefined, undefined, true),
          isDrawing: false
        };
        touchTapRef.current = { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY };
        return;
      }
      if (pendingAdd) {
        touchTapRef.current = { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY };
        return;
      }
    }

    if (event.button === 1) {
      beginViewportGesture();
      const currentViewBox = viewBoxFor(viewportRef.current.zoom, viewportRef.current.pan);
      setDragging({
        kind: "pan",
        clientStart: { x: event.clientX, y: event.clientY },
        panStart: viewportRef.current.pan,
        viewBoxStart: { width: currentViewBox.width, height: currentViewBox.height },
        sensitivity: 1
      });
      return;
    }

    if (event.button !== 0) return;
    if (handleCanvasPlacement(event.clientX, event.clientY)) return;

    if (backgroundAlignMode && activeBackground && placement) {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      setDragging({
        kind: "background",
        pointerStartSvg: clientToSvgPoint(event.clientX, event.clientY),
        pxPerMStart: planSize.pxPerM,
        placementStart: { ...placement }
      });
      return;
    }

    // 通常操作で何も無い背景を掴んだら平面図をパンする（要望: 空白ドラッグでパン）。
    beginViewportGesture();
    const currentViewBox = viewBoxFor(viewportRef.current.zoom, viewportRef.current.pan);
    setDragging({
      kind: "pan",
      clientStart: { x: event.clientX, y: event.clientY },
      panStart: viewportRef.current.pan,
      viewBoxStart: { width: currentViewBox.width, height: currentViewBox.height },
      sensitivity: event.pointerType === "touch" ? TOUCH_PAN_SENSITIVITY : 1
    });
  };

  const onPointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    if (event.pointerType === "touch" && touchPointersRef.current.has(event.pointerId)) {
      touchPointersRef.current.set(event.pointerId, { clientX: event.clientX, clientY: event.clientY });
      const touchTap = touchTapRef.current;
      if (
        touchTap?.pointerId === event.pointerId &&
        Math.hypot(event.clientX - touchTap.clientX, event.clientY - touchTap.clientY) > TOUCH_TAP_MAX_MOVE_PX
      ) {
        touchTapRef.current = null;
      }
      const pinch = pinchRef.current;
      const points = getPinchPoints();
      if (pinch && points) {
        event.preventDefault();
        const [a, b] = points;
        const nextDistance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
        if (pinch.distance > 4) {
          const ratio = nextDistance / pinch.distance;
          const nextZoom = Math.min(
            8,
            Math.max(0.2, viewportRef.current.zoom * Math.pow(ratio, TOUCH_PINCH_ZOOM_EXPONENT))
          );
          // CSS transform適用中のgetBoundingClientRectは変形後の矩形を返すため、
          // ジェスチャー開始時のレイアウト矩形を基準にする。
          const rect = gestureBaseRef.current?.rect ?? svgRef.current?.getBoundingClientRect();
          if (rect) {
            const centerX = (a.clientX + b.clientX) / 2;
            const centerY = (a.clientY + b.clientY) / 2;
            const anchor = gestureUserPoint(centerX, centerY);
            // アンカー(ユーザー座標)がピンチ中心(スクリーン座標)に留まるpanを、
            // レターボックス込みの写像 screen = offset + scale*(u - box.xy) の逆算で求める。
            const m = screenMappingFor(rect, { zoom: nextZoom, pan: { x: 0, y: 0 } });
            scheduleViewport(
              nextZoom,
              {
                x: anchor.x - (centerX - rect.left - m.offsetX) / m.scale + VIEW_PAD,
                y: anchor.y - (centerY - rect.top - m.offsetY) / m.scale + VIEW_PAD
              },
              false
            );
          }
          pinch.distance = nextDistance;
        }
        return;
      }
      const touchWallTrace = touchWallTraceRef.current;
      if (mode === "wall" && touchWallTrace?.pointerId === event.pointerId) {
        const movePx = Math.hypot(
          event.clientX - touchWallTrace.startClientX,
          event.clientY - touchWallTrace.startClientY
        );
        if (movePx >= TOUCH_WALL_DRAW_START_PX) {
          event.preventDefault();
          const origin = wallDraft[0] ?? touchWallTrace.start;
          const next = wallTracePoint(
            svgToWorld(event.clientX, event.clientY),
            touchWallTrace.start,
            origin,
            true
          );
          if (!touchWallTrace.isDrawing) {
            touchWallTrace.isDrawing = true;
            touchTapRef.current = null;
            setWallDraft((draft) => (draft.length === 0 ? [touchWallTrace.start] : draft));
          }
          setWallCursor(next);
          return;
        }
      }
    }

    // 壁モードはドラッグでなくてもカーソル追従でラバーバンドを更新する。
    // 確定時(commit)と同じ吸着（直角→wallDraft[0]原点の1/4尺グリッド）を適用する。
    if (mode === "wall" && wallDraft.length > 0) {
      const prev = wallDraft[wallDraft.length - 1];
      const origin = wallDraft[0];
      setWallCursor(wallTracePoint(svgToWorld(event.clientX, event.clientY), prev, origin, event.pointerType === "touch"));
    }

    // 窓/扉/壁付ライトの追加待ち中: カーソル直下の最寄り壁を設置先候補としてハイライト。
    if (isWallOpening(pendingAdd)) {
      const world = svgToWorld(event.clientX, event.clientY);
      const isWallLight = isWallLightAddKind(pendingAdd);
      const hit = isWallLight
        ? nearestWallMountSurfaceAt(project, world.x, world.z, activeFloor, { maxDistM: WALL_MOUNT_SNAP_M })
        : nearestWall(world, activeWalls);
      setWallTarget(hit && hit.dist <= (isWallLight ? WALL_MOUNT_SNAP_M : WALL_SNAP_M) ? { wallId: hit.wallId, ratio: hit.ratio } : null);
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

    if (dragging.kind === "background") {
      if (!activeBackground) return;
      const cursor = clientToSvgPoint(event.clientX, event.clientY);
      setBackgroundPlan({
        ...activeBackground,
        placement: {
          ...dragging.placementStart,
          originXM: dragging.placementStart.originXM + (cursor.x - dragging.pointerStartSvg.x) / dragging.pxPerMStart,
          originZM: dragging.placementStart.originZM + (cursor.y - dragging.pointerStartSvg.y) / dragging.pxPerMStart
        },
        alignmentPending: true
      });
      return;
    }

    if (dragging.kind === "pan") {
      // CSS transform適用中でも一定のレイアウト矩形（ジェスチャー開始時）を基準にする。
      const rect = gestureBaseRef.current?.rect ?? svgRef.current?.getBoundingClientRect();
      if (!rect) return;
      const dx = ((event.clientX - dragging.clientStart.x) / rect.width) * dragging.viewBoxStart.width * dragging.sensitivity;
      const dy = ((event.clientY - dragging.clientStart.y) / rect.height) * dragging.viewBoxStart.height * dragging.sensitivity;
      scheduleViewport(
        viewportRef.current.zoom,
        { x: dragging.panStart.x - dx, y: dragging.panStart.y - dy },
        false
      );
      return;
    }

    if (dragging.kind === "wall") {
      const cursor = snapPoint(svgToWorld(event.clientX, event.clientY));
      const dx = cursor.x - dragging.pointerStart.x;
      const dz = cursor.z - dragging.pointerStart.z;
      updateWall(dragging.id, {
        start: { x: dragging.start.x + dx, z: dragging.start.z + dz },
        end: { x: dragging.end.x + dx, z: dragging.end.z + dz }
      });
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

    const point = snapPoint(svgToWorld(event.clientX, event.clientY));

    const next = {
      x: point.x - dragging.offset.x,
      z: point.z - dragging.offset.z
    };

    if (dragging.kind === "furniture") {
      const item = project.furniture.find((candidate) => candidate.id === dragging.id);
      if (!item) return;
      const placement = constrainFurniturePlacement(project, item, { ...item.position, x: next.x, z: next.z });
      updateFurniture(item.id, {
        position: placement.position,
        rotationYDeg: placement.rotationYDeg
      });
    } else if (dragging.kind === "light") {
      const fixture = project.lights.find((candidate) => candidate.id === dragging.id);
      if (!fixture) return;
      if (isWallMountedFixture(fixture)) {
        const placement = wallMountedLightPlacementAt(
          project,
          next.x,
          next.z,
          fixture.position.y,
          fixture.floor ?? project.activeFloor ?? 1
        );
        if (!placement) return;
        setSnapGuides({ x: null, z: null });
        updateLight(fixture.id, {
          position: placement.position,
          mountHeightM: placement.position.y,
          rotationDeg: { ...fixture.rotationDeg, y: placement.rotationYDeg },
          target: placement.target
        });
        return;
      }
      // パワポ風の整列スナップ: 他ライトの x/z に SNAP_M 以内なら吸着し、ガイド線を出す。
      let snapX: number | null = null;
      let snapZ: number | null = null;
      let bestX = SNAP_M;
      let bestZ = SNAP_M;
      for (const other of activeLights) {
        if (other.id === fixture.id) continue;
        const dx = Math.abs(other.position.x - next.x);
        if (dx < bestX) {
          bestX = dx;
          snapX = other.position.x;
        }
        const dz = Math.abs(other.position.z - next.z);
        if (dz < bestZ) {
          bestZ = dz;
          snapZ = other.position.z;
        }
      }
      const snappedX = snapX ?? next.x;
      const snappedZ = snapZ ?? next.z;
      setSnapGuides({ x: snapX, z: snapZ });
      updateLight(fixture.id, {
        position: { ...fixture.position, x: snappedX, z: snappedZ },
        target: fixture.target ? { ...fixture.target, x: snappedX, z: snappedZ } : undefined
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

  const handleCanvasPointerEnd = (event: React.PointerEvent<SVGSVGElement>) => {
    const touchTap = touchTapRef.current;
    const touchWallTrace = touchWallTraceRef.current;
    const wasPinching = !!pinchRef.current || touchPointersRef.current.size >= 2;
    const shouldCommitViewport = dragging?.kind === "pan" || wasPinching;
    if (event.pointerType === "touch") {
      clearTouchGesture(event.pointerId);
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    } else if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setDragging(null);
    setResizing(null);
    setSnapGuides({ x: null, z: null });
    if (shouldCommitViewport) commitViewport();
    if (event.pointerType === "touch" && mode === "wall" && touchWallTrace?.pointerId === event.pointerId) {
      touchWallTraceRef.current = null;
      if (event.type !== "pointerup" || wasPinching) {
        setWallCursor(null);
        return;
      }
      const movePx = Math.hypot(
        event.clientX - touchWallTrace.startClientX,
        event.clientY - touchWallTrace.startClientY
      );
      if (touchWallTrace.isDrawing || movePx >= TOUCH_WALL_DRAW_START_PX) {
        const origin = wallDraft[0] ?? touchWallTrace.start;
        const end = wallTracePoint(svgToWorld(event.clientX, event.clientY), touchWallTrace.start, origin, true);
        setWallCursor(null);
        if (distance(touchWallTrace.start, end) >= MIN_WALL_SEGMENT_M) {
          commitWallSegment(touchWallTrace.start, end, draftInnerSide);
          setWallDraft((draft) => {
            const last = draft[draft.length - 1];
            if (!last) return [touchWallTrace.start, end];
            if (distance(last, touchWallTrace.start) < MIN_WALL_SEGMENT_M) return [...draft, end];
            return [...draft, touchWallTrace.start, end];
          });
        }
        return;
      }
    }
    if (touchTap?.pointerId !== event.pointerId) return;
    touchTapRef.current = null;
    if (event.type !== "pointerup" || wasPinching) return;
    if (Math.hypot(event.clientX - touchTap.clientX, event.clientY - touchTap.clientY) <= TOUCH_TAP_MAX_MOVE_PX) {
      handleCanvasPlacement(event.clientX, event.clientY, event.pointerType === "touch");
    }
  };

  // ズーム時にアンカー点(ユーザー空間座標 u)が画面上の同じ位置に留まるよう pan を補正する。
  // viewBox.x = pan - VIEW_PAD, viewBox.width = planSize/zoom + VIEW_PAD*2 の関係から、
  // u = viewBox.x + frac*viewBox.width（frac=アンカーの viewBox 内相対位置）を不変に保つ。
  // → 新 viewBox.x = u - frac*newWidth、新 pan = viewBox.x + VIEW_PAD。
  const zoomAtUserPoint = (nextZoom: number, anchorX: number, anchorY: number, commit = true) => {
    const current = viewportRef.current;
    const currentViewBox = viewBoxFor(current.zoom, current.pan);
    const clamped = Math.min(8, Math.max(0.2, nextZoom));
    if (clamped === current.zoom) return;
    const newWidth = planSize.width / clamped + VIEW_PAD * 2;
    const newHeight = planSize.height / clamped + VIEW_PAD * 2;
    const fracX = (anchorX - currentViewBox.x) / currentViewBox.width;
    const fracY = (anchorY - currentViewBox.y) / currentViewBox.height;
    scheduleViewport(
      clamped,
      {
        x: anchorX - fracX * newWidth + VIEW_PAD,
        y: anchorY - fracY * newHeight + VIEW_PAD
      },
      commit
    );
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
    const intensity = event.ctrlKey ? 0.007 : 0.0012;
    const factor = Math.exp(-event.deltaY * intensity);
    zoomAtUserPoint(viewportRef.current.zoom * factor, anchor.x, anchor.y);
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
    zoomAtUserPoint(viewportRef.current.zoom * factor, planSize.width / 2, planSize.height / 2);
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

  const scaleLabel = activeBackground?.alignmentPending
    ? "1階基準で仮合わせ（要確認）"
    : activeBackground?.scale
    ? `実寸合わせ済み（${Math.round(activeBackground.scale.millimeters).toLocaleString("ja-JP")}mm基準）`
    : activeBackground
    ? "縮尺未設定（フィット表示）"
    : "背景なし";

  // 方位ダイヤルのドラッグ。中心→ポインタの角度を「上向き(画面 -y)からの時計回り角」に
  // 変換し northOffsetDeg(0..360) に書く。Shift 押下中以外は8方位±4°へソフトスナップ。
  const compassRef = useRef<HTMLDivElement | null>(null);
  const handleCompassPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    const dial = compassRef.current;
    if (!dial) return;
    const rect = dial.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    // atan2(dx, -dy): 上向き=0、時計回り(右回り)が正。
    let deg = (Math.atan2(event.clientX - cx, -(event.clientY - cy)) * 180) / Math.PI;
    deg = ((deg % 360) + 360) % 360;
    if (!event.shiftKey) {
      for (const snapDeg of [0, 45, 90, 135, 180, 225, 270, 315, 360]) {
        if (Math.abs(deg - snapDeg) <= 4) {
          deg = snapDeg % 360;
          break;
        }
      }
    }
    setDaylight({ northOffsetDeg: deg });
  };

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

      <div className="plan-meta">
        <span>ズーム {Math.round(zoom * 100)}%</span>
        <button type="button" onClick={() => zoomAtCenter(1.2)} aria-label="拡大">+</button>
        <button type="button" onClick={() => zoomAtCenter(1 / 1.2)} aria-label="縮小">-</button>
        {/* zoom=1/pan=0 がコンテンツbbox全体のフィット表示（座標系をbbox基準にしたため）。 */}
        <button type="button" onClick={() => scheduleViewport(1, { x: 0, y: 0 }, true)}>全体表示</button>
        {/* 縮尺合わせは専用モーダルで実施。背景画像があるときだけ押せる。 */}
        {activeBackground && (
          <button type="button" onClick={() => setScaleModalOpen(true)}>
            縮尺
          </button>
        )}
        {canAlignBackground && (
          <button
            type="button"
            className={backgroundAlignMode ? "is-active" : ""}
            onClick={() => setBackgroundAlignMode((current) => !current)}
          >
            背景合わせ
          </button>
        )}
        {backgroundAlignMode && (
          <>
            {project.backgroundPlan?.placement && (
              <button type="button" onClick={resetBackgroundToFirstFloor}>
                1階基準
              </button>
            )}
            <button type="button" className="primary-action" onClick={confirmBackgroundAlignment}>
              完了
            </button>
          </>
        )}

        {/* 方位ダイヤル。N矢印をドラッグして実際の北に合わせる。
            図面上に被せると編集対象を隠すため、キャンバス外の操作列に置く。 */}
        <div
          className="plan-compass"
          ref={compassRef}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            handleCompassPointer(event);
          }}
          onPointerMove={(event) => {
            if (event.currentTarget.hasPointerCapture(event.pointerId)) handleCompassPointer(event);
          }}
          onPointerUp={(event) => event.currentTarget.releasePointerCapture(event.pointerId)}
        >
          <svg viewBox="-40 -40 80 80" className="plan-compass-dial">
            <circle cx="0" cy="0" r="34" className="plan-compass-ring" />
            {/* northOffsetDeg だけ時計回りに回す（SVGはy下向きなので正回転=時計回り）。 */}
            <g transform={`rotate(${northOffsetDeg})`}>
              <line x1="0" y1="22" x2="0" y2="-26" className="plan-compass-needle" />
              <polygon points="0,-32 -6,-20 6,-20" className="plan-compass-arrow" />
              <text x="0" y="-12" className="plan-compass-n">N</text>
            </g>
          </svg>
          <span className="plan-compass-label">北 {Math.round(northOffsetDeg) % 360}°</span>
        </div>
      </div>

      <p className="tool-help">
        {backgroundAlignMode && "1階の薄い壁を目安に、二階の背景画像をドラッグして位置を合わせます。終わったら完了。"}
        {!backgroundAlignMode && isWallLightAddKind(pendingAdd) && "壁または吹き抜け内周に近づけると青くハイライト。クリックで壁付け照明を設置。"}
        {!backgroundAlignMode && isWallOpening(pendingAdd) && !isWallLightAddKind(pendingAdd) && "壁に近づけると青くハイライト。その壁をクリックで設置。設置後は壁上をドラッグで位置調整。"}
        {!backgroundAlignMode && pendingAdd && !isWallOpening(pendingAdd) && "クリックした位置にオブジェクトを配置します。"}
        {!backgroundAlignMode && !pendingAdd && mode === "select" && !canEditWalls && "オブジェクトをクリックで選択、ドラッグで移動。何もない所のドラッグで平面図をパン。Deleteで削除。"}
        {!backgroundAlignMode && !pendingAdd && mode === "select" && canEditWalls && "壁をクリックで選択、ドラッグで移動。Deleteで削除。何もない所のドラッグで平面図をパン。"}
        {!backgroundAlignMode && !pendingAdd && mode === "wall" && "角に近づけてタップ、または押して引いて離すと壁を作成。スマホは水平/垂直へ強めにスナップします。内側は下のボタンで指定できます。"}
      </p>

      {canEditWalls && mode === "wall" && !pendingAdd && (
        <div className="wall-trace-controls" role="toolbar" aria-label="壁作成">
          <button type="button" onClick={undoWallPoint} disabled={wallDraft.length === 0}>1点戻す</button>
          <div className="wall-side-toggle" role="group" aria-label="壁の内側">
            <button
              type="button"
              className={draftInnerSide === undefined ? "is-active" : ""}
              onClick={() => setDraftInnerSide(undefined)}
            >
              中央
            </button>
            <button
              type="button"
              className={draftInnerSide === "left" ? "is-active" : ""}
              onClick={() => setDraftInnerSide("left")}
            >
              左
            </button>
            <button
              type="button"
              className={draftInnerSide === "right" ? "is-active" : ""}
              onClick={() => setDraftInnerSide("right")}
            >
              右
            </button>
          </div>
          <button type="button" className="primary-action" onClick={finishWallTrace}>完了</button>
          <button type="button" onClick={finishWallTrace}>中止</button>
        </div>
      )}

      <div className="plan-canvas-wrap">
        <svg
          ref={svgRef}
          className="plan-canvas"
          tabIndex={0}
          style={{ cursor: backgroundAlignMode ? "move" : mode === "wall" || pendingAdd ? "crosshair" : undefined, outline: "none" }}
          viewBox={viewBoxStringFor(1, { x: 0, y: 0 })}
          onPointerDown={handleCanvasPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={handleCanvasPointerEnd}
          onPointerCancel={handleCanvasPointerEnd}
          onPointerLeave={handleCanvasPointerEnd}
          onDoubleClick={() => {
            clearWallTrace();
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
            x={baseViewBox.x}
            y={baseViewBox.y}
            width={baseViewBox.width}
            height={baseViewBox.height}
            fill="#141414"
          />
          <g ref={viewportLayerRef} transform={viewportTransformFor({ zoom, pan })}>
          <rect
            x={-VIEW_PAD}
            y={-VIEW_PAD}
            width={planSize.width + VIEW_PAD * 2}
            height={planSize.height + VIEW_PAD * 2}
            fill="#141414"
          />
          {activeBackground && bgRender && (
            <image
              href={activeBackground.dataUrl}
              x="0"
              y="0"
              width={bgRender.width}
              height={bgRender.height}
              transform={`translate(${bgRender.tx} ${bgRender.ty}) scale(${bgRender.scale})`}
              opacity={backgroundAlignMode ? "0.62" : "0.42"}
            />
          )}
          <rect
            x={-VIEW_PAD}
            y={-VIEW_PAD}
            width={planSize.width + VIEW_PAD * 2}
            height={planSize.height + VIEW_PAD * 2}
            fill="url(#meterGrid)"
          />
          {/* 非活性階の壁ゴースト（薄く・操作不可）。2階作図時に1階壁を透かして見せ、
              それに合わせて2階壁を引けるようにする。選択ヒット線は付けない。 */}
          {ghostWalls.length > 0 && (
            <g style={{ pointerEvents: "none" }}>
              {ghostWalls.map((wall) => {
                const start = worldToSvg(wall.start);
                const end = worldToSvg(wall.end);
                const displayWidth = Math.max(2, wall.thicknessM * planSize.pxPerM);
                let off = { x: 0, y: 0 };
                if (wall.innerSide) {
                  const outer = svgSideNormal(start, end, wall.innerSide === "left" ? "right" : "left");
                  off = { x: outer.x * (displayWidth / 2), y: outer.y * (displayWidth / 2) };
                }
                return (
                  <line
                    key={wall.id}
                    x1={start.x + off.x}
                    y1={start.y + off.y}
                    x2={end.x + off.x}
                    y2={end.y + off.y}
                    stroke="#9aa0a6"
                    strokeWidth={displayWidth}
                    strokeOpacity={0.25}
                    strokeLinecap="round"
                  />
                );
              })}
            </g>
          )}
          {/* 壁作図/追加中はオブジェクトがクリックを奪わないよう pointerEvents を切り、
              背景の handleCanvasPointerDown に素通りさせる。通常操作だけ受け取る。 */}
          <g
            style={{ pointerEvents: canSelectObjects ? "auto" : "none" }}
            onPointerDownCapture={handleObjectPointerDownCapture}
          >
            <RoomOutline
              walls={activeWalls}
              selection={selection}
              worldToSvg={worldToSvg}
              pxPerM={planSize.pxPerM}
              onSelect={handleSelect}
              canEditWalls={canEditWalls}
              onWallDragStart={startWallDrag}
            />
            {activeWindows.map((windowItem) => (
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
            {activeVoids.map((voidArea) => (
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
            {activeCeilingZones.map((zone) => (
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
            {activeFloorZones.map((zone) => (
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
            {activeFurniture.map((item) => (
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
            {activeLights.map((fixture) => (
              <LightPlanItem
                key={fixture.id}
                fixture={fixture}
                worldToSvg={worldToSvg}
                selected={
                  (selection?.kind === "light" && selection.id === fixture.id) ||
                  selectedLightIds.includes(fixture.id)
                }
                togglesOffOnClick={selection?.kind === "light" && selection.id === fixture.id}
                onSelectLight={selectLight}
                onClearSelection={() => handleSelect(null)}
                onDragStart={(offset) => setDragging({ kind: "light", id: fixture.id, offset })}
                svgToWorld={svgToWorld}
                canDrag={canDragObjects}
              />
            ))}
          </g>

          {/* ライトのドラッグ整列スナップが効いている軸のガイド線（一時表示）。 */}
          {snapGuides.x !== null && (
            <line
              stroke="#7fd4ff"
              strokeWidth={1}
              strokeDasharray="6 4"
              pointerEvents="none"
              x1={worldToSvg({ x: snapGuides.x, z: contentBox.minX }).x}
              y1={viewBox.y}
              x2={worldToSvg({ x: snapGuides.x, z: contentBox.minX }).x}
              y2={viewBox.y + viewBox.height}
            />
          )}
          {snapGuides.z !== null && (
            <line
              stroke="#7fd4ff"
              strokeWidth={1}
              strokeDasharray="6 4"
              pointerEvents="none"
              x1={viewBox.x}
              y1={worldToSvg({ x: contentBox.minX, z: snapGuides.z }).y}
              x2={viewBox.x + viewBox.width}
              y2={worldToSvg({ x: contentBox.minX, z: snapGuides.z }).y}
            />
          )}

          {/* ダブルクリックで開いた矩形オブジェクトの辺リサイズハンドル（最前面）。 */}
          {resizeTarget && !pendingAdd && (
            <ResizeHandles
              target={resizeTarget}
              project={project}
              worldToSvg={worldToSvg}
              onEdgePointerDown={(edge) => setResizing({ kind: resizeTarget.kind, id: resizeTarget.id, edge })}
            />
          )}

          {/* 窓/扉/壁付ライトの設置先になる壁のハイライト（最前面・クリック非対象）。 */}
          {isWallOpening(pendingAdd) && wallTarget && (() => {
            const voidTarget = parseVoidWallId(wallTarget.wallId);
            if (voidTarget) {
              const voidArea = project.voids.find((candidate) => candidate.id === voidTarget.voidId);
              if (!voidArea) return null;
              const line = voidSideLine(voidArea, voidTarget.side);
              const s = worldToSvg(line.start);
              const e = worldToSvg(line.end);
              return (
                <line
                  x1={s.x}
                  y1={s.y}
                  x2={e.x}
                  y2={e.y}
                  stroke="#7fd1ff"
                  strokeWidth={Math.max(10, 0.12 * planSize.pxPerM + 6)}
                  strokeOpacity={0.55}
                  strokeLinecap="round"
                  style={{ pointerEvents: "none" }}
                />
              );
            }
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
                strokeWidth={Math.max(10, wall.thicknessM * planSize.pxPerM + 6)}
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
          </g>
        </svg>

      </div>

      {scaleModalOpen && activeBackground?.dataUrl && bgNaturalSize && (
        <ScaleCalibrationModal
          imageUrl={activeBackground.dataUrl}
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
  walls,
  selection,
  worldToSvg,
  pxPerM,
  onSelect,
  canEditWalls,
  onWallDragStart
}: {
  walls: WallSegment[];
  selection: Selection;
  worldToSvg: (point: Vec2M) => { x: number; y: number };
  pxPerM: number;
  onSelect: (selection: Selection) => void;
  canEditWalls: boolean;
  onWallDragStart: (wall: WallSegment, event: React.PointerEvent<SVGLineElement>) => void;
}) => (
  <>
    {walls.map((wall) => {
      const start = worldToSvg(wall.start);
      const end = worldToSvg(wall.end);
      const selected = canEditWalls && selection?.kind === "wall" && selection.id === wall.id;
      // 実寸の厚み(thicknessM)を worldToSvg と同じ pxPerM スケールで描く。
      // 視認用に最小 2px は確保。透明ヒット線もこの実寸 displayWidth から導出する。
      const displayWidth = Math.max(2, wall.thicknessM * pxPerM);
      // 壁の種別で見た目だけ変える（当たり判定/座標は不変）。undefined は "wall"。
      // half(腰壁): 控えめに細め＋やや明るい。railing(手すり): 細い破線で「抜け」を表現。
      const kind = wall.kind ?? "wall";
      const drawWidth =
        kind === "railing"
          ? Math.max(1.5, Math.min(3, displayWidth * 0.4))
          : kind === "half"
            ? Math.max(2, displayWidth * 0.6)
            : displayWidth;
      const dash =
        kind === "railing"
          ? `${drawWidth * 2} ${drawWidth * 1.5}`
          : kind === "half"
            ? `${drawWidth * 3} ${drawWidth * 2}`
            : undefined;
      const kindOpacity = kind === "railing" ? 0.85 : kind === "half" ? 0.7 : undefined;
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
            style={{ cursor: canEditWalls ? "grab" : "default", pointerEvents: canEditWalls ? "auto" : "none" }}
            onPointerDown={(event) => {
              onSelect({ kind: "wall", id: wall.id });
              onWallDragStart(wall, event);
            }}
          />
          <line
            x1={ds.x}
            y1={ds.y}
            x2={de.x}
            y2={de.y}
            className={selected ? "plan-wall is-selected" : "plan-wall"}
            strokeWidth={drawWidth}
            strokeDasharray={dash}
            strokeOpacity={kindOpacity}
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
      style={{ cursor: canDrag && selected ? "grab" : "pointer" }}
      onPointerDown={(event) => {
        event.stopPropagation();
        onSelect({ kind, id: windowItem.id });
        if (canDrag && selected && !(event.pointerType === "touch" && !event.isPrimary)) onDragStart();
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
  const sides = visibleVoidSides(voidArea);
  const openSides = (["north", "south", "west", "east"] as VoidSide[]).filter((side) => !sides.includes(side));

  const handlePointerDown = (event: React.PointerEvent<SVGGElement>) => {
    event.stopPropagation();
    onSelect({ kind: "void", id: voidArea.id });
    if (!canDrag || !selected || (event.pointerType === "touch" && !event.isPrimary)) return;
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
        className="plan-void-fill"
        stroke="none"
      />
      {sides.map((side) => {
        const line = voidSideLine(voidArea, side);
        const s = worldToSvg(line.start);
        const e = worldToSvg(line.end);
        return (
          <line
            key={side}
            x1={s.x}
            y1={s.y}
            x2={e.x}
            y2={e.y}
            className={selected ? "plan-void-wall is-selected" : "plan-void-wall"}
          />
        );
      })}
      {selected && openSides.map((side) => {
        const line = voidSideLine(voidArea, side);
        const s = worldToSvg(line.start);
        const e = worldToSvg(line.end);
        return (
          <line
            key={`open-${side}`}
            x1={s.x}
            y1={s.y}
            x2={e.x}
            y2={e.y}
            className="plan-void-wall is-open"
          />
        );
      })}
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
    if (!canDrag || !selected || (event.pointerType === "touch" && !event.isPrimary)) return;
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
    if (!canDrag || !selected || (event.pointerType === "touch" && !event.isPrimary)) return;
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
    if (!canDrag || !selected || (event.pointerType === "touch" && !event.isPrimary)) return;
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
  togglesOffOnClick,
  onSelectLight,
  onClearSelection,
  onDragStart,
  svgToWorld,
  canDrag
}: {
  fixture: LightFixture;
  worldToSvg: (point: Vec2M) => { x: number; y: number };
  selected: boolean;
  togglesOffOnClick: boolean;
  onSelectLight: (id: string, shiftKey: boolean) => void;
  onClearSelection: () => void;
  onDragStart: (offset: Vec2M) => void;
  svgToWorld: (clientX: number, clientY: number) => Vec2M;
  canDrag: boolean;
}) => {
  const center = worldToSvg({ x: fixture.position.x, z: fixture.position.z });
  const target = fixture.target ? worldToSvg({ x: fixture.target.x, z: fixture.target.z }) : null;
  const radius = fixture.type === "downlight" ? (selected ? 6 : 4) : (selected ? 11 : 8);
  const pressRef = useRef<{ pointerId: number; clientX: number; clientY: number; togglesOff: boolean } | null>(null);
  const handlePointerDown = (event: React.PointerEvent<SVGGElement>) => {
    event.stopPropagation();
    onSelectLight(fixture.id, event.shiftKey);
    // Shift+クリックは複数選択トグルのみ。ドラッグは開始しない。
    if (event.shiftKey || !canDrag || !selected || (event.pointerType === "touch" && !event.isPrimary)) return;
    pressRef.current = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      togglesOff: togglesOffOnClick
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = svgToWorld(event.clientX, event.clientY);
    onDragStart({
      x: point.x - fixture.position.x,
      z: point.z - fixture.position.z
    });
  };
  const handlePointerMove = (event: React.PointerEvent<SVGGElement>) => {
    const press = pressRef.current;
    if (!press || press.pointerId !== event.pointerId) return;
    if (Math.hypot(event.clientX - press.clientX, event.clientY - press.clientY) > TOUCH_TAP_MAX_MOVE_PX) {
      pressRef.current = { ...press, togglesOff: false };
    }
  };
  const handlePointerEnd = (event: React.PointerEvent<SVGGElement>) => {
    const press = pressRef.current;
    if (press?.pointerId === event.pointerId) {
      if (press.togglesOff) onClearSelection();
      pressRef.current = null;
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return (
    <g
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      className={selected ? "plan-light is-selected" : "plan-light"}
    >
      {target && <line x1={center.x} y1={center.y} x2={target.x} y2={target.y} className="plan-aim-line" />}
      <circle cx={center.x} cy={center.y} r={radius} />
      <text x={center.x + radius + 5} y={center.y - radius - 2} className="plan-label">
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
