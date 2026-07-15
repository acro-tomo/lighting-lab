/**
 * ANSI/IES LM-63 フォトメトリックデータ（Type C）パーサーと配光サンプラー。
 *
 * - candela 値は非一様な角度グリッドで与えられるため、パース時に
 *   一様グリッド（θ・φ とも等間隔）の Float32Array へ再サンプルする。
 *   この配列が唯一のデータソースであり、CPU測光は sampleCandela()（双線形）で、
 *   GPU描画は同じ配列から生成したテクスチャで参照する（実装の二重化禁止）。
 * - 対応: photometric type 1 (Type C)。水平角の対称性
 *   （0°のみ / 0–90° / 0–180° / 0–360°）を展開する。
 * - 光度の絶対値はファイルの candela 値 × multiplier ×（ballast factor）を
 *   そのまま用いる。全光束 lm はプリセット値でなく IES 由来が正となる。
 */
import type { Candelas, Lumens } from '../core/types';
import type { LightDistribution } from './distribution';

export interface IesPhotometry {
  /** 一様グリッド candela 値。行 = θ（垂直角）、列 = φ（水平角） */
  data: Float32Array;
  /** θ 方向の分割数（0..π を等間隔、両端含む） */
  thetaCount: number;
  /** φ 方向の分割数（0..2π を等間隔、0=2π の重複列は持たず wrap） */
  phiCount: number;
  /** ヘッダ由来のランプ光束 [lm]（参考値） */
  ratedLumens: Lumens;
  /** 元ファイルの垂直角範囲 [deg] */
  verticalRangeDeg: [number, number];
  keywords: Record<string, string>;
}

const THETA_COUNT = 181; // 1°刻み 0..180
const PHI_COUNT = 360; // 1°刻み 0..359

function parseNumbers(text: string): number[] {
  return text
    .split(/[\s,]+/)
    .filter((t) => t.length > 0)
    .map((t) => {
      const v = Number(t);
      if (!Number.isFinite(v)) throw new Error(`IES: 数値でないトークン "${t}"`);
      return v;
    });
}

/** 非一様な昇順角度列に対する1次補間サンプル */
function interp(angles: readonly number[], values: readonly number[], x: number): number {
  const n = angles.length;
  if (n === 1) return values[0]!;
  if (x <= angles[0]!) return values[0]!;
  if (x >= angles[n - 1]!) return values[n - 1]!;
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (angles[mid]! <= x) lo = mid;
    else hi = mid;
  }
  const t = (x - angles[lo]!) / (angles[hi]! - angles[lo]!);
  return values[lo]! + (values[hi]! - values[lo]!) * t;
}

