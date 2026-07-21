import { useState } from "react";
import type { InterFloorStructure, Project, Selection } from "../types";
import { useI18n } from "../i18n";
import { useProjectStore } from "../store/projectStore";
import { ColorTempPresets } from "./inspector/ColorTempPresets";
import { LightInspector, BulkLightInspector } from "./inspector/LightInspector";
import { FurnitureInspector } from "./inspector/FurnitureInspector";
import { WallInspector } from "./inspector/WallInspector";
import { WindowInspector } from "./inspector/WindowInspector";
import { VoidInspector } from "./inspector/VoidInspector";
import { CeilingZoneInspector, FloorZoneInspector } from "./inspector/ZoneInspectors";
import { NumberField } from "./inspector/fields";
import { mToMm, mmToM } from "../utils/units";

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

const languageLightType = (t: (key: string) => string, type: keyof typeof lightTypeLabels) => t(lightTypeLabels[type]);

export const Inspector = ({ project, selection, canEditWalls, onCloseMobileSettings }: InspectorProps) => {
  const { t } = useI18n();
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
  const setInterFloorStructure = useProjectStore((state) => state.setInterFloorStructure);
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
  const interFloorStructure = project.room.interFloorStructure;

  const hasObjectSelection = selection !== null || selectedLightIds.length > 0;
  const mobileTitle = selectedLight
    ? `${languageLightType(t, selectedLight.type)}${t("を編集")}`
    : selectedFurniture
      ? t("家具を編集")
      : hasObjectSelection
        ? t("編集")
        : t("部屋設定");

  return (
    <aside className="inspector-panel" aria-label={t("プロパティインスペクター")}>
      <div className="mobile-settings-sheet-head">
        <button type="button" onClick={onCloseMobileSettings}>{t("戻る")}</button>
        <strong>{mobileTitle}</strong>
        {hasObjectSelection ? (
          <button type="button" onClick={() => select(null)}>{t("部屋設定")}</button>
        ) : (
          <span aria-hidden="true" />
        )}
      </div>

      <section className="panel-block">
        {!hasObjectSelection && (
          <div className="panel-heading">
            <div>
              <h2>{t("部屋設定")}</h2>
              <p className="inspector-empty-hint">{t("照明や家具は、2Dまたは3D画面で直接選択できます。")}</p>
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
        {selectedVoid && <VoidInspector voidArea={selectedVoid} project={project} updateVoid={updateVoid} />}
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
          <details className="room-settings-details">
            <summary>{t("部屋全体の設定 +")}</summary>
            <div className="panel-heading compact">
              <h2>{t("階間床")}</h2>
            </div>
            <label className="field">
              <span>{t("構造")}</span>
              <select
                value={interFloorStructure?.kind ?? ""}
                onChange={(event) => {
                  const kind = event.target.value as InterFloorStructure["kind"];
                  const thicknessM =
                    kind === "wood"
                      ? 0.24
                      : kind === "rc"
                        ? 0.2
                        : interFloorStructure?.thicknessM ?? 0;
                  setInterFloorStructure({ kind, thicknessM });
                }}
              >
                <option value="" disabled>{t("— 構造を選択 —")}</option>
                <option value="wood">{t("木造（初期 240mm）")}</option>
                <option value="rc">{t("RC（初期 200mm）")}</option>
                <option value="custom">{t("自由入力")}</option>
              </select>
            </label>
            {interFloorStructure && (
              <NumberField
                label={t("階間床の厚さ")}
                unit="mm"
                value={mToMm(interFloorStructure.thicknessM)}
                min={0}
                onChange={(value) =>
                  setInterFloorStructure({
                    ...interFloorStructure,
                    thicknessM: mmToM(value)
                  })
                }
              />
            )}
            <p className="field-hint">{t("表示用の設定であり、構造計算には使用しません。")}</p>
            <div className="panel-heading compact">
              <h2>{t("メインクロス（壁全体）")}</h2>
            </div>
            <label className="field">
              <span>{t("全壁の素材を一括変更")}</span>
              <select
                defaultValue=""
                onChange={(event) => {
                  const value = event.target.value;
                  if (value) setAllWallsMaterial(value);
                  event.currentTarget.value = "";
                }}
              >
                <option value="" disabled>{t("— 素材を選んで適用 —")}</option>
                {project.materials.map((mat) => (
                  <option key={mat.id} value={mat.id}>{t(mat.name)}</option>
                ))}
              </select>
            </label>
            <section className="room-light-settings">
            <div className="panel-heading compact">
              <h2>{t("全照明を一括調整")}</h2>
            </div>
            <div className="room-wide-warning">
              <strong>{t("部屋全体に適用")}</strong>
              <span>{t("{count}灯すべての色温度を変更します", { count: project.lights.length })}</span>
            </div>
            <label className="field">
              <span>{t("全照明の色温度を一括変更")}</span>
              <ColorTempPresets value={NaN} onSelect={setAllColorTemperature} />
            </label>
            </section>
          </details>
        </>
      )}

      <footer className="inspector-footer">
        <button
          type="button"
          className="disclaimer-toggle"
          onClick={() => setDisclaimerOpen((open) => !open)}
          aria-expanded={disclaimerOpen}
        >
          {t("ℹ 免責")}
        </button>
        {disclaimerOpen && (
          <p className="disclaimer-text">
            {t("これは照明配置・雰囲気比較用の視覚シミュレーションです。実際の照度、配光、色、施工後の見え方を保証するものではありません。")}
          </p>
        )}
      </footer>
      <div className="mobile-settings-autosave" aria-live="polite">{t("自動保存")}</div>
    </aside>
  );
};
