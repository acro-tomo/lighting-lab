import * as THREE from "three";
import { cctToLinearRgb } from "../../photometric/src/core/color";
import { threeSpotPeakCandela } from "../../photometric/src/photometry/distribution";
import type { LightFixture } from "../types";
import { clamp } from "./units";

export const colorTemperatureToLinearColor = (kelvin: number): THREE.Color => {
  const [r, g, b] = cctToLinearRgb(kelvin);
  return new THREE.Color(r, g, b);
};

export const lumensToSpotlightPeakCandela = (
  lumens: number,
  fullAngleDeg: number,
  penumbra: number
): number =>
  threeSpotPeakCandela(
    lumens,
    clamp(fullAngleDeg, 1, 180),
    clamp(penumbra, 0, 1)
  );

// ブラケット(壁付)の点光源を取付壁から室内側へ離す水平オフセット。
// 壁に密着した点光源は decay=2 の逆二乗で至近の壁を白飛びさせるため、
// target（照射方向＝室内向き）へ offM だけずらす。target 無指定なら 0。
// 編集ラスターと常駐パストレで同じ式を使い WYSIWYG を保つ。
export const bracketRoomwardOffset = (
  fixture: LightFixture,
  offM: number
): { x: number; z: number } => {
  if (!fixture.target) return { x: 0, z: 0 };
  const dx = fixture.target.x - fixture.position.x;
  const dz = fixture.target.z - fixture.position.z;
  const len = Math.hypot(dx, dz);
  if (len < 1e-6) return { x: 0, z: 0 };
  return { x: (dx / len) * offM, z: (dz / len) * offM };
};

// テープライト(面光源)の発光面の高さと、発光バー形状から照射方向へ浮かせる距離。
// バー形状(厚み0.018m)と同位置に発光面を置くとパストレで自身のバーに遮られるため、
// 照射方向へ少しだけ前に出す。編集ラスター(fixtureBody)とPNG書き出し(pathTracer/lights)で
// 同じ値を使い WYSIWYG を保つ。
export const TAPE_LIGHT_HEIGHT_M = 0.02;
export const TAPE_LIGHT_EMIT_OFFSET_M = 0.03;

// テープの発光面(RectAreaLight系)の向き。RectAreaLight はローカル -Z へ発光するため、
// -Z を target への方向(無指定なら真下=棚下・壁裏の間接想定)に合わせる。
// setFromUnitVectors は水平・真下方向に対してローカルX(バー長手)を保つので、
// 発光バー形状(X軸沿い)と発光面の幅方向が一致する。
export const tapeLightOrientation = (
  fixture: LightFixture
): { direction: THREE.Vector3; quaternion: THREE.Quaternion } => {
  const direction = fixture.target
    ? new THREE.Vector3(
        fixture.target.x - fixture.position.x,
        fixture.target.y - fixture.position.y,
        fixture.target.z - fixture.position.z
      )
    : new THREE.Vector3(0, -1, 0);
  if (direction.lengthSq() < 1e-6) direction.set(0, -1, 0);
  direction.normalize();
  const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), direction);
  return { direction, quaternion };
};

export const lumensToPhysicalPower = (fixture: LightFixture): number => {
  if (!fixture.enabled) return 0;
  return fixture.lumens * clamp(fixture.dimmer, 0, 100) * 0.01;
};
