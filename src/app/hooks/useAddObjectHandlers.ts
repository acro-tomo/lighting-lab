import { useCallback } from "react";
import type { EditMode } from "../../components/EditToolbar";
import { fixtureModelMap } from "../../data/fixtureCatalog";
import { getFurniturePreset } from "../../data/furnitureCatalog";
import { fixtureModelFromAddKind, isLightAddKind, isWallLightAddKind } from "../../data/fixtureAddKinds";
import {
  newCeilingZone,
  newDoor,
  newDownlight,
  newFixtureFromModel,
  newFloorZone,
  newFurnitureFromPreset,
  newLineLight,
  newPendant,
  newStair,
  newVoid,
  newWallSpot,
  newWindow,
  newWindowFromPreset
} from "../../data/objectFactory";
import { getWindowPreset } from "../../data/windowCatalog";
import { ceilingMountHeightAt } from "../../utils/ceiling";
import { wallMountedLightPlacementOnSurface } from "../../utils/fixtureMounting";
import type { CeilingZone, FloorZone, FurnitureItem, LightFixture, Project, VoidArea, WindowOpening } from "../../types";
import { useI18n } from "../../i18n";

// 配置情報。床に置く物は at(x,z)、壁に付く物(窓/扉)は wallId+centerRatio を使う。
type PlaceOpts = { at?: { x: number; z: number }; wallId?: string; centerRatio?: number };

const lowerCeilingDropFromKind = (kind: string) => {
  if (!kind.startsWith("ceilingZone:")) return undefined;
  const dropM = Number(kind.slice("ceilingZone:".length));
  return Number.isFinite(dropM) && dropM > 0 ? dropM : undefined;
};

