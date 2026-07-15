/**
 * 色変換ユーティリティ。
 *
 * CCT → CIE 1931 xy（Planck軌跡近似, Kang et al. 2002）→ XYZ → linear sRGB。
 * RGB を直接オレンジ方向へずらす近似は使用しない（アーキテクチャ原則）。
 *
 * 色温度を変えても全光束 lm を維持するため、変換結果は
 * 輝度（Rec.709 係数による Y）= 1 に正規化して返す。
 */
import type { Kelvin } from './types';

export type LinearRGB = [number, number, number];

/** CCT [K] → CIE 1931 xy 色度（Planck軌跡近似、有効域 1667K〜25000K） */
export function cctToXy(cct: Kelvin): { x: number; y: number } {
  const t = Math.min(25000, Math.max(1667, cct));
  const t2 = t * t;
  const t3 = t2 * t;
  let x: number;
  if (t <= 4000) {
    x = -0.2661239e9 / t3 - 0.2343589e6 / t2 + 0.8776956e3 / t + 0.17991;
  } else {
    x = -3.0258469e9 / t3 + 2.1070379e6 / t2 + 0.2226347e3 / t + 0.24039;
  }
  const x2 = x * x;
  const x3 = x2 * x;
  let y: number;
  if (t <= 2222) {
    y = -1.1063814 * x3 - 1.3481102 * x2 + 2.18555832 * x - 0.20219683;
  } else if (t <= 4000) {
    y = -0.9549476 * x3 - 1.37418593 * x2 + 2.09137015 * x - 0.16748867;
  } else {
    y = 3.081758 * x3 - 5.8733867 * x2 + 3.75112997 * x - 0.37001483;
  }
  return { x, y };
}

/** xy 色度 → XYZ (Y=1) → linear sRGB。負成分は 0 にクランプ */
export function xyToLinearRgb(x: number, y: number): LinearRGB {
  const X = x / y;
  const Y = 1;
  const Z = (1 - x - y) / y;
  const r = 3.2404542 * X - 1.5371385 * Y - 0.4985314 * Z;
  const g = -0.969266 * X + 1.8760108 * Y + 0.041556 * Z;
  const b = 0.0556434 * X - 0.2040259 * Y + 1.0572252 * Z;
  return [Math.max(0, r), Math.max(0, g), Math.max(0, b)];
}

/** Rec.709 輝度 */
export function luminanceOf([r, g, b]: LinearRGB): number {
  return 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
}

/**
 * CCT [K] → 輝度正規化済み linear sRGB。
 * luminanceOf(result) === 1 なので、光束 lm に乗じても全光束が変化しない。
 * 注意: CCT だけでは演色性（CRI）は再現できない（UIに明示すること）。
 */
export function cctToLinearRgb(cct: Kelvin): LinearRGB {
  const { x, y } = cctToXy(cct);
  const rgb = xyToLinearRgb(x, y);
  const lum = luminanceOf(rgb);
  if (lum <= 0) return [1, 1, 1];
  return [rgb[0] / lum, rgb[1] / lum, rgb[2] / lum];
}

/** sRGB (0..1) → linear。反射率として色を使う際は必ずこれを通す */
export function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function srgbTripletToLinear([r, g, b]: [number, number, number]): LinearRGB {
  return [srgbToLinear(r), srgbToLinear(g), srgbToLinear(b)];
}

/**
 * マテリアルの拡散反射率 ρ を得る。
 * reflectance が明示されていればそれを、無ければ sRGB baseColor を
 * linear 変換した輝度を使う（sRGB値の直接使用は禁止）。
 */
export function diffuseReflectance(params: {
  baseColor: [number, number, number];
  reflectance?: number;
}): number {
  if (params.reflectance !== undefined) {
    return Math.min(1, Math.max(0, params.reflectance));
  }
  return luminanceOf(srgbTripletToLinear(params.baseColor));
}

/**
 * RGB拡散反射率（linear）。reflectance が明示されている場合は
 * 色みを保ったまま輝度を reflectance に合わせてスケールする。
 */
export function albedoLinear(params: {
  baseColor: [number, number, number];
  reflectance?: number;
}): LinearRGB {
  const rgb = srgbTripletToLinear(params.baseColor);
  if (params.reflectance === undefined) return rgb;
  const lum = luminanceOf(rgb);
  if (lum <= 0) return [params.reflectance, params.reflectance, params.reflectance];
  const k = Math.min(1 / lum, Math.max(0, params.reflectance) / lum);
  return [rgb[0] * k, rgb[1] * k, rgb[2] * k];
}
