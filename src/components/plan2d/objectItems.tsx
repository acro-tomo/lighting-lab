import { useRef } from "react";
import type { FurnitureItem, LightFixture, Project, Selection, Vec2M } from "../../types";
import { useI18n } from "../../i18n";
import { TOUCH_TAP_MAX_MOVE_PX } from "./constants";
import type { ResizeEdge, ResizeKind } from "./types";

// 家具の描画（回転付き矩形/円＋名前ラベル）。薄い家具用の最低ヒット領域つき。
export const FurniturePlanItem = ({
  item,
  planSize,
  worldToSvg,
  selected,
  onSelect,
  onDragStart,
  onResize,
  svgToWorld,
  canDrag
}: {
  item: FurnitureItem;
  planSize: { pxPerM: number };
  worldToSvg: (point: Vec2M) => { x: number; y: number };
  selected: boolean;
  onSelect: (selection: Selection) => void;
  onDragStart: (offset: Vec2M) => void;
  onResize: () => void;
  svgToWorld: (clientX: number, clientY: number) => Vec2M;
  canDrag: boolean;
}) => {
  const { t } = useI18n();
  const center = worldToSvg({ x: item.position.x, z: item.position.z });
  const width = item.size.x * planSize.pxPerM;
  const depth = item.size.z * planSize.pxPerM;
  // テレビ等の薄い家具(奥行数cm)は表示が細く、隣接する壁の太いヒット線にクリックを
  // 奪われて選べない。最低限の透明ヒット領域を敷いて確実に掴めるようにする。
  const hitW = Math.max(width, 18);
  const hitD = Math.max(depth, 18);

  const handlePointerDown = (event: React.PointerEvent<SVGGElement>) => {
    event.stopPropagation();
    onSelect({ kind: "furniture", id: item.id });
    if (!canDrag || !selected || (event.pointerType === "touch" && !event.isPrimary)) return;
    const point = svgToWorld(event.clientX, event.clientY);
    onDragStart({
      x: point.x - item.position.x,
      z: point.z - item.position.z
    });
  };

  return (
    <g
      transform={`translate(${center.x} ${center.y}) rotate(${item.rotationYDeg})`}
      onPointerDown={handlePointerDown}
      onDoubleClick={(event) => { event.stopPropagation(); onResize(); }}
      className={selected ? "plan-furniture is-selected" : "plan-furniture"}
    >
      <rect x={-hitW / 2} y={-hitD / 2} width={hitW} height={hitD} fill="transparent" stroke="none" />
      {item.type === "roundTable" ? (
        <circle r={width / 2} />
      ) : (
        <rect x={-width / 2} y={-depth / 2} width={width} height={depth} rx="8" />
      )}
      <text x={-width / 2 + 6} y={-depth / 2 - 8} className="plan-label">
        {t(item.name)}
      </text>
    </g>
  );
};

