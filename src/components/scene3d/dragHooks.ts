import type { ThreeEvent } from "@react-three/fiber";
import { useThree } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import type { WallSegment } from "../../types";
import { useTouchDragGuard } from "./contexts";

const TOUCH_DRAG_SLOP_PX = 10;

type PointerDragState = {
  pointerId: number;
  pointerType: string;
  startX: number;
  startY: number;
  hasMoved: boolean;
};

const passedDragSlop = (state: PointerDragState, event: ThreeEvent<PointerEvent>) => {
  if (state.hasMoved || state.pointerType !== "touch") return true;
  return Math.hypot(event.clientX - state.startX, event.clientY - state.startY) >= TOUCH_DRAG_SLOP_PX;
};

// 3Dビュー上で床平面に沿ってオブジェクトをドラッグ移動するためのハンドラ群。
// ドラッグ中はOrbitControlsを無効化し、ポインタを掴んだ点との相対位置を保つ。
export const useFloorDrag = (
  current: { x: number; z: number },
  floorY: number,
  onMove: (x: number, z: number, pointer: { x: number; z: number }) => void,
  onEnd?: () => void
) => {
  const camera = useThree((state) => state.camera);
  const controls = useThree((state) => state.controls) as { enabled: boolean } | null;
  const touchGuard = useTouchDragGuard();
  const dragState = useRef<PointerDragState | null>(null);
  const grab = useRef({ x: 0, z: 0 });
  const plane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), []);
  const hit = useMemo(() => new THREE.Vector3(), []);
  const anchor = useMemo(() => new THREE.Vector3(), []);
  const normal = useMemo(() => new THREE.Vector3(), []);
  const stopDrag = (event: ThreeEvent<PointerEvent>, releaseCapture = true) => {
    const state = dragState.current;
    if (!state || state.pointerId !== event.pointerId) return;
    dragState.current = null;
    if (releaseCapture) (event.target as Element | null)?.releasePointerCapture?.(event.pointerId);
    if (controls) controls.enabled = true;
    onEnd?.();
  };

  return {
    onPointerDown: (event: ThreeEvent<PointerEvent>) => {
      if (event.button !== 0) return;
      if (event.pointerType === "touch" && touchGuard.hasMultiTouch()) return;
      event.stopPropagation();
      if (event.pointerType === "touch") {
        anchor.set(current.x, floorY, current.z);
        camera.getWorldDirection(normal);
        plane.setFromNormalAndCoplanarPoint(normal, anchor);
      } else {
        plane.set(new THREE.Vector3(0, 1, 0), -floorY);
      }
      if (!event.ray.intersectPlane(plane, hit)) return;
      grab.current = { x: current.x - hit.x, z: current.z - hit.z };
      dragState.current = {
        pointerId: event.pointerId,
        pointerType: event.pointerType,
        startX: event.clientX,
        startY: event.clientY,
        hasMoved: false
      };
      (event.target as Element | null)?.setPointerCapture?.(event.pointerId);
      if (controls) controls.enabled = false;
    },
    onPointerMove: (event: ThreeEvent<PointerEvent>) => {
      const state = dragState.current;
      if (!state || state.pointerId !== event.pointerId) return;
      if (event.pointerType === "touch" && touchGuard.hasMultiTouch()) {
        stopDrag(event);
        return;
      }
      if (!passedDragSlop(state, event)) return;
      state.hasMoved = true;
      if (event.ray.intersectPlane(plane, hit)) {
        const x = hit.x + grab.current.x;
        const z = hit.z + grab.current.z;
        if (Number.isFinite(x) && Number.isFinite(z)) onMove(x, z, { x: hit.x, z: hit.z });
      }
    },
    onPointerUp: (event: ThreeEvent<PointerEvent>) => {
      stopDrag(event);
    },
    onPointerCancel: (event: ThreeEvent<PointerEvent>) => {
      stopDrag(event);
    },
    onLostPointerCapture: (event: ThreeEvent<PointerEvent>) => {
      stopDrag(event, false);
    }
  };
};

