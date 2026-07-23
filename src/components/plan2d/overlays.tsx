import type { Project, Vec2M, WallSegment } from "../../types";
import { parseVoidWallId } from "../../utils/fixtureMounting";
import type { FurnitureWallSnap } from "../../utils/furniturePlacement";
import { svgSideNormal, voidSideLine } from "./geometry";
import type { ContentBox, DragState, PinchState, TouchPoint, ViewState } from "./types";

// 非活性階の壁ゴースト（薄く・操作不可）。2階作図時に1階壁を透かして見せ、
// それに合わせて2階壁を引けるようにする。選択ヒット線は付けない。
export const GhostWallsLayer = ({
  ghostWalls,
  worldToSvg,
  pxPerM
}: {
  ghostWalls: WallSegment[];
  worldToSvg: (point: Vec2M) => { x: number; y: number };
  pxPerM: number;
}) => (
  <g style={{ pointerEvents: "none" }}>
    {ghostWalls.map((wall) => {
      const start = worldToSvg(wall.start);
      const end = worldToSvg(wall.end);
      const displayWidth = Math.max(2, wall.thicknessM * pxPerM);
      let off = { x: 0, y: 0 };
      if (wall.innerSide) {
        const outer = svgSideNormal(start, end, wall.innerSide === "left" ? "right" : "left");
        off = { x: outer.x * (displayWidth / 2), y: outer.y * (displayWidth / 2) };
      }
      return (
        <line
          key={wall.id}
          x1={start.x + off.x}
          y1={start.y + off.y}
          x2={end.x + off.x}
          y2={end.y + off.y}
          stroke="#ece7da"
          strokeWidth={displayWidth}
          strokeOpacity={0.48}
          strokeLinecap="round"
        />
      );
    })}
  </g>
);

// ライトのドラッグ整列スナップが効いている軸のガイド線（一時表示）。
export const SnapGuideLines = ({
  snapGuides,
  worldToSvg,
  viewBox,
  contentBox
}: {
  snapGuides: { x: number | null; z: number | null };
  worldToSvg: (point: Vec2M) => { x: number; y: number };
  viewBox: { x: number; y: number; width: number; height: number };
  contentBox: ContentBox;
}) => (
  <>
    {snapGuides.x !== null && (
      <line
        stroke="#7fd4ff"
        strokeWidth={1}
        strokeDasharray="6 4"
        pointerEvents="none"
        x1={worldToSvg({ x: snapGuides.x, z: contentBox.minX }).x}
        y1={viewBox.y}
        x2={worldToSvg({ x: snapGuides.x, z: contentBox.minX }).x}
        y2={viewBox.y + viewBox.height}
      />
    )}
    {snapGuides.z !== null && (
      <line
        stroke="#7fd4ff"
        strokeWidth={1}
        strokeDasharray="6 4"
        pointerEvents="none"
        x1={viewBox.x}
        y1={worldToSvg({ x: contentBox.minX, z: snapGuides.z }).y}
        x2={viewBox.x + viewBox.width}
        y2={worldToSvg({ x: contentBox.minX, z: snapGuides.z }).y}
      />
    )}
  </>
);

export const FurnitureWallCenterGuide = ({
  wallSnap,
  worldToSvg
}: {
  wallSnap: FurnitureWallSnap | null;
  worldToSvg: (point: Vec2M) => { x: number; y: number };
}) => {
  if (!wallSnap) return null;
  const midpoint = {
    x: (wallSnap.wall.start.x + wallSnap.wall.end.x) * 0.5,
    z: (wallSnap.wall.start.z + wallSnap.wall.end.z) * 0.5
  };
  const start = worldToSvg({
    x: midpoint.x - wallSnap.inward.x * 0.18,
    z: midpoint.z - wallSnap.inward.z * 0.18
  });
  const end = worldToSvg({
    x: midpoint.x + wallSnap.inward.x * 0.72,
    z: midpoint.z + wallSnap.inward.z * 0.72
  });
  return (
    <line
      x1={start.x}
      y1={start.y}
      x2={end.x}
      y2={end.y}
      stroke="#f4cf5a"
      strokeWidth={2}
      strokeDasharray="6 4"
      pointerEvents="none"
    />
  );
};

