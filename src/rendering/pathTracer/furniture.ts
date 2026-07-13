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
