import { useEffect, useMemo } from "react";
import * as THREE from "three";
import type { RenderDebugMode } from "../../rendering/pathTracer";
import type { MaterialPreset, VoidArea, WallSegment, WindowOpening } from "../../types";
import { debugColorForRole } from "./materials";
import { WallMesh, WindowMesh } from "./wallMeshes";

// 吹き抜け(void)を介して1階と上方に繋がる「2階の床領域」を、グリッド・フラッドフィルで抽出する。
// 2階壁を越えない（間仕切りも含む）連続領域だけを塗り、それを2階床/壁/天井の生成に使う。
// 1階表示中に「吹き抜けホールの上に見える2階廊下」を出すための土台。2階壁が無ければ null。
export type UpperVoidRegion = {
  cell: number; // セル一辺[m]
  cols: number;
  rows: number;
  originX: number; // グリッド原点(セル[0,0]の左下隅)の絶対X
  originZ: number;
  filled: Uint8Array; // 連続領域に属するセル=1
  voidMask: Uint8Array; // voidフットプリントに被るセル=1（床から抜く）
};

export const computeUpperVoidRegion = (
  upperWalls: WallSegment[],
  lowerVoids: VoidArea[]
): UpperVoidRegion | null => {
  if (upperWalls.length === 0 || lowerVoids.length === 0) return null;

  // 1. 対象範囲 = 2階壁の bbox（+マージン）。
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  let maxThickness = 0;
  for (const wall of upperWalls) {
    minX = Math.min(minX, wall.start.x, wall.end.x);
    maxX = Math.max(maxX, wall.start.x, wall.end.x);
    minZ = Math.min(minZ, wall.start.z, wall.end.z);
    maxZ = Math.max(maxZ, wall.start.z, wall.end.z);
    maxThickness = Math.max(maxThickness, wall.thicknessM);
  }
  if (!Number.isFinite(minX)) return null;
  const margin = maxThickness / 2 + 0.2;
  minX -= margin;
  maxX += margin;
  minZ -= margin;
  maxZ += margin;

  const cell = 0.1;
  const cols = Math.max(1, Math.min(600, Math.ceil((maxX - minX) / cell)));
  const rows = Math.max(1, Math.min(600, Math.ceil((maxZ - minZ) / cell)));
  const originX = minX;
  const originZ = minZ;
  const idx = (c: number, r: number) => r * cols + c;
  const cellCenter = (c: number, r: number) => ({
    x: originX + (c + 0.5) * cell,
    z: originZ + (r + 0.5) * cell
  });

  // 2. 各セル中心が2階壁(厚み/2 + 小マージン)に被るならバリア（壁を越えない）。
  const barrier = new Uint8Array(cols * rows);
  const segDist = (px: number, pz: number, wall: WallSegment): number => {
    const ax = wall.start.x;
    const az = wall.start.z;
    const bx = wall.end.x;
    const bz = wall.end.z;
    const dx = bx - ax;
    const dz = bz - az;
    const len2 = dx * dx + dz * dz;
    let t = len2 > 1e-9 ? ((px - ax) * dx + (pz - az) * dz) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (ax + t * dx), pz - (az + t * dz));
  };
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const { x, z } = cellCenter(c, r);
      for (const wall of upperWalls) {
        if (segDist(x, z, wall) <= wall.thicknessM / 2 + cell * 0.5) {
          barrier[idx(c, r)] = 1;
          break;
        }
      }
    }
  }

  // 3. シード = いずれかの void footprint に入る非バリアセル。
  const inVoid = (x: number, z: number): boolean => {
    for (const v of lowerVoids) {
      if (
        x >= v.center.x - v.size.x / 2 &&
        x <= v.center.x + v.size.x / 2 &&
        z >= v.center.z - v.size.z / 2 &&
        z <= v.center.z + v.size.z / 2
      ) {
        return true;
      }
    }
    return false;
  };
  const filled = new Uint8Array(cols * rows);
  const voidMask = new Uint8Array(cols * rows);
  const queue: number[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const { x, z } = cellCenter(c, r);
      if (inVoid(x, z)) voidMask[idx(c, r)] = 1;
      if (inVoid(x, z) && !barrier[idx(c, r)]) {
        const i = idx(c, r);
        if (!filled[i]) {
          filled[i] = 1;
          queue.push(i);
        }
      }
    }
  }
  if (queue.length === 0) return null;

  // 4. 4近傍BFSで非バリアセルを塗り広げる。
  while (queue.length > 0) {
    const i = queue.pop()!;
    const c = i % cols;
    const r = (i - c) / cols;
    const neighbors = [
      [c - 1, r],
      [c + 1, r],
      [c, r - 1],
      [c, r + 1]
    ];
    for (const [nc, nr] of neighbors) {
      if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue;
      const ni = idx(nc, nr);
      if (filled[ni] || barrier[ni]) continue;
      filled[ni] = 1;
      queue.push(ni);
    }
  }

  return { cell, cols, rows, originX, originZ, filled, voidMask };
};