// 窓/扉/壁付ライトの設置先になる壁のハイライト（最前面・クリック非対象）。
export const WallTargetHighlight = ({
  wallTarget,
  project,
  worldToSvg,
  pxPerM,
  previewWidthM
}: {
  wallTarget: { wallId: string; ratio: number };
  project: Project;
  worldToSvg: (point: Vec2M) => { x: number; y: number };
  pxPerM: number;
  previewWidthM?: number;
}) => {
  const previewLine = (start: Vec2M, end: Vec2M) => {
    if (previewWidthM === undefined) return { start, end };
    const lengthM = Math.hypot(end.x - start.x, end.z - start.z);
    if (previewWidthM > lengthM) return { start, end };
    const halfSpanRatio = previewWidthM / lengthM / 2;
    const centerRatio = Math.min(1 - halfSpanRatio, Math.max(halfSpanRatio, wallTarget.ratio));
    const startRatio = centerRatio - halfSpanRatio;
    const endRatio = centerRatio + halfSpanRatio;
    return {
      start: {
        x: start.x + (end.x - start.x) * startRatio,
        z: start.z + (end.z - start.z) * startRatio
      },
      end: {
        x: start.x + (end.x - start.x) * endRatio,
        z: start.z + (end.z - start.z) * endRatio
      }
    };
  };

  const voidTarget = parseVoidWallId(wallTarget.wallId);
  if (voidTarget) {
    const voidArea = project.voids.find((candidate) => candidate.id === voidTarget.voidId);
    if (!voidArea) return null;
    const targetLine = voidSideLine(voidArea, voidTarget.side);
    const line = previewLine(targetLine.start, targetLine.end);
    const s = worldToSvg(line.start);
    const e = worldToSvg(line.end);
    return (
      <line
        x1={s.x}
        y1={s.y}
        x2={e.x}
        y2={e.y}
        stroke="#7fd1ff"
        strokeWidth={Math.max(10, 0.12 * pxPerM + 6)}
        strokeOpacity={0.55}
        strokeLinecap="round"
        style={{ pointerEvents: "none" }}
      />
    );
  }
  const wall = project.walls.find((candidate) => candidate.id === wallTarget.wallId);
  if (!wall) return null;
  const line = previewLine(wall.start, wall.end);
  const s = worldToSvg(line.start);
  const e = worldToSvg(line.end);
  return (
    <line
      x1={s.x}
      y1={s.y}
      x2={e.x}
      y2={e.y}
      stroke="#7fd1ff"
      strokeWidth={Math.max(10, wall.thicknessM * pxPerM + 6)}
      strokeOpacity={0.5}
      strokeLinecap="round"
      style={{ pointerEvents: "none" }}
    />
  );
};

// 壁トレースのプレビュー（頂点マーカー＋カーソルへのラバーバンド）。最前面・クリック非対象。
export const WallTracePreview = ({
  wallDraft,
  wallCursor,
  draftInnerSide,
  worldToSvg
}: {
  wallDraft: Vec2M[];
  wallCursor: Vec2M | null;
  draftInnerSide: "left" | "right" | undefined;
  worldToSvg: (point: Vec2M) => { x: number; y: number };
}) => (
  <g style={{ pointerEvents: "none" }}>
    {wallDraft.map((vertex, index) => {
      const p = worldToSvg(vertex);
      return <circle key={index} cx={p.x} cy={p.y} r={5} fill="#7fd1ff" stroke="#0b3a52" strokeWidth={1.5} />;
    })}
    {wallDraft.length > 0 && wallCursor && (
      <line
        x1={worldToSvg(wallDraft[wallDraft.length - 1]).x}
        y1={worldToSvg(wallDraft[wallDraft.length - 1]).y}
        x2={worldToSvg(wallCursor).x}
        y2={worldToSvg(wallCursor).y}
        stroke="#7fd1ff"
        strokeWidth={2}
        strokeDasharray="8 6"
      />
    )}
    {/* 内側(室内側)を指す△マーカー。現在引いている辺の中点に法線方向で描く。
        draftInnerSide が left/right のときは片側に1つ。undefined のときは
        「外壁無し(室内間仕切り＝両側が室内)」を示すため両側に△を出す。 */}
    {(() => {
      // 現在の辺: 最後の確定点→カーソル。カーソルが無ければ直近2点の辺。
      const last = wallDraft[wallDraft.length - 1];
      const edgeStart = wallCursor ? last : wallDraft[wallDraft.length - 2];
      const edgeEnd = wallCursor ?? last;
      if (!edgeStart || !edgeEnd) return null;
      const s = worldToSvg(edgeStart);
      const e = worldToSvg(edgeEnd);
      if (Math.hypot(e.x - s.x, e.y - s.y) < 1) return null;
      const mid = { x: (s.x + e.x) / 2, y: (s.y + e.y) / 2 };
      const gap = 10;
      const size = 9;
      const len = Math.hypot(e.x - s.x, e.y - s.y) || 1;
      const tx = (e.x - s.x) / len; // 辺方向（三角形の底辺を辺と平行に）
      const ty = (e.y - s.y) / len;
      const triangle = (side: "left" | "right") => {
        const n = svgSideNormal(s, e, side);
        const tip = { x: mid.x + n.x * gap, y: mid.y + n.y * gap };
        const baseC = { x: tip.x - n.x * size, y: tip.y - n.y * size };
        const b1 = { x: baseC.x + tx * size * 0.7, y: baseC.y + ty * size * 0.7 };
        const b2 = { x: baseC.x - tx * size * 0.7, y: baseC.y - ty * size * 0.7 };
        return (
          <polygon
            key={side}
            points={`${tip.x},${tip.y} ${b1.x},${b1.y} ${b2.x},${b2.y}`}
            fill="#ffd166"
            stroke="#7a5b00"
            strokeWidth={1}
          />
        );
      };
      // undefined=外壁無し: 両側に△。指定時はその側のみ。
      const sides: ("left" | "right")[] = draftInnerSide
        ? [draftInnerSide]
        : ["left", "right"];
      return <>{sides.map(triangle)}</>;
    })()}
  </g>
);

