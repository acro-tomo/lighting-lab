import type { ChangeEvent } from "react";
import type { FurnitureItem, LightFixture, Project, Selection, VoidArea, WallSegment, WindowOpening } from "../types";
import { useProjectStore } from "../store/projectStore";
import { getSceneLightState } from "../utils/lighting";
import { clamp, mToMm, mmToM } from "../utils/units";

type InspectorProps = {
  project: Project;
  selection: Selection;
};

// 日本の住宅照明で一般的な色温度プリセット。ワンタップで切替できるようにする。
const colorTempPresets: { label: string; kelvin: number }[] = [
  { label: "電球色", kelvin: 2700 },
  { label: "温白色", kelvin: 3500 },
  { label: "昼白色", kelvin: 5000 },
  { label: "昼光色", kelvin: 6500 }
];

const ColorTempPresets = ({
  value,
  onSelect
}: {
  value: number;
  onSelect: (kelvin: number) => void;
}) => (
  <div className="chip-row">
    {colorTempPresets.map((preset) => (
      <button
        key={preset.kelvin}
        type="button"
        className={Math.abs(value - preset.kelvin) <= 100 ? "chip is-active" : "chip"}
        onClick={() => onSelect(preset.kelvin)}
      >
        {preset.label}
        <span>{preset.kelvin}K</span>
      </button>
    ))}
  </div>
);

export const Inspector = ({ project, selection }: InspectorProps) => {
  const updateLight = useProjectStore((state) => state.updateLight);
  const updateSceneLightState = useProjectStore((state) => state.updateSceneLightState);
  const updateFurniture = useProjectStore((state) => state.updateFurniture);
  const updateWall = useProjectStore((state) => state.updateWall);
  const updateWindow = useProjectStore((state) => state.updateWindow);
  const updateVoid = useProjectStore((state) => state.updateVoid);
  const setAllColorTemperature = useProjectStore((state) => state.setAllColorTemperature);
  const select = useProjectStore((state) => state.select);
  const activeScene = project.lightingScenes.find((scene) => scene.id === project.activeSceneId);

  const selectedLight =
    selection?.kind === "light" ? project.lights.find((light) => light.id === selection.id) : undefined;
  const selectedFurniture =
    selection?.kind === "furniture"
      ? project.furniture.find((item) => item.id === selection.id)
      : undefined;
  const selectedWall =
    selection?.kind === "wall" ? project.walls.find((wall) => wall.id === selection.id) : undefined;
  const selectedWindow =
    selection?.kind === "window" || selection?.kind === "opening"
      ? project.windows.find((windowItem) => windowItem.id === selection.id)
      : undefined;
  const selectedVoid =
    selection?.kind === "void" ? project.voids.find((voidArea) => voidArea.id === selection.id) : undefined;

  const totalActiveLumens = project.lights.reduce((sum, light) => {
    const state = getSceneLightState(light, activeScene);
    return sum + (state.enabled ? light.lumens * state.dimmer * 0.01 : 0);
  }, 0);

  return (
    <aside className="inspector-panel" aria-label="プロパティインスペクター">
      <section className="disclaimer">
        これは照明配置・雰囲気比較用の視覚シミュレーションです。実際の照度、配光、色、施工後の見え方を保証するものではありません。
      </section>

      <section className="summary-strip">
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
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Inspector</p>
            <h2>プロパティ</h2>
          </div>
        </div>
        {!selection && <p className="muted">2Dまたは3Dで家具・照明・壁を選択してください。</p>}
        {selectedLight && activeScene && (
          <LightInspector
            light={selectedLight}
            sceneId={activeScene.id}
            sceneState={getSceneLightState(selectedLight, activeScene)}
            updateLight={updateLight}
            updateSceneLightState={updateSceneLightState}
          />
        )}
        {selectedFurniture && <FurnitureInspector item={selectedFurniture} updateFurniture={updateFurniture} />}
        {selectedWall && (
          <WallInspector wall={selectedWall} project={project} updateWall={updateWall} />
        )}
        {selectedWindow && <WindowInspector windowItem={selectedWindow} updateWindow={updateWindow} />}
        {selectedVoid && <VoidInspector voidArea={selectedVoid} updateVoid={updateVoid} />}
      </section>

      <section className="panel-block">
        <div className="panel-heading compact">
          <h2>照明一覧</h2>
          <span>{activeScene?.name}</span>
        </div>
        <label className="field">
          <span>全照明の色温度を一括変更</span>
          <ColorTempPresets value={NaN} onSelect={setAllColorTemperature} />
        </label>
        <label className="field">
          <span>照明を選択</span>
          <select
            value={selection?.kind === "light" ? selection.id : ""}
            onChange={(event) => {
              const value = event.target.value;
              select(value ? { kind: "light", id: value } : null);
            }}
          >
            <option value="">— 照明を選択 —</option>
            {project.lights.map((light) => {
              const state = getSceneLightState(light, activeScene);
              return (
                <option key={light.id} value={light.id}>
                  {light.name}（{state.enabled ? `${Math.round(state.dimmer)}%` : "OFF"}）
                </option>
              );
            })}
          </select>
        </label>
      </section>
    </aside>
  );
};

