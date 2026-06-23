import { create } from "zustand";
import { demoProject } from "../data/demoProject";
import type {
  CompareShot,
  CameraView,
  FloorPlanBackground,
  FurnitureItem,
  LightFixture,
  LightingScene,
  Project,
  Selection,
  VoidArea,
  WindowOpening,
  WallSegment
} from "../types";
import { cloneProject } from "../utils/units";

type ProjectStore = {
  project: Project;
  selection: Selection;
  compareShots: CompareShot[];
  history: Project[];
  future: Project[];
  setProject: (project: Project) => void;
  resetDemo: () => void;
  undo: () => void;
  redo: () => void;
  select: (selection: Selection) => void;
  setActiveScene: (sceneId: string) => void;
  setActiveCameraView: (viewId: string) => void;
  addWall: (wall: WallSegment) => void;
  addWindow: (windowOpening: WindowOpening, selectionKind: "window" | "opening") => void;
  addFurniture: (item: FurnitureItem) => void;
  addLight: (light: LightFixture) => void;
  addVoid: (voidArea: VoidArea) => void;
  updateLight: (id: string, patch: Partial<LightFixture>) => void;
  setAllColorTemperature: (colorTemperatureK: number) => void;
  updateSceneLightState: (
    sceneId: string,
    lightId: string,
    patch: { enabled?: boolean; dimmer?: number }
  ) => void;
  updateFurniture: (id: string, patch: Partial<FurnitureItem>) => void;
  updateWall: (id: string, patch: Partial<WallSegment>) => void;
  updateWindow: (id: string, patch: Partial<WindowOpening>) => void;
  updateVoid: (id: string, patch: Partial<VoidArea>) => void;
  setBackgroundScale: (pixels: number, millimeters: number) => void;
  deleteSelection: (selection: Selection) => void;
  duplicateActiveScene: () => void;
  renameActiveScene: (name: string) => void;
  saveCameraView: (view: CameraView) => void;
  setBackgroundPlan: (backgroundPlan: FloorPlanBackground) => void;
  addCompareShot: (shot: CompareShot) => void;
  setCompareShots: (shots: CompareShot[]) => void;
  removeCompareShot: (id: string) => void;
};

const withHistory = (
  state: Pick<ProjectStore, "project" | "history">,
  nextProject: Project
) => ({
  project: nextProject,
  history: [...state.history.slice(-39), cloneProject(state.project)],
  future: []
});

