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

const neutralToneMap = (red: number, green: number, blue: number, exposure: number) => {
  let r = red * exposure;
  let g = green * exposure;
  let b = blue * exposure;
  const startCompression = 0.76;
  const minimum = Math.min(r, g, b);
  const offset = minimum < 0.08 ? minimum - 6.25 * minimum * minimum : 0.04;
  r -= offset;
  g -= offset;
  b -= offset;
  const peak = Math.max(r, g, b);
  if (peak < startCompression) return [r, g, b] as const;

  const d = 1 - startCompression;
  const newPeak = 1 - (d * d) / (peak + d - startCompression);
  const scale = newPeak / peak;
  r *= scale;
  g *= scale;
  b *= scale;
  const mix = 1 - 1 / (0.15 * (peak - newPeak) + 1);
  return [
    r * (1 - mix) + newPeak * mix,
    g * (1 - mix) + newPeak * mix,
    b * (1 - mix) + newPeak * mix
  ] as const;
};

const encodeSrgb = (value: number) => {
  const clamped = Math.min(1, Math.max(0, value));
  const encoded = clamped <= 0.0031308
    ? clamped * 12.92
    : 1.055 * Math.pow(clamped, 1 / 2.4) - 0.055;
  return Math.round(encoded * 255);
};

// WebGL's default framebuffer is transparent black in some Safari/Chromium
// WebGL2 combinations, even though the path-traced float target is valid.
// Read that completed target directly and apply the same fixed PBR Neutral
// tone map used by the interactive renderer before encoding the PNG.
const encodeCompletedTarget = (
  renderer: THREE.WebGLRenderer,
  target: THREE.WebGLRenderTarget,
  width: number,
  height: number,
  exposure: number
) => {
  const sourceWidth = target.width;
  const sourceHeight = target.height;
  const source = new Float32Array(sourceWidth * sourceHeight * 4);
  renderer.readRenderTargetPixels(target, 0, 0, sourceWidth, sourceHeight, source);

  const outputCanvas = document.createElement("canvas");
  outputCanvas.width = width;
  outputCanvas.height = height;
  const context = outputCanvas.getContext("2d");
  if (!context) throw new Error("画像書き出し用のCanvas 2Dコンテキストを作成できません。");

  const image = context.createImageData(width, height);
  for (let y = 0; y < height; y += 1) {
    const sourceRow = sourceHeight - 1 - Math.floor((y * sourceHeight) / height);
    for (let x = 0; x < width; x += 1) {
      const sourceX = Math.min(sourceWidth - 1, Math.floor((x * sourceWidth) / width));
      const sourceOffset = (sourceRow * sourceWidth + sourceX) * 4;
      const targetOffset = (y * width + x) * 4;
      const [r, g, b] = neutralToneMap(source[sourceOffset], source[sourceOffset + 1], source[sourceOffset + 2], exposure);
      image.data[targetOffset] = encodeSrgb(r);
      image.data[targetOffset + 1] = encodeSrgb(g);
      image.data[targetOffset + 2] = encodeSrgb(b);
      image.data[targetOffset + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
  return outputCanvas.toDataURL("image/png");
};

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
  // 編集ビュー(Scene3D)と同じ Neutral トーンマッピングで書き出しの見た目を揃える。
  renderer.toneMapping = THREE.NeutralToneMapping;
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
  pathTracer.renderToCanvas = false;
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
      dataUrl: encodeCompletedTarget(renderer, pathTracer.target, width, height, renderer.toneMappingExposure),
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
