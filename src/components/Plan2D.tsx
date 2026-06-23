import { useMemo, useRef, useState } from "react";
import type {
  FurnitureItem,
  LightFixture,
  Project,
  Selection,
  Vec2M,
  WallSegment,
  WindowOpening
} from "../types";
import { useProjectStore } from "../store/projectStore";

type Plan2DProps = {
  project: Project;
  selection: Selection;
  onSelect: (selection: Selection) => void;
};

type ToolLabel =
  | "選択"
  | "パン"
  | "縮尺"
  | "壁"
  | "窓"
  | "開口"
  | "家具"
  | "照明"
  | "吹抜"
  | "削除";

type DragState =
  | { kind: "furniture"; id: string; offset: Vec2M }
  | { kind: "light"; id: string; offset: Vec2M }
  | { kind: "void"; id: string; offset: Vec2M }
  | { kind: "pan"; clientStart: { x: number; y: number }; panStart: { x: number; y: number } }
  | null;

type DrawingState =
  | { kind: "wall"; start: Vec2M }
  | { kind: "void"; start: Vec2M }
  | { kind: "scale"; startWorld: Vec2M; startSvg: { x: number; y: number } }
  | null;

const TOOL_LABELS: ToolLabel[] = ["選択", "パン", "縮尺", "壁", "窓", "開口", "家具", "照明", "吹抜", "削除"];

const id = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

const distance = (a: Vec2M, b: Vec2M) => Math.hypot(a.x - b.x, a.z - b.z);

const snap = (value: number, grid = 0.1) => Math.round(value / grid) * grid;

const snapPoint = (point: Vec2M): Vec2M => ({ x: snap(point.x), z: snap(point.z) });

const snapWallEnd = (start: Vec2M, point: Vec2M, angleSnap: boolean): Vec2M => {
  const snapped = snapPoint(point);
  const dx = snapped.x - start.x;
  const dz = snapped.z - start.z;
  if (Math.abs(dx) < 0.16) return { x: start.x, z: snapped.z };
  if (Math.abs(dz) < 0.16) return { x: snapped.x, z: start.z };
  if (!angleSnap) return snapped;

  const length = Math.hypot(dx, dz);
  const step = Math.PI / 12;
  const angle = Math.round(Math.atan2(dz, dx) / step) * step;
  return {
    x: snap(start.x + Math.cos(angle) * length),
    z: snap(start.z + Math.sin(angle) * length)
  };
};

const projectedWallRatio = (wall: WallSegment, point: Vec2M) => {
  const ax = wall.start.x;
  const az = wall.start.z;
  const bx = wall.end.x;
  const bz = wall.end.z;
  const dx = bx - ax;
  const dz = bz - az;
  const lengthSq = dx * dx + dz * dz;
  if (lengthSq === 0) return { ratio: 0, distanceM: Infinity };
  const ratio = Math.max(0, Math.min(1, ((point.x - ax) * dx + (point.z - az) * dz) / lengthSq));
  const projected = { x: ax + dx * ratio, z: az + dz * ratio };
  return { ratio, distanceM: distance(projected, point) };
};

