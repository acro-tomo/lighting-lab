import type { VoidArea, VoidSide, WallSegment, WindowOpening } from "../types";
import { voidWallId } from "./fixtureMounting";

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

export type WallPanelRect = { cx: number; cy: number; w: number; h: number };

const wallPanelsWithHoles = (
  length: number,
  height: number,
  holes: { cx: number; w: number; bottom: number; top: number }[]
): WallPanelRect[] => {
  const halfLength = length / 2;
  const spans = holes
    .map((hole) => ({
      x0: Math.max(0, hole.cx - hole.w / 2),
      x1: Math.min(length, hole.cx + hole.w / 2),
      bottom: Math.max(0, hole.bottom),
      top: Math.min(height, hole.top)
    }))
    .filter((span) => span.x1 - span.x0 > 0.001 && span.top - span.bottom > 0.001)
    .sort((a, b) => a.x0 - b.x0);

  const panels: WallPanelRect[] = [];
  const pushPanel = (left: number, right: number, bottom: number, top: number) => {
    const width = right - left;
    const panelHeight = top - bottom;
    if (width <= 0.001 || panelHeight <= 0.001) return;
    panels.push({
      cx: (left + right) / 2 - halfLength,
      cy: (bottom + top) / 2,
      w: width,
      h: panelHeight
    });
  };

  const xBoundaries = [0, length, ...spans.flatMap((span) => [span.x0, span.x1])]
    .sort((a, b) => a - b)
    .filter((value, index, values) => index === 0 || value - values[index - 1] > 1e-9);

  for (let index = 0; index < xBoundaries.length - 1; index += 1) {
    const left = xBoundaries[index];
    const right = xBoundaries[index + 1];
    const intervals = spans
      .filter((span) => span.x0 < right && span.x1 > left)
      .map((span) => ({ bottom: span.bottom, top: span.top }))
      .sort((a, b) => a.bottom - b.bottom);

    const mergedIntervals: { bottom: number; top: number }[] = [];
    intervals.forEach((interval) => {
      const previous = mergedIntervals.at(-1);
      if (previous && interval.bottom <= previous.top + 0.001) {
        previous.top = Math.max(previous.top, interval.top);
      } else {
        mergedIntervals.push({ ...interval });
      }
    });

    let bottom = 0;
    mergedIntervals.forEach((interval) => {
      pushPanel(left, right, bottom, interval.bottom);
      bottom = Math.max(bottom, interval.top);
    });
    pushPanel(left, right, bottom, height);
  }
  return panels;
};

const voidSideWallSegment = (voidArea: VoidArea, side: VoidSide, heightM: number): WallSegment => {
  const minX = voidArea.center.x - voidArea.size.x / 2;
  const maxX = voidArea.center.x + voidArea.size.x / 2;
  const minZ = voidArea.center.z - voidArea.size.z / 2;
  const maxZ = voidArea.center.z + voidArea.size.z / 2;
  const alongX = side === "north" || side === "south";
  const fixedX = side === "west" ? minX : maxX;
  const fixedZ = side === "north" ? minZ : maxZ;
  return {
    id: voidWallId(voidArea.id, side),
    name: voidArea.name,
    start: alongX ? { x: minX, z: fixedZ } : { x: fixedX, z: minZ },
    end: alongX ? { x: maxX, z: fixedZ } : { x: fixedX, z: maxZ },
    thicknessM: 0.04,
    heightM,
    materialId: "",
    floor: voidArea.floor
  };
};

export const voidWallPanelsWithOpenings = (
  voidArea: VoidArea,
  side: VoidSide,
  lowerY: number,
  upperY: number,
  walls: WallSegment[],
  windows: WindowOpening[]
): WallPanelRect[] => {
  const height = upperY - lowerY;
  const length = side === "north" || side === "south" ? voidArea.size.x : voidArea.size.z;
  const wall = voidSideWallSegment(voidArea, side, upperY);
  const holes = wallOpeningsForWall(wall, walls, windows).map((windowItem) => ({
    cx: windowItem.centerRatio * length,
    w: windowItem.widthM,
    bottom: windowItem.sillHeightM - lowerY,
    top: windowItem.sillHeightM + windowItem.heightM - lowerY
  }));
  return wallPanelsWithHoles(length, height, holes);
};
