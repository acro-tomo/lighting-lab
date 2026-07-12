import type { Project, Selection, Vec2M, VoidSide } from "../../types";
import { visibleVoidSides } from "../../utils/fixtureMounting";
import { voidSideLine } from "./geometry";

// 吹き抜けの描画。openSides を除いた辺を内周壁として描き、選択中は開放辺も点線で示す。
export const VoidPlanItem = ({
  voidArea,
  planSize,
  worldToSvg,
  selected,
  onSelect,
  onDragStart,
  onResize,
  svgToWorld,
  canDrag
}: {
  voidArea: Project["voids"][number];
  planSize: { pxPerM: number };
  worldToSvg: (point: Vec2M) => { x: number; y: number };
  selected: boolean;
  onSelect: (selection: Selection) => void;
  onDragStart: (offset: Vec2M) => void;
  onResize: () => void;
  svgToWorld: (clientX: number, clientY: number) => Vec2M;
  canDrag: boolean;
}) => {
  const topLeft = worldToSvg({
    x: voidArea.center.x - voidArea.size.x / 2,
    z: voidArea.center.z - voidArea.size.z / 2
  });
  const sides = visibleVoidSides(voidArea);
  const openSides = (["north", "south", "west", "east"] as VoidSide[]).filter((side) => !sides.includes(side));

  const handlePointerDown = (event: React.PointerEvent<SVGGElement>) => {
    event.stopPropagation();
    onSelect({ kind: "void", id: voidArea.id });
    if (!canDrag || !selected || (event.pointerType === "touch" && !event.isPrimary)) return;
    const point = svgToWorld(event.clientX, event.clientY);
    onDragStart({
      x: point.x - voidArea.center.x,
      z: point.z - voidArea.center.z
    });
  };

  return (
    <g onPointerDown={handlePointerDown} onDoubleClick={(event) => { event.stopPropagation(); onResize(); }}>
      <rect
        x={topLeft.x}
        y={topLeft.y}
        width={voidArea.size.x * planSize.pxPerM}
        height={voidArea.size.z * planSize.pxPerM}
        className="plan-void-fill"
        stroke="none"
      />
      {sides.map((side) => {
        const line = voidSideLine(voidArea, side);
        const s = worldToSvg(line.start);
        const e = worldToSvg(line.end);
        return (
          <line
            key={side}
            x1={s.x}
            y1={s.y}
            x2={e.x}
            y2={e.y}
            className={selected ? "plan-void-wall is-selected" : "plan-void-wall"}
          />
        );
      })}
      {selected && openSides.map((side) => {
        const line = voidSideLine(voidArea, side);
        const s = worldToSvg(line.start);
        const e = worldToSvg(line.end);
        return (
          <line
            key={`open-${side}`}
            x1={s.x}
            y1={s.y}
            x2={e.x}
            y2={e.y}
            className="plan-void-wall is-open"
          />
        );
      })}
      <text x={topLeft.x + 12} y={topLeft.y + 24} className="plan-label">
        {voidArea.name}
      </text>
    </g>
  );
};

// 下がり天井ゾーンの描画（矩形＋名前/下げ量ラベル）。
export const CeilingZonePlanItem = ({
  zone,
  planSize,
  worldToSvg,
  selected,
  onSelect,
  onDragStart,
  onResize,
  svgToWorld,
  canDrag
}: {
  zone: NonNullable<Project["ceilingZones"]>[number];
  planSize: { pxPerM: number };
  worldToSvg: (point: Vec2M) => { x: number; y: number };
  selected: boolean;
  onSelect: (selection: Selection) => void;
  onDragStart: (offset: Vec2M) => void;
  onResize: () => void;
  svgToWorld: (clientX: number, clientY: number) => Vec2M;
  canDrag: boolean;
}) => {
  const topLeft = worldToSvg({
    x: zone.center.x - zone.size.x / 2,
    z: zone.center.z - zone.size.z / 2
  });

  const handlePointerDown = (event: React.PointerEvent<SVGGElement>) => {
    event.stopPropagation();
    onSelect({ kind: "ceilingZone", id: zone.id });
    if (!canDrag || !selected || (event.pointerType === "touch" && !event.isPrimary)) return;
    const point = svgToWorld(event.clientX, event.clientY);
    onDragStart({ x: point.x - zone.center.x, z: point.z - zone.center.z });
  };

  return (
    <g onPointerDown={handlePointerDown} onDoubleClick={(event) => { event.stopPropagation(); onResize(); }}>
      <rect
        x={topLeft.x}
        y={topLeft.y}
        width={zone.size.x * planSize.pxPerM}
        height={zone.size.z * planSize.pxPerM}
        className={selected ? "plan-ceiling is-selected" : "plan-ceiling"}
      />
      <text x={topLeft.x + 12} y={topLeft.y + 24} className="plan-label">
        {zone.name}（▼{Math.round(zone.dropM * 1000)}）
      </text>
    </g>
  );
};

// 下がり床(ピット)ゾーンの描画（矩形＋名前/下げ量ラベル）。
export const FloorZonePlanItem = ({
  zone,
  planSize,
  worldToSvg,
  selected,
  onSelect,
  onDragStart,
  onResize,
  svgToWorld,
  canDrag
}: {
  zone: NonNullable<Project["floorZones"]>[number];
  planSize: { pxPerM: number };
  worldToSvg: (point: Vec2M) => { x: number; y: number };
  selected: boolean;
  onSelect: (selection: Selection) => void;
  onDragStart: (offset: Vec2M) => void;
  onResize: () => void;
  svgToWorld: (clientX: number, clientY: number) => Vec2M;
  canDrag: boolean;
}) => {
  const topLeft = worldToSvg({
    x: zone.center.x - zone.size.x / 2,
    z: zone.center.z - zone.size.z / 2
  });

  const handlePointerDown = (event: React.PointerEvent<SVGGElement>) => {
    event.stopPropagation();
    onSelect({ kind: "floorZone", id: zone.id });
    if (!canDrag || !selected || (event.pointerType === "touch" && !event.isPrimary)) return;
    const point = svgToWorld(event.clientX, event.clientY);
    onDragStart({ x: point.x - zone.center.x, z: point.z - zone.center.z });
  };

  return (
    <g onPointerDown={handlePointerDown} onDoubleClick={(event) => { event.stopPropagation(); onResize(); }}>
      <rect
        x={topLeft.x}
        y={topLeft.y}
        width={zone.size.x * planSize.pxPerM}
        height={zone.size.z * planSize.pxPerM}
        className={selected ? "plan-floor is-selected" : "plan-floor"}
      />
      <text x={topLeft.x + 12} y={topLeft.y + 24} className="plan-label">
        {zone.name}（▽{Math.round(zone.dropM * 1000)}）
      </text>
    </g>
  );
};
