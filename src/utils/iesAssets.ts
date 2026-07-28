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

// 描画用の軸対称プロファイル解像度。three-gpu-pathtracer は全 iesMap を
// 1つの sampler2DArray にまとめるため、全器具で同じ幅でなければならない。
const PROFILE_RESOLUTION = 512;
const PROFILE_PHI_SAMPLES = 8;

export type IesAsset = {
  assetId: string;
  fileName: string;
  photometry: IesPhotometry;
  /** 照度計算用。θ/φ の完全な2次元配光（絶対光度[cd]、調光は含まない）。 */
  distribution: LightDistribution;
  /** 描画用。φ平均した I(θ)/peak を θ∈[0,π] で等分割した軸対称プロファイル。 */
  profile: Float32Array;
  /** profile のピーク光度 [cd]（調光1.0時）。 */
  peakCandela: number;
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

  const profile = new Float32Array(PROFILE_RESOLUTION);
  let peakCandela = 0;
  for (let i = 0; i < PROFILE_RESOLUTION; i++) {
    const theta = (i / (PROFILE_RESOLUTION - 1)) * Math.PI;
    let sum = 0;
    for (let j = 0; j < PROFILE_PHI_SAMPLES; j++) {
      sum += distribution.intensityAt(theta, (j / PROFILE_PHI_SAMPLES) * 2 * Math.PI);
    }
    const value = sum / PROFILE_PHI_SAMPLES;
    profile[i] = value;
    if (value > peakCandela) peakCandela = value;
  }
  if (peakCandela > 0) {
    for (let i = 0; i < PROFILE_RESOLUTION; i++) profile[i]! /= peakCandela;
  }

  // 代表ビーム角: ピークの50%以上になる最も外側の θ の2倍（全角）。
  // バットウィング配光のようにピークが光軸上に無い場合も外縁を拾える。
  let lastHalfPower = 0;
  for (let i = 0; i < PROFILE_RESOLUTION; i++) {
    if (profile[i]! >= 0.5) lastHalfPower = i;
  }
  const beamAngleDeg = clamp((lastHalfPower / (PROFILE_RESOLUTION - 1)) * 360, 1, 180);

  return {
    assetId,
    fileName,
    photometry,
    distribution,
    profile,
    peakCandela,
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

/**
 * 描画用の iesMap テクスチャを作る。呼び出しごとに新しい DataTexture を返す
 * （profile の Float32Array だけ共有）。編集シーンとPNGレンダーシーンで
 * テクスチャを共有しないので、片方の dispose がもう片方を壊さない。
 */
export const createIesTexture = (asset: IesAsset): THREE.DataTexture => {
  const texture = new THREE.DataTexture(
    asset.profile,
    asset.profile.length,
    1,
    THREE.RedFormat,
    THREE.FloatType
  );
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
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
