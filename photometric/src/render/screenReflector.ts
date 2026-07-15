/**
 * 平滑面（消灯TV画面・鏡など roughness の非常に低い面）の平面反射。
 *
 * 点光源のGGXハイライトだけでは「光源の点が写るだけ」で映り込みとして
 * 成立しないため、three の ReflectorNode（鏡映カメラで実シーンを再描画）で
 * 部屋の像そのもの（器具の発光面の大きさ・床の光だまり・家具）を映す。
 * 反射像は Schlick フレネル（F0=0.04 の誘電体ガラス面）で減衰させる。
 *
 * 表示専用: 照度計算・遮蔽判定には一切関与しない。反射に使う像は
 * 直接光で描画された実シーンなので、存在しない光を捏造しない。
 */
import * as THREE from 'three/webgpu';
import { float, normalView, positionViewDirection, reflector } from 'three/tsl';
import type { Furniture } from '../core/types';

/** これ以下の roughness の家具正面を「鏡面スクリーン」として扱う */
export const SCREEN_ROUGHNESS_MAX = 0.15;

export const SCREEN_MESH_NAME = 'screen-reflector';

interface ReflectorHandle {
  dispose?: () => void;
}

/**
 * 家具（直方体）の正面（ローカル+Z面）に反射スクリーンを追加する。
 * display メッシュの子にするためドラッグ移動に追従する。
 */
export function addScreenReflector(display: THREE.Mesh, item: Furniture): void {
  const refl = reflector({ resolutionScale: 0.5 });

  const material = new THREE.MeshPhysicalNodeMaterial({
    color: 0x000000,
    roughness: item.material.roughness,
    metalness: item.material.metallic,
  });
  // Schlick 近似: F = F0 + (1−F0)(1−cosθ)^5、F0 = 0.04（ガラス面）
  const cosTheta = normalView.dot(positionViewDirection).clamp(0, 1);
  const fresnel = float(0.04).add(cosTheta.oneMinus().pow(5).mul(0.96));
  material.emissiveNode = refl.rgb.mul(fresnel);

  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(item.size.w * 0.96, item.size.h * 0.92),
    material,
  );
  screen.name = SCREEN_MESH_NAME;
  screen.position.set(0, 0, item.size.d / 2 + 0.002);
  // ReflectorNode は target のローカル+Zを鏡面法線とする（プレーン法線と一致）
  screen.add(refl.target);
  screen.userData.reflector = refl;
  display.add(screen);
}

/** 家具再構築時のリソース解放（レンダーターゲットのリーク防止） */
export function disposeScreenReflectors(root: THREE.Object3D): void {
  root.traverse((obj) => {
    const handle = obj.userData.reflector as ReflectorHandle | undefined;
    handle?.dispose?.();
  });
}
