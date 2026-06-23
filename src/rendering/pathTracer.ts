import * as THREE from "three";
import { WebGLPathTracer } from "three-gpu-pathtracer";
import { GenerateMeshBVHWorker } from "three-mesh-bvh/src/workers/index.js";
import type { FurnitureItem, LightingScene, MaterialPreset, Project } from "../types";
import { colorTemperatureToHex, lumensToPhysicalPower } from "../utils/lighting";
import type { RenderContext } from "./renderContext";

export type PathTraceMode = "fast" | "final";
export type RenderDebugMode = "beauty" | "material" | "normals" | "frontback";

export const sampleCountByMode: Record<PathTraceMode, number> = {
  fast: 16,
  final: 128
};

export type PathTraceProgress = {
  samples: number;
  targetSamples: number;
  elapsedMs: number;
  phase: "preparing" | "bvh" | "sampling" | "complete";
  buildProgress?: number;
};

export type PathTraceResult = {
  dataUrl: string;
  samples: number;
  elapsedMs: number;
  width: number;
  height: number;
};

type RenderPathTracedImageOptions = {
  context: RenderContext;
  project: Project;
  activeScene?: LightingScene;
  mode: PathTraceMode;
  debugMode: RenderDebugMode;
  maxWidth?: number;
  signal?: AbortSignal;
  onProgress?: (progress: PathTraceProgress) => void;
};

const nextFrame = () =>
  new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });

export const supportsWebGL2 = () => {
  const canvas = document.createElement("canvas");
  return Boolean(canvas.getContext("webgl2"));
};

const materialMap = (materials: MaterialPreset[]) =>
  new Map(materials.map((material) => [material.id, material]));

const makeMaterial = (preset?: MaterialPreset, fallback = "#8c877d") =>
  new THREE.MeshStandardMaterial({
    color: preset?.baseColor ?? fallback,
    roughness: preset?.roughness ?? 0.82,
    metalness: preset?.metalness ?? 0,
    emissive: preset?.emissiveColor ?? "#000000",
    emissiveIntensity: preset?.emissiveIntensity ?? 0
  });

const diagnosticMaterial = (role: string, debugMode: RenderDebugMode, fallback: THREE.Material) => {
  if (debugMode === "beauty") return fallback;

  const colorByRole: Record<string, string> = {
    floor: "#7fc8ff",
    wall: "#fff07a",
    ceiling: "#b8ff8d",
    furniture: "#ff9bd1",
    fixture: "#ffb35c",
    glass: "#89d7ff",
    normalX: "#ff6f6f",
    normalY: "#78e08f",
    normalZ: "#74a8ff",
    backface: "#ff5a50"
  };

  if (debugMode === "frontback") {
    return new THREE.MeshStandardMaterial({
      color: role === "backface" ? colorByRole.backface : "#54d17a",
      roughness: 0.85,
      metalness: 0
    });
  }

  return new THREE.MeshStandardMaterial({
    color: colorByRole[role] ?? "#ffffff",
    roughness: 0.78,
    metalness: 0
  });
};

const addPanel = (
  scene: THREE.Scene,
  width: number,
  height: number,
  position: THREE.Vector3,
  normal: THREE.Vector3,
  material: THREE.Material,
  role: string,
  debugMode: RenderDebugMode
) => {
  const geometry = new THREE.PlaneGeometry(width, height);
  const mesh = new THREE.Mesh(geometry, diagnosticMaterial(role, debugMode, material));
  mesh.position.copy(position);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal.clone().normalize());
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.userData.role = role;
  mesh.userData.normal = normal.toArray();
  scene.add(mesh);
  return mesh;
};

const addInteriorWallPanel = (
  scene: THREE.Scene,
  wallStart: { x: number; z: number },
  wallEnd: { x: number; z: number },
  height: number,
  material: THREE.Material,
  debugMode: RenderDebugMode,
  roomCenter = new THREE.Vector3(0, 0, 0)
) => {
  const dx = wallEnd.x - wallStart.x;
  const dz = wallEnd.z - wallStart.z;
  const length = Math.hypot(dx, dz);
  if (length <= 0.001) return null;

  const midpoint = new THREE.Vector3((wallStart.x + wallEnd.x) / 2, height / 2, (wallStart.z + wallEnd.z) / 2);
  const normalA = new THREE.Vector3(-dz / length, 0, dx / length);
  const normalB = normalA.clone().multiplyScalar(-1);
  const toCenter = roomCenter.clone().sub(midpoint);
  const normal = normalA.dot(toCenter) >= normalB.dot(toCenter) ? normalA : normalB;
  return addPanel(scene, length, height, midpoint, normal, material, "wall", debugMode);
};

