import type { LightFixture } from "../../types";
import type { FloorBounds } from "./roomGeometry";

const LIGHT_EFFECT_MARGIN_M = 1.2;
const REALTIME_SHADOW_LIGHT_LIMIT = 6;
// 昼光ヘミライトの強度。パストレ（Sky環境 0.8 + GI）の昼の明るさに視覚合わせした値で、
// 高度 sin に比例して正午前後が最も明るくなる。
export const DAYLIGHT_FILL_BASE_INTENSITY = 0.3;
export const DAYLIGHT_FILL_ALTITUDE_GAIN = 1.5;
export const DAYLIGHT_FILL_REFERENCE_OPENING_RATIO = 0.12;
export const DAYLIGHT_FILL_MAX_OPENING_SCALE = 2;
const RASTER_BOUNCE_REFERENCE_FLOOR_AREA_M2 = 5 * 4.5;
const RASTER_BOUNCE_LUMEN_DENSITY_KNEE = 5200 / RASTER_BOUNCE_REFERENCE_FLOOR_AREA_M2;
const RASTER_BOUNCE_BASE_INTENSITY = 0.06;
const RASTER_BOUNCE_ADDED_INTENSITY = 0.46;
const RASTER_BOUNCE_MAX_INTENSITY = 0.52;
export const RASTER_BOUNCE_CEILING_FACTOR = 0.64;
export const RASTER_BOUNCE_AMBIENT_RATIO = 0.18;
export const RASTER_BOUNCE_MAX_AMBIENT = 0.075;

export const rasterBounceIntensity = (lumens: number, floorAreaM2: number): number => {
  if (lumens <= 0 || floorAreaM2 <= 0) return 0;
  const lumenDensity = lumens / floorAreaM2;
  const response = 1 - Math.exp(-lumenDensity / RASTER_BOUNCE_LUMEN_DENSITY_KNEE);
  return Math.min(
    RASTER_BOUNCE_MAX_INTENSITY,
    RASTER_BOUNCE_BASE_INTENSITY + response * RASTER_BOUNCE_ADDED_INTENSITY
  );
};

// 誤操作で建物外へ飛んだ照明が露出やシャドウマップを支配しないよう、物理発光だけ抑える。
const lightWithinBounds = (fixture: LightFixture, bounds: FloorBounds): boolean => {
  const minX = bounds.centerX - bounds.sizeX / 2 - LIGHT_EFFECT_MARGIN_M;
  const maxX = bounds.centerX + bounds.sizeX / 2 + LIGHT_EFFECT_MARGIN_M;
  const minZ = bounds.centerZ - bounds.sizeZ / 2 - LIGHT_EFFECT_MARGIN_M;
  const maxZ = bounds.centerZ + bounds.sizeZ / 2 + LIGHT_EFFECT_MARGIN_M;
  return (
    fixture.position.x >= minX &&
    fixture.position.x <= maxX &&
    fixture.position.z >= minZ &&
    fixture.position.z <= maxZ
  );
};

export const effectiveLightIdSet = (lights: LightFixture[], bounds: FloorBounds) =>
  new Set(
    lights
      .filter((fixture) => fixture.enabled && fixture.dimmer > 0 && lightWithinBounds(fixture, bounds))
      .map((fixture) => fixture.id)
  );

export const realtimeShadowLightIdSet = (lights: LightFixture[], effectiveLightIds: Set<string>) =>
  new Set(
    lights
      .filter((fixture) => effectiveLightIds.has(fixture.id) && fixture.castsShadow)
      .sort((a, b) => b.lumens * b.dimmer - a.lumens * a.dimmer)
      .slice(0, REALTIME_SHADOW_LIGHT_LIMIT)
      .map((fixture) => fixture.id)
  );
