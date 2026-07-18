import * as THREE from "three";
import type { FurnitureItem, MaterialPreset } from "../../types";
import { addBox } from "./geometry";
import { diagnosticMaterial, makeMaterial } from "./materials";
import type { RenderDebugMode } from "./qualityPresets";

export const addFurniture = (
  scene: THREE.Scene,
  item: FurnitureItem,
  materials: Map<string, MaterialPreset>,
  debugMode: RenderDebugMode
) => {
  const preset = materials.get(item.materialId);
  const material = makeMaterial(preset, item.color ?? preset?.baseColor ?? "#777");
  material.color.set(item.color ?? preset?.baseColor ?? "#777");
  material.roughness = item.roughness ?? preset?.roughness ?? 0.75;
  material.metalness = item.metalness ?? preset?.metalness ?? 0;
  const rotation = (item.rotationYDeg * Math.PI) / 180;
  const addPart = (
    size: [number, number, number],
    offset: [number, number, number],
    partMaterial: THREE.Material = material
  ) => {
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    const mesh = addBox(
      scene,
      size,
      [
        item.position.x + offset[0] * cos + offset[2] * sin,
        item.position.y + offset[1],
        item.position.z - offset[0] * sin + offset[2] * cos
      ],
      partMaterial,
      rotation,
      "furniture",
      debugMode
    );
    mesh.castShadow = item.castsShadow;
    return mesh;
  };
  const makeFinish = (color: string, roughness: number, metalness = 0) => {
    const finish = makeMaterial(undefined, color);
    finish.roughness = roughness;
    finish.metalness = metalness;
    return finish;
  };
  const addMesh = (
    geometry: THREE.BufferGeometry,
    offset: [number, number, number],
    partMaterial: THREE.Material = material,
    rotationX = 0,
    scale?: [number, number, number]
  ) => {
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    const mesh = new THREE.Mesh(geometry, diagnosticMaterial("furniture", debugMode, partMaterial));
    mesh.position.set(
      item.position.x + offset[0] * cos + offset[2] * sin,
      item.position.y + offset[1],
      item.position.z - offset[0] * sin + offset[2] * cos
    );
    mesh.rotation.set(rotationX, rotation, 0, "YXZ");
    if (scale) mesh.scale.set(...scale);
    mesh.castShadow = item.castsShadow;
    mesh.receiveShadow = true;
    scene.add(mesh);
    return mesh;
  };

  if (item.type === "roundTable") {
    const topT = Math.min(0.08, item.size.y * 0.14);
    const legH = item.size.y - topT;
    addMesh(
      new THREE.CylinderGeometry(item.size.x / 2, item.size.x / 2, topT, 72),
      [0, item.size.y / 2 - topT / 2, 0]
    );
    addMesh(
      new THREE.CylinderGeometry(0.055, 0.085, legH, 32),
      [0, -topT / 2, 0],
      makeFinish("#1d1c19", 0.44, 0.6)
    );
    return;
  }

  if (item.type === "sofa") {
    const { x: w, y: h, z: d } = item.size;
    const baseH = h * 0.28;
    const backD = Math.min(0.2, d * 0.22);
    const backH = h * 0.66;
    const armW = Math.min(0.22, Math.max(0.1, w * 0.1));
    const armH = h * 0.58;
    const frontInset = d * 0.06;
    const seatD = d - backD - frontInset;
    const seatZ = (backD - frontInset) / 2;
    const cushionH = h * 0.15;
    const cushionY = -h / 2 + baseH + cushionH / 2 + 0.015;
    const cushionCount = w >= 1.8 ? 3 : w >= 1.15 ? 2 : 1;
    const cushionGap = Math.min(0.025, w * 0.015);
    const innerW = w - armW * 2 - cushionGap * 2;
    const cushionW = (innerW - cushionGap * (cushionCount - 1)) / cushionCount;
    const cushionMaterial = makeMaterial(undefined, "#817b70");
    cushionMaterial.roughness = 0.96;
    cushionMaterial.metalness = 0;
    addPart([w, baseH, d], [0, -h / 2 + baseH / 2, 0]);
    addPart([w - armW * 2, backH, backD], [0, h / 2 - backH / 2, -d / 2 + backD / 2]);
    [-1, 1].forEach((side) => {
      addPart([armW, armH, d - frontInset], [side * (w / 2 - armW / 2), -h / 2 + armH / 2, seatZ]);
    });
    Array.from({ length: cushionCount }).forEach((_, index) => {
      addPart(
        [cushionW, cushionH, seatD],
        [-innerW / 2 + cushionW / 2 + index * (cushionW + cushionGap), cushionY, seatZ],
        cushionMaterial
      );
    });
    return;
  }

  if (item.type === "chair") {
    const { x: w, y: h, z: d } = item.size;
    const seatT = Math.min(0.1, h * 0.12);
    const seatY = -h / 2 + h * 0.47;
    const legH = h * 0.42;
    const legW = Math.min(0.05, w * 0.12, d * 0.12);
    const legY = -h / 2 + legH / 2;
    const legX = w / 2 - legW / 2 - w * 0.06;
    const legZ = d / 2 - legW / 2 - d * 0.06;
    const backD = Math.min(0.08, d * 0.16);
    const backH = h / 2 - seatY;
    addPart([w, seatT, d], [0, seatY, 0]);
    addPart([w, backH, backD], [0, (h / 2 + seatY) / 2, -d / 2 + backD / 2]);
    [
      [legX, legZ],
      [-legX, legZ],
      [legX, -legZ],
      [-legX, -legZ]
    ].forEach(([x, z]) => addPart([legW, legH, legW], [x, legY, z]));
    return;
  }

  if (item.type === "rectTable") {
    const { x: w, y: h, z: d } = item.size;
    const topT = Math.min(0.08, h * 0.14);
    const legH = h - topT;
    const legW = Math.min(0.07, w * 0.08, d * 0.12);
    const legX = w / 2 - legW / 2 - w * 0.04;
    const legZ = d / 2 - legW / 2 - d * 0.06;
    const legMaterial = makeMaterial(undefined, "#3a342b");
    legMaterial.roughness = 0.6;
    legMaterial.metalness = item.metalness ?? materials.get(item.materialId)?.metalness ?? 0;
    addPart([w, topT, d], [0, h / 2 - topT / 2, 0]);
    [
      [legX, legZ],
      [-legX, legZ],
      [legX, -legZ],
      [-legX, -legZ]
    ].forEach(([x, z]) => addPart([legW, legH, legW], [x, -topT / 2, z], legMaterial));
    return;
  }

  if (item.type === "cupboard") {
    const { x: w, y: h, z: d } = item.size;
    const doorGap = Math.min(0.014, w * 0.02);
    const doorD = Math.min(0.035, d * 0.08);
    const doorW = (w - doorGap * 3) / 2;
    const handleH = Math.min(0.32, h * 0.2);
    const handleMaterial = makeMaterial(undefined, "#6e6b65");
    handleMaterial.roughness = 0.36;
    handleMaterial.metalness = 0.55;
    addPart([w, h, d - doorD], [0, 0, -doorD / 2]);
    [-1, 1].forEach((side) => {
      addPart([doorW, h - doorGap * 2, doorD], [side * (doorW / 2 + doorGap / 2), 0, d / 2 - doorD / 2]);
      addPart([0.018, handleH, 0.025], [side * (doorGap / 2 + 0.028), 0, d / 2 + 0.012], handleMaterial);
    });
    return;
  }

  if (item.type === "counter") {
    const { x: w, y: h, z: d } = item.size;
    const topT = Math.min(0.07, h * 0.1);
    const supportT = Math.min(0.08, w * 0.06);
    const supportH = h - topT;
    const backT = Math.min(0.05, d * 0.14);
    const panelH = supportH * 0.65;
    addPart([w, topT, d], [0, h / 2 - topT / 2, 0]);
    [-1, 1].forEach((side) => {
      addPart([supportT, supportH, d], [side * (w / 2 - supportT / 2), -topT / 2, 0]);
    });
    addPart([w - supportT * 2, panelH, backT], [0, -h / 2 + panelH / 2, -d / 2 + backT / 2]);
    return;
  }

  if (item.type === "stair") {
    const steps = Math.max(3, Math.min(24, Math.round(item.size.y / 0.18)));
    const tread = item.size.z / steps;
    const riser = item.size.y / steps;
    for (let index = 0; index < steps; index += 1) {
      addPart(
        [item.size.x, 0.052, tread * 0.82],
        [0, (index + 1) * riser - 0.026, -item.size.z / 2 + index * tread + tread / 2]
      );
    }
    const stringerLength = Math.hypot(item.size.y, item.size.z);
    const stringerAngle = Math.atan2(item.size.z, item.size.y);
    const stringerMaterial = makeFinish("#1c1c1a", 0.5, 0.6);
    [-1, 1].forEach((side) => {
      addMesh(
        new THREE.BoxGeometry(0.06, stringerLength, 0.16),
        [side * (item.size.x / 2 - 0.04), item.size.y / 2, 0],
        stringerMaterial,
        stringerAngle
      );
    });
    return;
  }

  if (item.type === "kitchen") {
    const { x: w, y: h, z: d } = item.size;
    const counterY = h / 2 + 0.035;
    const sinkW = Math.min(w * 0.34, 0.62);
    const sinkD = d * 0.52;
    const cooktopW = Math.min(w * 0.34, 0.62);
    const cooktopD = d * 0.56;
    const burnerRadius = Math.min(cooktopW, cooktopD) * 0.13;
    addPart([w, h, d], [0, 0, 0]);
    addPart([w + 0.08, 0.07, d + 0.08], [0, counterY, 0], makeFinish("#b8b4aa", 0.38));
    addPart([sinkW, 0.018, sinkD], [-w * 0.25, counterY + 0.041, 0], makeFinish("#6f7679", 0.24, 0.72));
    addPart([cooktopW, 0.022, cooktopD], [w * 0.25, counterY + 0.043, 0], makeFinish("#090a0a", 0.16, 0.18));
    [-1, 1].forEach((xSide) => {
      [-1, 1].forEach((zSide) => {
        addMesh(
          new THREE.CylinderGeometry(burnerRadius, burnerRadius, 0.012, 28),
          [w * 0.25 + xSide * cooktopW * 0.24, counterY + 0.057, zSide * cooktopD * 0.24],
          makeFinish("#242626", 0.5, 0.5)
        );
      });
    });
    [-0.34, 0, 0.34].forEach((xRatio) => {
      addPart([w * 0.27, h * 0.72, 0.018], [xRatio * w, 0.02, d / 2 + 0.012], makeFinish("#0c0c0b", 0.78));
    });
    return;
  }

  if (item.type === "bed") {
    const { x: w, y: h, z: d } = item.size;
    addPart([w, h * 0.44, d], [0, -h / 2 + h * 0.22, 0], makeFinish("#6b5b45", 0.7));
    addPart([w * 0.96, h * 0.36, d * 0.92], [0, -h / 2 + h * 0.62, d * 0.04]);
    addPart([w * 0.82, h * 0.16, d * 0.16], [0, -h / 2 + h * 0.86, -d / 2 + d * 0.13], makeFinish("#f0ece2", 0.88));
    addPart([w, h, 0.08], [0, 0, -d / 2 + 0.04], makeFinish("#5c4d3a", 0.72));
    return;
  }

  if (item.type === "tv") {
    const screenMaterial = makeFinish("#030303", 0.18, 0.02);
    screenMaterial.emissive.set("#050914");
    screenMaterial.emissiveIntensity = 0.22;
    addPart([item.size.x, item.size.y, item.size.z], [0, 0, 0], screenMaterial);
    return;
  }

  if (item.type === "fridge") {
    const { x: w, y: h, z: d } = item.size;
    addPart([w, h, d], [0, 0, 0]);
    addPart([w * 0.98, 0.014, 0.012], [0, h * 0.08, d / 2 + 0.002], makeFinish("#9a9a9c", 0.5, 0.3));
    [h * 0.3, -h * 0.16].forEach((y) => {
      addPart([0.03, h * 0.22, 0.03], [-w / 2 + 0.07, y, d / 2 + 0.022], makeFinish("#b8b8ba", 0.3, 0.55));
    });
    return;
  }

  if (item.type === "shelf") {
    const { x: w, y: h, z: d } = item.size;
    const bays = Math.max(2, Math.round(h / 0.4));
    [-1, 1].forEach((side) => addPart([0.04, h, d], [side * (w / 2 - 0.02), 0, 0]));
    addPart([w, h, 0.03], [0, 0, -d / 2 + 0.015]);
    Array.from({ length: bays + 1 }).forEach((_, index) => {
      addPart([w - 0.04, 0.03, d - 0.02], [0, -h / 2 + (h / bays) * index, 0]);
    });
    return;
  }

  if (item.type === "rug") {
    addPart([item.size.x, item.size.y, item.size.z], [0, 0, 0]);
    return;
  }

  if (item.type === "washer") {
    const { x: w, y: h, z: d } = item.size;
    addPart([w, h, d], [0, 0, 0], makeFinish("#f0f0ee", 0.45, item.metalness ?? 0));
    const doorRadius = Math.min(w, h) * 0.32;
    addMesh(
      new THREE.CylinderGeometry(doorRadius, doorRadius, 0.02, 32),
      [0, -h * 0.05, d / 2 + 0.004],
      makeFinish("#2a2c30", 0.3, 0.4),
      Math.PI / 2
    );
    return;
  }

  if (item.type === "washstand") {
    const { x: w, y: h, z: d } = item.size;
    const cabinetH = Math.min(h * 0.48, 0.86);
    const counterY = -h / 2 + cabinetH;
    const bowlRadius = Math.min(w, d) * 0.28;
    const mirrorBottom = counterY + 0.14;
    const mirrorH = Math.max(0.12, h / 2 - mirrorBottom - 0.06);
    addPart([w, cabinetH, d], [0, -h / 2 + cabinetH / 2, 0], makeFinish("#e9e7e1", 0.5));
    addPart([w + 0.03, 0.04, d + 0.03], [0, counterY + 0.02, 0], makeFinish("#f4f3ef", 0.3));
    addMesh(
      new THREE.SphereGeometry(bowlRadius, 28, 14),
      [0, counterY + 0.052, 0],
      makeFinish("#f7f7f4", 0.22),
      0,
      [1.45, 0.45, 1]
    );
    addPart([w * 0.86, mirrorH, 0.02], [0, mirrorBottom + mirrorH / 2, -d / 2 + 0.02], makeFinish("#aab4bc", 0.08, 0.55));
    return;
  }

  if (item.type === "toilet") {
    const { x: w, y: h, z: d } = item.size;
    const bowlH = h * 0.46;
    const bowlY = -h / 2 + bowlH / 2;
    const seatY = -h / 2 + bowlH + 0.018;
    const tankH = h * 0.64;
    addMesh(
      new THREE.SphereGeometry(0.5, 32, 18),
      [0, bowlY, d * 0.12],
      makeFinish("#f3f3f1", 0.25),
      0,
      [w * 0.72, bowlH, d * 0.72]
    );
    addMesh(
      new THREE.TorusGeometry(0.5, 0.1, 12, 32),
      [0, seatY, d * 0.12],
      makeFinish("#fafafa", 0.3),
      Math.PI / 2,
      [w * 0.62, d * 0.62, 0.05]
    );
    addPart([w * 0.82, tankH, d * 0.3], [0, h / 2 - tankH / 2, -d / 2 + d * 0.16], makeFinish("#f3f3f1", 0.25));
    return;
  }

  if (item.type === "bathtub") {
    const { x: w, y: h, z: d } = item.size;
    const rim = Math.min(w, d) * 0.12;
    const tubMaterial = makeFinish("#eef0f0", 0.3);
    [-1, 1].forEach((side) => addPart([w, h, rim], [0, 0, side * (d / 2 - rim / 2)], tubMaterial));
    [-1, 1].forEach((side) => addPart([rim, h, d - rim * 2], [side * (w / 2 - rim / 2), 0, 0], tubMaterial));
    addPart([w - rim * 2, 0.08, d - rim * 2], [0, -h / 2 + 0.04, 0], tubMaterial);
    addPart([w - rim * 2, 0.025, d - rim * 2], [0, h * 0.12, 0], makeFinish("#cfe0e6", 0.12, 0.1));
    return;
  }

  if (item.type === "desk") {
    const { x: w, y: h, z: d } = item.size;
    const topT = Math.min(0.04, h * 0.1);
    const legW = Math.min(0.05, w * 0.08, d * 0.1);
    const legH = h - topT;
    const legMaterial = makeFinish("#3a342b", 0.6, item.metalness ?? 0);
    addPart([w, topT, d], [0, h / 2 - topT / 2, 0]);
    const offX = w / 2 - legW / 2 - Math.min(0.02, w * 0.03);
    const offZ = d / 2 - legW / 2 - Math.min(0.02, d * 0.03);
    [[offX, offZ], [-offX, offZ], [offX, -offZ], [-offX, -offZ]].forEach(([x, z]) => {
      addPart([legW, legH, legW], [x, -topT / 2, z], legMaterial);
    });
    return;
  }

  if (item.type === "shoeCabinet") {
    const { x: w, y: h, z: d } = item.size;
    addPart([w, h, d], [0, 0, 0]);
    addPart([0.012, h * 0.96, 0.012], [0, 0, d / 2 + 0.002], makeFinish("#9a9a96", 0.5));
    return;
  }

  if (item.type === "box") {
    addPart([item.size.x, item.size.y, item.size.z], [0, 0, 0]);
  }
};
