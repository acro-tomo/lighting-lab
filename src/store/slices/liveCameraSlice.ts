import type { StateCreator } from "zustand";
import type { ProjectStore } from "../projectStore";

// 一時状態（非永続）: 3Dカメラの現在地を2D平面図にリアルタイム表示するための土台。
// x,z=カメラのワールド座標(m, XZ平面)、tx,tz=注視点のワールド座標(m, XZ平面)。
export type LiveCameraPose = { x: number; z: number; tx: number; tz: number } | null;

export interface LiveCameraSlice {
  liveCamera: LiveCameraPose;
  setLiveCamera: (pose: LiveCameraPose) => void;
}

export const createLiveCameraSlice: StateCreator<ProjectStore, [], [], LiveCameraSlice> = (set) => ({
  liveCamera: null,
  setLiveCamera: (pose) => set({ liveCamera: pose })
});
