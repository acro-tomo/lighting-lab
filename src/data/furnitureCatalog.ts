import type { FurnitureType, Vec3M } from "../types";

// 「家具」追加ポップアップに並べる既製プリセット。size は x=幅 / y=高さ / z=奥行(m)。
// 3D形状は Scene3D の FurniturePrimitive が type ごとに描き分ける。
export type FurniturePreset = {
  id: string;
  label: string;
  type: FurnitureType;
  name: string;
  size: Vec3M;
  color?: string;
  roughness?: number;
  metalness?: number;
  castsShadow?: boolean;
};

export const furnitureCatalog: FurniturePreset[] = [
  { id: "sofa", label: "ソファ", type: "sofa", name: "ソファ", size: { x: 2.1, y: 0.84, z: 0.92 }, color: "#6f7480", roughness: 0.92 },
  { id: "bed", label: "ベッド", type: "bed", name: "ベッド", size: { x: 1.5, y: 0.55, z: 2.05 }, color: "#d8d2c4", roughness: 0.9 },
  { id: "tv", label: "テレビ", type: "tv", name: "テレビ", size: { x: 1.45, y: 0.82, z: 0.07 } },
  { id: "kitchen", label: "キッチン", type: "kitchen", name: "キッチン", size: { x: 2.4, y: 0.9, z: 0.65 }, color: "#1d1d1b", roughness: 0.5, metalness: 0.12 },
  { id: "cupboard", label: "カップボード", type: "cupboard", name: "カップボード", size: { x: 1.2, y: 2.0, z: 0.45 }, color: "#b9b3a6", roughness: 0.7 },
  { id: "fridge", label: "冷蔵庫", type: "fridge", name: "冷蔵庫", size: { x: 0.7, y: 1.8, z: 0.7 }, color: "#e7e8ea", roughness: 0.35, metalness: 0.25 },
  { id: "shelf", label: "可動棚", type: "shelf", name: "可動棚", size: { x: 0.9, y: 1.8, z: 0.4 }, color: "#9a8d77", roughness: 0.8 },
  { id: "rectTable", label: "角テーブル", type: "rectTable", name: "角テーブル", size: { x: 1.4, y: 0.72, z: 0.8 }, color: "#8b6a45", roughness: 0.6 },
  { id: "roundTable", label: "丸テーブル", type: "roundTable", name: "丸テーブル", size: { x: 1.2, y: 0.72, z: 1.2 }, color: "#8b6a45", roughness: 0.6 },
  { id: "chair", label: "椅子", type: "chair", name: "椅子", size: { x: 0.48, y: 0.88, z: 0.48 }, color: "#7d776c", roughness: 0.85 },
  { id: "counter", label: "カウンター", type: "counter", name: "カウンター", size: { x: 1.8, y: 1.0, z: 0.4 }, color: "#7a6e58", roughness: 0.6 },
  { id: "desk", label: "デスク", type: "desk", name: "デスク", size: { x: 1.2, y: 0.72, z: 0.6 }, color: "#c9b79a", roughness: 0.7 },
  { id: "washer", label: "洗濯機", type: "washer", name: "洗濯機", size: { x: 0.6, y: 0.9, z: 0.65 }, color: "#eceef0", roughness: 0.4, metalness: 0.1 },
  { id: "washstand", label: "洗面台", type: "washstand", name: "洗面台", size: { x: 0.75, y: 1.8, z: 0.5 }, color: "#f0f0ee", roughness: 0.45 },
  { id: "toilet", label: "トイレ", type: "toilet", name: "トイレ", size: { x: 0.4, y: 0.78, z: 0.6 }, color: "#f2f2f0", roughness: 0.35 },
  { id: "bathtub", label: "浴槽", type: "bathtub", name: "浴槽", size: { x: 1.6, y: 0.6, z: 0.8 }, color: "#e8eaec", roughness: 0.4 },
  { id: "shoeCabinet", label: "下駄箱", type: "shoeCabinet", name: "下駄箱", size: { x: 0.9, y: 1.0, z: 0.4 }, color: "#b9b3a6", roughness: 0.75 },
  { id: "rug", label: "ラグ", type: "rug", name: "ラグ", size: { x: 2.4, y: 0.024, z: 1.7 }, color: "#7f6f63", roughness: 0.96, castsShadow: false },
  { id: "box", label: "汎用ボックス", type: "box", name: "汎用ボックス", size: { x: 0.9, y: 0.6, z: 0.45 }, color: "#8a8377", roughness: 0.8 }
];

export const getFurniturePreset = (id: string) => furnitureCatalog.find((preset) => preset.id === id);
