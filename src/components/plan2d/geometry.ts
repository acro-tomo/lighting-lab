import type { Project, Vec2M, VoidSide, WallSegment } from "../../types";
import { isWallLightAddKind } from "../../data/fixtureAddKinds";
import { MIN_SIZE_M, WALL_MODULE_M } from "./constants";
import type { ResizeEdge } from "./types";

// 壁に付く追加物（窓カタログ "window:<id>" / 扉 "door" / 壁付スポット "wallspot"）の判定。
export const isWallOpening = (kind: string | null): boolean =>
  !!kind && (kind === "door" || kind.startsWith("window") || isWallLightAddKind(kind));

// SVG空間で線分 s→e に対する単位法線。side="left"/"right" は start→end を歩いた
// ときの左/右（worldToSvg は x→x, z→y で向きを保つので world の左右と一致する）。
// SVGはy下向きなので、left法線は (dy, -dx) を正規化したものとする。
export const svgSideNormal = (
  s: { x: number; y: number },
  e: { x: number; y: number },
  side: "left" | "right"
): { x: number; y: number } => {
  const dx = e.x - s.x;
  const dy = e.y - s.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = dy / len;
  const ny = -dx / len;
  return side === "left" ? { x: nx, y: ny } : { x: -nx, y: -ny };
};

export const distance = (a: Vec2M, b: Vec2M) => Math.hypot(a.x - b.x, a.z - b.z);

export const snap = (value: number, grid = 0.1) => Math.round(value / grid) * grid;

export const snapPoint = (point: Vec2M): Vec2M => ({ x: snap(point.x), z: snap(point.z) });

export const snapToShakuModule = (p: Vec2M, origin: Vec2M): Vec2M => ({
  x: origin.x + Math.round((p.x - origin.x) / WALL_MODULE_M) * WALL_MODULE_M,
  z: origin.z + Math.round((p.z - origin.z) / WALL_MODULE_M) * WALL_MODULE_M
});

export const uid = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

// 前頂点 prev から見て生の点 raw が水平/垂直に近ければ直角に吸着する。
export const angleSnap = (prev: Vec2M, raw: Vec2M): Vec2M => {
  const dx = raw.x - prev.x;
  const dz = raw.z - prev.z;
  const a = Math.atan2(Math.abs(dz), Math.abs(dx)); // 0=水平, π/2=垂直
  if (a < (15 * Math.PI) / 180) return { x: raw.x, z: prev.z }; // 水平
  if (a > (75 * Math.PI) / 180) return { x: prev.x, z: raw.z }; // 垂直
  return raw;
};

export const orthogonalSnap = (prev: Vec2M, raw: Vec2M): Vec2M =>
  Math.abs(raw.x - prev.x) >= Math.abs(raw.z - prev.z)
    ? { x: raw.x, z: prev.z }
    : { x: prev.x, z: raw.z };

// 点 p を壁線分に射影した壁上比率(0..1)と垂直距離(m)を返す。窓/扉のクリック配置に使う。
export const projectOntoWall = (p: Vec2M, wall: WallSegment) => {
  const dx = wall.end.x - wall.start.x;
  const dz = wall.end.z - wall.start.z;
  const len2 = dx * dx + dz * dz;
  const t = len2 > 1e-9 ? ((p.x - wall.start.x) * dx + (p.z - wall.start.z) * dz) / len2 : 0;
  const ratio = Math.max(0, Math.min(1, t));
  const dist = Math.hypot(p.x - (wall.start.x + dx * ratio), p.z - (wall.start.z + dz * ratio));
  return { ratio, dist };
};

// クリック点に最も近い壁とその壁上比率。壁が無ければ null。
export const nearestWall = (p: Vec2M, walls: WallSegment[]) => {
  let best: { wallId: string; ratio: number; dist: number } | null = null;
  for (const wall of walls) {
    const { ratio, dist } = projectOntoWall(p, wall);
    if (!best || dist < best.dist) best = { wallId: wall.id, ratio, dist };
  }
  return best;
};