// 2階の連続領域(セル集合)から、指定Yレベルに水平スラブを張る BufferGeometry を作る。
// excludeVoid=true なら voidフットプリントのセルは抜く（見上げて吹き抜けが抜ける）。
// faceUp=true で法線+Y(床, 下から見える)、false で-Y(天井, 下から見える)。
export const buildUpperSlabGeometry = (
  region: UpperVoidRegion,
  excludeVoid: boolean,
  faceUp: boolean
): THREE.BufferGeometry | null => {
  const { cell, cols, rows, originX, originZ, filled, voidMask } = region;
  const positions: number[] = [];
  const idx = (c: number, r: number) => r * cols + c;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = idx(c, r);
      if (!filled[i]) continue;
      if (excludeVoid && voidMask[i]) continue;
      const x0 = originX + c * cell;
      const x1 = x0 + cell;
      const z0 = originZ + r * cell;
      const z1 = z0 + cell;
      // 2三角形のquad。法線向きは巻き順で決める（faceUpで上面/下面を切替）。
      if (faceUp) {
        positions.push(x0, 0, z0, x1, 0, z1, x1, 0, z0);
        positions.push(x0, 0, z0, x0, 0, z1, x1, 0, z1);
      } else {
        positions.push(x0, 0, z0, x1, 0, z0, x1, 0, z1);
        positions.push(x0, 0, z0, x1, 0, z1, x0, 0, z1);
      }
    }
  }
  if (positions.length === 0) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  return geo;
};

export const buildUpperSlabVoidEdgeGeometry = (region: UpperVoidRegion, thicknessM: number): THREE.BufferGeometry | null => {
  if (thicknessM <= 0.001) return null;
  const { cell, cols, rows, originX, originZ, filled, voidMask } = region;
  const positions: number[] = [];
  const idx = (c: number, r: number) => r * cols + c;
  const isVoid = (c: number, r: number) => c >= 0 && c < cols && r >= 0 && r < rows && voidMask[idx(c, r)] === 1;
  const pushQuad = (a: [number, number], b: [number, number]) => {
    positions.push(a[0], 0, a[1], b[0], 0, b[1], b[0], -thicknessM, b[1]);
    positions.push(a[0], 0, a[1], b[0], -thicknessM, b[1], a[0], -thicknessM, a[1]);
  };
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = idx(c, r);
      if (!filled[i] || voidMask[i]) continue;
      const x0 = originX + c * cell;
      const x1 = x0 + cell;
      const z0 = originZ + r * cell;
      const z1 = z0 + cell;
      if (isVoid(c, r - 1)) pushQuad([x0, z0], [x1, z0]);
      if (isVoid(c + 1, r)) pushQuad([x1, z0], [x1, z1]);
      if (isVoid(c, r + 1)) pushQuad([x1, z1], [x0, z1]);
      if (isVoid(c - 1, r)) pushQuad([x0, z1], [x0, z0]);
    }
  }
  if (positions.length === 0) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  return geo;
};

