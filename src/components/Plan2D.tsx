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
  | { kind: "window"; id: string }
  | { kind: "pan"; clientStart: { x: number; y: number }; panStart: { x: number; y: number } }
  | null;

const NAV_TOOLS: NavTool[] = ["パン"];

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
  const [scaleModalOpen, setScaleModalOpen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [bgNaturalSize, setBgNaturalSize] = useState<{ width: number; height: number } | null>(null);
  // 壁トレース: 確定済み頂点列とプレビュー用カーソル位置。
  const [wallDraft, setWallDraft] = useState<Vec2M[]>([]);
  const [wallCursor, setWallCursor] = useState<Vec2M | null>(null);

  // オブジェクト操作可否は navTool が無効(=Appのmode優先)のときだけ。
  // pendingAdd 中・wall モード中は背景SVGにクリックを通す（オブジェクトは pointerEvents:none）。
  const isPanMode = navTool === "パン";
  const canSelectObjects = !navTool && !pendingAdd && (mode === "select" || mode === "move");
  // 選択モードでもドラッグで動かせるほうが直感的。クリックのみなら移動は起きず選択だけ。
  const canDragObjects = !navTool && (mode === "select" || mode === "move");

  const updateFurniture = useProjectStore((state) => state.updateFurniture);
  const updateLight = useProjectStore((state) => state.updateLight);
  const updateVoid = useProjectStore((state) => state.updateVoid);
  const setBackgroundPlan = useProjectStore((state) => state.setBackgroundPlan);
  const updateWindow = useProjectStore((state) => state.updateWindow);
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
    }
  }, [mode]);

  // 壁モード中は Enter でトレースを終了する（Escは集中表示解除等と衝突するため使わない）。
  useEffect(() => {
    if (mode !== "wall") return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Enter") {
        setWallDraft([]);
        setWallCursor(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mode]);

  // 壁の既定値: 高さは天井高、厚みは既存壁を踏襲(無ければ0.12)、材質も既存壁を踏襲。
  const commitWallSegment = (start: Vec2M, end: Vec2M) => {
    const reference = project.walls[project.walls.length - 1];
    addWall({
      id: uid("wall"),
      name: "追加壁",
      start,
      end,
      thicknessM: reference?.thicknessM ?? 0.12,
      heightM: project.room.ceilingHeightM,
      materialId: reference?.materialId ?? "wall-white"
    });
  };

  const planSize = useMemo(() => {
    const width = 920;
    const height = Math.round(width * (project.room.depthM / project.room.widthM));
    const pxPerM = width / project.room.widthM;
    return { width, height, pxPerM };
  }, [project.room.depthM, project.room.widthM]);

  // 外周(部屋の端)に来る太い壁ストロークがクリップされないよう、viewBoxを
  // 表示用の余白ぶん広げる。座標系は getScreenCTM 逆行列で扱うため
  // worldToSvg/svgPointToWorld は変更不要（padは表示余白のみ）。
  const VIEW_PAD = 60;
  const viewBox = {
    x: pan.x - VIEW_PAD,
    y: pan.y - VIEW_PAD,
    width: planSize.width / zoom + VIEW_PAD * 2,
    height: planSize.height / zoom + VIEW_PAD * 2
  };

  const worldToSvg = (point: Vec2M) => ({
    x: (point.x + project.room.widthM / 2) * planSize.pxPerM,
    y: (point.z + project.room.depthM / 2) * planSize.pxPerM
  });

  const svgPointToWorld = (point: { x: number; y: number }): Vec2M => ({
    x: point.x / planSize.pxPerM - project.room.widthM / 2,
    z: point.y / planSize.pxPerM - project.room.depthM / 2
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
  }, [bgNaturalSize, planSize.width, planSize.height, planSize.pxPerM]);

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
    // 削除モードは廃止。選択中のオブジェクトはDeleteキーで消す（App側で処理）。
    onSelect(nextSelection);
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
      // 窓/扉は最寄り壁へ吸着して設置（要望: どの壁に付けるか自分で決めたい）。
      if (pendingAdd === "window" || pendingAdd === "door") {
        const hit = nearestWall(world, project.walls);
        if (hit) onPlaceOnWall(hit.wallId, hit.ratio);
        else onPlaceObject(snapPoint(world));
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
      if (prev) commitWallSegment(prev, v);
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
    }
  };

  // ズーム時にアンカー点(ユーザー空間座標 u)が画面上の同じ位置に留まるよう pan を補正する。
  // viewBox.x = pan - VIEW_PAD, viewBox.width = planSize/zoom + VIEW_PAD*2 の関係から、
  // u = viewBox.x + frac*viewBox.width（frac=アンカーの viewBox 内相対位置）を不変に保つ。
  // → 新 viewBox.x = u - frac*newWidth、新 pan = viewBox.x + VIEW_PAD。
  const zoomAtUserPoint = (nextZoom: number, anchorX: number, anchorY: number) => {
    const clamped = Math.min(8, Math.max(0.65, nextZoom));
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

  const handleWheel = (event: React.WheelEvent<SVGSVGElement>) => {
    event.preventDefault();
    // clientToSvgPoint は viewBox 変換込みのユーザー空間座標を返す（=固定したいアンカー点）。
    const anchor = clientToSvgPoint(event.clientX, event.clientY);
    zoomAtUserPoint(zoom * (event.deltaY > 0 ? 0.9 : 1.1), anchor.x, anchor.y);
  };

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
    // imagePixelToWorld/worldToSvg は placement・room から導出されるため依存に含める
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bgNaturalSize, placement, planSize.pxPerM, project.room.widthM, project.room.depthM]);

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
        <button onClick={() => zoomAtCenter(1.2)}>+</button>
        <button onClick={() => zoomAtCenter(1 / 1.2)}>-</button>
        <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}>全体</button>
      </div>

      <p className="tool-help">
        {isPanMode && "ドラッグで平面図をパン。ホイールでズーム。"}
        {!navTool && (pendingAdd === "window" || pendingAdd === "door") && "設置したい壁をクリック。設置後は壁上をドラッグで位置調整。"}
        {!navTool && pendingAdd && pendingAdd !== "window" && pendingAdd !== "door" && "クリックした位置にオブジェクトを配置します。"}
        {!navTool && !pendingAdd && mode === "select" && "オブジェクトをクリックで選択、ドラッグで移動。何もない所のドラッグで平面図をパン。Deleteで削除。"}
        {!navTool && !pendingAdd && mode === "move" && "オブジェクトをドラッグで移動。何もない所のドラッグで平面図をパン。"}
        {!navTool && !pendingAdd && mode === "wall" && "クリックで壁の頂点を連続配置。水平/垂直に自動スナップ。Enter/ダブルクリックで終了。"}
      </p>

      <div className="plan-canvas-wrap">
        <svg
          ref={svgRef}
          className="plan-canvas"
          style={{ cursor: mode === "wall" || pendingAdd ? "crosshair" : undefined }}
          viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
          onPointerDown={handleCanvasPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={() => setDragging(null)}
          onPointerLeave={() => setDragging(null)}
          onDoubleClick={() => {
            setWallDraft([]);
            setWallCursor(null);
          }}
          onWheel={handleWheel}
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
      return (
        <g key={wall.id}>
          {/* 表示用の線とは別に透明で太いヒット線を重ね、壁を選択しやすくする（要望9）。
              表示の太さは displayWidth のまま変えない。 */}
          <line
            x1={start.x}
            y1={start.y}
            x2={end.x}
            y2={end.y}
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
            x1={start.x}
            y1={start.y}
            x2={end.x}
            y2={end.y}
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
  svgToWorld,
  canDrag
}: {
  voidArea: Project["voids"][number];
  planSize: { pxPerM: number };
  worldToSvg: (point: Vec2M) => { x: number; y: number };
  selected: boolean;
  onSelect: (selection: Selection) => void;
  onDragStart: (offset: Vec2M) => void;
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
    <g onPointerDown={handlePointerDown}>
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

const FurniturePlanItem = ({
  item,
  planSize,
  worldToSvg,
  selected,
  onSelect,
  onDragStart,
  svgToWorld,
  canDrag
}: {
  item: FurnitureItem;
  planSize: { pxPerM: number };
  worldToSvg: (point: Vec2M) => { x: number; y: number };
  selected: boolean;
  onSelect: (selection: Selection) => void;
  onDragStart: (offset: Vec2M) => void;
  svgToWorld: (clientX: number, clientY: number) => Vec2M;
  canDrag: boolean;
}) => {
  const center = worldToSvg({ x: item.position.x, z: item.position.z });
  const width = item.size.x * planSize.pxPerM;
  const depth = item.size.z * planSize.pxPerM;

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
      className={selected ? "plan-furniture is-selected" : "plan-furniture"}
    >
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
