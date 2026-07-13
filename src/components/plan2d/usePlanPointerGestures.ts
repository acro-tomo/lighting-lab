import { useEffect, useRef, useState } from "react";
import type {
  CeilingZone,
  FloorPlanBackground,
  FloorZone,
  FurnitureItem,
  LightFixture,
  Project,
  Vec2M,
  VoidArea,
  WallSegment,
  WindowOpening
} from "../../types";
import type { EditMode } from "../EditToolbar";
import { isWallLightAddKind } from "../../data/fixtureAddKinds";
import {
  isWallMountedFixture,
  WALL_MOUNT_SNAP_M,
  nearestWallMountSurfaceAt,
  wallMountedLightPlacementAt
} from "../../utils/fixtureMounting";
import { constrainFurniturePlacement, type FurnitureWallSnap } from "../../utils/furniturePlacement";
import {
  GESTURE_DEBUG,
  MIN_WALL_SEGMENT_M,
  SNAP_M,
  TOUCH_PAN_SENSITIVITY,
  TOUCH_PINCH_ZOOM_EXPONENT,
  TOUCH_TAP_MAX_MOVE_PX,
  TOUCH_WALL_DRAW_START_PX,
  VIEW_PAD,
  WALL_SNAP_M
} from "./constants";
import { distance, isWallOpening, nearestWall, projectOntoWall, resizeRect, snapPoint } from "./geometry";
import type {
  DragState,
  PinchState,
  PlanSize,
  ResizeState,
  TouchPoint,
  TouchTapState,
  TouchWallTraceState,
  ViewState
} from "./types";

