import { useEffect, useSyncExternalStore } from "react";
import * as THREE from "three";
import {
  integrateFlux,
  type LightDistribution
} from "../../photometric/src/photometry/distribution";
import { iesDistribution, parseIes, type IesPhotometry } from "../../photometric/src/photometry/ies";
import { getIesAsset, putIesAsset } from "../storage/iesStorage";
import type { LightFixture } from "../types";
import { colorTemperatureToLinearColor } from "./lighting";
import { clamp, degToRad } from "./units";

// 使用者が選んだIESファイルをブラウザ内だけで扱うレジストリ。
// - 解析は photometric/ の parseIes / iesDistribution をそのまま再利用する（パーサーの二重化禁止）。
// - 原本は IndexedDB(iesStorage)、解析結果はこのモジュールのメモリキャッシュにだけ置く。
//   Project には assetId / fileName の参照しか持たせない。
// - 別端末・別ブラウザ・データ消去後は原本が無いので「再選択が必要」状態になり、
//   描画も照度計算もビーム角近似へ戻る。

/** 実器具のIESは数十KB程度。桁違いのファイルは取り違えとみなして弾く。 */
export const IES_MAX_BYTES = 2 * 1024 * 1024;

const PROFILE_RESOLUTION = 512;
const PROFILE_PHI_SAMPLES = 8;

// 描画用グリッドの解像度。three-gpu-pathtracer の iesProfiles は
// RenderTarget2DArray(360, 180) なので、u=θ に360列・v=φ に180行を割り当てると
// ブリットが1:1になる（θ 0.5°刻み / φ 2°刻み）。
const GRID_THETA = 360;
const GRID_PHI = 180;

export type IesAsset = {
  assetId: string;
  fileName: string;
  photometry: IesPhotometry;
  /** 照度計算用。θ/φ の完全な2次元配光（絶対光度[cd]、調光は含まない）。 */
  distribution: LightDistribution;
  /** 代表ビーム角を出すためのφ平均プロファイル（描画のコーン角用）。 */
  profile: Float32Array;
  /**
   * 描画用の θ×φ 二次元グリッド（行=φ 180、列=θ 360）。値は peakCandela で正規化済み。
   * 非対称配光では 1 を超える（φ平均ピークで割っているため）。
   */
  grid: Float32Array;
  /** 水平角方向に有意な変化があるか（＝非対称配光）。 */
  isAsymmetric: boolean;
  /**
   * SpotLight.intensity に入れる光度 [cd]（調光1.0時）＝ φ平均のピーク。
   * grid との積が元の絶対光度になる。ラスター近似の明るさもこの値で決まる。
   */
  peakCandela: number;
  /** 二次元配光の真のピーク光度 [cd]。表示・検証用。 */
  truePeakCandela: number;
  /** ピークの50%となる代表ビーム角（全角）。ラスター近似のコーン角に使う。 */
  beamAngleDeg: number;
  /** 配光を球面積分した全光束 [lm]。 */
  lumens: number;
};

/**
 * IESを適用できる器具か。
 * ブラケットは点光源、テープは面光源で、いずれも軸を持つスポットではないため対象外。
 * 球形ペンダントも全方向点光源なので対象外（無理にSpotLightへ変換しない）。
 */
export const supportsIes = (fixture: LightFixture): boolean =>
  fixture.type === "downlight" ||
  fixture.type === "spotlight" ||
  (fixture.type === "pendant" && fixture.model !== "pendant-globe");

/** ON/OFFと調光率だけの倍率。IES適用時も使用者設定のまま残す値。 */
export const fixtureDimScale = (fixture: LightFixture): number =>
  fixture.enabled === false ? 0 : clamp(fixture.dimmer, 0, 100) * 0.01;

