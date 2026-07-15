import { describe, expect, it } from 'vitest';
import {
  ceilingHeightAt,
  ensureCcw,
  pointInPolygon,
  signedArea,
  wallSegments,
} from '../src/core/room';
import type { FloorPlan, Vec2 } from '../src/core/types';

const square: Vec2[] = [
  { x: 0, y: 0 },
  { x: 4, y: 0 },
  { x: 4, y: 3 },
  { x: 0, y: 3 },
];

describe('部屋形状ジオメトリ', () => {
  it('符号付き面積と CCW 正規化', () => {
    expect(signedArea(square)).toBeCloseTo(12, 9);
    const cw = [...square].reverse();
    expect(signedArea(cw)).toBeCloseTo(-12, 9);
    expect(signedArea(ensureCcw(cw))).toBeCloseTo(12, 9);
  });

  it('点内包判定（L字型を含む）', () => {
    expect(pointInPolygon({ x: 2, y: 1.5 }, square)).toBe(true);
    expect(pointInPolygon({ x: 5, y: 1.5 }, square)).toBe(false);
    const lShape: Vec2[] = [
      { x: 0, y: 0 },
      { x: 6, y: 0 },
      { x: 6, y: 3 },
      { x: 3, y: 3 },
      { x: 3, y: 6 },
      { x: 0, y: 6 },
    ];
    expect(pointInPolygon({ x: 1, y: 5 }, lShape)).toBe(true);
    expect(pointInPolygon({ x: 5, y: 5 }, lShape)).toBe(false);
  });

  it('吹抜けオーバーライドで天井高が変わる', () => {
    const plan: FloorPlan = {
      outline: square,
      ceilingHeight: 2.4,
      ceilingOverrides: [
        {
          polygon: [
            { x: 0, y: 0 },
            { x: 2, y: 0 },
            { x: 2, y: 3 },
            { x: 0, y: 3 },
          ],
          height: 5.0,
        },
      ],
    };
    expect(ceilingHeightAt(plan, { x: 1, y: 1 })).toBe(5.0);
    expect(ceilingHeightAt(plan, { x: 3, y: 1 })).toBe(2.4);
  });

  it('壁セグメントは頂点数と同数で、吹抜けに面した壁は高くなる', () => {
    const plan: FloorPlan = {
      outline: square,
      ceilingHeight: 2.4,
      ceilingOverrides: [
        {
          polygon: [
            { x: 0, y: 0 },
            { x: 2, y: 0 },
            { x: 2, y: 3 },
            { x: 0, y: 3 },
          ],
          height: 5.0,
        },
      ],
    };
    const segments = wallSegments(plan);
    expect(segments).toHaveLength(4);
    // 左辺 (x=0) の壁は吹抜け領域に接する → 高さ 5.0
    const left = segments.find((s) => s.a.x === 0 && s.b.x === 0);
    expect(left?.height).toBe(5.0);
  });
});