export function parseIes(source: string): IesPhotometry {
  const lines = source.split(/\r?\n/);
  let index = 0;

  // ヘッダ（キーワード行）〜 TILT 行
  const keywords: Record<string, string> = {};
  let tiltLine: string | null = null;
  for (; index < lines.length; index++) {
    const line = lines[index]!.trim();
    if (line.startsWith('TILT=')) {
      tiltLine = line;
      index++;
      break;
    }
    const m = line.match(/^\[([A-Z0-9_]+)\]\s*(.*)$/i);
    if (m) keywords[m[1]!.toUpperCase()] = m[2]!;
  }
  if (tiltLine === null) throw new Error('IES: TILT= 行がありません');
  if (tiltLine !== 'TILT=NONE') {
    throw new Error(`IES: TILT=NONE 以外は未対応 (${tiltLine})`);
  }

  const numbers = parseNumbers(lines.slice(index).join(' '));
  let p = 0;
  const next = (): number => {
    if (p >= numbers.length) throw new Error('IES: データが不足しています');
    return numbers[p++]!;
  };

  next(); // number of lamps
  const lumensPerLamp = next();
  const multiplier = next();
  const nVertical = next();
  const nHorizontal = next();
  const photometricType = next();
  next(); // units type
  next(); // width
  next(); // length
  next(); // height
  const ballastFactor = next();
  next(); // future use
  next(); // input watts

  if (photometricType !== 1) {
    throw new Error(`IES: Type C (photometric type 1) 以外は未対応 (type ${photometricType})`);
  }
  if (nVertical < 2 || nHorizontal < 1) throw new Error('IES: 角度数が不正です');

  const vertical: number[] = [];
  for (let i = 0; i < nVertical; i++) vertical.push(next());
  const horizontal: number[] = [];
  for (let i = 0; i < nHorizontal; i++) horizontal.push(next());

  // candela[h][v]
  const scale = multiplier * ballastFactor;
  const candela: number[][] = [];
  for (let h = 0; h < nHorizontal; h++) {
    const row: number[] = [];
    for (let v = 0; v < nVertical; v++) row.push(next() * scale);
    candela.push(row);
  }

  const maxH = horizontal[nHorizontal - 1]!;

  /** 対称性を考慮して任意 φ[deg, 0..360) の水平プロファイルを得る */
  const sampleAtPhi = (phiDeg: number, thetaDeg: number): number => {
    let h = phiDeg;
    if (nHorizontal === 1) {
      // 軸対称
      return interp(vertical, candela[0]!, thetaDeg);
    }
    if (maxH <= 90 + 1e-6) {
      // 4象限対称
      h = h % 180;
      if (h > 90) h = 180 - h;
    } else if (maxH <= 180 + 1e-6) {
      // 左右対称
      if (h > 180) h = 360 - h;
    } else {
      h = h % 360;
    }
    // φ 方向の補間（列ごとに θ 補間してから φ 補間）
    const n = horizontal.length;
    if (h <= horizontal[0]!) return interp(vertical, candela[0]!, thetaDeg);
    if (h >= horizontal[n - 1]!) return interp(vertical, candela[n - 1]!, thetaDeg);
    let lo = 0;
    let hi = n - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (horizontal[mid]! <= h) lo = mid;
      else hi = mid;
    }
    const t = (h - horizontal[lo]!) / (horizontal[hi]! - horizontal[lo]!);
    const a = interp(vertical, candela[lo]!, thetaDeg);
    const b = interp(vertical, candela[hi]!, thetaDeg);
    return a + (b - a) * t;
  };

  // 一様グリッドへ再サンプル
  const data = new Float32Array(THETA_COUNT * PHI_COUNT);
  for (let ti = 0; ti < THETA_COUNT; ti++) {
    const thetaDeg = (ti / (THETA_COUNT - 1)) * 180;
    for (let pi = 0; pi < PHI_COUNT; pi++) {
      const phiDeg = (pi / PHI_COUNT) * 360;
      data[ti * PHI_COUNT + pi] = sampleAtPhi(phiDeg, thetaDeg);
    }
  }

  return {
    data,
    thetaCount: THETA_COUNT,
    phiCount: PHI_COUNT,
    ratedLumens: lumensPerLamp,
    verticalRangeDeg: [vertical[0]!, vertical[nVertical - 1]!],
    keywords,
  };
}

/**
 * 一様グリッドの双線形サンプリング。
 * GPU テクスチャ（同じ data から生成）と同一の補間規則。
 */
export function sampleCandela(ies: IesPhotometry, thetaRad: number, phiRad: number): Candelas {
  const thetaDeg = Math.min(180, Math.max(0, (thetaRad * 180) / Math.PI));
  let phiDeg = ((phiRad * 180) / Math.PI) % 360;
  if (phiDeg < 0) phiDeg += 360;

  const tf = (thetaDeg / 180) * (ies.thetaCount - 1);
  const t0 = Math.min(ies.thetaCount - 1, Math.floor(tf));
  const t1 = Math.min(ies.thetaCount - 1, t0 + 1);
  const tw = tf - t0;

  const pf = (phiDeg / 360) * ies.phiCount;
  const p0 = Math.floor(pf) % ies.phiCount;
  const p1 = (p0 + 1) % ies.phiCount; // φ は wrap
  const pw = pf - Math.floor(pf);

  const v00 = ies.data[t0 * ies.phiCount + p0]!;
  const v01 = ies.data[t0 * ies.phiCount + p1]!;
  const v10 = ies.data[t1 * ies.phiCount + p0]!;
  const v11 = ies.data[t1 * ies.phiCount + p1]!;
  const a = v00 + (v01 - v00) * pw;
  const b = v10 + (v11 - v10) * pw;
  return a + (b - a) * tw;
}

/** IES → LightDistribution（測光・描画の共通配光） */
export function iesDistribution(ies: IesPhotometry): LightDistribution {
  return {
    kind: 'ies',
    intensityAt: (thetaRad, phiRad) => sampleCandela(ies, thetaRad, phiRad),
  };
}
