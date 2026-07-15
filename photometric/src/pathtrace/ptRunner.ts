/**
 * 停止時・保存時プログレッシブパストレーサー（Phase 3）。
 *
 * 操作が止まったら編集ビューの上にオーバーレイキャンバスを重ね、
 * three-gpu-pathtracer（WebGL2・NEE＋MIS・多重バウンス）で同一シーン・
 * 同一カメラ・同一露出/トーンマッピング（PBR Neutral）の物理GI画像を
 * 漸進的に収束させる。操作再開で即座に消えて編集ビューへ戻る。
 *
 * lx 計算とは完全に独立（見た目確認・書き出し用）。
 */
import * as THREE from 'three';
import { WebGLPathTracer } from 'three-gpu-pathtracer';
// BVH構築をWorkerへ逃がす（setSceneAsync の必須依存）
import { GenerateMeshBVHWorker } from 'three-mesh-bvh/src/workers/index.js';
import type { Luminaire, SceneModel } from '../core/types';
import type { LightDistribution } from '../photometry/distribution';
import { buildPtScene, disposePtScene, type PtSceneResult } from './ptScene';

export interface PtStartParams {
  model: SceneModel;
  displayRoots: { traverse(cb: (o: unknown) => void): void }[];
  resolveDistribution: (lum: Luminaire) => LightDistribution | null;
  camera: {
    fov: number;
    aspect: number;
    position: { x: number; y: number; z: number };
    quaternion: { x: number; y: number; z: number; w: number };
  };
  width: number;
  height: number;
  toneMappingExposure: number;
  /** 内部レンダー解像度スケール（モバイル負荷対策） */
  renderScale?: number;
}

export class PathTraceRunner {
  readonly canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer | null = null;
  private pathTracer: WebGLPathTracer | null = null;
  private current: PtSceneResult | null = null;
  private readonly camera = new THREE.PerspectiveCamera();
  private active = false;
  private rafId = 0;
  private starting = false;

  constructor(
    container: HTMLElement,
    private readonly onProgress: (state: { samples: number; building: boolean }) => void,
  ) {
    this.canvas = document.createElement('canvas');
    this.canvas.style.cssText =
      'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;display:none;';
    container.appendChild(this.canvas);
  }

  get isActive(): boolean {
    return this.active || this.starting;
  }

  get samples(): number {
    return this.pathTracer ? Math.floor(this.pathTracer.samples) : 0;
  }

  private ensureRenderer(): { renderer: THREE.WebGLRenderer; pathTracer: WebGLPathTracer } {
    if (!this.renderer) {
      this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false });
      this.renderer.toneMapping = THREE.NeutralToneMapping;
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.pathTracer = new WebGLPathTracer(this.renderer);
      this.pathTracer.setBVHWorker(new GenerateMeshBVHWorker());
      this.pathTracer.bounces = 4; // 仕様: 2〜4バウンス
      this.pathTracer.filterGlossyFactor = 0.5;
      this.pathTracer.renderDelay = 0;
      this.pathTracer.fadeDuration = 0;
      this.pathTracer.tiles.set(2, 2); // 1サンプルを分割してUIのカクつきを抑える
    }
    return { renderer: this.renderer, pathTracer: this.pathTracer! };
  }

  /** 現在のシーン・カメラでパストレースを開始（既存の実行は破棄） */
  async start(params: PtStartParams): Promise<void> {
    this.stop();
    this.starting = true;
    const { renderer, pathTracer } = this.ensureRenderer();

    renderer.toneMappingExposure = params.toneMappingExposure;
    renderer.setPixelRatio(1);
    renderer.setSize(params.width, params.height, false);
    pathTracer.renderScale = params.renderScale ?? 1;

    this.camera.fov = params.camera.fov;
    this.camera.aspect = params.camera.aspect;
    this.camera.near = 0.05;
    this.camera.far = 100;
    this.camera.position.set(params.camera.position.x, params.camera.position.y, params.camera.position.z);
    this.camera.quaternion.set(
      params.camera.quaternion.x,
      params.camera.quaternion.y,
      params.camera.quaternion.z,
      params.camera.quaternion.w,
    );
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();

    if (this.current) {
      disposePtScene(this.current);
      this.current = null;
    }
    this.current = buildPtScene(params.model, params.displayRoots, params.resolveDistribution);

    this.onProgress({ samples: 0, building: true });
    await pathTracer.setSceneAsync(this.current.scene, this.camera);
    if (!this.starting) return; // ビルド中に stop された

    this.starting = false;
    this.active = true;
    this.canvas.style.display = 'block';

    const loop = (): void => {
      if (!this.active || !this.pathTracer) return;
      this.pathTracer.renderSample();
      this.onProgress({ samples: this.samples, building: false });
      this.rafId = requestAnimationFrame(loop);
    };
    loop();
  }

  /** 露出変更の反映（再収束は不要。トーンマップは表示時に適用される） */
  setExposure(toneMappingExposure: number): void {
    if (this.renderer) this.renderer.toneMappingExposure = toneMappingExposure;
  }

  stop(): void {
    this.starting = false;
    if (!this.active) return;
    this.active = false;
    cancelAnimationFrame(this.rafId);
    this.canvas.style.display = 'none';
    if (this.current) {
      disposePtScene(this.current);
      this.current = null;
    }
  }

  /** 現在の収束画像を PNG として保存 */
  savePng(filename = 'render.png'): void {
    if (!this.renderer) return;
    this.canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    }, 'image/png');
  }
}