// 連続領域に隣接する2階壁だけを抽出する（領域境界の壁）。壁中心線を細かくサンプルし、
// 壁厚の外側に塗れたセルが在れば「面している」とみなす。これにより吹き抜けホールを
// 囲う2階の壁だけを上方へ立ち上げ、無関係な2階奥の壁は出さない。
const overlapsOpenVoidSide = (wall: WallSegment, voidArea: VoidArea): boolean => {
  const dx = wall.end.x - wall.start.x;
  const dz = wall.end.z - wall.start.z;
  const tolerance = wall.thicknessM / 2 + 0.1;
  const overlaps = (a0: number, a1: number, b0: number, b1: number) =>
    Math.min(Math.max(a0, a1), Math.max(b0, b1)) >= Math.max(Math.min(a0, a1), Math.min(b0, b1)) - tolerance;
  const sides = new Set(voidArea.openSides ?? []);
  if ((sides.has("north") || sides.has("south")) && Math.abs(dz) <= tolerance) {
    const sideZ = sides.has("north") && Math.abs((wall.start.z + wall.end.z) / 2 - (voidArea.center.z - voidArea.size.z / 2)) <= tolerance
      ? voidArea.center.z - voidArea.size.z / 2
      : sides.has("south") && Math.abs((wall.start.z + wall.end.z) / 2 - (voidArea.center.z + voidArea.size.z / 2)) <= tolerance
        ? voidArea.center.z + voidArea.size.z / 2
        : null;
    if (sideZ !== null && overlaps(wall.start.x, wall.end.x, voidArea.center.x - voidArea.size.x / 2, voidArea.center.x + voidArea.size.x / 2)) return true;
  }
  if ((sides.has("west") || sides.has("east")) && Math.abs(dx) <= tolerance) {
    const sideX = sides.has("west") && Math.abs((wall.start.x + wall.end.x) / 2 - (voidArea.center.x - voidArea.size.x / 2)) <= tolerance
      ? voidArea.center.x - voidArea.size.x / 2
      : sides.has("east") && Math.abs((wall.start.x + wall.end.x) / 2 - (voidArea.center.x + voidArea.size.x / 2)) <= tolerance
        ? voidArea.center.x + voidArea.size.x / 2
        : null;
    if (sideX !== null && overlaps(wall.start.z, wall.end.z, voidArea.center.z - voidArea.size.z / 2, voidArea.center.z + voidArea.size.z / 2)) return true;
  }
  return false;
};

export const upperBoundaryWalls = (
  region: UpperVoidRegion,
  upperWalls: WallSegment[],
  lowerVoids: VoidArea[],
  includeOpenSides = false
): WallSegment[] => {
  const { cell, cols, rows, originX, originZ, filled } = region;
  const idx = (c: number, r: number) => r * cols + c;
  const filledAt = (x: number, z: number): boolean => {
    const c = Math.floor((x - originX) / cell);
    const r = Math.floor((z - originZ) / cell);
    if (c < 0 || c >= cols || r < 0 || r >= rows) return false;
    return filled[idx(c, r)] === 1;
  };
  const result: WallSegment[] = [];
  for (const wall of upperWalls) {
    const dx = wall.end.x - wall.start.x;
    const dz = wall.end.z - wall.start.z;
    const len = Math.hypot(dx, dz);
    if (len < 1e-4) continue;
    const nx = -dz / len; // 壁法線
    const nz = dx / len;
    const off = wall.thicknessM / 2 + cell;
    const steps = Math.max(2, Math.ceil(len / cell));
    let adjacent = false;
    for (let s = 0; s <= steps && !adjacent; s++) {
      const t = s / steps;
      const x = wall.start.x + dx * t;
      const z = wall.start.z + dz * t;
      if (filledAt(x + nx * off, z + nz * off) || filledAt(x - nx * off, z - nz * off)) {
        adjacent = true;
      }
    }
    if (adjacent && (includeOpenSides || !lowerVoids.some((voidArea) => overlapsOpenVoidSide(wall, voidArea)))) result.push(wall);
  }
  return result;
};

