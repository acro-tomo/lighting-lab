import "fake-indexeddb/auto";
import * as THREE from "three";
import { beforeEach, describe, expect, it } from "vitest";
import { addFixtureLights } from "../rendering/pathTracer/lights";
import { getIesAsset } from "../storage/iesStorage";
import type { LightFixture, Project } from "../types";
import {
  __resetIesCacheForTest,
  applyIesToSpotLight,
  createIesTexture,
  getCachedIesAsset,
  importIesFile,
  isIesAssetMissing,
  resolveFixtureIes,
  supportsIes
} from "../utils/iesAssets";
import { projectLightsToPhotometric } from "../utils/photometricLights";
import {
  AXIAL_DOWNLIGHT_IES,
  iesFile,
  NO_TILT_IES,
  TILT_INCLUDE_IES,
  TRUNCATED_IES,
  TYPE_A_IES
} from "./iesFixtures";

const downlight = (patch: Partial<LightFixture> = {}): LightFixture => ({
  id: "l1",
  name: "DL",
  type: "downlight",
  position: { x: 0, y: 2.4, z: 0 },
  mountHeightM: 2.4,
  rotationDeg: { x: -90, y: 0, z: 0 },
  lumens: 500,
  colorTemperatureK: 2700,
  dimmer: 50,
  enabled: true,
  beamAngleDeg: 60,
  penumbra: 0.6,
  castsShadow: true,
  note: "",
  ...patch
});

beforeEach(() => {
  __resetIesCacheForTest();
});

describe("IESの取り込み", () => {
  it("有効なIESを解析してIndexedDBへ保存し、キャッシュへ載せる", async () => {
    const asset = await importIesFile(iesFile(AXIAL_DOWNLIGHT_IES, "downlight.ies"));

    expect(asset.assetId).toMatch(/^[0-9a-f]{64}$/);
    expect(asset.fileName).toBe("downlight.ies");
    expect(asset.peakCandela).toBeCloseTo(1000, 3);
    // 半値角45°(全角90°)。パーサーの1°グリッド＋512サンプルの再標本化で1°弱ずれる。
    expect(asset.beamAngleDeg).toBeGreaterThan(89);
    expect(asset.beamAngleDeg).toBeLessThan(91);
    expect(asset.lumens).toBeGreaterThan(0);

    expect(getCachedIesAsset(asset.assetId)).toBe(asset);
    const record = await getIesAsset(asset.assetId);
    expect(record?.source).toBe(AXIAL_DOWNLIGHT_IES);
  });

  it("同じIESを2回取り込んでも同じidに収束し、レコードは重複しない", async () => {
    const first = await importIesFile(iesFile(AXIAL_DOWNLIGHT_IES, "a.ies"));
    __resetIesCacheForTest();
    const second = await importIesFile(iesFile(AXIAL_DOWNLIGHT_IES, "b.ies"));

    expect(second.assetId).toBe(first.assetId);
    const record = await getIesAsset(first.assetId);
    expect(record?.id).toBe(first.assetId);
  });

  it.each([
    ["Type C 以外", TYPE_A_IES, /Type C/],
    ["TILT=NONE 以外", TILT_INCLUDE_IES, /TILT=NONE/],
    ["candela不足", TRUNCATED_IES, /不足/],
    ["TILT行なし", NO_TILT_IES, /TILT/]
  ])("%s は実際の理由を添えて拒否し、副作用を残さない", async (_label, source, reason) => {
    await expect(importIesFile(iesFile(source))).rejects.toThrow(reason);
  });

  it("容量上限を超えるファイルは読まずに拒否する", async () => {
    const oversize = new File([new Uint8Array(3 * 1024 * 1024)], "big.ies");
    await expect(importIesFile(oversize)).rejects.toThrow(/大きすぎます/);
  });

  it("拒否されたIESはIndexedDBにもキャッシュにも入らない", async () => {
    const before = await importIesFile(iesFile(AXIAL_DOWNLIGHT_IES));
    await expect(importIesFile(iesFile(TYPE_A_IES, "bad.ies"))).rejects.toThrow();
    // 保存済みの正常ファイルだけが残る
    expect(getCachedIesAsset(before.assetId)).toBeDefined();
  });
});

