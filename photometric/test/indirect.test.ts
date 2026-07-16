import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IndirectController } from '../src/app/indirect';
import type { SceneModel } from '../src/core/types';
import { NO_OCCLUSION } from '../src/photometry/illuminance';

const surface = {
  baseColor: [0.8, 0.8, 0.8] as [number, number, number],
  roughness: 0.8,
  metallic: 0,
};

const model: SceneModel = {
  floorPlan: {
    outline: [
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { x: 2, y: 2 },
      { x: 0, y: 2 },
    ],
    ceilingHeight: 2.5,
    ceilingOverrides: [],
  },
  furniture: [],
  luminaires: [],
  surfaces: { floor: surface, wall: surface, ceiling: surface },
};

const translatedModel: SceneModel = {
  ...model,
  floorPlan: {
    ...model.floorPlan,
    outline: model.floorPlan.outline.map((point) => ({ x: point.x + 10, y: point.y })),
  },
};

describe('IndirectController', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('window', globalThis);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('破棄時は待機中の計算を開始しない', () => {
    const committed = vi.fn();
    const controller = new IndirectController({
      getModel: () => model,
      getRadianceScene: () => ({ hit: () => null }),
      getLights: () => [],
      getOcclusion: () => NO_OCCLUSION,
      onPassCommitted: committed,
      onStatusChanged: () => {},
    });

    controller.invalidate('geometry');
    controller.dispose();
    vi.advanceTimersByTime(500);

    expect(controller.status).toBe('idle');
    expect(controller.field).toBeNull();
    expect(committed).not.toHaveBeenCalled();
  });

  it('形状再計算の待機中に光源更新しても旧フィールドを再利用しない', async () => {
    let currentModel = model;
    const committed = vi.fn();
    const controller = new IndirectController({
      getModel: () => currentModel,
      getRadianceScene: () => ({ hit: () => null }),
      getLights: () => [],
      getOcclusion: () => NO_OCCLUSION,
      onPassCommitted: committed,
      onStatusChanged: () => {},
    });

    controller.invalidate('geometry');
    await vi.runAllTimersAsync();
    const oldField = controller.field;
    expect(oldField?.isReady).toBe(true);

    currentModel = translatedModel;
    committed.mockClear();
    controller.invalidate('geometry');
    expect(controller.field).toBeNull();
    controller.invalidate('lights');
    await vi.runAllTimersAsync();

    expect(controller.field).not.toBe(oldField);
    expect(controller.field?.origin.x).toBeGreaterThan(10);
    expect(committed).toHaveBeenCalled();
    expect(committed.mock.calls.every(([field]) => field !== oldField)).toBe(true);
  });

  it('実行中にcancelされたパスをcommitしない', async () => {
    const committed = vi.fn();
    let controller: IndirectController;
    let canceled = false;
    controller = new IndirectController({
      getModel: () => model,
      getRadianceScene: () => ({
        hit: () => {
          if (!canceled) {
            canceled = true;
            controller.cancel();
          }
          return null;
        },
      }),
      getLights: () => [],
      getOcclusion: () => NO_OCCLUSION,
      onPassCommitted: committed,
      onStatusChanged: () => {},
    });

    controller.invalidate('geometry');
    await vi.runAllTimersAsync();

    expect(canceled).toBe(true);
    expect(controller.status).toBe('idle');
    expect(committed).not.toHaveBeenCalled();
  });
});
