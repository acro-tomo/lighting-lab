import { create } from "zustand";
import { demoProject } from "../data/demoProject";
import type {
  CeilingZone,
  Clipboard,
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
import { isCeilingMountedFixture, normalizeCeilingMountedFixture } from "../utils/fixtureMounting";
import { cloneProject } from "../utils/units";

// store/Plan2D/objectFactory と同じ採番方式に合わせる。
const uid = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

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
  // 一時状態（非永続・undo対象外）: Shift+クリックによるライトの複数選択。
  selectedLightIds: string[];
  clipboard: Clipboard;
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
  toggleLightSelection: (id: string) => void;
  clearLightSelection: () => void;
  updateLights: (ids: string[], patch: Partial<LightFixture>) => void;
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
  setAllWallsMaterial: (materialId: string) => void;
  copySelection: () => void;
  pasteSelection: () => void;
  updateFurniture: (id: string, patch: Partial<FurnitureItem>) => void;
  updateWall: (id: string, patch: Partial<WallSegment>) => void;
  updateWindow: (id: string, patch: Partial<WindowOpening>) => void;
  updateVoid: (id: string, patch: Partial<VoidArea>) => void;
  setBackgroundScale: (pixels: number, millimeters: number) => void;
  deleteSelection: (selection: Selection) => void;
  setBackgroundPlan: (backgroundPlan: FloorPlanBackground) => void;
  setActiveFloor: (floor: 1 | 2) => void;
  setDaylight: (patch: Partial<Daylight>) => void;
  setShowCeiling: (value: boolean) => void;
  setCeilingHeight: (value: number) => void;
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
  selectedLightIds: [],
  clipboard: null,
  compareShots: [],
  history: [],
  future: [],
  liveCamera: null,
  setLiveCamera: (pose) => set({ liveCamera: pose }),
  setProject: (project) =>
    set({
      project,
      selection: null,
      selectedLightIds: [],
      history: [],
      future: []
    }),
  resetDemo: () =>
    set({
      project: cloneProject(demoProject),
      selection: null,
      selectedLightIds: [],
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
      return { ...withHistory(state, nextProject), selection: null, selectedLightIds: [] };
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
  // 通常の単一選択。Shift+クリックの複数選択は toggleLightSelection 側で行うため、
  // ここでは複数選択をリセットする（普通のクリックで複数選択を解除）。
  select: (selection) => set({ selection, selectedLightIds: [] }),
  toggleLightSelection: (id) =>
    set((state) =>
      state.selectedLightIds.includes(id)
        ? { selectedLightIds: state.selectedLightIds.filter((lightId) => lightId !== id) }
        : { selectedLightIds: [...state.selectedLightIds, id] }
    ),
  clearLightSelection: () => set({ selectedLightIds: [] }),
  updateLights: (ids, patch) =>
    set((state) => {
      const idSet = new Set(ids);
      const nextProject = cloneProject(state.project);
      nextProject.lights = nextProject.lights.map((light) =>
        idSet.has(light.id) ? { ...light, ...patch } : light
      );
      return withHistory(state, nextProject);
    }),
  setCamera: (patch) =>
    set((state) => {
      const nextProject = cloneProject(state.project);
      nextProject.camera = { ...nextProject.camera, ...patch };
      return withHistory(state, nextProject);
    }),
  addWall: (wall) =>
    set((state) => {
      const floor = state.project.activeFloor ?? 1;
      const nextProject = cloneProject(state.project);
      nextProject.walls = [...nextProject.walls, { ...wall, floor }];
      return {
        ...withHistory(state, nextProject),
        selection: { kind: "wall", id: wall.id }
      };
    }),
  addWindow: (windowOpening, selectionKind) =>
    set((state) => {
      const floor = state.project.activeFloor ?? 1;
      const nextProject = cloneProject(state.project);
      nextProject.windows = [...nextProject.windows, { ...windowOpening, floor }];
      return {
        ...withHistory(state, nextProject),
        selection: { kind: selectionKind, id: windowOpening.id }
      };
    }),
  addFurniture: (item) =>
    set((state) => {
      const floor = state.project.activeFloor ?? 1;
      const nextProject = cloneProject(state.project);
      nextProject.furniture = [...nextProject.furniture, { ...item, floor }];
      return {
        ...withHistory(state, nextProject),
        selection: { kind: "furniture", id: item.id }
      };
    }),
  addLight: (light) =>
    set((state) => {
      const floor = state.project.activeFloor ?? 1;
      const nextProject = cloneProject(state.project);
      const nextLight = normalizeCeilingMountedFixture(nextProject, { ...light, floor });
      nextProject.lights = [...nextProject.lights, nextLight];
      return {
        ...withHistory(state, nextProject),
        selection: { kind: "light", id: light.id }
      };
    }),
  addVoid: (voidArea) =>
    set((state) => {
      const floor = state.project.activeFloor ?? 1;
      const nextProject = cloneProject(state.project);
      nextProject.voids = [...nextProject.voids, { ...voidArea, floor }];
      return {
        ...withHistory(state, nextProject),
        selection: { kind: "void", id: voidArea.id }
      };
    }),
  addCeilingZone: (zone) =>
    set((state) => {
      const floor = state.project.activeFloor ?? 1;
      const nextProject = cloneProject(state.project);
      nextProject.ceilingZones = [...(nextProject.ceilingZones ?? []), { ...zone, floor }];
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
      const floor = state.project.activeFloor ?? 1;
      const nextProject = cloneProject(state.project);
      nextProject.floorZones = [...(nextProject.floorZones ?? []), { ...zone, floor }];
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
      nextProject.lights = nextProject.lights.map((light) => {
        if (light.id !== id) return light;
        const nextLight = { ...light, ...patch };
        const positionChanged = Boolean(
          patch.position && (patch.position.x !== light.position.x || patch.position.z !== light.position.z)
        );
        const userChangedHeight = Boolean(
          patch.mountHeightM !== undefined || (patch.position && patch.position.y !== light.position.y)
        );
        const cordChanged = patch.cordLengthM !== undefined;
        if (isCeilingMountedFixture(nextLight) && (cordChanged || (positionChanged && !userChangedHeight))) {
          return normalizeCeilingMountedFixture(nextProject, nextLight);
        }
        return nextLight;
      });
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
  // 全壁のメインクロス(materialId)を一括差し替え。存在しないIDは無視。
  setAllWallsMaterial: (materialId) =>
    set((state) => {
      const exists = state.project.materials.some((material) => material.id === materialId);
      if (!exists) return {};
      const nextProject = cloneProject(state.project);
      nextProject.walls = nextProject.walls.map((wall) => ({ ...wall, materialId }));
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
      const key = (state.project.activeFloor ?? 1) === 2 ? "backgroundPlan2" : "backgroundPlan";
      if (!state.project[key]) return {};
      const nextProject = cloneProject(state.project);
      const backgroundPlan = nextProject[key];
      if (!backgroundPlan) return {};
      nextProject[key] = {
        ...backgroundPlan,
        scale: { pixels, millimeters }
      };
      return withHistory(state, nextProject);
    }),
  deleteSelection: (selection) =>
    set((state) => {
      if (!selection) return {};
      const nextProject = cloneProject(state.project);
      const nextSelectedLightIds =
        selection.kind === "light"
          ? state.selectedLightIds.filter((id) => id !== selection.id)
          : state.selectedLightIds;

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
        selection: null,
        selectedLightIds: nextSelectedLightIds
      };
    }),
  // 背景は活性階へ書き込む（2階なら backgroundPlan2、1階なら backgroundPlan）。
  setBackgroundPlan: (backgroundPlan) =>
    set((state) => {
      const nextProject = cloneProject(state.project);
      if ((state.project.activeFloor ?? 1) === 2) {
        nextProject.backgroundPlan2 = backgroundPlan;
      } else {
        nextProject.backgroundPlan = backgroundPlan;
      }
      return withHistory(state, nextProject);
    }),
  // 活性階の単純切替（undo対象外）。selection はクリアする。
  setActiveFloor: (floor) =>
    set((state) => ({
      project: { ...state.project, activeFloor: floor },
      selection: null,
      selectedLightIds: []
    })),
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
    }),
  // 選択中オブジェクトのディープコピーを clipboard へ。material/null は対象外。
  copySelection: () =>
    set((state) => {
      const { selection, project } = state;
      if (!selection || selection.kind === "material") return {};
      const find = <T extends { id: string }>(list: T[]): T | undefined =>
        list.find((entry) => entry.id === selection.id);
      let source: unknown;
      switch (selection.kind) {
        case "wall":
          source = find(project.walls);
          break;
        case "window":
        case "opening":
          source = find(project.windows);
          break;
        case "furniture":
          source = find(project.furniture);
          break;
        case "light":
          source = find(project.lights);
          break;
        case "void":
          source = find(project.voids);
          break;
        case "ceilingZone":
          source = find(project.ceilingZones ?? []);
          break;
        case "floorZone":
          source = find(project.floorZones ?? []);
          break;
      }
      if (!source) return {};
      return {
        clipboard: { kind: selection.kind, data: structuredClone(source) }
      };
    }),
  // clipboard の内容を新IDで複製し、少しずらして追加。新オブジェクトを選択する(undo対象)。
  pasteSelection: () => {
    const { clipboard } = get();
    if (!clipboard) return;
    const data = structuredClone(clipboard.data);
    const copyName = (name: string) => `${name} のコピー`;
    switch (clipboard.kind) {
      case "wall": {
        const wall = data as WallSegment;
        get().addWall({
          ...wall,
          id: uid("wall"),
          name: copyName(wall.name),
          start: { x: wall.start.x + 0.3, z: wall.start.z + 0.3 },
          end: { x: wall.end.x + 0.3, z: wall.end.z + 0.3 }
        });
        break;
      }
      case "window":
      case "opening": {
        const win = data as WindowOpening;
        get().addWindow(
          {
            ...win,
            id: uid("window"),
            name: copyName(win.name),
            centerRatio: Math.min(0.95, win.centerRatio + 0.1)
          },
          clipboard.kind
        );
        break;
      }
      case "furniture": {
        const item = data as FurnitureItem;
        get().addFurniture({
          ...item,
          id: uid("furniture"),
          name: copyName(item.name),
          position: { ...item.position, x: item.position.x + 0.3, z: item.position.z + 0.3 }
        });
        break;
      }
      case "light": {
        const light = data as LightFixture;
        const dx = 0.3;
        const dz = 0.3;
        get().addLight({
          ...light,
          id: uid("light"),
          name: copyName(light.name),
          position: { ...light.position, x: light.position.x + dx, z: light.position.z + dz },
          target: light.target ? { ...light.target, x: light.target.x + dx, z: light.target.z + dz } : undefined
        });
        break;
      }
      case "void": {
        const voidArea = data as VoidArea;
        get().addVoid({
          ...voidArea,
          id: uid("void"),
          name: copyName(voidArea.name),
          center: { x: voidArea.center.x + 0.3, z: voidArea.center.z + 0.3 }
        });
        break;
      }
      case "ceilingZone": {
        const zone = data as CeilingZone;
        get().addCeilingZone({
          ...zone,
          id: uid("ceil"),
          name: copyName(zone.name),
          center: { x: zone.center.x + 0.3, z: zone.center.z + 0.3 }
        });
        break;
      }
      case "floorZone": {
        const zone = data as FloorZone;
        get().addFloorZone({
          ...zone,
          id: uid("floor"),
          name: copyName(zone.name),
          center: { x: zone.center.x + 0.3, z: zone.center.z + 0.3 }
        });
        break;
      }
    }
  },
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
