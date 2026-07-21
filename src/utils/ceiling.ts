import type { FloorTag, Project, Vec2M, VoidArea } from "../types";

// 吹き抜け上部の見かけの天井高さ。Scene3D の吹き抜け表示(RoomShell)と同じ式で揃える
// （2階の壁がもっと高ければそれに合わせ、無ければ通常天井+1.4mを二層分の目安にする）。
// voidAtFootprint と同様、壁は所属階でフィルタする（他階の壁高さを混ぜない）。
export const voidCeilingHeightAt = (project: Project, floor: FloorTag): number => {
  const wallMaxHeight = project.walls.reduce(
    (max, wall) => ((wall.floor ?? 1) === floor ? Math.max(max, wall.heightM) : max),
    project.room.ceilingHeightM
  );
  return wallMaxHeight > project.room.ceilingHeightM + 0.05 ? wallMaxHeight : project.room.ceilingHeightM + 1.4;
};

// 個々の吹き抜けの上端高さ。voidArea.heightM が設定されていればそちらを優先し、
// 無ければ同じ階で共有される自動計算値(voidCeilingHeightAt)にフォールバックする。
export const voidTopHeightM = (project: Project, voidArea: VoidArea): number =>
  voidArea.heightM !== undefined
    ? project.room.ceilingHeightM + voidArea.heightM
    : voidCeilingHeightAt(project, voidArea.floor ?? 1);

// 点(x,z)がいずれかの吹き抜けの水平フットプリント内にあれば、そのVoidAreaを返す（同じ階のみ）。
const voidAtFootprint = (project: Project, point: Vec2M, floor: FloorTag): VoidArea | undefined =>
  (project.voids ?? []).find(
    (voidArea) =>
      (voidArea.floor ?? 1) === floor &&
      Math.abs(point.x - voidArea.center.x) <= voidArea.size.x / 2 &&
      Math.abs(point.z - voidArea.center.z) <= voidArea.size.z / 2
  );

export const ceilingMountHeightAt = (project: Project, point: Vec2M, floor?: FloorTag): number => {
  const activeFloor = floor ?? project.activeFloor ?? 1;
  let drop = 0;
  for (const zone of project.ceilingZones ?? []) {
    if ((zone.floor ?? 1) !== activeFloor) continue;
    const inX = Math.abs(point.x - zone.center.x) <= zone.size.x / 2;
    const inZ = Math.abs(point.z - zone.center.z) <= zone.size.z / 2;
    if (inX && inZ) drop = Math.max(drop, zone.dropM);
  }
  // 吹き抜けの真下は通常天井が無いので、天井付け照明は吹き抜け上部の高さを基準にする
  // （そのままだと届かない天井高さに埋め込まれ、ペンダントも吊り長さ不足で浮いて見える）。
  const matchedVoid = voidAtFootprint(project, point, activeFloor);
  const baseHeight = matchedVoid ? voidTopHeightM(project, matchedVoid) : project.room.ceilingHeightM;
  return baseHeight - drop;
};
