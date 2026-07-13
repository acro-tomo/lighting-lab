import type { StateCreator } from "zustand";
import type {
  CeilingZone,
  FloorPlanBackground,
  FloorZone,
  FurnitureItem,
  LightFixture,
  MaterialPreset,
  Selection,
  VoidArea,
  WindowOpening,
  WallSegment
} from "../../types";
import { isCeilingMountedFixture, normalizeCeilingMountedFixture } from "../../utils/fixtureMounting";
import { cloneProject } from "../../utils/units";
import type { ProjectStore } from "../projectStore";
import { withHistory } from "./historySlice";

// 家具/照明/壁/窓/void/天井ゾーン/床ゾーン・マテリアル・背景図の CRUD をまとめたスライス。
export interface ObjectsSlice {
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
  updateLights: (ids: string[], patch: Partial<LightFixture>) => void;
  setAllColorTemperature: (colorTemperatureK: number) => void;
  updateMaterial: (id: string, patch: Partial<MaterialPreset>) => void;
  setAllWallsMaterial: (materialId: string) => void;
  updateFurniture: (id: string, patch: Partial<FurnitureItem>) => void;
  updateWall: (id: string, patch: Partial<WallSegment>) => void;
  updateWindow: (id: string, patch: Partial<WindowOpening>) => void;
  updateVoid: (id: string, patch: Partial<VoidArea>) => void;
  setBackgroundScale: (pixels: number, millimeters: number) => void;
  setBackgroundPlan: (backgroundPlan: FloorPlanBackground) => void;
  deleteSelection: (selection: Selection) => void;
}

export const createObjectsSlice: StateCreator<ProjectStore, [], [], ObjectsSlice> = (set) => ({
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
  updateLights: (ids, patch) =>
    set((state) => {
      const idSet = new Set(ids);
      const nextProject = cloneProject(state.project);
      nextProject.lights = nextProject.lights.map((light) =>
        idSet.has(light.id) ? { ...light, ...patch } : light
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
    })
});
