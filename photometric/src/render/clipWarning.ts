/**
 * 白飛び警告表示。
 *
 * シーンを HDR のまま pass ノードで受け、トーンマップ前の輝度 × 露出が
 * 1.0（PBR Neutral の表示上限）を超える画素を赤ストライプで強調する。
 * 警告判定は lx 計算とは無関係の「表示上の飽和」検出であり、
 * 露出を変えると警告領域が変わるのは仕様どおり（固定露出の確認用）。
 */
import * as THREE from 'three/webgpu';
import {
  Fn,
  float,
  fract,
  mix,
  pass,
  renderOutput,
  screenCoordinate,
  select,
  step,
  uniform,
  vec3,
  vec4,
} from 'three/tsl';

export interface ClipWarningPipeline {
  render(scene: THREE.Scene, camera: THREE.Camera): void;
  dispose(): void;
}

export function createClipWarningPipeline(
  renderer: THREE.WebGPURenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
): ClipWarningPipeline {
  const exposure = uniform(1);
  const scenePass = pass(scene, camera);
  const hdrColor = scenePass.getTextureNode();

  const output = Fn(() => {
    const luminance = hdrColor.rgb.dot(vec3(0.2126729, 0.7151522, 0.072175)).mul(exposure);
    const clipped = luminance.greaterThan(float(1));
    const base = renderOutput(hdrColor);
    // 斜めストライプで塗る（点滅させない静的表示）
    const stripe = step(float(0.5), fract(screenCoordinate.x.add(screenCoordinate.y).mul(0.12)));
    const warnColor = mix(vec3(0.85, 0.1, 0.1), vec3(1.0, 0.75, 0.2), stripe);
    return vec4(mix(base.rgb, warnColor, select(clipped, float(0.85), float(0))), base.a);
  })();

  const post = new THREE.PostProcessing(renderer);
  post.outputColorTransform = false; // renderOutput を自前で通すため二重変換を防ぐ
  post.outputNode = output;

  return {
    render() {
      exposure.value = renderer.toneMappingExposure;
      post.render();
    },
    dispose() {
      post.dispose();
    },
  };
}
