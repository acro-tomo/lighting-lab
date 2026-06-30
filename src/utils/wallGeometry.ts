import type { WallSegment } from "../types";

type WallSide = NonNullable<WallSegment["innerSide"]>;
type WallPoint = { x: number; z: number };

export const wallSideNormal = (wall: Pick<WallSegment, "start" | "end">, side: WallSide): WallPoint => {
  const dx = wall.end.x - wall.start.x;
  const dz = wall.end.z - wall.start.z;
  const length = Math.hypot(dx, dz) || 1;
  const left = { x: dz / length, z: -dx / length };
  return side === "left" ? left : { x: -left.x, z: -left.z };
};

export const wallInwardNormal = (
  wall: Pick<WallSegment, "start" | "end" | "innerSide">,
  fallbackPoint: WallPoint
): WallPoint => {
  if (wall.innerSide) return wallSideNormal(wall, wall.innerSide);

  const left = wallSideNormal(wall, "left");
  const right = { x: -left.x, z: -left.z };
  const midpoint = {
    x: (wall.start.x + wall.end.x) / 2,
    z: (wall.start.z + wall.end.z) / 2
  };
  const toFallback = {
    x: fallbackPoint.x - midpoint.x,
    z: fallbackPoint.z - midpoint.z
  };
  return left.x * toFallback.x + left.z * toFallback.z >= right.x * toFallback.x + right.z * toFallback.z
    ? left
    : right;
};
