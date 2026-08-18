/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_URL?: string;
  /** Viteの公開ベースパス（vite/client既定型をここで上書きしているため明示する） */
  readonly BASE_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// three-gpu-pathtracer の glsl チャンク（型定義なし）。IESサンプリングの
// 差し替え可否をロード時に判定するために参照する。rendering/iesShaderPatch.ts 参照。
declare module "three-gpu-pathtracer/src/shader/sampling/light_sampling_functions.glsl.js" {
  export const light_sampling_functions: string;
}
