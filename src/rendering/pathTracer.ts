import * as THREE from "three";
import { WebGLPathTracer } from "three-gpu-pathtracer";
import { GenerateMeshBVHWorker } from "three-mesh-bvh/src/workers/index.js";
import type { FurnitureItem, MaterialPreset, Project, VoidSide, WallSegment, WindowOpening } from "../types";
import { bracketRoomwardOffset, colorTemperatureToHex, lumensToPhysicalPower } from "../utils/lighting";
import { DEFAULT_DAYLIGHT, sunVector } from "../utils/sun";
import { wallInwardNormal } from "../utils/wallGeometry";
import {
  buildSkyEnvironment,
  SKY_ENVIRONMENT_INTENSITY,
  SUN_INTENSITY_FACTOR,
  type SkyEnvironment
} from "./skyEnvironment";
import type { RenderContext } from "./renderContext";
import { visibleVoidSides } from "../utils/fixtureMounting";

// 太陽高度から太陽光色を補間する。Scene3D の挙動に合わせる。
const sunColorForAltitude = (altitudeDeg: number): THREE.Color => {
  const warm = new THREE.Color("#ffd9a8");
  const white = new THREE.Color("#fff4e6");
  return warm.lerp(white, Math.min(1, Math.max(0, altitudeDeg / 35)));
};

export type PathTraceMode = "standard" | "high" | "ultra";
export type RenderDebugMode = "beauty" | "material" | "normals" | "frontback";

export const sampleCountByMode: Record<PathTraceMode, number> = {
  standard: 256,
  high: 512,
  ultra: 1024
};

// モード別の品質パラメータ。重い ultra のみタイル分割(2x2)でGPU負荷を分散。
const renderScaleByMode: Record<PathTraceMode, number> = {
  standard: 0.7,
  high: 0.9,
  ultra: 1.0
};

const bouncesByMode: Record<PathTraceMode, number> = {
  standard: 5,
  high: 8,
  ultra: 10
};

const transmissiveBouncesByMode: Record<PathTraceMode, number> = {
  standard: 3,
  high: 4,
  ultra: 5
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

const makeTransparentMaterial = (material: THREE.Material, opacity: number) => {
  const next = material.clone();
  next.transparent = true;
  next.opacity = opacity;
  next.depthWrite = false;
  return next;
};

const voidOutsideFaceIndex = (side: VoidSide) => {
  switch (side) {
    case "north":
      return 5;
    case "south":
      return 4;
    case "west":
      return 1;
    case "east":
      return 0;
  }
};

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
  debugMode: RenderDebugMode,
  side: THREE.Side = THREE.DoubleSide
) => {
  const geometry = new THREE.PlaneGeometry(width, height);
  const panelMaterial = diagnosticMaterial(role, debugMode, material);
  panelMaterial.side = side;
  const mesh = new THREE.Mesh(geometry, panelMaterial);
  mesh.position.copy(position);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal.clone().normalize());
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.userData.role = role;
  mesh.userData.normal = normal.toArray();
  scene.add(mesh);
  return mesh;
};

// 壁を開口でくり抜いた残りを矩形パネル群で返す（壁内座標0..length・高さ基準）。
type WallHole = { cx: number; w: number; bottom: number; top: number };
const wallPanelRects = (length: number, height: number, holes: WallHole[]) => {
  if (holes.length === 0) {
    return [{ cx: length / 2, cy: height / 2, w: length, h: height }];
  }
  const spans = holes
    .map((hole) => ({
      x0: Math.max(0, hole.cx - hole.w / 2),
      x1: Math.min(length, hole.cx + hole.w / 2),
      bottom: Math.max(0, hole.bottom),
      top: Math.min(height, hole.top)
    }))
    .filter((span) => span.x1 - span.x0 > 0.001 && span.top - span.bottom > 0.001)
    .sort((a, b) => a.x0 - b.x0);

  const rects: { cx: number; cy: number; w: number; h: number }[] = [];
  const push = (left: number, right: number, bottom: number, top: number) => {
    if (right - left <= 0.001 || top - bottom <= 0.001) return;
    rects.push({ cx: (left + right) / 2, cy: (bottom + top) / 2, w: right - left, h: top - bottom });
  };
  let cursor = 0;
  spans.forEach((span) => {
    push(cursor, span.x0, 0, height);
    push(span.x0, span.x1, 0, span.bottom);
    push(span.x0, span.x1, span.top, height);
    cursor = Math.max(cursor, span.x1);
  });
  push(cursor, length, 0, height);
  return rects;
};

