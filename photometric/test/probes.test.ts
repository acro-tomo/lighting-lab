import { describe, expect, it } from 'vitest';
import {
  IrradianceProbeField,
  runToCompletion,
  type RadianceScene,
} from '../src/photometry/probes';
import { isotropicDistribution } from '../src/photometry/distribution';
import { NO_OCCLUSION, type PhotometricLight } from '../src/photometry/illuminance';
import { vec3 } from '../src/core/vec3';
import type { SceneModel } from '../src/core/types';

const surface = { baseColor: [0.9, 0.9, 0.9] as [number, number, number], roughness: 0.9, metallic: 0 };

function roomModel(withVoid = false): SceneModel {
  return {
    floorPlan: {
      outline: [
        { x: 0, y: 0 },
        { x: 4, y: 0 },
        { x: 4, y: 4 },
        { x: 0, y: 4 },
      ],
      ceilingHeight: 2.75,
      ceilingOverrides: withVoid
        ? [
            {
              polygon: [
                { x: 0, y: 0 },
                { x: 2, y: 0 },
                { x: 2, y: 4 },
                { x: 0, y: 4 },
              ],
              height: 5.0,
            },
          ]
        : [],
    },
    surfaces: { floor: surface, wall: surface, ceiling: surface },
    furniture: [],
    luminaires: [],
  };
}

/** 常に「一定放射輝度1の面」にヒットする合成シーン（SH経路の検証用） */
const constantScene: RadianceScene = {
  hit: (origin, dir) => ({
    point: vec3(origin.x + dir.x, origin.y + dir.y, origin.z + dir.z),
    normal: vec3(-dir.x, -dir.y, -dir.z),
    albedoLinear: [1, 1, 1],
  }),
};

/** 床（y=0・albedo 0.5）だけがある解析シーン */
const floorScene: RadianceScene = {
  hit: (origin, dir) => {
    if (dir.y >= -1e-6 || origin.y <= 0) return null;
    const t = origin.y / -dir.y;
    return {
      point: vec3(origin.x + dir.x * t, 0, origin.z + dir.z * t),
      normal: vec3(0, 1, 0),
      albedoLinear: [0.5, 0.5, 0.5],
    };
  },
};

function centerLight(dimming = 1): PhotometricLight {
  return {
    position: vec3(2, 2.2, -2),
    axis: vec3(0, -1, 0),
    distribution: isotropicDistribution(4 * Math.PI * 1000),
    dimming,
  };
}

