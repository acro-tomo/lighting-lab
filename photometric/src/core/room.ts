/**
 * 部屋形状（2D多角形＋天井高）の幾何ユーティリティ。
 * 壁・床・天井のメッシュ生成（render/）と照度グリッドのマスク判定（photometry 側）が
 * 同じ関数を使う。
 */
import type { FloorPlan, Meters, Vec2 } from './types';

/** 符号付き面積。正 = 反時計回り */
export function signedArea(polygon: readonly Vec2[]): number {
  let area = 0;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]!;
    const b = polygon[(i + 1) % polygon.length]!;
    area += a.x * b.y - b.x * a.y;
  }
  return area / 2;
}

/** 反時計回りに正規化した複製を返す */
export function ensureCcw(polygon: readonly Vec2[]): Vec2[] {
  return signedArea(polygon) >= 0 ? [...polygon] : [...polygon].reverse();
}

/** 点内包判定（交差数法）。境界上の挙動は未規定でよい（グリッド間隔0.1m未満の誤差） */
export function pointInPolygon(p: Vec2, polygon: readonly Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!;
    const b = polygon[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

export interface WallSegment {
  a: Vec2;
  b: Vec2;
  /** 壁の高さ [m]。両端の天井高のうち高い方 */
  height: Meters;
}

/** ある平面位置での天井高。overrides は後勝ち */
export function ceilingHeightAt(plan: FloorPlan, p: Vec2): Meters {
  let height = plan.ceilingHeight;
  for (const override of plan.ceilingOverrides) {
    if (pointInPolygon(p, override.polygon)) height = override.height;
  }
  return height;
}

/** 外周から壁セグメント列を得る */
export function wallSegments(plan: FloorPlan): WallSegment[] {
  const outline = ensureCcw(plan.outline);
  const segments: WallSegment[] = [];
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i]!;
    const b = outline[(i + 1) % outline.length]!;
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    // 壁面直近内側の天井高を採用（吹抜けに面した壁はそこまで立ち上げる）
    const height = Math.max(ceilingHeightAt(plan, mid), plan.ceilingHeight);
    segments.push({ a, b, height });
  }
  return segments;
}

/** 外接矩形 */
export function boundingBox(polygon: readonly Vec2[]): { min: Vec2; max: Vec2 } {
  const min = { x: Infinity, y: Infinity };
  const max = { x: -Infinity, y: -Infinity };
  for (const p of polygon) {
    min.x = Math.min(min.x, p.x);
    min.y = Math.min(min.y, p.y);
    max.x = Math.max(max.x, p.x);
    max.y = Math.max(max.y, p.y);
  }
  return { min, max };
}