export const Plan2D = ({ project, selection, onSelect }: Plan2DProps) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [tool, setTool] = useState<ToolLabel>("選択");
  const [dragging, setDragging] = useState<DragState>(null);
  const [drawing, setDrawing] = useState<DrawingState>(null);
  const [cursorPoint, setCursorPoint] = useState<Vec2M | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  const updateFurniture = useProjectStore((state) => state.updateFurniture);
  const updateLight = useProjectStore((state) => state.updateLight);
  const updateVoid = useProjectStore((state) => state.updateVoid);
  const addWall = useProjectStore((state) => state.addWall);
  const addWindow = useProjectStore((state) => state.addWindow);
  const addFurniture = useProjectStore((state) => state.addFurniture);
  const addLight = useProjectStore((state) => state.addLight);
  const addVoid = useProjectStore((state) => state.addVoid);
  const setBackgroundScale = useProjectStore((state) => state.setBackgroundScale);
  const deleteSelection = useProjectStore((state) => state.deleteSelection);

  const planSize = useMemo(() => {
    const width = 920;
    const height = Math.round(width * (project.room.depthM / project.room.widthM));
    const pxPerM = width / project.room.widthM;
    return { width, height, pxPerM };
  }, [project.room.depthM, project.room.widthM]);

  const viewBox = {
    x: pan.x,
    y: pan.y,
    width: planSize.width / zoom,
    height: planSize.height / zoom
  };

  const worldToSvg = (point: Vec2M) => ({
    x: (point.x + project.room.widthM / 2) * planSize.pxPerM,
    y: (point.z + project.room.depthM / 2) * planSize.pxPerM
  });

  const svgPointToWorld = (point: { x: number; y: number }): Vec2M => ({
    x: point.x / planSize.pxPerM - project.room.widthM / 2,
    z: point.y / planSize.pxPerM - project.room.depthM / 2
  });

  const clientToSvgPoint = (clientX: number, clientY: number) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: viewBox.x + ((clientX - rect.left) / rect.width) * viewBox.width,
      y: viewBox.y + ((clientY - rect.top) / rect.height) * viewBox.height
    };
  };

  const svgToWorld = (clientX: number, clientY: number): Vec2M =>
    svgPointToWorld(clientToSvgPoint(clientX, clientY));

  const nearestWall = (point: Vec2M) => {
    const candidates = project.walls
      .map((wall) => ({ wall, ...projectedWallRatio(wall, point) }))
      .sort((a, b) => a.distanceM - b.distanceM);
    return candidates[0];
  };

  const handleDelete = (nextSelection: Selection) => {
    if (!nextSelection) return;
    const ok = window.confirm("選択したオブジェクトを削除しますか？");
    if (ok) deleteSelection(nextSelection);
  };

  const handleSelect = (nextSelection: Selection) => {
    if (tool === "削除") {
      handleDelete(nextSelection);
      return;
    }
    onSelect(nextSelection);
  };

  const handleCanvasPointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    const world = snapPoint(svgToWorld(event.clientX, event.clientY));
    const svg = clientToSvgPoint(event.clientX, event.clientY);

    if (tool === "パン" || event.button === 1) {
      setDragging({ kind: "pan", clientStart: { x: event.clientX, y: event.clientY }, panStart: pan });
      return;
    }

    if (tool === "選択" || tool === "削除") {
      if (tool === "削除" && selection) handleDelete(selection);
      return;
    }

    if (tool === "縮尺") {
      if (drawing?.kind !== "scale") {
        setDrawing({ kind: "scale", startWorld: world, startSvg: svg });
        return;
      }
      const pixels = Math.hypot(svg.x - drawing.startSvg.x, svg.y - drawing.startSvg.y);
      const answer = window.prompt("クリックした2点間の実距離をmmで入力", "3640");
      const millimeters = Number(answer);
      if (pixels > 1 && Number.isFinite(millimeters) && millimeters > 0) {
        setBackgroundScale(pixels, millimeters);
      }
      setDrawing(null);
      return;
    }

    if (tool === "壁") {
      if (drawing?.kind !== "wall") {
        setDrawing({ kind: "wall", start: world });
        return;
      }
      const end = snapWallEnd(drawing.start, world, event.shiftKey);
      if (distance(drawing.start, end) > 0.25) {
        addWall({
          id: id("wall"),
          name: "追加壁",
          start: drawing.start,
          end,
          thicknessM: 0.12,
          heightM: project.room.ceilingHeightM,
          materialId: "wall-white"
        });
      }
      setDrawing(null);
      return;
    }

    if (tool === "窓" || tool === "開口") {
      const candidate = nearestWall(world);
      if (!candidate?.wall) return;
      const opening: WindowOpening = {
        id: id(tool === "窓" ? "window" : "opening"),
        name: tool === "窓" ? "追加窓" : "追加開口",
        wallId: candidate.wall.id,
        centerRatio: candidate.ratio,
        widthM: tool === "窓" ? 1.65 : 0.9,
        heightM: tool === "窓" ? 1.1 : 2.05,
        sillHeightM: tool === "窓" ? 0.85 : 0,
        hasGlass: tool === "窓"
      };
      addWindow(opening, tool === "窓" ? "window" : "opening");
      return;
    }

    if (tool === "家具") {
      const item: FurnitureItem = {
        id: id("furniture"),
        name: "汎用ボックス",
        type: "box",
        position: { x: world.x, y: 0.3, z: world.z },
        size: { x: 0.9, y: 0.6, z: 0.45 },
        rotationYDeg: 0,
        materialId: "fabric-warm-gray",
        castsShadow: true
      };
      addFurniture(item);
      return;
    }

    if (tool === "照明") {
      const light: LightFixture = {
        id: id("light"),
        name: "追加ダウンライト",
        type: "downlight",
        position: { x: world.x, y: project.room.ceilingHeightM - 0.04, z: world.z },
        mountHeightM: project.room.ceilingHeightM,
        rotationDeg: { x: -90, y: 0, z: 0 },
        target: { x: world.x, y: 0.72, z: world.z },
        lumens: 620,
        colorTemperatureK: 2700,
        dimmer: 80,
        enabled: true,
        beamAngleDeg: 55,
        penumbra: 0.45,
        castsShadow: true,
        note: "2Dで追加"
      };
      addLight(light);
      return;
    }

    if (tool === "吹抜") {
      if (drawing?.kind !== "void") {
        setDrawing({ kind: "void", start: world });
        return;
      }
      const center = {
        x: (drawing.start.x + world.x) / 2,
        z: (drawing.start.z + world.z) / 2
      };
      const size = {
        x: Math.max(0.4, Math.abs(world.x - drawing.start.x)),
        z: Math.max(0.4, Math.abs(world.z - drawing.start.z))
      };
      addVoid({ id: id("void"), name: "追加吹き抜け", center, size });
      setDrawing(null);
    }
  };

  const onPointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const point = snapPoint(svgToWorld(event.clientX, event.clientY));
    setCursorPoint(point);

    if (!dragging) return;

    if (dragging.kind === "pan") {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return;
      const dx = ((event.clientX - dragging.clientStart.x) / rect.width) * viewBox.width;
      const dy = ((event.clientY - dragging.clientStart.y) / rect.height) * viewBox.height;
      setPan({ x: dragging.panStart.x - dx, y: dragging.panStart.y - dy });
      return;
    }

    const next = {
      x: point.x - dragging.offset.x,
      z: point.z - dragging.offset.z
    };

    if (dragging.kind === "furniture") {
      const item = project.furniture.find((candidate) => candidate.id === dragging.id);
      if (!item) return;
      updateFurniture(item.id, {
        position: { ...item.position, x: next.x, z: next.z }
      });
    } else if (dragging.kind === "light") {
      const fixture = project.lights.find((candidate) => candidate.id === dragging.id);
      if (!fixture) return;
      updateLight(fixture.id, {
        position: { ...fixture.position, x: next.x, z: next.z },
        target: fixture.target ? { ...fixture.target, x: next.x, z: next.z } : undefined
      });
    } else {
      const voidArea = project.voids.find((candidate) => candidate.id === dragging.id);
      if (!voidArea) return;
      updateVoid(voidArea.id, { center: next });
    }
  };

  const handleWheel = (event: React.WheelEvent<SVGSVGElement>) => {
    event.preventDefault();
    const nextZoom = Math.min(4, Math.max(0.65, zoom * (event.deltaY > 0 ? 0.9 : 1.1)));
    setZoom(nextZoom);
  };

  // クリック配置を待たずに、部屋中心へワンタップで追加する。
  const quickAddLight = () => {
    addLight({
      id: id("light"),
      name: "追加ダウンライト",
      type: "downlight",
      position: { x: 0, y: project.room.ceilingHeightM - 0.04, z: 0 },
      mountHeightM: project.room.ceilingHeightM,
      rotationDeg: { x: -90, y: 0, z: 0 },
      target: { x: 0, y: 0.72, z: 0 },
      lumens: 620,
      colorTemperatureK: 2700,
      dimmer: 80,
      enabled: true,
      beamAngleDeg: 55,
      penumbra: 0.45,
      castsShadow: true,
      note: "クイック追加"
    });
  };

  const quickAddFurniture = () => {
    addFurniture({
      id: id("furniture"),
      name: "汎用ボックス",
      type: "box",
      position: { x: 0, y: 0.3, z: 0 },
      size: { x: 0.9, y: 0.6, z: 0.45 },
      rotationYDeg: 0,
      materialId: "fabric-warm-gray",
      castsShadow: true
    });
  };

  const quickAddStair = () => {
    addFurniture({
      id: id("furniture"),
      name: "階段",
      type: "stair",
      position: { x: project.room.widthM / 2 - 1.2, y: 0, z: 0 },
      size: { x: 1.0, y: project.room.ceilingHeightM, z: 2.8 },
      rotationYDeg: 0,
      materialId: "wall-white",
      color: "#cfc8bb",
      roughness: 0.8,
      metalness: 0,
      castsShadow: true
    });
  };

  const quickAddVoid = () => {
    addVoid({ id: id("void"), name: "追加吹き抜け", center: { x: 0, z: 0 }, size: { x: 2.0, z: 2.4 } });
  };

  const scaleLabel = project.backgroundPlan?.scale
    ? `${Math.round(project.backgroundPlan.scale.millimeters).toLocaleString("ja-JP")}mm / ${Math.round(project.backgroundPlan.scale.pixels)}px`
    : "縮尺未設定";

  return (
    <section className="plan-panel" aria-label="2D平面図エディタ">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">2D Plan</p>
          <h2>平面配置</h2>
        </div>
        <span className="unit-chip">{scaleLabel}</span>
      </div>

      <div className="tool-strip" role="toolbar" aria-label="2D編集ツール">
        {TOOL_LABELS.map((label) => (
          <button
            key={label}
            className={tool === label ? "tool is-active" : "tool"}
            onClick={() => {
              setTool(label);
              setDrawing(null);
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="quick-add" role="group" aria-label="クイック追加">
        <span>クイック追加</span>
        <button onClick={quickAddLight}>＋照明</button>
        <button onClick={quickAddFurniture}>＋家具</button>
        <button onClick={quickAddStair}>＋階段</button>
        <button onClick={quickAddVoid}>＋吹抜</button>
      </div>

      <div className="plan-meta">
        <span>ズーム {Math.round(zoom * 100)}%</span>
        <button onClick={() => setZoom((current) => Math.min(4, current * 1.2))}>+</button>
        <button onClick={() => setZoom((current) => Math.max(0.65, current / 1.2))}>-</button>
        <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}>全体</button>
      </div>

      <p className="tool-help">
        {tool === "壁" && "壁は始点と終点をクリック。Shiftで15度角度スナップ。"}
        {tool === "縮尺" && "背景図面上の既知距離の2点をクリックし、実距離mmを入力。"}
        {tool === "吹抜" && "吹き抜け範囲は矩形の対角2点をクリック。"}
        {tool === "選択" && "家具・照明・吹き抜けはドラッグ移動できます。"}
        {tool === "パン" && "ドラッグで平面図をパン。ホイールでズーム。"}
        {(tool === "窓" || tool === "開口") && "クリック位置に最も近い壁へ配置します。"}
        {(tool === "家具" || tool === "照明") && "平面図をクリックして追加します。"}
        {tool === "削除" && "対象をクリック、または選択中の対象を削除します。"}
      </p>

      <div className="plan-canvas-wrap">
        <svg
          ref={svgRef}
          className="plan-canvas"
          viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
          onPointerDown={handleCanvasPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={() => setDragging(null)}
          onPointerLeave={() => setDragging(null)}
          onWheel={handleWheel}
        >
          <defs>
            <pattern id="smallGrid" width={planSize.pxPerM / 2} height={planSize.pxPerM / 2} patternUnits="userSpaceOnUse">
              <path d={`M ${planSize.pxPerM / 2} 0 L 0 0 0 ${planSize.pxPerM / 2}`} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="1" />
            </pattern>
            <pattern id="meterGrid" width={planSize.pxPerM} height={planSize.pxPerM} patternUnits="userSpaceOnUse">
              <rect width={planSize.pxPerM} height={planSize.pxPerM} fill="url(#smallGrid)" />
              <path d={`M ${planSize.pxPerM} 0 L 0 0 0 ${planSize.pxPerM}`} fill="none" stroke="rgba(255,255,255,.16)" strokeWidth="1.4" />
            </pattern>
          </defs>
          <rect width={planSize.width} height={planSize.height} fill="#141414" />
          {project.backgroundPlan && (
            <image
              href={project.backgroundPlan.dataUrl}
              x="0"
              y="0"
              width={planSize.width}
              height={planSize.height}
              preserveAspectRatio="xMidYMid meet"
              opacity="0.42"
            />
          )}
          <rect width={planSize.width} height={planSize.height} fill="url(#meterGrid)" />
          <RoomOutline
            project={project}
            selection={selection}
            worldToSvg={worldToSvg}
            onSelect={handleSelect}
          />
          {project.windows.map((windowItem) => (
            <OpeningPlanItem
              key={windowItem.id}
              windowItem={windowItem}
              walls={project.walls}
              selection={selection}
              worldToSvg={worldToSvg}
              onSelect={handleSelect}
            />
          ))}
          {project.voids.map((voidArea) => (
            <VoidPlanItem
              key={voidArea.id}
              voidArea={voidArea}
              planSize={planSize}
              worldToSvg={worldToSvg}
              selected={selection?.kind === "void" && selection.id === voidArea.id}
              onSelect={handleSelect}
              onDragStart={(offset) => setDragging({ kind: "void", id: voidArea.id, offset })}
              svgToWorld={svgToWorld}
              canDrag={tool === "選択"}
            />
          ))}
          {project.furniture.map((item) => (
            <FurniturePlanItem
              key={item.id}
              item={item}
              planSize={planSize}
              worldToSvg={worldToSvg}
              selected={selection?.kind === "furniture" && selection.id === item.id}
              onSelect={handleSelect}
              onDragStart={(offset) => setDragging({ kind: "furniture", id: item.id, offset })}
              svgToWorld={svgToWorld}
              canDrag={tool === "選択"}
            />
          ))}
          {project.lights.map((fixture) => (
            <LightPlanItem
              key={fixture.id}
              fixture={fixture}
              worldToSvg={worldToSvg}
              selected={selection?.kind === "light" && selection.id === fixture.id}
              onSelect={handleSelect}
              onDragStart={(offset) => setDragging({ kind: "light", id: fixture.id, offset })}
              svgToWorld={svgToWorld}
              canDrag={tool === "選択"}
            />
          ))}
          {drawing?.kind === "wall" && cursorPoint && (
            <line
              x1={worldToSvg(drawing.start).x}
              y1={worldToSvg(drawing.start).y}
              x2={worldToSvg(cursorPoint).x}
              y2={worldToSvg(cursorPoint).y}
              className="plan-preview-line"
            />
          )}
          {drawing?.kind === "void" && cursorPoint && (
            <PreviewRect start={drawing.start} end={cursorPoint} worldToSvg={worldToSvg} />
          )}
          {drawing?.kind === "scale" && cursorPoint && (
            <line
              x1={worldToSvg(drawing.startWorld).x}
              y1={worldToSvg(drawing.startWorld).y}
              x2={worldToSvg(cursorPoint).x}
              y2={worldToSvg(cursorPoint).y}
              className="plan-scale-line"
            />
          )}
        </svg>
      </div>
    </section>
  );
};

const RoomOutline = ({
  project,
  selection,
  worldToSvg,
  onSelect
}: {
  project: Project;
  selection: Selection;
  worldToSvg: (point: Vec2M) => { x: number; y: number };
  onSelect: (selection: Selection) => void;
}) => (
  <>
    {project.walls.map((wall) => {
      const start = worldToSvg(wall.start);
      const end = worldToSvg(wall.end);
      const selected = selection?.kind === "wall" && selection.id === wall.id;
      return (
        <line
          key={wall.id}
          x1={start.x}
          y1={start.y}
          x2={end.x}
          y2={end.y}
          className={selected ? "plan-wall is-selected" : "plan-wall"}
          strokeWidth={Math.max(8, wall.thicknessM * 100)}
          onPointerDown={(event) => {
            event.stopPropagation();
            onSelect({ kind: "wall", id: wall.id });
          }}
        />
      );
    })}
  </>
);

const OpeningPlanItem = ({
  windowItem,
  walls,
  selection,
  worldToSvg,
  onSelect
}: {
  windowItem: WindowOpening;
  walls: WallSegment[];
  selection: Selection;
  worldToSvg: (point: Vec2M) => { x: number; y: number };
  onSelect: (selection: Selection) => void;
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
    <line
      x1={start.x}
      y1={start.y}
      x2={end.x}
      y2={end.y}
      className={selected ? `plan-opening ${kind} is-selected` : `plan-opening ${kind}`}
      onPointerDown={(event) => {
        event.stopPropagation();
        onSelect({ kind, id: windowItem.id });
      }}
    />
  );
};

const VoidPlanItem = ({
  voidArea,
  planSize,
  worldToSvg,
  selected,
  onSelect,
  onDragStart,
  svgToWorld,
  canDrag
}: {
  voidArea: Project["voids"][number];
  planSize: { pxPerM: number };
  worldToSvg: (point: Vec2M) => { x: number; y: number };
  selected: boolean;
  onSelect: (selection: Selection) => void;
  onDragStart: (offset: Vec2M) => void;
  svgToWorld: (clientX: number, clientY: number) => Vec2M;
  canDrag: boolean;
}) => {
  const topLeft = worldToSvg({
    x: voidArea.center.x - voidArea.size.x / 2,
    z: voidArea.center.z - voidArea.size.z / 2
  });

  const handlePointerDown = (event: React.PointerEvent<SVGGElement>) => {
    event.stopPropagation();
    onSelect({ kind: "void", id: voidArea.id });
    if (!canDrag) return;
    const point = svgToWorld(event.clientX, event.clientY);
    onDragStart({
      x: point.x - voidArea.center.x,
      z: point.z - voidArea.center.z
    });
  };

  return (
    <g onPointerDown={handlePointerDown}>
      <rect
        x={topLeft.x}
        y={topLeft.y}
        width={voidArea.size.x * planSize.pxPerM}
        height={voidArea.size.z * planSize.pxPerM}
        className={selected ? "plan-void is-selected" : "plan-void"}
      />
      <text x={topLeft.x + 12} y={topLeft.y + 24} className="plan-label">
        {voidArea.name}
      </text>
    </g>
  );
};

const FurniturePlanItem = ({
  item,
  planSize,
  worldToSvg,
  selected,
  onSelect,
  onDragStart,
  svgToWorld,
  canDrag
}: {
  item: FurnitureItem;
  planSize: { pxPerM: number };
  worldToSvg: (point: Vec2M) => { x: number; y: number };
  selected: boolean;
  onSelect: (selection: Selection) => void;
  onDragStart: (offset: Vec2M) => void;
  svgToWorld: (clientX: number, clientY: number) => Vec2M;
  canDrag: boolean;
}) => {
  const center = worldToSvg({ x: item.position.x, z: item.position.z });
  const width = item.size.x * planSize.pxPerM;
  const depth = item.size.z * planSize.pxPerM;

  const handlePointerDown = (event: React.PointerEvent<SVGGElement>) => {
    event.stopPropagation();
    onSelect({ kind: "furniture", id: item.id });
    if (!canDrag) return;
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
      className={selected ? "plan-furniture is-selected" : "plan-furniture"}
    >
      {item.type === "roundTable" ? (
        <circle r={width / 2} />
      ) : (
        <rect x={-width / 2} y={-depth / 2} width={width} height={depth} rx="8" />
      )}
      <text x={-width / 2 + 6} y={-depth / 2 - 8} className="plan-label">
        {item.name}
      </text>
    </g>
  );
};

const LightPlanItem = ({
  fixture,
  worldToSvg,
  selected,
  onSelect,
  onDragStart,
  svgToWorld,
  canDrag
}: {
  fixture: LightFixture;
  worldToSvg: (point: Vec2M) => { x: number; y: number };
  selected: boolean;
  onSelect: (selection: Selection) => void;
  onDragStart: (offset: Vec2M) => void;
  svgToWorld: (clientX: number, clientY: number) => Vec2M;
  canDrag: boolean;
}) => {
  const center = worldToSvg({ x: fixture.position.x, z: fixture.position.z });
  const target = fixture.target ? worldToSvg({ x: fixture.target.x, z: fixture.target.z }) : null;
  const handlePointerDown = (event: React.PointerEvent<SVGGElement>) => {
    event.stopPropagation();
    onSelect({ kind: "light", id: fixture.id });
    if (!canDrag) return;
    const point = svgToWorld(event.clientX, event.clientY);
    onDragStart({
      x: point.x - fixture.position.x,
      z: point.z - fixture.position.z
    });
  };

  return (
    <g onPointerDown={handlePointerDown} className={selected ? "plan-light is-selected" : "plan-light"}>
      {target && <line x1={center.x} y1={center.y} x2={target.x} y2={target.y} className="plan-aim-line" />}
      <circle cx={center.x} cy={center.y} r={selected ? 13 : 10} />
      <text x={center.x + 14} y={center.y - 12} className="plan-label">
        {fixture.name}
      </text>
    </g>
  );
};

const PreviewRect = ({
  start,
  end,
  worldToSvg
}: {
  start: Vec2M;
  end: Vec2M;
  worldToSvg: (point: Vec2M) => { x: number; y: number };
}) => {
  const a = worldToSvg(start);
  const b = worldToSvg(end);
  return (
    <rect
      x={Math.min(a.x, b.x)}
      y={Math.min(a.y, b.y)}
      width={Math.abs(a.x - b.x)}
      height={Math.abs(a.y - b.y)}
      className="plan-preview-rect"
    />
  );
};
