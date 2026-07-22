import * as THREE from "three";
import type { Project } from "../../types";
import { visibleVoidSides } from "../../utils/fixtureMounting";
import { DEFAULT_DAYLIGHT, sunVector } from "../../utils/sun";
import { voidWallPanelsWithOpenings, wallOpeningsForWall } from "../../utils/wallOpenings";
import { buildSkyEnvironment, SKY_ENVIRONMENT_INTENSITY, SUN_INTENSITY_FACTOR, type SkyEnvironment } from "../skyEnvironment";
import { addFurniture } from "./furniture";
import { addBox, addHorizontalPanel, addInteriorWallPanel } from "./geometry";
import { addFixtureLights, sunColorForAltitude } from "./lights";
import { diagnosticMaterial, makeMaterial, makeTransparentMaterial, materialMap, voidOutsideFaceIndex } from "./materials";
import type { RenderDebugMode } from "./qualityPresets";
import {
  buildUpperSlabGeometry,
  buildUpperSlabVoidEdgeGeometry,
  computeUpperVoidRegion,
  upperBoundaryWalls
} from "../../components/scene3d/upperVoid";

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

export const buildPathTraceScene = (
  renderer: THREE.WebGLRenderer,
  project: Project,
  debugMode: RenderDebugMode
): { scene: THREE.Scene; skyEnv: SkyEnvironment | null } => {
  const scene = new THREE.Scene();
  const materials = materialMap(project.materials);
  const lowerProject: Project = {
    ...project,
    activeFloor: 1,
    walls: project.walls.filter((wall) => (wall.floor ?? 1) === 1),
    windows: project.windows.filter((windowItem) => (windowItem.floor ?? 1) === 1),
    voids: project.voids.filter((voidArea) => (voidArea.floor ?? 1) === 1),
    furniture: project.furniture.filter((item) => (item.floor ?? 1) === 1),
    lights: project.lights.filter((fixture) => (fixture.floor ?? 1) === 1),
    ceilingZones: (project.ceilingZones ?? []).filter((zone) => (zone.floor ?? 1) === 1),
    floorZones: (project.floorZones ?? []).filter((zone) => (zone.floor ?? 1) === 1)
  };
  const upperWalls = project.walls.filter((wall) => (wall.floor ?? 1) === 2);
  const upperWindows = project.windows.filter((windowItem) => (windowItem.floor ?? 1) === 2);
  const upperVoidRegion = computeUpperVoidRegion(upperWalls, lowerProject.voids);
  const visibleUpperWalls = upperVoidRegion ? upperBoundaryWalls(upperVoidRegion, upperWalls, lowerProject.voids) : [];
  const visibleUpperWallIds = new Set(visibleUpperWalls.map((wall) => wall.id));
  const visibleUpperWindows = upperWindows.filter((windowItem) => visibleUpperWallIds.has(windowItem.wallId));
  const interFloorThicknessM = project.room.interFloorStructure?.thicknessM ?? 0;
  const upperFloorY = project.room.ceilingHeightM + interFloorThicknessM;
  const upperCeilingY = upperFloorY + project.room.ceilingHeightM;

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
  addHorizontalPanel(scene, lowerProject.room.widthM, lowerProject.room.depthM, 0, 1, floorMaterial, "floor", debugMode);

  const ceilingMaterial = makeMaterial(materials.get("cal-ceiling-white") ?? materials.get("wall-white"), "#eee8dd");
  ceilingPieces(lowerProject).forEach((piece) => {
    addHorizontalPanel(
      scene,
      piece.width,
      piece.depth,
      lowerProject.room.ceilingHeightM,
      -1,
      ceilingMaterial,
      "ceiling",
      debugMode,
      piece.x,
      piece.z
    );
  });
  lowerProject.ceilingZones?.forEach((zone) => {
    const drop = Math.max(0.02, zone.dropM);
    const isMezzanine = zone.kind === "mezzanine";
    const height = isMezzanine ? Math.max(0.02, zone.thicknessM ?? 0.18) : drop;
    const centerY = isMezzanine
      ? lowerProject.room.ceilingHeightM - zone.dropM + height / 2
      : lowerProject.room.ceilingHeightM - drop / 2;
    addBox(
      scene,
      [zone.size.x, height, zone.size.z],
      [zone.center.x, centerY, zone.center.z],
      ceilingMaterial,
      0,
      "ceiling",
      debugMode
    );
  });

  // 吹き抜けを上階天井まで側面と上蓋で囲い、黒背景に抜ける「穴」を防ぐ。
  const wallMaxHeight = lowerProject.walls.reduce((max, wall) => Math.max(max, wall.heightM), lowerProject.room.ceilingHeightM);
  const upperCeilingHeight =
    wallMaxHeight > lowerProject.room.ceilingHeightM + 0.05 ? wallMaxHeight : lowerProject.room.ceilingHeightM + 1.4;
  if (!upperVoidRegion) lowerProject.voids.forEach((voidArea) => {
    const lowerY = lowerProject.room.ceilingHeightM;
    const height = upperCeilingHeight - lowerY;
    if (height <= 0.02) return;
    const { center, size } = voidArea;
    for (const side of visibleVoidSides(voidArea)) {
      for (const panel of voidWallPanelsWithOpenings(
        voidArea,
        side,
        lowerY,
        upperCeilingHeight,
        lowerProject.walls,
        lowerProject.windows
      )) {
        const boxSize: [number, number, number] =
          side === "north" || side === "south" ? [panel.w, panel.h, 0.04] : [0.04, panel.h, panel.w];
        const position: [number, number, number] =
          side === "north"
            ? [center.x + panel.cx, lowerY + panel.cy, center.z - size.z / 2]
            : side === "south"
              ? [center.x + panel.cx, lowerY + panel.cy, center.z + size.z / 2]
              : side === "west"
                ? [center.x - size.x / 2, lowerY + panel.cy, center.z + panel.cx]
                : [center.x + size.x / 2, lowerY + panel.cy, center.z + panel.cx];
        const baseMaterial = diagnosticMaterial("ceiling", debugMode, ceilingMaterial);
        const outsideFaceIndex = voidOutsideFaceIndex(side);
        const faceMaterials = Array.from({ length: 6 }, (_, index) =>
          index === outsideFaceIndex ? makeTransparentMaterial(baseMaterial, 0.36) : baseMaterial.clone()
        );
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(...boxSize), faceMaterials);
        mesh.position.set(...position);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData.role = "ceiling";
        scene.add(mesh);
      }
    }
    addHorizontalPanel(scene, size.x, size.z, upperCeilingHeight, -1, ceilingMaterial, "ceiling", debugMode, center.x, center.z);
  });

  const wallNormalFallback = (() => {
    if (lowerProject.walls.length === 0) return { x: 0, z: 0 };
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const wall of lowerProject.walls) {
      minX = Math.min(minX, wall.start.x, wall.end.x);
      maxX = Math.max(maxX, wall.start.x, wall.end.x);
      minZ = Math.min(minZ, wall.start.z, wall.end.z);
      maxZ = Math.max(maxZ, wall.start.z, wall.end.z);
    }
    return { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2 };
  })();

  const addWall = (
    sourceWall: Project["walls"][number],
    walls: Project["walls"],
    windows: Project["windows"],
    baseY = 0,
    wallHeightM = sourceWall.heightM
  ) => {
    const wall = { ...sourceWall, heightM: wallHeightM };
    const dx = wall.end.x - wall.start.x;
    const dz = wall.end.z - wall.start.z;
    const length = Math.hypot(dx, dz);
    const wallWindows = wallOpeningsForWall(wall, walls, windows);
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
      addBox(scene, [length, 0.05, railDepth], [cx, baseY + wall.heightM - 0.025, cz], railMaterial, angle, "wall", debugMode);
      addBox(scene, [length, 0.05, railDepth], [cx, baseY + 0.05, cz], railMaterial, angle, "wall", debugMode);
      // 縦支柱を約0.11m間隔で両端含めて配置。
      const postCount = Math.max(2, Math.round(length / 0.11) + 1);
      for (let i = 0; i < postCount; i++) {
        const t = i / (postCount - 1) - 0.5;
        const px = cx + ux * length * t;
        const pz = cz + uz * length * t;
        addBox(scene, [0.04, wall.heightM, 0.04], [px, baseY + wall.heightM / 2, pz], railMaterial, angle, "wall", debugMode);
      }
      return;
    }
    addInteriorWallPanel(
      scene,
      wall,
      makeMaterial(materials.get(wall.materialId), "#e2ddd2"),
      debugMode,
      wallWindows,
      wallNormalFallback,
      baseY
    );
  };
  lowerProject.walls.forEach((wall) => addWall(wall, lowerProject.walls, lowerProject.windows));

  const addWindow = (windowItem: Project["windows"][number], walls: Project["walls"], baseY = 0) => {
    const wall = walls.find((item) => item.id === windowItem.wallId);
    if (!wall) return;
    const x = wall.start.x + (wall.end.x - wall.start.x) * windowItem.centerRatio;
    const z = wall.start.z + (wall.end.z - wall.start.z) * windowItem.centerRatio;
    const angle = Math.atan2(wall.end.z - wall.start.z, wall.end.x - wall.start.x);
    const y = baseY + windowItem.topHeightM - windowItem.heightM / 2;
    const style = windowItem.style ?? (windowItem.hasGlass ? "window" : "opening");
    if (style === "door") {
      addBox(scene, [windowItem.widthM, windowItem.heightM, 0.04], [x, y, z - 0.02], makeMaterial(undefined, "#9d8b73"), -angle, "furniture", debugMode);
      return;
    }
    if (style !== "window") return;
    const frameWidthM = 0.06;
    const frameMaterial = makeMaterial(undefined, "#e7e3da");
    const frameZ = z - 0.012;
    const halfInnerWidthM = windowItem.widthM / 2 - frameWidthM / 2;
    const frameOffsetX = Math.cos(angle) * halfInnerWidthM;
    const frameOffsetZ = Math.sin(angle) * halfInnerWidthM;
    addBox(scene, [windowItem.widthM, frameWidthM, 0.1], [x, y + windowItem.heightM / 2 - frameWidthM / 2, frameZ], frameMaterial, -angle, "furniture", debugMode);
    addBox(scene, [windowItem.widthM, frameWidthM, 0.1], [x, y - windowItem.heightM / 2 + frameWidthM / 2, frameZ], frameMaterial, -angle, "furniture", debugMode);
    addBox(scene, [frameWidthM, windowItem.heightM, 0.1], [x - frameOffsetX, y, frameZ - frameOffsetZ], frameMaterial, -angle, "furniture", debugMode);
    addBox(scene, [frameWidthM, windowItem.heightM, 0.1], [x + frameOffsetX, y, frameZ + frameOffsetZ], frameMaterial, -angle, "furniture", debugMode);
    addBox(scene, [windowItem.widthM - frameWidthM * 2, 0.035, 0.05], [x, y, frameZ], frameMaterial, -angle, "furniture", debugMode);
  };
  lowerProject.windows.forEach((windowItem) => addWindow(windowItem, lowerProject.walls));

  if (upperVoidRegion) {
    const upperFloorGeo = buildUpperSlabGeometry(upperVoidRegion, true, true);
    const upperFloorBottomGeo = interFloorThicknessM > 0.001 ? buildUpperSlabGeometry(upperVoidRegion, true, false) : null;
    const upperFloorVoidEdgeGeo = buildUpperSlabVoidEdgeGeometry(upperVoidRegion, interFloorThicknessM);
    const upperCeilingGeo = buildUpperSlabGeometry(upperVoidRegion, false, false);
    const addSlab = (
      geometry: THREE.BufferGeometry,
      y: number,
      material: THREE.Material,
      role: "floor" | "ceiling",
      doubleSided = false
    ) => {
      const slabMaterial = diagnosticMaterial(role, debugMode, doubleSided ? material.clone() : material);
      if (doubleSided) slabMaterial.side = THREE.DoubleSide;
      const mesh = new THREE.Mesh(geometry, slabMaterial);
      mesh.position.y = y;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.role = role;
      scene.add(mesh);
    };
    if (upperFloorGeo) addSlab(upperFloorGeo, upperFloorY, floorMaterial, "floor");
    if (upperFloorBottomGeo) addSlab(upperFloorBottomGeo, upperFloorY - interFloorThicknessM, ceilingMaterial, "ceiling");
    if (upperFloorVoidEdgeGeo) addSlab(upperFloorVoidEdgeGeo, upperFloorY, floorMaterial, "floor", true);
    if (upperCeilingGeo) addSlab(upperCeilingGeo, upperCeilingY, ceilingMaterial, "ceiling");
    visibleUpperWalls.forEach((wall) => {
      const wallHeightM = wall.kind === "half" || wall.kind === "railing" ? wall.heightM : project.room.ceilingHeightM;
      addWall(wall, upperWalls, upperWindows, upperFloorY, wallHeightM);
    });
    visibleUpperWindows.forEach((windowItem) => addWindow(windowItem, visibleUpperWalls, upperFloorY));
  }

  lowerProject.furniture.forEach((item) => addFurniture(scene, item, materials, debugMode));

  addFixtureLights(scene, lowerProject, debugMode);

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
