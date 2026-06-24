import * as THREE from "three";
import { Sky } from "three/examples/jsm/objects/Sky.js";

export type SkyEnvironment = {
  texture: THREE.Texture;
  dispose(): void;
};

// 昼光の較正値(開始値、視覚確認で詰める)。Sky 環境=間接光(skylight)、太陽 DirectionalLight=鋭い影と方向感。
// Scene3D(常駐パストレ)と pathTracer.ts(PNG書き出し)で必ず同一値を使う(WYSIWYG)。
export const SKY_ENVIRONMENT_INTENSITY = 1.8;
export const SUN_INTENSITY_FACTOR = 5;

export type SkyEnvironmentOptions = {
  turbidity?: number;
  rayleigh?: number;
  mieCoefficient?: number;
  mieDirectionalG?: number;
};

// 物理ベースの大気散乱(Hosek-Wilkie)で空のIBLを生成する。Sky を CubeCamera で
// WebGLCubeRenderTarget(HDR)に焼き、CubeTexture を返す。
// WebGLPathTracer は CubeTexture を内部の CubeToEquirectGenerator で読める equirect DataTexture に
// 変換して IBL として取り込む(PMREM のCubeUVテクスチャは image.data を持たず updateFrom が落ちるため不可)。
// 更新後は updateEnvironment()+reset() が必須。
// sunDirection は DirectionalLight に渡すのと同一ベクトルを渡し、空の太陽位置と影の向きを必ず一致させる。
export const buildSkyEnvironment = (
  renderer: THREE.WebGLRenderer,
  sunDirection: THREE.Vector3,
  opts: SkyEnvironmentOptions = {}
): SkyEnvironment => {
  const sky = new Sky();
  sky.scale.setScalar(10000);

  const uniforms = sky.material.uniforms;
  uniforms.turbidity.value = opts.turbidity ?? 2;
  uniforms.rayleigh.value = opts.rayleigh ?? 1;
  uniforms.mieCoefficient.value = opts.mieCoefficient ?? 0.005;
  uniforms.mieDirectionalG.value = opts.mieDirectionalG ?? 0.8;
  // 太陽ディスクは強烈な点光源としてノイズ源になるため環境光としては消す(方向感は DirectionalLight が担う)。
  if (uniforms.showSunDisc) uniforms.showSunDisc.value = false;
  uniforms.sunPosition.value.copy(sunDirection).normalize();

  const skyScene = new THREE.Scene();
  skyScene.add(sky);

  // HDR キューブに焼く。空の輝度は 1 を超えるので HalfFloat で保持(LDR だとクランプされる)。
  const cubeTarget = new THREE.WebGLCubeRenderTarget(256, {
    type: THREE.HalfFloatType
  });
  const cubeCamera = new THREE.CubeCamera(0.1, 20000, cubeTarget);

  // トーンマッピングを環境に焼き込まない(IBL は線形のシーン参照値で保持する)。
  const prevToneMapping = renderer.toneMapping;
  renderer.toneMapping = THREE.NoToneMapping;
  cubeCamera.update(renderer, skyScene);
  renderer.toneMapping = prevToneMapping;

  return {
    texture: cubeTarget.texture,
    dispose() {
      cubeTarget.dispose();
      sky.geometry.dispose();
      sky.material.dispose();
    }
  };
};
