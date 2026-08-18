import { IES_STORE, openDatabase } from "./db";

// IES原本のローカル保存。プロジェクトJSONには入れず、この端末・このブラウザにだけ残す。
// id は原本バイト列の SHA-256 なので、同じIESを何度取り込んでも同一レコードに収束する
// （keyPath: "id" の put が重複を防ぐ）。
export type IesAssetRecord = {
  id: string;
  fileName: string;
  source: string;
  importedAt: string;
};

export const putIesAsset = async (record: IesAssetRecord) => {
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(IES_STORE, "readwrite");
      transaction.objectStore(IES_STORE).put(record);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  } finally {
    db.close();
  }
};

export const getIesAsset = async (id: string): Promise<IesAssetRecord | undefined> => {
  const db = await openDatabase();
  try {
    const raw = await new Promise<unknown>((resolve, reject) => {
      const transaction = db.transaction(IES_STORE, "readonly");
      const request = transaction.objectStore(IES_STORE).get(id);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    if (raw === undefined || raw === null) return undefined;
    const record = raw as Partial<IesAssetRecord>;
    if (typeof record.id !== "string" || typeof record.source !== "string") return undefined;
    return {
      id: record.id,
      fileName: typeof record.fileName === "string" ? record.fileName : record.id,
      source: record.source,
      importedAt: typeof record.importedAt === "string" ? record.importedAt : ""
    };
  } finally {
    db.close();
  }
};
