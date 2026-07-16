import { useThree } from "@react-three/fiber";
import type { MutableRefObject } from "react";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";

export const TOUCH_ORBIT_SPEED = {
  rotate: 0.45,
  zoom: 0.45,
  pan: 0.45
};

const TOUCH_PINCH_DOLLY_M_PER_PX = 0.0045;
const TOUCH_PINCH_DOLLY_MAX_STEP_M = 0.14;
const TOUCH_TWO_FINGER_PAN_SPEED = 0.9;
const TOUCH_GESTURE_LOCK_PX = 5;
const TOUCH_GESTURE_LOCK_RATIO = 1.25;
const TOUCH_LOOK_LOCK_PX = 5;
const TRACKPAD_WHEEL_PAN_SPEED = 0.55;

export const DESKTOP_ORBIT_SPEED = {
  rotate: 1,
  zoom: 1,
  pan: 1
};

export const usePrefersTouchControls = () => {
  const [prefersTouchControls, setPrefersTouchControls] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(pointer: coarse)");
    const update = () => setPrefersTouchControls(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return prefersTouchControls;
};

type TouchPoint = { x: number; y: number };
type TouchGestureIntent = "pan" | "pinch" | null;

export const TouchLook = ({
  controlsRef
}: {
  controlsRef: MutableRefObject<OrbitControlsImpl | null>;
}) => {
  const { camera, gl } = useThree();
  const pointersRef = useRef(new Map<number, TouchPoint>());
  const touchStartRef = useRef<TouchPoint | null>(null);
  const lastTouchRef = useRef<TouchPoint | null>(null);
  const isLookingRef = useRef(false);

  useEffect(() => {
    const canvas = gl.domElement;
    const lookDirection = new THREE.Vector3();
    const yAxis = new THREE.Vector3(0, 1, 0);

    const resetLook = () => {
      touchStartRef.current = null;
      lastTouchRef.current = null;
      isLookingRef.current = false;
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType !== "touch") return;
      const point = { x: event.clientX, y: event.clientY };
      pointersRef.current.set(event.pointerId, point);
      if (pointersRef.current.size === 1) {
        touchStartRef.current = point;
        lastTouchRef.current = point;
        isLookingRef.current = false;
      } else {
        resetLook();
      }
    };

    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType !== "touch" || !pointersRef.current.has(event.pointerId)) return;
      const point = { x: event.clientX, y: event.clientY };
      pointersRef.current.set(event.pointerId, point);
      if (pointersRef.current.size !== 1) return;

      const controls = controlsRef.current;
      // 選択済みオブジェクトのドラッグは pointerdown で controls を無効化する。
      if (!controls || !controls.enabled) return;
      const touchStart = touchStartRef.current;
      const lastTouch = lastTouchRef.current;
      if (!touchStart || !lastTouch) return;

      if (!isLookingRef.current) {
        const movedPx = Math.hypot(point.x - touchStart.x, point.y - touchStart.y);
        if (movedPx < TOUCH_LOOK_LOCK_PX) return;
        isLookingRef.current = true;
      }

      const deltaX = point.x - lastTouch.x;
      const deltaY = point.y - lastTouch.y;
      lastTouchRef.current = point;
      if (deltaX === 0 && deltaY === 0) return;

      const distance = camera.position.distanceTo(controls.target);
      if (distance < 1e-6) return;
      const turnPerPx = (Math.PI * 2 * TOUCH_ORBIT_SPEED.rotate) / (canvas.clientHeight || 1);
      lookDirection.copy(controls.target).sub(camera.position).applyAxisAngle(yAxis, deltaX * turnPerPx);
      const horizontalDistance = Math.hypot(lookDirection.x, lookDirection.z);
      const pitch = THREE.MathUtils.clamp(
        Math.atan2(lookDirection.y, horizontalDistance) + deltaY * turnPerPx,
        -THREE.MathUtils.degToRad(80),
        THREE.MathUtils.degToRad(80)
      );
      const horizontalLength = Math.cos(pitch) * distance;
      const horizontalScale = horizontalDistance > 1e-6 ? horizontalLength / horizontalDistance : 0;
      controls.target.set(
        camera.position.x + lookDirection.x * horizontalScale,
        camera.position.y + Math.sin(pitch) * distance,
        camera.position.z + lookDirection.z * horizontalScale
      );
      controls.update();
      event.preventDefault();
      event.stopImmediatePropagation();
    };

    const onPointerEnd = (event: PointerEvent) => {
      if (event.pointerType !== "touch") return;
      pointersRef.current.delete(event.pointerId);
      if (pointersRef.current.size === 1) {
        const [remainingTouch] = pointersRef.current.values();
        touchStartRef.current = remainingTouch;
        lastTouchRef.current = remainingTouch;
        isLookingRef.current = false;
      } else {
        resetLook();
      }
    };

    const clear = () => {
      pointersRef.current.clear();
      resetLook();
    };

    canvas.addEventListener("pointerdown", onPointerDown, { capture: true });
    canvas.addEventListener("pointermove", onPointerMove, { capture: true, passive: false });
    canvas.addEventListener("pointerup", onPointerEnd, { capture: true });
    canvas.addEventListener("pointercancel", onPointerEnd, { capture: true });
    window.addEventListener("blur", clear);
    return () => {
      canvas.removeEventListener("pointerdown", onPointerDown, { capture: true });
      canvas.removeEventListener("pointermove", onPointerMove, { capture: true });
      canvas.removeEventListener("pointerup", onPointerEnd, { capture: true });
      canvas.removeEventListener("pointercancel", onPointerEnd, { capture: true });
      window.removeEventListener("blur", clear);
      clear();
    };
  }, [camera, controlsRef, gl.domElement]);

  return null;
};

