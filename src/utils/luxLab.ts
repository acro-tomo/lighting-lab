import { create } from "zustand";

// 照度ヒートマップ（隠し実験機能）のゲート。?lux=1 のときだけ有効になり、
// 通常起動では UI・シーンとも一切変化しない（既存機能への影響ゼロを保証する）。
export const isLuxLabEnabled = (): boolean =>
  typeof window !== "undefined" &&
  new URLSearchParams(window.location.search).get("lux") === "1";

export type LuxScaleMax = 300 | 500;

export type LuxBreakdown = { direct: number; indirect: number; total: number };
export type LuxStats = {
  mean: LuxBreakdown;
  max: LuxBreakdown;
  points: number;
} | null;
export type LuxProbe = { x: number; z: number; value: LuxBreakdown } | null;
export type LuxCalculation = {
  status: "idle" | "computing" | "ready";
  label: string;
  progress: number;
};

// パネル(DOM overlay)とヒートマップ(three内)の橋渡し用ストア。
// projectStore とは独立させ、隠し機能の状態が保存データへ混入しないようにする。
type LuxLabStore = {
  visible: boolean;
  /** 計算面の床上高さ [m] */
  heightM: number;
  /** 凡例・色の固定レンジ上限 [lx] */
  scaleMax: LuxScaleMax;
  /** ヒートマップ計算結果（平均/最大）。パネル表示用 */
  stats: LuxStats;
  /** 3Dビュークリック位置の実数照度。パネル表示用 */
  probe: LuxProbe;
  calculation: LuxCalculation;
  setVisible: (visible: boolean) => void;
  setHeightM: (heightM: number) => void;
  setScaleMax: (scaleMax: LuxScaleMax) => void;
  setStats: (stats: LuxStats) => void;
  setProbe: (probe: LuxProbe) => void;
  setCalculation: (calculation: LuxCalculation) => void;
};

export const useLuxLabStore = create<LuxLabStore>()((set) => ({
  visible: true,
  heightM: 0.75,
  scaleMax: 300,
  stats: null,
  probe: null,
  calculation: { status: "idle", label: "", progress: 0 },
  setVisible: (visible) => set({ visible }),
  setHeightM: (heightM) => set({ heightM: Math.min(2.5, Math.max(0, heightM)) }),
  setScaleMax: (scaleMax) => set({ scaleMax }),
  setStats: (stats) => set({ stats }),
  setProbe: (probe) => set({ probe }),
  setCalculation: (calculation) => set({ calculation })
}));