const buildAsset = (assetId: string, fileName: string, source: string): IesAsset => {
  const photometry = parseIes(source);
  const distribution = iesDistribution(photometry);

  // φ平均プロファイル。代表ビーム角（ラスター近似のコーン角）を出すためだけに使う。
  const profile = new Float32Array(PROFILE_RESOLUTION);
  let profilePeak = 0;
  for (let i = 0; i < PROFILE_RESOLUTION; i++) {
    const theta = (i / (PROFILE_RESOLUTION - 1)) * Math.PI;
    let sum = 0;
    for (let j = 0; j < PROFILE_PHI_SAMPLES; j++) {
      sum += distribution.intensityAt(theta, (j / PROFILE_PHI_SAMPLES) * 2 * Math.PI);
    }
    const value = sum / PROFILE_PHI_SAMPLES;
    profile[i] = value;
    if (value > profilePeak) profilePeak = value;
  }
  if (profilePeak > 0) {
    for (let i = 0; i < PROFILE_RESOLUTION; i++) profile[i]! /= profilePeak;
  }

  // 代表ビーム角: ピークの50%以上になる最も外側の θ の2倍（全角）。
  // バットウィング配光のようにピークが光軸上に無い場合も外縁を拾える。
  let lastHalfPower = 0;
  for (let i = 0; i < PROFILE_RESOLUTION; i++) {
    if (profile[i]! >= 0.5) lastHalfPower = i;
  }
  const beamAngleDeg = clamp((lastHalfPower / (PROFILE_RESOLUTION - 1)) * 360, 1, 180);

  // 描画用の θ×φ 二次元グリッド。行 = φ、列 = θ（テクスチャの u=θ / v=φ に対応）。
  //
  // 正規化に使うのは「2次元の真のピーク」ではなく φ平均のピーク(profilePeak)。
  // 同じライトオブジェクトを通常ラスターと常駐パストレが共有しており、
  // ラスターの SpotLight は iesMap を解釈せずコーン全体を intensity で塗るため、
  // 真のピークを intensity にすると非対称器具が編集ビューで過剰に明るくなる。
  // intensity = profilePeak（従来どおりの近似）としたうえで、grid 側に
  // candela/profilePeak を入れておけば intensity × grid = 元の絶対光度[cd] となり、
  // パストレは正確なまま・ラスターは従来の見え方を保てる。
  // 非対称配光では grid の値が 1 を超えるが、iesProfiles は HalfFloat の
  // 浮動小数レンダーターゲットなのでクランプされない。
  const grid = new Float32Array(GRID_THETA * GRID_PHI);
  let truePeakCandela = 0;
  for (let row = 0; row < GRID_PHI; row++) {
    const phi = (row / GRID_PHI) * 2 * Math.PI;
    for (let col = 0; col < GRID_THETA; col++) {
      const theta = (col / (GRID_THETA - 1)) * Math.PI;
      const value = distribution.intensityAt(theta, phi);
      grid[row * GRID_THETA + col] = value;
      if (value > truePeakCandela) truePeakCandela = value;
    }
  }
  const peakCandela = profilePeak;
  // 水平角方向に変化があるか（＝非対称配光か）。描画の向き調整UIの出し分けに使う。
  let maxPhiSpread = 0;
  for (let col = 0; col < GRID_THETA; col++) {
    let lo = Infinity;
    let hi = 0;
    for (let row = 0; row < GRID_PHI; row++) {
      const value = grid[row * GRID_THETA + col]!;
      if (value < lo) lo = value;
      if (value > hi) hi = value;
    }
    if (hi > 0) maxPhiSpread = Math.max(maxPhiSpread, (hi - lo) / hi);
  }
  if (peakCandela > 0) {
    for (let i = 0; i < grid.length; i++) grid[i]! /= peakCandela;
  }

  return {
    assetId,
    fileName,
    photometry,
    distribution,
    profile,
    grid,
    isAsymmetric: maxPhiSpread > 0.02,
    peakCandela,
    truePeakCandela,
    beamAngleDeg,
    lumens: integrateFlux(distribution)
  };
};

const cache = new Map<string, IesAsset>();
/** IndexedDBを引いた結果、原本が無かった assetId。UIで「再選択が必要」を出す。 */
const missing = new Set<string>();
const pending = new Set<string>();
const listeners = new Set<() => void>();
let version = 0;