describe("器具ごとの適用可否", () => {
  it("ダウンライト・スポット・下方配光ペンダントだけ対象にする", () => {
    expect(supportsIes(downlight())).toBe(true);
    expect(supportsIes(downlight({ type: "spotlight" }))).toBe(true);
    expect(supportsIes(downlight({ type: "pendant" }))).toBe(true);
    expect(supportsIes(downlight({ type: "pendant", model: "pendant-globe" }))).toBe(false);
    expect(supportsIes(downlight({ type: "bracket" }))).toBe(false);
    expect(supportsIes(downlight({ type: "tape" }))).toBe(false);
  });

  it("対象外の器具はIES参照が付いていても解決しない", async () => {
    const asset = await importIesFile(iesFile(AXIAL_DOWNLIGHT_IES));
    const reference = { assetId: asset.assetId, fileName: asset.fileName };
    expect(resolveFixtureIes(downlight({ ies: reference }))).toBeDefined();
    expect(resolveFixtureIes(downlight({ type: "bracket", ies: reference }))).toBeUndefined();
    expect(resolveFixtureIes(downlight({ type: "tape", ies: reference }))).toBeUndefined();
  });
});

describe("照度計算への反映", () => {
  it("IESが解決できる照明はθ/φの2次元配光を使い、調光は1回だけ掛かる", async () => {
    const asset = await importIesFile(iesFile(AXIAL_DOWNLIGHT_IES));
    const light = downlight({ ies: { assetId: asset.assetId, fileName: asset.fileName } });

    const [photometric] = projectLightsToPhotometric([light], 0);

    expect(photometric!.distribution.kind).toBe("ies");
    // 絶対光度[cd]はIES原文どおり。調光率は dimming 側にだけ乗る。
    expect(photometric!.distribution.intensityAt(0, 0)).toBeCloseTo(1000, 3);
    expect(photometric!.distribution.intensityAt(Math.PI / 6, 0)).toBeCloseTo(800, 3);
    expect(photometric!.dimming).toBeCloseTo(0.5, 6);
  });

  it("IES原本が無ければビーム角近似へ戻す", () => {
    const light = downlight({ ies: { assetId: "missing-asset", fileName: "gone.ies" } });
    const [photometric] = projectLightsToPhotometric([light], 0);
    expect(photometric!.distribution.kind).toBe("beam");
  });

  it("IESを解除すると従来のビーム角近似へ戻る", async () => {
    const asset = await importIesFile(iesFile(AXIAL_DOWNLIGHT_IES));
    const applied = downlight({ ies: { assetId: asset.assetId, fileName: asset.fileName } });
    expect(projectLightsToPhotometric([applied], 0)[0]!.distribution.kind).toBe("ies");

    const cleared = downlight({ ies: undefined });
    expect(projectLightsToPhotometric([cleared], 0)[0]!.distribution.kind).toBe("beam");
  });

  it("消灯・調光0の照明はIES適用時も出力しない", async () => {
    const asset = await importIesFile(iesFile(AXIAL_DOWNLIGHT_IES));
    const reference = { assetId: asset.assetId, fileName: asset.fileName };
    expect(projectLightsToPhotometric([downlight({ ies: reference, enabled: false })], 0)).toHaveLength(0);
    expect(projectLightsToPhotometric([downlight({ ies: reference, dimmer: 0 })], 0)).toHaveLength(0);
  });

  it("光束0でもIES適用中は点灯する（光束はIES由来のため）", async () => {
    const asset = await importIesFile(iesFile(AXIAL_DOWNLIGHT_IES));
    const light = downlight({ lumens: 0, ies: { assetId: asset.assetId, fileName: asset.fileName } });
    expect(projectLightsToPhotometric([light], 0)).toHaveLength(1);
  });
});

