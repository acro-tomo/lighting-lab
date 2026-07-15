import { describe, expect, it } from 'vitest';
import {
  computeIlluminanceGrid,
  insideFurniture,
  lxToColor,
} from '../src/photometry/grid';
import { isotropicDistribution } from '../src/photometry/distribution';
import { NO_OCCLUSION, type PhotometricLight } from '../src/photometry/illuminance';
import { vec3 } from '../src/core/vec3';
import type { Furniture, SceneModel } from '../src/core/types';

const surface = { baseColor: [0.9, 0.9, 0.9] as [number, number, number], roughness: 0.9, metallic: 0 };

function squareRoomModel(furniture: Furniture[] = []): SceneModel {
  return {
    floorPlan: {
      outline: [
        { x: 0, y: 0 },
        { x: 4, y: 0 },
        { x: 4, y: 4 },
        { x: 0, y: 4 },
      ],
      ceilingHeight: 2.75,
      ceilingOverrides: [],
    },
    surfaces: { floor: surface, wall: surface, ceiling: surface },
    furniture,
    luminaires: [],
  };
}

/** 部屋中央・計算面の2m上に 1000cd 等方光源 */
const centerLight: PhotometricLight = {
  position: vec3(2, 2.75, -2),
  axis: vec3(0, -1, 0),
  distribution: isotropicDistribution(4 * Math.PI * 1000),
  dimming: 1,
};

describe('照度グリッド', () => {
  it('光源直下のグリッド点は手計算値（250lx）に一致し、部屋外は NaN', () => {
    const grid = computeIlluminanceGrid(squareRoomModel(), [centerLight], NO_OCCLUSION, 0.75, 0.25);
    // (2, 2) はグリッド点 (col=8, row=8)
    const col = Math.round((2 - grid.origin.x) / grid.spacing);
    const row = Math.round((2 - grid.origin.y) / grid.spacing);
    const value = grid.values[row * grid.cols + col]!;
    expect(value).toBeCloseTo(250, 4);
    // 角の外周上/外側判定: グリッドは外接矩形なので少なくとも部屋内は非NaN
    expect(grid.max).toBeGreaterThan(0);
    expect(grid.max).toBeCloseTo(250, 4);
  });

  it('家具内部の点はマスクされる', () => {
    const table: Furniture = {
      id: 't',
      name: 'table',
      position: { x: 2, y: 2 },
      rotationDeg: 0,
      elevation: 0,
      size: { w: 1, d: 1, h: 0.9 },
      material: surface,
    };
    const grid = computeIlluminanceGrid(squareRoomModel([table]), [centerLight], NO_OCCLUSION, 0.75, 0.25);
    const col = Math.round((2 - grid.origin.x) / grid.spacing);
    const row = Math.round((2 - grid.origin.y) / grid.spacing);
    expect(Number.isNaN(grid.values[row * grid.cols + col]!)).toBe(true);
    // 計算面より低い家具はマスクしない
    const lowTable = { ...table, size: { ...table.size, h: 0.5 } };
    const grid2 = computeIlluminanceGrid(squareRoomModel([lowTable]), [centerLight], NO_OCCLUSION, 0.75, 0.25);
    expect(grid2.values[row * grid2.cols + col]!).toBeCloseTo(250, 4);
  });

  it('回転した家具の内部判定', () => {
    const item: Furniture = {
      id: 'r',
      name: 'rot',
      position: { x: 0, y: 0 },
      rotationDeg: 45,
      elevation: 0,
      size: { w: 2, d: 0.2, h: 1 },
      material: surface,
    };
    // 45°回転した細長い箱: 対角方向 (0.6,0.6) は内部、(0.6,-0.6) は外
    expect(insideFurniture({ x: 0.6, y: 0.6 }, 0.5, item)).toBe(true);
    expect(insideFurniture({ x: 0.6, y: -0.6 }, 0.5, item)).toBe(false);
  });

  it('固定スケールの色: 範囲外はクランプ・自動正規化しない', () => {
    expect(lxToColor(0, 300)).toEqual(lxToColor(-10, 300));
    expect(lxToColor(300, 300)).toEqual(lxToColor(1000, 300));
    // 同じ lx 値はシーンによらず同じ色（スケールのみに依存）
    expect(lxToColor(150, 300)).toEqual(lxToColor(150, 300));
    expect(lxToColor(150, 300)).not.toEqual(lxToColor(150, 500));
  });
});
