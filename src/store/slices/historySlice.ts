import type { StateCreator } from "zustand";
import type { Project } from "../../types";
import { cloneProject } from "../../utils/units";
import type { ProjectStore } from "../projectStore";

export interface HistorySlice {
  history: Project[];
  future: Project[];
  historyGroupBase: Project | null;
  beginHistoryGroup: () => void;
  endHistoryGroup: () => void;
  undo: () => void;
  redo: () => void;
}

// 通常は直前状態を積み、グループ中は終了時にまとめて積む。
export const withHistory = (
  state: Pick<ProjectStore, "project" | "history" | "historyGroupBase">,
  nextProject: Project
) =>
  state.historyGroupBase
    ? { project: nextProject, future: [] }
    : {
        project: nextProject,
        history: [...state.history.slice(-39), cloneProject(state.project)],
        future: []
      };

export const createHistorySlice: StateCreator<ProjectStore, [], [], HistorySlice> = (set, get) => ({
  history: [],
  future: [],
  historyGroupBase: null,
  beginHistoryGroup: () => {
    const { historyGroupBase, project } = get();
    if (historyGroupBase) return;
    set({ historyGroupBase: project });
  },
  endHistoryGroup: () => {
    const { historyGroupBase, project, history } = get();
    if (!historyGroupBase) return;
    if (project === historyGroupBase) {
      set({ historyGroupBase: null });
      return;
    }
    set({
      history: [...history.slice(-39), cloneProject(historyGroupBase)],
      historyGroupBase: null
    });
  },
  undo: () => {
    const { history, project } = get();
    const previous = history.at(-1);
    if (!previous) {
      set({ historyGroupBase: null });
      return;
    }
    set({
      project: previous,
      history: history.slice(0, -1),
      future: [cloneProject(project), ...get().future],
      historyGroupBase: null
    });
  },
  redo: () => {
    const { future, project, history } = get();
    const next = future[0];
    if (!next) {
      set({ historyGroupBase: null });
      return;
    }
    set({
      project: next,
      history: [...history, cloneProject(project)],
      future: future.slice(1),
      historyGroupBase: null
    });
  }
});
