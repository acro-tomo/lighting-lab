import type { StateCreator } from "zustand";
import type { Daylight, Project } from "../../types";
import { cloneProject } from "../../utils/units";
import type { ProjectStore } from "../projectStore";
import { withHistory } from "./historySlice";

// sun.ts は別エージェントが用意予定。未作成時の型エラーを避けるためローカルにフォールバックを持つ。
const DEFAULT_DAYLIGHT: Daylight = {
  enabled: true,
  month: 10,
  day: 15,
  hour: 14,
  northOffsetDeg: 0,
  latitudeDeg: 35
};

// カメラ視点・採光・天井/床レベルなど、シーン全体設定の更新をまとめたスライス。
export interface SceneSlice {
  setCamera: (patch: Partial<Project["camera"]>) => void;
  setDaylight: (patch: Partial<Daylight>) => void;
  setShowCeiling: (value: boolean) => void;
  setCeilingHeight: (value: number) => void;
  setFloorLevel: (value: number) => void;
}

export const createSceneSlice: StateCreator<ProjectStore, [], [], SceneSlice> = (set) => ({
  setCamera: (patch) =>
    set((state) => {
      const nextProject = cloneProject(state.project);
      nextProject.camera = { ...nextProject.camera, ...patch };
      return withHistory(state, nextProject);
    }),
  setDaylight: (patch) =>
    set((state) => {
      const nextProject = cloneProject(state.project);
      nextProject.daylight = {
        ...DEFAULT_DAYLIGHT,
        ...nextProject.daylight,
        ...patch
      };
      return withHistory(state, nextProject);
    }),
  setShowCeiling: (value) =>
    set((state) =>
      withHistory(state, {
        ...cloneProject(state.project),
        showCeiling: value
      })
    ),
  setCeilingHeight: (value) =>
    set((state) => {
      const nextProject = cloneProject(state.project);
      nextProject.room = { ...nextProject.room, ceilingHeightM: Math.max(1.8, value) };
      return withHistory(state, nextProject);
    }),
  setFloorLevel: (value) =>
    set((state) => {
      const nextProject = cloneProject(state.project);
      nextProject.room = { ...nextProject.room, floorLevelM: Math.max(0, value) };
      return withHistory(state, nextProject);
    })
});
