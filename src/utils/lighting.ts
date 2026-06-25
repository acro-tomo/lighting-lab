import * as THREE from "three";
import type { LightFixture } from "../types";
import { clamp } from "./units";

export const colorTemperatureToHex = (kelvin: number) => {
  const temp = clamp(kelvin, 1000, 12000) / 100;
  let red: number;
  let green: number;
  let blue: number;

  if (temp <= 66) {
    red = 255;
    green = 99.4708025861 * Math.log(temp) - 161.1195681661;
    blue =
      temp <= 19
        ? 0
        : 138.5177312231 * Math.log(temp - 10) - 305.0447927307;
  } else {
    red = 329.698727446 * Math.pow(temp - 60, -0.1332047592);
    green = 288.1221695283 * Math.pow(temp - 60, -0.0755148492);
    blue = 255;
  }

  return new THREE.Color(
    clamp(red, 0, 255) / 255,
    clamp(green, 0, 255) / 255,
    clamp(blue, 0, 255) / 255
  );
};

export const lumensToThreeIntensity = (fixture: LightFixture): number => {
  if (!fixture.enabled) return 0;

  const dimmedLumens = fixture.lumens * clamp(fixture.dimmer, 0, 100) * 0.01;

  // Three.jsの物理ライト単位は器具形状や露出設定で見え方が変わる。
  // v1では視覚比較の一貫性を優先し、lmを一定係数で表示用強度に変換する。
  const typeFactor =
    fixture.type === "tape"
      ? 0.0048
      : fixture.type === "pendant"
        ? 0.0048
        : fixture.type === "bracket"
          ? 0.0032
          : 0.0062;

  return dimmedLumens * typeFactor;
};

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

export const lumensToPhysicalPower = (fixture: LightFixture): number => {
  if (!fixture.enabled) return 0;
  return fixture.lumens * clamp(fixture.dimmer, 0, 100) * 0.01;
};
