/**
 * IES LM-63 Type C パーサーのゴールデンテスト。
 * フィクスチャは手計算可能な合成データ（値の出所はファイル内コメント参照）。
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { iesDistribution, parseIes, sampleCandela } from '../src/photometry/ies';
import { integrateFlux } from '../src/photometry/distribution';

const DEG = Math.PI / 180;

const fixture = (name: string): string =>
  readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), 'utf8');

const axialSource = fixture('sample-downlight.ies');
const axial = parseIes(axialSource);
const quadrant = parseIes(fixture('sample-quadrant.ies'));

describe('IES パーサー（軸対称フィクスチャ）', () => {
  it('ヘッダとメタデータ', () => {
    expect(axial.ratedLumens).toBe(800);
    expect(axial.verticalRangeDeg).toEqual([0, 180]);
    expect(axial.keywords['LUMCAT']).toBe('SAMPLE-DL-IES');
  });

  it('格子点の candela 値（ゴールデン）', () => {
    expect(sampleCandela(axial, 0, 0)).toBeCloseTo(1000, 4);
    expect(sampleCandela(axial, 30 * DEG, 0)).toBeCloseTo(800, 3);
    expect(sampleCandela(axial, 60 * DEG, 0)).toBeCloseTo(200, 3);
    expect(sampleCandela(axial, 90 * DEG, 0)).toBeCloseTo(0, 3);
    expect(sampleCandela(axial, 180 * DEG, 0)).toBeCloseTo(0, 3);
  });

  it('格子点間の線形補間', () => {
    expect(sampleCandela(axial, 15 * DEG, 0)).toBeCloseTo(900, 1);
    expect(sampleCandela(axial, 45 * DEG, 0)).toBeCloseTo(500, 1);
    expect(sampleCandela(axial, 75 * DEG, 0)).toBeCloseTo(100, 1);
  });

  it('軸対称: φ に依存しない', () => {
    for (const phi of [0, 90, 180, 270, 359]) {
      expect(sampleCandela(axial, 45 * DEG, phi * DEG)).toBeCloseTo(500, 1);
    }
  });

  it('配光としての全光束が閉形式解と一致する', () => {
    // 区分線形 I(θ) の解析積分: Φ = 2π ∫ I(θ) sinθ dθ
    // 数値積分（integrateFlux）と独立に計算した基準値との一致で回帰を検出
    const dist = iesDistribution(axial);
    const flux = integrateFlux(dist, 4096, 8);
    // 基準値: Φ = 2π ∫ I(θ) sinθ dθ を区分線形の閉形式
    // ∫(a+bθ)sinθdθ = −(a+bθ)cosθ + b·sinθ で手計算 → 2π×338.412 ≈ 2126.3 lm
    expect(flux).toBeCloseTo(2126.3, 0);
  });
});

describe('IES パーサー（4象限対称・multiplier）', () => {
  it('multiplier=2 が candela に乗る', () => {
    // ファイル値 100 × multiplier 2 = 200
    expect(sampleCandela(quadrant, 0, 0)).toBeCloseTo(200, 3);
  });

  it('水平角 0–90° の4象限対称展開', () => {
    const at45 = sampleCandela(quadrant, 0, 45 * DEG); // 400
    expect(at45).toBeCloseTo(400, 1);
    // 135° → 180−135 = 45° にミラー
    expect(sampleCandela(quadrant, 0, 135 * DEG)).toBeCloseTo(at45, 1);
    // 225° → (225 % 180) = 45°
    expect(sampleCandela(quadrant, 0, 225 * DEG)).toBeCloseTo(at45, 1);
    // 90° と 270°
    expect(sampleCandela(quadrant, 0, 270 * DEG)).toBeCloseTo(600, 1);
  });
});

describe('IES パーサー（異常系）', () => {
  it('Type C 以外は拒否', () => {
    const typeA = axialSource.replace('1 800 1 5 1 1 2', '1 800 1 5 1 3 2');
    expect(() => parseIes(typeA)).toThrow(/Type C/);
  });

  it('TILT=NONE 以外は拒否', () => {
    const tilt = axialSource.replace('TILT=NONE', 'TILT=INCLUDE');
    expect(() => parseIes(tilt)).toThrow(/TILT/);
  });

  it('データ不足は拒否', () => {
    expect(() => parseIes('IESNA\nTILT=NONE\n1 800 1 5 1 1 2')).toThrow(/不足/);
  });
});
