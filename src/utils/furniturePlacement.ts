import type { FurnitureItem, FurnitureType, Project, Vec2M, Vec3M, WallSegment } from "../types";
import { wallInwardNormal } from "./wallGeometry";

const FURNITURE_WALL_CLEARANCE_M = 0.015;
const FURNITURE_WALL_SNAP_M = 0.22;

const wallAttachableTypes = new Set<FurnitureType>([
  "bed",
  "box",
  "bathtub",
  "counter",
  "cupboard",
  "desk",
  "fridge",
  "kitchen",
  "shelf",
  "shoeCabinet",
  "sofa",
  "toilet",
  "tv",
  "washer",
  "washstand"
]);

type WallProjection = {
  ratio: number;
  x: number;
  z: number;
  length: number;
  tangentOverflowM: number;
};

type WallSnap = {
  wall: WallSegment;
  projection: WallProjection;
  inward: Vec2M;
  distanceError: number;
};

const projectOntoWall = (point: Vec2M, wall: WallSegment): WallProjection | null => {
  const dx = wall.end.x - wall.start.x;
  const dz = wall.end.z - wall.start.z;
  const length = Math.hypot(dx, dz);
  if (length < 1e-6) return null;
  const len2 = length * length;
  const rawRatio = ((point.x - wall.start.x) * dx + (point.z - wall.start.z) * dz) / len2;
  const ratio = Math.max(0, Math.min(1, rawRatio));
  const tangentOverflowM =
    rawRatio < 0 ? -rawRatio * length : rawRatio > 1 ? (rawRatio - 1) * length : 0;
  return {
    ratio,
    x: wall.start.x + dx * ratio,
    z: wall.start.z + dz * ratio,
    length,
    tangentOverflowM
  };
};

const wallsCenter = (walls: WallSegment[]): Vec2M => {
  if (walls.length === 0) return { x: 0, z: 0 };
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const wall of walls) {
    minX = Math.min(minX, wall.start.x, wall.end.x);
    maxX = Math.max(maxX, wall.start.x, wall.end.x);
    minZ = Math.min(minZ, wall.start.z, wall.end.z);
    maxZ = Math.max(maxZ, wall.start.z, wall.end.z);
  }
  return { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2 };
};

const localAxes = (rotationYDeg: number) => {
  const th = (rotationYDeg * Math.PI) / 180;
  const c = Math.cos(th);
  const s = Math.sin(th);
  return {
    xAxis: { x: c, z: -s },
    zAxis: { x: s, z: c }
  };
};

const halfExtentAlong = (item: FurnitureItem, axis: Vec2M, rotationYDeg = item.rotationYDeg) => {
  const axes = localAxes(rotationYDeg);
  return (
    Math.abs(axes.xAxis.x * axis.x + axes.xAxis.z * axis.z) * item.size.x * 0.5 +
    Math.abs(axes.zAxis.x * axis.x + axes.zAxis.z * axis.z) * item.size.z * 0.5
  );
};

const wallTangent = (wall: WallSegment, length: number): Vec2M => ({
  x: (wall.end.x - wall.start.x) / length,
  z: (wall.end.z - wall.start.z) / length
});

const wallTargetDistance = (item: FurnitureItem, wall: WallSegment) =>
  wall.thicknessM * 0.5 + item.size.z * 0.5 + FURNITURE_WALL_CLEARANCE_M;

const wallSignedDistance = (position: Vec3M, projection: WallProjection, inward: Vec2M) =>
  (position.x - projection.x) * inward.x + (position.z - projection.z) * inward.z;

const findWallSnap = (
  item: FurnitureItem,
  position: Vec3M,
  walls: WallSegment[],
  center: Vec2M,
  rotationYDeg: number
): WallSnap | null => {
  let snap: WallSnap | null = null;

  for (const wall of walls) {
    const projection = projectOntoWall(position, wall);
    if (!projection) continue;
    const inward = wallInwardNormal(wall, center);
    const tangent = wallTangent(wall, projection.length);
    const tangentExtent = item.size.x * 0.5;
    if (projection.tangentOverflowM > tangentExtent + FURNITURE_WALL_SNAP_M) continue;
    const signedDistance = wallSignedDistance(position, projection, inward);
    const targetDistance = wallTargetDistance(item, wall);
    const distanceError = Math.abs(signedDistance - targetDistance);
    if (distanceError > FURNITURE_WALL_SNAP_M) continue;
    const tangentScore = Math.max(0, projection.tangentOverflowM - halfExtentAlong(item, tangent, rotationYDeg));
    const score = distanceError + tangentScore;
    if (!snap || score < snap.distanceError) snap = { wall, projection, inward, distanceError: score };
  }

  return snap;
};

