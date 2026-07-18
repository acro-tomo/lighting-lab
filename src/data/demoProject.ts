import type { Project } from "../types";
import { vec2, vec3 } from "../utils/units";

// 縦長の開放LDK。手前(+z)=キッチン / 中央=ダイニング / 奥(-z)=リビング(TV壁)。
// 長辺(東, +x)に大きな掃き出し窓、手前=オープン階段＋吹き抜け。
const roomWidthM = 4.6; // x
const roomDepthM = 8.4; // z
const ceilingM = 2.5;
const halfW = roomWidthM / 2;
const halfD = roomDepthM / 2;

export const demoProject: Project = {
  id: "demo-ldk-lighting-lab",
  name: "LDK Lighting Lab - デモLDK",
  room: {
    widthM: roomWidthM,
    depthM: roomDepthM,
    ceilingHeightM: ceilingM
  },
  materials: [
    {
      id: "wall-white",
      name: "白系マットクロス",
      baseColor: "#d9d5cc",
      roughness: 0.92,
      metalness: 0,
      emissiveColor: "#000000",
      emissiveIntensity: 0
    },
    {
      id: "wall-gray",
      name: "ライトグレーマットクロス",
      baseColor: "#9b9c97",
      roughness: 0.9,
      metalness: 0,
      emissiveColor: "#000000",
      emissiveIntensity: 0
    },
    {
      id: "accent-dark",
      name: "ダークアクセントクロス",
      baseColor: "#4a443c",
      roughness: 0.82,
      metalness: 0,
      emissiveColor: "#000000",
      emissiveIntensity: 0
    },
    {
      id: "floor-oak",
      name: "木目床",
      baseColor: "#a98156",
      roughness: 0.58,
      metalness: 0,
      emissiveColor: "#000000",
      emissiveIntensity: 0
    },
    {
      id: "kitchen-black",
      name: "マットブラックキッチン",
      baseColor: "#151514",
      roughness: 0.72,
      metalness: 0.08,
      emissiveColor: "#000000",
      emissiveIntensity: 0
    },
    {
      id: "stone-top",
      name: "石目ワークトップ",
      baseColor: "#b9b6ad",
      roughness: 0.46,
      metalness: 0,
      emissiveColor: "#000000",
      emissiveIntensity: 0
    },
    {
      id: "glass",
      name: "ガラス",
      baseColor: "#8fb3c8",
      roughness: 0.08,
      metalness: 0,
      emissiveColor: "#000000",
      emissiveIntensity: 0
    },
    {
      id: "tv-screen",
      name: "TV画面",
      baseColor: "#050505",
      roughness: 0.22,
      metalness: 0,
      emissiveColor: "#0a1020",
      emissiveIntensity: 0.15
    },
    {
      id: "metal-black",
      name: "黒金属",
      baseColor: "#090909",
      roughness: 0.38,
      metalness: 0.75,
      emissiveColor: "#000000",
      emissiveIntensity: 0
    },
    {
      id: "fabric-warm-gray",
      name: "ウォームグレー布",
      baseColor: "#6f6b62",
      roughness: 0.95,
      metalness: 0,
      emissiveColor: "#000000",
      emissiveIntensity: 0
    },
    {
      id: "rug-muted",
      name: "低彩度ラグ",
      baseColor: "#514d45",
      roughness: 0.98,
      metalness: 0,
      emissiveColor: "#000000",
      emissiveIntensity: 0
    }
  ],
  walls: [
    {
      id: "wall-north-tv",
      name: "リビングTV背面壁",
      start: vec2(-halfW, -halfD),
      end: vec2(halfW, -halfD),
      thicknessM: 0.14,
      heightM: ceilingM,
      materialId: "accent-dark"
    },
    {
      id: "wall-east-window",
      name: "掃き出し窓側壁",
      start: vec2(halfW, -halfD),
      end: vec2(halfW, halfD),
      thicknessM: 0.14,
      heightM: ceilingM,
      materialId: "wall-white"
    },
    {
      id: "wall-south-entry",
      name: "玄関側壁",
      start: vec2(halfW, halfD),
      end: vec2(-halfW, halfD),
      thicknessM: 0.14,
      heightM: ceilingM,
      materialId: "wall-white"
    },
    {
      id: "wall-west-kitchen",
      name: "キッチン背面壁",
      start: vec2(-halfW, halfD),
      end: vec2(-halfW, -halfD),
      thicknessM: 0.14,
      heightM: ceilingM,
      materialId: "wall-gray"
    }
  ],
  windows: [
    {
      id: "window-east",
      name: "LDK掃き出し窓",
      wallId: "wall-east-window",
      centerRatio: 0.32,
      widthM: 3.6,
      heightM: 2.1,
      sillHeightM: 0.1,
      hasGlass: true
    }
  ],
  voids: [
    {
      id: "void-stair",
      name: "階段・吹き抜け",
      center: vec2(1.5, 3.3),
      size: vec2(1.5, 1.6)
    }
  ],
  furniture: [
    {
      id: "furniture-tv",
      name: "65インチ壁掛けTV",
      type: "tv",
      position: vec3(0, 1.25, -4.12),
      size: vec3(1.55, 0.88, 0.06),
      rotationYDeg: 0,
      materialId: "tv-screen",
      castsShadow: true
    },
    {
      id: "furniture-tv-board",
      name: "TVボード",
      type: "shelf",
      position: vec3(0, 0.26, -3.86),
      size: vec3(2.2, 0.52, 0.42),
      rotationYDeg: 0,
      materialId: "accent-dark",
      color: "#2f2a24",
      castsShadow: true
    },
    {
      id: "furniture-sofa",
      name: "3人掛けソファ",
      type: "sofa",
      position: vec3(0, 0.42, -2.15),
      size: vec3(2.35, 0.84, 0.95),
      rotationYDeg: 180,
      materialId: "fabric-warm-gray",
      castsShadow: true
    },
    {
      id: "furniture-coffee-table",
      name: "ローテーブル",
      type: "rectTable",
      position: vec3(0, 0.2, -3.0),
      size: vec3(1.05, 0.4, 0.55),
      rotationYDeg: 0,
      materialId: "floor-oak",
      color: "#8b6a45",
      roughness: 0.6,
      castsShadow: true
    },
    {
      id: "furniture-rug",
      name: "リビングラグ",
      type: "rug",
      position: vec3(0, 0.012, -2.95),
      size: vec3(2.7, 0.024, 2.3),
      rotationYDeg: 0,
      materialId: "rug-muted",
      castsShadow: false
    },
    {
      id: "furniture-dining-table",
      name: "丸ダイニングテーブル 1200",
      type: "roundTable",
      position: vec3(0, 0.36, -0.4),
      size: vec3(1.2, 0.72, 1.2),
      rotationYDeg: 0,
      materialId: "wall-gray",
      color: "#403f3b",
      roughness: 0.72,
      metalness: 0,
      castsShadow: true
    },
    {
      id: "furniture-chair-1",
      name: "ダイニングチェア 1",
      type: "chair",
      position: vec3(0, 0.44, -1.2),
      size: vec3(0.48, 0.88, 0.48),
      rotationYDeg: 0,
      materialId: "fabric-warm-gray",
      castsShadow: true
    },
    {
      id: "furniture-chair-2",
      name: "ダイニングチェア 2",
      type: "chair",
      position: vec3(0, 0.44, 0.4),
      size: vec3(0.48, 0.88, 0.48),
      rotationYDeg: 180,
      materialId: "fabric-warm-gray",
      castsShadow: true
    },
    {
      id: "furniture-chair-3",
      name: "ダイニングチェア 3",
      type: "chair",
      position: vec3(-0.85, 0.44, -0.4),
      size: vec3(0.48, 0.88, 0.48),
      rotationYDeg: 90,
      materialId: "fabric-warm-gray",
      castsShadow: true
    },
    {
      id: "furniture-chair-4",
      name: "ダイニングチェア 4",
      type: "chair",
      position: vec3(0.85, 0.44, -0.4),
      size: vec3(0.48, 0.88, 0.48),
      rotationYDeg: -90,
      materialId: "fabric-warm-gray",
      castsShadow: true
    },
    {
      id: "furniture-kitchen-island",
      name: "キッチンアイランド",
      type: "kitchen",
      position: vec3(0, 0.45, 1.7),
      size: vec3(2.1, 0.9, 0.95),
      rotationYDeg: 0,
      materialId: "kitchen-black",
      castsShadow: true
    },
    {
      id: "furniture-kitchen-counter",
      name: "バックカウンター",
      type: "counter",
      position: vec3(-2.0, 0.45, 2.5),
      size: vec3(0.55, 0.9, 3.0),
      rotationYDeg: 0,
      materialId: "kitchen-black",
      castsShadow: true
    },
    {
      id: "furniture-fridge",
      name: "冷蔵庫",
      type: "fridge",
      position: vec3(-2.0, 0.9, 3.85),
      size: vec3(0.7, 1.8, 0.7),
      rotationYDeg: 0,
      materialId: "metal-black",
      castsShadow: true
    },
    {
      id: "furniture-stair",
      name: "オープン階段",
      type: "stair",
      position: vec3(1.6, 0.9, 3.3),
      size: vec3(1.2, 1.8, 1.5),
      rotationYDeg: 0,
      materialId: "wall-gray",
      castsShadow: true
    }
  ],
  lights: [
    {
      id: "light-tv-wall-1",
      name: "リビングダウンライト 1",
      type: "downlight",
      model: "dl-medium",
      position: vec3(-1.0, 2.46, -3.7),
      mountHeightM: ceilingM,
      rotationDeg: { x: -90, y: 0, z: 0 },
      target: vec3(-1.0, 0, -3.7),
      lumens: 520,
      colorTemperatureK: 2700,
      dimmer: 30,
      enabled: true,
      beamAngleDeg: 60,
      penumbra: 0.5,
      castsShadow: true,
      note: "TV壁ウォッシュ"
    },
    {
      id: "light-tv-wall-2",
      name: "リビングダウンライト 2",
      type: "downlight",
      model: "dl-medium",
      position: vec3(0, 2.46, -3.7),
      mountHeightM: ceilingM,
      rotationDeg: { x: -90, y: 0, z: 0 },
      target: vec3(0, 0, -3.7),
      lumens: 520,
      colorTemperatureK: 2700,
      dimmer: 30,
      enabled: true,
      beamAngleDeg: 60,
      penumbra: 0.5,
      castsShadow: true,
      note: "TV壁ウォッシュ"
    },
    {
      id: "light-tv-wall-3",
      name: "リビングダウンライト 3",
      type: "downlight",
      model: "dl-medium",
      position: vec3(1.0, 2.46, -3.7),
      mountHeightM: ceilingM,
      rotationDeg: { x: -90, y: 0, z: 0 },
      target: vec3(1.0, 0, -3.7),
      lumens: 520,
      colorTemperatureK: 2700,
      dimmer: 30,
      enabled: true,
      beamAngleDeg: 60,
      penumbra: 0.5,
      castsShadow: true,
      note: "TV壁ウォッシュ"
    },
    {
      id: "light-living-1",
      name: "リビングダウンライト 4",
      type: "downlight",
      model: "dl-medium",
      position: vec3(0, 2.46, -2.2),
      mountHeightM: ceilingM,
      rotationDeg: { x: -90, y: 0, z: 0 },
      target: vec3(0, 0, -2.2),
      lumens: 620,
      colorTemperatureK: 2700,
      dimmer: 40,
      enabled: true,
      beamAngleDeg: 65,
      penumbra: 0.5,
      castsShadow: true,
      note: "ソファ上"
    },
    {
      id: "light-dining-pendant",
      name: "ダイニングペンダント",
      type: "pendant",
      model: "pendant",
      position: vec3(0, 1.72, -0.4),
      mountHeightM: ceilingM,
      rotationDeg: { x: -90, y: 0, z: 0 },
      target: vec3(0, 0.72, -0.4),
      lumens: 720,
      colorTemperatureK: 2700,
      dimmer: 58,
      enabled: true,
      beamAngleDeg: 70,
      penumbra: 0.65,
      castsShadow: true,
      note: "テーブル中心に吊るした想定",
      cordLengthM: 0.8
    },
    {
      id: "light-kitchen-1",
      name: "キッチンダウンライト 1",
      type: "downlight",
      model: "dl-medium",
      position: vec3(-0.9, 2.4, 1.7),
      mountHeightM: ceilingM,
      rotationDeg: { x: -90, y: 0, z: 0 },
      target: vec3(-0.9, 0, 1.7),
      lumens: 760,
      colorTemperatureK: 3500,
      dimmer: 82,
      enabled: true,
      beamAngleDeg: 60,
      penumbra: 0.5,
      castsShadow: true,
      note: "アイランド手元"
    },
    {
      id: "light-kitchen-2",
      name: "キッチンダウンライト 2",
      type: "downlight",
      model: "dl-medium",
      position: vec3(0.9, 2.4, 1.7),
      mountHeightM: ceilingM,
      rotationDeg: { x: -90, y: 0, z: 0 },
      target: vec3(0.9, 0, 1.7),
      lumens: 760,
      colorTemperatureK: 3500,
      dimmer: 82,
      enabled: true,
      beamAngleDeg: 60,
      penumbra: 0.5,
      castsShadow: true,
      note: "アイランド手元"
    },
    {
      id: "light-kitchen-3",
      name: "キッチンダウンライト 3",
      type: "downlight",
      model: "dl-medium",
      position: vec3(-1.9, 2.4, 2.9),
      mountHeightM: ceilingM,
      rotationDeg: { x: -90, y: 0, z: 0 },
      target: vec3(-1.9, 0, 2.9),
      lumens: 760,
      colorTemperatureK: 3500,
      dimmer: 82,
      enabled: true,
      beamAngleDeg: 60,
      penumbra: 0.5,
      castsShadow: true,
      note: "バックカウンター手元"
    },
    {
      id: "light-stair-bracket",
      name: "階段ブラケット",
      type: "bracket",
      model: "bracket",
      position: vec3(2.2, 1.5, 3.3),
      mountHeightM: 1.5,
      rotationDeg: { x: 0, y: 90, z: 0 },
      target: vec3(1.6, 1.3, 3.3),
      lumens: 360,
      colorTemperatureK: 2700,
      dimmer: 35,
      enabled: true,
      beamAngleDeg: 120,
      penumbra: 0.8,
      castsShadow: true,
      note: "階段まわりの常夜灯寄り"
    },
    {
      id: "light-tv-tape",
      name: "TV背面間接テープライト",
      type: "tape",
      model: "tape",
      position: vec3(0, 1.55, -4.06),
      mountHeightM: 1.55,
      rotationDeg: { x: 0, y: 0, z: 0 },
      target: vec3(0, 1.55, -4.2),
      lumens: 420,
      colorTemperatureK: 2400,
      dimmer: 60,
      enabled: true,
      beamAngleDeg: 160,
      penumbra: 0.9,
      castsShadow: false,
      note: "くつろぎ時の壁面グロー",
      lengthM: 1.7
    }
  ],
  camera: {
    position: vec3(1.5, 1.45, 2.9),
    target: vec3(-0.2, 1.1, -1.8),
    fov: 62,
    exposure: 0.9,
    resolutionWidth: 1600
  },
  daylight: { enabled: true, month: 10, day: 15, hour: 14, northOffsetDeg: 0, latitudeDeg: 35 },
  activeFloor: 1
};
