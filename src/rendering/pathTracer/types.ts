import type { Project } from "../../types";
import type { RenderContext } from "../renderContext";
import type { PathTraceMode, RenderDebugMode } from "./qualityPresets";

export type PathTraceProgress = {
  samples: number;
  targetSamples: number;
  elapsedMs: number;
  phase: "preparing" | "bvh" | "sampling" | "complete";
  buildProgress?: number;
};

export type PathTraceResult = {
  dataUrl: string;
  samples: number;
  elapsedMs: number;
  width: number;
  height: number;
};

export type RenderPathTracedImageOptions = {
  context: RenderContext;
  project: Project;
  mode: PathTraceMode;
  debugMode: RenderDebugMode;
  maxWidth?: number;
  signal?: AbortSignal;
  onProgress?: (progress: PathTraceProgress) => void;
};
