import * as THREE from "three";
import type { LightFixture, LightingScene, SceneLightState } from "../types";
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

export const getSceneLightState = (
  fixture: LightFixture,
  activeScene?: LightingScene
): SceneLightState => {
  const sceneState = activeScene?.lightStates[fixture.id];
  return {
    enabled: sceneState?.enabled ?? fixture.enabled,
    dimmer: sceneState?.dimmer ?? fixture.dimmer
  };
};

export const lumensToThreeIntensity = (
  fixture: LightFixture,
  activeScene?: LightingScene
) => {
  const state = getSceneLightState(fixture, activeScene);
  if (!state.enabled) return 0;

  const dimmedLumens = fixture.lumens * clamp(state.dimmer, 0, 100) * 0.01;

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

export const lumensToPhysicalPower = (
  fixture: LightFixture,
  activeScene?: LightingScene
) => {
  const state = getSceneLightState(fixture, activeScene);
  if (!state.enabled) return 0;
  return fixture.lumens * clamp(state.dimmer, 0, 100) * 0.01;
};
