// アプリ共通の IndexedDB ハンドル。プロジェクト自動保存とIES原本が同じDBを使う。
// v1(projects のみ) からの移行では projects をそのまま残し iesAssets を足すだけ。
const DB_NAME = "ldk-lighting-lab";
const DB_VERSION = 2;

export const PROJECT_STORE = "projects";
export const IES_STORE = "iesAssets";

export const openDatabase = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(PROJECT_STORE)) {
        db.createObjectStore(PROJECT_STORE);
      }
      if (!db.objectStoreNames.contains(IES_STORE)) {
        db.createObjectStore(IES_STORE, { keyPath: "id" });
      }
    };

    // 旧バージョンを開いたままのタブがあると v2 への upgrade が無期限に待たされる。
    // 自分は versionchange で必ず閉じ、他タブに掴まれている場合は待たずに失敗させる
    // （呼び出し側が「保存できない」と伝えられるように）。
    request.onblocked = () =>
      reject(new Error("他のタブがこのアプリを開いています。他のタブを閉じてから再読み込みしてください。"));

    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    request.onerror = () => reject(request.error);
  });
