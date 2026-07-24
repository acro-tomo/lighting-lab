import { useEffect, useState } from "react";
import type { Project, Selection, Vec2M, WallSegment } from "../../types";
import type { EditMode } from "../EditToolbar";
import { WALL_VERTEX_SNAP_PX } from "./constants";
import { angleSnap, orthogonalSnap, snapToShakuModule, svgSideNormal, uid } from "./geometry";
import type { ContentBox, PlanSize, TouchWallTraceState } from "./types";

// 壁トレース: 確定済み頂点列とプレビュー用カーソル位置、内側(室内側)指定、
// 頂点/尺モジュール/直角スナップ、キーボード操作（Enterで終了・矢印で内側指定）。
export const useWallTrace = ({
  mode,
  project,
  activeWalls,
  ghostWalls,
  addWall,
  undo,
  onSelect,
  onModeChange,
  svgRef,
  viewBox,
  worldToSvg,
  contentBox,
  planSize,
  touchWallTraceRef
}: {
  mode: EditMode;
  project: Project;
  activeWalls: WallSegment[];
  ghostWalls: WallSegment[];
  addWall: (wall: WallSegment) => void;
  undo: () => void;
  onSelect: (selection: Selection) => void;
  onModeChange: (mode: EditMode) => void;
  svgRef: { current: SVGSVGElement | null };
  viewBox: { x: number; y: number; width: number; height: number };
  worldToSvg: (point: Vec2M) => { x: number; y: number };
  contentBox: ContentBox;
  planSize: PlanSize;
  touchWallTraceRef: { current: TouchWallTraceState };
}) => {
  // 壁トレース: 確定済み頂点列とプレビュー用カーソル位置。
  const [wallDraft, setWallDraft] = useState<Vec2M[]>([]);
  const [wallCursor, setWallCursor] = useState<Vec2M | null>(null);
  // 壁トレース中の内側(室内側)。start→end に対し左/右。undefined=未指定(中心対称)。
  const [draftInnerSide, setDraftInnerSide] = useState<"left" | "right" | undefined>(undefined);

  // 壁モードを抜けたら下書きをクリア。
  useEffect(() => {
    if (mode !== "wall") {
      touchWallTraceRef.current = null;
      setWallDraft([]);
      setWallCursor(null);
      setDraftInnerSide(undefined);
    }
  }, [mode]);

  // 壁モード中: Enter でトレース終了。
  // キーが平面図(SVG)にフォーカスしている / SVG内のイベント時のみ反応させ、
  // 3Dカメラ操作の矢印キーと二重発火しないようにする。
  useEffect(() => {
    if (mode !== "wall") return;
    const onKeyDown = (event: KeyboardEvent) => {
      const svg = svgRef.current;
      const target = event.target as Node | null;
      const planFocused = !!svg && (svg === target || (target ? svg.contains(target) : false));
      if (!planFocused) return;
      if (event.key === "Enter") {
        setWallDraft([]);
        setWallCursor(null);
        setDraftInnerSide(undefined);
        return;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mode]);

  // 壁の既定値: 高さは天井高、厚みは既存壁を踏襲(無ければ0.12)、材質も既存壁を踏襲。
  // innerSide はトレース中に矢印キーで選んだ内側を保存（未指定なら中心対称）。
  const commitWallSegment = (start: Vec2M, end: Vec2M, innerSide: "left" | "right" | undefined) => {
    const reference = activeWalls[activeWalls.length - 1] ?? project.walls[project.walls.length - 1];
    addWall({
      id: uid("wall"),
      name: "追加壁",
      start,
      end,
      thicknessM: reference?.thicknessM ?? 0.12,
      heightM: project.room.ceilingHeightM,
      materialId: reference?.materialId ?? "wall-white",
      ...(innerSide ? { innerSide } : {})
    });
  };

  const clearWallTrace = () => {
    touchWallTraceRef.current = null;
    setWallDraft([]);
    setWallCursor(null);
    setDraftInnerSide(undefined);
  };

  const finishWallTrace = () => {
    clearWallTrace();
    onModeChange("select");
  };

  const undoWallPoint = () => {
    if (wallDraft.length === 0) return;
    if (wallDraft.length > 1) undo();
    const nextDraft = wallDraft.slice(0, -1);
    setWallDraft(nextDraft);
    setWallCursor(null);
    if (nextDraft.length === 0) setDraftInnerSide(undefined);
    onSelect(null);
  };

  const wallVertexSnapTolerance = () => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect?.width) return WALL_VERTEX_SNAP_PX;
    return (WALL_VERTEX_SNAP_PX * viewBox.width) / rect.width;
  };

  const snapToWallVertex = (point: Vec2M): Vec2M => {
    const candidates = [...activeWalls, ...ghostWalls].flatMap((wall) => [wall.start, wall.end]).concat(wallDraft);
    if (candidates.length === 0) return point;
    const target = worldToSvg(point);
    const tolerance = wallVertexSnapTolerance();
    let best: { point: Vec2M; dist: number } | null = null;
    for (const candidate of candidates) {
      const p = worldToSvg(candidate);
      const dist = Math.hypot(p.x - target.x, p.y - target.y);
      if (dist <= tolerance && (!best || dist < best.dist)) best = { point: candidate, dist };
    }
    return best ? { ...best.point } : point;
  };

  const wallTracePoint = (
    raw: Vec2M,
    prev: Vec2M | undefined,
    origin: Vec2M | undefined,
    forceOrthogonal: boolean
  ): Vec2M => {
    if (!prev || !origin) return snapToWallVertex(raw);
    const aligned = forceOrthogonal ? orthogonalSnap(prev, raw) : angleSnap(prev, raw);
    return snapToWallVertex(snapToShakuModule(aligned, origin));
  };

  // 画面上の方向(desired: 例 ArrowLeft→{x:-1,y:0})から、現在描画中の辺(start→end)の
  // どちら側("left"|"right"、データ空間の意味)がその画面方向に近いかを判定する。
  // 有効な辺（直前の確定頂点＋カーソル/次頂点）がまだ無い・線分長が短すぎる場合は undefined。
  const resolveSideForScreenDirection = (desired: { x: number; y: number }): "left" | "right" | undefined => {
    const last = wallDraft[wallDraft.length - 1];
    const edgeStart = wallCursor ? last : wallDraft[wallDraft.length - 2];
    const edgeEnd = wallCursor ?? last;
    if (!edgeStart || !edgeEnd) return undefined;
    const s = worldToSvg(edgeStart);
    const e = worldToSvg(edgeEnd);
    if (Math.hypot(e.x - s.x, e.y - s.y) < 1) return undefined;
    const left = svgSideNormal(s, e, "left");
    const right = svgSideNormal(s, e, "right");
    return left.x * desired.x + left.y * desired.y >= right.x * desired.x + right.y * desired.y ? "left" : "right";
  };

  useEffect(() => {
    if (mode !== "wall") return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
      const svg = svgRef.current;
      const target = event.target as Node | null;
      const planFocused = !!svg && (svg === target || (target ? svg.contains(target) : false));
      if (!planFocused) return;
      const desired =
        event.key === "ArrowLeft"
          ? { x: -1, y: 0 }
          : event.key === "ArrowRight"
            ? { x: 1, y: 0 }
            : event.key === "ArrowUp"
              ? { x: 0, y: -1 }
              : { x: 0, y: 1 };
      const next = resolveSideForScreenDirection(desired);
      if (next === undefined) return;
      event.preventDefault();
      setDraftInnerSide((current) => (current === next ? undefined : next));
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mode, wallDraft, wallCursor, contentBox, planSize.pxPerM]);

  // モバイルボタン向け: 固定の画面基準(x軸)で左右を判定すると、水平な壁(法線が
  // 上下方向のみ)でタイ(引き分け)が起きて常に"left"に倒れる問題があるため、代わりに
  // 「今描いている辺の left/right 法線がそれぞれ画面上どちら向きか」をラベルとして
  // 動的に算出する。データ側の "left"/"right" は生の値のまま使い、ラベルだけが
  // 常に正しい方向を指すようにする（left/right の法線は常に正反対のベクトルなので
  // ラベルが一致することは原理的に無い）。
  // 矢印記号は向きがそのまま伝わるので漢字(上/下/左/右)より直感的、という判断で採用。
  const labelForNormal = (n: { x: number; y: number }): "←" | "→" | "↑" | "↓" => {
    if (Math.abs(n.x) >= Math.abs(n.y)) return n.x < 0 ? "←" : "→";
    return n.y < 0 ? "↑" : "↓";
  };

  const draftSideLabels: { left: "←" | "→" | "↑" | "↓"; right: "←" | "→" | "↑" | "↓" } | null = (() => {
    const last = wallDraft[wallDraft.length - 1];
    const edgeStart = wallCursor ? last : wallDraft[wallDraft.length - 2];
    const edgeEnd = wallCursor ?? last;
    if (!edgeStart || !edgeEnd) return null;
    const s = worldToSvg(edgeStart);
    const e = worldToSvg(edgeEnd);
    if (Math.hypot(e.x - s.x, e.y - s.y) < 1) return null;
    return {
      left: labelForNormal(svgSideNormal(s, e, "left")),
      right: labelForNormal(svgSideNormal(s, e, "right"))
    };
  })();

  return {
    wallDraft,
    setWallDraft,
    wallCursor,
    setWallCursor,
    draftInnerSide,
    setDraftInnerSide,
    draftSideLabels,
    commitWallSegment,
    clearWallTrace,
    finishWallTrace,
    undoWallPoint,
    wallTracePoint
  };
};
