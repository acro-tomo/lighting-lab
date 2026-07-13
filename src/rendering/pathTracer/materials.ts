import * as THREE from "three";
import type { MaterialPreset, VoidSide } from "../../types";
import type { RenderDebugMode } from "./qualityPresets";

export const materialMap = (materials: MaterialPreset[]) =>
  new Map(materials.map((material) => [material.id, material]));

export const makeMaterial = (preset?: MaterialPreset, fallback = "#8c877d") =>
  new THREE.MeshStandardMaterial({
    color: preset?.baseColor ?? fallback,
    roughness: preset?.roughness ?? 0.82,
    metalness: preset?.metalness ?? 0,
    emissive: preset?.emissiveColor ?? "#000000",
    emissiveIntensity: preset?.emissiveIntensity ?? 0
  });

export const makeTransparentMaterial = (material: THREE.Material, opacity: number) => {
  const next = material.clone();
  next.transparent = true;
  next.opacity = opacity;
  next.depthWrite = false;
  return next;
};

export const voidOutsideFaceIndex = (side: VoidSide) => {
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

export const diagnosticMaterial = (role: string, debugMode: RenderDebugMode, fallback: THREE.Material) => {
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
