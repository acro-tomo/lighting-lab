import type { StateCreator } from "zustand";
import type { Selection } from "../../types";
import type { ProjectStore } from "../projectStore";

export interface SelectionSlice {
  selection: Selection;
  // 一時状態（非永続・undo対象外）: Shift+クリックによるライトの複数選択。
  selectedLightIds: string[];
  select: (selection: Selection) => void;
  toggleLightSelection: (id: string) => void;
  clearLightSelection: () => void;
}

export const createSelectionSlice: StateCreator<ProjectStore, [], [], SelectionSlice> = (set) => ({
  selection: null,
  selectedLightIds: [],
  // 通常の単一選択。Shift+クリックの複数選択は toggleLightSelection 側で行うため、
  // ここでは複数選択をリセットする（普通のクリックで複数選択を解除）。
  select: (selection) => set({ selection, selectedLightIds: [] }),
  toggleLightSelection: (id) =>
    set((state) =>
      state.selectedLightIds.includes(id)
        ? { selectedLightIds: state.selectedLightIds.filter((lightId) => lightId !== id) }
        : { selectedLightIds: [...state.selectedLightIds, id] }
    ),
  clearLightSelection: () => set({ selectedLightIds: [] })
});
