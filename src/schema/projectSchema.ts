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

// 下げ天井 / 下げ床は同形（矩形領域＋下がり量）。後方互換のため optional。
const zoneSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    center: vec2Schema,
    size: vec2Schema,
    dropM: z.number()
  })
  .passthrough();

const ceilingZoneSchema = zoneSchema;
const floorZoneSchema = zoneSchema;

export const projectSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    room: z.object({
      widthM: z.number().positive(),
      depthM: z.number().positive(),
      ceilingHeightM: z.number().positive()
    }),
    materials: z.array(z.object({ id: z.string(), name: z.string() }).passthrough()).min(1),
    walls: z.array(z.object({ id: z.string(), start: vec2Schema, end: vec2Schema }).passthrough()),
    furniture: z.array(z.object({ id: z.string(), position: vec3Schema, size: vec3Schema }).passthrough()),
    lights: z.array(z.object({ id: z.string(), position: vec3Schema, lumens: z.number() }).passthrough()),
    lightingScenes: z.array(z.object({ id: z.string(), name: z.string() }).passthrough()).min(1),
    cameraViews: z.array(z.object({ id: z.string(), name: z.string(), position: vec3Schema, target: vec3Schema }).passthrough()).min(1),
    ceilingZones: z.array(ceilingZoneSchema).optional(),
    floorZones: z.array(floorZoneSchema).optional(),
    activeSceneId: z.string(),
    activeCameraViewId: z.string()
  })
  .passthrough();
