import { create } from "zustand";
import type { ClipboardSlice } from "./slices/clipboardSlice";
import { createClipboardSlice } from "./slices/clipboardSlice";
import type { CompareShotsSlice } from "./slices/compareShotsSlice";
import { createCompareShotsSlice } from "./slices/compareShotsSlice";
import type { HistorySlice } from "./slices/historySlice";
import { createHistorySlice } from "./slices/historySlice";
import type { LiveCameraSlice } from "./slices/liveCameraSlice";
import { createLiveCameraSlice } from "./slices/liveCameraSlice";
import type { ObjectsSlice } from "./slices/objectsSlice";
import { createObjectsSlice } from "./slices/objectsSlice";
import type { ProjectSlice } from "./slices/projectSlice";
import { createProjectSlice } from "./slices/projectSlice";
import type { SceneSlice } from "./slices/sceneSlice";
import { createSceneSlice } from "./slices/sceneSlice";
import type { SelectionSlice } from "./slices/selectionSlice";
import { createSelectionSlice } from "./slices/selectionSlice";

// ストア本体は各スライスを合成するだけの薄い定義。責務ごとの実装は ./slices/ を参照。
// - projectSlice: プロジェクトの読込/初期化/ジオメトリ一括削除/階切替
// - objectsSlice: 家具/照明/壁/窓/void/ゾーン・マテリアル・背景図の CRUD
// - clipboardSlice: 選択オブジェクトのコピー&ペースト
// - selectionSlice: 選択状態（単一選択・ライト複数選択）
// - historySlice: undo/redo 履歴
// - sceneSlice: カメラ・採光・天井/床レベルなどシーン設定
// - liveCameraSlice: 3Dカメラの現在地（2D平面へのリアルタイム表示用、非永続）
// - compareShotsSlice: 比較ギャラリー（レンダリング結果の保存）
export type ProjectStore = ProjectSlice &
  ObjectsSlice &
  ClipboardSlice &
  SelectionSlice &
  HistorySlice &
  SceneSlice &
  LiveCameraSlice &
  CompareShotsSlice;

export const useProjectStore = create<ProjectStore>()((...args) => ({
  ...createProjectSlice(...args),
  ...createObjectsSlice(...args),
  ...createClipboardSlice(...args),
  ...createSelectionSlice(...args),
  ...createHistorySlice(...args),
  ...createSceneSlice(...args),
  ...createLiveCameraSlice(...args),
  ...createCompareShotsSlice(...args)
}));
