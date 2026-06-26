import { z } from "zod";

const vec2Schema = z.object({
  x: z.number(),
  z: z.number()
});

const vec3Schema = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number()
});

// 階タグ。undefined = 1階（後方互換）。
const floorSchema = z.union([z.literal(1), z.literal(2)]).optional();

const backgroundPlanSchema = z
  .object({
    dataUrl: z.string(),
    fileName: z.string(),
    kind: z.enum(["image", "pdf"])
  })
  .passthrough();

// 下げ天井 / 下げ床は同形（矩形領域＋下がり量）。後方互換のため optional。
const zoneSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    center: vec2Schema,
    size: vec2Schema,
    dropM: z.number(),
    floor: floorSchema
  })
  .passthrough();

const ceilingZoneSchema = zoneSchema;
const floorZoneSchema = zoneSchema;

const cameraSchema = z
  .object({
    position: vec3Schema,
    target: vec3Schema,
    fov: z.number(),
    exposure: z.number(),
    resolutionWidth: z.number()
  })
  .passthrough();

// 旧 cameraView 形（id/name 付き）。移行時に position/target/fov/exposure/resolutionWidth を拾う。
const legacyCameraViewSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    position: vec3Schema,
    target: vec3Schema,
    fov: z.number(),
    exposure: z.number(),
    resolutionWidth: z.number()
  })
  .passthrough();

// 旧 lightingScene 形（lightStates で各ライトを上書きしていた）。移行時に焼き込む。
const legacyLightingSceneSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    lightStates: z
      .record(z.string(), z.object({ enabled: z.boolean(), dimmer: z.number() }).passthrough())
      .optional()
  })
  .passthrough();

const DEFAULT_CAMERA = {
  position: { x: 1.8, y: 2.35, z: 3.05 },
  target: { x: -0.35, y: 0.72, z: -0.35 },
  fov: 64,
  exposure: 1.2,
  resolutionWidth: 1600
} as const;

const baseProjectSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    room: z
      .object({
        widthM: z.number().positive(),
        depthM: z.number().positive(),
        ceilingHeightM: z.number().positive(),
        floorLevelM: z.number().min(0).optional()
      })
      .passthrough(),
    materials: z.array(z.object({ id: z.string(), name: z.string() }).passthrough()).min(1),
    walls: z.array(
      z
        .object({
          id: z.string(),
          start: vec2Schema,
          end: vec2Schema,
          innerSide: z.enum(["left", "right"]).optional(),
          kind: z.enum(["wall", "half", "railing"]).optional(),
          floor: floorSchema
        })
        .passthrough()
    ),
    furniture: z.array(
      z.object({ id: z.string(), position: vec3Schema, size: vec3Schema, floor: floorSchema }).passthrough()
    ),
    lights: z.array(
      z.object({ id: z.string(), position: vec3Schema, lumens: z.number(), floor: floorSchema }).passthrough()
    ),
    camera: cameraSchema.optional(),
    ceilingZones: z.array(ceilingZoneSchema).optional(),
    floorZones: z.array(floorZoneSchema).optional(),
    backgroundPlan: backgroundPlanSchema.optional(),
    backgroundPlan2: backgroundPlanSchema.optional(),
    activeFloor: floorSchema,
    showCeiling: z.boolean().optional(),
    // 後方互換のためだけに受理する旧フィールド（移行後に破棄）。
    lightingScenes: z.array(legacyLightingSceneSchema).optional(),
    cameraViews: z.array(legacyCameraViewSchema).optional(),
    activeSceneId: z.string().optional(),
    activeCameraViewId: z.string().optional()
  })
  .passthrough();

// 旧JSON（lightingScenes/cameraViews/activeSceneId/activeCameraViewId）を新形へ正規化する。
// - camera: activeCameraViewId 一致の旧view → cameraViews[0] → 既定 の順で補完。
// - 照明: activeSceneId 一致の旧scene の lightStates を各 fixture.enabled/dimmer へ焼き込む。
// - 旧フィールドは破棄する。
export const projectSchema = baseProjectSchema.transform((raw) => {
  const {
    lightingScenes,
    cameraViews,
    activeSceneId,
    activeCameraViewId,
    camera,
    lights,
    ...rest
  } = raw;

  const resolvedCamera =
    camera ??
    cameraViews?.find((view) => view.id === activeCameraViewId) ??
    cameraViews?.[0] ??
    DEFAULT_CAMERA;
  const nextCamera = {
    position: resolvedCamera.position,
    target: resolvedCamera.target,
    fov: resolvedCamera.fov,
    exposure: resolvedCamera.exposure,
    resolutionWidth: resolvedCamera.resolutionWidth
  };

  const activeScene =
    lightingScenes?.find((scene) => scene.id === activeSceneId) ?? lightingScenes?.[0];
  const lightStates = activeScene?.lightStates;
  const nextLights = lightStates
    ? lights.map((light) => {
        const state = lightStates[light.id as string];
        return state ? { ...light, enabled: state.enabled, dimmer: state.dimmer } : light;
      })
    : lights;

  return { ...rest, lights: nextLights, camera: nextCamera };
});
