import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { directIlluminanceFrom } from "../../photometric/src/photometry/illuminance";
import { vec3 } from "../../photometric/src/core/vec3";
import type { LightFixture } from "../types";
import {
  __resetIesCacheForTest,
  createIesTexture,
  importIesFile,
  type IesAsset
} from "../utils/iesAssets";
import { projectLightsToPhotometric } from "../utils/photometricLights";
import { ASYMMETRIC_IES, AXIAL_DOWNLIGHT_IES, iesFile } from "./iesFixtures";

// 光源は (0, 2, 0) から真下向き。床(y=0)で水平2m離れた点は θ=45° にあたる。
const spot = (asset: IesAsset, rotationYDeg: number): LightFixture => ({
  id: "l1",
  name: "WW",
  type: "spotlight",
  position: { x: 0, y: 2, z: 0 },
  mountHeightM: 2,
  rotationDeg: { x: -90, y: rotationYDeg, z: 0 },
  target: { x: 0, y: 0, z: 0 },
  lumens: 500,
  colorTemperatureK: 3000,
  dimmer: 100,
  enabled: true,
  beamAngleDeg: 60,
  penumbra: 0.5,
  castsShadow: true,
  note: "",
  ies: { assetId: asset.assetId, fileName: asset.fileName }
});

// 光源のドロップ(スポットは0.2m)ぶんだけ実際の高さは 1.8m。θ=45° になる水平距離もその値。
const D = 1.8;
const floorPoint = (x: number, z: number) => ({
  position: vec3(x, 0, z),
  normal: vec3(0, 1, 0)
});

const luxAt = (fixture: LightFixture, x: number, z: number): number => {
  const [light] = projectLightsToPhotometric([fixture], 0);
  return directIlluminanceFrom(floorPoint(x, z), light!);
};

let asymmetric: IesAsset;
let axial: IesAsset;

beforeEach(async () => {
  __resetIesCacheForTest();
  asymmetric = await importIesFile(iesFile(ASYMMETRIC_IES, "wallwash.ies"));
  axial = await importIesFile(iesFile(AXIAL_DOWNLIGHT_IES, "downlight.ies"));
});

describe("非対称配光の判定", () => {
  it("水平角で光度が変わるIESだけ非対称と判定する", () => {
    expect(asymmetric.isAsymmetric).toBe(true);
    expect(axial.isAsymmetric).toBe(false);
  });

  it("真のピークはθ=45°/φ=0°の1000cd、intensity用のピークはφ平均で控えめ", () => {
    expect(asymmetric.truePeakCandela).toBeGreaterThan(900);
    // ラスターのSpotLightはiesMapを見ないので、intensityにはφ平均を使う。
    // 真のピークを入れるとコーン全体が過剰に明るくなる。
    expect(asymmetric.peakCandela).toBeLessThan(asymmetric.truePeakCandela / 2);
  });

  it("intensity × grid が元の絶対光度[cd]を再現する", () => {
    let maxGrid = 0;
    for (const value of asymmetric.grid) if (value > maxGrid) maxGrid = value;
    expect(asymmetric.peakCandela * maxGrid).toBeCloseTo(asymmetric.truePeakCandela, 1);
    // 非対称配光では正規化後の値が1を超える（HalfFloatのFBOなのでクランプされない）。
    expect(maxGrid).toBeGreaterThan(1);
  });

  it("軸対称IESでは両ピークが一致し、grid は1を超えない", () => {
    expect(axial.peakCandela).toBeCloseTo(axial.truePeakCandela, 3);
    let maxGrid = 0;
    for (const value of axial.grid) if (value > maxGrid) maxGrid = value;
    expect(maxGrid).toBeLessThanOrEqual(1.001);
  });
});

describe("照度計算での非対称配光の向き", () => {
  it("回転0°では φ=0 の明るいローブがワールド+X側に出る", () => {
    const light = spot(asymmetric, 0);
    const east = luxAt(light, D, 0);
    const west = luxAt(light, -D, 0);
    const north = luxAt(light, 0, -D);
    const south = luxAt(light, 0, D);

    expect(east).toBeGreaterThan(west * 10);
    expect(east).toBeGreaterThan(north * 10);
    expect(east).toBeGreaterThan(south * 10);
  });

  it("器具を90°回すと明るいローブも90°動く（-Z側へ）", () => {
    const rotated = spot(asymmetric, 90);
    const east = luxAt(rotated, D, 0);
    const north = luxAt(rotated, 0, -D);

    expect(north).toBeGreaterThan(east * 10);
  });

  it("180°回すと明るいローブは真逆(-X側)へ動く", () => {
    const rotated = spot(asymmetric, 180);
    expect(luxAt(rotated, -D, 0)).toBeGreaterThan(luxAt(rotated, D, 0) * 10);
  });

  it("軸対称IESは回転しても照度が変わらない", () => {
    const a = luxAt(spot(axial, 0), D, 0);
    const b = luxAt(spot(axial, 90), D, 0);
    expect(a).toBeCloseTo(b, 6);
    expect(a).toBeGreaterThan(0);
  });
});

describe("描画テクスチャの向き", () => {
  const GRID_THETA = 360;
  const GRID_PHI = 180;
  // θ=45° の列。u=θ/π なので col = 45/180 * 359。
  const col45 = Math.round((45 / 180) * (GRID_THETA - 1));
  const rowOf = (phiDeg: number) => Math.round((phiDeg / 360) * GRID_PHI) % GRID_PHI;

  it("テクスチャは θ×φ の2次元で、φ=0 の行が最も明るい", () => {
    const texture = createIesTexture(asymmetric, 0);
    expect(texture.image.width).toBe(GRID_THETA);
    expect(texture.image.height).toBe(GRID_PHI);

    const data = texture.image.data as Float32Array;
    const at = (phiDeg: number) => data[rowOf(phiDeg) * GRID_THETA + col45]!;

    expect(at(0)).toBeGreaterThan(at(90) * 50);
    expect(at(0)).toBeGreaterThan(at(180) * 50);
  });

  it("器具のY回転が行方向のシフトとして焼き込まれる", () => {
    const rotated = createIesTexture(asymmetric, 90);
    const data = rotated.image.data as Float32Array;
    const at = (phiDeg: number) => data[rowOf(phiDeg) * GRID_THETA + col45]!;

    // φ_ies = φ_uv + rotY なので、明るい φ_ies=0 は φ_uv=270° へ移る。
    expect(at(270)).toBeGreaterThan(at(0) * 50);
  });

  it("回転0°ならグリッドを共有し、回転時だけ新しい配列を作る", () => {
    expect(createIesTexture(asymmetric, 0).image.data).toBe(asymmetric.grid);
    expect(createIesTexture(asymmetric, 90).image.data).not.toBe(asymmetric.grid);
  });

  it("軸対称IESは回転してもテクスチャの中身が変わらない", () => {
    const a = createIesTexture(axial, 0).image.data as Float32Array;
    const b = createIesTexture(axial, 137).image.data as Float32Array;
    for (let i = 0; i < a.length; i += 997) expect(b[i]).toBeCloseTo(a[i]!, 5);
  });
});