// 天井照明のように視点とほぼ同じ高さの物体は、水平面レイ交差だと
// 平行に近くなって飛びやすい。カメラ方向に向いた縦平面で掴み、
// x/z だけを移動量として使う。
export const useViewPlaneDrag = (
  current: { x: number; z: number },
  anchorY: number,
  onMove: (x: number, z: number) => void
) => {
  const camera = useThree((state) => state.camera);
  const controls = useThree((state) => state.controls) as { enabled: boolean } | null;
  const touchGuard = useTouchDragGuard();
  const dragState = useRef<PointerDragState | null>(null);
  const grab = useRef({ x: 0, z: 0 });
  const plane = useMemo(() => new THREE.Plane(), []);
  const hit = useMemo(() => new THREE.Vector3(), []);
  const anchor = useMemo(() => new THREE.Vector3(), []);
  const normal = useMemo(() => new THREE.Vector3(), []);

  const setDragPlane = () => {
    anchor.set(current.x, anchorY, current.z);
    camera.getWorldDirection(normal);
    plane.setFromNormalAndCoplanarPoint(normal, anchor);
  };

  const stopDrag = (event: ThreeEvent<PointerEvent>, releaseCapture = true) => {
    const state = dragState.current;
    if (!state || state.pointerId !== event.pointerId) return;
    dragState.current = null;
    if (releaseCapture) (event.target as Element | null)?.releasePointerCapture?.(event.pointerId);
    if (controls) controls.enabled = true;
  };

  return {
    onPointerDown: (event: ThreeEvent<PointerEvent>) => {
      if (event.button !== 0) return;
      if (event.pointerType === "touch" && touchGuard.hasMultiTouch()) return;
      event.stopPropagation();
      setDragPlane();
      if (!event.ray.intersectPlane(plane, hit)) return;
      grab.current = { x: current.x - hit.x, z: current.z - hit.z };
      dragState.current = {
        pointerId: event.pointerId,
        pointerType: event.pointerType,
        startX: event.clientX,
        startY: event.clientY,
        hasMoved: false
      };
      (event.target as Element | null)?.setPointerCapture?.(event.pointerId);
      if (controls) controls.enabled = false;
    },
    onPointerMove: (event: ThreeEvent<PointerEvent>) => {
      const state = dragState.current;
      if (!state || state.pointerId !== event.pointerId) return;
      if (event.pointerType === "touch" && touchGuard.hasMultiTouch()) {
        stopDrag(event);
        return;
      }
      if (!passedDragSlop(state, event)) return;
      state.hasMoved = true;
      if (event.ray.intersectPlane(plane, hit)) {
        const x = hit.x + grab.current.x;
        const z = hit.z + grab.current.z;
        if (Number.isFinite(x) && Number.isFinite(z)) onMove(x, z);
      }
    },
    onPointerUp: (event: ThreeEvent<PointerEvent>) => {
      stopDrag(event);
    },
    onPointerCancel: (event: ThreeEvent<PointerEvent>) => {
      stopDrag(event);
    },
    onLostPointerCapture: (event: ThreeEvent<PointerEvent>) => {
      stopDrag(event, false);
    }
  };
};

// 壁物は3Dレイを床へ落とさず、指レイに最も近い壁線分上の点だけを使う。
// 交点が発散せず、結果は常に所属壁の区間内に収まる。
export const useWallAxisDrag = (
  wall: WallSegment | null,
  currentRatio: number,
  openingWidthM: number,
  anchorY: number,
  onMove: (centerRatio: number) => void
) => {
  const controls = useThree((state) => state.controls) as { enabled: boolean } | null;
  const touchGuard = useTouchDragGuard();
  const dragState = useRef<(PointerDragState & { grabRatio: number }) | null>(null);
  const wallStart = useMemo(() => new THREE.Vector3(), []);
  const wallEnd = useMemo(() => new THREE.Vector3(), []);
  const pointOnWall = useMemo(() => new THREE.Vector3(), []);

  const ratioFromRay = (event: ThreeEvent<PointerEvent>) => {
    if (!wall) return null;
    wallStart.set(wall.start.x, anchorY, wall.start.z);
    wallEnd.set(wall.end.x, anchorY, wall.end.z);
    event.ray.distanceSqToSegment(wallStart, wallEnd, undefined, pointOnWall);
    const dx = wall.end.x - wall.start.x;
    const dz = wall.end.z - wall.start.z;
    const lengthSq = dx * dx + dz * dz;
    if (lengthSq <= 1e-9) return null;
    return THREE.MathUtils.clamp(
      ((pointOnWall.x - wall.start.x) * dx + (pointOnWall.z - wall.start.z) * dz) / lengthSq,
      0,
      1
    );
  };

  const stopDrag = (event: ThreeEvent<PointerEvent>, releaseCapture = true) => {
    const state = dragState.current;
    if (!state || state.pointerId !== event.pointerId) return;
    dragState.current = null;
    if (releaseCapture) (event.target as Element | null)?.releasePointerCapture?.(event.pointerId);
    if (controls) controls.enabled = true;
  };

  return {
    onPointerDown: (event: ThreeEvent<PointerEvent>) => {
      if (!wall) return;
      if (event.button !== 0) return;
      if (event.pointerType === "touch" && touchGuard.hasMultiTouch()) return;
      const pointerRatio = ratioFromRay(event);
      if (pointerRatio === null) return;
      event.stopPropagation();
      dragState.current = {
        pointerId: event.pointerId,
        pointerType: event.pointerType,
        startX: event.clientX,
        startY: event.clientY,
        hasMoved: false,
        grabRatio: currentRatio - pointerRatio
      };
      (event.target as Element | null)?.setPointerCapture?.(event.pointerId);
      if (controls) controls.enabled = false;
    },
    onPointerMove: (event: ThreeEvent<PointerEvent>) => {
      const state = dragState.current;
      if (!state || state.pointerId !== event.pointerId) return;
      if (event.pointerType === "touch" && touchGuard.hasMultiTouch()) {
        stopDrag(event);
        return;
      }
      if (!passedDragSlop(state, event)) return;
      state.hasMoved = true;
      const pointerRatio = ratioFromRay(event);
      if (pointerRatio === null) return;
      const wallLengthM = Math.hypot(wall.end.x - wall.start.x, wall.end.z - wall.start.z);
      const halfRatio = wallLengthM > 1e-6 ? Math.min(0.5, openingWidthM / wallLengthM / 2) : 0.5;
      onMove(THREE.MathUtils.clamp(pointerRatio + state.grabRatio, halfRatio, 1 - halfRatio));
    },
    onPointerUp: stopDrag,
    onPointerCancel: stopDrag,
    onLostPointerCapture: (event: ThreeEvent<PointerEvent>) => stopDrag(event, false)
  };
};