const addHorizontalPanel = (
  scene: THREE.Scene,
  width: number,
  depth: number,
  y: number,
  normalY: 1 | -1,
  material: THREE.Material,
  role: "floor" | "ceiling",
  debugMode: RenderDebugMode,
  x = 0,
  z = 0
) => addPanel(scene, width, depth, new THREE.Vector3(x, y, z), new THREE.Vector3(0, normalY, 0), material, role, debugMode);

const addBox = (
  scene: THREE.Scene,
  size: [number, number, number],
  position: [number, number, number],
  material: THREE.Material,
  rotationY = 0,
  role = "furniture",
  debugMode: RenderDebugMode = "beauty"
) => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), diagnosticMaterial(role, debugMode, material));
  mesh.position.set(...position);
  mesh.rotation.y = rotationY;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.role = role;
  scene.add(mesh);
  return mesh;
};

const disposeScene = (scene: THREE.Scene) => {
  scene.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.geometry) {
      mesh.geometry.dispose();
    }

    const material = mesh.material;
    if (Array.isArray(material)) {
      material.forEach((item) => item.dispose());
    } else if (material) {
      material.dispose();
    }
  });
};

const addFurniture = (
  scene: THREE.Scene,
  item: FurnitureItem,
  materials: Map<string, MaterialPreset>,
  debugMode: RenderDebugMode
) => {
  const material = makeMaterial(materials.get(item.materialId), item.color ?? "#777");
  const rotation = (item.rotationYDeg * Math.PI) / 180;

  if (item.type === "roundTable") {
    const top = new THREE.Mesh(
      new THREE.CylinderGeometry(item.size.x / 2, item.size.x / 2, 0.08, 72),
      diagnosticMaterial("furniture", debugMode, material)
    );
    top.position.set(item.position.x, item.size.y, item.position.z);
    top.castShadow = true;
    top.receiveShadow = true;
    scene.add(top);
    const leg = new THREE.Mesh(
      new THREE.CylinderGeometry(0.055, 0.085, item.size.y, 32),
      diagnosticMaterial("furniture", debugMode, makeMaterial(undefined, "#25221d"))
    );
    leg.position.set(item.position.x, item.size.y / 2, item.position.z);
    leg.castShadow = true;
    scene.add(leg);
    return;
  }

  if (item.type === "sofa") {
    addBox(scene, [item.size.x, 0.34, item.size.z], [item.position.x, 0.2, item.position.z], material, rotation, "furniture", debugMode);
    addBox(scene, [item.size.x, 0.64, 0.2], [item.position.x, 0.48, item.position.z - item.size.z / 2 + 0.1], material, rotation, "furniture", debugMode);
    return;
  }

  if (item.type === "chair") {
    addBox(scene, [item.size.x, 0.1, item.size.z], [item.position.x, 0.42, item.position.z], material, rotation, "furniture", debugMode);
    addBox(scene, [item.size.x, 0.72, 0.09], [item.position.x, 0.72, item.position.z - item.size.z / 2 + 0.06], material, rotation, "furniture", debugMode);
    return;
  }

  if (item.type === "stair") {
    const steps = Math.max(3, Math.min(24, Math.round(item.size.y / 0.18)));
    const tread = item.size.z / steps;
    const riser = item.size.y / steps;
    for (let index = 0; index < steps; index += 1) {
      const topY = (index + 1) * riser;
      addBox(
        scene,
        [item.size.x, topY, tread],
        [item.position.x, topY / 2, item.position.z - item.size.z / 2 + index * tread + tread / 2],
        material,
        rotation,
        "furniture",
        debugMode
      );
    }
    return;
  }

  if (item.type === "kitchen") {
    addBox(scene, [item.size.x, item.size.y, item.size.z], [item.position.x, item.position.y, item.position.z], material, rotation, "furniture", debugMode);
    addBox(scene, [item.size.x + 0.08, 0.07, item.size.z + 0.08], [item.position.x, item.position.y + item.size.y / 2 + 0.035, item.position.z], makeMaterial(undefined, "#b8b4aa"), rotation, "furniture", debugMode);
    return;
  }

  addBox(scene, [item.size.x, item.size.y, item.size.z], [item.position.x, item.position.y, item.position.z], material, rotation, "furniture", debugMode);
};

