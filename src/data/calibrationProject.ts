import type { Project } from "../types";
import { vec2, vec3 } from "../utils/units";

const widthM = 5.0;
const depthM = 4.5;
const heightM = 2.4;
const halfW = widthM / 2;
const halfD = depthM / 2;

export const calibrationProject: Project = {
  id: "lighting-calibration-room",
  name: "Lighting Calibration Room",
  room: {
    widthM,
    depthM,
    ceilingHeightM: heightM
  },
  materials: [
    {
      id: "cal-wall-warm-white",
      name: "Calibration wall warm white",
      baseColor: "#e5dfd2",
      roughness: 0.82,
      metalness: 0,
      emissiveColor: "#000000",
      emissiveIntensity: 0
    },
    {
      id: "cal-ceiling-white",
      name: "Calibration ceiling white",
      baseColor: "#f0ebe2",
      roughness: 0.9,
      metalness: 0,
      emissiveColor: "#000000",
      emissiveIntensity: 0
    },
    {
      id: "cal-floor-oak",
      name: "Calibration medium oak floor",
      baseColor: "#a7794e",
      roughness: 0.72,
      metalness: 0,
      emissiveColor: "#000000",
      emissiveIntensity: 0
    },
    {
      id: "cal-light-wood",
      name: "Calibration light wood",
      baseColor: "#b98a58",
      roughness: 0.66,
      metalness: 0,
      emissiveColor: "#000000",
      emissiveIntensity: 0
    },
    {
      id: "cal-chair-gray",
      name: "Calibration warm gray fabric",
      baseColor: "#79756d",
      roughness: 0.92,
      metalness: 0,
      emissiveColor: "#000000",
      emissiveIntensity: 0
    },
    {
      id: "cal-matte-dark",
      name: "Calibration matte dark",
      baseColor: "#2a2824",
      roughness: 0.78,
      metalness: 0,
      emissiveColor: "#000000",
      emissiveIntensity: 0
    }
  ],
  walls: [
    {
      id: "cal-wall-front",
      name: "正面白壁",
      start: vec2(-halfW, -halfD),
      end: vec2(halfW, -halfD),
      thicknessM: 0.12,
      heightM,
      materialId: "cal-wall-warm-white"
    },
    {
      id: "cal-wall-right",
      name: "右白壁",
      start: vec2(halfW, -halfD),
      end: vec2(halfW, halfD),
      thicknessM: 0.12,
      heightM,
      materialId: "cal-wall-warm-white"
    },
    {
      id: "cal-wall-back",
      name: "背面白壁",
      start: vec2(halfW, halfD),
      end: vec2(-halfW, halfD),
      thicknessM: 0.12,
      heightM,
      materialId: "cal-wall-warm-white"
    },
    {
      id: "cal-wall-left",
      name: "左白壁",
      start: vec2(-halfW, halfD),
      end: vec2(-halfW, -halfD),
      thicknessM: 0.12,
      heightM,
      materialId: "cal-wall-warm-white"
    }
  ],
  windows: [],
  voids: [],
  furniture: [
    {
      id: "cal-table",
      name: "小さな丸テーブル",
      type: "roundTable",
      position: vec3(0, 0.36, 0.25),
      size: vec3(0.95, 0.72, 0.95),
      rotationYDeg: 0,
      materialId: "cal-light-wood",
      color: "#b88450",
      roughness: 0.66,
      metalness: 0,
      castsShadow: true
    },
    {
      id: "cal-chair-left",
      name: "椅子 左",
      type: "chair",
      position: vec3(-0.85, 0.44, 0.25),
      size: vec3(0.46, 0.88, 0.46),
      rotationYDeg: 90,
      materialId: "cal-chair-gray",
      castsShadow: true
    },
    {
      id: "cal-chair-right",
      name: "椅子 右",
      type: "chair",
      position: vec3(0.85, 0.44, 0.25),
      size: vec3(0.46, 0.88, 0.46),
      rotationYDeg: -90,
      materialId: "cal-chair-gray",
      castsShadow: true
    },
    {
      id: "cal-cabinet",
      name: "低いキャビネット",
      type: "cupboard",
      position: vec3(1.35, 0.32, -1.65),
      size: vec3(1.15, 0.64, 0.38),
      rotationYDeg: 0,
      materialId: "cal-matte-dark",
      castsShadow: true
    }
  ],
  lights: [
    {
      id: "cal-pendant",
      name: "テスト用ペンダント 1000lm",
      type: "pendant",
      position: vec3(0, 1.42, 0.25),
      mountHeightM: heightM,
      rotationDeg: { x: -90, y: 0, z: 0 },
      target: vec3(0, 0.72, 0.25),
      lumens: 1000,
      colorTemperatureK: 2700,
      dimmer: 100,
      enabled: true,
      beamAngleDeg: 95,
      penumbra: 0.72,
      castsShadow: true,
      note: "テーブル上方700mmの校正用ペンダント",
      cordLengthM: 0.72
    },
    {
      id: "cal-wall-spot",
      name: "白壁照射スポット 700lm",
      type: "spotlight",
      position: vec3(-1.35, 2.18, -0.92),
      mountHeightM: heightM,
      rotationDeg: { x: -64, y: -12, z: 0 },
      target: vec3(-1.05, 1.2, -2.23),
      lumens: 700,
      colorTemperatureK: 2700,
      dimmer: 100,
      enabled: true,
      beamAngleDeg: 34,
      penumbra: 0.42,
      castsShadow: true,
      note: "正面白壁のグラデーション確認用"
    }
  ],
  camera: {
    position: vec3(0, 1.34, 1.92),
    target: vec3(0, 1.05, -0.65),
    fov: 56,
    exposure: 1.12,
    resolutionWidth: 1200
  }
};
