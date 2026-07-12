import type { Project, WallSegment } from "../../types";

// 床・天井は壁の囲い（絶対座標）に合わせて生成する。壁が無い/極小なら room 寸法を原点中心でフォールバック。
export const computeFloorBounds = (project: Project) => {
  if (project.walls.length === 0) {
    return {
      centerX: 0,
      centerZ: 0,
      sizeX: project.room.widthM,
      sizeZ: project.room.depthM
    };
  }
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  let maxThickness = 0;
  for (const wall of project.walls) {
    minX = Math.min(minX, wall.start.x, wall.end.x);
    maxX = Math.max(maxX, wall.start.x, wall.end.x);
    minZ = Math.min(minZ, wall.start.z, wall.end.z);
    maxZ = Math.max(maxZ, wall.start.z, wall.end.z);
    maxThickness = Math.max(maxThickness, wall.thicknessM);
  }
  // 壁の外周を床/天井が覆うよう、最大厚みの半分を一律マージンで外側へ広げる。
  const margin = maxThickness / 2;
  minX -= margin;
  maxX += margin;
  minZ -= margin;
  maxZ += margin;
  const sizeX = Math.max(maxX - minX, 0.5);
  const sizeZ = Math.max(maxZ - minZ, 0.5);
  if (sizeX < 0.5 || sizeZ < 0.5) {
    return {
      centerX: 0,
      centerZ: 0,
      sizeX: project.room.widthM,
      sizeZ: project.room.depthM
    };
  }
  return {
    centerX: (minX + maxX) / 2,
    centerZ: (minZ + maxZ) / 2,
    sizeX,
    sizeZ
  };
};

export type FloorBounds = ReturnType<typeof computeFloorBounds>;

// 壁セグメントから室内外周ポリゴン（絶対座標の頂点列）を導出する。
// 端点を近接マージしてグラフ化し、最大面積の閉ループを外周とみなす。
// L字など非矩形の間取りで床/天井を室内だけに張るために使う。
// 綺麗に取れない場合は null を返し、呼び出し側は bbox 矩形へフォールバックする。
export const computeRoomPolygon = (project: Project): { x: number; z: number }[] | null => {
  if (project.walls.length < 3) return null;
  // 端点近接マージのしきい値: 最大厚みの半分か 0.05m の大きい方。
  const maxThickness = project.walls.reduce((m, w) => Math.max(m, w.thicknessM), 0);
  const mergeEps = Math.max(maxThickness / 2, 0.05);

  // 代表点(ノード)へ端点を量子化する。近接ノードがあれば共有する。
  const nodes: { x: number; z: number }[] = [];
  const nodeIndex = (p: { x: number; z: number }): number => {
    for (let i = 0; i < nodes.length; i++) {
      if (Math.hypot(nodes[i].x - p.x, nodes[i].z - p.z) <= mergeEps) return i;
    }
    nodes.push({ x: p.x, z: p.z });
    return nodes.length - 1;
  };

  // 無向グラフ（隣接集合）。間仕切りで分岐があっても外周ループ抽出は最大面積で吸収する。
  const adj = new Map<number, Set<number>>();
  const addEdge = (a: number, b: number) => {
    if (a === b) return;
    if (!adj.has(a)) adj.set(a, new Set());
    if (!adj.has(b)) adj.set(b, new Set());
    adj.get(a)!.add(b);
    adj.get(b)!.add(a);
  };
  for (const wall of project.walls) {
    addEdge(nodeIndex(wall.start), nodeIndex(wall.end));
  }
  if (nodes.length < 3) return null;

  const signedArea = (poly: number[]): number => {
    let area = 0;
    for (let i = 0; i < poly.length; i++) {
      const a = nodes[poly[i]];
      const b = nodes[poly[(i + 1) % poly.length]];
      area += a.x * b.z - b.x * a.z;
    }
    return area / 2;
  };

  // 各辺から最も鋭く左へ曲がる隣へ進む「面トレース」で全ての面ループを列挙し、
  // 面積最大（外周）を採用する。無限外面は面積が負/最大絶対値の符号で判別。
  const visited = new Set<string>();
  let best: number[] | null = null;
  let bestArea = 0;
  for (const [from, neighbors] of adj) {
    for (const to of neighbors) {
      const startKey = `${from}->${to}`;
      if (visited.has(startKey)) continue;
      const loop: number[] = [from];
      let prev = from;
      let curr = to;
      let guard = 0;
      let ok = true;
      while (curr !== from && guard < 2000) {
        guard++;
        visited.add(`${prev}->${curr}`);
        loop.push(curr);
        const incoming = Math.atan2(nodes[curr].z - nodes[prev].z, nodes[curr].x - nodes[prev].x);
        const currNeighbors = adj.get(curr);
        if (!currNeighbors || currNeighbors.size === 0) {
          ok = false;
          break;
        }
        // 進入方向に対し最も時計回り側（最小の左回転角）の辺を選ぶ＝最小面に沿う。
        let nextNode = -1;
        let bestTurn = Infinity;
        for (const cand of currNeighbors) {
          if (cand === prev && currNeighbors.size > 1) continue;
          const outgoing = Math.atan2(nodes[cand].z - nodes[curr].z, nodes[cand].x - nodes[curr].x);
          let turn = outgoing - (incoming + Math.PI);
          while (turn <= 0) turn += Math.PI * 2;
          while (turn > Math.PI * 2) turn -= Math.PI * 2;
          if (turn < bestTurn) {
            bestTurn = turn;
            nextNode = cand;
          }
        }
        if (nextNode < 0) {
          ok = false;
          break;
        }
        prev = curr;
        curr = nextNode;
      }
      visited.add(`${prev}->${curr}`);
      if (!ok || curr !== from || loop.length < 3) continue;
      const area = signedArea(loop);
      if (Math.abs(area) > Math.abs(bestArea)) {
        bestArea = area;
        best = loop;
      }
    }
  }

  if (!best || best.length < 3 || Math.abs(bestArea) < 0.25) return null;
  // CCW（正の符号）へ正規化して返す。
  const ordered = bestArea < 0 ? [...best].reverse() : best;
  return ordered.map((i) => ({ x: nodes[i].x, z: nodes[i].z }));
};

// 点をワールド床(x,z)で壁線分に射影し、壁上比率(0..1)と距離を返す（Plan2D と同等）。
export const projectPointOntoWall = (x: number, z: number, wall: WallSegment) => {
  const dx = wall.end.x - wall.start.x;
  const dz = wall.end.z - wall.start.z;
  const len2 = dx * dx + dz * dz;
  const t = len2 > 1e-9 ? ((x - wall.start.x) * dx + (z - wall.start.z) * dz) / len2 : 0;
  const ratio = Math.max(0, Math.min(1, t));
  const dist = Math.hypot(x - (wall.start.x + dx * ratio), z - (wall.start.z + dz * ratio));
  return { ratio, dist };
};

export const nearestWallAt = (x: number, z: number, walls: WallSegment[]) => {
  let best: { wall: WallSegment; ratio: number; dist: number } | null = null;
  for (const wall of walls) {
    const { ratio, dist } = projectPointOntoWall(x, z, wall);
    if (!best || dist < best.dist) best = { wall, ratio, dist };
  }
  return best;
};
