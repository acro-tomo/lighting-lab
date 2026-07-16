import { useState } from "react";
import type { Project, Selection } from "../types";
import { useProjectStore } from "../store/projectStore";
import { ColorTempPresets } from "./inspector/ColorTempPresets";
import { LightInspector, BulkLightInspector } from "./inspector/LightInspector";
import { FurnitureInspector } from "./inspector/FurnitureInspector";
import { WallInspector } from "./inspector/WallInspector";
import { WindowInspector } from "./inspector/WindowInspector";
import { VoidInspector } from "./inspector/VoidInspector";
import { CeilingZoneInspector, FloorZoneInspector } from "./inspector/ZoneInspectors";

type InspectorProps = {
  project: Project;
  selection: Selection;
  canEditWalls: boolean;
  onCloseMobileSettings?: () => void;
};

const lightTypeLabels = {
  downlight: "ダウンライト",
  spotlight: "スポットライト",
  pendant: "ペンダント",
  bracket: "ブラケット",
  tape: "テープライト"
} as const;

export const Inspector = ({ project, selection, canEditWalls, onCloseMobileSettings }: InspectorProps) => {
  const updateLight = useProjectStore((state) => state.updateLight);
  const updateLights = useProjectStore((state) => state.updateLights);
  const selectedLightIds = useProjectStore((state) => state.selectedLightIds);
  const updateFurniture = useProjectStore((state) => state.updateFurniture);
  const updateWall = useProjectStore((state) => state.updateWall);
  const updateWindow = useProjectStore((state) => state.updateWindow);
  const updateVoid = useProjectStore((state) => state.updateVoid);
  const updateCeilingZone = useProjectStore((state) => state.updateCeilingZone);
  const updateFloorZone = useProjectStore((state) => state.updateFloorZone);
  const updateMaterial = useProjectStore((state) => state.updateMaterial);
  const setAllColorTemperature = useProjectStore((state) => state.setAllColorTemperature);
  const setAllWallsMaterial = useProjectStore((state) => state.setAllWallsMaterial);
  const select = useProjectStore((state) => state.select);
  const setFloorLevel = useProjectStore((state) => state.setFloorLevel);
  const [disclaimerOpen, setDisclaimerOpen] = useState(false);

  const selectedLightId =
    selection?.kind === "light" ? selection.id : selectedLightIds.length === 1 ? selectedLightIds[0] : undefined;
  const selectedLight = selectedLightId ? project.lights.find((light) => light.id === selectedLightId) : undefined;
  const selectedFurniture =
    selection?.kind === "furniture"
      ? project.furniture.find((item) => item.id === selection.id)
      : undefined;
  const selectedWall =
    canEditWalls && selection?.kind === "wall" ? project.walls.find((wall) => wall.id === selection.id) : undefined;
  const selectedWindow =
    selection?.kind === "window" || selection?.kind === "opening"
      ? project.windows.find((windowItem) => windowItem.id === selection.id)
      : undefined;
  const selectedVoid =
    selection?.kind === "void" ? project.voids.find((voidArea) => voidArea.id === selection.id) : undefined;
  const selectedCeilingZone =
    selection?.kind === "ceilingZone"
      ? (project.ceilingZones ?? []).find((zone) => zone.id === selection.id)
      : undefined;
  const selectedFloorZone =
    selection?.kind === "floorZone"
      ? (project.floorZones ?? []).find((zone) => zone.id === selection.id)
      : undefined;

  const totalActiveLumens = project.lights.reduce((sum, light) => {
    return sum + ((light.enabled !== false) ? light.lumens * (light.dimmer ?? 100) * 0.01 : 0);
  }, 0);
  const hasObjectSelection = selection !== null || selectedLightIds.length > 0;
  const mobileTitle = selectedLight
    ? `${lightTypeLabels[selectedLight.type]}を編集`
    : selectedFurniture
      ? "家具を編集"
      : hasObjectSelection
        ? "編集"
        : "部屋設定";

  return (
    <aside className="inspector-panel" aria-label="プロパティインスペクター">
      <div className="mobile-settings-sheet-head">
        <button type="button" onClick={onCloseMobileSettings}>戻る</button>
        <strong>{mobileTitle}</strong>
        {hasObjectSelection ? (
          <button type="button" onClick={() => select(null)}>部屋設定</button>
        ) : (
          <span aria-hidden="true" />
        )}
      </div>

      <section className="panel-block">
        {!hasObjectSelection && (
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Room settings</p>
              <h2>部屋設定</h2>
            </div>
          </div>
        )}
        {selectedLightIds.length >= 2 && (
          <BulkLightInspector
            lights={project.lights.filter((l) => selectedLightIds.includes(l.id))}
            updateLights={(patch) => updateLights(selectedLightIds, patch)}
          />
        )}
        {selectedLightIds.length < 2 && selectedLight && (
          <LightInspector
            light={selectedLight}
            project={project}
            updateLight={updateLight}
          />
        )}
        {selectedFurniture && <FurnitureInspector item={selectedFurniture} project={project} updateFurniture={updateFurniture} />}
        {selectedWall && (
          <WallInspector wall={selectedWall} project={project} updateWall={updateWall} updateMaterial={updateMaterial} />
        )}
        {selectedWindow && <WindowInspector windowItem={selectedWindow} project={project} updateWindow={updateWindow} />}
        {selectedVoid && <VoidInspector voidArea={selectedVoid} updateVoid={updateVoid} />}
        {selectedCeilingZone && <CeilingZoneInspector zone={selectedCeilingZone} updateCeilingZone={updateCeilingZone} />}
        {selectedFloorZone && (
          <FloorZoneInspector
            zone={selectedFloorZone}
            updateFloorZone={updateFloorZone}
            floorLevelM={project.room.floorLevelM ?? 0}
            setFloorLevel={setFloorLevel}
          />
        )}
      </section>

      {!hasObjectSelection && (
        <>
          <section className="summary-strip" aria-label="部屋の集計">
            <div>
              <span>照明</span>
              <strong>{project.lights.length}</strong>
            </div>
            <div>
              <span>家具</span>
              <strong>{project.furniture.length}</strong>
            </div>
            <div>
              <span>有効lm</span>
              <strong>{Math.round(totalActiveLumens).toLocaleString("ja-JP")}</strong>
            </div>
          </section>

          <section className="panel-block">
            <div className="panel-heading compact">
              <h2>メインクロス（壁全体）</h2>
            </div>
            <label className="field">
              <span>全壁の素材を一括変更</span>
              <select
                defaultValue=""
                onChange={(event) => {
                  const value = event.target.value;
                  if (value) setAllWallsMaterial(value);
                  event.currentTarget.value = "";
                }}
              >
                <option value="" disabled>— 素材を選んで適用 —</option>
                {project.materials.map((mat) => (
                  <option key={mat.id} value={mat.id}>{mat.name}</option>
                ))}
              </select>
            </label>
          </section>

          <section className="panel-block room-light-settings">
            <div className="panel-heading compact">
              <h2>照明一覧</h2>
            </div>
            <div className="room-wide-warning">
              <strong>部屋全体に適用</strong>
              <span>{project.lights.length}灯すべての色温度を変更します</span>
            </div>
            <label className="field">
              <span>全照明の色温度を一括変更</span>
              <ColorTempPresets value={NaN} onSelect={setAllColorTemperature} />
            </label>
            <label className="field">
              <span>照明を選択</span>
              <select
                value=""
                onChange={(event) => {
                  const value = event.target.value;
                  if (value) select({ kind: "light", id: value });
                }}
              >
                <option value="">— 照明を選択 —</option>
                {project.lights.map((light) => (
                  <option key={light.id} value={light.id}>
                    {light.name}（{light.enabled !== false ? `${Math.round(light.dimmer ?? 100)}%` : "OFF"}）
                  </option>
                ))}
              </select>
            </label>
          </section>
        </>
      )}

      <footer className="inspector-footer">
        <button
          type="button"
          className="disclaimer-toggle"
          onClick={() => setDisclaimerOpen((open) => !open)}
          aria-expanded={disclaimerOpen}
        >
          ℹ 免責
        </button>
        {disclaimerOpen && (
          <p className="disclaimer-text">
            これは照明配置・雰囲気比較用の視覚シミュレーションです。実際の照度、配光、色、施工後の見え方を保証するものではありません。
          </p>
        )}
      </footer>
      <div className="mobile-settings-autosave" aria-live="polite">自動保存</div>
    </aside>
  );
};
