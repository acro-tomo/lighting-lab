/**
 * SceneModel → three.js シーングラフ生成。
 *
 * 座標: 平面 (x, y)[m] → ワールド (x, 高さ, -y)。Y-up。
 *
 * 遮蔽の一元化:
 * - 建築（床・壁・天井）メッシュは表示・シャドウ・測光レイキャストの全てで共通。
 * - 家具は「表示用メッシュ」と「遮蔽判定用の簡略メッシュ（直方体）」を分離。
 *   シャドウと測光レイキャストは常に遮蔽用メッシュ側が担い、表示メッシュを
 *   将来差し替えても両系の遮蔽は変化しない。
 */
import * as THREE from 'three/webgpu';
import { srgbTripletToLinear } from '../core/color';
import {
  boundingBox,
  ceilingHeightAt,
  ensureCcw,
  wallSegments,
} from '../core/room';
import type { FloorPlan, Furniture, MaterialParams, SceneModel, Vec2 } from '../core/types';
import { addScreenReflector, SCREEN_ROUGHNESS_MAX } from './screenReflector';

export interface BuiltArchitecture {
  group: THREE.Group;
  /** 測光レイキャスト＆シャドウの遮蔽対象（建築） */
  occluders: THREE.Object3D[];
  floorMesh: THREE.Mesh;
}

export interface BuiltFurniture {
  group: THREE.Group;
  /** 家具の遮蔽判定用メッシュ（表示用とは別個体） */
  occluders: THREE.Mesh[];
  /** 選択・ドラッグ用の表示メッシュ（furniture.id を name に持つ） */
  displayMeshes: THREE.Mesh[];
}

export function toMaterial(params: MaterialParams): THREE.MeshPhysicalMaterial {
  const [r, g, b] = params.baseColor;
  const material = new THREE.MeshPhysicalMaterial({
    roughness: params.roughness,
    metalness: params.metallic,
    side: params.doubleSided ? THREE.DoubleSide : THREE.FrontSide,
  });
  // sRGB 入力 → 内部 linear（setRGB の SRGBColorSpace 指定が変換する）
  material.color.setRGB(r, g, b, THREE.SRGBColorSpace);
  if (params.emissiveIntensity) {
    material.emissive.setRGB(r, g, b, THREE.SRGBColorSpace);
    material.emissiveIntensity = params.emissiveIntensity;
  }
  if (params.opacity !== undefined && params.opacity < 1) {
    material.transparent = true;
    material.opacity = params.opacity;
  }
  if (params.transmission) material.transmission = params.transmission;
  return material;
}

function shapeFromPolygon(polygon: readonly Vec2[]): THREE.Shape {
  const shape = new THREE.Shape();
  polygon.forEach((p, i) => (i === 0 ? shape.moveTo(p.x, p.y) : shape.lineTo(p.x, p.y)));
  shape.closePath();
  return shape;
}

/** ShapeGeometry を水平面（法線 +Y、平面 y → ワールド -z）へ変換 */
function horizontalGeometry(shape: THREE.Shape, height: number): THREE.BufferGeometry {
  const geometry = new THREE.ShapeGeometry(shape);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, height, 0);
  return geometry;
}

function wallQuad(a: Vec2, b: Vec2, y0: number, y1: number): THREE.BufferGeometry {
  const wa = new THREE.Vector3(a.x, 0, -a.y);
  const wb = new THREE.Vector3(b.x, 0, -b.y);
  const positions = new Float32Array([
    wa.x, y0, wa.z,
    wb.x, y0, wb.z,
    wb.x, y1, wb.z,
    wa.x, y1, wa.z,
  ]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  // CCW外周（平面座標）の内側を向く順序
  geometry.setIndex([0, 2, 1, 0, 3, 2]);
  geometry.computeVertexNormals();
  return geometry;
}

function distancePointToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const lenSq = abx * abx + aby * aby;
  if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / lenSq));
  return Math.hypot(p.x - (a.x + t * abx), p.y - (a.y + t * aby));
}

function edgeOnOutline(a: Vec2, b: Vec2, outline: readonly Vec2[]): boolean {
  const eps = 1e-3;
  for (let i = 0; i < outline.length; i++) {
    const oa = outline[i]!;
    const ob = outline[(i + 1) % outline.length]!;
    if (distancePointToSegment(a, oa, ob) < eps && distancePointToSegment(b, oa, ob) < eps) {
      return true;
    }
  }
  return false;
}

