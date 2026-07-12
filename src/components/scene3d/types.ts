import type { RenderDebugMode } from "../../rendering/pathTracer";
import type { RenderContext } from "../../rendering/renderContext";
import type { Project, Selection } from "../../types";

export type ViewMode = "raster" | "realistic";

export type LiveTraceStatus = {
  phase: "off" | "building" | "rendering" | "converged";
  samples: number;
};

export type Scene3DProps = {
  project: Project;
  selection: Selection;
  onSelect: (selection: Selection) => void;
  onCanvasReady: (canvas: HTMLCanvasElement) => void;
  onRenderContextReady: (context: RenderContext) => void;
  debugMode: RenderDebugMode;
  viewMode: ViewMode;
  mode: EditMode;
  onLiveTraceStatus?: (status: LiveTraceStatus) => void;
  // 3Dビューポートでの追加配置（ゴーストプレビュー）。pendingAdd がある間だけ有効。
  pendingAdd?: string | null;
  onPlaceObject?: (at: { x: number; z: number }) => void;
  // 壁配置。壁ライト(wallspot)はカーソルの壁上ワールドYを heightM で渡し、自由な高さに付ける。
  // 窓/扉は従来どおり heightM 省略（種別既定の高さ）。
  onPlaceOnWall?: (wallId: string, centerRatio: number, heightM?: number) => void;
  canEditWalls: boolean;
};

export type EditMode = "select" | "move" | "delete";
