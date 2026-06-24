import type { Project } from "../types";
import { vec2, vec3 } from "../utils/units";

const roomWidthM = 8.6;
const roomDepthM = 6.4;
const halfW = roomWidthM / 2;
const halfD = roomDepthM / 2;

export const demoProject: Project = {
  id: "demo-ldk-lighting-lab",
  name: "LDK Lighting Lab - デモLDK",
  room: {
    widthM: roomWidthM,
    depthM: roomDepthM,
    ceilingHeightM: 2.42
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
      name: "TV背面壁",
      start: vec2(-halfW, -halfD),
      end: vec2(halfW, -halfD),
      thicknessM: 0.14,
      heightM: 2.42,
      materialId: "accent-dark"
    },
    {
      id: "wall-east-stair",
      name: "階段側壁",
      start: vec2(halfW, -halfD),
      end: vec2(halfW, halfD),
      thicknessM: 0.14,
      heightM: 3.9,
      materialId: "wall-white"
    },
    {
      id: "wall-south-window",
      name: "掃き出し窓側壁",
      start: vec2(halfW, halfD),
      end: vec2(-halfW, halfD),
      thicknessM: 0.14,
      heightM: 2.42,
      materialId: "wall-white"
    },
    {
      id: "wall-west-kitchen",
      name: "キッチン背面壁",
      start: vec2(-halfW, halfD),
      end: vec2(-halfW, -halfD),
      thicknessM: 0.14,
      heightM: 2.42,
      materialId: "wall-gray"
    }
  ],
  windows: [
    {
      id: "window-south",
      name: "LDK掃き出し窓",
      wallId: "wall-south-window",
      centerRatio: 0.48,
      widthM: 3.2,
      heightM: 2.05,
      sillHeightM: 0.18,
      hasGlass: true
    }
  ],
  voids: [
    {
      id: "void-stair",
      name: "階段・吹き抜け",
      center: vec2(3.0, 1.55),
      size: vec2(2.2, 2.8)
    }
  ],
  furniture: [
    {
      id: "furniture-dining-table",
      name: "丸ダイニングテーブル 1200",
      type: "roundTable",
      position: vec3(-1.35, 0.36, 0.95),
      size: vec3(1.2, 0.72, 1.2),
      rotationYDeg: 0,
      materialId: "floor-oak",
      color: "#8b6a45",
      roughness: 0.62,
      metalness: 0,
      castsShadow: true
    },
    {
      id: "furniture-chair-1",
      name: "ダイニングチェア 1",
      type: "chair",
      position: vec3(-1.35, 0.44, 0.08),
      size: vec3(0.48, 0.88, 0.48),
      rotationYDeg: 0,
      materialId: "fabric-warm-gray",
      castsShadow: true
    },
    {
      id: "furniture-chair-2",
      name: "ダイニングチェア 2",
      type: "chair",
      position: vec3(-1.35, 0.44, 1.82),
      size: vec3(0.48, 0.88, 0.48),
      rotationYDeg: 180,
      materialId: "fabric-warm-gray",
      castsShadow: true
    },
    {
      id: "furniture-kitchen",
      name: "ペニンシュラキッチン",
      type: "kitchen",
      position: vec3(-3.0, 0.45, -0.55),
      size: vec3(2.9, 0.9, 0.98),
      rotationYDeg: 0,
      materialId: "kitchen-black",
      castsShadow: true
    },
    {
      id: "furniture-cupboard",
      name: "カップボード",
      type: "cupboard",
      position: vec3(-4.0, 1.05, -1.8),
      size: vec3(0.42, 2.1, 2.2),
      rotationYDeg: 0,
      materialId: "wall-gray",
      castsShadow: true
    },
    {
      id: "furniture-sofa",
      name: "ソファ",
      type: "sofa",
      position: vec3(1.2, 0.42, 1.22),
      size: vec3(2.35, 0.84, 0.92),
      rotationYDeg: 180,
      materialId: "fabric-warm-gray",
      castsShadow: true
    },
    {
      id: "furniture-rug",
      name: "リビングラグ",
      type: "rug",
      position: vec3(1.2, 0.012, 0.7),
      size: vec3(2.8, 0.024, 1.85),
      rotationYDeg: 0,
      materialId: "rug-muted",
      castsShadow: false
    },
    {
      id: "furniture-tv",
      name: "65インチ壁掛けTV",
      type: "tv",
      position: vec3(1.1, 1.15, -3.12),
      size: vec3(1.45, 0.82, 0.06),
      rotationYDeg: 0,
      materialId: "tv-screen",
      castsShadow: true
    }
  ],
  lights: [
    {
      id: "light-tv-wall-1",
      name: "リビングダウンライト 1",
      type: "downlight",
      model: "dl-medium",
      position: vec3(0.1, 2.38, -2.92),
      mountHeightM: 2.42,
      rotationDeg: { x: -90, y: 0, z: 0 },
      target: vec3(0.1, 0, -2.92),
      lumens: 520,
      colorTemperatureK: 2700,
      dimmer: 85,
      enabled: true,
      beamAngleDeg: 60,
      penumbra: 0.5,
      castsShadow: true,
      note: "標準ダウンライト（真下配光）"
    },
    {
      id: "light-tv-wall-2",
      name: "リビングダウンライト 2",
      type: "downlight",
      model: "dl-medium",
      position: vec3(1.1, 2.38, -2.92),
      mountHeightM: 2.42,
      rotationDeg: { x: -90, y: 0, z: 0 },
      target: vec3(1.1, 0, -2.92),
      lumens: 520,
      colorTemperatureK: 2700,
      dimmer: 85,
      enabled: true,
      beamAngleDeg: 60,
      penumbra: 0.5,
      castsShadow: true,
      note: "標準ダウンライト（真下配光）"
    },
    {
      id: "light-tv-wall-3",
      name: "リビングダウンライト 3",
      type: "downlight",
      model: "dl-medium",
      position: vec3(2.1, 2.38, -2.92),
      mountHeightM: 2.42,
      rotationDeg: { x: -90, y: 0, z: 0 },
      target: vec3(2.1, 0, -2.92),
      lumens: 520,
      colorTemperatureK: 2700,
      dimmer: 85,
      enabled: true,
      beamAngleDeg: 60,
      penumbra: 0.5,
      castsShadow: true,
      note: "標準ダウンライト（真下配光）"
    },
    {
      id: "light-rail-spot-1",
      name: "キッチンダウンライト 1",
      type: "downlight",
      model: "dl-medium",
      position: vec3(-3.9, 2.32, -1.18),
      mountHeightM: 2.42,
      rotationDeg: { x: -90, y: 0, z: 0 },
      target: vec3(-3.9, 0, -1.18),
      lumens: 760,
      colorTemperatureK: 3500,
      dimmer: 82,
      enabled: true,
      beamAngleDeg: 60,
      penumbra: 0.5,
      castsShadow: true,
      note: "標準ダウンライト（真下配光）"
    },
    {
      id: "light-rail-spot-2",
      name: "キッチンダウンライト 2",
      type: "downlight",
      model: "dl-medium",
      position: vec3(-3.0, 2.32, -1.18),
      mountHeightM: 2.42,
      rotationDeg: { x: -90, y: 0, z: 0 },
      target: vec3(-3.0, 0, -1.18),
      lumens: 760,
      colorTemperatureK: 3500,
      dimmer: 82,
      enabled: true,
      beamAngleDeg: 60,
      penumbra: 0.5,
      castsShadow: true,
      note: "標準ダウンライト（真下配光）"
    },
    {
      id: "light-rail-spot-3",
      name: "キッチンダウンライト 3",
      type: "downlight",
      model: "dl-medium",
      position: vec3(-2.1, 2.32, -1.18),
      mountHeightM: 2.42,
      rotationDeg: { x: -90, y: 0, z: 0 },
      target: vec3(-2.1, 0, -1.18),
      lumens: 760,
      colorTemperatureK: 3500,
      dimmer: 82,
      enabled: true,
      beamAngleDeg: 60,
      penumbra: 0.5,
      castsShadow: true,
      note: "標準ダウンライト（真下配光）"
    },
    {
      id: "light-dining-pendant",
      name: "ダイニングペンダント",
      type: "pendant",
      model: "pendant",
      position: vec3(-1.35, 1.62, 0.95),
      mountHeightM: 2.42,
      rotationDeg: { x: -90, y: 0, z: 0 },
      target: vec3(-1.35, 0.72, 0.95),
      lumens: 940,
      colorTemperatureK: 2700,
      dimmer: 92,
      enabled: true,
      beamAngleDeg: 70,
      penumbra: 0.65,
      castsShadow: true,
      note: "テーブル中心に吊るした想定",
      cordLengthM: 0.8
    },
    {
      id: "light-stair-bracket",
      name: "階段ブラケット",
      type: "bracket",
      model: "bracket",
      position: vec3(4.18, 1.45, 1.35),
      mountHeightM: 1.45,
      rotationDeg: { x: 0, y: -90, z: 0 },
      target: vec3(3.4, 1.25, 1.35),
      lumens: 360,
      colorTemperatureK: 2700,
      dimmer: 55,
      enabled: true,
      beamAngleDeg: 120,
      penumbra: 0.8,
      castsShadow: true,
      note: "階段下から見える常夜灯寄り"
    },
    {
      id: "light-tv-tape",
      name: "TV背面間接テープライト",
      type: "tape",
      model: "tape",
      position: vec3(1.1, 1.52, -3.15),
      mountHeightM: 1.52,
      rotationDeg: { x: 0, y: 0, z: 0 },
      target: vec3(1.1, 1.52, -3.2),
      lumens: 420,
      colorTemperatureK: 2400,
      dimmer: 30,
      enabled: true,
      beamAngleDeg: 160,
      penumbra: 0.9,
      castsShadow: false,
      note: "くつろぎ時の壁面グロー",
      lengthM: 1.65
    }
  ],
  lightingScenes: [
    {
      id: "scene-dining",
      name: "食事",
      description: "テーブルとキッチンを中心に、TV壁は控えめ。",
      lightStates: {
        "light-dining-pendant": { enabled: true, dimmer: 92 },
        "light-rail-spot-1": { enabled: true, dimmer: 82 },
        "light-rail-spot-2": { enabled: true, dimmer: 82 },
        "light-rail-spot-3": { enabled: true, dimmer: 82 },
        "light-tv-wall-1": { enabled: true, dimmer: 28 },
        "light-tv-wall-2": { enabled: true, dimmer: 28 },
        "light-tv-wall-3": { enabled: true, dimmer: 28 },
        "light-stair-bracket": { enabled: true, dimmer: 35 },
        "light-tv-tape": { enabled: false, dimmer: 0 }
      }
    },
    {
      id: "scene-relax",
      name: "くつろぎ",
      description: "ペンダントを落としてTV壁と間接照明を強める。",
      lightStates: {
        "light-dining-pendant": { enabled: true, dimmer: 18 },
        "light-rail-spot-1": { enabled: true, dimmer: 28 },
        "light-rail-spot-2": { enabled: true, dimmer: 28 },
        "light-rail-spot-3": { enabled: true, dimmer: 28 },
        "light-tv-wall-1": { enabled: true, dimmer: 62 },
        "light-tv-wall-2": { enabled: true, dimmer: 62 },
        "light-tv-wall-3": { enabled: true, dimmer: 62 },
        "light-stair-bracket": { enabled: true, dimmer: 45 },
        "light-tv-tape": { enabled: true, dimmer: 52 }
      }
    },
    {
      id: "scene-night",
      name: "夜間移動",
      description: "最低限の足元・階段視認だけを残す。",
      lightStates: {
        "light-dining-pendant": { enabled: false, dimmer: 0 },
        "light-rail-spot-1": { enabled: true, dimmer: 8 },
        "light-rail-spot-2": { enabled: false, dimmer: 0 },
        "light-rail-spot-3": { enabled: false, dimmer: 0 },
        "light-tv-wall-1": { enabled: false, dimmer: 0 },
        "light-tv-wall-2": { enabled: true, dimmer: 10 },
        "light-tv-wall-3": { enabled: false, dimmer: 0 },
        "light-stair-bracket": { enabled: true, dimmer: 38 },
        "light-tv-tape": { enabled: true, dimmer: 14 }
      }
    }
  ],
  cameraViews: [
    {
      id: "view-dining",
      name: "ダイニング着席",
      position: vec3(-2.55, 1.18, 3.15),
      target: vec3(-1.15, 0.95, -0.15),
      fov: 64,
      exposure: 1.12,
      resolutionWidth: 1600
    },
    {
      id: "view-sofa",
      name: "ソファ着席",
      position: vec3(1.55, 1.08, 2.65),
      target: vec3(1.05, 1.05, -2.72),
      fov: 62,
      exposure: 1.08,
      resolutionWidth: 1600
    },
    {
      id: "view-kitchen",
      name: "キッチン作業",
      position: vec3(-3.1, 1.45, 0.4),
      target: vec3(-2.65, 0.95, -1.25),
      fov: 58,
      exposure: 1.12,
      resolutionWidth: 1600
    },
    {
      id: "view-stair",
      name: "階段下",
      position: vec3(3.7, 1.25, 2.65),
      target: vec3(2.45, 1.18, 0.05),
      fov: 58,
      exposure: 1.05,
      resolutionWidth: 1600
    },
    {
      id: "view-free",
      name: "自由視点",
      position: vec3(1.8, 2.35, 3.05),
      target: vec3(-0.35, 0.72, -0.35),
      fov: 64,
      exposure: 1.22,
      resolutionWidth: 1600
    }
  ],
  activeSceneId: "scene-dining",
  activeCameraViewId: "view-free",
  daylight: { enabled: true, month: 10, day: 15, hour: 14, northOffsetDeg: 0, latitudeDeg: 35 }
};
