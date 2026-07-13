import type { StateCreator } from "zustand";
import type {
  CeilingZone,
  Clipboard,
  FloorZone,
  FurnitureItem,
  LightFixture,
  VoidArea,
  WallSegment,
  WindowOpening
} from "../../types";
import type { ProjectStore } from "../projectStore";

// store/Plan2D/objectFactory と同じ採番方式に合わせる。
const uid = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

export interface ClipboardSlice {
  clipboard: Clipboard;
  copySelection: () => void;
  pasteSelection: () => void;
}

export const createClipboardSlice: StateCreator<ProjectStore, [], [], ClipboardSlice> = (set, get) => ({
  clipboard: null,
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
  }
});