export const voidSideLine = (voidArea: Project["voids"][number], side: VoidSide) => {
  const minX = voidArea.center.x - voidArea.size.x / 2;
  const maxX = voidArea.center.x + voidArea.size.x / 2;
  const minZ = voidArea.center.z - voidArea.size.z / 2;
  const maxZ = voidArea.center.z + voidArea.size.z / 2;
  switch (side) {
    case "north":
      return { start: { x: minX, z: minZ }, end: { x: maxX, z: minZ } };
    case "south":
      return { start: { x: minX, z: maxZ }, end: { x: maxX, z: maxZ } };
    case "west":
      return { start: { x: minX, z: minZ }, end: { x: minX, z: maxZ } };
    case "east":
      return { start: { x: maxX, z: minZ }, end: { x: maxX, z: maxZ } };
  }
};

// 矩形(中心center/幅x・奥行z/回転deg)の1辺をカーソルまで動かしてリサイズする。
// 反対側の辺は固定（パワポの図形リサイズと同じ挙動）。回転していてもローカル軸で処理する。
export const resizeRect = (
  center: Vec2M,
  size: { x: number; z: number },
  rotationDeg: number,
  edge: ResizeEdge,
  cursor: Vec2M
): { center: Vec2M; size: { x: number; z: number } } => {
  const th = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(th);
  const sin = Math.sin(th);
  const dx = cursor.x - center.x;
  const dz = cursor.z - center.z;
  const lx = dx * cos + dz * sin; // ローカルx（幅方向）
  const lz = -dx * sin + dz * cos; // ローカルz（奥行方向）
  const halfX0 = size.x / 2;
  const halfZ0 = size.z / 2;
  let halfX = halfX0;
  let halfZ = halfZ0;
  let cLocalX = 0;
  let cLocalZ = 0;
  // 角ハンドルはアスペクト比を保ったまま等倍リサイズ。対角の角を固定点にする。
  if (edge === "topLeft" || edge === "topRight" || edge === "bottomLeft" || edge === "bottomRight") {
    const sx = edge === "topRight" || edge === "bottomRight" ? 1 : -1; // 掴んだ角のローカルx符号
    const sz = edge === "bottomLeft" || edge === "bottomRight" ? 1 : -1; // ローカルz符号(下が正)
    const anchorX = -sx * halfX0; // 対角(固定)の角
    const anchorZ = -sz * halfZ0;
    const rawW = Math.abs(lx - anchorX);
    const rawD = Math.abs(lz - anchorZ);
    let s = Math.max(rawW / size.x, rawD / size.z);
    s = Math.max(s, MIN_SIZE_M / size.x, MIN_SIZE_M / size.z);
    const finalW = size.x * s;
    const finalD = size.z * s;
    halfX = finalW / 2;
    halfZ = finalD / 2;
    cLocalX = anchorX + (sx * finalW) / 2;
    cLocalZ = anchorZ + (sz * finalD) / 2;
  } else if (edge === "right") {
    const left = -halfX;
    const right = Math.max(lx, left + MIN_SIZE_M);
    halfX = (right - left) / 2;
    cLocalX = (right + left) / 2;
  } else if (edge === "left") {
    const right = halfX;
    const left = Math.min(lx, right - MIN_SIZE_M);
    halfX = (right - left) / 2;
    cLocalX = (right + left) / 2;
  } else if (edge === "bottom") {
    const top = -halfZ;
    const bottom = Math.max(lz, top + MIN_SIZE_M);
    halfZ = (bottom - top) / 2;
    cLocalZ = (bottom + top) / 2;
  } else {
    const bottom = halfZ;
    const top = Math.min(lz, bottom - MIN_SIZE_M);
    halfZ = (bottom - top) / 2;
    cLocalZ = (bottom + top) / 2;
  }
  const wx = cLocalX * cos - cLocalZ * sin;
  const wz = cLocalX * sin + cLocalZ * cos;
  return {
    center: { x: center.x + wx, z: center.z + wz },
    size: { x: halfX * 2, z: halfZ * 2 }
  };
};
