/**
 * レンダラー抽象化。
 *
 * - WebGPU を第一候補、非対応環境では WebGL2 へ自動フォールバック
 *   （three.js WebGPURenderer のバックエンド切替を利用）
 * - トーンマッピング: Khronos PBR Neutral（ACES不使用 — 壁・床の色相が転ぶため）
 * - 露出: 固定露出が既定。自動露出は実装しない（比較表示の一貫性のため、
 *   露出値は明示的な EV オフセットのみで変更する）
 * - 出力: sRGB（three の既定 outputColorSpace）
 *
 * 将来フェーズでレンダラー実装を差し替えられるよう、外部にはこの
 * RendererHandle インターフェースだけを公開する。
 */
import * as THREE from 'three/webgpu';

/**
 * 基準露出。lx オーダーの物理光量（拡散面輝度 ≈ E·ρ/π）を
 * PBR Neutral の有効域（〜1.0）へ写像する係数。
 * 150lx・反射率0.5 の面が中間調になるよう選定。
 */
export const BASE_EXPOSURE = 0.02;

export type BackendKind = 'webgpu' | 'webgl2';

export interface RendererHandle {
  readonly backend: BackendKind;
  readonly three: THREE.WebGPURenderer;
  readonly domElement: HTMLCanvasElement;
  setSize(width: number, height: number, pixelRatio: number): void;
  /** 固定露出。EV オフセット（0 = 基準）で指定 */
  setExposureEv(ev: number): void;
  getExposureEv(): number;
  setAnimationLoop(callback: (() => void) | null): void;
  render(scene: THREE.Scene, camera: THREE.Camera): void;
  dispose(): void;
}

export async function createRenderer(
  canvas: HTMLCanvasElement,
  options?: { forceWebGL?: boolean },
): Promise<RendererHandle> {
  const renderer = new THREE.WebGPURenderer({
    canvas,
    antialias: true,
    forceWebGL: options?.forceWebGL === true,
  });
  await renderer.init();

  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = BASE_EXPOSURE;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const backend: BackendKind =
    (renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend === true
      ? 'webgpu'
      : 'webgl2';

  let exposureEv = 0;

  return {
    backend,
    three: renderer,
    domElement: renderer.domElement as HTMLCanvasElement,
    setSize(width, height, pixelRatio) {
      renderer.setPixelRatio(pixelRatio);
      renderer.setSize(width, height, false);
    },
    setExposureEv(ev) {
      exposureEv = ev;
      renderer.toneMappingExposure = BASE_EXPOSURE * Math.pow(2, ev);
    },
    getExposureEv: () => exposureEv,
    setAnimationLoop(callback) {
      renderer.setAnimationLoop(callback);
    },
    render(scene, camera) {
      renderer.render(scene, camera);
    },
    dispose() {
      renderer.setAnimationLoop(null);
      renderer.dispose();
    },
  };
}
