import { projectSchema } from "../schema/projectSchema";
import type { Project } from "../types";

const DB_NAME = "ldk-lighting-lab";
const STORE_NAME = "projects";
const CURRENT_PROJECT_KEY = "current-project";

const openDatabase = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

export const saveProjectToIndexedDb = async (project: Project) => {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(project, CURRENT_PROJECT_KEY);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  db.close();
};

// スキーマ検証込みで読み込む。壊れた保存データは undefined を返し、
// 呼び出し側は初期（デモ）プロジェクトのまま起動する。
// passthrough で保持される旧 compareShots も残す（App 側で拾う）。
export const loadProjectFromIndexedDb = async (): Promise<
  (Project & { compareShots?: unknown }) | undefined
> => {
  const db = await openDatabase();
  const raw = await new Promise<unknown>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).get(CURRENT_PROJECT_KEY);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  db.close();
  if (raw === undefined || raw === null) return undefined;
  const parsed = projectSchema.safeParse(raw);
  return parsed.success ? (parsed.data as Project & { compareShots?: unknown }) : undefined;
};
