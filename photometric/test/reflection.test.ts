import { describe, expect, it } from 'vitest';
import { findLightReflections, type ReflectiveSurface } from '../src/photometry/reflection';
import { beamDistribution, isotropicDistribution } from '../src/photometry/distribution';
import type { PhotometricLight } from '../src/photometry/illuminance';
import { vec3 } from '../src/core/vec3';

/** z=0 平面、+z を向く 1m×1m のスクリーン（中心原点） */
const screen: ReflectiveSurface = {
  center: vec3(0, 0, 0),
  normal: vec3(0, 0, 1),
  uAxis: vec3(1, 0, 0),
  vAxis: vec3(0, 1, 0),
  halfU: 0.5,
  halfV: 0.5,
};

const isotropic = (position: ReturnType<typeof vec3>): PhotometricLight => ({
  position,
  axis: vec3(0, -1, 0),
  distribution: isotropicDistribution(1000),
  dimming: 1,
});

describe('映り込み判定（平面鏡近似）', () => {
  it('正対する光源は鏡像条件を満たし、反射点は面中央', () => {
    // 視点 (0,0,2)、光源 (0,0,2) → 鏡像 (0,0,-2)、交点は原点
    const hits = findLightReflections(vec3(0, 0, 2), screen, [isotropic(vec3(0, 0, 2))]);
    expect(hits).toHaveLength(1);
    expect(hits[0]!.point.x).toBeCloseTo(0, 9);
    expect(hits[0]!.point.y).toBeCloseTo(0, 9);
  });

  it('鏡像が矩形の外に出る光源は映らない', () => {
    // 高い位置の光源: 鏡像との交点 y = (2+3)/… 交点が halfV を超える
    const hits = findLightReflections(vec3(0, 0, 2), screen, [isotropic(vec3(0, 3, 2))]);
    expect(hits).toHaveLength(0);
  });

  it('斜め配置: 反射点は入射角=反射角の位置', () => {
    // 視点 (1,0,2)・光源 (-1,0,2) → 反射点は x=0（中央）
    const hits = findLightReflections(vec3(1, 0, 2), screen, [isotropic(vec3(-1, 0, 2))]);
    expect(hits).toHaveLength(1);
    expect(hits[0]!.point.x).toBeCloseTo(0, 9);
  });

  it('面の裏側の光源・裏側の視点は映らない', () => {
    expect(findLightReflections(vec3(0, 0, 2), screen, [isotropic(vec3(0, 0, -2))])).toHaveLength(0);
    expect(findLightReflections(vec3(0, 0, -2), screen, [isotropic(vec3(0, 0, 2))])).toHaveLength(0);
  });

  it('反射点方向に配光がゼロのスポットは映らない（真下向きビーム）', () => {
    const downSpot: PhotometricLight = {
      position: vec3(0, 0, 2),
      axis: vec3(0, -1, 0), // 真下向き 24°ビーム → 水平方向の面へは放射なし
      distribution: beamDistribution(500, 24),
      dimming: 1,
    };
    expect(findLightReflections(vec3(0, 0, 2), screen, [downSpot])).toHaveLength(0);
    // 同じ位置でも面へ向けたスポットなら映る
    const aimedSpot: PhotometricLight = { ...downSpot, axis: vec3(0, 0, -1) };
    expect(findLightReflections(vec3(0, 0, 2), screen, [aimedSpot])).toHaveLength(1);
  });

  it('遮蔽されている光源は映らない', () => {
    const hits = findLightReflections(
      vec3(0, 0, 2),
      screen,
      [isotropic(vec3(0, 0, 2))],
      { visibility: () => 0 },
    );
    expect(hits).toHaveLength(0);
  });
});
