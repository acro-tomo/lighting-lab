import { useEffect, useState } from "react";
import * as THREE from "three";
import type { RenderDebugMode } from "../../rendering/pathTracer";
import type { MaterialPreset } from "../../types";

// dataURL画像を一度だけ読み込み、面ごとにリピートを変えたテクスチャを返す。
const wallpaperImageCache = new Map<string, HTMLImageElement>();
export const useWallpaperTexture = (
  dataUrl: string | undefined,
  repeatX: number,
  repeatY: number
): THREE.Texture | null => {
  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  useEffect(() => {
    if (!dataUrl) {
      setTexture(null);
      return;
    }
    let cancelled = false;
    const build = (image: HTMLImageElement) => {
      if (cancelled) return;
      const tex = new THREE.Texture(image);
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.repeat.set(Math.max(0.01, repeatX), Math.max(0.01, repeatY));
      tex.anisotropy = 4;
      tex.needsUpdate = true;
      setTexture(tex);
    };
    const cached = wallpaperImageCache.get(dataUrl);
    if (cached) {
      build(cached);
    } else {
      const image = new Image();
      image.onload = () => {
        wallpaperImageCache.set(dataUrl, image);
        build(image);
      };
      image.src = dataUrl;
    }
    return () => {
      cancelled = true;
    };
  }, [dataUrl, repeatX, repeatY]);
  return texture;
};

export const materialById = (materials: MaterialPreset[]) =>
  new Map(materials.map((material) => [material.id, material]));

export const debugColorForRole = (role: string, mode: RenderDebugMode, fallback: string) => {
  if (mode === "beauty") return fallback;
  if (mode === "frontback") return "#58d36a";
  const colors: Record<string, string> = {
    wall: "#fff07a",
    ceiling: "#b8ff8d",
    floor: "#7fc8ff",
    furniture: "#ff9bd1",
    fixture: "#ffb35c",
    glass: "#89d7ff"
  };
  return colors[role] ?? fallback;
};

export const StandardMaterial = ({ material, role = "furniture", debugMode = "beauty" }: { material: MaterialPreset; role?: string; debugMode?: RenderDebugMode }) => (
  <meshStandardMaterial
    color={debugColorForRole(role, debugMode, material.baseColor)}
    roughness={material.roughness}
    metalness={material.metalness}
    emissive={material.emissiveColor}
    emissiveIntensity={debugMode === "beauty" ? material.emissiveIntensity : 0}
  />
);

export const createWoodTexture = () => {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.fillStyle = "#9d754a";
  ctx.fillRect(0, 0, 512, 512);
  for (let y = 0; y < 512; y += 36) {
    ctx.fillStyle = y % 72 === 0 ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)";
    ctx.fillRect(0, y, 512, 3);
  }
  for (let i = 0; i < 1200; i += 1) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    ctx.fillStyle = `rgba(35, 20, 10, ${Math.random() * 0.05})`;
    ctx.fillRect(x, y, Math.random() * 72 + 18, 1);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(4, 3);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
};
