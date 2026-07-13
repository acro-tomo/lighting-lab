import type { StateCreator } from "zustand";
import type { CompareShot } from "../../types";
import type { ProjectStore } from "../projectStore";

export interface CompareShotsSlice {
  compareShots: CompareShot[];
  addCompareShot: (shot: CompareShot) => void;
  setCompareShots: (shots: CompareShot[]) => void;
  removeCompareShot: (id: string) => void;
}

export const createCompareShotsSlice: StateCreator<ProjectStore, [], [], CompareShotsSlice> = (set) => ({
  compareShots: [],
  addCompareShot: (shot) =>
    set((state) => ({
      compareShots: [shot, ...state.compareShots].slice(0, 6)
    })),
  setCompareShots: (shots) =>
    set({
      compareShots: shots.slice(0, 6)
    }),
  removeCompareShot: (id) =>
    set((state) => ({
      compareShots: state.compareShots.filter((shot) => shot.id !== id)
    }))
});
