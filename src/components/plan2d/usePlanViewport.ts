import { useEffect, useMemo, useRef, useState } from "react";
import type { FloorPlanBackground, FurnitureItem, Project, Vec2M, WallSegment } from "../../types";
import { MARGIN_M, VIEW_PAD } from "./constants";
import type { ContentBox, PlanSize, ViewState } from "./types";

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

// SVGビューポート(ズーム/パン)と座標変換。パン/ピンチ中に<g>のtransformを毎フレーム
// 更新するとSVG全体（背景画像+全ベクター）がCPUで再ラスタライズされ、モバイルで
// カクつく。ジェスチャー中はGPU合成されるCSS transformを<svg>要素へ適用して代用し、
// 指を離した時だけ<g>とstateへ確定する。
export const usePlanViewport = ({ contentBox, planSize }: { contentBox: ContentBox; planSize: PlanSize }) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const viewportLayerRef = useRef<SVGGElement | null>(null);
  const viewportRef = useRef<ViewState>({ zoom: 1, pan: { x: 0, y: 0 } });
  const viewportFrameRef = useRef<number | null>(null);
  const pendingViewportCommitRef = useRef(false);
  // view=開始時点の確定view、rect=開始時点のレイアウト矩形（CSS transformの影響を受けない基準）。
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
    zoomAtUserPoint,
    zoomAtCenter
  };
};
