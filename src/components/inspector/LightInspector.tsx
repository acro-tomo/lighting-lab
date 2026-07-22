import type { LightFixture, LightType, Project } from "../../types";
import { applyFixtureModel, fixtureCatalog, getFixtureModel } from "../../data/fixtureCatalog";
import { clamp, mToMm, mmToM } from "../../utils/units";
import { AdvancedPositionDetails, NumberField, TextField } from "./fields";
import { ColorTempPresets } from "./ColorTempPresets";
import { AimTargetPresets } from "./AimControls";
import { PlacementGuide } from "./PlacementGuide";
import { useI18n } from "../../i18n";

const lightTypeLabels: Record<LightType, string> = {
  downlight: "ダウンライト",
  spotlight: "スポットライト",
  pendant: "ペンダント",
  bracket: "ブラケット",
  tape: "テープライト"
};

export const LightInspector = ({
  light,
  project,
  updateLight
}: {
  light: LightFixture;
  project: Project;
  updateLight: (id: string, patch: Partial<LightFixture>) => void;
}) => {
  const { t } = useI18n();
  const currentModel = getFixtureModel(light);
  return (
    <div className="form-grid light-inspector">
      <header className="light-inspector-heading">
        <p>{t("選択中の照明")}</p>
        <h2>{t(lightTypeLabels[light.type])}{t("を編集")}</h2>
        <span>{t(light.name)}</span>
        <strong className={light.enabled !== false ? "light-status is-on" : "light-status"}>
          ● {light.enabled !== false ? t("点灯中") : t("消灯中")}
        </strong>
      </header>
      <div className="light-primary-controls">
        <label className="light-toggle">
          <span>ON / OFF</span>
          <input
            type="checkbox"
            role="switch"
            checked={light.enabled !== false}
            onChange={(event) => updateLight(light.id, { enabled: event.target.checked })}
          />
          <i aria-hidden="true" />
          <strong>{light.enabled !== false ? "ON" : "OFF"}</strong>
        </label>
        <label className="light-range-control">
          <span>{t("明るさ")}</span>
          <div>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(light.dimmer ?? 100)}
              onChange={(event) => updateLight(light.id, { dimmer: clamp(Number(event.target.value), 0, 100) })}
            />
            <output>{Math.round(light.dimmer ?? 100)}%</output>
          </div>
        </label>
      </div>
      <section className="light-inspector-section">
        <h3>{t("設置高さ")}</h3>
        <NumberField
          label={t("床からの高さ")}
          unit="mm"
          value={mToMm(light.position.y)}
          min={0}
          onChange={(value) => updateLight(light.id, { position: { ...light.position, y: mmToM(value) }, mountHeightM: mmToM(value) })}
        />
      </section>
      <section className="light-inspector-section">
        <h3>{t("色温度")}</h3>
        <ColorTempPresets
          value={light.colorTemperatureK}
          onSelect={(colorTemperatureK) => updateLight(light.id, { colorTemperatureK })}
        />
        <NumberField
          label={t("色温度")}
          unit="K"
          value={light.colorTemperatureK}
          min={1800}
          max={6500}
          step={50}
          onChange={(colorTemperatureK) => updateLight(light.id, { colorTemperatureK })}
        />
      </section>
      {light.type === "pendant" && (
        <section className="light-inspector-section">
          <h3>{t("吊り長さ")}</h3>
          <label className="light-range-control">
            <span>{t("天井から")}</span>
            <div>
              <input
                type="range"
                min={100}
                max={3000}
                step={10}
                value={mToMm(light.cordLengthM ?? 0.6)}
                onChange={(event) => updateLight(light.id, { cordLengthM: mmToM(Number(event.target.value)) })}
              />
              <output>{mToMm(light.cordLengthM ?? 0.6).toLocaleString("ja-JP")}mm</output>
            </div>
          </label>
        </section>
      )}
      <section className="light-inspector-section">
        <h3>{t("器具・配光")}</h3>
        <label className="field">
          <span>{t("器具")}</span>
          <select
            value={currentModel.id}
            onChange={(event) => {
              const model = fixtureCatalog.find((item) => item.id === event.target.value);
              if (!model) return;
              const patch = applyFixtureModel(model);
              if (model.aimable && !light.target) {
                patch.target = { x: light.position.x, y: 0, z: light.position.z };
              }
              updateLight(light.id, patch);
            }}
          >
            {fixtureCatalog.map((model) => (
              <option key={model.id} value={model.id}>
                {t(model.label)} ({model.beamAngleDeg}°{model.glareless ? ` / ${t("グレアレス")}` : ""})
              </option>
            ))}
          </select>
        </label>
        <p className="field-hint">{t(currentModel.description)}</p>
        {currentModel.aimable && (
          <div className="field">
            <span>{t("照射先")}</span>
            <AimTargetPresets light={light} aim={light.target} onChange={(target) => updateLight(light.id, { target })} />
          </div>
        )}
        {light.type === "tape" && (
          <NumberField label={t("長さ")} unit="mm" value={mToMm(light.lengthM ?? 1.2)} min={100} max={10000} onChange={(value) => updateLight(light.id, { lengthM: mmToM(value) })} />
        )}
      </section>
      <PlacementGuide
        project={project}
        subject={{ id: light.id, name: light.name, kindLabel: t("照明"), position: light.position, floor: light.floor }}
        collapsible
      />
      <AdvancedPositionDetails>
        <TextField label={t("名前")} value={light.name} onChange={(name) => updateLight(light.id, { name })} />
        <NumberField
          label={t("明るさ（光束）")}
          unit="lm"
          value={light.lumens}
          min={0}
          onChange={(lumens) => updateLight(light.id, { lumens })}
        />
        <NumberField
          label={t("光の広がり（器具プリセットを上書き）")}
          unit="°"
          value={light.beamAngleDeg}
          min={5}
          max={180}
          onChange={(beamAngleDeg) => updateLight(light.id, { beamAngleDeg })}
        />
        <label className="field">
          <span>{t("メモ")}</span>
          <textarea value={light.note} onChange={(event) => updateLight(light.id, { note: event.target.value })} />
        </label>
        <div className="field-row">
          <NumberField label="X" unit="mm" value={mToMm(light.position.x)} onChange={(value) => updateLight(light.id, { position: { ...light.position, x: mmToM(value) } })} />
          <NumberField label="Z" unit="mm" value={mToMm(light.position.z)} onChange={(value) => updateLight(light.id, { position: { ...light.position, z: mmToM(value) } })} />
        </div>
      </AdvancedPositionDetails>
    </div>
  );
};