const LightInspector = ({
  light,
  sceneId,
  sceneState,
  updateLight,
  updateSceneLightState
}: {
  light: LightFixture;
  sceneId: string;
  sceneState: { enabled: boolean; dimmer: number };
  updateLight: (id: string, patch: Partial<LightFixture>) => void;
  updateSceneLightState: (
    sceneId: string,
    lightId: string,
    patch: { enabled?: boolean; dimmer?: number }
  ) => void;
}) => (
  <div className="form-grid">
    <TextField label="名前" value={light.name} onChange={(name) => updateLight(light.id, { name })} />
    <label className="field">
      <span>器具タイプ</span>
      <select
        value={light.type}
        onChange={(event) => updateLight(light.id, { type: event.target.value as LightFixture["type"] })}
      >
        <option value="downlight">ダウンライト</option>
        <option value="spotlight">スポットライト</option>
        <option value="pendant">ペンダント</option>
        <option value="bracket">ブラケット</option>
        <option value="tape">テープライト</option>
      </select>
    </label>
    <div className="field-row">
      <NumberField label="X" unit="mm" value={mToMm(light.position.x)} onChange={(value) => updateLight(light.id, { position: { ...light.position, x: mmToM(value) } })} />
      <NumberField label="Y" unit="mm" value={mToMm(light.position.y)} onChange={(value) => updateLight(light.id, { position: { ...light.position, y: mmToM(value) }, mountHeightM: mmToM(value) })} />
      <NumberField label="Z" unit="mm" value={mToMm(light.position.z)} onChange={(value) => updateLight(light.id, { position: { ...light.position, z: mmToM(value) } })} />
    </div>
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
    <div className="field-row">
      <NumberField label="ビーム角" unit="deg" value={light.beamAngleDeg} min={8} max={180} onChange={(beamAngleDeg) => updateLight(light.id, { beamAngleDeg })} />
      <NumberField label="半影" unit="" value={Math.round(light.penumbra * 100)} min={0} max={100} onChange={(value) => updateLight(light.id, { penumbra: clamp(value / 100, 0, 1) })} />
    </div>
    <div className="scene-control">
      <label>
        <input
          type="checkbox"
          checked={sceneState.enabled}
          onChange={(event) => updateSceneLightState(sceneId, light.id, { enabled: event.target.checked })}
        />
        現在の照明シーンでON
      </label>
      <NumberField
        label="調光"
        unit="%"
        value={Math.round(sceneState.dimmer)}
        min={0}
        max={100}
        onChange={(dimmer) => updateSceneLightState(sceneId, light.id, { dimmer: clamp(dimmer, 0, 100) })}
      />
    </div>
    <label className="field">
      <span>メモ</span>
      <textarea value={light.note} onChange={(event) => updateLight(light.id, { note: event.target.value })} />
    </label>
  </div>
);

