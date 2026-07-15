import { describe, expect, it } from 'vitest';
import {
  cctToLinearRgb,
  cctToXy,
  diffuseReflectance,
  luminanceOf,
  srgbToLinear,
} from '../src/core/color';

describe('CCT → linear RGB', () => {
  it('輝度が 1 に正規化される（全光束 lm 維持）', () => {
    for (const cct of [2700, 3500, 4000, 5000, 6500]) {
      expect(luminanceOf(cctToLinearRgb(cct))).toBeCloseTo(1, 9);
    }
  });

  it('6500K の xy は D65 (0.3127, 0.3290) に近い', () => {
    const { x, y } = cctToXy(6500);
    expect(Math.abs(x - 0.3127)).toBeLessThan(0.01);
    expect(Math.abs(y - 0.329)).toBeLessThan(0.01);
  });

  it('2700K は暖色（R > B）、CCT が上がるほど B/R が単調増加', () => {
    const warm = cctToLinearRgb(2700);
    expect(warm[0]).toBeGreaterThan(warm[2]);
    let prevRatio = -Infinity;
    for (const cct of [2700, 3000, 3500, 4000, 5000, 6500]) {
      const [r, , b] = cctToLinearRgb(cct);
      const ratio = b / r;
      expect(ratio).toBeGreaterThan(prevRatio);
      prevRatio = ratio;
    }
  });

  it('有効域外の CCT はクランプされ、非負 RGB を返す', () => {
    for (const cct of [1000, 30000]) {
      const rgb = cctToLinearRgb(cct);
      for (const c of rgb) expect(c).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('sRGB → linear（反射率変換）', () => {
  it('既知値: 0→0, 1→1, 0.5→約0.2140', () => {
    expect(srgbToLinear(0)).toBe(0);
    expect(srgbToLinear(1)).toBeCloseTo(1, 9);
    expect(srgbToLinear(0.5)).toBeCloseTo(0.2140, 3);
  });

  it('拡散反射率: 明示値が優先、無ければ linear 輝度（sRGB直接使用の禁止）', () => {
    expect(diffuseReflectance({ baseColor: [0.5, 0.5, 0.5], reflectance: 0.7 })).toBe(0.7);
    // sRGB 0.5 グレーの linear 輝度 ≈ 0.214（sRGB値 0.5 をそのまま使うと誤り）
    expect(diffuseReflectance({ baseColor: [0.5, 0.5, 0.5] })).toBeCloseTo(0.214, 2);
  });
});
