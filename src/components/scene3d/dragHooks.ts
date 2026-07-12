import type { ThreeEvent } from "@react-three/fiber";
import { useThree } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useTouchDragGuard } from "./contexts";

// 3Dビュー上で床平面に沿ってオブジェクトをドラッグ移動するためのハンドラ群。
// ドラッグ中はOrbitControlsを無効化し、ポインタを掴んだ点との相対位置を保つ。
export const useFloorDrag = (
  current: { x: number; z: number },
  floorY: number,
  onMove: (x: number, z: number) => void
) => {
  const controls = useThree((state) => state.controls) as { enabled: boolean } | null;
  const touchGuard = useTouchDragGuard();
  const dragging = useRef(false);
  const grab = useRef({ x: 0, z: 0 });
  const plane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), []);
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
      plane.constant = -floorY;
      if (!event.ray.intersectPlane(plane, hit)) return;
      grab.current = { x: current.x - hit.x, z: current.z - hit.z };
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
      if (event.ray.intersectPlane(plane, hit)) {
        onMove(hit.x + grab.current.x, hit.z + grab.current.z);
      }
    },
    onPointerUp: (event: ThreeEvent<PointerEvent>) => {
      stopDrag(event);
    },
    onPointerCancel: (event: ThreeEvent<PointerEvent>) => {
      stopDrag(event);
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
  const dragging = useRef(false);
  const grab = useRef({ x: 0, z: 0 });
  const plane = useMemo(() => new THREE.Plane(), []);
  const hit = useMemo(() => new THREE.Vector3(), []);
  const anchor = useMemo(() => new THREE.Vector3(), []);
  const normal = useMemo(() => new THREE.Vector3(), []);

  const setDragPlane = () => {
    anchor.set(current.x, anchorY, current.z);
    normal.set(camera.position.x - current.x, 0, camera.position.z - current.z);
    if (normal.lengthSq() < 1e-6) normal.set(0, 0, 1);
    normal.normalize();
    plane.setFromNormalAndCoplanarPoint(normal, anchor);
  };

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
      setDragPlane();
      if (!event.ray.intersectPlane(plane, hit)) return;
      grab.current = { x: current.x - hit.x, z: current.z - hit.z };
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
      if (event.ray.intersectPlane(plane, hit)) {
        onMove(hit.x + grab.current.x, hit.z + grab.current.z);
      }
    },
    onPointerUp: (event: ThreeEvent<PointerEvent>) => {
      stopDrag(event);
    },
    onPointerCancel: (event: ThreeEvent<PointerEvent>) => {
      stopDrag(event);
    }
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