// 照明の描画（円＋照射ターゲット線＋名前ラベル）。クリック選択/Shift複数選択/
// 選択中クリックで解除（ドラッグ移動と区別するためタップ距離で判定）。
export const LightPlanItem = ({
  fixture,
  worldToSvg,
  selected,
  togglesOffOnClick,
  onSelectLight,
  onClearSelection,
  onDragStart,
  svgToWorld,
  canDrag
}: {
  fixture: LightFixture;
  worldToSvg: (point: Vec2M) => { x: number; y: number };
  selected: boolean;
  togglesOffOnClick: boolean;
  onSelectLight: (id: string, shiftKey: boolean) => void;
  onClearSelection: () => void;
  onDragStart: (offset: Vec2M) => void;
  svgToWorld: (clientX: number, clientY: number) => Vec2M;
  canDrag: boolean;
}) => {
  const { t } = useI18n();
  const center = worldToSvg({ x: fixture.position.x, z: fixture.position.z });
  const target = fixture.target ? worldToSvg({ x: fixture.target.x, z: fixture.target.z }) : null;
  const radius = fixture.type === "downlight" ? (selected ? 6 : 4) : (selected ? 11 : 8);
  const pressRef = useRef<{ pointerId: number; clientX: number; clientY: number; togglesOff: boolean } | null>(null);
  const handlePointerDown = (event: React.PointerEvent<SVGGElement>) => {
    event.stopPropagation();
    onSelectLight(fixture.id, event.shiftKey);
    // Shift+クリックは複数選択トグルのみ。ドラッグは開始しない。
    if (event.shiftKey || !canDrag || !selected || (event.pointerType === "touch" && !event.isPrimary)) return;
    pressRef.current = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      togglesOff: togglesOffOnClick
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = svgToWorld(event.clientX, event.clientY);
    onDragStart({
      x: point.x - fixture.position.x,
      z: point.z - fixture.position.z
    });
  };
  const handlePointerMove = (event: React.PointerEvent<SVGGElement>) => {
    const press = pressRef.current;
    if (!press || press.pointerId !== event.pointerId) return;
    if (Math.hypot(event.clientX - press.clientX, event.clientY - press.clientY) > TOUCH_TAP_MAX_MOVE_PX) {
      pressRef.current = { ...press, togglesOff: false };
    }
  };
  const handlePointerEnd = (event: React.PointerEvent<SVGGElement>) => {
    const press = pressRef.current;
    if (press?.pointerId === event.pointerId) {
      if (press.togglesOff) onClearSelection();
      pressRef.current = null;
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return (
    <g
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      className={selected ? "plan-light is-selected" : "plan-light"}
    >
      {target && <line x1={center.x} y1={center.y} x2={target.x} y2={target.y} className="plan-aim-line" />}
      <circle cx={center.x} cy={center.y} r={radius} />
      <text x={center.x + radius + 5} y={center.y - radius - 2} className="plan-label">
        {t(fixture.name)}
      </text>
    </g>
  );
};

// 辺リサイズハンドル。対象矩形の4辺中点に丸ハンドルを置き、ドラッグでその辺を動かす。
export const ResizeHandles = ({
  target,
  project,
  worldToSvg,
  onEdgePointerDown
}: {
  target: { kind: ResizeKind; id: string };
  project: Project;
  worldToSvg: (point: Vec2M) => { x: number; y: number };
  onEdgePointerDown: (edge: ResizeEdge) => void;
}) => {
  let center: Vec2M;
  let size: { x: number; z: number };
  let rotationDeg = 0;
  if (target.kind === "furniture") {
    const item = project.furniture.find((candidate) => candidate.id === target.id);
    if (!item) return null;
    center = { x: item.position.x, z: item.position.z };
    size = { x: item.size.x, z: item.size.z };
    rotationDeg = item.rotationYDeg;
  } else if (target.kind === "void") {
    const voidArea = project.voids.find((candidate) => candidate.id === target.id);
    if (!voidArea) return null;
    center = voidArea.center;
    size = voidArea.size;
  } else if (target.kind === "ceilingZone") {
    const zone = (project.ceilingZones ?? []).find((candidate) => candidate.id === target.id);
    if (!zone) return null;
    center = zone.center;
    size = zone.size;
  } else {
    const zone = (project.floorZones ?? []).find((candidate) => candidate.id === target.id);
    if (!zone) return null;
    center = zone.center;
    size = zone.size;
  }

  const th = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(th);
  const sin = Math.sin(th);
  const halfX = size.x / 2;
  const halfZ = size.z / 2;
  const toSvg = (lx: number, lz: number) =>
    worldToSvg({ x: center.x + lx * cos - lz * sin, z: center.z + lx * sin + lz * cos });

  const handles: { edge: ResizeEdge; p: { x: number; y: number }; cursor: string }[] = [
    { edge: "right", p: toSvg(halfX, 0), cursor: "ew-resize" },
    { edge: "left", p: toSvg(-halfX, 0), cursor: "ew-resize" },
    { edge: "bottom", p: toSvg(0, halfZ), cursor: "ns-resize" },
    { edge: "top", p: toSvg(0, -halfZ), cursor: "ns-resize" },
    // 角ハンドル: ドラッグでアスペクト比を保ったまま等倍リサイズ。
    { edge: "topLeft", p: toSvg(-halfX, -halfZ), cursor: "nwse-resize" },
    { edge: "topRight", p: toSvg(halfX, -halfZ), cursor: "nesw-resize" },
    { edge: "bottomLeft", p: toSvg(-halfX, halfZ), cursor: "nesw-resize" },
    { edge: "bottomRight", p: toSvg(halfX, halfZ), cursor: "nwse-resize" }
  ];

  return (
    <g style={{ pointerEvents: "auto" }}>
      {handles.map((handle) => (
        <circle
          key={handle.edge}
          cx={handle.p.x}
          cy={handle.p.y}
          r={7}
          className="plan-resize-handle"
          style={{ cursor: handle.cursor }}
          onPointerDown={(event) => {
            event.stopPropagation();
            onEdgePointerDown(handle.edge);
          }}
        />
      ))}
    </g>
  );
};
