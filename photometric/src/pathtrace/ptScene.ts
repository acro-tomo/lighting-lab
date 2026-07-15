/**
 * パストレース用シーンの再構築（Phase 3）。
 *
 * 編集ビュー（three/webgpu・NodeMaterial）とは別に、プレーンな three +
 * three-gpu-pathtracer 用のシーンを SceneModel と編集シーンのメッシュから
 * 組み立てる。ジオメトリは編集シーンのものを共有（単一ソース）、
 * マテリアルはプレーン MeshPhysicalMaterial へ写像する。
 *
 * 光源は PhysicalSpotLight:
 * - iesMap: CPU測光・ラスタ描画と同一の LightDistribution から生成した
 *   減衰プロファイル（θ 1D）。単一データソース原則を維持
 * - intensity: ピーク光度 [cd] × 調光率（ラスタ・測光と同一）
 * - radius: 発光面半径（apertureDiameter/2）→ ソフトシャドウ
 */
import * as THREE from 'three';
import { PhysicalSpotLight } from 'three-gpu-pathtracer';
import { cctToLinearRgb } from '../core/color';
import type { Luminaire, SceneModel } from '../core/types';
import { beamDistribution, type LightDistribution } from '../photometry/distribution';
import { buildAttenuationProfile, aimToAxis, planToWorld } from '../render/lights';
import { SCREEN_MESH_NAME } from '../render/screenReflector';

export interface PtSceneResult {
  scene: THREE.Scene;
  lights: PhysicalSpotLight[];
}

interface SourceMaterialLike {
  color: { r: number; g: number; b: number };
  roughness: number;
  metalness: number;
  side: number;
  emissive?: { r: number; g: number; b: number };
  emissiveIntensity?: number;
  transparent?: boolean;
  opacity?: number;
  colorWrite?: boolean;
}

function toPlainMaterial(source: SourceMaterialLike): THREE.MeshPhysicalMaterial {
  const material = new THREE.MeshPhysicalMaterial({
    roughness: source.roughness,
    metalness: source.metalness,
    side: source.side as THREE.Side,
  });
  material.color.setRGB(source.color.r, source.color.g, source.color.b);
  if (source.emissive && (source.emissiveIntensity ?? 0) > 0) {
    material.emissive.setRGB(source.emissive.r, source.emissive.g, source.emissive.b);
    material.emissiveIntensity = source.emissiveIntensity ?? 1;
  }
  if (source.transparent && source.opacity !== undefined) {
    material.transparent = true;
    material.opacity = source.opacity;
  }
  return material;
}

/** 編集シーンの表示メッシュ群から PT シーンへメッシュを写像する */
function copyMeshes(sourceRoot: { traverse(cb: (o: unknown) => void): void }, target: THREE.Scene): void {
  sourceRoot.traverse((obj) => {
    const mesh = obj as {
      isMesh?: boolean;
      name: string;
      geometry: THREE.BufferGeometry;
      material: SourceMaterialLike;
      matrixWorld: { elements: number[] };
      visible: boolean;
    };
    if (mesh.isMesh !== true) return;
    if (!mesh.visible) return;
    if (mesh.name === SCREEN_MESH_NAME) return; // 平面反射はPTでは実反射に置き換わる
    if (mesh.material.colorWrite === false) return; // 遮蔽専用メッシュ（表示メッシュが同形状）
    if (mesh.name === 'heatmap' || mesh.name === 'probe-marker') return;
    // ジオメトリは共有（同一バージョンの three ビルド間で構造互換）
    const plain = new THREE.Mesh(mesh.geometry, toPlainMaterial(mesh.material));
    plain.matrixAutoUpdate = false;
    plain.matrix.fromArray(mesh.matrixWorld.elements);
    plain.matrix.decompose(plain.position, plain.quaternion, plain.scale);
    plain.matrixAutoUpdate = true;
    target.add(plain);
  });
}

function buildPtLight(lum: Luminaire, distribution: LightDistribution | null): PhysicalSpotLight {
  const dist = distribution ?? beamDistribution(lum.preset.flux, lum.preset.beamAngleDeg);
  const profile = buildAttenuationProfile(dist);

  const light = new PhysicalSpotLight();
  const [r, g, b] = cctToLinearRgb(lum.preset.cct);
  light.color.setRGB(r, g, b);
  light.intensity = profile.peak * lum.dimming;
  light.decay = 2;
  light.distance = 0;
  light.penumbra = 0.5;
  // 発光面寸法 → ソフトシャドウ（IESには含まれない独立データ）
  light.radius = Math.max(0.005, lum.preset.apertureDiameter / 2);

  // コーン角: プロファイルが非ゼロな範囲をカバー（NEE の無駄撃ちを減らす）
  let lastNonZero = 0;
  for (let i = 0; i < profile.data.length; i++) {
    if (profile.data[i]! > 1e-4) lastNonZero = i;
  }
  const support = ((lastNonZero + 1) / (profile.data.length - 1)) * Math.PI;
  light.angle = Math.min(Math.PI / 2 - 1e-3, support + 0.05);

  const iesMap = new THREE.DataTexture(profile.data, profile.data.length, 1, THREE.RedFormat, THREE.FloatType);
  iesMap.minFilter = THREE.LinearFilter;
  iesMap.magFilter = THREE.LinearFilter;
  iesMap.needsUpdate = true;
  // 実装は iesMap を参照する（d.ts の iesTexture は実体と不一致）
  (light as unknown as { iesMap: THREE.DataTexture }).iesMap = iesMap;

  const position = planToWorld(lum.position, lum.mountHeight);
  light.position.set(position.x, position.y, position.z);
  const axis = aimToAxis(lum.aim);
  light.target.position.set(position.x + axis.x, position.y + axis.y, position.z + axis.z);
  light.updateMatrixWorld();
  light.target.updateMatrixWorld();
  return light;
}

/**
 * PT シーンを構築する。
 * @param model シーンモデル（光源定義）
 * @param displayRoots 編集シーンの表示ルート（建築・家具グループ）
 * @param resolveDistribution IES 解決（測光系と同一のもの）
 */
export function buildPtScene(
  model: SceneModel,
  displayRoots: { traverse(cb: (o: unknown) => void): void }[],
  resolveDistribution: (lum: Luminaire) => LightDistribution | null,
): PtSceneResult {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x07080b);

  for (const root of displayRoots) copyMeshes(root, scene);

  const lights: PhysicalSpotLight[] = [];
  for (const lum of model.luminaires) {
    const light = buildPtLight(lum, resolveDistribution(lum));
    scene.add(light);
    scene.add(light.target);
    lights.push(light);
  }

  return { scene, lights };
}

export function disposePtScene(result: PtSceneResult): void {
  result.scene.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if ((mesh as { isMesh?: boolean }).isMesh === true) {
      // ジオメトリは編集シーンと共有しているため破棄しない
      (mesh.material as THREE.Material).dispose();
    }
  });
  for (const light of result.lights) {
    (light as unknown as { iesMap: THREE.DataTexture | null }).iesMap?.dispose();
  }
}