export const TouchPinchDolly = ({
  controlsRef
}: {
  controlsRef: MutableRefObject<OrbitControlsImpl | null>;
}) => {
  const { camera, gl } = useThree();
  const pointersRef = useRef(new Map<number, TouchPoint>());
  const pinchDistanceRef = useRef<number | null>(null);
  const pinchCenterRef = useRef<TouchPoint | null>(null);
  const gestureStartRef = useRef<{ center: TouchPoint; distance: number } | null>(null);
  const gestureIntentRef = useRef<TouchGestureIntent>(null);
  const pinchFrameRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = gl.domElement;
    const forward = new THREE.Vector3();
    const move = new THREE.Vector3();
    const panMove = new THREE.Vector3();
    const panAxis = new THREE.Vector3();
    const targetDir = new THREE.Vector3();

    const pinchMetrics = () => {
      const points = Array.from(pointersRef.current.values());
      if (points.length < 2) return null;
      const [a, b] = points;
      return {
        center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
        distance: Math.hypot(a.x - b.x, a.y - b.y)
      };
    };

    const processPinch = () => {
      pinchFrameRef.current = null;
      const metrics = pinchMetrics();
      const prevDistance = pinchDistanceRef.current;
      const prevCenter = pinchCenterRef.current;
      const gestureStart = gestureStartRef.current;
      pinchDistanceRef.current = metrics?.distance ?? null;
      pinchCenterRef.current = metrics?.center ?? null;
      if (!metrics || prevDistance === null || !prevCenter || !gestureStart) return;
      const controls = controlsRef.current;
      if (!controls) return;
      const distanceDeltaPx = metrics.distance - prevDistance;
      const centerDeltaX = metrics.center.x - prevCenter.x;
      const centerDeltaY = metrics.center.y - prevCenter.y;
      const distanceTravelPx = Math.abs(metrics.distance - gestureStart.distance);
      const centerTravelPx = Math.hypot(
        metrics.center.x - gestureStart.center.x,
        metrics.center.y - gestureStart.center.y
      );
      if (!gestureIntentRef.current) {
        if (distanceTravelPx >= TOUCH_GESTURE_LOCK_PX && distanceTravelPx >= centerTravelPx * TOUCH_GESTURE_LOCK_RATIO) {
          gestureIntentRef.current = "pinch";
        } else if (centerTravelPx >= TOUCH_GESTURE_LOCK_PX && centerTravelPx >= distanceTravelPx * TOUCH_GESTURE_LOCK_RATIO) {
          gestureIntentRef.current = "pan";
        } else {
          return;
        }
      }

      panMove.set(0, 0, 0);
      if (gestureIntentRef.current === "pan") {
        const elementHeight = gl.domElement.clientHeight || 1;
        const targetDistance = camera.position.distanceTo(controls.target);
        const panScale =
          camera instanceof THREE.PerspectiveCamera
            ? (2 * targetDistance * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) / elementHeight
            : targetDistance / elementHeight;
        panAxis.setFromMatrixColumn(camera.matrix, 0).multiplyScalar(-centerDeltaX * panScale * TOUCH_TWO_FINGER_PAN_SPEED);
        panMove.add(panAxis);
        panAxis.setFromMatrixColumn(camera.matrix, 1).multiplyScalar(centerDeltaY * panScale * TOUCH_TWO_FINGER_PAN_SPEED);
        panMove.add(panAxis);
      }

      move.copy(panMove);
      if (gestureIntentRef.current === "pinch") {
        forward.copy(camera.getWorldDirection(forward));
        forward.y = 0;
        if (forward.lengthSq() < 1e-6) {
          targetDir.copy(controls.target).sub(camera.position);
          targetDir.y = 0;
          forward.copy(targetDir);
        }
        if (forward.lengthSq() < 1e-6) return;
        forward.normalize();
        const deltaM = THREE.MathUtils.clamp(
          distanceDeltaPx * TOUCH_PINCH_DOLLY_M_PER_PX,
          -TOUCH_PINCH_DOLLY_MAX_STEP_M,
          TOUCH_PINCH_DOLLY_MAX_STEP_M
        );
        if (Math.abs(deltaM) >= 1e-4) move.addScaledVector(forward, deltaM);
      }
      if (move.lengthSq() < 1e-10) return;
      camera.position.add(move);
      controls.target.add(move);
      controls.update();
    };

    const schedulePinch = () => {
      if (pinchFrameRef.current !== null) return;
      pinchFrameRef.current = requestAnimationFrame(processPinch);
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType !== "touch") return;
      pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      const metrics = pinchMetrics();
      pinchDistanceRef.current = metrics?.distance ?? null;
      pinchCenterRef.current = metrics?.center ?? null;
      if (metrics) {
        gestureStartRef.current = { center: { ...metrics.center }, distance: metrics.distance };
        gestureIntentRef.current = null;
      }
    };

    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType !== "touch" || !pointersRef.current.has(event.pointerId)) return;
      pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      const metrics = pinchMetrics();
      const prevDistance = pinchDistanceRef.current;
      if (!metrics || prevDistance === null) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      schedulePinch();
    };

    const onPointerEnd = (event: PointerEvent) => {
      if (event.pointerType !== "touch") return;
      pointersRef.current.delete(event.pointerId);
      const metrics = pinchMetrics();
      pinchDistanceRef.current = metrics?.distance ?? null;
      pinchCenterRef.current = metrics?.center ?? null;
      if (metrics) {
        gestureStartRef.current = { center: { ...metrics.center }, distance: metrics.distance };
        gestureIntentRef.current = null;
      } else {
        gestureStartRef.current = null;
        gestureIntentRef.current = null;
      }
    };

    const clear = () => {
      if (pinchFrameRef.current !== null) {
        cancelAnimationFrame(pinchFrameRef.current);
        pinchFrameRef.current = null;
      }
      pointersRef.current.clear();
      pinchDistanceRef.current = null;
      pinchCenterRef.current = null;
      gestureStartRef.current = null;
      gestureIntentRef.current = null;
    };

    canvas.addEventListener("pointerdown", onPointerDown, { capture: true });
    canvas.addEventListener("pointermove", onPointerMove, { capture: true, passive: false });
    canvas.addEventListener("pointerup", onPointerEnd, { capture: true });
    canvas.addEventListener("pointercancel", onPointerEnd, { capture: true });
    window.addEventListener("blur", clear);
    return () => {
      canvas.removeEventListener("pointerdown", onPointerDown, { capture: true });
      canvas.removeEventListener("pointermove", onPointerMove, { capture: true });
      canvas.removeEventListener("pointerup", onPointerEnd, { capture: true });
      canvas.removeEventListener("pointercancel", onPointerEnd, { capture: true });
      window.removeEventListener("blur", clear);
      clear();
    };
  }, [camera, controlsRef, gl.domElement]);

  return null;
};