// カメラ現在地マーカー: 円=位置、三角=視線方向。最前面・クリック非対象。
// 方向は worldToSvg(pos)→worldToSvg(target) の差分から算出（軸向きの取り違え回避）。
export const CameraMarker = ({
  liveCamera,
  worldToSvg
}: {
  liveCamera: { x: number; z: number; tx: number; tz: number };
  worldToSvg: (point: Vec2M) => { x: number; y: number };
}) => {
  const cp = worldToSvg({ x: liveCamera.x, z: liveCamera.z });
  const ct = worldToSvg({ x: liveCamera.tx, z: liveCamera.tz });
  const dx = ct.x - cp.x;
  const dy = ct.y - cp.y;
  const len = Math.hypot(dx, dy);
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  // 三角形は +X 方向を向く形で定義し、視線方向へ回転させる。
  const reach = 26;
  const halfW = 13;
  return (
    <g className="plan-camera" style={{ pointerEvents: "none" }}>
      {len > 0.001 && (
        <polygon
          points={`0,${-halfW} ${reach},0 0,${halfW}`}
          transform={`translate(${cp.x} ${cp.y}) rotate(${angle})`}
          fill="rgba(56,224,255,0.28)"
          stroke="#38e0ff"
          strokeWidth={1.5}
        />
      )}
      <circle cx={cp.x} cy={cp.y} r={7} fill="#38e0ff" stroke="#063946" strokeWidth={2} />
    </g>
  );
};

// 実機ジェスチャー診断用HUD。?gdebug=1 で有効。
export const GestureDebugHud = ({
  touchPointersRef,
  pinchRef,
  gestureBaseRef,
  viewportRef,
  gestureDebugRef,
  dragging
}: {
  touchPointersRef: { current: Map<number, TouchPoint> };
  pinchRef: { current: PinchState | null };
  gestureBaseRef: { current: { view: ViewState; rect: DOMRect } | null };
  viewportRef: { current: ViewState };
  gestureDebugRef: { current: { down: number; up: number; cancel: number; leave: number; lostcap: number; last: string; killer: string } };
  dragging: DragState;
}) => (
  <div
    style={{
      position: "absolute",
      top: 4,
      left: 4,
      zIndex: 50,
      pointerEvents: "none",
      background: "rgba(0,0,0,0.75)",
      color: "#fff",
      font: "11px/1.5 ui-monospace, monospace",
      padding: 6,
      borderRadius: 4,
      whiteSpace: "pre"
    }}
  >
    {[
      `ptrs: ${touchPointersRef.current.size}`,
      `pinch: ${pinchRef.current ? "on" : "-"}  gest: ${gestureBaseRef.current ? "on" : "-"}  drag: ${dragging?.kind ?? "-"}`,
      `zoom: ${viewportRef.current.zoom.toFixed(2)}  pan: ${viewportRef.current.pan.x.toFixed(1)},${viewportRef.current.pan.y.toFixed(1)}`,
      `ev: d${gestureDebugRef.current.down} u${gestureDebugRef.current.up} c${gestureDebugRef.current.cancel} l${gestureDebugRef.current.leave} lc${gestureDebugRef.current.lostcap}  last:${gestureDebugRef.current.last}`,
      `killer: ${gestureDebugRef.current.killer}`
    ].join("\n")}
  </div>
);
