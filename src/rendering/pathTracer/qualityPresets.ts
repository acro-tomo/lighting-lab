// パストレ品質モードの定義とモード別パラメータ。
// 変更するとPNG書き出しの収束速度・画質が変わるため、値の調整は要検討の上で行うこと。

export type PathTraceMode = "standard" | "high" | "ultra";
export type RenderDebugMode = "beauty" | "material" | "normals" | "frontback";

export const sampleCountByMode: Record<PathTraceMode, number> = {
  standard: 256,
  high: 512,
  ultra: 1024
};

// モード別の品質パラメータ。重い ultra のみタイル分割(2x2)でGPU負荷を分散。
// standard の renderScale は 0.7 だとアップスケールでノイズが目立つため 0.85。
export const renderScaleByMode: Record<PathTraceMode, number> = {
  standard: 0.85,
  high: 0.9,
  ultra: 1.0
};

export const bouncesByMode: Record<PathTraceMode, number> = {
  standard: 5,
  high: 8,
  ultra: 10
};

export const transmissiveBouncesByMode: Record<PathTraceMode, number> = {
  standard: 3,
  high: 4,
  ultra: 5
};