const FurnitureInspector = ({
  item,
  updateFurniture
}: {
  item: FurnitureItem;
  updateFurniture: (id: string, patch: Partial<FurnitureItem>) => void;
}) => (
  <div className="form-grid">
    <TextField label="名前" value={item.name} onChange={(name) => updateFurniture(item.id, { name })} />
    <label className="field">
      <span>種類</span>
      <select
        value={item.type}
        onChange={(event) => updateFurniture(item.id, { type: event.target.value as FurnitureItem["type"] })}
      >
        <option value="box">ボックス</option>
        <option value="roundTable">丸テーブル</option>
        <option value="rectTable">角テーブル</option>
        <option value="chair">椅子</option>
        <option value="sofa">ソファ</option>
        <option value="kitchen">キッチン</option>
        <option value="cupboard">収納</option>
        <option value="tv">TV</option>
        <option value="shelf">棚</option>
        <option value="counter">カウンター</option>
        <option value="rug">ラグ</option>
        <option value="stair">階段</option>
      </select>
    </label>
    <div className="field-row">
      <NumberField label="X" unit="mm" value={mToMm(item.position.x)} onChange={(value) => updateFurniture(item.id, { position: { ...item.position, x: mmToM(value) } })} />
      <NumberField label="Y" unit="mm" value={mToMm(item.position.y)} onChange={(value) => updateFurniture(item.id, { position: { ...item.position, y: mmToM(value) } })} />
      <NumberField label="Z" unit="mm" value={mToMm(item.position.z)} onChange={(value) => updateFurniture(item.id, { position: { ...item.position, z: mmToM(value) } })} />
    </div>
    <div className="field-row">
      <NumberField label="幅" unit="mm" value={mToMm(item.size.x)} min={10} onChange={(value) => updateFurniture(item.id, { size: { ...item.size, x: mmToM(value) } })} />
      <NumberField label="高さ" unit="mm" value={mToMm(item.size.y)} min={10} onChange={(value) => updateFurniture(item.id, { size: { ...item.size, y: mmToM(value) } })} />
      <NumberField label="奥行" unit="mm" value={mToMm(item.size.z)} min={10} onChange={(value) => updateFurniture(item.id, { size: { ...item.size, z: mmToM(value) } })} />
    </div>
    <NumberField label="回転" unit="deg" value={item.rotationYDeg} onChange={(rotationYDeg) => updateFurniture(item.id, { rotationYDeg })} />
    <label className="scene-control">
      <input
        type="checkbox"
        checked={item.castsShadow}
        onChange={(event) => updateFurniture(item.id, { castsShadow: event.target.checked })}
      />
      影を落とす
    </label>
  </div>
);

const WallInspector = ({
  wall,
  project,
  updateWall
}: {
  wall: WallSegment;
  project: Project;
  updateWall: (id: string, patch: Partial<WallSegment>) => void;
}) => (
  <div className="form-grid">
    <TextField label="名前" value={wall.name} onChange={(name) => updateWall(wall.id, { name })} />
    <div className="field-row">
      <NumberField label="始点X" unit="mm" value={mToMm(wall.start.x)} onChange={(value) => updateWall(wall.id, { start: { ...wall.start, x: mmToM(value) } })} />
      <NumberField label="始点Z" unit="mm" value={mToMm(wall.start.z)} onChange={(value) => updateWall(wall.id, { start: { ...wall.start, z: mmToM(value) } })} />
    </div>
    <div className="field-row">
      <NumberField label="終点X" unit="mm" value={mToMm(wall.end.x)} onChange={(value) => updateWall(wall.id, { end: { ...wall.end, x: mmToM(value) } })} />
      <NumberField label="終点Z" unit="mm" value={mToMm(wall.end.z)} onChange={(value) => updateWall(wall.id, { end: { ...wall.end, z: mmToM(value) } })} />
    </div>
    <div className="field-row">
      <NumberField label="厚み" unit="mm" value={mToMm(wall.thicknessM)} min={20} onChange={(value) => updateWall(wall.id, { thicknessM: mmToM(value) })} />
      <NumberField label="高さ" unit="mm" value={mToMm(wall.heightM)} min={100} onChange={(value) => updateWall(wall.id, { heightM: mmToM(value) })} />
    </div>
    <label className="field">
      <span>素材</span>
      <select
        value={wall.materialId}
        onChange={(event) => updateWall(wall.id, { materialId: event.target.value })}
      >
        {project.materials.map((material) => (
          <option key={material.id} value={material.id}>
            {material.name}
          </option>
        ))}
      </select>
    </label>
  </div>
);

