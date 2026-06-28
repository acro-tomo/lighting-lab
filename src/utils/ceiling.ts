import type { Project, Vec2M } from "../types";

export const ceilingMountHeightAt = (project: Project, point: Vec2M): number => {
  let drop = 0;
  for (const zone of project.ceilingZones ?? []) {
    const inX = Math.abs(point.x - zone.center.x) <= zone.size.x / 2;
    const inZ = Math.abs(point.z - zone.center.z) <= zone.size.z / 2;
    if (inX && inZ) drop = Math.max(drop, zone.dropM);
  }
  return project.room.ceilingHeightM - drop;
};
