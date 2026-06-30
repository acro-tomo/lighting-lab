import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..");
const demoDir = join(rootDir, "public", "demo");

const svgWidth = 1200;
const svgHeight = 900;
const metersPerPixel = 0.01;
const roomWidthM = 8.6;
const roomDepthM = 6.4;
const roomWidthPx = roomWidthM / metersPerPixel;
const roomDepthPx = roomDepthM / metersPerPixel;
const planX = 170;
const planY = 130;
const halfW = roomWidthM / 2;
const halfD = roomDepthM / 2;
const ceilingHeightM = 2.42;

const xml = (value) =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const fmt = (value) => Number.parseFloat(value.toFixed(3));

const worldToImage = ({ x, z }) => ({
  x: fmt(planX + (x + halfW) / metersPerPixel),
  y: fmt(planY + (z + halfD) / metersPerPixel)
});

const rectFromWorld = ({ center, size }) => {
  const topLeft = worldToImage({
    x: center.x - size.x / 2,
    z: center.z - size.z / 2
  });
  return {
    x: topLeft.x,
    y: topLeft.y,
    width: fmt(size.x / metersPerPixel),
    height: fmt(size.z / metersPerPixel)
  };
};

const svgRect = ({ x, y, width, height, className, fill, stroke, strokeWidth = 2 }) =>
  `<rect x="${x}" y="${y}" width="${width}" height="${height}"${className ? ` class="${className}"` : ""}${fill ? ` fill="${fill}"` : ""}${stroke ? ` stroke="${stroke}"` : ""} stroke-width="${strokeWidth}" />`;

const svgText = ({ x, y, text, className = "label", anchor = "middle" }) =>
  `<text x="${x}" y="${y}" class="${className}" text-anchor="${anchor}">${xml(text)}</text>`;

const svgLine = ({ x1, y1, x2, y2, className = "dim" }) =>
  `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="${className}" />`;

const dimHorizontal = ({ x1, x2, y, label }) => `
  ${svgLine({ x1, y1: y, x2, y2: y })}
  ${svgLine({ x1, y1: y - 12, x2: x1, y2: y + 12, className: "ext" })}
  ${svgLine({ x1: x2, y1: y - 12, x2, y2: y + 12, className: "ext" })}
  ${svgText({ x: (x1 + x2) / 2, y: y - 14, text: label, className: "dim-label" })}
`;