export const BulkLightInspector = ({
  lights,
  updateLights
}: {
  lights: LightFixture[];
  updateLights: (patch: Partial<LightFixture>) => void;
}) => {
  const { t } = useI18n();
  const rep = lights[0];
  return (
    <div className="form-grid">
      <p className="field-hint"><strong>{t("{count}個のライトを選択中", { count: lights.length })}</strong> — {t("変更は全選択ライトに適用されます。")}</p>
      <div className="scene-control">
        <label className="light-onoff-label">
          <input
            type="checkbox"
            checked={rep.enabled !== false}
            onChange={(event) => updateLights({ enabled: event.target.checked })}
          />
          <strong>{rep.enabled !== false ? "ON" : "OFF"}</strong>
        </label>
        <NumberField
          label={t("調光")}
          unit="%"
          value={Math.round(rep.dimmer ?? 100)}
          min={0}
          max={100}
          onChange={(dimmer) => updateLights({ dimmer: clamp(dimmer, 0, 100) })}
        />
      </div>
      <label className="field">
        <span>{t("種類")}</span>
        <select
          value={rep.type}
          onChange={(event) => updateLights({ type: event.target.value as LightType })}
        >
          <option value="downlight">{t("ダウンライト")}</option>
          <option value="spotlight">{t("スポットライト")}</option>
          <option value="pendant">{t("ペンダント")}</option>
          <option value="bracket">{t("ブラケット")}</option>
          <option value="tape">{t("テープ")}</option>
        </select>
      </label>
      <div className="field-row">
        <NumberField label={t("光束")} unit="lm" value={rep.lumens} min={0} onChange={(lumens) => updateLights({ lumens })} />
        <NumberField label={t("色温度")} unit="K" value={rep.colorTemperatureK} min={1800} max={6500} step={50} onChange={(colorTemperatureK) => updateLights({ colorTemperatureK })} />
      </div>
      <label className="field">
        <span>{t("色温度プリセット")}</span>
        <ColorTempPresets
          value={rep.colorTemperatureK}
          onSelect={(colorTemperatureK) => updateLights({ colorTemperatureK })}
        />
      </label>
      <NumberField
        label={t("照射角度")}
        unit="°"
        value={rep.beamAngleDeg}
        min={5}
        max={180}
        onChange={(beamAngleDeg) => updateLights({ beamAngleDeg })}
      />
    </div>
  );
};
