import type { WallSegment, WindowOpening } from "../types";

const PARALLEL_DOT_MIN = 0.999;

const floorOf = (item: { floor?: 1 | 2 }) => item.floor ?? 1;

// 取込・トレースでは壁が同位置で重複/分割され得るため、host壁の開口を
// 同一壁面の区間にも投影し、窓枠の背後に未開口壁が残らないようにする。
export const wallOpeningsForWall = (
  wall: WallSegment,
  walls: WallSegment[],
  windows: WindowOpening[]
): WindowOpening[] => {
  const wallDx = wall.end.x - wall.start.x;
  const wallDz = wall.end.z - wall.start.z;
  const wallLengthM = Math.hypot(wallDx, wallDz);
  if (wallLengthM <= 1e-6) return [];
  const wallUx = wallDx / wallLengthM;
  const wallUz = wallDz / wallLengthM;

  return windows.flatMap((windowItem) => {
    if (windowItem.wallId === wall.id) return [windowItem];
    const host = walls.find((candidate) => candidate.id === windowItem.wallId);
    if (!host || floorOf(host) !== floorOf(wall)) return [];

    const hostDx = host.end.x - host.start.x;
    const hostDz = host.end.z - host.start.z;
    const hostLengthM = Math.hypot(hostDx, hostDz);
    if (hostLengthM <= 1e-6) return [];
    const hostUx = hostDx / hostLengthM;
    const hostUz = hostDz / hostLengthM;
    const directionDot = hostUx * wallUx + hostUz * wallUz;
    if (Math.abs(directionDot) < PARALLEL_DOT_MIN) return [];

    const centerX = host.start.x + hostDx * windowItem.centerRatio;
    const centerZ = host.start.z + hostDz * windowItem.centerRatio;
    const fromWallStartX = centerX - wall.start.x;
    const fromWallStartZ = centerZ - wall.start.z;
    const perpendicularDistanceM = Math.abs(fromWallStartX * wallUz - fromWallStartZ * wallUx);
    const sameSurfaceToleranceM = Math.min(0.12, (host.thicknessM + wall.thicknessM) / 4 + 0.02);
    if (perpendicularDistanceM > sameSurfaceToleranceM) return [];

    const centerAlongWallM = fromWallStartX * wallUx + fromWallStartZ * wallUz;
    const projectedWidthM = windowItem.widthM * Math.abs(directionDot);
    const openingStartM = centerAlongWallM - projectedWidthM / 2;
    const openingEndM = centerAlongWallM + projectedWidthM / 2;
    if (openingEndM <= 0.001 || openingStartM >= wallLengthM - 0.001) return [];

    return [
      {
        ...windowItem,
        wallId: wall.id,
        centerRatio: centerAlongWallM / wallLengthM,
        widthM: projectedWidthM
      }
    ];
  });
};