const WindowInspector = ({
  windowItem,
  updateWindow
}: {
  windowItem: WindowOpening;
  updateWindow: (id: string, patch: Partial<WindowOpening>) => void;
}) => (
  <div className="form-grid">
    <TextField label="名前" value={windowItem.name} onChange={(name) => updateWindow(windowItem.id, { name })} />
    <div className="field-row">
      <NumberField label="幅" unit="mm" value={mToMm(windowItem.widthM)} min={100} onChange={(value) => updateWindow(windowItem.id, { widthM: mmToM(value) })} />
      <NumberField label="高さ" unit="mm" value={mToMm(windowItem.heightM)} min={100} onChange={(value) => updateWindow(windowItem.id, { heightM: mmToM(value) })} />
      <NumberField label="床から" unit="mm" value={mToMm(windowItem.sillHeightM)} min={0} onChange={(value) => updateWindow(windowItem.id, { sillHeightM: mmToM(value) })} />
    </div>
    <NumberField label="壁上の位置" unit="%" value={Math.round(windowItem.centerRatio * 100)} min={0} max={100} onChange={(value) => updateWindow(windowItem.id, { centerRatio: clamp(value / 100, 0, 1) })} />
    <label className="scene-control">
      <input
        type="checkbox"
        checked={windowItem.hasGlass}
        onChange={(event) => updateWindow(windowItem.id, { hasGlass: event.target.checked })}
      />
      ガラスあり
    </label>
  </div>
);

const VoidInspector = ({
  voidArea,
  updateVoid
}: {
  voidArea: VoidArea;
  updateVoid: (id: string, patch: Partial<VoidArea>) => void;
}) => (
  <div className="form-grid">
    <TextField label="名前" value={voidArea.name} onChange={(name) => updateVoid(voidArea.id, { name })} />
    <div className="field-row">
      <NumberField label="X" unit="mm" value={mToMm(voidArea.center.x)} onChange={(value) => updateVoid(voidArea.id, { center: { ...voidArea.center, x: mmToM(value) } })} />
      <NumberField label="Z" unit="mm" value={mToMm(voidArea.center.z)} onChange={(value) => updateVoid(voidArea.id, { center: { ...voidArea.center, z: mmToM(value) } })} />
    </div>
    <div className="field-row">
      <NumberField label="幅" unit="mm" value={mToMm(voidArea.size.x)} min={100} onChange={(value) => updateVoid(voidArea.id, { size: { ...voidArea.size, x: mmToM(value) } })} />
      <NumberField label="奥行" unit="mm" value={mToMm(voidArea.size.z)} min={100} onChange={(value) => updateVoid(voidArea.id, { size: { ...voidArea.size, z: mmToM(value) } })} />
    </div>
  </div>
);

const NumberField = ({
  label,
  unit,
  value,
  min,
  max,
  step = 1,
  onChange
}: {
  label: string;
  unit: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
}) => (
  <label className="field">
    <span>{label}</span>
    <div className="number-input">
      <input
        type="number"
        value={Number.isFinite(value) ? value : 0}
        min={min}
        max={max}
        step={step}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      {unit && <em>{unit}</em>}
    </div>
  </label>
);

const TextField = ({
  label,
  value,
  onChange
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) => (
  <label className="field">
    <span>{label}</span>
    <input
      type="text"
      value={value}
      onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(event.target.value)}
    />
  </label>
);
