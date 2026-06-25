import type { WindowOpening } from "../types";

// 「窓」追加ポップアップに並べるプリセット。sillHeightM=床からの腰高 / heightM=開口の高さ(m)。
// クリックした壁にこの寸法で設置する（横位置はクリック点が中心）。
export type WindowPreset = {
  id: string;
  label: string;
  widthM: number;
  heightM: number;
  sillHeightM: number;
  hasGlass: boolean;
  style: NonNullable<WindowOpening["style"]>;
};

export const windowCatalog: WindowPreset[] = [
  { id: "sweep", label: "掃き出し窓", widthM: 1.65, heightM: 2.0, sillHeightM: 0, hasGlass: true, style: "window" },
  { id: "waist", label: "腰窓", widthM: 1.65, heightM: 1.1, sillHeightM: 0.9, hasGlass: true, style: "window" },
  { id: "large", label: "大開口窓", widthM: 2.6, heightM: 2.1, sillHeightM: 0, hasGlass: true, style: "window" },
  { id: "small", label: "小窓", widthM: 0.6, heightM: 0.9, sillHeightM: 1.0, hasGlass: true, style: "window" },
  { id: "high", label: "高窓（横長）", widthM: 1.6, heightM: 0.45, sillHeightM: 1.9, hasGlass: true, style: "window" },
  { id: "opening", label: "開口（壁穴）", widthM: 1.2, heightM: 2.0, sillHeightM: 0, hasGlass: false, style: "opening" },
  { id: "entranceDoor", label: "玄関扉", widthM: 0.9, heightM: 2.0, sillHeightM: 0, hasGlass: false, style: "door" },
  { id: "backDoor", label: "勝手口", widthM: 0.75, heightM: 2.0, sillHeightM: 0, hasGlass: false, style: "door" }
];

export const getWindowPreset = (id: string) => windowCatalog.find((preset) => preset.id === id);
