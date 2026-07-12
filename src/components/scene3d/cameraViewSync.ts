import { useFrame, useThree } from "@react-three/fiber";
import type { MutableRefObject } from "react";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { useProjectStore } from "../../store/projectStore";
import type { ProjectCamera } from "../../types";

export const CameraViewSync = ({
  view,
  controlsRef,
  floorLevelM,
  ceilingHeightM
}: {
  view: ProjectCamera;
  controlsRef: MutableRefObject<OrbitControlsImpl | null>;
  floorLevelM: number;
  ceilingHeightM: number;
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

  // 矢印キーは常に視点(カメラ)操作。
  //   矢印        : 視点の前後左右移動（注視点も同量動かし向きは保つ）
  //   Shift+左右  : 位置はそのままで視線方向を左右に旋回（首振り）
  //   Shift+上下  : 位置はそのままで見上げ/見下ろし（ピッチ）
  //   Option+上下 : 向きはそのままで上下に移動（昇降）
  // オブジェクトの移動/回転は3Dドラッグ・Inspector側に集約する。
  const MOVE_M = 0.4; // 矢印1回の移動量(m)
  const TURN_DEG = 5; // Shift+左右/上下1回の旋回・ピッチ角(度)

  // macOS のキーリピート中に Shift を先に離すと、続く repeat keydown で
  // event.shiftKey=false が報告されることがある。これを補正するため修飾キーの
  // 物理押下状態を別途追跡し、「イベントが落としても ref でカバー」する。
  // Shift が優先: shiftDown=true なら必ず pitch 側に入り、昇降には落ちない。
  const modsRef = useRef({ shift: false, alt: false });

  useEffect(() => {
    const onMod = (e: KeyboardEvent) => {
      // 修飾キー自身(Shift/Alt)の押下/解放だけで追跡する。矢印など非修飾イベントの
      // e.shiftKey をコピーすると、キーリピート中に shiftKey=false が混じった瞬間に
      // 追跡値が false へ落ち、補正(下の shiftDown OR)が無意味になるため対象を限定する。
      const down = e.type === "keydown";
      if (e.key === "Shift") modsRef.current.shift = down;
      else if (e.key === "Alt") modsRef.current.alt = down;
    };
    const onBlur = () => {
      // フォーカス喪失時は keyup が届かないため残留をリセットする
      // (ShortcutGuide.tsx と同じ作法)
      modsRef.current = { shift: false, alt: false };
    };
    window.addEventListener("keydown", onMod);
    window.addEventListener("keyup", onMod);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onMod);
      window.removeEventListener("keyup", onMod);
      window.removeEventListener("blur", onBlur);
    };
  }, []); // mount/unmount のみ。modsRef は ref なので依存不要。

  useEffect(() => {
    // ピッチ: target をカメラ位置まわりに上下回転。方位(水平向き)と距離を保ち±80°でクランプ。
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

      // Shift は event.shiftKey を最優先し、キーリピートで落ちた時だけ ref で補正する。
      // Alt は矢印イベント自身の状態だけを見る。ref の残留で Option+上下扱いにしない。
      const shiftDown = event.shiftKey || modsRef.current.shift;
      const altDown = !shiftDown && event.altKey;

      // Shift が Alt に優先（ユーザーのメンタルモデル: Shift=見る / Option=昇降）。
      // shiftDown=true なら Alt 状態や通常移動へ落ちず、必ず pitch/yaw 側に入る。

      // Shift+左右: 視線方向を左右に旋回（首振り）。
      if (shiftDown && (left || right)) {
        const angle = THREE.MathUtils.degToRad(left ? TURN_DEG : -TURN_DEG);
        const dir = controls.target.clone().sub(camera.position);
        dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), angle);
        controls.target.copy(camera.position).add(dir);
        controls.update();
        return;
      }

      // Shift+上下: 見上げ/見下ろし（ピッチ）。水平方位と距離を保ち±80°でクランプ。
      if (shiftDown && up) {
        pitchView(THREE.MathUtils.degToRad(TURN_DEG));
        return;
      }
      if (shiftDown && down) {
        pitchView(THREE.MathUtils.degToRad(-TURN_DEG));
        return;
      }

      const forward = camera.getWorldDirection(new THREE.Vector3());
      forward.y = 0;
      if (forward.lengthSq() < 1e-6) forward.set(0, 0, -1);
      forward.normalize();
      const rightVec = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

      const move = new THREE.Vector3();
      // Option+上下: 昇降。shiftDown=false のときだけここに到達するので排他は順序で担保済み。
      // 天井を抜けるほど上げると「見上げ」ではなく視点高度の破綻に見えるため、
      // カメラ位置だけを室内の自然な高さに収め、target は実際に動けた量だけ追従させる。
      if (altDown && (up || down)) {
        const minEyeY = floorLevelM + 0.35;
        const maxEyeY = floorLevelM + Math.max(0.6, ceilingHeightM - 0.05);
        const nextY = THREE.MathUtils.clamp(camera.position.y + (up ? MOVE_M : -MOVE_M), minEyeY, maxEyeY);
        move.set(0, nextY - camera.position.y, 0);
      }
      else if (left)  move.copy(rightVec).multiplyScalar(-MOVE_M);
      else if (right) move.copy(rightVec).multiplyScalar(MOVE_M);
      else move.copy(forward).multiplyScalar(up ? MOVE_M : -MOVE_M); // 前後

      if (move.lengthSq() < 1e-10) return;
      camera.position.add(move);
      controls.target.add(move);
      controls.update();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [camera, ceilingHeightM, controlsRef, floorLevelM]);

  return null;
};
