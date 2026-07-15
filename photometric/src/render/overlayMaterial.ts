/**
 * トーンマッピング・露出の影響を受けないオーバーレイ用マテリアル。
 *
 * three の WebGPU 系レンダラーはフレーム全体を HDR ターゲットに描画した後、
 * 出力パスで一括してトーンマッピング（×露出）を適用するため、
 * material.toneMapped=false は存在しない（ビルドに参照が無い）。
 *
 * そこでオーバーレイの色に 1/toneMappingExposure を乗じておく。
 * 出力パスの ×exposure で打ち消され、Khronos PBR Neutral は入力 0.8 未満で
 * 恒等写像なので、意図した sRGB 色がそのまま表示される
 * （凡例・ヒートマップの色は全チャンネル linear 0.8 未満に収まる）。
 * 露出 EV を変えても invExposure を毎フレーム同期するため色は不変。
 */
import * as THREE from 'three/webgpu';
import { texture as textureNode, uniform, vec4 } from 'three/tsl';

const invExposure = uniform(1);

/** 毎フレーム、現在の toneMappingExposure を渡して同期する */
export function syncOverlayExposure(toneMappingExposure: number): void {
  invExposure.value = toneMappingExposure > 0 ? 1 / toneMappingExposure : 1;
}

/** 露出非依存の unlit テクスチャマテリアル（ヒートマップ用） */
export function overlayTextureMaterial(map: THREE.Texture): THREE.MeshBasicNodeMaterial {
  const material = new THREE.MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const sampled = textureNode(map);
  material.colorNode = vec4(sampled.rgb.mul(invExposure), sampled.a);
  return material;
}

/** 露出非依存の unlit 単色マテリアル（プローブマーカー等） */
export function overlayColorMaterial(r: number, g: number, b: number): THREE.MeshBasicNodeMaterial {
  const material = new THREE.MeshBasicNodeMaterial();
  const color = new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace);
  material.colorNode = vec4(
    uniform(color.r).mul(invExposure),
    uniform(color.g).mul(invExposure),
    uniform(color.b).mul(invExposure),
    1,
  );
  return material;
}
