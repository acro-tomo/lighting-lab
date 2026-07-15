/**
 * 照度グリッド計算（純粋・レンダラー非依存）。
 * 表示（three メッシュ化・凡例）は app/heatmap.ts が担う。
 */
import { boundingBox, pointInPolygon } from '../core/room';
import type { Furniture, Lux, SceneModel, Vec2 } from '../core/types';
import { vec3 } from '../core/vec3';
import {
  illuminanceAt,
  type OcclusionTester,
  type PhotometricLight,
} from './illuminance';

export const GRID_SPACING = 0.15;

/** 回転を考慮した家具内部判定（計測面高さ h の点） */
export function insideFurniture(p: Vec2, h: number, item: Furniture): boolean {
  if (h < item.elevation || h > item.elevation + item.size.h) return false;
  const rad = (-item.rotationDeg * Math.PI) / 180;
  const dx = p.x - item.position.x;
  const dy = p.y - item.position.y;
  const lx = dx * Math.cos(rad) - dy * Math.sin(rad);
  const ly = dx * Math.sin(rad) + dy * Math.cos(rad);
  return Math.abs(lx) <= item.size.w / 2 && Math.abs(ly) <= item.size.d / 2;
}

export interface IlluminanceGrid {
  origin: Vec2;
  spacing: number;
  cols: number;
  rows: number;
  /** 行優先。部屋外・家具内部のマスク点は NaN */
  values: Float32Array;
  min: Lux;
  max: Lux;
  mean: Lux;
}

export function computeIlluminanceGrid(
  model: SceneModel,
  lights: readonly PhotometricLight[],
  occlusion: OcclusionTester,
  height: number,
  spacing = GRID_SPACING,
): IlluminanceGrid {
  const { min, max } = boundingBox(model.floorPlan.outline);
  const cols = Math.max(1, Math.ceil((max.x - min.x) / spacing) + 1);
  const rows = Math.max(1, Math.ceil((max.y - min.y) / spacing) + 1);
  const values = new Float32Array(cols * rows).fill(Number.NaN);
  let vMin = Infinity;
  let vMax = -Infinity;
  let sum = 0;
  let count = 0;

  for (let row = 0; row < rows; row++) {
    const y = min.y + row * spacing;
    for (let col = 0; col < cols; col++) {
      const x = min.x + col * spacing;
      const p = { x, y };
      if (!pointInPolygon(p, model.floorPlan.outline)) continue;
      if (model.furniture.some((f) => insideFurniture(p, height, f))) continue;
      const result = illuminanceAt(
        { position: vec3(x, height, -y), normal: vec3(0, 1, 0) },
        lights,
        occlusion,
      );
      values[row * cols + col] = result.total;
      vMin = Math.min(vMin, result.total);
      vMax = Math.max(vMax, result.total);
      sum += result.total;
      count++;
    }
  }

  return {
    origin: { x: min.x, y: min.y },
    spacing,
    cols,
    rows,
    values,
    min: count > 0 ? vMin : 0,
    max: count > 0 ? vMax : 0,
    mean: count > 0 ? sum / count : 0,
  };
}

/** 固定カラースケール（0→max）。青→シアン→緑→黄→赤。自動正規化は行わない */
const STOPS: [number, [number, number, number]][] = [
  [0.0, [10, 18, 68]],
  [0.2, [28, 92, 168]],
  [0.4, [24, 160, 152]],
  [0.6, [96, 196, 72]],
  [0.8, [232, 208, 48]],
  [1.0, [224, 60, 40]],
];

export function lxToColor(value: Lux, max: number): [number, number, number] {
  const t = Math.max(0, Math.min(1, value / max));
  for (let i = 1; i < STOPS.length; i++) {
    const [t1, c1] = STOPS[i]!;
    const [t0, c0] = STOPS[i - 1]!;
    if (t <= t1) {
      const k = (t - t0) / (t1 - t0);
      return [
        Math.round(c0[0] + (c1[0] - c0[0]) * k),
        Math.round(c0[1] + (c1[1] - c0[1]) * k),
        Math.round(c0[2] + (c1[2] - c0[2]) * k),
      ];
    }
  }
  return STOPS[STOPS.length - 1]![1];
}
