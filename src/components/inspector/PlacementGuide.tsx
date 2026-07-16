import type { Project, WallSegment } from "../../types";
import { clamp } from "../../utils/units";
import { useI18n } from "../../i18n";

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

const formatSignedDistance = (meters: number, positiveLabel: string, negativeLabel: string, centerLabel: string) => {
  if (Math.abs(meters) < 0.01) return centerLabel;
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

const lineLabel = (match: ReturnType<typeof closestAxisReference> | undefined, t: (key: string, values?: Record<string, string | number>) => string) => {
  if (!match) return t("比較対象なし");
  if (match.deltaM < 0.015) return t("{name} と一致", { name: match.ref.label });
  if (match.deltaM <= 0.15) return t("{name} まで {distance}", { name: match.ref.label, distance: formatMm(match.deltaM) });
  return t("近い基準なし（最寄り {name} まで {distance}）", { name: match.ref.label, distance: formatMm(match.deltaM) });
};

export const PlacementGuide = ({
  project,
  subject,
  collapsible = false
}: {
  project: Project;
  subject: PlacementSubject;
  collapsible?: boolean;
}) => {
  const { t } = useI18n();
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
      label: `${wall.name} ${t("中心")}`,
      position: {
        x: (wall.start.x + wall.end.x) / 2,
        z: (wall.start.z + wall.end.z) / 2
      },
      floor: wall.floor
    }))
  ];
  const xMatch = closestAxisReference(subject, references, "x");
  const zMatch = closestAxisReference(subject, references, "z");
  const summary = wallRelation
    ? `${wallRelation.wall.name} ${t("から")} ${formatMm(wallRelation.relation.distanceM)}`
    : t("壁との距離を確認");

  const guideContent = (
    <>
      <div className="placement-guide-heading">
        <span>{t("配置の目安")}</span>
        <em>{t("2D/3D共通")}</em>
      </div>
      <dl className="placement-guide-list">
        <div>
          <dt>{t("基準壁")}</dt>
          <dd>{wallRelation ? wallRelation.wall.name : t("壁なし")}</dd>
        </div>
        <div>
          <dt>{t("壁中心")}</dt>
          <dd>
            {wallRelation
              ? formatSignedDistance(
                  (wallRelation.relation.ratio - 0.5) * wallRelation.relation.wallLengthM,
                  t("終点側"),
                  t("始点側"),
                  t("中心")
                )
              : t("未計算")}
          </dd>
        </div>
        <div>
          <dt>{t("壁線から")}</dt>
          <dd>{wallRelation ? formatMm(wallRelation.relation.distanceM) : t("未計算")}</dd>
        </div>
        <div>
          <dt>{t("横ライン")}</dt>
          <dd>{lineLabel(xMatch, t)}</dd>
        </div>
        <div>
          <dt>{t("奥行ライン")}</dt>
          <dd>{lineLabel(zMatch, t)}</dd>
        </div>
      </dl>
    </>
  );

  if (collapsible) {
    return (
      <details className="placement-guide placement-guide-collapsible">
        <summary>
          <span>{t("設置位置")}</span>
          <em>{summary}</em>
        </summary>
        <div className="placement-guide-expanded">{guideContent}</div>
      </details>
    );
  }

  return (
    <section className="placement-guide" aria-label={`${subject.kindLabel} ${t("配置の目安")}`}>
      {guideContent}
    </section>
  );
};
