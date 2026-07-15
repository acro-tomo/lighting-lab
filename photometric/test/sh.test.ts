import { describe, expect, it } from 'vitest';
import {
  evalIrradiance,
  fibonacciSphere,
  projectRadianceSamples,
  shBasis,
} from '../src/photometry/sh';
import { vec3 } from '../src/core/vec3';

describe('球面調和（SH2次）', () => {
  it('基底の直交正規性（数値積分）', () => {
    const dirs = fibonacciSphere(4096);
    const weight = (4 * Math.PI) / dirs.length;
    // Y0·Y0 = 1, Y0·Y2 = 0 など代表ペアを確認
    let y00 = 0;
    let y02 = 0;
    let y66 = 0;
    for (const d of dirs) {
      const b = shBasis(d);
      y00 += b[0]! * b[0]! * weight;
      y02 += b[0]! * b[2]! * weight;
      y66 += b[6]! * b[6]! * weight;
    }
    expect(y00).toBeCloseTo(1, 2);
    expect(y02).toBeCloseTo(0, 2);
    expect(y66).toBeCloseTo(1, 1);
  });

  it('全球一様放射輝度 L → 任意法線で E = πL', () => {
    const dirs = fibonacciSphere(512);
    const radiance = dirs.map(() => [2, 1, 0.5] as [number, number, number]);
    const coeffs = projectRadianceSamples(dirs, radiance);
    for (const n of [vec3(0, 1, 0), vec3(1, 0, 0), vec3(0, 0, -1)]) {
      const [r, g, b] = evalIrradiance(coeffs, n);
      expect(r).toBeCloseTo(2 * Math.PI, 1);
      expect(g).toBeCloseTo(Math.PI, 1);
      expect(b).toBeCloseTo(0.5 * Math.PI, 1);
    }
  });

  it('+z 半球コサインローブ → E(+z) ≈ 2π/3（SH2次の既知近似誤差内）', () => {
    const dirs = fibonacciSphere(2048);
    const radiance = dirs.map(
      (d) => [Math.max(0, d.z), Math.max(0, d.z), Math.max(0, d.z)] as [number, number, number],
    );
    const coeffs = projectRadianceSamples(dirs, radiance);
    const [r] = evalIrradiance(coeffs, vec3(0, 0, 1));
    const analytic = (2 * Math.PI) / 3;
    expect(Math.abs(r - analytic) / analytic).toBeLessThan(0.1);
    // 反対向きはほぼ 0（負はクランプ）
    const [back] = evalIrradiance(coeffs, vec3(0, 0, -1));
    expect(back).toBeLessThan(analytic * 0.12);
  });

  it('投影は放射輝度に対して線形', () => {
    const dirs = fibonacciSphere(256);
    const base = dirs.map((d) => [Math.abs(d.x), 0, 0] as [number, number, number]);
    const doubled = dirs.map((d) => [2 * Math.abs(d.x), 0, 0] as [number, number, number]);
    const c1 = projectRadianceSamples(dirs, base);
    const c2 = projectRadianceSamples(dirs, doubled);
    const n = vec3(1, 0, 0);
    expect(evalIrradiance(c2, n)[0]).toBeCloseTo(2 * evalIrradiance(c1, n)[0], 6);
  });
});
