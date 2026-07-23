import { useEffect, useRef, useState } from "react";
import type { Project, Selection, Vec2M, WallSegment } from "../../types";
import type { EditMode } from "../EditToolbar";
import { WALL_VERTEX_SNAP_PX, WALL_VERTEX_SNAP_PX_TOUCH } from "./constants";
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

  // 「元に戻す」(ヘッダーの↶)やモバイルの「削除」ボタンは wallDraft を経由せず
  // 直接 project.walls を変える。トレース中にそれで壁が消えた場合、基準点(wallDraft)
  // が古いまま残ると「消えたはずの点」から次の壁を作ってしまうため、両方をリセットする。
  // undoWallPoint 自身が起こす undo() 呼び出し(壁数が減る想定内の変化)は
  // skipNextWallCountResetRef で区別して無視する。
  const wallCountRef = useRef(activeWalls.length);
  const skipNextWallCountResetRef = useRef(false);
  useEffect(() => {
    if (mode === "wall" && wallDraft.length > 0 && activeWalls.length < wallCountRef.current) {
      if (skipNextWallCountResetRef.current) {
        skipNextWallCountResetRef.current = false;
      } else {
        clearWallTrace();
      }
    }
    wallCountRef.current = activeWalls.length;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWalls.length, mode]);

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
    if (wallDraft.length > 1) {
      // このundo()による壁数減少は下のwallCount監視effectでも検知されるが、
      // 直後にnextDraftへ正しく揃えるのでここでは全消去(clearWallTrace)を起こさせない。
      skipNextWallCountResetRef.current = true;
      undo();
    }
    const nextDraft = wallDraft.slice(0, -1);
    setWallDraft(nextDraft);
    setWallCursor(null);
    if (nextDraft.length === 0) setDraftInnerSide(undefined);
    onSelect(null);
  };

  // タッチ操作は指先の座標精度がマウスより低いため、端点スナップ半径を広げる。
  const wallVertexSnapTolerance = (isTouch: boolean) => {
    const basePx = isTouch ? WALL_VERTEX_SNAP_PX_TOUCH : WALL_VERTEX_SNAP_PX;
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect?.width) return basePx;
    return (basePx * viewBox.width) / rect.width;
  };

  const snapToWallVertex = (point: Vec2M, isTouch: boolean): Vec2M => {
    const candidates = [...activeWalls, ...ghostWalls].flatMap((wall) => [wall.start, wall.end]).concat(wallDraft);
    if (candidates.length === 0) return point;
    const target = worldToSvg(point);
    const tolerance = wallVertexSnapTolerance(isTouch);
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
    forceOrthogonal: boolean,
    // 呼び出し元の大半は forceOrthogonal(=直角スナップ強制) をタッチ時のみ true にしているため、
    // 省略時はそれをタッチ判定の代用にする（既存呼び出し箇所を変更せずに対応するため）。
    isTouch: boolean = forceOrthogonal
  ): Vec2M => {
    if (!prev || !origin) return snapToWallVertex(raw, isTouch);
    const aligned = forceOrthogonal ? orthogonalSnap(prev, raw) : angleSnap(prev, raw);
    return snapToWallVertex(snapToShakuModule(aligned, origin), isTouch);
  };

  useEffect(() => {
    if (mode !== "wall") return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
      const svg = svgRef.current;
      const target = event.target as Node | null;
      const planFocused = !!svg && (svg === target || (target ? svg.contains(target) : false));
      if (!planFocused) return;
      const last = wallDraft[wallDraft.length - 1];
      const edgeStart = wallCursor ? last : wallDraft[wallDraft.length - 2];
      const edgeEnd = wallCursor ?? last;
      if (!edgeStart || !edgeEnd) return;
      const s = worldToSvg(edgeStart);
      const e = worldToSvg(edgeEnd);
      if (Math.hypot(e.x - s.x, e.y - s.y) < 1) return;
      event.preventDefault();
      const desired =
        event.key === "ArrowLeft"
          ? { x: -1, y: 0 }
          : event.key === "ArrowRight"
            ? { x: 1, y: 0 }
            : event.key === "ArrowUp"
              ? { x: 0, y: -1 }
              : { x: 0, y: 1 };
      const left = svgSideNormal(s, e, "left");
      const right = svgSideNormal(s, e, "right");
      const next = left.x * desired.x + left.y * desired.y >= right.x * desired.x + right.y * desired.y ? "left" : "right";
      setDraftInnerSide((current) => (current === next ? undefined : next));
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mode, wallDraft, wallCursor, contentBox, planSize.pxPerM]);

  return {
    wallDraft,
    setWallDraft,
    wallCursor,
    setWallCursor,
    draftInnerSide,
    setDraftInnerSide,
    commitWallSegment,
    clearWallTrace,
    finishWallTrace,
    undoWallPoint,
    wallTracePoint
  };
};
