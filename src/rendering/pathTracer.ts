// パストレ関連のエントリポイント。実装は ./pathTracer/ 配下に責務ごとに分割し、
// ここでは既存の公開シンボルを維持するための薄い再エクスポートのみ行う
// （他ファイルからの import パス "rendering/pathTracer" を壊さないため）。
export type { PathTraceMode, RenderDebugMode } from "./pathTracer/qualityPresets";
export { sampleCountByMode } from "./pathTracer/qualityPresets";
export type { PathTraceProgress, PathTraceResult } from "./pathTracer/types";
export { supportsWebGL2, renderPathTracedImage } from "./pathTracer/renderRunner";
