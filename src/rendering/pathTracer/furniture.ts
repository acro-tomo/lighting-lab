import * as THREE from "three";
import type { FurnitureItem, MaterialPreset } from "../../types";
import { addBox } from "./geometry";
import { diagnosticMaterial, makeMaterial } from "./materials";
import type { RenderDebugMode } from "./qualityPresets";

export const addFurniture = (
  scene: THREE.Scene,
  item: FurnitureItem,
  materials: Map<string, MaterialPreset>,
  debugMode: RenderDebugMode
) => {
  const material = makeMaterial(materials.get(item.materialId), item.color ?? "#777");
  const rotation = (item.rotationYDeg * Math.PI) / 180;
  const addPart = (
    size: [number, number, number],
    offset: [number, number, number],
    partMaterial: THREE.Material = material
  ) => {
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    return addBox(
      scene,
      size,
      [
        item.position.x + offset[0] * cos + offset[2] * sin,
        item.position.y + offset[1],
        item.position.z - offset[0] * sin + offset[2] * cos
      ],
      partMaterial,
      rotation,
      "furniture",
      debugMode
    );
  };

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
    const { x: w, y: h, z: d } = item.size;
    const baseH = h * 0.28;
    const backD = Math.min(0.2, d * 0.22);
    const backH = h * 0.66;
    const armW = Math.min(0.22, Math.max(0.1, w * 0.1));
    const armH = h * 0.58;
    const frontInset = d * 0.06;
    const seatD = d - backD - frontInset;
    const seatZ = (backD - frontInset) / 2;
    const cushionH = h * 0.15;
    const cushionY = -h / 2 + baseH + cushionH / 2 + 0.015;
    const cushionCount = w >= 1.8 ? 3 : w >= 1.15 ? 2 : 1;
    const cushionGap = Math.min(0.025, w * 0.015);
    const innerW = w - armW * 2 - cushionGap * 2;
    const cushionW = (innerW - cushionGap * (cushionCount - 1)) / cushionCount;
    const cushionMaterial = makeMaterial(undefined, "#817b70");
    cushionMaterial.roughness = 0.96;
    cushionMaterial.metalness = 0;
    addPart([w, baseH, d], [0, -h / 2 + baseH / 2, 0]);
    addPart([w - armW * 2, backH, backD], [0, h / 2 - backH / 2, -d / 2 + backD / 2]);
    [-1, 1].forEach((side) => {
      addPart([armW, armH, d - frontInset], [side * (w / 2 - armW / 2), -h / 2 + armH / 2, seatZ]);
    });
    Array.from({ length: cushionCount }).forEach((_, index) => {
      addPart(
        [cushionW, cushionH, seatD],
        [-innerW / 2 + cushionW / 2 + index * (cushionW + cushionGap), cushionY, seatZ],
        cushionMaterial
      );
    });
    return;
  }

  if (item.type === "chair") {
    const { x: w, y: h, z: d } = item.size;
    const seatT = Math.min(0.1, h * 0.12);
    const seatY = -h / 2 + h * 0.47;
    const legH = h * 0.42;
    const legW = Math.min(0.05, w * 0.12, d * 0.12);
    const legY = -h / 2 + legH / 2;
    const legX = w / 2 - legW / 2 - w * 0.06;
    const legZ = d / 2 - legW / 2 - d * 0.06;
    const backD = Math.min(0.08, d * 0.16);
    const backH = h / 2 - seatY;
    addPart([w, seatT, d], [0, seatY, 0]);
    addPart([w, backH, backD], [0, (h / 2 + seatY) / 2, -d / 2 + backD / 2]);
    [
      [legX, legZ],
      [-legX, legZ],
      [legX, -legZ],
      [-legX, -legZ]
    ].forEach(([x, z]) => addPart([legW, legH, legW], [x, legY, z]));
    return;
  }

  if (item.type === "rectTable") {
    const { x: w, y: h, z: d } = item.size;
    const topT = Math.min(0.08, h * 0.14);
    const legH = h - topT;
    const legW = Math.min(0.07, w * 0.08, d * 0.12);
    const legX = w / 2 - legW / 2 - w * 0.04;
    const legZ = d / 2 - legW / 2 - d * 0.06;
    const legMaterial = makeMaterial(undefined, "#3a342b");
    legMaterial.roughness = 0.6;
    legMaterial.metalness = item.metalness ?? materials.get(item.materialId)?.metalness ?? 0;
    addPart([w, topT, d], [0, h / 2 - topT / 2, 0]);
    [
      [legX, legZ],
      [-legX, legZ],
      [legX, -legZ],
      [-legX, -legZ]
    ].forEach(([x, z]) => addPart([legW, legH, legW], [x, -topT / 2, z], legMaterial));
    return;
  }

  if (item.type === "cupboard") {
    const { x: w, y: h, z: d } = item.size;
    const doorGap = Math.min(0.014, w * 0.02);
    const doorD = Math.min(0.035, d * 0.08);
    const doorW = (w - doorGap * 3) / 2;
    const handleH = Math.min(0.32, h * 0.2);
    const handleMaterial = makeMaterial(undefined, "#6e6b65");
    handleMaterial.roughness = 0.36;
    handleMaterial.metalness = 0.55;
    addPart([w, h, d - doorD], [0, 0, -doorD / 2]);
    [-1, 1].forEach((side) => {
      addPart([doorW, h - doorGap * 2, doorD], [side * (doorW / 2 + doorGap / 2), 0, d / 2 - doorD / 2]);
      addPart([0.018, handleH, 0.025], [side * (doorGap / 2 + 0.028), 0, d / 2 + 0.012], handleMaterial);
    });
    return;
  }

  if (item.type === "counter") {
    const { x: w, y: h, z: d } = item.size;
    const topT = Math.min(0.07, h * 0.1);
    const supportT = Math.min(0.08, w * 0.06);
    const supportH = h - topT;
    const backT = Math.min(0.05, d * 0.14);
    const panelH = supportH * 0.65;
    addPart([w, topT, d], [0, h / 2 - topT / 2, 0]);
    [-1, 1].forEach((side) => {
      addPart([supportT, supportH, d], [side * (w / 2 - supportT / 2), -topT / 2, 0]);
    });
    addPart([w - supportT * 2, panelH, backT], [0, -h / 2 + panelH / 2, -d / 2 + backT / 2]);
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
