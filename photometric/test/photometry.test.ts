/**
 * 測光計算コアのユニットテスト。
 * 照明シミュレーションは間違っていても画面にはそれらしい絵が出るため、
 * これらのテストが正しさの唯一の根拠となる（全フェーズの回帰テスト）。
 */
import { describe, expect, it } from 'vitest';
import {
  beamDistribution,
  integrateFlux,
  isotropicDistribution,
  threeSpotDistribution,
  threeSpotPeakCandela,
} from '../src/photometry/distribution';
import {
  directIlluminanceFrom,
  illuminanceAt,
  localAngles,
  type PhotometricLight,
  type SurfacePoint,
} from '../src/photometry/illuminance';
import { vec3 } from '../src/core/vec3';

/** 1000cd 相当の等方光源（Φ = 4π × 1000 lm） */
function isotropic1000cd(positionY: number): PhotometricLight {
  return {
    position: vec3(0, positionY, 0),
    axis: vec3(0, -1, 0),
    distribution: isotropicDistribution(4 * Math.PI * 1000),
    dimming: 1,
  };
}

const floorPointUp: SurfacePoint = { position: vec3(0, 0, 0), normal: vec3(0, 1, 0) };

describe('直接照度（手計算ケース）', () => {
  it('1000cd の光源直下 2m で 250lx', () => {
    const light = isotropic1000cd(2);
    expect(directIlluminanceFrom(floorPointUp, light)).toBeCloseTo(250, 6);
  });

  it('逆二乗則: 距離2倍で 1/4', () => {
    const at2 = directIlluminanceFrom(floorPointUp, isotropic1000cd(2));
    const at4 = directIlluminanceFrom(floorPointUp, isotropic1000cd(4));
    expect(at4).toBeCloseTo(at2 / 4, 6);
  });

  it('入射角余弦則: 法線を60°傾けると cos60° = 0.5 倍', () => {
    const light = isotropic1000cd(2);
    const tilted: SurfacePoint = {
      position: vec3(0, 0, 0),
      normal: vec3(Math.sin(Math.PI / 3), Math.cos(Math.PI / 3), 0),
    };
    expect(directIlluminanceFrom(tilted, light)).toBeCloseTo(250 * 0.5, 6);
  });

  it('調光率が線形に乗る', () => {
    const light = { ...isotropic1000cd(2), dimming: 0.4 };
    expect(directIlluminanceFrom(floorPointUp, light)).toBeCloseTo(100, 6);
  });

  it('遮蔽率 V=0 で 0lx、V=0.5 で半減', () => {
    const light = isotropic1000cd(2);
    expect(
      directIlluminanceFrom(floorPointUp, light, { visibility: () => 0 }),
    ).toBe(0);
    expect(
      directIlluminanceFrom(floorPointUp, light, { visibility: () => 0.5 }),
    ).toBeCloseTo(125, 6);
  });

  it('受照面の裏側からの光は 0（max(0, n·ω)）', () => {
    const lightBelow = isotropic1000cd(-2);
    expect(directIlluminanceFrom(floorPointUp, lightBelow)).toBe(0);
  });

  it('複数光源は加算され、間接光は Phase 1 では 0', () => {
    const result = illuminanceAt(floorPointUp, [isotropic1000cd(2), isotropic1000cd(4)]);
    expect(result.direct).toBeCloseTo(250 + 62.5, 6);
    expect(result.indirect).toBe(0);
    expect(result.total).toBeCloseTo(result.direct, 9);
  });

  it('間接光プロバイダを差し込むと total に加算される（将来フェーズ互換）', () => {
    const result = illuminanceAt(
      floorPointUp,
      [isotropic1000cd(2)],
      undefined,
      { indirectAt: () => 30 },
    );
    expect(result.direct).toBeCloseTo(250, 6);
    expect(result.indirect).toBe(30);
    expect(result.total).toBeCloseTo(280, 6);
  });
});

