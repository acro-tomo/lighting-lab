import { useEffect, useMemo, useRef, useState } from "react";
import type { FloorPlanBackground, FurnitureItem, Project, Vec2M, WallSegment } from "../../types";
import { MARGIN_M, VIEW_PAD } from "./constants";
import type { ContentBox, PlanSize, ViewState } from "./types";

type BackgroundLayer = {
  element: HTMLImageElement;
  tx: number;
  ty: number;
  scale: number;
  opacity: number;
};

// コンテンツ全体(壁/room矩形/窓が乗る壁/家具/void/天井・床ゾーン/背景画像)を
// 内包する world(m) バウンディングボックス。これを基準に planSize/座標系を作る。
// room 矩形より壁が外に広がっていても 100%(=fit) で全体が映るようにするのが目的。
export const usePlanBounds = ({
  project,
  activeWalls,
  ghostWalls,
  activeFurniture,
  activeVoids,
  activeCeilingZones,
  activeFloorZones,
  activeBackground,
  bgNaturalSize
}: {
  project: Project;
  activeWalls: WallSegment[];
  ghostWalls: WallSegment[];
  activeFurniture: FurnitureItem[];
  activeVoids: Project["voids"];
  activeCeilingZones: NonNullable<Project["ceilingZones"]>;
  activeFloorZones: NonNullable<Project["floorZones"]>;
  activeBackground: FloorPlanBackground | undefined;
  bgNaturalSize: { width: number; height: number } | null;
}): { contentBox: ContentBox; planSize: PlanSize } => {
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

  const planSize = useMemo(() => {
    const targetWidth = 920;
    const bboxW = Math.max(0.5, contentBox.maxX - contentBox.minX) + MARGIN_M * 2;
    const bboxH = Math.max(0.5, contentBox.maxZ - contentBox.minZ) + MARGIN_M * 2;
    const pxPerM = targetWidth / bboxW;
    return { width: targetWidth, height: bboxH * pxPerM, pxPerM };
  }, [contentBox]);

  return { contentBox, planSize };
};

// SVGビューポート(ズーム/パン)と座標変換。背景画像はSVG外のHTMLレイヤーへ置き、
// ベクター編集レイヤーと同じビューポート変換を適用する。
export const usePlanViewport = ({ contentBox, planSize }: { contentBox: ContentBox; planSize: PlanSize }) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const viewportLayerRef = useRef<SVGGElement | null>(null);
  const backgroundLayerRef = useRef<BackgroundLayer | null>(null);
  const viewportRef = useRef<ViewState>({ zoom: 1, pan: { x: 0, y: 0 } });
  const viewportFrameRef = useRef<number | null>(null);
  const pendingViewportCommitRef = useRef(false);
  const gestureBaseRef = useRef<{ view: ViewState; rect: DOMRect } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });

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

  const applyPlanViewport = (view: ViewState) => {
    viewportLayerRef.current?.setAttribute("transform", viewportTransformFor(view));
    const svg = svgRef.current;
    const background = backgroundLayerRef.current;
    if (!svg || !background) return;
    const rect = gestureBaseRef.current?.rect ?? svg.getBoundingClientRect();
    const mapping = screenMappingFor(rect, view);
    const x = mapping.offsetX + (background.tx - mapping.box.x) * mapping.scale;
    const y = mapping.offsetY + (background.ty - mapping.box.y) * mapping.scale;
    background.element.style.transform = `translate(${x}px, ${y}px) scale(${background.scale * mapping.scale})`;
    background.element.style.opacity = String(background.opacity);
  };

  const refreshViewport = () => {
    applyPlanViewport(viewportRef.current);
  };

  const beginViewportGesture = () => {
    if (gestureBaseRef.current || !svgRef.current) return;
    gestureBaseRef.current = {
      view: { zoom: viewportRef.current.zoom, pan: { ...viewportRef.current.pan } },
      rect: svgRef.current.getBoundingClientRect()
    };
  };

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
    applyPlanViewport(viewportRef.current);
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
    gestureBaseRef.current = null;
    const next = viewportRef.current;
    applyPlanViewport(next);
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
      if (shouldCommit) gestureBaseRef.current = null;
      applyPlanViewport(next);
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

  return {
    svgRef,
    viewportLayerRef,
    backgroundLayerRef,
    viewportRef,
    gestureBaseRef,
    zoom,
    pan,
    baseViewBox,
    viewBox,
    viewBoxFor,
    viewBoxStringFor,
    viewportTransformFor,
    screenMappingFor,
    beginViewportGesture,
    gestureUserPoint,
    commitViewport,
    scheduleViewport,
    worldToSvg,
    svgPointToWorld,
    clientToSvgPoint,
    svgToWorld,
    refreshViewport,
    zoomAtUserPoint,
    zoomAtCenter
  };
};