const keepCurrentWallSnap = (
  item: FurnitureItem,
  position: Vec3M,
  wall: WallSegment,
  center: Vec2M
): WallSnap | null => {
  const projection = projectOntoWall(position, wall);
  if (!projection) return null;
  const tangent = wallTangent(wall, projection.length);
  if (projection.tangentOverflowM > halfExtentAlong(item, tangent) + FURNITURE_WALL_SNAP_M) return null;
  const inward = wallInwardNormal(wall, center);
  const signedDistance = wallSignedDistance(position, projection, inward);
  const targetDistance = wallTargetDistance(item, wall);
  if (signedDistance > targetDistance + FURNITURE_WALL_SNAP_M) return null;
  return { wall, projection, inward, distanceError: Math.abs(signedDistance - targetDistance) };
};

const constrainAgainstWalls = (
  item: FurnitureItem,
  position: Vec3M,
  rotationYDeg: number,
  walls: WallSegment[],
  center: Vec2M
): Vec3M => {
  let next = { ...position };
  for (let pass = 0; pass < 2; pass += 1) {
    for (const wall of walls) {
      const projection = projectOntoWall(next, wall);
      if (!projection) continue;
      const inward = wallInwardNormal(wall, center);
      const tangent = {
        x: (wall.end.x - wall.start.x) / projection.length,
        z: (wall.end.z - wall.start.z) / projection.length
      };
      const tangentExtent = halfExtentAlong(item, tangent, rotationYDeg);
      if (projection.tangentOverflowM > tangentExtent + 0.02) continue;

      const signedDistance = (next.x - projection.x) * inward.x + (next.z - projection.z) * inward.z;
      const minDistance =
        wall.thicknessM * 0.5 + halfExtentAlong(item, inward, rotationYDeg) + FURNITURE_WALL_CLEARANCE_M;
      const previousProjection = projectOntoWall(item.position, wall);
      if (!previousProjection) continue;
      const previousSignedDistance = wallSignedDistance(item.position, previousProjection, inward);
      const previousSide = previousSignedDistance < 0 ? -1 : 1;
      if (signedDistance * previousSide >= minDistance) continue;
      const push = previousSide * minDistance - signedDistance;
      next = {
        ...next,
        x: next.x + inward.x * push,
        z: next.z + inward.z * push
      };
    }
  }
  return next;
};

export const constrainFurniturePlacement = (
  project: Project,
  item: FurnitureItem,
  position: Vec3M
): { position: Vec3M; rotationYDeg: number } => {
  const floor = item.floor ?? project.activeFloor ?? 1;
  const walls = project.walls.filter((wall) => (wall.floor ?? 1) === floor && wall.kind !== "railing");
  const center = wallsCenter(walls);

  let nextPosition = { ...position };
  let nextRotationYDeg = item.rotationYDeg;

  if (wallAttachableTypes.has(item.type)) {
    const currentSnap = findWallSnap(item, item.position, walls, center, item.rotationYDeg);
    const snap =
      (currentSnap && keepCurrentWallSnap(item, position, currentSnap.wall, center)) ??
      findWallSnap(item, position, walls, center, nextRotationYDeg);

    if (snap) {
      const ratioPadding = Math.min(0.5, item.size.x * 0.5 / snap.projection.length);
      const ratio =
        ratioPadding < 0.5
          ? Math.max(ratioPadding, Math.min(1 - ratioPadding, snap.projection.ratio))
          : snap.projection.ratio;
      const x = snap.wall.start.x + (snap.wall.end.x - snap.wall.start.x) * ratio;
      const z = snap.wall.start.z + (snap.wall.end.z - snap.wall.start.z) * ratio;
      const targetDistance = wallTargetDistance(item, snap.wall);
      nextPosition = {
        ...nextPosition,
        x: x + snap.inward.x * targetDistance,
        z: z + snap.inward.z * targetDistance
      };
      nextRotationYDeg = (Math.atan2(snap.inward.x, snap.inward.z) * 180) / Math.PI;
    }
  }

  return {
    position: constrainAgainstWalls(item, nextPosition, nextRotationYDeg, walls, center),
    rotationYDeg: nextRotationYDeg
  };
};
