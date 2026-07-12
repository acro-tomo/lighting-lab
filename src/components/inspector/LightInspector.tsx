import type { LightFixture, LightType, Project } from "../../types";
import { applyFixtureModel, fixtureCatalog, getFixtureModel } from "../../data/fixtureCatalog";
import { clamp, mToMm, mmToM } from "../../utils/units";
import { AdvancedPositionDetails, NumberField, TextField } from "./fields";
import { ColorTempPresets } from "./ColorTempPresets";
import { AimTargetPresets } from "./AimControls";
import { PlacementGuide } from "./PlacementGuide";

export const LightInspector = ({
  light,
  project,
  updateLight
}: {
  light: LightFixture;
  project: Project;
  updateLight: (id: string, patch: Partial<LightFixture>) => void;
}) => {
  const currentModel = getFixtureModel(light);
  return (
  <div className="form-grid">
    <div className="scene-control">
      <label className="light-onoff-label">
        <input
          type="checkbox"
          checked={light.enabled !== false}
          onChange={(event) => updateLight(light.id, { enabled: event.target.checked })}
        />
        <strong>{light.enabled !== false ? "ON" : "OFF"}</strong>
      </label>
      <NumberField
        label="調光"
        unit="%"
        value={Math.round(light.dimmer ?? 100)}
        min={0}
        max={100}
        onChange={(dimmer) => updateLight(light.id, { dimmer: clamp(dimmer, 0, 100) })}
      />
    </div>
    <TextField label="名前" value={light.name} onChange={(name) => updateLight(light.id, { name })} />
    <PlacementGuide
      project={project}
      subject={{ id: light.id, name: light.name, kindLabel: "照明", position: light.position, floor: light.floor }}
    />
    <label className="field">
      <span>器具（配光は器具ごとに固定）</span>
      <select
        value={currentModel.id}
        onChange={(event) => {
          const model = fixtureCatalog.find((item) => item.id === event.target.value);
          if (!model) return;
          const patch = applyFixtureModel(model);
          // 首振り器具にしたとき照射先が無ければ真下に初期化する。
          if (model.aimable && !light.target) {
            patch.target = { x: light.position.x, y: 0, z: light.position.z };
          }
          updateLight(light.id, patch);
        }}
      >
        {fixtureCatalog.map((model) => (
          <option key={model.id} value={model.id}>
            {model.label}（{model.beamAngleDeg}°{model.glareless ? " / グレアレス" : ""}）
          </option>
        ))}
      </select>
    </label>
    <p className="field-hint">{currentModel.description}</p>
    {currentModel.aimable && (
      <div className="field">
        <span>照射先</span>
        <AimTargetPresets light={light} aim={light.target} onChange={(target) => updateLight(light.id, { target })} />
      </div>
    )}
    {light.type === "pendant" && (
      <NumberField label="吊り長さ" unit="mm" value={mToMm(light.cordLengthM ?? 0.6)} min={100} max={3000} onChange={(value) => updateLight(light.id, { cordLengthM: mmToM(value) })} />
    )}
    {light.type === "tape" && (
      <NumberField label="長さ" unit="mm" value={mToMm(light.lengthM ?? 1.2)} min={100} max={10000} onChange={(value) => updateLight(light.id, { lengthM: mmToM(value) })} />
    )}
    <div className="field-row">
      <NumberField label="光束" unit="lm" value={light.lumens} min={0} onChange={(lumens) => updateLight(light.id, { lumens })} />
      <NumberField label="色温度" unit="K" value={light.colorTemperatureK} min={1800} max={6500} step={50} onChange={(colorTemperatureK) => updateLight(light.id, { colorTemperatureK })} />
    </div>
    <label className="field">
      <span>色温度プリセット</span>
      <ColorTempPresets
        value={light.colorTemperatureK}
        onSelect={(colorTemperatureK) => updateLight(light.id, { colorTemperatureK })}
      />
    </label>
    <NumberField
      label="照射角度（器具プリセットを上書き）"
      unit="°"
      value={light.beamAngleDeg}
      min={5}
      max={180}
      onChange={(beamAngleDeg) => updateLight(light.id, { beamAngleDeg })}
    />
    <label className="field">
      <span>メモ</span>
      <textarea value={light.note} onChange={(event) => updateLight(light.id, { note: event.target.value })} />
    </label>
    <AdvancedPositionDetails>
      <div className="field-row">
        <NumberField label="X" unit="mm" value={mToMm(light.position.x)} onChange={(value) => updateLight(light.id, { position: { ...light.position, x: mmToM(value) } })} />
        <NumberField label="Y" unit="mm" value={mToMm(light.position.y)} onChange={(value) => updateLight(light.id, { position: { ...light.position, y: mmToM(value) }, mountHeightM: mmToM(value) })} />
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
  // 先頭ライトを代表値とする。全一致の場合はその値、不一致の場合も先頭値を初期表示する。
  const rep = lights[0];
  return (
    <div className="form-grid">
      <p className="field-hint"><strong>{lights.length}個のライトを選択中</strong> — 変更は全選択ライトに適用されます。</p>
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
          label="調光"
          unit="%"
          value={Math.round(rep.dimmer ?? 100)}
          min={0}
          max={100}
          onChange={(dimmer) => updateLights({ dimmer: clamp(dimmer, 0, 100) })}
        />
      </div>
      <label className="field">
        <span>種類</span>
        <select
          value={rep.type}
          onChange={(event) => updateLights({ type: event.target.value as LightType })}
        >
          <option value="downlight">ダウンライト</option>
          <option value="spotlight">スポットライト</option>
          <option value="pendant">ペンダント</option>
          <option value="bracket">ブラケット</option>
          <option value="tape">テープ</option>
        </select>
      </label>
      <div className="field-row">
        <NumberField label="光束" unit="lm" value={rep.lumens} min={0} onChange={(lumens) => updateLights({ lumens })} />
        <NumberField label="色温度" unit="K" value={rep.colorTemperatureK} min={1800} max={6500} step={50} onChange={(colorTemperatureK) => updateLights({ colorTemperatureK })} />
      </div>
      <label className="field">
        <span>色温度プリセット</span>
        <ColorTempPresets
          value={rep.colorTemperatureK}
          onSelect={(colorTemperatureK) => updateLights({ colorTemperatureK })}
        />
      </label>
      <NumberField
        label="照射角度"
        unit="°"
        value={rep.beamAngleDeg}
        min={5}
        max={180}
        onChange={(beamAngleDeg) => updateLights({ beamAngleDeg })}
      />
    </div>
  );
};