const bump = () => {
  version += 1;
  for (const listener of listeners) listener();
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const snapshot = () => version;

/** IESの解決状態が変わったら再描画させるためのバージョン。 */
export const useIesVersion = (): number => useSyncExternalStore(subscribe, snapshot, snapshot);

export const getCachedIesAsset = (assetId: string): IesAsset | undefined => cache.get(assetId);

export const isIesAssetMissing = (assetId: string): boolean => missing.has(assetId);

/** この器具に適用済みで、かつ原本が解決できているIES。無ければ undefined（ビーム角近似へ）。 */
export const resolveFixtureIes = (fixture: LightFixture): IesAsset | undefined => {
  const reference = fixture.ies;
  if (!reference || !supportsIes(fixture)) return undefined;
  return cache.get(reference.assetId);
};

const sha256Hex = async (bytes: Uint8Array): Promise<string> => {
  const digest = await crypto.subtle.digest("SHA-256", bytes as unknown as BufferSource);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

/**
 * 使用者が選んだ .ies を取り込む。
 * 解析に失敗したら例外を投げ、IndexedDBもキャッシュも一切更新しない
 * （呼び出し側も照明を更新しないこと）。例外の message はそのまま拒否理由として表示できる。
 */
export const importIesFile = async (file: File): Promise<IesAsset> => {
  if (file.size > IES_MAX_BYTES) {
    throw new Error(
      `ファイルが大きすぎます (${Math.round(file.size / 1024)}KB / 上限 ${IES_MAX_BYTES / 1024}KB)`
    );
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const source = new TextDecoder("utf-8").decode(bytes);
  const assetId = await sha256Hex(bytes);
  const asset = buildAsset(assetId, file.name, source); // ここで throw されれば副作用ゼロ

  await putIesAsset({
    id: assetId,
    fileName: file.name,
    source,
    importedAt: new Date().toISOString()
  });
  cache.set(assetId, asset);
  missing.delete(assetId);
  bump();
  return asset;
};

const loadIesAsset = async (assetId: string) => {
  if (cache.has(assetId) || pending.has(assetId) || missing.has(assetId)) return;
  pending.add(assetId);
  try {
    const record = await getIesAsset(assetId);
    if (!record) {
      missing.add(assetId);
      return;
    }
    cache.set(assetId, buildAsset(record.id, record.fileName, record.source));
  } catch {
    // 破損レコード・DB障害は「原本なし」と同じ扱い。参照は残すのでUIで再選択できる。
    missing.add(assetId);
  } finally {
    pending.delete(assetId);
    bump();
  }
};

/** 起動時・プロジェクト読込時に、参照されている assetId の原本をIndexedDBから復帰させる。 */
export const useIesHydration = (lights: readonly LightFixture[]) => {
  const assetIds = lights
    .map((light) => light.ies?.assetId)
    .filter((id): id is string => typeof id === "string")
    .sort()
    .join(",");
  useEffect(() => {
    if (!assetIds) return;
    for (const assetId of new Set(assetIds.split(","))) void loadIesAsset(assetId);
  }, [assetIds]);
};

// --- 水平角(φ)の基準方向 ---------------------------------------------------
// 非対称配光を照度計算と描画で一致させるには、両者が同じ φ=0 方向を使う必要がある。
// パストレーサ側の基底は自分では選べず、three-gpu-pathtracer が
// Matrix4.lookAt(位置, 照射先, worldUp) の x 軸として決める（LightsInfoUniformStruct）。
// そこでこちらも同じ式で u を再現し、それを唯一の基準とする。
const WORLD_UP = new THREE.Vector3(0, 1, 0);
const basisMatrix = new THREE.Matrix4();
const basisU = new THREE.Vector3();
const basisV = new THREE.Vector3();
const basisZ = new THREE.Vector3();

/**
 * パストレーサが使うのと同一の φ=0 基準ベクトル（ワールド座標）を返す。
 * 器具のY回転ぶんだけ光軸まわりに回し、非対称配光の向きを使用者が変えられるようにする。
 * axisEmission は光の進む向き（下向きなら (0,-1,0)）。
 */
export const iesAzimuthReference = (
  position: { x: number; y: number; z: number },
  target: { x: number; y: number; z: number },
  axisEmission: { x: number; y: number; z: number },
  rotationYDeg: number
): { x: number; y: number; z: number } => {
  basisMatrix.lookAt(
    new THREE.Vector3(position.x, position.y, position.z),
    new THREE.Vector3(target.x, target.y, target.z),
    WORLD_UP
  );
  basisMatrix.extractBasis(basisU, basisV, basisZ);
  // localAngles は φ を ref → cross(axis, ref) 向きに測る。光軸まわりに -rotY 回すと、
  // ワールドY軸まわりの three.js 正回転（+X が -Z へ向かう）と一致する。
  basisU.applyAxisAngle(
    new THREE.Vector3(axisEmission.x, axisEmission.y, axisEmission.z).normalize(),
    -degToRad(rotationYDeg)
  );
  return { x: basisU.x, y: basisU.y, z: basisU.z };
};

/**
 * 描画用の iesMap テクスチャを作る。呼び出しごとに新しい DataTexture を返す
 * （grid の Float32Array は回転が同じなら共有）。編集シーンとPNGレンダーシーンで
 * テクスチャを共有しないので、片方の dispose がもう片方を壊さない。
 *
 * u=θ / v=φ のレイアウト。パッチ済みシェーダは両軸を読み、万一パッチが当たらなかった
 * 場合でも上流の実装は v=0（＝φ=0 の断面）を読むので、破綻せず断面表示に留まる。
 */
export const createIesTexture = (asset: IesAsset, rotationYDeg: number): THREE.DataTexture => {
  const texture = new THREE.DataTexture(
    rotateIesGrid(asset.grid, rotationYDeg),
    GRID_THETA,
    GRID_PHI,
    THREE.RedFormat,
    THREE.FloatType
  );
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping; // θ 方向は端で止める
  texture.wrapT = THREE.RepeatWrapping; // φ 方向は巻き付ける
  texture.needsUpdate = true;
  return texture;
};

/**
 * 器具のY回転を行(φ)方向のシフトとしてグリッドへ焼き込む。
 * シェーダ側には器具ごとのφオフセットを渡す口が無いため、テクスチャ側で回す。
 * φ_ies = φ_uv + rotY に対応する（iesAzimuthReference の回転と表裏一体）。
 */
const rotateIesGrid = (grid: Float32Array, rotationYDeg: number): Float32Array => {
  const shift = Math.round((((rotationYDeg % 360) + 360) % 360) / 360 * GRID_PHI);
  if (shift === 0) return grid;
  const rotated = new Float32Array(grid.length);
  for (let row = 0; row < GRID_PHI; row++) {
    const source = (row + shift) % GRID_PHI;
    rotated.set(grid.subarray(source * GRID_THETA, (source + 1) * GRID_THETA), row * GRID_THETA);
  }
  return rotated;
};

/**
 * IES由来のパラメータを SpotLight 系の光源へ流し込む。編集シーンとPNGレンダーシーンで
 * 同じ変換を使うための共通化。ライトオブジェクト自体とテクスチャは呼び出し側が
 * それぞれ自分のものを作り、自分で dispose する（共有しない）。
 *
 * 引数の型で iesMap を要求しているのは、three-gpu-pathtracer の実装が読むのが
 * iesMap で、同梱 d.ts の PhysicalSpotLight.iesTexture が実体と一致しないため。
 */
export const applyIesToSpotLight = (
  light: THREE.SpotLight & { iesMap?: THREE.Texture | null },
  fixture: LightFixture,
  asset: IesAsset,
  iesMap: THREE.DataTexture
) => {
  light.color.copy(colorTemperatureToLinearColor(fixture.colorTemperatureK));
  // 光束・配光形状はIES由来。ON/OFFと調光率だけ使用者設定を掛ける（二重適用しない）。
  light.intensity = asset.peakCandela * fixtureDimScale(fixture);
  // コーン角は代表ビーム角。ラスター近似の見た目用で、パストレ側は iesMap が減衰を担う。
  light.angle = Math.min(Math.PI / 2 - 1e-3, degToRad(asset.beamAngleDeg / 2));
  light.penumbra = fixture.penumbra;
  light.distance = 0;
  light.decay = 2;
  light.iesMap = iesMap;
};

// テスト用: モジュールキャッシュを空に戻す。
export const __resetIesCacheForTest = () => {
  cache.clear();
  missing.clear();
  pending.clear();
  bump();
};
