import type { FloorPlanBackground, Vec2M } from "../../types";

export type DragState =
  | { kind: "furniture"; id: string; offset: Vec2M }
  | { kind: "light"; id: string; offset: Vec2M }
  | { kind: "void"; id: string; offset: Vec2M }
  | { kind: "ceilingZone"; id: string; offset: Vec2M }
  | { kind: "floorZone"; id: string; offset: Vec2M }
  | { kind: "window"; id: string }
  | { kind: "wall"; id: string; pointerStart: Vec2M; start: Vec2M; end: Vec2M }
  | {
      kind: "background";
      pointerStartSvg: { x: number; y: number };
      pxPerMStart: number;
      placementStart: NonNullable<FloorPlanBackground["placement"]>;
    }
  | { kind: "pan"; clientStart: { x: number; y: number }; panStart: { x: number; y: number }; viewBoxStart: { width: number; height: number }; sensitivity: number }
  | null;

// パワポ風の辺ドラッグリサイズ対象。矩形フットプリント(幅x・奥行z)を持つ物のみ。
export type ResizeKind = "furniture" | "void" | "ceilingZone" | "floorZone";
export type ResizeEdge =
  | "left"
  | "right"
  | "top"
  | "bottom"
  | "topLeft"
  | "topRight"
  | "bottomLeft"
  | "bottomRight";
export type ResizeState = { kind: ResizeKind; id: string; edge: ResizeEdge } | null;
export type TouchPoint = { clientX: number; clientY: number };
export type PinchState = { distance: number; center: TouchPoint };
export type TouchTapState = { pointerId: number; clientX: number; clientY: number } | null;
export type TouchWallTraceState = {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  start: Vec2M;
  isDrawing: boolean;
} | null;
export type ViewState = { zoom: number; pan: { x: number; y: number } };

// contentBox: コンテンツ全体を内包する world(m) バウンディングボックス。
export type ContentBox = { minX: number; minZ: number; maxX: number; maxZ: number };
// planSize: SVGユーザー座標系のサイズと 1m あたりのピクセル数。
export type PlanSize = { width: number; height: number; pxPerM: number };
