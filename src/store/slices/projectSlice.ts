import type { StateCreator } from "zustand";
import { demoProject } from "../../data/demoProject";
import type { Project } from "../../types";
import { cloneProject } from "../../utils/units";
import type { ProjectStore } from "../projectStore";
import { withHistory } from "./historySlice";

export interface ProjectSlice {
  project: Project;
  setProject: (project: Project) => void;
  resetDemo: () => void;
  clearGeometry: () => void;
  clearActiveFloorGeometry: () => void;
  setActiveFloor: (floor: 1 | 2) => void;
}

export const createProjectSlice: StateCreator<ProjectStore, [], [], ProjectSlice> = (set) => ({
  project: cloneProject(demoProject),
  setProject: (project) =>
    set({
      project,
      selection: null,
      selectedLightIds: [],
      history: [],
      future: [],
      historyGroupBase: null
    }),
  resetDemo: () =>
    set({
      project: cloneProject(demoProject),
      selection: null,
      selectedLightIds: [],
      history: [],
      future: [],
      historyGroupBase: null,
      compareShots: []
    }),
  // 間取り図トレース用に、部屋枠以外のジオメトリを一括削除してまっさらにする。
  clearGeometry: () =>
    set((state) => {
      const nextProject = cloneProject(state.project);
      nextProject.walls = [];
      nextProject.windows = [];
      nextProject.voids = [];
      nextProject.ceilingZones = [];
      nextProject.floorZones = [];
      nextProject.furniture = [];
      nextProject.lights = [];
      return { ...withHistory(state, nextProject), selection: null, selectedLightIds: [] };
    }),
  clearActiveFloorGeometry: () =>
    set((state) => {
      const floor = state.project.activeFloor ?? 1;
      const nextProject = cloneProject(state.project);
      const removedWallIds = new Set(
        nextProject.walls.filter((wall) => (wall.floor ?? 1) === floor).map((wall) => wall.id)
      );
      nextProject.walls = nextProject.walls.filter((wall) => (wall.floor ?? 1) !== floor);
      nextProject.windows = nextProject.windows.filter(
        (windowItem) => (windowItem.floor ?? 1) !== floor && !removedWallIds.has(windowItem.wallId)
      );
      nextProject.voids = nextProject.voids.filter((voidArea) => (voidArea.floor ?? 1) !== floor);
      nextProject.ceilingZones = (nextProject.ceilingZones ?? []).filter((zone) => (zone.floor ?? 1) !== floor);
      nextProject.floorZones = (nextProject.floorZones ?? []).filter((zone) => (zone.floor ?? 1) !== floor);
      nextProject.furniture = nextProject.furniture.filter((item) => (item.floor ?? 1) !== floor);
      nextProject.lights = nextProject.lights.filter((light) => (light.floor ?? 1) !== floor);
      return { ...withHistory(state, nextProject), selection: null, selectedLightIds: [] };
    }),
  // 活性階の単純切替（undo対象外）。selection はクリアする。
  setActiveFloor: (floor) =>
    set((state) => ({
      project: { ...state.project, activeFloor: floor },
      selection: null,
      selectedLightIds: []
    }))
});
