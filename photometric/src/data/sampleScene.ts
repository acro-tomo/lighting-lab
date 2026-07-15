/**
 * サンプルLDK（Phase 1 の既定シーン）。
 * 4.55m × 8.19m の縦長LDK。南（y小）にキッチン、中央にダイニング、
 * 北側リビングの西半分が吹抜け（天井高 5.2m）。
 */
import type { FixturePreset, Luminaire, SceneModel } from '../core/types';

function pickPreset(presets: readonly FixturePreset[], model: string): FixturePreset {
  const preset = presets.find((p) => p.model === model);
  if (!preset) throw new Error(`preset not found: ${model}`);
  return preset;
}

export function createSampleScene(presets: readonly FixturePreset[]): SceneModel {
  const dlDiffuse = pickPreset(presets, 'SAMPLE-DL-D85-27');
  const dlMedium = pickPreset(presets, 'SAMPLE-DL-M45-27');
  const dlHigh = pickPreset(presets, 'SAMPLE-DL-H60-27');
  const dlIes = pickPreset(presets, 'SAMPLE-DL-IES');
  const spot = pickPreset(presets, 'SAMPLE-SP-N24-30');

  const ceilingHeight = 2.4;
  const voidHeight = 5.2;

  const downlight = (
    id: string,
    preset: FixturePreset,
    x: number,
    y: number,
    mountHeight = ceilingHeight,
  ): Luminaire => ({
    id,
    preset,
    position: { x, y },
    mountHeight,
    aim: { tiltDeg: 0, panDeg: 0 },
    dimming: 1,
  });

  return {
    floorPlan: {
      outline: [
        { x: 0, y: 0 },
        { x: 4.55, y: 0 },
        { x: 4.55, y: 8.19 },
        { x: 0, y: 8.19 },
      ],
      ceilingHeight,
      ceilingOverrides: [
        {
          polygon: [
            { x: 0, y: 4.6 },
            { x: 2.73, y: 4.6 },
            { x: 2.73, y: 8.19 },
            { x: 0, y: 8.19 },
          ],
          height: voidHeight,
        },
      ],
    },
    surfaces: {
      floor: { baseColor: [0.62, 0.49, 0.36], roughness: 0.65, metallic: 0 },
      wall: { baseColor: [0.93, 0.92, 0.9], roughness: 0.9, metallic: 0 },
      ceiling: { baseColor: [0.95, 0.94, 0.92], roughness: 0.9, metallic: 0 },
    },
    furniture: [
      {
        id: 'kitchen-counter',
        name: 'キッチンカウンター',
        position: { x: 1.5, y: 0.75 },
        rotationDeg: 0,
        elevation: 0,
        size: { w: 2.55, d: 0.65, h: 0.85 },
        material: { baseColor: [0.35, 0.35, 0.37], roughness: 0.5, metallic: 0.1 },
      },
      {
        id: 'dining-table',
        name: 'ダイニングテーブル',
        position: { x: 3.1, y: 2.9 },
        rotationDeg: 0,
        elevation: 0,
        size: { w: 1.5, d: 0.85, h: 0.72 },
        material: { baseColor: [0.55, 0.42, 0.3], roughness: 0.6, metallic: 0 },
      },
      {
        id: 'sofa',
        name: 'ソファ',
        position: { x: 1.4, y: 5.7 },
        rotationDeg: 0,
        elevation: 0,
        size: { w: 1.9, d: 0.9, h: 0.75 },
        material: { baseColor: [0.45, 0.44, 0.42], roughness: 0.95, metallic: 0 },
      },
      {
        id: 'tv-board',
        name: 'TVボード',
        position: { x: 1.3, y: 7.85 },
        rotationDeg: 0,
        elevation: 0,
        size: { w: 1.8, d: 0.42, h: 0.4 },
        material: { baseColor: [0.3, 0.24, 0.18], roughness: 0.55, metallic: 0 },
      },
      {
        // 反射確認モードの対象: 低Roughnessの黒い面（消灯TV画面）
        id: 'tv',
        name: 'TV（反射確認用）',
        position: { x: 1.3, y: 7.8 },
        rotationDeg: 0,
        elevation: 0.45,
        size: { w: 1.45, d: 0.06, h: 0.84 },
        material: { baseColor: [0.02, 0.02, 0.025], roughness: 0.08, metallic: 0.4 },
      },
    ],
    luminaires: [
      downlight('dl-kitchen-1', dlMedium, 0.9, 0.75),
      downlight('dl-kitchen-2', dlMedium, 2.1, 0.75),
      downlight('dl-dining-1', dlDiffuse, 2.9, 2.5),
      downlight('dl-dining-2', dlDiffuse, 2.9, 3.3),
      downlight('dl-living-high-1', dlHigh, 1.0, 5.6, voidHeight),
      downlight('dl-living-high-2', dlHigh, 1.0, 7.2, voidHeight),
      downlight('dl-living-1', dlIes, 3.6, 5.6),
      downlight('dl-living-2', dlDiffuse, 3.6, 7.2),
      {
        id: 'spot-wall',
        preset: spot,
        position: { x: 3.6, y: 6.4 },
        mountHeight: ceilingHeight,
        aim: { tiltDeg: 35, panDeg: 0 },
        dimming: 1,
      },
    ],
  };
}
