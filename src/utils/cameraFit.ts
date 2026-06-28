import type { Project, ProjectCamera } from "../types";

const CAMERA_EPSILON = 0.001;

const approx = (a: number, b: number) => Math.abs(a - b) <= CAMERA_EPSILON;

export const isDefaultCameraPose = (camera: ProjectCamera): boolean =>
  approx(camera.position.x, 1.8) &&
  approx(camera.position.y, 2.35) &&
  approx(camera.position.z, 3.05) &&
  approx(camera.target.x, -0.35) &&
  approx(camera.target.y, 0.72) &&
  approx(camera.target.z, -0.35) &&
  approx(camera.fov, 64);

const wallBounds = (project: Project) => {
  if (project.walls.length === 0) return null;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const wall of project.walls) {
    minX = Math.min(minX, wall.start.x, wall.end.x);
    maxX = Math.max(maxX, wall.start.x, wall.end.x);
    minZ = Math.min(minZ, wall.start.z, wall.end.z);
    maxZ = Math.max(maxZ, wall.start.z, wall.end.z);
  }
  return {
    centerX: (minX + maxX) / 2,
    centerZ: (minZ + maxZ) / 2,
    sizeX: Math.max(0.5, maxX - minX),
    sizeZ: Math.max(0.5, maxZ - minZ)
  };
};

const pointToWallDistance = (x: number, z: number, project: Project) => {
  let best = Infinity;
  for (const wall of project.walls) {
    const dx = wall.end.x - wall.start.x;
    const dz = wall.end.z - wall.start.z;
    const len2 = dx * dx + dz * dz;
    const ratio = len2 > 1e-9 ? ((x - wall.start.x) * dx + (z - wall.start.z) * dz) / len2 : 0;
    const t = Math.max(0, Math.min(1, ratio));
    best = Math.min(best, Math.hypot(x - (wall.start.x + dx * t), z - (wall.start.z + dz * t)));
  }
  return best;
};

const pickInteriorCameraPoint = (project: Project, centerX: number, centerZ: number, span: number) => {
  const radius = span * 0.25;
  let best = { x: centerX + radius, z: centerZ, score: -Infinity };
  for (let deg = 0; deg < 360; deg += 30) {
    const angle = (deg * Math.PI) / 180;
    const x = centerX + Math.cos(angle) * radius;
    const z = centerZ + Math.sin(angle) * radius;
    const score = pointToWallDistance(x, z, project);
    if (score > best.score) best = { x, z, score };
  }
  return best;
};

export const shouldFitDefaultCamera = (project: Project, camera: ProjectCamera): boolean => {
  if (!isDefaultCameraPose(camera)) return false;
  const bounds = wallBounds(project);
  if (!bounds) return false;
  const centeredEnough =
    Math.abs(bounds.centerX) <= project.room.widthM * 0.12 &&
    Math.abs(bounds.centerZ) <= project.room.depthM * 0.12;
  const sizedLikeRoom =
    bounds.sizeX <= project.room.widthM * 1.12 &&
    bounds.sizeZ <= project.room.depthM * 1.12;
  return !(centeredEnough && sizedLikeRoom);
};

export const fitCameraToProject = (project: Project, camera: ProjectCamera): ProjectCamera => {
  const bounds = wallBounds(project);
  if (!bounds) return camera;
  const span = Math.max(bounds.sizeX, bounds.sizeZ, project.room.ceilingHeightM * 2);
  const position = pickInteriorCameraPoint(project, bounds.centerX, bounds.centerZ, span);
  return {
    ...camera,
    position: {
      x: position.x,
      y: Math.min(project.room.ceilingHeightM - 0.18, Math.max(1.45, project.room.ceilingHeightM * 0.76)),
      z: position.z
    },
    target: {
      x: bounds.centerX,
      y: Math.min(project.room.ceilingHeightM * 0.58, Math.max(0.8, project.room.ceilingHeightM * 0.42)),
      z: bounds.centerZ
    }
  };
};