export function buildArchitecture(model: SceneModel): BuiltArchitecture {
  const plan = model.floorPlan;
  const outline = ensureCcw(plan.outline);
  const group = new THREE.Group();
  group.name = 'architecture';
  const occluders: THREE.Object3D[] = [];

  const floorMaterial = toMaterial(model.surfaces.floor);
  const wallMaterial = toMaterial(model.surfaces.wall);
  const ceilingMaterial = toMaterial({ ...model.surfaces.ceiling, doubleSided: true });

  // 床
  const floorMesh = new THREE.Mesh(horizontalGeometry(shapeFromPolygon(outline), 0), floorMaterial);
  floorMesh.name = 'floor';
  floorMesh.receiveShadow = true;
  floorMesh.castShadow = true;
  group.add(floorMesh);
  occluders.push(floorMesh);

  // 基準天井（吹抜け領域は穴として抜く）
  const baseShape = shapeFromPolygon(outline);
  for (const override of plan.ceilingOverrides) {
    baseShape.holes.push(new THREE.Path(override.polygon.map((p) => new THREE.Vector2(p.x, p.y))));
  }
  const baseCeiling = new THREE.Mesh(horizontalGeometry(baseShape, plan.ceilingHeight), ceilingMaterial);
  baseCeiling.name = 'ceiling';
  baseCeiling.receiveShadow = true;
  baseCeiling.castShadow = true;
  group.add(baseCeiling);
  occluders.push(baseCeiling);

  // 吹抜け上部の天井＋立ち上がり壁
  for (const override of plan.ceilingOverrides) {
    const upper = new THREE.Mesh(
      horizontalGeometry(shapeFromPolygon(override.polygon), override.height),
      ceilingMaterial,
    );
    upper.name = 'ceiling-override';
    upper.receiveShadow = true;
    upper.castShadow = true;
    group.add(upper);
    occluders.push(upper);

    const poly = ensureCcw(override.polygon);
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i]!;
      const b = poly[(i + 1) % poly.length]!;
      if (edgeOnOutline(a, b, outline)) continue; // 外周壁が既にカバー
      const rim = new THREE.Mesh(
        wallQuad(a, b, plan.ceilingHeight, override.height),
        new THREE.MeshPhysicalMaterial().copy(wallMaterial),
      );
      rim.material.side = THREE.DoubleSide;
      rim.name = 'void-rim-wall';
      rim.receiveShadow = true;
      rim.castShadow = true;
      group.add(rim);
      occluders.push(rim);
    }
  }

  // 外周壁
  for (const segment of wallSegments(plan)) {
    const wall = new THREE.Mesh(wallQuad(segment.a, segment.b, 0, segment.height), wallMaterial);
    wall.name = 'wall';
    wall.receiveShadow = true;
    wall.castShadow = true;
    group.add(wall);
    occluders.push(wall);
  }

  return { group, occluders, floorMesh };
}

function furnitureBoxGeometry(item: Furniture): THREE.BoxGeometry {
  return new THREE.BoxGeometry(item.size.w, item.size.h, item.size.d);
}

function placeFurnitureMesh(mesh: THREE.Mesh, item: Furniture): void {
  mesh.position.set(item.position.x, item.elevation + item.size.h / 2, -item.position.y);
  mesh.rotation.y = (item.rotationDeg * Math.PI) / 180;
}

export function buildFurniture(items: readonly Furniture[]): BuiltFurniture {
  const group = new THREE.Group();
  group.name = 'furniture';
  const occluders: THREE.Mesh[] = [];
  const displayMeshes: THREE.Mesh[] = [];

  for (const item of items) {
    // 表示用メッシュ（将来詳細モデルへ差し替え可。シャドウは落とさない）
    const display = new THREE.Mesh(furnitureBoxGeometry(item), toMaterial(item.material));
    display.name = `furniture:${item.id}`;
    display.receiveShadow = true;
    display.castShadow = false;
    placeFurnitureMesh(display, item);
    // 平滑面（TV画面等）は正面に平面反射スクリーンを付与（表示のみ）
    if (item.material.roughness <= SCREEN_ROUGHNESS_MAX) {
      addScreenReflector(display, item);
    }
    group.add(display);
    displayMeshes.push(display);

    // 遮蔽判定用メッシュ: 描画には一切寄与しないが、シャドウと測光レイキャストを担う
    const occluderMaterial = new THREE.MeshBasicMaterial();
    occluderMaterial.colorWrite = false;
    occluderMaterial.depthWrite = false;
    const occluder = new THREE.Mesh(furnitureBoxGeometry(item), occluderMaterial);
    occluder.name = `furniture-occluder:${item.id}`;
    occluder.castShadow = true;
    placeFurnitureMesh(occluder, item);
    group.add(occluder);
    occluders.push(occluder);
  }

  return { group, occluders, displayMeshes };
}

/** カメラ初期配置用のシーン外接情報 */
export function planBounds(plan: FloorPlan): { center: THREE.Vector3; radius: number } {
  const { min, max } = boundingBox(plan.outline);
  const cx = (min.x + max.x) / 2;
  const cy = (min.y + max.y) / 2;
  let maxHeight = plan.ceilingHeight;
  for (const o of plan.ceilingOverrides) maxHeight = Math.max(maxHeight, o.height);
  const radius = Math.hypot(max.x - min.x, max.y - min.y, maxHeight) / 2;
  return { center: new THREE.Vector3(cx, maxHeight / 2, -cy), radius };
}

export { ceilingHeightAt };