const addInteriorWallPanel = (
  scene: THREE.Scene,
  wall: WallSegment,
  material: THREE.Material,
  debugMode: RenderDebugMode,
  windows: WindowOpening[] = [],
  roomCenter: { x: number; z: number } = { x: 0, z: 0 }
) => {
  const { start: wallStart, end: wallEnd, heightM: height } = wall;
  const dx = wallEnd.x - wallStart.x;
  const dz = wallEnd.z - wallStart.z;
  const length = Math.hypot(dx, dz);
  if (length <= 0.001) return null;

  const midpoint = new THREE.Vector3((wallStart.x + wallEnd.x) / 2, height / 2, (wallStart.z + wallEnd.z) / 2);
  const inward = wallInwardNormal(wall, roomCenter);
  const normal = new THREE.Vector3(inward.x, 0, inward.z);
  const rotationY = Math.atan2(normal.x, normal.z);
  const localXAxis = new THREE.Vector3(Math.cos(rotationY), 0, -Math.sin(rotationY));
  const holes = windows.map((windowItem) => {
    const x = wall.start.x + (wall.end.x - wall.start.x) * windowItem.centerRatio;
    const z = wall.start.z + (wall.end.z - wall.start.z) * windowItem.centerRatio;
    const cxCentered = new THREE.Vector3(x - midpoint.x, 0, z - midpoint.z).dot(localXAxis);
    return {
      cx: cxCentered + length / 2,
      w: windowItem.widthM,
      bottom: windowItem.sillHeightM,
      top: windowItem.sillHeightM + windowItem.heightM
    };
  });

  // 開口でくり抜いた残りパネルを、壁中心からローカルX/Yオフセットで配置する。
  wallPanelRects(length, height, holes).forEach((rect) => {
    const localX = rect.cx - length / 2;
    const localY = rect.cy - height / 2;
    const pos = midpoint.clone().add(localXAxis.clone().multiplyScalar(localX));
    pos.y = midpoint.y + localY;
    addPanel(scene, rect.w, rect.h, pos, normal, material, "wall", debugMode, THREE.DoubleSide);
  });
  return null;
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
    // スケルトン階段: 段板＋両側ストリンガー（蹴込み板なし）。
    const steps = Math.max(3, Math.min(24, Math.round(item.size.y / 0.18)));
    const tread = item.size.z / steps;
    const riser = item.size.y / steps;
    for (let index = 0; index < steps; index += 1) {
      addBox(
        scene,
        [item.size.x, 0.052, tread * 0.82],
        [item.position.x, (index + 1) * riser - 0.026, item.position.z - item.size.z / 2 + index * tread + tread / 2],
        material,
        rotation,
        "furniture",
        debugMode
      );
    }
    const stringerLength = Math.hypot(item.size.y, item.size.z);
    const stringerAngle = Math.atan2(item.size.z, item.size.y);
    [-1, 1].forEach((side) => {
      const stringer = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, stringerLength, 0.16),
        new THREE.MeshStandardMaterial({ color: "#1c1c1a", roughness: 0.5, metalness: 0.6 })
      );
      stringer.position.set(item.position.x + side * (item.size.x / 2 - 0.04), item.size.y / 2, item.position.z);
      stringer.rotation.x = stringerAngle;
      stringer.castShadow = true;
      stringer.receiveShadow = true;
      scene.add(stringer);
    });
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

