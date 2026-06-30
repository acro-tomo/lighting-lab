import { fixtureModelMap } from "../data/fixtureCatalog";
import type { LightFixture, Project, VoidArea, VoidSide, WallSegment } from "../types";
import { ceilingMountHeightAt } from "./ceiling";

type WallMountedPlacement = {
  position: { x: number; y: number; z: number };
  target: { x: number; y: number; z: number };
  rotationYDeg: number;
};

type WallMountSurface = { wallId: string; ratio: number; dist: number };

export const VOID_WALL_SIDES: VoidSide[] = ["north", "south", "west", "east"];
export const WALL_MOUNT_SNAP_M = 0.6;

export const visibleVoidSides = (voidArea: Pick<VoidArea, "openSides">): VoidSide[] =>
  VOID_WALL_SIDES.filter((side) => !(voidArea.openSides ?? []).includes(side));

export const voidWallId = (voidId: string, side: VoidSide) => `void:${voidId}:${side}`;

export const parseVoidWallId = (wallId: string): { voidId: string; side: VoidSide } | null => {
  const [, voidId, side] = wallId.split(":");
  if (!wallId.startsWith("void:") || !voidId || !VOID_WALL_SIDES.includes(side as VoidSide)) return null;
  return { voidId, side: side as VoidSide };
};

export const isCeilingMountedFixture = (fixture: Pick<LightFixture, "model" | "type">): boolean => {
  const model = fixture.model ? fixtureModelMap.get(fixture.model) : undefined;
  const modelId = model?.id ?? fixture.model;
  const baseType = model?.baseType ?? fixture.type;
  return (
    (modelId?.startsWith("dl-") ?? false) ||
    baseType === "downlight" ||
    baseType === "pendant" ||
    baseType === "tape"
  );
};

export const isWallMountedFixture = (fixture: Pick<LightFixture, "model" | "type">): boolean => {
  const model = fixture.model ? fixtureModelMap.get(fixture.model) : undefined;
  return model?.id === "sp-wall" || model?.baseType === "bracket" || fixture.type === "bracket";
};

export const normalizeCeilingMountedFixture = (project: Project, fixture: LightFixture): LightFixture => {
  if (!isCeilingMountedFixture(fixture)) return fixture;
  const mountHeightM = ceilingMountHeightAt(
    project,
    { x: fixture.position.x, z: fixture.position.z },
    fixture.floor ?? project.activeFloor ?? 1
  );
  const y = fixture.type === "pendant" ? mountHeightM - (fixture.cordLengthM ?? 0.6) : mountHeightM - 0.04;
  return {
    ...fixture,
    mountHeightM,
    position: { ...fixture.position, y }
  };
};

const projectPointOntoWall = (x: number, z: number, wall: WallSegment) => {
  const dx = wall.end.x - wall.start.x;
  const dz = wall.end.z - wall.start.z;
  const len2 = dx * dx + dz * dz;
  const t = len2 > 1e-9 ? ((x - wall.start.x) * dx + (z - wall.start.z) * dz) / len2 : 0;
  const ratio = Math.max(0, Math.min(1, t));
  const dist = Math.hypot(x - (wall.start.x + dx * ratio), z - (wall.start.z + dz * ratio));
  return { ratio, dist };
};

const projectPointOntoVoidSide = (x: number, z: number, voidArea: VoidArea, side: VoidSide) => {
  const minX = voidArea.center.x - voidArea.size.x / 2;
  const maxX = voidArea.center.x + voidArea.size.x / 2;
  const minZ = voidArea.center.z - voidArea.size.z / 2;
  const maxZ = voidArea.center.z + voidArea.size.z / 2;
  if (side === "north" || side === "south") {
    const ratio = Math.max(0, Math.min(1, (x - minX) / voidArea.size.x));
    const px = minX + voidArea.size.x * ratio;
    const pz = side === "north" ? minZ : maxZ;
    return { ratio, dist: Math.hypot(x - px, z - pz) };
  }
  const ratio = Math.max(0, Math.min(1, (z - minZ) / voidArea.size.z));
  const px = side === "west" ? minX : maxX;
  const pz = minZ + voidArea.size.z * ratio;
  return { ratio, dist: Math.hypot(x - px, z - pz) };
};