// ポインタ/タッチジェスチャ処理（選択・ドラッグ移動・リサイズ・壁トレース・ピンチ/パン）。
// iOS Safari対策（CSS transform中のpointer capture喪失・偽pointerleave）を含むため、
// タッチ関連の状態と後始末はこのフックにひとまとまりで置く。
export const usePlanPointerGestures = ({
  project,
  mode,
  pendingAdd,
  activeFloor,
  activeWalls,
  activeLights,
  activeBackground,
  placement,
  backgroundAlignMode,
  onPlaceObject,
  onPlaceOnWall,
  updateFurniture,
  updateLight,
  updateVoid,
  updateCeilingZone,
  updateFloorZone,
  updateWall,
  updateWindow,
  setBackgroundPlan,
  svgRef,
  viewportRef,
  gestureBaseRef,
  viewBoxFor,
  beginViewportGesture,
  gestureUserPoint,
  screenMappingFor,
  scheduleViewport,
  commitViewport,
  clientToSvgPoint,
  svgToWorld,
  planSize,
  wallDraft,
  setWallDraft,
  setWallCursor,
  draftInnerSide,
  commitWallSegment,
  wallTracePoint,
  touchWallTraceRef
}: {
  project: Project;
  mode: EditMode;
  pendingAdd: string | null;
  activeFloor: number;
  activeWalls: WallSegment[];
  activeLights: LightFixture[];
  activeBackground: FloorPlanBackground | undefined;
  placement: FloorPlanBackground["placement"] | null;
  backgroundAlignMode: boolean;
  onPlaceObject: (at: { x: number; z: number }) => void;
  onPlaceOnWall: (wallId: string, centerRatio: number, heightM?: number) => void;
  updateFurniture: (id: string, patch: Partial<FurnitureItem>) => void;
  updateLight: (id: string, patch: Partial<LightFixture>) => void;
  updateVoid: (id: string, patch: Partial<VoidArea>) => void;
  updateCeilingZone: (id: string, patch: Partial<CeilingZone>) => void;
  updateFloorZone: (id: string, patch: Partial<FloorZone>) => void;
  updateWall: (id: string, patch: Partial<WallSegment>) => void;
  updateWindow: (id: string, patch: Partial<WindowOpening>) => void;
  setBackgroundPlan: (backgroundPlan: FloorPlanBackground) => void;
  svgRef: { current: SVGSVGElement | null };
  viewportRef: { current: ViewState };
  gestureBaseRef: { current: { view: ViewState; rect: DOMRect } | null };
  viewBoxFor: (viewZoom: number, viewPan: { x: number; y: number }) => { x: number; y: number; width: number; height: number };
  beginViewportGesture: () => void;
  gestureUserPoint: (clientX: number, clientY: number) => { x: number; y: number };
  screenMappingFor: (
    rect: { width: number; height: number },
    view: ViewState
  ) => { box: { x: number; y: number; width: number; height: number }; scale: number; offsetX: number; offsetY: number };
  scheduleViewport: (nextZoom: number, nextPan: { x: number; y: number }, commit?: boolean) => void;
  commitViewport: () => void;
  clientToSvgPoint: (clientX: number, clientY: number) => { x: number; y: number };
  svgToWorld: (clientX: number, clientY: number) => Vec2M;
  planSize: PlanSize;
  wallDraft: Vec2M[];
  setWallDraft: React.Dispatch<React.SetStateAction<Vec2M[]>>;
  setWallCursor: React.Dispatch<React.SetStateAction<Vec2M | null>>;
  draftInnerSide: "left" | "right" | undefined;
  commitWallSegment: (start: Vec2M, end: Vec2M, innerSide: "left" | "right" | undefined) => void;
  wallTracePoint: (raw: Vec2M, prev: Vec2M | undefined, origin: Vec2M | undefined, forceOrthogonal: boolean) => Vec2M;
  touchWallTraceRef: { current: TouchWallTraceState };
}) => {
  const touchPointersRef = useRef<Map<number, TouchPoint>>(new Map());
  const pinchRef = useRef<PinchState | null>(null);
  const touchTapRef = useRef<TouchTapState>(null);
  const [dragging, setDragging] = useState<DragState>(null);
  // 実機ジェスチャー診断用。?gdebug=1 で有効。カウンタはrefに集約し、move以外のイベントでのみ再描画する。
  const gestureDebugRef = useRef({ down: 0, up: 0, cancel: 0, leave: 0, lostcap: 0, last: "-", killer: "-" });
  const [, setGestureDebugTick] = useState(0);
  const noteGestureDebugEvent = (type: string) => {
    if (!GESTURE_DEBUG) return;
    const counts = gestureDebugRef.current;
    if (type === "pointerdown") counts.down += 1;
    else if (type === "pointerup") counts.up += 1;
    else if (type === "pointercancel") counts.cancel += 1;
    else if (type === "pointerleave") counts.leave += 1;
    else if (type === "lostpointercapture") counts.lostcap += 1;
    counts.last = type;
    if (type !== "pointermove") setGestureDebugTick((tick) => tick + 1);
  };
  useEffect(() => {
    if (!GESTURE_DEBUG) return;
    const svg = svgRef.current;
    if (!svg) return;
    const onLostCapture = () => noteGestureDebugEvent("lostpointercapture");
    svg.addEventListener("lostpointercapture", onLostCapture);
    return () => svg.removeEventListener("lostpointercapture", onLostCapture);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // ライトのドラッグ整列スナップが効いた軸のワールド座標。x/z それぞれ吸着先(m)。
  // null のとき非表示。worldToSvg を通してガイド線を描く。
  const [snapGuides, setSnapGuides] = useState<{ x: number | null; z: number | null }>({ x: null, z: null });
  const [furnitureWallGuide, setFurnitureWallGuide] = useState<FurnitureWallSnap | null>(null);
  // ダブルクリックで開始する辺ドラッグリサイズ（ドラッグ中の辺）。
  const [resizing, setResizing] = useState<ResizeState>(null);
  // 窓/扉の追加待ち中、カーソル直下で設置先になる壁。クリック前に青くハイライトして
  // 「どの壁に付くか」を示し、無反応に見える問題を防ぐ。
  const [wallTarget, setWallTarget] = useState<{ wallId: string; ratio: number } | null>(null);

  // 窓/扉の追加待ちを抜けたら設置先ハイライトを消す。
  useEffect(() => {
    if (!isWallOpening(pendingAdd)) setWallTarget(null);
  }, [pendingAdd]);

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
      distance: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
      center: {
        clientX: (a.clientX + b.clientX) / 2,
        clientY: (a.clientY + b.clientY) / 2
      }
    };
    touchTapRef.current = null;
    touchWallTraceRef.current = null;
    setDragging(null);
    setResizing(null);
    setFurnitureWallGuide(null);
    setWallCursor(null);
  };

  const clearTouchGesture = (pointerId?: number) => {
    if (pointerId !== undefined) touchPointersRef.current.delete(pointerId);
    if (touchPointersRef.current.size < 2) pinchRef.current = null;
  };

  // iOS Safariはジェスチャー中のCSS transformで<svg>のpointer captureを失うことがあり、
  // svg外で指を離すとup/cancelがsvgへ届かずタッチ状態がスタックする。
  // windowのcaptureフェーズで拾ってクリーンアップする（captureが生きていれば通常経路に任せる）。
  const windowPointerEndRef = useRef<(event: PointerEvent) => void>(() => {});
  useEffect(() => {
    windowPointerEndRef.current = (event: PointerEvent) => {
      if (event.pointerType !== "touch" || !touchPointersRef.current.has(event.pointerId)) return;
      if (svgRef.current?.hasPointerCapture(event.pointerId)) return;
      if (GESTURE_DEBUG) {
        gestureDebugRef.current.killer = `window:${event.type} #${event.pointerId}`;
        noteGestureDebugEvent(event.type);
      }
      const wasPinching = !!pinchRef.current || touchPointersRef.current.size >= 2;
      const shouldCommitViewport = dragging?.kind === "pan" || wasPinching;
      clearTouchGesture(event.pointerId);
      if (touchTapRef.current?.pointerId === event.pointerId) touchTapRef.current = null;
      if (touchWallTraceRef.current?.pointerId === event.pointerId) {
        touchWallTraceRef.current = null;
        setWallCursor(null);
      }
      if (touchPointersRef.current.size === 0) {
        setDragging(null);
        setResizing(null);
        setSnapGuides({ x: null, z: null });
        setFurnitureWallGuide(null);
        if (shouldCommitViewport) commitViewport();
      }
    };
  });
  useEffect(() => {
    const onWindowPointerEnd = (event: PointerEvent) => windowPointerEndRef.current(event);
    window.addEventListener("pointerup", onWindowPointerEnd, true);
    window.addEventListener("pointercancel", onWindowPointerEnd, true);
    return () => {
      window.removeEventListener("pointerup", onWindowPointerEnd, true);
      window.removeEventListener("pointercancel", onWindowPointerEnd, true);
    };
  }, []);

  const handleObjectPointerDownCapture = (event: React.PointerEvent<SVGGElement>) => {
    if (event.pointerType !== "touch") return;
    touchPointersRef.current.set(event.pointerId, { clientX: event.clientX, clientY: event.clientY });
    if (touchPointersRef.current.size >= 2) {
      event.preventDefault();
      startPinch();
    }
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
    if (GESTURE_DEBUG) noteGestureDebugEvent(event.type);
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
    if (GESTURE_DEBUG) gestureDebugRef.current.last = event.type;
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
            const nextCenter = {
              clientX: (a.clientX + b.clientX) / 2,
              clientY: (a.clientY + b.clientY) / 2
            };
            const anchor = gestureUserPoint(pinch.center.clientX, pinch.center.clientY);
            // 前回中心の下にあった点を現在中心へ送ることで、二本指移動もパンとして扱う。
            // レターボックス込みの写像 screen = offset + scale*(u - box.xy) の逆算で求める。
            const m = screenMappingFor(rect, { zoom: nextZoom, pan: { x: 0, y: 0 } });
            scheduleViewport(
              nextZoom,
              {
                x: anchor.x - (nextCenter.clientX - rect.left - m.offsetX) / m.scale + VIEW_PAD,
                y: anchor.y - (nextCenter.clientY - rect.top - m.offsetY) / m.scale + VIEW_PAD
              },
              false
            );
            pinch.center = nextCenter;
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

    const pointer = svgToWorld(event.clientX, event.clientY);
    const point = snapPoint(pointer);

    const next = {
      x: point.x - dragging.offset.x,
      z: point.z - dragging.offset.z
    };

    if (dragging.kind === "furniture") {
      const item = project.furniture.find((candidate) => candidate.id === dragging.id);
      if (!item) return;
      const placement = constrainFurniturePlacement(
        project,
        item,
        { ...item.position, x: next.x, z: next.z },
        pointer
      );
      setFurnitureWallGuide(placement.wallSnap?.isCentered ? placement.wallSnap : null);
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
    if (GESTURE_DEBUG) {
      gestureDebugRef.current.killer = `${event.type} #${event.pointerId}`;
      noteGestureDebugEvent(event.type);
    }
    // iOS SafariはCSS transformで<svg>が指の下から動くと偽のpointerleaveを発火する
    // （captureも失われる）。タッチのジェスチャー終了はup/cancel（とwindowフォールバック）に任せる。
    if (event.type === "pointerleave" && event.pointerType === "touch") return;
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
    setFurnitureWallGuide(null);
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

  return {
    touchPointersRef,
    pinchRef,
    gestureDebugRef,
    dragging,
    setDragging,
    resizing,
    setResizing,
    snapGuides,
    furnitureWallGuide,
    wallTarget,
    handleObjectPointerDownCapture,
    handleCanvasPointerDown,
    onPointerMove,
    handleCanvasPointerEnd
  };
};