export const TrackpadWheelPan = ({
  controlsRef
}: {
  controlsRef: MutableRefObject<OrbitControlsImpl | null>;
}) => {
  const { camera, gl } = useThree();

  useEffect(() => {
    const canvas = gl.domElement;
    const move = new THREE.Vector3();
    const panAxis = new THREE.Vector3();

    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey) return;
      const controls = controlsRef.current;
      if (!controls) return;
      event.preventDefault();
      event.stopImmediatePropagation();

      const elementHeight = canvas.clientHeight || 1;
      const targetDistance = camera.position.distanceTo(controls.target);
      const panScale =
        camera instanceof THREE.PerspectiveCamera
          ? (2 * targetDistance * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) / elementHeight
          : targetDistance / elementHeight;
      move.set(0, 0, 0);
      panAxis.setFromMatrixColumn(camera.matrix, 0).multiplyScalar(-event.deltaX * panScale * TRACKPAD_WHEEL_PAN_SPEED);
      move.add(panAxis);
      panAxis.setFromMatrixColumn(camera.matrix, 1).multiplyScalar(event.deltaY * panScale * TRACKPAD_WHEEL_PAN_SPEED);
      move.add(panAxis);
      if (move.lengthSq() < 1e-10) return;
      camera.position.add(move);
      controls.target.add(move);
      controls.update();
    };

    canvas.addEventListener("wheel", onWheel, { capture: true, passive: false });
    return () => canvas.removeEventListener("wheel", onWheel, { capture: true });
  }, [camera, controlsRef, gl.domElement]);

  return null;
};