const buildPathTraceScene = (
  renderer: THREE.WebGLRenderer,
  project: Project,
  debugMode: RenderDebugMode
): { scene: THREE.Scene; skyEnv: SkyEnvironment | null } => {
  const scene = new THREE.Scene();
  const materials = materialMap(project.materials);

  // 日光・空（編集シーン=常駐パストレと同一の Sky 環境・露出・太陽式。WYSIWYG厳守）。
  const daylight = project.daylight ?? DEFAULT_DAYLIGHT;
  const sun = sunVector(daylight);
  const sunUp = daylight.enabled && sun.altitudeDeg > 0;
  // WebGLPathTracer は scene.background 単色を「見える背景」としてしか扱わず、
  // 環境光にはしない（環境光は scene.environment + environmentIntensity が必要）。
  // 物理ベースの空(Sky→PMREM)を environment に入れ、直射の当たらない壁を持ち上げる。
  let skyEnv: SkyEnvironment | null = null;
  if (sunUp) {
    skyEnv = buildSkyEnvironment(renderer, sun.dir);
    scene.environment = skyEnv.texture;
    scene.background = skyEnv.texture;
    scene.environmentIntensity = SKY_ENVIRONMENT_INTENSITY;
  } else {
    scene.background = new THREE.Color("#050504");
    scene.environmentIntensity = 1;
  }

  if (sunUp) {
    const sunLight = new THREE.DirectionalLight(
      sunColorForAltitude(sun.altitudeDeg),
      Math.max(0, sun.dir.y) * SUN_INTENSITY_FACTOR
    );
    const pos = sun.dir.clone().multiplyScalar(30);
    sunLight.position.set(pos.x, pos.y, pos.z);
    sunLight.target.position.set(0, 0, 0);
    sunLight.target.updateMatrixWorld(true);
    scene.add(sunLight);
    scene.add(sunLight.target);
  }

  // 外景: 窓の外に「外らしい景色」(地面+遠景の建物/木立)を作る。Scene3D の Outdoors と整合。
  addHorizontalPanel(scene, 120, 120, -0.02, 1, makeMaterial(undefined, "#6f7560"), "floor", debugMode);
  if (debugMode === "beauty") {
    const farBuildings = [
      { x: -14, z: -20, w: 6, h: 5.5, color: "#3a4250" },
      { x: -7, z: -22, w: 4.5, h: 8, color: "#454f5e" },
      { x: 0, z: -24, w: 7, h: 6, color: "#333b48" },
      { x: 8, z: -21, w: 5, h: 9.5, color: "#404a59" },
      { x: 15, z: -19, w: 5.5, h: 4.5, color: "#3d4654" },
      { x: 19, z: 6, w: 5, h: 7, color: "#3a4250" },
      { x: 20, z: 14, w: 6, h: 5, color: "#454f5e" },
      { x: -19, z: 8, w: 5.5, h: 6.5, color: "#3a4250" },
      { x: -20, z: -4, w: 5, h: 8, color: "#404a59" }
    ];
    farBuildings.forEach((b) => {
      addBox(scene, [b.w, b.h, b.w * 0.8], [b.x, b.h / 2, b.z], makeMaterial(undefined, b.color), 0, "wall", debugMode);
    });
    const farTrees = [
      { x: -11, z: -16, h: 3.2 },
      { x: 4, z: -17, h: 3.8 },
      { x: 12, z: -15, h: 2.8 },
      { x: 16, z: 2, h: 3.4 },
      { x: -16, z: 2, h: 3.0 }
    ];
    farTrees.forEach((t) => {
      const crown = new THREE.Mesh(
        new THREE.ConeGeometry(t.h * 0.34, t.h * 0.85, 8),
        makeMaterial(undefined, "#2f4232")
      );
      crown.position.set(t.x, t.h * 0.62, t.z);
      scene.add(crown);
    });
  }

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
    for (const side of visibleVoidSides(voidArea)) {
      const boxSize: [number, number, number] =
        side === "north" || side === "south" ? [size.x, height, 0.04] : [0.04, height, size.z];
      const position: [number, number, number] =
        side === "north"
          ? [center.x, midY, center.z - size.z / 2]
          : side === "south"
            ? [center.x, midY, center.z + size.z / 2]
            : side === "west"
              ? [center.x - size.x / 2, midY, center.z]
              : [center.x + size.x / 2, midY, center.z];
      const baseMaterial = diagnosticMaterial("ceiling", debugMode, ceilingMaterial);
      const outsideFaceIndex = voidOutsideFaceIndex(side);
      const materials = Array.from({ length: 6 }, (_, index) =>
        index === outsideFaceIndex ? makeTransparentMaterial(baseMaterial, 0.36) : baseMaterial.clone()
      );
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(...boxSize), materials);
      mesh.position.set(...position);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.role = "ceiling";
      scene.add(mesh);
    }
    addHorizontalPanel(scene, size.x, size.z, upperCeilingHeight, -1, ceilingMaterial, "ceiling", debugMode, center.x, center.z);
  });

  const wallNormalFallback = (() => {
    if (project.walls.length === 0) return { x: 0, z: 0 };
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const wall of project.walls) {
      minX = Math.min(minX, wall.start.x, wall.end.x);
      maxX = Math.max(maxX, wall.start.x, wall.end.x);
      minZ = Math.min(minZ, wall.start.z, wall.end.z);
      maxZ = Math.max(maxZ, wall.start.z, wall.end.z);
    }
    return { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2 };
  })();

  project.walls.forEach((wall) => {
    const dx = wall.end.x - wall.start.x;
    const dz = wall.end.z - wall.start.z;
    const length = Math.hypot(dx, dz);
    const wallWindows = project.windows.filter((windowItem) => windowItem.wallId === wall.id);
    // 手すりは「抜け」が要るのでソリッドパネルにせず笠木+縦支柱で組む（編集シーンと寸法/間隔を揃える）。
    if (wall.kind === "railing") {
      const cx = (wall.start.x + wall.end.x) / 2;
      const cz = (wall.start.z + wall.end.z) / 2;
      const angle = Math.atan2(dz, dx);
      const ux = dx / length;
      const uz = dz / length;
      const railMaterial = makeMaterial(materials.get(wall.materialId), "#e2ddd2");
      const railDepth = Math.min(wall.thicknessM, 0.06);
      // 笠木（上桟）と下桟。addBox は size.x を rotationY 後のローカルX(壁方向)に取る。
      addBox(scene, [length, 0.05, railDepth], [cx, wall.heightM - 0.025, cz], railMaterial, angle, "wall", debugMode);
      addBox(scene, [length, 0.05, railDepth], [cx, 0.05, cz], railMaterial, angle, "wall", debugMode);
      // 縦支柱を約0.11m間隔で両端含めて配置。
      const postCount = Math.max(2, Math.round(length / 0.11) + 1);
      for (let i = 0; i < postCount; i++) {
        const t = i / (postCount - 1) - 0.5;
        const px = cx + ux * length * t;
        const pz = cz + uz * length * t;
        addBox(scene, [0.04, wall.heightM, 0.04], [px, wall.heightM / 2, pz], railMaterial, angle, "wall", debugMode);
      }
      return;
    }
    addInteriorWallPanel(
      scene,
      wall,
      makeMaterial(materials.get(wall.materialId), "#e2ddd2"),
      debugMode,
      wallWindows,
      wallNormalFallback
    );
  });

  project.windows.forEach((windowItem) => {
    const wall = project.walls.find((item) => item.id === windowItem.wallId);
    if (!wall) return;
    const x = wall.start.x + (wall.end.x - wall.start.x) * windowItem.centerRatio;
    const z = wall.start.z + (wall.end.z - wall.start.z) * windowItem.centerRatio;
    const angle = Math.atan2(wall.end.z - wall.start.z, wall.end.x - wall.start.x);
    const y = windowItem.sillHeightM + windowItem.heightM / 2;
    const style = windowItem.style ?? (windowItem.hasGlass ? "window" : "opening");
    if (style === "door") {
      addBox(scene, [windowItem.widthM, windowItem.heightM, 0.04], [x, y, z - 0.02], makeMaterial(undefined, "#9d8b73"), -angle, "furniture", debugMode);
      return;
    }
    const material =
      style === "window"
        ? new THREE.MeshPhysicalMaterial({
            color: "#bcd4e0",
            roughness: 0.03,
            metalness: 0,
            transmission: 0.95,
            transparent: true,
            opacity: 1.0,
            ior: 1.5
          })
        : makeMaterial(undefined, "#0a0908");
    addBox(scene, [windowItem.widthM, windowItem.heightM, 0.018], [x, y, z - 0.014], material, -angle, style === "window" ? "glass" : "backface", debugMode);
  });

  project.furniture.forEach((item) => addFurniture(scene, item, materials, debugMode));

  project.lights.forEach((fixture) => {
    const power = lumensToPhysicalPower(fixture);
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
      // 壁に密着した点光源は逆二乗で至近の壁を白飛びさせるため、照射方向(室内側)へ
      // ~0.16m 離す（編集ラスターと同じ式で WYSIWYG を保つ）。
      const off = bracketRoomwardOffset(fixture, 0.16);
      const light = new THREE.PointLight(color, 1, 0, 2);
      light.power = power;
      light.position.set(
        fixture.position.x + off.x,
        fixture.position.y,
        fixture.position.z + off.z
      );
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

      // シェード上面の不透明キャップ。上方への光漏れ(天井照り)を遮る。
      addBox(
        scene,
        [0.16, 0.012, 0.16],
        [fixture.position.x, fixture.position.y + 0.03, fixture.position.z],
        makeMaterial(undefined, "#15140f"),
        0,
        "fixture",
        debugMode
      );

      // 下方配光のスポット(≈140°)。全方向 pointLight だと天井まで照るのを防ぐ。
      const light = new THREE.SpotLight(color, 1, 0, THREE.MathUtils.degToRad(70), 0.5, 2);
      light.power = power;
      light.position.set(fixture.position.x, fixture.position.y - 0.08, fixture.position.z);
      light.castShadow = fixture.castsShadow;
      light.target.position.set(fixture.position.x, 0.1, fixture.position.z);
      light.target.updateMatrixWorld(true);
      scene.add(light);
      scene.add(light.target);
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
  return { scene, skyEnv };
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
