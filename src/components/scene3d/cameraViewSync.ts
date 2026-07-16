import { useFrame, useThree } from "@react-three/fiber";
import type { MutableRefObject } from "react";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { useProjectStore } from "../../store/projectStore";
import type { ProjectCamera } from "../../types";

export const CameraViewSync = ({
  view,
  controlsRef
}: {
  view: ProjectCamera;
  controlsRef: MutableRefObject<OrbitControlsImpl | null>;
}) => {
  const { camera, gl } = useThree();

  // 2D平面図へカメラ現在地を流すためのスロットル状態。毎フレームstoreに書くと
  // 購読側(Plan2D)が毎フレーム再描画されるので、時間と移動量の両方で間引く。
  const liveEmitRef = useRef({ t: 0, x: 0, z: 0, tx: 0, tz: 0 });
  useFrame(() => {
    const now = performance.now();
    if (now - liveEmitRef.current.t < 100) return;
    const controls = controlsRef.current;
    let tx: number;
    let tz: number;
    if (controls) {
      tx = controls.target.x;
      tz = controls.target.z;
    } else {
      // OrbitControls未取得時はカメラ前方ベクトルを投影した点を注視点相当とする。
      const forward = camera.getWorldDirection(new THREE.Vector3());
      tx = camera.position.x + forward.x;
      tz = camera.position.z + forward.z;
    }
    const last = liveEmitRef.current;
    const moved =
      Math.abs(camera.position.x - last.x) > 0.01 ||
      Math.abs(camera.position.z - last.z) > 0.01 ||
      Math.abs(tx - last.tx) > 0.01 ||
      Math.abs(tz - last.tz) > 0.01;
    if (!moved) return;
    liveEmitRef.current = { t: now, x: camera.position.x, z: camera.position.z, tx, tz };
    useProjectStore.getState().setLiveCamera({ x: camera.position.x, z: camera.position.z, tx, tz });
  });

  // project.camera を初期視点として適用する。家具移動などでプロジェクトが clone され
  // camera オブジェクト参照が変わっても、座標値が同じなら依存配列が変化せず（＝視点は
  // ユーザーのOrbit操作のまま）リセットされない。カメラ値が実際に変わった時だけ適用する。
  useEffect(() => {
    camera.position.set(view.position.x, view.position.y, view.position.z);
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.fov = view.fov;
      camera.updateProjectionMatrix();
    }
    controlsRef.current?.target.set(view.target.x, view.target.y, view.target.z);
    controlsRef.current?.update();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    camera,
    controlsRef,
    view.position.x,
    view.position.y,
    view.position.z,
    view.target.x,
    view.target.y,
    view.target.z,
    view.fov
  ]);

  useEffect(() => {
    gl.toneMappingExposure = view.exposure;
  }, [gl, view.exposure]);

  const TURN_DEG = 5;
  const CAMERA_MOVE_M = 0.25;

  useEffect(() => {
    const moveCamera = (move: THREE.Vector3) => {
      const controls = controlsRef.current;
      if (!controls) return;
      camera.position.add(move);
      controls.target.add(move);
      controls.update();
    };

    const moveHorizontally = (distance: number) => {
      const controls = controlsRef.current;
      if (!controls) return;
      const forward = controls.target.clone().sub(camera.position);
      forward.y = 0;
      if (forward.lengthSq() < 1e-6) return;
      moveCamera(forward.normalize().multiplyScalar(distance));
    };

    const pitchView = (delta: number) => {
      const controls = controlsRef.current;
      if (!controls) return;
      const dir = controls.target.clone().sub(camera.position);
      const len = dir.length();
      if (len < 1e-6) return;
      const horiz = Math.hypot(dir.x, dir.z);
      const MAX_PITCH = THREE.MathUtils.degToRad(80);
      const pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, Math.atan2(dir.y, horiz) + delta));
      const hx = horiz > 1e-6 ? dir.x / horiz : 0;
      const hz = horiz > 1e-6 ? dir.z / horiz : -1;
      const cos = Math.cos(pitch) * len;
      controls.target.set(
        camera.position.x + hx * cos,
        camera.position.y + Math.sin(pitch) * len,
        camera.position.z + hz * cos
      );
      controls.update();
    };

    const onKey = (event: KeyboardEvent) => {
      const controls = controlsRef.current;
      if (!controls) return;
      const el = event.target as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || el?.isContentEditable) return;
      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
      event.preventDefault();

      const left = event.key === "ArrowLeft";
      const right = event.key === "ArrowRight";
      const up = event.key === "ArrowUp";
      const down = event.key === "ArrowDown";
      const turn = THREE.MathUtils.degToRad(TURN_DEG);

      if (event.shiftKey) {
        if (up || down) {
          moveHorizontally(up ? CAMERA_MOVE_M : -CAMERA_MOVE_M);
          return;
        }

        const forward = controls.target.clone().sub(camera.position);
        forward.y = 0;
        if (forward.lengthSq() < 1e-6) return;
        const sideways = forward.normalize().cross(new THREE.Vector3(0, 1, 0));
        moveCamera(sideways.multiplyScalar(left ? -CAMERA_MOVE_M : CAMERA_MOVE_M));
        return;
      }

      if (event.altKey) {
        if (left || right) {
          controls.setAzimuthalAngle(controls.getAzimuthalAngle() + (left ? turn : -turn));
        } else {
          moveCamera(new THREE.Vector3(0, up ? CAMERA_MOVE_M : -CAMERA_MOVE_M, 0));
        }
        return;
      }

      if (left || right) {
        const dir = controls.target.clone().sub(camera.position);
        dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), left ? turn : -turn);
        controls.target.copy(camera.position).add(dir);
        controls.update();
        return;
      }

      pitchView(up ? turn : -turn);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [camera, controlsRef]);

  return null;
};
