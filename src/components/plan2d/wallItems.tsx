import type { Selection, Vec2M, WallSegment, WindowOpening } from "../../types";
import type { EditMode } from "../EditToolbar";
import { distance, svgSideNormal } from "./geometry";

// 壁の描画（活性階の全壁）。実寸厚み＋種別(腰壁/手すり)の見た目分け、innerSideオフセット、
// 透明の太いヒット線による選択/ドラッグ開始。
export const RoomOutline = ({
  walls,
  selection,
  worldToSvg,
  pxPerM,
  onSelect,
  canEditWalls,
  mode,
  onWallDragStart
}: {
  walls: WallSegment[];
  selection: Selection;
  worldToSvg: (point: Vec2M) => { x: number; y: number };
  pxPerM: number;
  onSelect: (selection: Selection) => void;
  canEditWalls: boolean;
  mode: EditMode;
  onWallDragStart: (wall: WallSegment, event: React.PointerEvent<SVGLineElement>) => void;
}) => {
  // 壁作成モード中は既存壁の本体をヒット対象にしない。ここを掴めてしまうと
  // 多角形を閉じるための端点タップより壁の選択/ドラッグが先に発火してしまう(要望)。
  const wallHitEnabled = canEditWalls && mode !== "wall";
  return (
    <>
      {walls.map((wall) => {
        const start = worldToSvg(wall.start);
        const end = worldToSvg(wall.end);
        const selected = canEditWalls && selection?.kind === "wall" && selection.id === wall.id;
        // 実寸の厚み(thicknessM)を worldToSvg と同じ pxPerM スケールで描く。
        // 視認用に最小 2px は確保。透明ヒット線もこの実寸 displayWidth から導出する。
        const displayWidth = Math.max(2, wall.thicknessM * pxPerM);
        // 壁の種別で見た目だけ変える（当たり判定/座標は不変）。undefined は "wall"。
        // half(腰壁): 控えめに細め＋やや明るい。railing(手すり): 細い破線で「抜け」を表現。
        const kind = wall.kind ?? "wall";
        const drawWidth =
          kind === "railing"
            ? Math.max(1.5, Math.min(3, displayWidth * 0.4))
            : kind === "half"
              ? Math.max(2, displayWidth * 0.6)
              : displayWidth;
        const dash =
          kind === "railing"
            ? `${drawWidth * 2} ${drawWidth * 1.5}`
            : kind === "half"
              ? `${drawWidth * 3} ${drawWidth * 2}`
              : undefined;
        const kindOpacity = kind === "railing" ? 0.85 : kind === "half" ? 0.7 : undefined;
        // innerSide 指定時は厚みを内側の面が芯線に乗るよう外側へ寄せる。中心線を
        // 外側(=innerSideの反対)へ displayWidth/2 平行移動して描く。
        // undefined は従来どおり中心対称（オフセット0）。後方互換。
        let off = { x: 0, y: 0 };
        if (wall.innerSide) {
          const outer = svgSideNormal(start, end, wall.innerSide === "left" ? "right" : "left");
          off = { x: outer.x * (displayWidth / 2), y: outer.y * (displayWidth / 2) };
        }
        const ds = { x: start.x + off.x, y: start.y + off.y };
        const de = { x: end.x + off.x, y: end.y + off.y };
        return (
          <g key={wall.id}>
            {/* 表示用の線とは別に透明で太いヒット線を重ね、壁を選択しやすくする（要望9）。
                表示の太さは displayWidth のまま変えない。 */}
            <line
              x1={ds.x}
              y1={ds.y}
              x2={de.x}
              y2={de.y}
              stroke="transparent"
              strokeWidth={Math.max(24, displayWidth + 16)}
              strokeLinecap="round"
              style={{ cursor: wallHitEnabled ? "grab" : "default", pointerEvents: wallHitEnabled ? "auto" : "none" }}
              onPointerDown={(event) => {
                onSelect({ kind: "wall", id: wall.id });
                onWallDragStart(wall, event);
              }}
            />
            <line
              x1={ds.x}
              y1={ds.y}
              x2={de.x}
              y2={de.y}
              className={selected ? "plan-wall is-selected" : "plan-wall"}
              strokeWidth={drawWidth}
              strokeDasharray={dash}
              strokeOpacity={kindOpacity}
              style={{ pointerEvents: "none" }}
            />
          </g>
        );
      })}
    </>
  );
};

// 窓/扉/開口の描画。属する壁の線分上に centerRatio±幅/2 の区間として描く。
export const OpeningPlanItem = ({
  windowItem,
  walls,
  selection,
  worldToSvg,
  onSelect,
  canDrag,
  onDragStart
}: {
  windowItem: WindowOpening;
  walls: WallSegment[];
  selection: Selection;
  worldToSvg: (point: Vec2M) => { x: number; y: number };
  onSelect: (selection: Selection) => void;
  canDrag: boolean;
  onDragStart: () => void;
}) => {
  const wall = walls.find((item) => item.id === windowItem.wallId);
  if (!wall) return null;
  const ratioA = Math.max(0, windowItem.centerRatio - windowItem.widthM / Math.max(0.1, distance(wall.start, wall.end)) / 2);
  const ratioB = Math.min(1, windowItem.centerRatio + windowItem.widthM / Math.max(0.1, distance(wall.start, wall.end)) / 2);
  const start = worldToSvg({
    x: wall.start.x + (wall.end.x - wall.start.x) * ratioA,
    z: wall.start.z + (wall.end.z - wall.start.z) * ratioA
  });
  const end = worldToSvg({
    x: wall.start.x + (wall.end.x - wall.start.x) * ratioB,
    z: wall.start.z + (wall.end.z - wall.start.z) * ratioB
  });
  const kind = windowItem.hasGlass ? "window" : "opening";
  const selected = selection?.kind === kind && selection.id === windowItem.id;

  return (
    <g
      style={{ cursor: canDrag && selected ? "grab" : "pointer" }}
      onPointerDown={(event) => {
        event.stopPropagation();
        onSelect({ kind, id: windowItem.id });
        if (canDrag && selected && !(event.pointerType === "touch" && !event.isPrimary)) onDragStart();
      }}
    >
      {/* 透明の太いヒット線で掴みやすくする（表示線は細いまま）。 */}
      <line x1={start.x} y1={start.y} x2={end.x} y2={end.y} stroke="transparent" strokeWidth={18} strokeLinecap="round" />
      <line
        x1={start.x}
        y1={start.y}
        x2={end.x}
        y2={end.y}
        className={selected ? `plan-opening ${kind} is-selected` : `plan-opening ${kind}`}
        style={{ pointerEvents: "none" }}
      />
    </g>
  );
};
