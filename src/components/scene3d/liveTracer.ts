import { useFrame, useThree } from "@react-three/fiber";
import { useCallback, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { DenoiseMaterial, WebGLPathTracer } from "three-gpu-pathtracer";
import { GenerateMeshBVHWorker } from "three-mesh-bvh/src/workers/index.js";
import { FullScreenQuad } from "three/examples/jsm/postprocessing/Pass.js";
import type { RenderDebugMode } from "../../rendering/pathTracer";
import type { RenderContext } from "../../rendering/renderContext";
import {
  buildSkyEnvironment,
  SKY_ENVIRONMENT_INTENSITY,
  type SkyEnvironment
} from "../../rendering/skyEnvironment";
import type { Project } from "../../types";
import { DEFAULT_DAYLIGHT, sunVector } from "../../utils/sun";
import type { LiveTraceStatus } from "./types";

// ビューポートをそのままパストレで描画する常駐レンダラー。
// - 編集用R3Fシーンを単一の真実として共有し、二重定義をなくす（WYSIWYG）。
// - カメラ移動中は dynamicLowRes が即時の低解像度像を出し、停止すると数秒で
//   間接光込みの写実画像に収束する。
// - mount/unmount で R3F の自動描画を奪う/返す（useFrame priority 1）。

// これ以上サンプルしても視覚差がほぼ出ないため打ち切り、GPUを解放する。
// カメラ操作やシーン編集で reset されると samples が 0 に戻り自動再開する。
const LIVE_TRACE_TARGET_SAMPLES = 512;
const pathTraceSceneKey = (project: Project, debugMode: RenderDebugMode) =>
  JSON.stringify({
    debugMode,
    activeFloor: project.activeFloor ?? 1,
    showCeiling: project.showCeiling,
    room: {
      widthM: project.room.widthM,
      depthM: project.room.depthM,
      ceilingHeightM: project.room.ceilingHeightM,
      floorLevelM: project.room.floorLevelM ?? 0
    },
    walls: project.walls.map(({ id, start, end, thicknessM, heightM, innerSide, kind, floor }) => ({
      id,
      start,
      end,
      thicknessM,
      heightM,
      innerSide,
      kind,
      floor
    })),
    windows: project.windows.map(({ id, wallId, centerRatio, widthM, heightM, sillHeightM, hasGlass, style, floor }) => ({
      id,
      wallId,
      centerRatio,
      widthM,
      heightM,
      sillHeightM,
      hasGlass,
      style,
      floor
    })),
    furniture: project.furniture.map(({ id, type, position, size, rotationYDeg, floor }) => ({
      id,
      type,
      position,
      size,
      rotationYDeg,
      floor
    })),
    lights: project.lights.map(({ id, type, model, position, mountHeightM, rotationDeg, target, lengthM, cordLengthM, floor }) => ({
      id,
      type,
      model,
      position,
      mountHeightM,
      rotationDeg,
      target,
      lengthM,
      cordLengthM,
      floor
    })),
    voids: project.voids.map(({ id, center, size, openSides, floor }) => ({ id, center, size, openSides, floor })),
    ceilingZones: (project.ceilingZones ?? []).map(({ id, center, size, dropM, floor }) => ({ id, center, size, dropM, floor })),
    floorZones: (project.floorZones ?? []).map(({ id, center, size, dropM, floor }) => ({ id, center, size, dropM, floor }))
  });

const pathTraceLightsKey = (project: Project) =>
  JSON.stringify(
    project.lights.map(
      ({ id, type, model, position, mountHeightM, rotationDeg, target, lumens, colorTemperatureK, dimmer, enabled, beamAngleDeg, penumbra, castsShadow, lengthM, cordLengthM, floor }) => ({
        id,
        type,
        model,
        position,
        mountHeightM,
        rotationDeg,
        target,
        lumens,
        colorTemperatureK,
        dimmer,
        enabled,
        beamAngleDeg,
        penumbra,
        castsShadow,
        lengthM,
        cordLengthM,
        floor
      })
    )
  );

const pathTraceMaterialsKey = (project: Project, debugMode: RenderDebugMode) =>
  JSON.stringify({
    debugMode,
    materials: project.materials,
    wallMaterials: project.walls.map(({ id, materialId }) => ({ id, materialId })),
    furnitureMaterials: project.furniture.map(({ id, materialId, color, roughness, metalness }) => ({
      id,
      materialId,
      color,
      roughness,
      metalness
    }))
  });

const pathTraceDaylightKey = (project: Project) =>
  JSON.stringify(project.daylight ?? DEFAULT_DAYLIGHT);

export const PathTracerController = ({
  project,
  debugMode,
  onStatus
}: {
  project: Project;
  debugMode: RenderDebugMode;
  onStatus?: (status: LiveTraceStatus) => void;
}) => {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const camera = useThree((state) => state.camera);
  const tracerRef = useRef<WebGLPathTracer | null>(null);
  const workerRef = useRef<GenerateMeshBVHWorker | null>(null);
  const readyRef = useRef(false);
  const lastMatrix = useRef(new THREE.Matrix4());
  const lastReported = useRef(-1);
  const buildTokenRef = useRef(0);
  const sceneKey = useMemo(() => pathTraceSceneKey(project, debugMode), [project, debugMode]);
  const lightsKey = useMemo(() => pathTraceLightsKey(project), [project]);
  const materialsKey = useMemo(() => pathTraceMaterialsKey(project, debugMode), [project, debugMode]);
  const daylightKey = useMemo(() => pathTraceDaylightKey(project), [project]);
  const sceneKeyRef = useRef(sceneKey);
  const builtSceneKeyRef = useRef<string | null>(null);
  sceneKeyRef.current = sceneKey;

  const rebuildScene = useCallback((tracer: WebGLPathTracer, nextSceneKey: string) => {
    const buildToken = ++buildTokenRef.current;
    readyRef.current = false;
    lastReported.current = -1;
    onStatus?.({ phase: "building", samples: 0 });
    scene.updateMatrixWorld(true);
    return tracer
      .setSceneAsync(scene, camera)
      .then(() => {
        if (tracerRef.current !== tracer || buildTokenRef.current !== buildToken) return;
        if (sceneKeyRef.current !== nextSceneKey) {
          builtSceneKeyRef.current = nextSceneKey;
          void rebuildScene(tracer, sceneKeyRef.current);
          return;
        }
        tracer.updateEnvironment();
        tracer.reset();
        tracer.updateLights();
        tracer.reset();
        tracer.updateMaterials();
        tracer.reset();
        readyRef.current = true;
        builtSceneKeyRef.current = nextSceneKey;
        lastMatrix.current.copy(camera.matrixWorld);
        onStatus?.({ phase: "rendering", samples: 0 });
      })
      .catch(() => undefined);
  }, [camera, scene, onStatus]);

  // 常駐パストレ時のみ scene.environment に物理ベースの空(Sky→PMREM)を入れる。
  // WebGLPathTracer は scene.background 単色を「見える背景」としか扱わず環境光に
  // しないため、environment + environmentIntensity がないと直射の当たらない壁が暗い。
  // ラスター編集を汚さないよう、このコントローラの mount 中だけ設定し unmount で戻す。
  // daylight 変更時は Sky を作り直し、tracer が既にあれば updateEnvironment+reset で反映する。
  useEffect(() => {
    const daylight = project.daylight ?? DEFAULT_DAYLIGHT;
    const sun = sunVector(daylight);
    const enabled = daylight.enabled && sun.altitudeDeg > 0;
    const prevEnv = scene.environment;
    const prevBackground = scene.background;
    const prevIntensity = scene.environmentIntensity;

    let skyEnv: SkyEnvironment | null = null;
    if (enabled) {
      skyEnv = buildSkyEnvironment(gl, sun.dir);
      scene.environment = skyEnv.texture;
      scene.background = skyEnv.texture;
      scene.environmentIntensity = SKY_ENVIRONMENT_INTENSITY;
    } else {
      // 夜は環境光をほぼ無くし、照明だけで照らす。
      const night = new THREE.Color("#050504");
      scene.environment = null;
      scene.background = night;
      scene.environmentIntensity = 1;
    }

    // 初回 mount では tracer 生成 useEffect 内の setSceneAsync 完了時に updateEnvironment が走る。
    // ここでは tracer が既にある(daylight 変更など)場合だけ即反映する。
    const tracer = tracerRef.current;
    if (tracer && readyRef.current) {
      tracer.updateEnvironment();
      tracer.reset();
    }

    return () => {
      scene.environment = prevEnv;
      scene.background = prevBackground;
      scene.environmentIntensity = prevIntensity;
      skyEnv?.dispose();
    };
  }, [scene, gl, daylightKey]);

  useEffect(() => {
    const worker = new GenerateMeshBVHWorker();
    const tracer = new WebGLPathTracer(gl);
    tracer.setBVHWorker(worker);
    tracer.multipleImportanceSampling = true;
    // 夜の室内GIは5バウンスでほぼ収束し、8比でサンプル/秒が大きく上がる（待ち時間優先）。
    tracer.bounces = 5;
    tracer.transmissiveBounces = 3;
    // グロッシー反射のファイアフライを抑える（0=無効、大きいほどぼける）。
    tracer.filterGlossyFactor = 0.25;
    tracer.renderScale = 1;
    tracer.dynamicLowRes = true;
    tracer.lowResScale = 0.3;
    tracer.renderDelay = 0;
    tracer.fadeDuration = 0;
    tracer.minSamples = 0;
    tracer.tiles.set(1, 1);
    // 表示ブリットを smartDeNoise で置き換え、低サンプル時のノイズを均す。
    // DenoiseMaterial は既定 quad と同様に tone mapping / colorspace を行うため
    // 見た目の意味（Neutralトーンマップ・固定露出）は変わらず、WYSIWYG を保つ。
    const denoiseQuad = new FullScreenQuad(
      new DenoiseMaterial({
        premultipliedAlpha: gl.getContextAttributes().premultipliedAlpha,
        // 上流サンプル(three-gpu-pathtracer example)の既定値。sigma が大きいほど強く均す。
        sigma: 2.5,
        threshold: 0.1,
        kSigma: 1.0
      })
    );
    tracer.renderToCanvasCallback = (target, renderer) => {
      const material = denoiseQuad.material as DenoiseMaterial;
      material.map = target.texture;
      const currentAutoClear = renderer.autoClear;
      renderer.autoClear = false;
      denoiseQuad.render(renderer);
      renderer.autoClear = currentAutoClear;
    };
    tracerRef.current = tracer;
    workerRef.current = worker;
    readyRef.current = false;
    lastReported.current = -1;
    onStatus?.({ phase: "building", samples: 0 });

    // R3Fの子(家具・壁・器具)が全てコミット＆配置され終えてからBVHを組む。
    // 同一コミット内で即 setSceneAsync すると未配置のメッシュ(家具)が
    // BVHから漏れ、リアル表示で家具が消えることがあるため1フレーム待つ。
    const raf = requestAnimationFrame(() => {
      if (tracerRef.current !== tracer) return;
      void rebuildScene(tracer, sceneKeyRef.current);
    });

    return () => {
      cancelAnimationFrame(raf);
      readyRef.current = false;
      tracerRef.current = null;
      workerRef.current = null;
      tracer.dispose();
      worker.dispose();
      denoiseQuad.material.dispose();
      denoiseQuad.dispose();
      onStatus?.({ phase: "off", samples: 0 });
    };
  }, [gl, rebuildScene]);

  // R3Fが形状メッシュを更新し終えた後にBVHだけ再構築する。
  useEffect(() => {
    const tracer = tracerRef.current;
    if (!tracer) return;
    if (builtSceneKeyRef.current === null || builtSceneKeyRef.current === sceneKey) return;
    const handle = window.setTimeout(() => {
      if (tracerRef.current !== tracer) return;
      if (builtSceneKeyRef.current === sceneKey) return;
      void rebuildScene(tracer, sceneKey);
    }, 250);
    return () => window.clearTimeout(handle);
  }, [sceneKey, rebuildScene]);

  useEffect(() => {
    const tracer = tracerRef.current;
    if (!tracer || !readyRef.current) return;
    tracer.updateLights();
    tracer.reset();
    tracer.updateMaterials();
    tracer.reset();
  }, [lightsKey]);

  useEffect(() => {
    const tracer = tracerRef.current;
    if (!tracer || !readyRef.current) return;
    tracer.updateMaterials();
    tracer.reset();
  }, [materialsKey]);

  useFrame(() => {
    const tracer = tracerRef.current;
    if (!tracer || !readyRef.current) return;
    if (!lastMatrix.current.equals(camera.matrixWorld)) {
      lastMatrix.current.copy(camera.matrixWorld);
      tracer.updateCamera();
    }
    // 収束後は renderSample を止めてGPUを解放する（canvasは最終フレームを保持）。
    // reset で samples が 0 に戻ると次フレームから自動再開する。
    if (tracer.samples >= LIVE_TRACE_TARGET_SAMPLES) {
      if (lastReported.current !== -2) {
        lastReported.current = -2; // 収束報告済みの番兵
        onStatus?.({ phase: "converged", samples: Math.floor(tracer.samples) });
      }
      return;
    }
    tracer.renderSample();
    const samples = Math.floor(tracer.samples);
    if (samples !== lastReported.current) {
      lastReported.current = samples;
      onStatus?.({ phase: "rendering", samples });
    }
  }, 1);

  return null;
};

export const CanvasReady = ({
  onReady,
  onRenderContextReady
}: {
  onReady: (canvas: HTMLCanvasElement) => void;
  onRenderContextReady: (context: RenderContext) => void;
}) => {
  const { gl, scene, camera } = useThree();
  useEffect(() => {
    onReady(gl.domElement);
    onRenderContextReady({ gl, scene, camera, canvas: gl.domElement });
  }, [camera, gl, gl.domElement, onReady, onRenderContextReady, scene]);
  return null;
};
