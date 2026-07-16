import { z } from "zod";
import type { LightFixture, Project } from "../types";
import { DEFAULT_CAMERA_EXPOSURE } from "../rendering/exposure";
import { fitCameraToProject, shouldFitDefaultCamera } from "../utils/cameraFit";
import { normalizeCeilingMountedFixture } from "../utils/fixtureMounting";

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
const voidSideSchema = z.enum(["north", "south", "west", "east"]);

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

const voidSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    center: vec2Schema,
    size: vec2Schema,
    openSides: z.array(voidSideSchema).optional(),
    floor: floorSchema
  })
  .passthrough();

// 幾何の根幹（id/start/end 等）以外は、過去JSONに無かった可能性を考えて default で埋める。
const wallSchema = z
  .object({
    id: z.string(),
    name: z.string().default("壁"),
    start: vec2Schema,
    end: vec2Schema,
    thicknessM: z.number().default(0.12),
    heightM: z.number().default(2.4),
    materialId: z.string().default("wall-white"),
    innerSide: z.enum(["left", "right"]).optional(),
    kind: z.enum(["wall", "half", "railing"]).optional(),
    floor: floorSchema
  })
  .passthrough();

const windowSchema = z
  .object({
    id: z.string(),
    name: z.string().default("窓"),
    wallId: z.string(),
    centerRatio: z.number(),
    widthM: z.number(),
    heightM: z.number(),
    sillHeightM: z.number().default(0),
    hasGlass: z.boolean().default(true),
    style: z.enum(["window", "opening", "door"]).optional(),
    floor: floorSchema
  })
  .passthrough();

const furnitureTypeSchema = z.enum([
  "roundTable",
  "rectTable",
  "chair",
  "sofa",
  "bed",
  "kitchen",
  "cupboard",
  "fridge",
  "tv",
  "shelf",
  "counter",
  "rug",
  "stair",
  "washer",
  "washstand",
  "toilet",
  "bathtub",
  "desk",
  "shoeCabinet",
  "box"
]);

const furnitureSchema = z
  .object({
    id: z.string(),
    name: z.string().default("家具"),
    type: furnitureTypeSchema,
    position: vec3Schema,
    size: vec3Schema,
    rotationYDeg: z.number().default(0),
    materialId: z.string().default("fabric-warm-gray"),
    color: z.string().optional(),
    roughness: z.number().optional(),
    metalness: z.number().optional(),
    castsShadow: z.boolean().default(true),
    floor: floorSchema
  })
  .passthrough();

const lightTypeSchema = z.enum(["downlight", "spotlight", "pendant", "bracket", "tape"]);

// 天井付器具の mountHeightM/position.y は transform 後に normalizeCeilingMountedFixture が再計算する。
const lightSchema = z
  .object({
    id: z.string(),
    name: z.string().default("照明"),
    type: lightTypeSchema,
    model: z.string().optional(),
    position: vec3Schema,
    mountHeightM: z.number().default(2.4),
    rotationDeg: vec3Schema.default({ x: -90, y: 0, z: 0 }),
    target: vec3Schema.optional(),
    lumens: z.number(),
    colorTemperatureK: z.number().default(2700),
    dimmer: z.number().default(80),
    enabled: z.boolean().default(true),
    beamAngleDeg: z.number().default(60),
    penumbra: z.number().default(0.6),
    castsShadow: z.boolean().default(true),
    note: z.string().default(""),
    lengthM: z.number().optional(),
    cordLengthM: z.number().optional(),
    floor: floorSchema
  })
  .passthrough();

// 既定値は store/projectStore.ts の DEFAULT_DAYLIGHT と一致させる。
const daylightSchema = z
  .object({
    enabled: z.boolean().default(true),
    month: z.number().default(10),
    day: z.number().default(15),
    hour: z.number().default(14),
    northOffsetDeg: z.number().default(0),
    latitudeDeg: z.number().default(35)
  })
  .passthrough();

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
  exposure: DEFAULT_CAMERA_EXPOSURE,
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
    walls: z.array(wallSchema),
    // 旧JSONには windows が無いことがあるため default([])。
    windows: z.array(windowSchema).default([]),
    furniture: z.array(furnitureSchema),
    voids: z.array(voidSchema),
    lights: z.array(lightSchema),
    camera: cameraSchema.optional(),
    daylight: daylightSchema.optional(),
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
  const migratedLights = lightStates
    ? lights.map((light) => {
        const state = lightStates[light.id as string];
        return state ? { ...light, enabled: state.enabled, dimmer: state.dimmer } : light;
      })
    : lights;

  const project = { ...rest, lights: migratedLights, camera: nextCamera } as Project;
  const nextLights = project.lights.map((light) =>
    normalizeCeilingMountedFixture(project, light as LightFixture)
  );
  const fittedCamera = shouldFitDefaultCamera(project, nextCamera)
    ? fitCameraToProject(project, nextCamera)
    : nextCamera;

  return { ...project, lights: nextLights, camera: fittedCamera };
});
