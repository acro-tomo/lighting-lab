/**
 * 直接照度計算コア。
 *
 * E_direct = Σ I(θ,φ) · d · V · max(0, n·ω) / r²
 *   I: 配光由来の光度 [cd]、d: 調光率、V: 遮蔽率(0..1)、
 *   ω: 受照点→光源の単位ベクトル、r: 距離 [m]
 *
 * 描画系（レンダラー）とは独立した計算系であり、露出・トーンマッピングの
 * 影響を一切受けない。ただし配光サンプリング（LightDistribution）と
 * 遮蔽判定（OcclusionTester の実装）は描画系と同一のものを共有する。
 *
 * 将来フェーズで間接光 E_indirect を加算できるよう、間接光プロバイダを
 * 差し込み可能にし、結果は direct / indirect / total に分けて返す。
 */
import type { Lux, Vec3 } from '../core/types';
import { cross, dot, length, normalize, scale, sub, vec3 } from '../core/vec3';
import type { LightDistribution } from './distribution';

/** 受照点（位置＋受照面法線） */
export interface SurfacePoint {
  position: Vec3;
  normal: Vec3;
}

/** 計算用に解決済みの光源 */
export interface PhotometricLight {
  position: Vec3;
  /** 光軸（主放射方向、単位ベクトル）。ダウンライトなら (0,-1,0) */
  axis: Vec3;
  /** φ=0 の基準方向。光軸と直交していなくてよい（直交化する）。省略時は自動選択 */
  reference?: Vec3;
  distribution: LightDistribution;
  /** 調光率 0..1 */
  dimming: number;
}

/**
 * 遮蔽判定。0=完全遮蔽, 1=遮蔽なし。
 * 実装（レイキャスト）は描画系のシャドウ計算と同じ遮蔽ジオメトリ集合を使う。
 */
export interface OcclusionTester {
  visibility(from: Vec3, to: Vec3): number;
}

export const NO_OCCLUSION: OcclusionTester = { visibility: () => 1 };

/** 間接光プロバイダ（Phase 2 で Irradiance Probe を接続する差し込み口） */
export interface IndirectIlluminanceProvider {
  indirectAt(point: SurfacePoint): Lux;
}

export interface IlluminanceResult {
  direct: Lux;
  indirect: Lux;
  total: Lux;
}

/** 光源ローカルの (θ, φ) [rad] を求める */
export function localAngles(light: PhotometricLight, worldDir: Vec3): { theta: number; phi: number } {
  const axis = normalize(light.axis);
  const cosTheta = Math.min(1, Math.max(-1, dot(axis, worldDir)));
  const theta = Math.acos(cosTheta);
  // φ 基準ベクトル: reference を光軸に直交化。無指定なら軸に依存しない安定な選択
  let ref = light.reference ?? (Math.abs(axis.y) < 0.99 ? vec3(0, 1, 0) : vec3(1, 0, 0));
  ref = sub(ref, scale(axis, dot(ref, axis)));
  const refLen = length(ref);
  if (refLen < 1e-9) return { theta, phi: 0 };
  ref = scale(ref, 1 / refLen);
  const bitangent = cross(axis, ref);
  const proj = sub(worldDir, scale(axis, dot(worldDir, axis)));
  const phi = Math.atan2(dot(proj, bitangent), dot(proj, ref));
  return { theta, phi: phi < 0 ? phi + 2 * Math.PI : phi };
}

/** 単一光源からの直接照度 [lx] */
export function directIlluminanceFrom(
  point: SurfacePoint,
  light: PhotometricLight,
  occlusion: OcclusionTester = NO_OCCLUSION,
): Lux {
  const toLight = sub(light.position, point.position);
  const r = length(toLight);
  if (r < 1e-6) return 0;
  const omega = scale(toLight, 1 / r);
  const cosIncident = dot(normalize(point.normal), omega);
  if (cosIncident <= 0) return 0;
  const { theta, phi } = localAngles(light, scale(omega, -1));
  const intensity = light.distribution.intensityAt(theta, phi);
  if (intensity <= 0) return 0;
  const v = occlusion.visibility(point.position, light.position);
  if (v <= 0) return 0;
  return (intensity * light.dimming * v * cosIncident) / (r * r);
}

/** 全光源からの照度。間接光は provider があれば加算（Phase 1 では常に 0） */
export function illuminanceAt(
  point: SurfacePoint,
  lights: readonly PhotometricLight[],
  occlusion: OcclusionTester = NO_OCCLUSION,
  indirect?: IndirectIlluminanceProvider,
): IlluminanceResult {
  let direct = 0;
  for (const light of lights) {
    direct += directIlluminanceFrom(point, light, occlusion);
  }
  const indirectLx = indirect ? indirect.indirectAt(point) : 0;
  return { direct, indirect: indirectLx, total: direct + indirectLx };
}