describe('lm → cd 変換（ビーム角近似）', () => {
  it('ピーク光度 I0 = lm / (2π(1−cos(半角)))。全角60°なら半角30°を使う', () => {
    const flux = 1000;
    const dist = beamDistribution(flux, 60);
    const expected = flux / (2 * Math.PI * (1 - Math.cos((30 * Math.PI) / 180)));
    expect(dist.intensityAt(0, 0)).toBeCloseTo(expected, 6);
    // 全角と半角の取り違え検出: 誤って全角60°で計算した値とは一致しない
    const wrong = flux / (2 * Math.PI * (1 - Math.cos((60 * Math.PI) / 180)));
    expect(Math.abs(dist.intensityAt(0, 0) - wrong)).toBeGreaterThan(1);
  });

  it('ビーム角の外側では光度 0', () => {
    const dist = beamDistribution(1000, 60);
    expect(dist.intensityAt((45 * Math.PI) / 180, 0)).toBe(0);
  });

  it('全光束が数値積分でほぼ保存される（誤差 <2%）', () => {
    for (const angle of [24, 60, 100]) {
      const flux = 800;
      const integrated = integrateFlux(beamDistribution(flux, angle));
      expect(Math.abs(integrated - flux) / flux).toBeLessThan(0.02);
    }
  });

  it('等方配光の全光束が保存される', () => {
    const integrated = integrateFlux(isotropicDistribution(1000));
    expect(integrated).toBeCloseTo(1000, 1);
  });
});

describe('lm → cd 変換（Three.js SpotLight 配光）', () => {
  it('smoothstep 半影を含む重み付き立体角からピーク光度を求める', () => {
    const flux = 1000;
    const outer = (30 * Math.PI) / 180;
    const inner = outer * (1 - 0.6);
    const solidAngle = 2 * Math.PI * (1 - (Math.cos(outer) + Math.cos(inner)) / 2);
    expect(threeSpotPeakCandela(flux, 60, 0.6)).toBeCloseTo(flux / solidAngle, 9);
  });

  it('Three.js と同じ cos 空間の smoothstep で減衰する', () => {
    const dist = threeSpotDistribution(1000, 60, 0.6);
    const inner = (12 * Math.PI) / 180;
    const outer = (30 * Math.PI) / 180;
    const middleCos = (Math.cos(inner) + Math.cos(outer)) / 2;
    const middle = Math.acos(middleCos);
    expect(dist.intensityAt(inner, 0)).toBeCloseTo(dist.intensityAt(0, 0), 9);
    expect(dist.intensityAt(middle, 0)).toBeCloseTo(dist.intensityAt(0, 0) * 0.5, 9);
    expect(dist.intensityAt(outer, 0)).toBeCloseTo(0, 9);
  });

  it('半影 0 を含む配光で全光束を保存する', () => {
    for (const [angle, penumbra] of [[24, 0], [60, 0.6], [100, 1]] as const) {
      const flux = 800;
      const integrated = integrateFlux(
        threeSpotDistribution(flux, angle, penumbra),
        8192
      );
      expect(Math.abs(integrated - flux) / flux).toBeLessThan(0.001);
    }
  });
});

describe('光源ローカル角', () => {
  it('真下向きダウンライトの直下点は θ=0', () => {
    const light: PhotometricLight = {
      position: vec3(1, 2.4, 1),
      axis: vec3(0, -1, 0),
      distribution: isotropicDistribution(1000),
      dimming: 1,
    };
    const { theta } = localAngles(light, vec3(0, -1, 0));
    expect(theta).toBeCloseTo(0, 9);
  });

  it('光軸から90°の方向は θ=π/2', () => {
    const light: PhotometricLight = {
      position: vec3(0, 2.4, 0),
      axis: vec3(0, -1, 0),
      distribution: isotropicDistribution(1000),
      dimming: 1,
    };
    const { theta } = localAngles(light, vec3(1, 0, 0));
    expect(theta).toBeCloseTo(Math.PI / 2, 9);
  });
});