describe('Irradiance Probe フィールド', () => {
  it('全方向 一定放射輝度1 → 任意点・任意法線で E ≈ π', () => {
    const field = new IrradianceProbeField(roomModel(), {
      patchRadiance: () => [1, 1, 1],
    });
    runToCompletion(field.gatherPass(constantScene, [], NO_OCCLUSION, 256));
    for (const n of [vec3(0, 1, 0), vec3(1, 0, 0)]) {
      const e = field.indirectAt({ position: vec3(2, 1.2, -2), normal: n });
      expect(Math.abs(e - Math.PI) / Math.PI).toBeLessThan(0.05);
    }
  });

  it('吹抜け: 基準天井より上のプローブは吹抜け領域だけ有効', () => {
    const field = new IrradianceProbeField(roomModel(true));
    let highInVoid = 0;
    let highOutsideVoid = 0;
    for (let iz = 0; iz < field.nz; iz++) {
      for (let iy = 0; iy < field.ny; iy++) {
        for (let ix = 0; ix < field.nx; ix++) {
          const pos = field.probePosition(ix, iy, iz);
          if (pos.y < 3.0) continue; // 基準天井2.75より十分上だけ数える
          const valid = field.validity[field.index(ix, iy, iz)] === 1;
          if (pos.x < 2) highInVoid += valid ? 1 : 0;
          else highOutsideVoid += valid ? 1 : 0;
        }
      }
    }
    expect(highInVoid).toBeGreaterThan(0);
    expect(highOutsideVoid).toBe(0);
  });

  it('床バウンス: 間接照度は正で、直接照度より小さい', () => {
    const field = new IrradianceProbeField(roomModel());
    runToCompletion(field.gatherPass(floorScene, [centerLight()], NO_OCCLUSION, 128));
    // 床を見下ろす向きの受照点（天井面など）で床反射を受ける
    const e = field.indirectAt({ position: vec3(2, 1.5, -2), normal: vec3(0, -1, 0) });
    expect(e).toBeGreaterThan(5);
    expect(e).toBeLessThan(120); // 直接照度(直下207lx)×ρ=0.5 を超えない大きさ
  });

  it('差分再計算（relight）: 調光50%で正確に半分、フル再計算と一致', () => {
    const field = new IrradianceProbeField(roomModel());
    runToCompletion(field.gatherPass(floorScene, [centerLight(1)], NO_OCCLUSION, 128));
    const point = { position: vec3(2, 1.5, -2), normal: vec3(0, -1, 0) };
    const full = field.indirectAt(point);
    expect(field.canRelight()).toBe(true);

    // 同一レイ数 → キャッシュヒットで relight
    runToCompletion(field.gatherPass(floorScene, [centerLight(0.5)], NO_OCCLUSION, 128));
    const relit = field.indirectAt(point);
    expect(relit).toBeCloseTo(full * 0.5, 4);

    // 独立にフル計算した場合と一致
    const fresh = new IrradianceProbeField(roomModel());
    runToCompletion(fresh.gatherPass(floorScene, [centerLight(0.5)], NO_OCCLUSION, 128));
    expect(relit).toBeCloseTo(fresh.indirectAt(point), 4);
  });

  it('2バウンス目で間接照度が増える（床＋天井の相互反射）', () => {
    // 床だけのシーンでは床は自分自身を照らせず2バウンス寄与は物理的に0になる。
    // 床(y=0)＋天井(y=2.75)の両平面で相互反射を検証する。
    const floorCeilScene: RadianceScene = {
      hit: (origin, dir) => {
        if (dir.y < -1e-6 && origin.y > 0) {
          const t = origin.y / -dir.y;
          return {
            point: vec3(origin.x + dir.x * t, 0, origin.z + dir.z * t),
            normal: vec3(0, 1, 0),
            albedoLinear: [0.5, 0.5, 0.5],
          };
        }
        if (dir.y > 1e-6 && origin.y < 2.75) {
          const t = (2.75 - origin.y) / dir.y;
          return {
            point: vec3(origin.x + dir.x * t, 2.75, origin.z + dir.z * t),
            normal: vec3(0, -1, 0),
            albedoLinear: [0.5, 0.5, 0.5],
          };
        }
        return null;
      },
    };
    const field = new IrradianceProbeField(roomModel());
    runToCompletion(field.gatherPass(floorCeilScene, [centerLight()], NO_OCCLUSION, 128));
    const point = { position: vec3(2, 1.5, -2), normal: vec3(0, -1, 0) };
    const oneBounce = field.indirectAt(point);
    runToCompletion(field.gatherPass(floorCeilScene, [centerLight()], NO_OCCLUSION, 128, true));
    const twoBounce = field.indirectAt(point);
    expect(twoBounce).toBeGreaterThan(oneBounce * 1.02);
    expect(twoBounce).toBeLessThan(oneBounce * 1.8);
  });

  it('遮蔽されたプローブはサンプリングから除外される（可視性）', () => {
    const field = new IrradianceProbeField(roomModel(), { patchRadiance: () => [1, 1, 1] });
    runToCompletion(field.gatherPass(constantScene, [], NO_OCCLUSION, 128));
    const point = { position: vec3(2, 1.2, -2), normal: vec3(0, 1, 0) };
    const open = field.indirectAt(point);
    expect(open).toBeGreaterThan(0);
    // gather に全遮蔽の tester を渡すと、以後のサンプリングで全プローブが不可視 → 0
    runToCompletion(field.gatherPass(constantScene, [], { visibility: () => 0 }, 128));
    expect(field.indirectAt(point)).toBe(0);
  });
});
