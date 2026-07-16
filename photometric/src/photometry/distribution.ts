/**
 * 配光（lm → cd 変換）。
 *
 * LightDistribution は「光源ローカル角 (θ, φ) → 光度 [cd]」の写像。
 * θ: 光軸からの角度 [rad]（0 = 光軸方向 = ダウンライトなら真下）
 * φ: 光軸まわりの方位角 [rad]
 * 調光率はここでは扱わない（illuminance.ts で乗算する）。
 */
import type { Candelas, Lumens } from '../core/types';

export interface LightDistribution {
  readonly kind: 'beam' | 'ies' | 'isotropic';
  /** 光度 [cd]（調光率 1.0 時） */
  intensityAt(thetaRad: number, phiRad: number): Candelas;
}

/** 等方点光源: I = lm / 4π。テスト・検証用 */
export function isotropicDistribution(flux: Lumens): LightDistribution {
  const intensity = flux / (4 * Math.PI);
  return {
    kind: 'isotropic',
    intensityAt: () => intensity,
  };
}

/**
 * ビーム角近似（IESが無い器具のフォールバック。UIでは「推定配光」と明示）。
 *
 * ピーク光度 I0 = lm / (2π(1 − cos(半角)))
 * beamAngleDeg は【全角】。半角と取り違えないこと（頻出バグ、テストで固定）。
 *
 * エッジは半角を中心に ±15%（上限3°）の smoothstep で減衰させる。
 * 中心を半角に置いた対称な遷移なので全光束はほぼ保存される
 * （数値積分テストで誤差 <2% を保証）。
 */
export function beamDistribution(flux: Lumens, beamAngleDeg: number): LightDistribution {
  if (!(beamAngleDeg > 0 && beamAngleDeg <= 180)) {
    throw new Error(`beamAngleDeg out of range: ${beamAngleDeg}`);
  }
  const halfRad = (beamAngleDeg / 2) * (Math.PI / 180);
  const peak = flux / (2 * Math.PI * (1 - Math.cos(halfRad)));
  const penumbra = Math.min(halfRad * 0.15, (3 * Math.PI) / 180);
  const inner = halfRad - penumbra;
  const outer = halfRad + penumbra;
  return {
    kind: 'beam',
    intensityAt: (thetaRad: number) => {
      const theta = Math.abs(thetaRad);
      if (theta <= inner) return peak;
      if (theta >= outer) return 0;
      const t = (theta - inner) / (outer - inner);
      // smoothstep 1→0
      const s = 1 - t * t * (3 - 2 * t);
      return peak * s;
    },
  };
}

/** Three.js SpotLight の smoothstep 半影を含む重み付き立体角 [sr]。 */
export function threeSpotWeightedSolidAngle(fullAngleDeg: number, penumbra: number): number {
  if (!(fullAngleDeg > 0 && fullAngleDeg <= 180)) {
    throw new Error(`fullAngleDeg out of range: ${fullAngleDeg}`);
  }
  if (!(penumbra >= 0 && penumbra <= 1)) {
    throw new Error(`penumbra out of range: ${penumbra}`);
  }
  const outer = (fullAngleDeg / 2) * (Math.PI / 180);
  const inner = outer * (1 - penumbra);
  return 2 * Math.PI * (1 - (Math.cos(outer) + Math.cos(inner)) / 2);
}

/** 入力光束を保存する Three.js SpotLight のピーク光度 [cd]。 */
export function threeSpotPeakCandela(
  flux: Lumens,
  fullAngleDeg: number,
  penumbra: number
): Candelas {
  return flux / threeSpotWeightedSolidAngle(fullAngleDeg, penumbra);
}

/** Three.js SpotLight と同じ cos 空間の smoothstep 半影を持つ配光。 */
export function threeSpotDistribution(
  flux: Lumens,
  fullAngleDeg: number,
  penumbra: number
): LightDistribution {
  const outer = (fullAngleDeg / 2) * (Math.PI / 180);
  const inner = outer * (1 - penumbra);
  const outerCos = Math.cos(outer);
  const innerCos = Math.cos(inner);
  const peak = threeSpotPeakCandela(flux, fullAngleDeg, penumbra);
  return {
    kind: 'beam',
    intensityAt: (thetaRad: number) => {
      const theta = Math.abs(thetaRad);
      if (theta > outer) return 0;
      if (penumbra === 0 || theta <= inner) return peak;
      const t = (Math.cos(theta) - outerCos) / (innerCos - outerCos);
      return peak * t * t * (3 - 2 * t);
    },
  };
}

/**
 * 配光の全光束 [lm] を数値積分で求める（テスト・整合性検証用）。
 * Φ = ∫∫ I(θ,φ) sinθ dθ dφ
 */
export function integrateFlux(dist: LightDistribution, thetaSteps = 2048, phiSteps = 64): Lumens {
  const dTheta = Math.PI / thetaSteps;
  const dPhi = (2 * Math.PI) / phiSteps;
  let flux = 0;
  for (let i = 0; i < thetaSteps; i++) {
    const theta = (i + 0.5) * dTheta;
    const sinTheta = Math.sin(theta);
    for (let j = 0; j < phiSteps; j++) {
      const phi = (j + 0.5) * dPhi;
      flux += dist.intensityAt(theta, phi) * sinTheta * dTheta * dPhi;
    }
  }
  return flux;
}
