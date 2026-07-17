import * as THREE from "three";
import type { WallSegment, WindowOpening } from "../../types";
import { wallInwardNormal } from "../../utils/wallGeometry";
import { diagnosticMaterial } from "./materials";
import type { RenderDebugMode } from "./qualityPresets";

export const addPanel = (
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

export const addInteriorWallPanel = (
  scene: THREE.Scene,
  wall: WallSegment,
  material: THREE.Material,
  debugMode: RenderDebugMode,
  windows: WindowOpening[] = [],
  roomCenter: { x: number; z: number } = { x: 0, z: 0 },
  baseY = 0
) => {
  const { start: wallStart, end: wallEnd, heightM: height } = wall;
  const dx = wallEnd.x - wallStart.x;
  const dz = wallEnd.z - wallStart.z;
  const length = Math.hypot(dx, dz);
  if (length <= 0.001) return null;

  const midpoint = new THREE.Vector3((wallStart.x + wallEnd.x) / 2, baseY + height / 2, (wallStart.z + wallEnd.z) / 2);
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

export const addHorizontalPanel = (
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

export const addBox = (
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

export const disposeScene = (scene: THREE.Scene) => {
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