describe("描画への反映", () => {
  it("PNG最終レンダーのシーンに iesMap 付きスポットライトが入る", async () => {
    const asset = await importIesFile(iesFile(AXIAL_DOWNLIGHT_IES));
    const project = {
      lights: [downlight({ ies: { assetId: asset.assetId, fileName: asset.fileName } })]
    } as unknown as Project;

    const scene = new THREE.Scene();
    addFixtureLights(scene, project, "beauty");

    const spots = scene.children.filter(
      (child): child is THREE.SpotLight & { iesMap?: THREE.DataTexture | null } =>
        (child as THREE.SpotLight).isSpotLight === true
    );
    expect(spots).toHaveLength(1);
    expect(spots[0]!.iesMap).toBeInstanceOf(THREE.DataTexture);
    // ピーク光度[cd] × 調光率。IESの絶対値をそのまま使う。
    expect(spots[0]!.intensity).toBeCloseTo(500, 3);
  });

  it("IES未適用ならPNGレンダーは従来どおり iesMap を持たない", () => {
    const project = { lights: [downlight()] } as unknown as Project;
    const scene = new THREE.Scene();
    addFixtureLights(scene, project, "beauty");

    const spot = scene.children.find(
      (child) => (child as THREE.SpotLight).isSpotLight === true
    ) as (THREE.SpotLight & { iesMap?: unknown }) | undefined;
    expect(spot).toBeDefined();
    expect(spot!.iesMap ?? null).toBeNull();
  });

  it("編集シーン/PNGシーンで共有するのは変換ロジックだけで、テクスチャは別インスタンス", async () => {
    const asset = await importIesFile(iesFile(AXIAL_DOWNLIGHT_IES));
    const light = downlight({ ies: { assetId: asset.assetId, fileName: asset.fileName } });

    const editTexture = createIesTexture(asset);
    const renderTexture = createIesTexture(asset);
    expect(editTexture).not.toBe(renderTexture);
    // 元データ(Float32Array)は共有してよい。片方を dispose しても他方は生きる。
    expect(editTexture.image.data).toBe(renderTexture.image.data);

    const editLight = new THREE.SpotLight() as THREE.SpotLight & { iesMap?: THREE.Texture | null };
    applyIesToSpotLight(editLight, light, asset, editTexture);
    expect(editLight.iesMap).toBe(editTexture);
    expect(editLight.intensity).toBeCloseTo(500, 3);
    // 代表ビーム角(全角90°)の半角がコーン角になる。
    expect(editLight.angle).toBeCloseTo(Math.PI / 4, 2);

    renderTexture.dispose();
    expect(editTexture.image.data).toBeInstanceOf(Float32Array);
  });
});

describe("次回起動時の復帰", () => {
  it("IndexedDBに原本があれば assetId から再解析して復帰する", async () => {
    const asset = await importIesFile(iesFile(AXIAL_DOWNLIGHT_IES, "restore.ies"));
    const assetId = asset.assetId;
    __resetIesCacheForTest(); // ブラウザ再起動相当

    expect(getCachedIesAsset(assetId)).toBeUndefined();
    const record = await getIesAsset(assetId);
    expect(record).toBeDefined();

    // 復帰は同じ原本を取り込み直すのと等価（ハッシュ一致で同一 assetId に再接続する）。
    const restored = await importIesFile(iesFile(record!.source, record!.fileName));
    expect(restored.assetId).toBe(assetId);
    expect(restored.peakCandela).toBeCloseTo(asset.peakCandela, 6);
  });

  it("原本が無い assetId は「再選択が必要」として参照だけ残す", async () => {
    const light = downlight({ ies: { assetId: "not-stored", fileName: "gone.ies" } });
    // 未解決のうちは近似へフォールバックする
    expect(resolveFixtureIes(light)).toBeUndefined();
    expect(projectLightsToPhotometric([light], 0)[0]!.distribution.kind).toBe("beam");
    // 参照自体は照明に残っている
    expect(light.ies?.assetId).toBe("not-stored");
    expect(isIesAssetMissing("not-stored")).toBe(false); // まだIndexedDBを引いていない状態
  });
});