// 1階表示中に、吹き抜けと繋がる2階の床/壁/天井だけを上方レベルに描く。
// 実構造なので常駐パストレでも表示する（!pathTracedで隠さない）。
export const UpperVoidLevel = ({
  region,
  upperWalls,
  upperWindows,
  lowerVoids,
  floorY,
  ceilingY,
  floorThicknessM,
  wallHeightM,
  floorMaterial,
  floorTexture,
  ceilingMaterial,
  materialMap,
  debugMode
}: {
  region: UpperVoidRegion;
  upperWalls: WallSegment[];
  upperWindows: WindowOpening[];
  lowerVoids: VoidArea[];
  floorY: number;
  ceilingY: number;
  floorThicknessM: number;
  wallHeightM: number;
  floorMaterial: MaterialPreset;
  floorTexture: THREE.Texture | null;
  ceilingMaterial: MaterialPreset;
  materialMap: Map<string, MaterialPreset>;
  debugMode: RenderDebugMode;
}) => {
  // 2階床(voidを抜く・上面が下から見える)、天井(下面が下から見える)スラブ。
  const floorGeo = useMemo(() => buildUpperSlabGeometry(region, true, true), [region]);
  const floorBottomGeo = useMemo(() => buildUpperSlabGeometry(region, true, false), [region]);
  const floorVoidEdgeGeo = useMemo(() => buildUpperSlabVoidEdgeGeometry(region, floorThicknessM), [region, floorThicknessM]);
  const ceilingGeo = useMemo(() => buildUpperSlabGeometry(region, false, false), [region]);
  const boundaryWalls = useMemo(() => upperBoundaryWalls(region, upperWalls, lowerVoids), [region, upperWalls, lowerVoids]);
  const boundaryWindowIds = useMemo(() => new Set(boundaryWalls.map((wall) => wall.id)), [boundaryWalls]);
  const boundaryWindows = useMemo(
    () => upperWindows.filter((windowItem) => boundaryWindowIds.has(windowItem.wallId)),
    [upperWindows, boundaryWindowIds]
  );
  const upperFloorBounds = useMemo(
    () => ({
      centerX: region.originX + (region.cols * region.cell) / 2,
      centerZ: region.originZ + (region.rows * region.cell) / 2,
      sizeX: region.cols * region.cell,
      sizeZ: region.rows * region.cell
    }),
    [region]
  );
  useEffect(() => () => floorGeo?.dispose(), [floorGeo]);
  useEffect(() => () => floorBottomGeo?.dispose(), [floorBottomGeo]);
  useEffect(() => () => floorVoidEdgeGeo?.dispose(), [floorVoidEdgeGeo]);
  useEffect(() => () => ceilingGeo?.dispose(), [ceilingGeo]);

  return (
    <group>
      {/* 2階床スラブ（吹き抜けフットプリントは抜けて廊下のフチが見える） */}
      {floorGeo && (
        <mesh position={[0, floorY, 0]} geometry={floorGeo} receiveShadow castShadow>
          <meshStandardMaterial
            map={debugMode === "beauty" ? floorTexture ?? undefined : undefined}
            color={debugColorForRole("floor", debugMode, floorMaterial.baseColor)}
            roughness={floorMaterial.roughness}
            metalness={floorMaterial.metalness}
            side={floorThicknessM > 0.001 ? THREE.FrontSide : THREE.DoubleSide}
          />
        </mesh>
      )}
      {floorThicknessM > 0.001 && floorBottomGeo && (
        <mesh position={[0, floorY - floorThicknessM, 0]} geometry={floorBottomGeo} receiveShadow castShadow>
          <meshStandardMaterial
            color={debugColorForRole("ceiling", debugMode, ceilingMaterial.baseColor)}
            roughness={ceilingMaterial.roughness}
            metalness={ceilingMaterial.metalness}
            side={THREE.FrontSide}
          />
        </mesh>
      )}
      {floorVoidEdgeGeo && (
        <mesh position={[0, floorY, 0]} geometry={floorVoidEdgeGeo} receiveShadow castShadow>
          <meshStandardMaterial
            color={debugColorForRole("floor", debugMode, floorMaterial.baseColor)}
            roughness={floorMaterial.roughness}
            metalness={floorMaterial.metalness}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}
      {/* 2階天井スラブ（見上げて黒/空へ抜けない蓋） */}
      {ceilingGeo && (
        <mesh position={[0, ceilingY, 0]} geometry={ceilingGeo} receiveShadow castShadow>
          <meshStandardMaterial
            color={debugColorForRole("ceiling", debugMode, ceilingMaterial.baseColor)}
            roughness={ceilingMaterial.roughness}
            metalness={ceilingMaterial.metalness}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}
      {/* 領域境界の2階壁を、2階床レベルから立ち上げる。 */}
      <group position={[0, floorY, 0]}>
        {boundaryWalls.map((wall) => (
          <WallMesh
            key={`upper-${wall.id}`}
            // 通常壁は2階全高に揃えるが、腰壁/手すりは自前の低い高さを保つ（吹抜周りに回せる）。
            wall={{ ...wall, heightM: wall.kind === "half" || wall.kind === "railing" ? wall.heightM : wallHeightM }}
            walls={upperWalls}
            windows={upperWindows}
            material={materialMap.get(wall.materialId) ?? ceilingMaterial}
            roomCenter={new THREE.Vector3(region.originX + (region.cols * region.cell) / 2, 0, region.originZ + (region.rows * region.cell) / 2)}
            floorBounds={upperFloorBounds}
            selected={false}
            onSelect={() => {}}
            debugMode={debugMode}
            canEditWalls={false}
          />
        ))}
        {boundaryWindows.map((windowItem) => {
          return (
            <WindowMesh
              key={`upper-${windowItem.id}`}
              windowItem={windowItem}
              walls={upperWalls}
              selected={false}
              onSelect={() => {}}
              debugMode={debugMode}
            />
          );
        })}
      </group>
    </group>
  );
};
