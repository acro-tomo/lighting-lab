import * as THREE from "three";
import { WebGLPathTracer } from "three-gpu-pathtracer";
import { GenerateMeshBVHWorker } from "three-mesh-bvh/src/workers/index.js";
import { disposeScene } from "./geometry";
import { bouncesByMode, renderScaleByMode, sampleCountByMode, transmissiveBouncesByMode } from "./qualityPresets";
import { buildPathTraceScene } from "./sceneBuilder";
import type { PathTraceResult, RenderPathTracedImageOptions } from "./types";

const nextFrame = () =>
  new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });

export const supportsWebGL2 = () => {
  const canvas = document.createElement("canvas");
  return Boolean(canvas.getContext("webgl2"));
};

const applyPathTracerSceneUpdate = async ({
  pathTracer,
  scene,
  camera,
  onBuildProgress
}: {
  pathTracer: WebGLPathTracer;
  scene: THREE.Scene;
  camera: THREE.Camera;
  onBuildProgress?: (progress: number) => void;
}) => {
  console.info("[lighting-calibration] path tracer update", {
    geometry: "setSceneAsync(scene,camera)",
    camera: "updateCamera()+reset()",
    lights: "updateLights()+reset()",
    materials: "updateMaterials()+reset()",
    environment: "updateEnvironment()+reset()"
  });

  await pathTracer.setSceneAsync(scene, camera, { onProgress: onBuildProgress });
  pathTracer.updateCamera();
  pathTracer.reset();
  pathTracer.updateLights();
  pathTracer.reset();
  pathTracer.updateMaterials();
  pathTracer.reset();
  pathTracer.updateEnvironment();
  pathTracer.reset();
};

// ヘッダー「レンダリング開始」のPNG書き出し用。プロジェクトデータから
// 編集シーン(Scene3D)とは別の軽量レンダーシーンを buildPathTraceScene で再構築する。
export const renderPathTracedImage = async ({
  context,
  project,
  mode,
  debugMode,
  maxWidth = 1600,
  signal,
  onProgress
}: RenderPathTracedImageOptions): Promise<PathTraceResult> => {
  if (!supportsWebGL2()) {
    throw new Error("WebGL2が利用できないため、path tracingレンダリングを開始できません。");
  }

  const targetSamples = sampleCountByMode[mode];
  const start = performance.now();
  onProgress?.({
    samples: 0,
    targetSamples,
    elapsedMs: 0,
    phase: "preparing"
  });
  await nextFrame();

  const sourceWidth = Math.max(640, context.canvas.clientWidth || context.canvas.width || 1280);
  const sourceHeight = Math.max(360, context.canvas.clientHeight || context.canvas.height || 720);
  const width = Math.min(maxWidth, Math.round(sourceWidth));
  const height = Math.round(width * (sourceHeight / sourceWidth));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    preserveDrawingBuffer: true,
    powerPreference: "high-performance"
  });
  renderer.setPixelRatio(1);
  renderer.setSize(width, height, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = context.gl.toneMappingExposure;

  const camera = context.camera.clone() as THREE.PerspectiveCamera;
  if (camera instanceof THREE.PerspectiveCamera) {
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
  camera.updateMatrixWorld(true);

  const { scene, skyEnv } = buildPathTraceScene(renderer, project, debugMode);
  const pathTracer = new WebGLPathTracer(renderer);
  const bvhWorker = new GenerateMeshBVHWorker();
  pathTracer.renderDelay = 0;
  pathTracer.fadeDuration = 0;
  pathTracer.minSamples = 1;
  pathTracer.renderScale = renderScaleByMode[mode];
  pathTracer.dynamicLowRes = false;
  pathTracer.lowResScale = 0.25;
  pathTracer.multipleImportanceSampling = true;
  pathTracer.bounces = bouncesByMode[mode];
  pathTracer.transmissiveBounces = transmissiveBouncesByMode[mode];
  pathTracer.rasterizeScene = false;
  const tileCount = mode === "ultra" ? 2 : 1;
  pathTracer.tiles.set(tileCount, tileCount);
  pathTracer.setBVHWorker(bvhWorker);

  try {
    if (signal?.aborted) {
      throw new DOMException("レンダリングを停止しました。", "AbortError");
    }

    await applyPathTracerSceneUpdate({
      pathTracer,
      scene,
      camera,
      onBuildProgress: (buildProgress) => {
        onProgress?.({
          samples: 0,
          targetSamples,
          elapsedMs: performance.now() - start,
          phase: "bvh",
          buildProgress
        });
      }
    });

    if (signal?.aborted) {
      throw new DOMException("レンダリングを停止しました。", "AbortError");
    }

    let lastSample = -1;
    while (pathTracer.samples < targetSamples) {
      if (signal?.aborted) {
        throw new DOMException("レンダリングを停止しました。", "AbortError");
      }

      pathTracer.renderSample();
      const samples = Math.floor(pathTracer.samples);
      if (samples !== lastSample) {
        lastSample = samples;
        onProgress?.({
          samples,
          targetSamples,
          elapsedMs: performance.now() - start,
          phase: "sampling"
        });
      }
      await nextFrame();
    }

    const elapsedMs = performance.now() - start;
    onProgress?.({ samples: targetSamples, targetSamples, elapsedMs, phase: "complete" });

    return {
      dataUrl: canvas.toDataURL("image/png"),
      samples: targetSamples,
      elapsedMs,
      width,
      height
    };
  } finally {
    pathTracer.dispose();
    bvhWorker.dispose();
    disposeScene(scene);
    skyEnv?.dispose();
    renderer.dispose();
  }
};
