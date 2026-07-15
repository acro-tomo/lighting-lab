/**
 * 球面調和（SH）2次・9係数の投影と放射照度評価（Phase 2 間接光の基盤）。
 * レンダラー非依存の純TS。GPU側（TSL）も同じ係数レイアウトを参照する。
 *
 * 放射照度評価はコサインローブ畳み込み（Ramamoorthi & Hanrahan 2001）:
 *   E(n) = Σ_l Â_l Σ_m c_lm Y_lm(n),  Â0 = π, Â1 = 2π/3, Â2 = π/4
 * 検証: 全球一様放射輝度 L に対し E = πL（ユニットテストで固定）。
 */
import type { Vec3 } from '../core/types';

export const SH_COEFF_COUNT = 9;

/** 実数SH基底 Y_lm(dir)。dir は単位ベクトル */
export function shBasis(dir: Vec3): number[] {
  const { x, y, z } = dir;
  return [
    0.282095,
    0.488603 * y,
    0.488603 * z,
    0.488603 * x,
    1.092548 * x * y,
    1.092548 * y * z,
    0.315392 * (3 * z * z - 1),
    1.092548 * x * z,
    0.546274 * (x * x - y * y),
  ];
}

/** コサイン畳み込み係数（バンドごと） */
const A_BAND = [Math.PI, (2 * Math.PI) / 3, Math.PI / 4];
const A_PER_COEFF = [
  A_BAND[0]!,
  A_BAND[1]!, A_BAND[1]!, A_BAND[1]!,
  A_BAND[2]!, A_BAND[2]!, A_BAND[2]!, A_BAND[2]!, A_BAND[2]!,
];

/**
 * 球面Fibonacci点列（決定的・準一様な全球方向サンプル）。
 * プローブのレイ方向に使用。
 */
export function fibonacciSphere(count: number): Vec3[] {
  const dirs: Vec3[] = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const z = 1 - (2 * i + 1) / count;
    const r = Math.sqrt(Math.max(0, 1 - z * z));
    const phi = golden * i;
    dirs.push({ x: r * Math.cos(phi), y: r * Math.sin(phi), z });
  }
  return dirs;
}

/**
 * RGB放射輝度サンプル（一様全球方向）を SH9 へ投影する。
 * 出力レイアウト: [coeff0.r, coeff0.g, coeff0.b, coeff1.r, ...]（27要素）
 */
export function projectRadianceSamples(
  dirs: readonly Vec3[],
  radiance: readonly [number, number, number][],
): Float32Array {
  const coeffs = new Float32Array(SH_COEFF_COUNT * 3);
  const weight = (4 * Math.PI) / dirs.length;
  for (let s = 0; s < dirs.length; s++) {
    const basis = shBasis(dirs[s]!);
    const [r, g, b] = radiance[s]!;
    if (r === 0 && g === 0 && b === 0) continue;
    for (let i = 0; i < SH_COEFF_COUNT; i++) {
      const w = basis[i]! * weight;
      coeffs[i * 3] = coeffs[i * 3]! + r * w;
      coeffs[i * 3 + 1] = coeffs[i * 3 + 1]! + g * w;
      coeffs[i * 3 + 2] = coeffs[i * 3 + 2]! + b * w;
    }
  }
  return coeffs;
}

/** SH9係数から法線 n 方向の放射照度 [lx 相当] を評価する */
export function evalIrradiance(coeffs: Float32Array, normal: Vec3): [number, number, number] {
  const basis = shBasis(normal);
  let r = 0;
  let g = 0;
  let b = 0;
  for (let i = 0; i < SH_COEFF_COUNT; i++) {
    const w = A_PER_COEFF[i]! * basis[i]!;
    r += coeffs[i * 3]! * w;
    g += coeffs[i * 3 + 1]! * w;
    b += coeffs[i * 3 + 2]! * w;
  }
  return [Math.max(0, r), Math.max(0, g), Math.max(0, b)];
}

/** Rec.709 輝度（RGB照度→スカラーlx換算に使用） */
export function irradianceLuminance([r, g, b]: [number, number, number]): number {
  return 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
}
