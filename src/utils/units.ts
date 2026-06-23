import type { Vec2M, Vec3M } from "../types";

export const mToMm = (meters: number) => Math.round(meters * 1000);

export const mmToM = (millimeters: number) => millimeters / 1000;

export const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export const formatMm = (meters: number) => `${mToMm(meters).toLocaleString("ja-JP")} mm`;

export const cloneProject = <T>(value: T): T => structuredClone(value);

export const vec2 = (x: number, z: number): Vec2M => ({ x, z });

export const vec3 = (x: number, y: number, z: number): Vec3M => ({ x, y, z });

export const degToRad = (deg: number) => (deg * Math.PI) / 180;