const ceilingPieces = (project: Project) => {
  const voidArea = project.voids[0];
  const halfW = project.room.widthM / 2;
  const halfD = project.room.depthM / 2;
  if (!voidArea) return [{ x: 0, z: 0, width: project.room.widthM, depth: project.room.depthM }];

  const minX = voidArea.center.x - voidArea.size.x / 2;
  const maxX = voidArea.center.x + voidArea.size.x / 2;
  const minZ = voidArea.center.z - voidArea.size.z / 2;
  const maxZ = voidArea.center.z + voidArea.size.z / 2;
  return [
    { x: (-halfW + minX) / 2, z: 0, width: minX + halfW, depth: project.room.depthM },
    { x: (maxX + halfW) / 2, z: 0, width: halfW - maxX, depth: project.room.depthM },
    { x: voidArea.center.x, z: (-halfD + minZ) / 2, width: voidArea.size.x, depth: minZ + halfD },
    { x: voidArea.center.x, z: (maxZ + halfD) / 2, width: voidArea.size.x, depth: halfD - maxZ }
  ].filter((piece) => piece.width > 0.04 && piece.depth > 0.04);
};

const buildPathTraceScene = (project: Project, activeScene: LightingScene | undefined, debugMode: RenderDebugMode) => {
  const scene = new THREE.Scene();
  const materials = materialMap(project.materials);
  scene.background = new THREE.Color("#050504");

  const floorMaterial = makeMaterial(materials.get("cal-floor-oak") ?? materials.get("floor-oak"), "#9d754a");
  addHorizontalPanel(scene, project.room.widthM, project.room.depthM, 0, 1, floorMaterial, "floor", debugMode);

  const ceilingMaterial = makeMaterial(materials.get("cal-ceiling-white") ?? materials.get("wall-white"), "#eee8dd");
  ceilingPieces(project).forEach((piece) => {
    addHorizontalPanel(
      scene,
      piece.width,
      piece.depth,
      project.room.ceilingHeightM,
      -1,
      ceilingMaterial,
      "ceiling",
      debugMode,
      piece.x,
      piece.z
    );
  });

  // 吹き抜けを上階天井まで側面と上蓋で囲い、黒背景に抜ける「穴」を防ぐ。
  const wallMaxHeight = project.walls.reduce((max, wall) => Math.max(max, wall.heightM), project.room.ceilingHeightM);
  const upperCeilingHeight =
    wallMaxHeight > project.room.ceilingHeightM + 0.05 ? wallMaxHeight : project.room.ceilingHeightM + 1.4;
  project.voids.forEach((voidArea) => {
    const lowerY = project.room.ceilingHeightM;
    const height = upperCeilingHeight - lowerY;
    if (height <= 0.02) return;
    const midY = (lowerY + upperCeilingHeight) / 2;
    const { center, size } = voidArea;
    addBox(scene, [size.x, height, 0.04], [center.x, midY, center.z - size.z / 2], ceilingMaterial, 0, "ceiling", debugMode);
    addBox(scene, [size.x, height, 0.04], [center.x, midY, center.z + size.z / 2], ceilingMaterial, 0, "ceiling", debugMode);
    addBox(scene, [0.04, height, size.z], [center.x - size.x / 2, midY, center.z], ceilingMaterial, 0, "ceiling", debugMode);
    addBox(scene, [0.04, height, size.z], [center.x + size.x / 2, midY, center.z], ceilingMaterial, 0, "ceiling", debugMode);
    addHorizontalPanel(scene, size.x, size.z, upperCeilingHeight, -1, ceilingMaterial, "ceiling", debugMode, center.x, center.z);
  });

  project.walls.forEach((wall) => {
    addInteriorWallPanel(scene, wall.start, wall.end, wall.heightM, makeMaterial(materials.get(wall.materialId), "#e2ddd2"), debugMode);
  });

  project.windows.forEach((windowItem) => {
    const wall = project.walls.find((item) => item.id === windowItem.wallId);
    if (!wall) return;
    const x = wall.start.x + (wall.end.x - wall.start.x) * windowItem.centerRatio;
    const z = wall.start.z + (wall.end.z - wall.start.z) * windowItem.centerRatio;
    const angle = Math.atan2(wall.end.z - wall.start.z, wall.end.x - wall.start.x);
    const y = windowItem.sillHeightM + windowItem.heightM / 2;
    const material = windowItem.hasGlass
      ? new THREE.MeshPhysicalMaterial({
          color: "#9fbaca",
          roughness: 0.04,
          metalness: 0,
          transmission: 0.25,
          transparent: true,
          opacity: 0.35
        })
      : makeMaterial(undefined, "#050504");
    addBox(scene, [windowItem.widthM, windowItem.heightM, 0.018], [x, y, z - 0.014], material, -angle, windowItem.hasGlass ? "glass" : "backface", debugMode);
  });

  project.furniture.forEach((item) => addFurniture(scene, item, materials, debugMode));

  project.lights.forEach((fixture) => {
    const power = lumensToPhysicalPower(fixture, activeScene);
    if (power <= 0) return;
    const color = colorTemperatureToHex(fixture.colorTemperatureK);
    const targetPosition = fixture.target ?? { x: fixture.position.x, y: 0.7, z: fixture.position.z };

    if (fixture.type === "tape") {
      const emissive = new THREE.MeshStandardMaterial({
        color: "#fff3d0",
        emissive: color,
        emissiveIntensity: 0.8,
        roughness: 0.48
      });
      addBox(scene, [fixture.lengthM ?? 1.2, 0.035, 0.018], [fixture.position.x, fixture.position.y, fixture.position.z], emissive, 0, "fixture", debugMode);
      const light = new THREE.PointLight(color, 1, 0, 2);
      light.power = power;
      light.position.set(fixture.position.x, fixture.position.y, fixture.position.z);
      scene.add(light);
      return;
    }

    if (fixture.type === "bracket") {
      const light = new THREE.PointLight(color, 1, 0, 2);
      light.power = power;
      light.position.set(fixture.position.x, fixture.position.y, fixture.position.z);
      scene.add(light);
      return;
    }

    if (fixture.type === "pendant") {
      const emitter = new THREE.Mesh(
        new THREE.SphereGeometry(0.075, 24, 16),
        diagnosticMaterial(
          "fixture",
          debugMode,
          new THREE.MeshStandardMaterial({
            color: "#fff2d0",
            emissive: color,
            emissiveIntensity: 1.1,
            roughness: 0.36
          })
        )
      );
      emitter.position.set(fixture.position.x, fixture.position.y - 0.08, fixture.position.z);
      scene.add(emitter);

      const light = new THREE.PointLight(color, 1, 0, 2);
      light.power = power;
      light.position.set(fixture.position.x, fixture.position.y - 0.08, fixture.position.z);
      light.castShadow = fixture.castsShadow;
      scene.add(light);
      return;
    }

    const light = new THREE.SpotLight(
      color,
      1,
      0,
      THREE.MathUtils.degToRad(fixture.beamAngleDeg / 2),
      fixture.penumbra,
      2
    );
    light.power = power;
    light.position.set(fixture.position.x, fixture.position.y, fixture.position.z);
    light.castShadow = fixture.castsShadow;
    light.target.position.set(targetPosition.x, targetPosition.y, targetPosition.z);
    light.target.updateMatrixWorld(true);
    scene.add(light);
    scene.add(light.target);
  });

  scene.updateMatrixWorld(true);
  console.info("[lighting-calibration] path trace scene", {
    project: project.id,
    debugMode,
    materials: scene.children.filter((child) => child instanceof THREE.Mesh).length,
    lights: scene.children.filter((child) => child instanceof THREE.Light).map((light) => ({
      type: light.type,
      power: "power" in light ? (light as THREE.PointLight | THREE.SpotLight).power : undefined,
      intensity: "intensity" in light ? (light as THREE.Light).intensity : undefined
    })),
    note: "Path tracer uses inward-facing room panels, MeshStandard/Physical materials, physical light.power in lm, and no AmbientLight/HemisphereLight."
  });
  return scene;
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

export const renderPathTracedImage = async ({
  context,
  project,
  activeScene,
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

  const scene = buildPathTraceScene(project, activeScene, debugMode);
  const pathTracer = new WebGLPathTracer(renderer);
  const bvhWorker = new GenerateMeshBVHWorker();
  pathTracer.renderDelay = 0;
  pathTracer.fadeDuration = 0;
  pathTracer.minSamples = 1;
  pathTracer.renderScale = mode === "fast" ? 0.35 : 0.85;
  pathTracer.dynamicLowRes = mode === "fast";
  pathTracer.lowResScale = 0.25;
  pathTracer.multipleImportanceSampling = true;
  pathTracer.bounces = mode === "fast" ? 3 : 8;
  pathTracer.transmissiveBounces = mode === "fast" ? 2 : 4;
  pathTracer.rasterizeScene = false;
  pathTracer.tiles.set(mode === "final" ? 2 : 1, mode === "final" ? 2 : 1);
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
    renderer.dispose();
  }
};
