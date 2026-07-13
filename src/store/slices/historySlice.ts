import type { StateCreator } from "zustand";
import type { Project } from "../../types";
import { cloneProject } from "../../utils/units";
import type { ProjectStore } from "../projectStore";

export interface HistorySlice {
  history: Project[];
  future: Project[];
  undo: () => void;
  redo: () => void;
}

// 各スライスの更新系アクションから呼ばれる共通ヘルパー。history に直前状態を積み、future をクリアする。
export const withHistory = (
  state: Pick<ProjectStore, "project" | "history">,
  nextProject: Project
) => ({
  project: nextProject,
  history: [...state.history.slice(-39), cloneProject(state.project)],
  future: []
});

export const createHistorySlice: StateCreator<ProjectStore, [], [], HistorySlice> = (set, get) => ({
  history: [],
  future: [],
  undo: () => {
    const { history, project } = get();
    const previous = history.at(-1);
    if (!previous) return;
    set({
      project: previous,
      history: history.slice(0, -1),
      future: [cloneProject(project), ...get().future]
    });
  },
  redo: () => {
    const { future, project, history } = get();
    const next = future[0];
    if (!next) return;
    set({
      project: next,
      history: [...history, cloneProject(project)],
      future: future.slice(1)
    });
  }
});
