import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { IES_STORE, openDatabase, PROJECT_STORE } from "../storage/db";
import { getIesAsset, putIesAsset } from "../storage/iesStorage";

// v1 相当（projects ストアだけ）のDBを先に作る。
const openLegacyV1 = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("ldk-lighting-lab", 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(PROJECT_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const putRaw = (db: IDBDatabase, store: string, value: unknown, key?: IDBValidKey) =>
  new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(store, "readwrite");
    transaction.objectStore(store).put(value, key);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });

const getRaw = (db: IDBDatabase, store: string, key: IDBValidKey) =>
  new Promise<unknown>((resolve, reject) => {
    const transaction = db.transaction(store, "readonly");
    const request = transaction.objectStore(store).get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const countRaw = (db: IDBDatabase, store: string) =>
  new Promise<number>((resolve, reject) => {
    const transaction = db.transaction(store, "readonly");
    const request = transaction.objectStore(store).count();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

describe("IndexedDB v1 → v2 移行", () => {
  it("既存のプロジェクト保存を残したまま iesAssets ストアを足す", async () => {
    const legacy = await openLegacyV1();
    expect(legacy.version).toBe(1);
    await putRaw(legacy, PROJECT_STORE, { id: "p1", name: "旧プロジェクト" }, "current-project");
    legacy.close();

    const upgraded = await openDatabase();
    expect(upgraded.version).toBe(2);
    expect(upgraded.objectStoreNames.contains(PROJECT_STORE)).toBe(true);
    expect(upgraded.objectStoreNames.contains(IES_STORE)).toBe(true);

    // v1 で保存したプロジェクトがそのまま読める
    expect(await getRaw(upgraded, PROJECT_STORE, "current-project")).toEqual({
      id: "p1",
      name: "旧プロジェクト"
    });
    upgraded.close();
  });

  it("同じidのIESを繰り返し保存してもレコードは1件のまま", async () => {
    const record = {
      id: "sha256-dummy",
      fileName: "a.ies",
      source: "TILT=NONE",
      importedAt: "2026-07-28T00:00:00.000Z"
    };
    await putIesAsset(record);
    await putIesAsset({ ...record, fileName: "b.ies", importedAt: "2026-07-29T00:00:00.000Z" });

    const db = await openDatabase();
    expect(await countRaw(db, IES_STORE)).toBe(1);
    db.close();

    // 後勝ちで同じキーを上書きする（原本は同じなので内容は変わらない）
    expect((await getIesAsset("sha256-dummy"))?.fileName).toBe("b.ies");
  });

  it("未登録のidは undefined を返す（欠損として扱える）", async () => {
    expect(await getIesAsset("unknown-id")).toBeUndefined();
  });
});
