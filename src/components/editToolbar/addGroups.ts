import { furnitureCatalog } from "../../data/furnitureCatalog";
import { windowAddKind, windowCatalog } from "../../data/windowCatalog";
import { fixtureCatalog } from "../../data/fixtureCatalog";
import { fixtureAddKind } from "../../data/fixtureAddKinds";
import type { AddGroup, AddItem } from "./types";

const fixtureItems = (ids: string[]): AddItem[] => ids.map((id) => {
  const model = fixtureCatalog.find((fixture) => fixture.id === id);
  if (!model) throw new Error(`Unknown fixture catalog id: ${id}`);
  return { kind: fixtureAddKind(model.id), label: model.label, hint: model.description };
});

const furnitureItems = (ids: string[]): AddItem[] => ids.map((id) => {
  const preset = furnitureCatalog.find((item) => item.id === id);
  if (!preset) throw new Error(`Unknown furniture catalog id: ${id}`);
  return { kind: `furniture:${preset.id}`, label: preset.label };
});

export const ADD_GROUPS: AddGroup[] = [
  {
    id: "lighting",
    title: "照明",
    categories: [
      { id: "downlight", title: "ダウンライト", hint: "天井に埋め込む", items: fixtureItems(["dl-diffuse", "dl-medium", "dl-narrow", "dl-glareless", "dl-universal"]) },
      { id: "pendant", title: "ペンダント", hint: "天井から吊るす", items: fixtureItems(["pendant", "pendant-globe"]) },
      { id: "wall-light", title: "壁の照明", hint: "壁に取り付ける", items: fixtureItems(["sp-wall", "bracket"]) },
      { id: "indirect", title: "間接照明", hint: "光源を隠して照らす", items: fixtureItems(["tape"]) }
    ]
  },
  {
    id: "window",
    title: "窓",
    items: windowCatalog
      .filter((preset) => preset.style === "window" || preset.style === "opening")
      .map((preset) => ({ kind: windowAddKind(preset.id), label: preset.label, hint: "壁をクリック" }))
  },
  {
    id: "door",
    title: "建具",
    items: [
      { kind: "door", label: "扉", hint: "壁をクリック" },
      ...windowCatalog
        .filter((preset) => preset.style === "door")
        .map((preset) => ({ kind: windowAddKind(preset.id), label: preset.label, hint: "壁をクリック" }))
    ]
  },
  {
    id: "structure",
    title: "開口・構造",
    items: [
      { kind: "void", label: "吹き抜け" },
      { kind: "ceilingZone", label: "下げ天井" },
      { kind: "floorZone", label: "下げ床(土間)" },
      { kind: "stair", label: "階段" }
    ]
  },
  {
    id: "furniture",
    title: "家具",
    categories: [
      { id: "living", title: "リビング", items: furnitureItems(["sofa", "loungeChair", "rug", "tv", "plant"]) },
      { id: "dining-work", title: "ダイニング・仕事", items: furnitureItems(["rectTable", "roundTable", "chair", "desk"]) },
      { id: "kitchen", title: "キッチン", items: furnitureItems(["kitchen", "cupboard", "fridge", "counter"]) },
      { id: "water", title: "水まわり", items: furnitureItems(["washer", "washstand", "toilet", "bathtub"]) },
      { id: "bed-storage", title: "寝室・収納", items: furnitureItems(["bed", "shelf", "shoeCabinet"]) },
      { id: "free", title: "自由な形", items: furnitureItems(["box"]) }
    ]
  }
];