const wallsCenter = (walls: WallSegment[]) => {
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

const inwardNormalForWall = (wall: WallSegment, walls: WallSegment[]) => {
  const dx = wall.end.x - wall.start.x;
  const dz = wall.end.z - wall.start.z;
  const len = Math.hypot(dx, dz);
  if (len < 1e-6) return { x: 0, z: 1 };
  const normalA = { x: -dz / len, z: dx / len };
  const normalB = { x: -normalA.x, z: -normalA.z };
  const center = wallsCenter(walls);
  const midpoint = { x: (wall.start.x + wall.end.x) / 2, z: (wall.start.z + wall.end.z) / 2 };
  const toCenter = { x: center.x - midpoint.x, z: center.z - midpoint.z };
  return normalA.x * toCenter.x + normalA.z * toCenter.z >= normalB.x * toCenter.x + normalB.z * toCenter.z
    ? normalA
    : normalB;
};

export const wallMountedLightPlacementOnWall = (
  project: Project,
  wallId: string,
  centerRatio: number,
  heightM: number
): WallMountedPlacement | null => {
  const wall = project.walls.find((candidate) => candidate.id === wallId);
  if (!wall) return null;
  const floor = wall.floor ?? project.activeFloor ?? 1;
  const floorWalls = project.walls.filter((candidate) => (candidate.floor ?? 1) === floor);
  const ratio = Math.max(0, Math.min(1, centerRatio));
  const normal = inwardNormalForWall(wall, floorWalls);
  const wallX = wall.start.x + (wall.end.x - wall.start.x) * ratio;
  const wallZ = wall.start.z + (wall.end.z - wall.start.z) * ratio;
  const fixtureOffset = wall.thicknessM / 2 + 0.04;
  const position = {
    x: wallX + normal.x * fixtureOffset,
    y: heightM,
    z: wallZ + normal.z * fixtureOffset
  };
  return {
    position,
    target: {
      x: position.x + normal.x,
      y: Math.max(0.6, heightM - 0.7),
      z: position.z + normal.z
    },
    rotationYDeg: (Math.atan2(normal.x, normal.z) * 180) / Math.PI
  };
};

const voidSideNormal = (side: VoidSide) => {
  switch (side) {
    case "north":
      return { x: 0, z: 1 };
    case "south":
      return { x: 0, z: -1 };
    case "west":
      return { x: 1, z: 0 };
    case "east":
      return { x: -1, z: 0 };
  }
};

const wallMountedLightPlacementOnVoid = (
  project: Project,
  voidId: string,
  side: VoidSide,
  centerRatio: number,
  heightM: number
): WallMountedPlacement | null => {
  const voidArea = project.voids.find((candidate) => candidate.id === voidId);
  if (!voidArea || (voidArea.openSides ?? []).includes(side)) return null;
  const ratio = Math.max(0, Math.min(1, centerRatio));
  const minX = voidArea.center.x - voidArea.size.x / 2;
  const maxX = voidArea.center.x + voidArea.size.x / 2;
  const minZ = voidArea.center.z - voidArea.size.z / 2;
  const maxZ = voidArea.center.z + voidArea.size.z / 2;
  const x = side === "west" ? minX : side === "east" ? maxX : minX + voidArea.size.x * ratio;
  const z = side === "north" ? minZ : side === "south" ? maxZ : minZ + voidArea.size.z * ratio;
  const normal = voidSideNormal(side);
  const position = {
    x: x + normal.x * 0.04,
    y: heightM,
    z: z + normal.z * 0.04
  };
  return {
    position,
    target: {
      x: position.x + normal.x,
      y: Math.max(0.6, heightM - 0.7),
      z: position.z + normal.z
    },
    rotationYDeg: (Math.atan2(normal.x, normal.z) * 180) / Math.PI
  };
};

export const wallMountedLightPlacementOnSurface = (
  project: Project,
  wallId: string,
  centerRatio: number,
  heightM: number
): WallMountedPlacement | null => {
  const voidWall = parseVoidWallId(wallId);
  if (voidWall) return wallMountedLightPlacementOnVoid(project, voidWall.voidId, voidWall.side, centerRatio, heightM);
  return wallMountedLightPlacementOnWall(project, wallId, centerRatio, heightM);
};

export const nearestWallMountSurfaceAt = (
  project: Project,
  x: number,
  z: number,
  floor: number = project.activeFloor ?? 1,
  options: { maxDistM?: number } = {}
): WallMountSurface | null => {
  let best: WallMountSurface | null = null;
  for (const wall of project.walls.filter((candidate) => (candidate.floor ?? 1) === floor)) {
    const { ratio, dist } = projectPointOntoWall(x, z, wall);
    if (!best || dist < best.dist) best = { wallId: wall.id, ratio, dist };
  }
  for (const voidArea of project.voids.filter((candidate) => (candidate.floor ?? 1) === floor)) {
    for (const side of visibleVoidSides(voidArea)) {
      const { ratio, dist } = projectPointOntoVoidSide(x, z, voidArea, side);
      if (!best || dist < best.dist) best = { wallId: voidWallId(voidArea.id, side), ratio, dist };
    }
  }
  if (best && options.maxDistM !== undefined && best.dist > options.maxDistM) return null;
  return best;
};

export const wallMountedLightPlacementAt = (
  project: Project,
  x: number,
  z: number,
  heightM: number,
  floor: number = project.activeFloor ?? 1,
  maxDistM: number = WALL_MOUNT_SNAP_M
): WallMountedPlacement | null => {
  const best = nearestWallMountSurfaceAt(project, x, z, floor, { maxDistM });
  return best ? wallMountedLightPlacementOnSurface(project, best.wallId, best.ratio, heightM) : null;
};