// EditToolbarの「＋追加」から確定配置までの一連のハンドラ（オブジェクト生成・配置待ち管理）。
export const useAddObjectHandlers = ({
  project,
  addLight,
  addFurniture,
  addWindow,
  addVoid,
  addCeilingZone,
  addFloorZone,
  pendingAdd,
  setPendingAdd,
  setMode,
  setNotice
}: {
  project: Project;
  addLight: (light: LightFixture) => void;
  addFurniture: (item: FurnitureItem) => void;
  addWindow: (windowItem: WindowOpening, style: "window" | "opening") => void;
  addVoid: (voidArea: VoidArea) => void;
  addCeilingZone: (zone: CeilingZone) => void;
  addFloorZone: (zone: FloorZone) => void;
  pendingAdd: string | null;
  setPendingAdd: (next: string | null) => void;
  setMode: (mode: EditMode) => void;
  setNotice: (notice: string) => void;
}) => {
  const { t } = useI18n();
  const handleAddObject = useCallback(
    (kind: string, opts: PlaceOpts = {}) => {
      const { at, wallId, centerRatio } = opts;
      const model = fixtureModelFromAddKind(kind);
      if (model) {
        const mountHeightM = at ? ceilingMountHeightAt(project, at) : undefined;
        addLight(newFixtureFromModel(project, model, at, { ceilingHeightM: mountHeightM }));
        return;
      }
      if (kind.startsWith("ceilingZone")) {
        addCeilingZone({ ...newCeilingZone(at), dropM: lowerCeilingDropFromKind(kind) ?? 0.3 });
        return;
      }
      // 家具カタログ: kind = "furniture:<presetId>"。
      if (kind.startsWith("furniture:")) {
        const preset = getFurniturePreset(kind.slice("furniture:".length));
        if (preset) addFurniture(newFurnitureFromPreset(preset, at));
        return;
      }
      // 窓カタログ: kind = "window:<presetId>"。クリックした壁に設置。
      if (kind.startsWith("window:")) {
        const preset = getWindowPreset(kind.slice("window:".length));
        if (preset) {
          addWindow(
            newWindowFromPreset(preset, project, { wallId, centerRatio }),
            preset.hasGlass ? "window" : "opening"
          );
        }
        return;
      }
      switch (kind) {
        case "downlight":
          addLight(newDownlight(project, at));
          break;
        case "wallspot":
          addLight(newWallSpot(project, at));
          break;
        case "pendant":
          addLight(newPendant(project, at));
          break;
        case "linelight":
          addLight(newLineLight(project, at));
          break;
        case "stair":
          addFurniture(newStair(project, at));
          break;
        case "window":
          addWindow(newWindow(project, { wallId, centerRatio }), "window");
          break;
        case "door":
          addWindow(newDoor(project, { wallId, centerRatio }), "opening");
          break;
        case "void":
          addVoid(newVoid(at));
          break;
        case "floorZone":
          addFloorZone(newFloorZone(at));
          break;
        default:
          return;
      }
    },
    [addCeilingZone, addFloorZone, addFurniture, addLight, addVoid, addWindow, project]
  );

  // 「＋追加」で種別を選んだら配置待ちにする。実際の生成はクリック位置確定時。
  const handleStartAdd = useCallback((kind: string) => {
    let nextKind = kind;
    if (kind === "ceilingZone") {
      const defaultHeightMm = Math.round((project.room.ceilingHeightM - 0.3) * 1000);
      const input = window.prompt(t("下げ天井の下端高さをmmで入力してください。"), String(defaultHeightMm));
      const lowerHeightM = input === null ? NaN : Number(input) / 1000;
      if (Number.isFinite(lowerHeightM) && lowerHeightM > 1.6 && lowerHeightM < project.room.ceilingHeightM) {
        nextKind = `ceilingZone:${project.room.ceilingHeightM - lowerHeightM}`;
      }
    }
    setPendingAdd(nextKind);
    setMode("select");
    setNotice(
      nextKind === "door" || nextKind.startsWith("window") || isWallLightAddKind(nextKind)
        ? t("設置したい壁をクリックしてください。Escで終了。")
        : isLightAddKind(nextKind)
          ? t("配置したい位置をクリックしてください。配置後は選択してCmd+C / Cmd+Vで複製できます。")
          : t("配置したい位置をクリックしてください。")
    );
  }, [project.room.ceilingHeightM, setMode, setNotice, setPendingAdd, t]);

  // 床に置く物の配置（クリック位置）。連続配置はせず、複製はCmd+C / Cmd+Vに寄せる。
  const handlePlaceObject = useCallback(
    (at: { x: number; z: number }) => {
      if (!pendingAdd) return;
      handleAddObject(pendingAdd, { at });
      setPendingAdd(null);
      setMode("select");
      setNotice(
        isLightAddKind(pendingAdd)
          ? t("配置しました。選択してCmd+C / Cmd+Vで複製できます。")
          : t("配置しました。選択後にドラッグで微調整できます。")
      );
    },
    [pendingAdd, handleAddObject, setMode, setNotice, setPendingAdd, t]
  );

  // 壁に付く物(窓/扉/壁付スポット)の配置。Plan2D がクリック点を最寄り壁へ射影して渡す。
  // heightM は3D側がカーソルの壁上Y値を渡す場合のみ存在する（2Dからは undefined）。
  const handlePlaceOnWall = useCallback(
    (wallId: string, centerRatio: number, heightM?: number) => {
      if (!pendingAdd) return;
      if (isWallLightAddKind(pendingAdd)) {
        const model = fixtureModelFromAddKind(pendingAdd) ?? fixtureModelMap.get("sp-wall");
        const placement = wallMountedLightPlacementOnSurface(project, wallId, centerRatio, heightM ?? 1.9);
        if (model && placement) {
          addLight(
            newFixtureFromModel(project, model, undefined, {
              wall: {
                x: placement.position.x,
                y: placement.position.y,
                z: placement.position.z,
                target: placement.target,
                rotationYDeg: placement.rotationYDeg
              }
            })
          );
        }
        setPendingAdd(null);
        setMode("select");
        setNotice(t("壁に設置しました。選択してCmd+C / Cmd+Vで複製できます。"));
        return;
      }
      handleAddObject(pendingAdd, { wallId, centerRatio });
      setPendingAdd(null);
      setMode("select");
      setNotice(t("壁に設置しました。選択後に壁上をドラッグして位置を調整できます。"));
    },
    [pendingAdd, handleAddObject, addLight, project, setMode, setNotice, setPendingAdd, t]
  );

  return { handleAddObject, handleStartAdd, handlePlaceObject, handlePlaceOnWall };
};