const dimVertical = ({ x, y1, y2, label }) => `
  ${svgLine({ x1: x, y1, x2: x, y2 })}
  ${svgLine({ x1: x - 12, y1, x2: x + 12, y2: y1, className: "ext" })}
  ${svgLine({ x1: x - 12, y1: y2, x2: x + 12, y2, className: "ext" })}
  <text transform="translate(${x + 28} ${(y1 + y2) / 2}) rotate(90)" class="dim-label">${xml(label)}</text>
`;

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}">
  <defs>
    <marker id="arrow" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto-start-reverse">
      <path d="M0,0 L8,4 L0,8 Z" fill="#2f3b40" />
    </marker>
    <style>
      .sheet { fill: #fbfaf6; }
      .room-fill { fill: #f8f4ea; }
      .wall { fill: none; stroke: #22272a; stroke-width: 18; stroke-linejoin: round; }
      .partition { fill: none; stroke: #4b555a; stroke-width: 10; stroke-linecap: square; }
      .thin { fill: none; stroke: #6d767b; stroke-width: 3; }
      .furniture { fill: #d8c3a2; stroke: #7a6650; stroke-width: 2; }
      .fixture { fill: #f4d06f; stroke: #856d23; stroke-width: 2; }
      .window { fill: none; stroke: #4a9bc1; stroke-width: 8; stroke-linecap: round; }
      .void { fill: #ecf3f5; stroke: #5f808b; stroke-width: 3; stroke-dasharray: 10 8; }
      .dim { stroke: #2f3b40; stroke-width: 2; marker-start: url(#arrow); marker-end: url(#arrow); }
      .dim-label { fill: #273036; font: 600 22px system-ui, sans-serif; }
      .ext { stroke: #2f3b40; stroke-width: 2; }
      .label { fill: #232b30; font: 600 22px system-ui, sans-serif; }
      .note { fill: #596267; font: 16px system-ui, sans-serif; }
      .small { fill: #273036; font: 16px system-ui, sans-serif; }
    </style>
  </defs>
  ${svgRect({ x: 0, y: 0, width: svgWidth, height: svgHeight, className: "sheet" })}
  ${svgText({ x: 70, y: 48, text: "Original dimensioned demo plan / LDK Lighting Lab", className: "note", anchor: "start" })}
  ${svgText({ x: 70, y: 74, text: "架空の拡散用サンプル。実在住宅の図面ではありません。", className: "note", anchor: "start" })}

  ${svgRect({ x: planX, y: planY, width: roomWidthPx, height: roomDepthPx, className: "room-fill" })}
  ${svgRect({ x: planX, y: planY, width: roomWidthPx, height: roomDepthPx, className: "wall" })}

  ${svgLine({ x1: planX + 135, y1: planY, x2: planX + 135, y2: planY + 255, className: "partition" })}
  ${svgLine({ x1: planX, y1: planY + 255, x2: planX + 305, y2: planY + 255, className: "partition" })}
  ${svgLine({ x1: planX + 640, y1: planY + 360, x2: planX + roomWidthPx, y2: planY + 360, className: "partition" })}

  ${svgLine({ x1: planX + 265, y1: planY + roomDepthPx, x2: planX + 585, y2: planY + roomDepthPx, className: "window" })}
  ${svgText({ x: planX + 425, y: planY + roomDepthPx + 38, text: "掃き出し窓 W3,200", className: "small" })}

  ${svgRect({ ...rectFromWorld({ center: { x: -3, z: -0.55 }, size: { x: 2.9, z: 0.98 } }), className: "furniture" })}
  ${svgText({ ...worldToImage({ x: -3, z: -0.55 }), y: worldToImage({ x: -3, z: -0.55 }).y + 7, text: "キッチン", className: "small" })}
  ${svgRect({ ...rectFromWorld({ center: { x: -4.0, z: -1.8 }, size: { x: 0.42, z: 2.2 } }), className: "furniture" })}
  ${svgText({ x: planX + 62, y: planY + 105, text: "収納", className: "small" })}
  ${svgRect({ ...rectFromWorld({ center: { x: -1.35, z: 0.95 }, size: { x: 1.2, z: 1.2 } }), className: "thin" })}
  <circle cx="${worldToImage({ x: -1.35, z: 0.95 }).x}" cy="${worldToImage({ x: -1.35, z: 0.95 }).y}" r="60" class="furniture" />
  ${svgText({ ...worldToImage({ x: -1.35, z: 0.95 }), y: worldToImage({ x: -1.35, z: 0.95 }).y + 7, text: "ダイニング", className: "small" })}
  ${svgRect({ ...rectFromWorld({ center: { x: 1.2, z: 1.22 }, size: { x: 2.35, z: 0.92 } }), className: "furniture" })}
  ${svgText({ ...worldToImage({ x: 1.2, z: 1.22 }), y: worldToImage({ x: 1.2, z: 1.22 }).y + 7, text: "ソファ", className: "small" })}
  ${svgRect({ ...rectFromWorld({ center: { x: 1.1, z: -3.12 }, size: { x: 1.45, z: 0.06 } }), className: "furniture" })}
  ${svgText({ x: worldToImage({ x: 1.1, z: -2.85 }).x, y: worldToImage({ x: 1.1, z: -2.85 }).y, text: "TV壁", className: "small" })}
  ${svgRect({ ...rectFromWorld({ center: { x: 3.0, z: 1.55 }, size: { x: 2.2, z: 2.8 } }), className: "void" })}
  ${svgText({ ...worldToImage({ x: 3.0, z: 1.55 }), y: worldToImage({ x: 3.0, z: 1.55 }).y + 7, text: "階段・吹抜", className: "small" })}

  ${[
    { x: 0.1, z: -2.92 },
    { x: 1.1, z: -2.92 },
    { x: 2.1, z: -2.92 },
    { x: -3.9, z: -1.18 },
    { x: -3.0, z: -1.18 },
    { x: -2.1, z: -1.18 }
  ]
    .map((point) => {
      const p = worldToImage(point);
      return `<circle cx="${p.x}" cy="${p.y}" r="14" class="fixture" />`;
    })
    .join("\n  ")}
  <circle cx="${worldToImage({ x: -1.35, z: 0.95 }).x}" cy="${worldToImage({ x: -1.35, z: 0.95 }).y}" r="19" class="fixture" />

  ${svgText({ x: planX + 430, y: planY + 48, text: "LDK 8,600 × 6,400", className: "label" })}
  ${svgText({ x: planX + 180, y: planY + 350, text: "食事", className: "label" })}
  ${svgText({ x: planX + 575, y: planY + 235, text: "くつろぎ", className: "label" })}

  ${dimHorizontal({ x1: planX, x2: planX + roomWidthPx, y: planY - 58, label: "8,600" })}
  ${dimVertical({ x: planX + roomWidthPx + 58, y1: planY, y2: planY + roomDepthPx, label: "6,400" })}
  ${dimHorizontal({ x1: planX, x2: planX + 305, y: planY + 292, label: "3,050" })}
  ${dimVertical({ x: planX + 622, y1: planY + 360, y2: planY + roomDepthPx, label: "2,800" })}
</svg>`;

const cleanSvg = svg.replace(/^[ \t]+$/gm, "");

const material = (id, name, baseColor, roughness, metalness = 0, emissiveColor = "#000000", emissiveIntensity = 0) => ({
  id,
  name,
  baseColor,
  roughness,
  metalness,
  emissiveColor,
  emissiveIntensity
});

const vec2 = (x, z) => ({ x, z });
const vec3 = (x, y, z) => ({ x, y, z });

const project = {
  id: "share-demo-dimensioned-ldk",
  name: "拡散用デモ - 寸法入り架空LDK",
  room: {
    widthM: roomWidthM,
    depthM: roomDepthM,
    ceilingHeightM
  },
  materials: [
    material("wall-white", "白系マットクロス", "#d9d5cc", 0.92),
    material("wall-gray", "ライトグレーマットクロス", "#9b9c97", 0.9),
    material("accent-dark", "ダークアクセントクロス", "#4a443c", 0.82),
    material("floor-oak", "木目床", "#a98156", 0.58),
    material("kitchen-black", "マットブラックキッチン", "#151514", 0.72, 0.08),
    material("tv-screen", "TV画面", "#050505", 0.22, 0, "#0a1020", 0.15),
    material("fabric-warm-gray", "ウォームグレー布", "#6f6b62", 0.95),
    material("rug-muted", "低彩度ラグ", "#514d45", 0.98)
  ],
  walls: [
    {
      id: "wall-north-tv",
      name: "TV背面壁",
      start: vec2(-halfW, -halfD),
      end: vec2(halfW, -halfD),
      thicknessM: 0.14,
      heightM: ceilingHeightM,
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
      heightM: ceilingHeightM,
      materialId: "wall-white"
    },
    {
      id: "wall-west-kitchen",
      name: "キッチン背面壁",
      start: vec2(-halfW, halfD),
      end: vec2(-halfW, -halfD),
      thicknessM: 0.14,
      heightM: ceilingHeightM,
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
      hasGlass: true,
      style: "window"
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
    ...[
      { id: "light-tv-wall-1", x: 0.1, z: -2.92, dimmer: 28, kelvin: 2700 },
      { id: "light-tv-wall-2", x: 1.1, z: -2.92, dimmer: 28, kelvin: 2700 },
      { id: "light-tv-wall-3", x: 2.1, z: -2.92, dimmer: 28, kelvin: 2700 },
      { id: "light-kitchen-1", x: -3.9, z: -1.18, dimmer: 82, kelvin: 3500 },
      { id: "light-kitchen-2", x: -3.0, z: -1.18, dimmer: 82, kelvin: 3500 },
      { id: "light-kitchen-3", x: -2.1, z: -1.18, dimmer: 82, kelvin: 3500 }
    ].map((light, index) => ({
      id: light.id,
      name: index < 3 ? `リビングダウンライト ${index + 1}` : `キッチンダウンライト ${index - 2}`,
      type: "downlight",
      model: "dl-medium",
      position: vec3(light.x, 2.38, light.z),
      mountHeightM: ceilingHeightM,
      rotationDeg: { x: -90, y: 0, z: 0 },
      target: vec3(light.x, 0, light.z),
      lumens: index < 3 ? 520 : 760,
      colorTemperatureK: light.kelvin,
      dimmer: light.dimmer,
      enabled: true,
      beamAngleDeg: 60,
      penumbra: 0.5,
      castsShadow: true,
      note: "標準ダウンライト（真下配光）"
    })),
    {
      id: "light-dining-pendant",
      name: "ダイニングペンダント",
      type: "pendant",
      model: "pendant",
      position: vec3(-1.35, 1.62, 0.95),
      mountHeightM: ceilingHeightM,
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
      dimmer: 35,
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
      dimmer: 70,
      enabled: true,
      beamAngleDeg: 160,
      penumbra: 0.9,
      castsShadow: false,
      note: "くつろぎ時の壁面グロー",
      lengthM: 1.65
    }
  ],
  camera: {
    position: vec3(1.8, 2.35, 3.05),
    target: vec3(-0.35, 0.72, -0.35),
    fov: 64,
    exposure: 1.22,
    resolutionWidth: 1600
  },
  backgroundPlan: {
    dataUrl: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(cleanSvg)}`,
    fileName: "dimensioned-ldk-demo-plan.svg",
    kind: "image",
    scale: {
      pixels: roomWidthPx,
      millimeters: roomWidthM * 1000
    },
    placement: {
      originXM: -halfW - planX * metersPerPixel,
      originZM: -halfD - planY * metersPerPixel,
      metersPerPixel
    }
  },
  daylight: {
    enabled: false,
    month: 10,
    day: 15,
    hour: 20,
    northOffsetDeg: 0,
    latitudeDeg: 35
  },
  activeFloor: 1,
  showCeiling: true
};

mkdirSync(demoDir, { recursive: true });
writeFileSync(join(demoDir, "dimensioned-ldk-demo-plan.svg"), `${cleanSvg}\n`);
writeFileSync(join(demoDir, "share-demo-project.json"), `${JSON.stringify(project, null, 2)}\n`);
