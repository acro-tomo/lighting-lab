import { furnitureCatalog } from "../../data/furnitureCatalog";
import { windowCatalog } from "../../data/windowCatalog";
import { fixtureCatalog } from "../../data/fixtureCatalog";
import { fixtureAddKind } from "../../data/fixtureAddKinds";
import type { AddItem } from "./types";

// 追加ポップアップのグループ。kind は App.handleAddObject と一致させる。
// 家具はカタログから生成し、kind を "furniture:<presetId>" とする。
export const ADD_GROUPS: { title: string; items: AddItem[] }[] = [
  {
    title: "照明",
    items: fixtureCatalog.map((model) => ({
      kind: fixtureAddKind(model.id),
      label: model.label,
      hint: model.description
    }))
  },
  {
    // 窓はカタログから選ぶ（kind = "window:<presetId>"）。掃き出し/腰窓/高窓など。
    title: "窓",
    items: windowCatalog
      .filter((preset) => preset.style === "window" || preset.style === "opening")
      .map((preset) => ({ kind: `window:${preset.id}`, label: preset.label, hint: "壁をクリック" }))
  },
  {
    title: "建具",
    items: [
      { kind: "door", label: "扉", hint: "壁をクリック" },
      ...windowCatalog
        .filter((preset) => preset.style === "door")
        .map((preset) => ({ kind: `window:${preset.id}`, label: preset.label, hint: "壁をクリック" }))
    ]
  },
  {
    title: "開口・構造",
    items: [
      { kind: "void", label: "吹き抜け" },
      { kind: "ceilingZone", label: "下げ天井" },
      { kind: "floorZone", label: "下げ床(土間)" },
      { kind: "stair", label: "階段" }
    ]
  },
  {
    title: "家具",
    items: furnitureCatalog.map((preset) => ({ kind: `furniture:${preset.id}`, label: preset.label }))
  }
];
