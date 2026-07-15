import { describe, expect, it } from 'vitest';
import { buildPtScene } from '../src/pathtrace/ptScene';
import { beamDistribution } from '../src/photometry/distribution';
import type { SceneModel } from '../src/core/types';

const surface = { baseColor: [0.9, 0.9, 0.9] as [number, number, number], roughness: 0.9, metallic: 0 };

const model: SceneModel = {
  floorPlan: {
    outline: [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 4 },
      { x: 0, y: 4 },
    ],
    ceilingHeight: 2.4,
    ceilingOverrides: [],
  },
  surfaces: { floor: surface, wall: surface, ceiling: surface },
  furniture: [],
  luminaires: [
    {
      id: 'dl-1',
      preset: {
        model: 'T',
        maker: 't',
        kind: 'downlight',
        beamAngleDeg: 60,
        flux: 1000,
        cct: 2700,
        dimmable: true,
        cutoutDiameter: 0.075,
        apertureDiameter: 0.08,
        dataSource: 'representative',
      },
      position: { x: 2, y: 2 },
      mountHeight: 2.4,
      aim: { tiltDeg: 0, panDeg: 0 },
      dimming: 0.5,
    },
  ],
};

describe('パストレース用シーン構築', () => {
  it('光源: 測光系と同一のピーク光度×調光率・発光面半径・IESプロファイル', () => {
    const result = buildPtScene(model, [], () => null);
    expect(result.lights).toHaveLength(1);
    const light = result.lights[0]!;
    // ピーク光度 = lm/(2π(1−cos30°)) × 調光0.5（測光・ラスタと同一の定義）
    const expectedPeak = 1000 / (2 * Math.PI * (1 - Math.cos((30 * Math.PI) / 180)));
    expect(light.intensity).toBeCloseTo(expectedPeak * 0.5, 3);
    expect(light.decay).toBe(2);
    // 発光面寸法 → ソフトシャドウ半径
    expect(light.radius).toBeCloseTo(0.04, 6);
    // IESプロファイルが接続されている（θ=0 で 1.0 に正規化）
    const iesMap = (light as unknown as { iesMap: { image: { data: Float32Array } } }).iesMap;
    expect(iesMap).toBeTruthy();
    expect(iesMap.image.data[0]).toBeCloseTo(1, 5);
    // コーン角は配光の台形サポートを覆う（半角30°+ペナンブラ+マージン ≈ 0.63rad 前後）
    expect(light.angle).toBeGreaterThan((30 * Math.PI) / 180);
    expect(light.angle).toBeLessThan(Math.PI / 2);
    // 位置とターゲット（真下向き）
    expect(light.position.y).toBeCloseTo(2.4, 6);
    expect(light.target.position.y).toBeCloseTo(1.4, 6);
  });

  it('IES 配光が与えられればそれを使う（ビーム角ではなく）', () => {
    // 等方に近い広い配光を渡すと、コーン角がビーム角より広くなる
    const wide = beamDistribution(1000, 170);
    const result = buildPtScene(model, [], () => wide);
    expect(result.lights[0]!.angle).toBeGreaterThan(1.0);
  });
});
