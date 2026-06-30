import { fixtureModelMap } from "../data/fixtureCatalog";
import type { LightFixture, Project, WallSegment } from "../types";
import { ceilingMountHeightAt } from "./ceiling";

type WallMountedPlacement = {
  position: { x: number; y: number; z: number };
  target: { x: number; y: number; z: number };
  rotationYDeg: number;
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

export const wallMountedLightPlacementAt = (
  project: Project,
  x: number,
  z: number,
  heightM: number,
  floor: number = project.activeFloor ?? 1
): WallMountedPlacement | null => {
  const walls = project.walls.filter((wall) => (wall.floor ?? 1) === floor);
  let best: { wall: WallSegment; ratio: number; dist: number } | null = null;
  for (const wall of walls) {
    const { ratio, dist } = projectPointOntoWall(x, z, wall);
    if (!best || dist < best.dist) best = { wall, ratio, dist };
  }
  return best ? wallMountedLightPlacementOnWall(project, best.wall.id, best.ratio, heightM) : null;
};