// 3Dビュー上で平面ヒットを取りながらドラッグするための汎用ハンドラ（リサイズハンドル用）。
export const useHandleDrag = (getPlane: () => THREE.Plane, onHit: (point: THREE.Vector3) => void) => {
  const controls = useThree((state) => state.controls) as { enabled: boolean } | null;
  const touchGuard = useTouchDragGuard();
  const dragging = useRef(false);
  const hit = useMemo(() => new THREE.Vector3(), []);
  const stopDrag = (event: ThreeEvent<PointerEvent>) => {
    if (!dragging.current) return;
    dragging.current = false;
    (event.target as Element | null)?.releasePointerCapture?.(event.pointerId);
    if (controls) controls.enabled = true;
  };
  return {
    onPointerDown: (event: ThreeEvent<PointerEvent>) => {
      if (event.button !== 0) return;
      if (event.pointerType === "touch" && touchGuard.hasMultiTouch()) return;
      event.stopPropagation();
      dragging.current = true;
      (event.target as Element | null)?.setPointerCapture?.(event.pointerId);
      if (controls) controls.enabled = false;
    },
    onPointerMove: (event: ThreeEvent<PointerEvent>) => {
      if (!dragging.current) return;
      if (event.pointerType === "touch" && touchGuard.hasMultiTouch()) {
        stopDrag(event);
        return;
      }
      if (event.ray.intersectPlane(getPlane(), hit)) onHit(hit);
    },
    onPointerUp: (event: ThreeEvent<PointerEvent>) => {
      stopDrag(event);
    },
    onPointerCancel: (event: ThreeEvent<PointerEvent>) => {
      stopDrag(event);
    }
  };
};

// 箱の1面をヒット点まで動かしてリサイズ（反対面を固定, Y回転考慮）。y軸は下面=床を固定。
export const resizeBox3D = (
  center: { x: number; y: number; z: number },
  size: { x: number; y: number; z: number },
  rotationYDeg: number,
  axis: "x" | "z" | "y",
  sign: 1 | -1,
  hit: { x: number; y: number; z: number }
): { center: { x: number; y: number; z: number }; size: { x: number; y: number; z: number } } => {
  const MIN = 0.2;
  if (axis === "y") {
    const bottom = center.y - size.y / 2;
    const newSizeY = Math.max(MIN, hit.y - bottom);
    return { center: { ...center, y: bottom + newSizeY / 2 }, size: { ...size, y: newSizeY } };
  }
  const th = (rotationYDeg * Math.PI) / 180;
  const c = Math.cos(th);
  const s = Math.sin(th);
  const dx = hit.x - center.x;
  const dz = hit.z - center.z;
  const local = axis === "x" ? dx * c - dz * s : dx * s + dz * c; // world→local
  const half = axis === "x" ? size.x / 2 : size.z / 2;
  const oppositeLocal = -sign * half;
  const newSize = Math.max(MIN, sign * (local - oppositeLocal));
  const newCenterLocal = oppositeLocal + sign * (newSize / 2);
  const offLx = axis === "x" ? newCenterLocal : 0;
  const offLz = axis === "z" ? newCenterLocal : 0;
  return {
    center: { x: center.x + offLx * c + offLz * s, y: center.y, z: center.z - offLx * s + offLz * c },
    size: axis === "x" ? { ...size, x: newSize } : { ...size, z: newSize }
  };
};