export const useProjectStore = create<ProjectStore>((set, get) => ({
  project: cloneProject(demoProject),
  selection: null,
  compareShots: [],
  history: [],
  future: [],
  setProject: (project) =>
    set({
      project,
      selection: null,
      history: [],
      future: []
    }),
  resetDemo: () =>
    set({
      project: cloneProject(demoProject),
      selection: null,
      history: [],
      future: [],
      compareShots: []
    }),
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
  },
  select: (selection) => set({ selection }),
  setActiveScene: (sceneId) =>
    set((state) =>
      withHistory(state, {
        ...cloneProject(state.project),
        activeSceneId: sceneId
      })
    ),
  setActiveCameraView: (viewId) =>
    set((state) =>
      withHistory(state, {
        ...cloneProject(state.project),
        activeCameraViewId: viewId
      })
    ),
  addWall: (wall) =>
    set((state) => {
      const nextProject = cloneProject(state.project);
      nextProject.walls = [...nextProject.walls, wall];
      return {
        ...withHistory(state, nextProject),
        selection: { kind: "wall", id: wall.id }
      };
    }),
  addWindow: (windowOpening, selectionKind) =>
    set((state) => {
      const nextProject = cloneProject(state.project);
      nextProject.windows = [...nextProject.windows, windowOpening];
      return {
        ...withHistory(state, nextProject),
        selection: { kind: selectionKind, id: windowOpening.id }
      };
    }),
  addFurniture: (item) =>
    set((state) => {
      const nextProject = cloneProject(state.project);
      nextProject.furniture = [...nextProject.furniture, item];
      return {
        ...withHistory(state, nextProject),
        selection: { kind: "furniture", id: item.id }
      };
    }),
  addLight: (light) =>
    set((state) => {
      const nextProject = cloneProject(state.project);
      nextProject.lights = [...nextProject.lights, light];
      nextProject.lightingScenes = nextProject.lightingScenes.map((scene) => ({
        ...scene,
        lightStates: {
          ...scene.lightStates,
          [light.id]: { enabled: true, dimmer: light.dimmer }
        }
      }));
      return {
        ...withHistory(state, nextProject),
        selection: { kind: "light", id: light.id }
      };
    }),
  addVoid: (voidArea) =>
    set((state) => {
      const nextProject = cloneProject(state.project);
      nextProject.voids = [...nextProject.voids, voidArea];
      return {
        ...withHistory(state, nextProject),
        selection: { kind: "void", id: voidArea.id }
      };
    }),
  updateLight: (id, patch) =>
    set((state) => {
      const nextProject = cloneProject(state.project);
      nextProject.lights = nextProject.lights.map((light) =>
        light.id === id ? { ...light, ...patch } : light
      );
      return withHistory(state, nextProject);
    }),
  setAllColorTemperature: (colorTemperatureK) =>
    set((state) => {
      const nextProject = cloneProject(state.project);
      nextProject.lights = nextProject.lights.map((light) => ({ ...light, colorTemperatureK }));
      return withHistory(state, nextProject);
    }),
  updateSceneLightState: (sceneId, lightId, patch) =>
    set((state) => {
      const nextProject = cloneProject(state.project);
      nextProject.lightingScenes = nextProject.lightingScenes.map((scene) => {
        if (scene.id !== sceneId) return scene;
        const current = scene.lightStates[lightId] ?? { enabled: true, dimmer: 100 };
        return {
          ...scene,
          lightStates: {
            ...scene.lightStates,
            [lightId]: { ...current, ...patch }
          }
        };
      });
      return withHistory(state, nextProject);
    }),
  updateFurniture: (id, patch) =>
    set((state) => {
      const nextProject = cloneProject(state.project);
      nextProject.furniture = nextProject.furniture.map((item) =>
        item.id === id ? { ...item, ...patch } : item
      );
      return withHistory(state, nextProject);
    }),
  updateWall: (id, patch) =>
    set((state) => {
      const nextProject = cloneProject(state.project);
      nextProject.walls = nextProject.walls.map((wall) =>
        wall.id === id ? { ...wall, ...patch } : wall
      );
      return withHistory(state, nextProject);
    }),
  updateWindow: (id, patch) =>
    set((state) => {
      const nextProject = cloneProject(state.project);
      nextProject.windows = nextProject.windows.map((windowItem) =>
        windowItem.id === id ? { ...windowItem, ...patch } : windowItem
      );
      return withHistory(state, nextProject);
    }),
  updateVoid: (id, patch) =>
    set((state) => {
      const nextProject = cloneProject(state.project);
      nextProject.voids = nextProject.voids.map((voidArea) =>
        voidArea.id === id ? { ...voidArea, ...patch } : voidArea
      );
      return withHistory(state, nextProject);
    }),
  setBackgroundScale: (pixels, millimeters) =>
    set((state) => {
      if (!state.project.backgroundPlan) return {};
      const nextProject = cloneProject(state.project);
      const backgroundPlan = nextProject.backgroundPlan;
      if (!backgroundPlan) return {};
      nextProject.backgroundPlan = {
        ...backgroundPlan,
        scale: { pixels, millimeters }
      };
      return withHistory(state, nextProject);
    }),
  deleteSelection: (selection) =>
    set((state) => {
      if (!selection) return {};
      const nextProject = cloneProject(state.project);

      if (selection.kind === "wall") {
        nextProject.walls = nextProject.walls.filter((wall) => wall.id !== selection.id);
        nextProject.windows = nextProject.windows.filter((windowItem) => windowItem.wallId !== selection.id);
      } else if (selection.kind === "window" || selection.kind === "opening") {
        nextProject.windows = nextProject.windows.filter((windowItem) => windowItem.id !== selection.id);
      } else if (selection.kind === "furniture") {
        nextProject.furniture = nextProject.furniture.filter((item) => item.id !== selection.id);
      } else if (selection.kind === "light") {
        nextProject.lights = nextProject.lights.filter((light) => light.id !== selection.id);
        nextProject.lightingScenes = nextProject.lightingScenes.map((scene) => {
          const { [selection.id]: _removed, ...lightStates } = scene.lightStates;
          return { ...scene, lightStates };
        });
      } else if (selection.kind === "void") {
        nextProject.voids = nextProject.voids.filter((voidArea) => voidArea.id !== selection.id);
      }

      return {
        ...withHistory(state, nextProject),
        selection: null
      };
    }),
  duplicateActiveScene: () =>
    set((state) => {
      const nextProject = cloneProject(state.project);
      const scene = nextProject.lightingScenes.find((item) => item.id === nextProject.activeSceneId);
      if (!scene) return {};
      const copy: LightingScene = {
        ...scene,
        id: `scene-${Date.now()}`,
        name: `${scene.name} コピー`,
        lightStates: cloneProject(scene.lightStates)
      };
      nextProject.lightingScenes = [...nextProject.lightingScenes, copy];
      nextProject.activeSceneId = copy.id;
      return withHistory(state, nextProject);
    }),
  renameActiveScene: (name) =>
    set((state) => {
      const trimmed = name.trim();
      if (!trimmed) return {};
      const nextProject = cloneProject(state.project);
      nextProject.lightingScenes = nextProject.lightingScenes.map((scene) =>
        scene.id === nextProject.activeSceneId ? { ...scene, name: trimmed } : scene
      );
      return withHistory(state, nextProject);
    }),
  saveCameraView: (view) =>
    set((state) => {
      const nextProject = cloneProject(state.project);
      nextProject.cameraViews = [...nextProject.cameraViews, view];
      nextProject.activeCameraViewId = view.id;
      return withHistory(state, nextProject);
    }),
  setBackgroundPlan: (backgroundPlan) =>
    set((state) => {
      const nextProject = cloneProject(state.project);
      nextProject.backgroundPlan = backgroundPlan;
      return withHistory(state, nextProject);
    }),
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
}));
