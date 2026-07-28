import type * as THREE from "three";
import { light_sampling_functions } from "three-gpu-pathtracer/src/shader/sampling/light_sampling_functions.glsl.js";

// three-gpu-pathtracer の IES サンプリングを θ のみ → θ/φ 二次元へ差し替える。
//
// 上流の getPhotometricAttenuation は基底ベクトル u/v を引数で受け取りながら本体で
// 使わず、iesProfiles を vec3(θ, 0.0, layer) で引いている（1次元＝軸対称）。
// 一方 iesProfiles の実体は RenderTarget2DArray(360, 180) で既に2次元なので、
// サンプリング式だけ置き換えれば非対称配光を描ける。フォークは避け、
// ShaderMaterial の fragmentShader 文字列を差し替える最小の介入に留める。
//
// φ は「光源から出ていく向き」で測る（IES原文の水平角の定義）。posToLight は
// 面→光源なので符号を反転する。dot(proj, v) 側にマイナスを付けているのは、
// 測光側 localAngles の φ 進行方向（ref → cross(axis, ref)）と一致させるため。

const NEEDLE = "return texture2D( iesProfiles, vec3( angle, 0.0, iesProfile ) ).r;";

const REPLACEMENT = /* glsl */ `
		vec3 iesOutgoing = - posToLight;
		vec3 iesProjected = iesOutgoing - lightDir * dot( iesOutgoing, lightDir );
		float iesPhi = 0.0;
		if ( dot( iesProjected, iesProjected ) > 1e-12 ) {
			iesPhi = atan( - dot( iesProjected, v ), dot( iesProjected, u ) );
		}
		float iesPhiNorm = iesPhi / ( 2.0 * PI );
		iesPhiNorm = iesPhiNorm - floor( iesPhiNorm );
		return texture2D( iesProfiles, vec3( angle, iesPhiNorm, iesProfile ) ).r;
`;

/**
 * 導入済みの three-gpu-pathtracer に差し替え対象の実装が入っているか。
 * ロード時に確定するので、パストレーサ生成前でもUIが実態どおりに表示できる。
 * ライブラリ更新でこれが false になったらテストが落ちる（iesShaderPatch.test.ts）。
 */
export const IES_2D_SUPPORTED = light_sampling_functions.includes(NEEDLE);

let warned = false;

/**
 * パストレ用マテリアルのシェーダを差し替える。上流の実装が変わって目印の行が
 * 見つからない場合は何もせず false を返す（描画は φ=0 断面に留まり、破綻はしない）。
 */
export const patchIesSampling = (material: THREE.ShaderMaterial | undefined | null): boolean => {
  if (!material || typeof material.fragmentShader !== "string") return false;
  if (!material.fragmentShader.includes(NEEDLE)) {
    // 既にパッチ済みのマテリアルを再度渡された場合は成功扱い。
    if (material.fragmentShader.includes("iesPhiNorm")) return true;
    if (!warned) {
      warned = true;
      console.warn(
        "[ies] three-gpu-pathtracer のIESサンプリング箇所が見つかりませんでした。非対称配光は φ=0 断面で描画されます。"
      );
    }
    return false;
  }
  material.fragmentShader = material.fragmentShader.replace(NEEDLE, REPLACEMENT);
  material.needsUpdate = true;
  return true;
};

/** WebGLPathTracer から内部マテリアルを取り出してパッチする。 */
export const patchPathTracerIes = (tracer: unknown): boolean => {
  const material = (tracer as { _pathTracer?: { material?: THREE.ShaderMaterial } })._pathTracer
    ?.material;
  return patchIesSampling(material);
};
