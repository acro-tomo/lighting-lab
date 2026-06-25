import { create } from "zustand";
import { demoProject } from "../data/demoProject";
import type {
  CeilingZone,
  CompareShot,
  Daylight,
  FloorPlanBackground,
  FloorZone,
  FurnitureItem,
  LightFixture,
  MaterialPreset,
  Project,
  Selection,
  VoidArea,
  WindowOpening,
  WallSegment
} from "../types";
import { cloneProject } from "../utils/units";

// sun.ts は別エージェントが用意予定。未作成時の型エラーを避けるためローカルにフォールバックを持つ。
const DEFAULT_DAYLIGHT: Daylight = {
  enabled: true,
  month: 10,
  day: 15,
  hour: 14,
  northOffsetDeg: 0,
  latitudeDeg: 35
};

type ProjectStore = {
  project: Project;
  selection: Selection;
  compareShots: CompareShot[];
  history: Project[];
  future: Project[];
  // 一時状態（非永続）: 3Dカメラの現在地を2D平面図にリアルタイム表示するための土台。
  // x,z=カメラのワールド座標(m, XZ平面)、tx,tz=注視点のワールド座標(m, XZ平面)。
  liveCamera: { x: number; z: number; tx: number; tz: number } | null;
  setLiveCamera: (pose: { x: number; z: number; tx: number; tz: number } | null) => void;
  setProject: (project: Project) => void;
  resetDemo: () => void;
  clearGeometry: () => void;
  undo: () => void;
  redo: () => void;
  select: (selection: Selection) => void;
  setCamera: (patch: Partial<Project["camera"]>) => void;
  addWall: (wall: WallSegment) => void;
  addWindow: (windowOpening: WindowOpening, selectionKind: "window" | "opening") => void;
  addFurniture: (item: FurnitureItem) => void;
  addLight: (light: LightFixture) => void;
  addVoid: (voidArea: VoidArea) => void;
  addCeilingZone: (zone: CeilingZone) => void;
  updateCeilingZone: (id: string, patch: Partial<CeilingZone>) => void;
  addFloorZone: (zone: FloorZone) => void;
  updateFloorZone: (id: string, patch: Partial<FloorZone>) => void;
  updateLight: (id: string, patch: Partial<LightFixture>) => void;
  setAllColorTemperature: (colorTemperatureK: number) => void;
  updateMaterial: (id: string, patch: Partial<MaterialPreset>) => void;
  updateFurniture: (id: string, patch: Partial<FurnitureItem>) => void;
  updateWall: (id: string, patch: Partial<WallSegment>) => void;
  updateWindow: (id: string, patch: Partial<WindowOpening>) => void;
  updateVoid: (id: string, patch: Partial<VoidArea>) => void;
  setBackgroundScale: (pixels: number, millimeters: number) => void;
  deleteSelection: (selection: Selection) => void;
  setBackgroundPlan: (backgroundPlan: FloorPlanBackground) => void;
  setDaylight: (patch: Partial<Daylight>) => void;
  setShowCeiling: (value: boolean) => void;
  setFloorLevel: (value: number) => void;
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
  liveCamera: null,
  setLiveCamera: (pose) => set({ liveCamera: pose }),
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
      return { ...withHistory(state, nextProject), selection: null };
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
  setCamera: (patch) =>
    set((state) => {
      const nextProject = cloneProject(state.project);
      nextProject.camera = { ...nextProject.camera, ...patch };
      return withHistory(state, nextProject);
    }),
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
  addCeilingZone: (zone) =>
    set((state) => {
      const nextProject = cloneProject(state.project);
      nextProject.ceilingZones = [...(nextProject.ceilingZones ?? []), zone];
      return {
        ...withHistory(state, nextProject),
        selection: { kind: "ceilingZone", id: zone.id }
      };
    }),
  updateCeilingZone: (id, patch) =>
    set((state) => {
      const nextProject = cloneProject(state.project);
      nextProject.ceilingZones = (nextProject.ceilingZones ?? []).map((zone) =>
        zone.id === id ? { ...zone, ...patch } : zone
      );
      return withHistory(state, nextProject);
    }),
  addFloorZone: (zone) =>
    set((state) => {
      const nextProject = cloneProject(state.project);
      nextProject.floorZones = [...(nextProject.floorZones ?? []), zone];
      return {
        ...withHistory(state, nextProject),
        selection: { kind: "floorZone", id: zone.id }
      };
    }),
  updateFloorZone: (id, patch) =>
    set((state) => {
      const nextProject = cloneProject(state.project);
      nextProject.floorZones = (nextProject.floorZones ?? []).map((zone) =>
        zone.id === id ? { ...zone, ...patch } : zone
      );
      return withHistory(state, nextProject);
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
  updateMaterial: (id, patch) =>
    set((state) => {
      const nextProject = cloneProject(state.project);
      nextProject.materials = nextProject.materials.map((material) =>
        material.id === id ? { ...material, ...patch } : material
      );
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
      } else if (selection.kind === "void") {
        nextProject.voids = nextProject.voids.filter((voidArea) => voidArea.id !== selection.id);
      } else if (selection.kind === "ceilingZone") {
        nextProject.ceilingZones = (nextProject.ceilingZones ?? []).filter((zone) => zone.id !== selection.id);
      } else if (selection.kind === "floorZone") {
        nextProject.floorZones = (nextProject.floorZones ?? []).filter((zone) => zone.id !== selection.id);
      }

      return {
        ...withHistory(state, nextProject),
        selection: null
      };
    }),
  setBackgroundPlan: (backgroundPlan) =>
    set((state) => {
      const nextProject = cloneProject(state.project);
      nextProject.backgroundPlan = backgroundPlan;
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
  setFloorLevel: (value) =>
    set((state) => {
      const nextProject = cloneProject(state.project);
      nextProject.room = { ...nextProject.room, floorLevelM: Math.max(0, value) };
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
