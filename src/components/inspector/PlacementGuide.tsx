import type { Project, WallSegment } from "../../types";
import { clamp } from "../../utils/units";

type PlacementSubject = {
  id: string;
  name: string;
  kindLabel: string;
  position: { x: number; z: number };
  floor?: number;
};

type AlignmentReference = {
  id: string;
  label: string;
  position: { x: number; z: number };
  floor?: number;
};

const formatMm = (meters: number) => `${Math.round(Math.abs(meters) * 1000).toLocaleString("ja-JP")}mm`;

const formatSignedDistance = (meters: number, positiveLabel: string, negativeLabel: string) => {
  if (Math.abs(meters) < 0.01) return "中心";
  return `${formatMm(meters)} ${meters > 0 ? positiveLabel : negativeLabel}`;
};

const projectPointToWall = (position: { x: number; z: number }, wall: WallSegment) => {
  const dx = wall.end.x - wall.start.x;
  const dz = wall.end.z - wall.start.z;
  const len2 = dx * dx + dz * dz;
  const rawRatio = len2 > 1e-9 ? ((position.x - wall.start.x) * dx + (position.z - wall.start.z) * dz) / len2 : 0;
  const ratio = clamp(rawRatio, 0, 1);
  const x = wall.start.x + dx * ratio;
  const z = wall.start.z + dz * ratio;
  return {
    ratio,
    distanceM: Math.hypot(position.x - x, position.z - z),
    wallLengthM: Math.hypot(dx, dz)
  };
};

const nearestWallRelation = (subject: PlacementSubject, walls: WallSegment[]) => {
  const sameFloorWalls = walls.filter((wall) => (wall.floor ?? 1) === (subject.floor ?? 1));
  return sameFloorWalls
    .map((wall) => ({ wall, relation: projectPointToWall(subject.position, wall) }))
    .sort((a, b) => a.relation.distanceM - b.relation.distanceM)[0];
};

const closestAxisReference = (
  subject: PlacementSubject,
  references: AlignmentReference[],
  axis: "x" | "z"
) => {
  const sameFloorReferences = references.filter(
    (ref) => ref.id !== subject.id && (ref.floor ?? 1) === (subject.floor ?? 1)
  );
  return sameFloorReferences
    .map((ref) => ({ ref, deltaM: Math.abs(ref.position[axis] - subject.position[axis]) }))
    .sort((a, b) => a.deltaM - b.deltaM)[0];
};

const lineLabel = (match: ReturnType<typeof closestAxisReference> | undefined) => {
  if (!match) return "比較対象なし";
  if (match.deltaM < 0.015) return `${match.ref.label} と一致`;
  if (match.deltaM <= 0.15) return `${match.ref.label} まで ${formatMm(match.deltaM)}`;
  return `近い基準なし（最寄り ${match.ref.label} まで ${formatMm(match.deltaM)}）`;
};

export const PlacementGuide = ({ project, subject }: { project: Project; subject: PlacementSubject }) => {
  const wallRelation = nearestWallRelation(subject, project.walls);
  const references: AlignmentReference[] = [
    ...project.lights.map((light) => ({
      id: light.id,
      label: light.name,
      position: light.position,
      floor: light.floor
    })),
    ...project.furniture.map((item) => ({
      id: item.id,
      label: item.name,
      position: item.position,
      floor: item.floor
    })),
    ...project.walls.map((wall) => ({
      id: `${wall.id}:center`,
      label: `${wall.name} 中心`,
      position: {
        x: (wall.start.x + wall.end.x) / 2,
        z: (wall.start.z + wall.end.z) / 2
      },
      floor: wall.floor
    }))
  ];
  const xMatch = closestAxisReference(subject, references, "x");
  const zMatch = closestAxisReference(subject, references, "z");

  return (
    <section className="placement-guide" aria-label={`${subject.kindLabel}の配置の目安`}>
      <div className="placement-guide-heading">
        <span>配置の目安</span>
        <em>2D/3D共通</em>
      </div>
      <dl className="placement-guide-list">
        <div>
          <dt>基準壁</dt>
          <dd>{wallRelation ? wallRelation.wall.name : "壁なし"}</dd>
        </div>
        <div>
          <dt>壁中心</dt>
          <dd>
            {wallRelation
              ? formatSignedDistance(
                  (wallRelation.relation.ratio - 0.5) * wallRelation.relation.wallLengthM,
                  "終点側",
                  "始点側"
                )
              : "未計算"}
          </dd>
        </div>
        <div>
          <dt>壁線から</dt>
          <dd>{wallRelation ? formatMm(wallRelation.relation.distanceM) : "未計算"}</dd>
        </div>
        <div>
          <dt>横ライン</dt>
          <dd>{lineLabel(xMatch)}</dd>
        </div>
        <div>
          <dt>奥行ライン</dt>
          <dd>{lineLabel(zMatch)}</dd>
        </div>
      </dl>
    </section>
  );
};
