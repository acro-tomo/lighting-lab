import type { CeilingZone, FurnitureItem, LightFixture, Project, VoidArea, WindowOpening } from "../types";
import type { FurniturePreset } from "./furnitureCatalog";
import type { WindowPreset } from "./windowCatalog";

const uid = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

// 既存の窓が無い壁を優先して選ぶ（無ければ先頭）。
const pickFreeWall = (project: Project) =>
  project.walls.find((wall) => !project.windows.some((opening) => opening.wallId === wall.id)) ??
  project.walls[0];

export const newDownlight = (project: Project, at?: { x: number; z: number }): LightFixture => ({
  id: uid("light"),
  name: "中角ダウンライト",
  type: "downlight",
  model: "dl-medium",
  position: { x: at?.x ?? 0, y: project.room.ceilingHeightM - 0.04, z: at?.z ?? 0 },
  mountHeightM: project.room.ceilingHeightM,
  rotationDeg: { x: -90, y: 0, z: 0 },
  target: { x: at?.x ?? 0, y: 0, z: at?.z ?? 0 },
  lumens: 620,
  colorTemperatureK: 2700,
  dimmer: 80,
  enabled: true,
  beamAngleDeg: 60,
  penumbra: 0.6,
  castsShadow: true,
  note: ""
});

export const newWallSpot = (project: Project, at?: { x: number; z: number }): LightFixture => {
  const z = at?.z ?? -project.room.depthM / 2 + 0.06;
  const x = at?.x ?? 0;
  return {
    id: uid("light"),
    name: "壁付スポット",
    type: "spotlight",
    model: "sp-wall",
    position: { x, y: 1.9, z },
    mountHeightM: 1.9,
    rotationDeg: { x: 0, y: 0, z: 0 },
    target: { x, y: 0.9, z: 0 },
    lumens: 600,
    colorTemperatureK: 2700,
    dimmer: 85,
    enabled: true,
    beamAngleDeg: 36,
    penumbra: 0.45,
    castsShadow: true,
    note: "壁付スポット（向き変更可）"
  };
};

export const newFurniture = (at?: { x: number; z: number }): FurnitureItem => ({
  id: uid("furniture"),
  name: "汎用ボックス",
  type: "box",
  position: { x: at?.x ?? 0, y: 0.3, z: at?.z ?? 0 },
  size: { x: 0.9, y: 0.6, z: 0.45 },
  rotationYDeg: 0,
  materialId: "fabric-warm-gray",
  castsShadow: true
});

// カタログのプリセットから家具を生成する。床に接地するよう y=高さ/2 に置く（既存規約）。
export const newFurnitureFromPreset = (preset: FurniturePreset, at?: { x: number; z: number }): FurnitureItem => ({
  id: uid("furniture"),
  name: preset.name,
  type: preset.type,
  position: { x: at?.x ?? 0, y: preset.size.y / 2, z: at?.z ?? 0 },
  size: { ...preset.size },
  rotationYDeg: 0,
  materialId: "fabric-warm-gray",
  color: preset.color,
  roughness: preset.roughness,
  metalness: preset.metalness,
  castsShadow: preset.castsShadow ?? true
});

export const newStair = (project: Project, at?: { x: number; z: number }): FurnitureItem => ({
  id: uid("furniture"),
  name: "階段",
  type: "stair",
  position: { x: at?.x ?? project.room.widthM / 2 - 1.2, y: 0, z: at?.z ?? 0 },
  size: { x: 1.0, y: project.room.ceilingHeightM, z: 2.8 },
  rotationYDeg: 0,
  materialId: "wall-white",
  color: "#cfc8bb",
  roughness: 0.8,
  metalness: 0,
  castsShadow: true
});

// 壁への設置先。クリック配置時は呼び出し側が壁ID＋壁上比率を渡す。
// 省略時のみ空き壁を自動選択する（3D等クリック非対応経路のフォールバック）。
type WallPlacement = { wallId?: string; centerRatio?: number };

export const newWindow = (project: Project, on?: WallPlacement): WindowOpening => ({
  id: uid("window"),
  name: "追加窓",
  wallId: on?.wallId ?? pickFreeWall(project)?.id ?? "",
  centerRatio: on?.centerRatio ?? 0.5,
  widthM: 1.65,
  // 高さは2000mm固定（腰高0＝床から2m）。横位置はクリック点を中心に置く。
  heightM: 2.0,
  sillHeightM: 0,
  hasGlass: true,
  style: "window"
});

// 窓カタログのプリセットから生成。寸法・style はプリセット、設置先はクリックした壁。
export const newWindowFromPreset = (
  preset: WindowPreset,
  project: Project,
  on?: WallPlacement
): WindowOpening => ({
  id: uid("window"),
  name: preset.label,
  wallId: on?.wallId ?? pickFreeWall(project)?.id ?? "",
  centerRatio: on?.centerRatio ?? 0.5,
  widthM: preset.widthM,
  heightM: preset.heightM,
  sillHeightM: preset.sillHeightM,
  hasGlass: preset.hasGlass,
  style: preset.style
});

export const newDoor = (project: Project, on?: WallPlacement): WindowOpening => ({
  id: uid("door"),
  name: "扉",
  wallId: on?.wallId ?? pickFreeWall(project)?.id ?? "",
  centerRatio: on?.centerRatio ?? 0.35,
  widthM: 0.85,
  heightM: 2.0,
  sillHeightM: 0,
  hasGlass: false,
  style: "door"
});

export const newVoid = (at?: { x: number; z: number }): VoidArea => ({
  id: uid("void"),
  name: "追加吹き抜け",
  center: { x: at?.x ?? 0, z: at?.z ?? 0 },
  size: { x: 2.0, z: 2.4 }
});

export const newCeilingZone = (at?: { x: number; z: number }): CeilingZone => ({
  id: uid("ceil"),
  name: "下げ天井",
  center: { x: at?.x ?? 0, z: at?.z ?? 0 },
  size: { x: 2.4, z: 2.0 },
  dropM: 0.3
});
