import { useState, type ChangeEvent, type ReactNode } from "react";
import type { CeilingZone, FloorZone, FurnitureItem, LightFixture, LightType, MaterialPreset, Project, Selection, VoidArea, WallSegment, WindowOpening } from "../types";
import { useProjectStore } from "../store/projectStore";
import { applyFixtureModel, fixtureCatalog, getFixtureModel } from "../data/fixtureCatalog";
import { clamp, mToMm, mmToM } from "../utils/units";

type InspectorProps = {
  project: Project;
  selection: Selection;
  canEditWalls: boolean;
  mobileHeader?: ReactNode;
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

const aimHeightPresets: { label: string; heightM: number }[] = [
  { label: "床", heightM: 0 },
  { label: "机高", heightM: 0.72 },
  { label: "腰壁", heightM: 1.1 }
];

const AimTargetPresets = ({
  light,
  aim,
  onChange
}: {
  light: LightFixture;
  aim: LightFixture["target"];
  onChange: (target: NonNullable<LightFixture["target"]>) => void;
}) => {
  const currentAim = aim ?? { x: light.position.x, y: 0, z: light.position.z };
  const isStraightDown =
    Math.abs(currentAim.x - light.position.x) < 0.02 &&
    Math.abs(currentAim.z - light.position.z) < 0.02 &&
    Math.abs(currentAim.y) < 0.02;

  return (
    <div className="aim-control">
      <div className="chip-row aim-chip-row">
        <button
          type="button"
          className={isStraightDown ? "chip is-active" : "chip"}
          onClick={() => onChange({ x: light.position.x, y: 0, z: light.position.z })}
        >
          真下
          <span>直下</span>
        </button>
        {aimHeightPresets.map((preset) => (
          <button
            key={preset.label}
            type="button"
            className={Math.abs(currentAim.y - preset.heightM) < 0.03 && !isStraightDown ? "chip is-active" : "chip"}
            onClick={() => onChange({ ...currentAim, y: preset.heightM })}
          >
            {preset.label}
            <span>{Math.round(preset.heightM * 1000)}mm</span>
          </button>
        ))}
      </div>
      <p className="field-hint">黄色の照射ポイントを3Dビュー上で調整</p>
    </div>
  );
};

export const Inspector = ({ project, selection, canEditWalls, mobileHeader }: InspectorProps) => {
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

  const selectedLight =
    selection?.kind === "light" ? project.lights.find((light) => light.id === selection.id) : undefined;
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

  return (
    <aside className="inspector-panel" aria-label="プロパティインスペクター">
      {mobileHeader}
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

      <section className="panel-block">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Inspector</p>
            <h2>プロパティ</h2>
          </div>
        </div>
        {!selection && selectedLightIds.length === 0 && (
          <p className="muted">
            {canEditWalls
              ? "2Dまたは3Dで家具・照明・壁を選択してください。"
              : "2Dまたは3Dで家具・照明を選択してください。壁は間取り編集で変更できます。"}
          </p>
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
            updateLight={updateLight}
          />
        )}
        {selectedFurniture && <FurnitureInspector item={selectedFurniture} updateFurniture={updateFurniture} />}
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

      <section className="panel-block">
        <div className="panel-heading compact">
          <h2>照明一覧</h2>
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
            {project.lights.map((light) => (
              <option key={light.id} value={light.id}>
                {light.name}（{light.enabled !== false ? `${Math.round(light.dimmer ?? 100)}%` : "OFF"}）
              </option>
            ))}
          </select>
        </label>
      </section>

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
    </aside>
  );
};

const LightInspector = ({
  light,
  updateLight
}: {
  light: LightFixture;
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
    <div className="field-row">
      <NumberField label="X" unit="mm" value={mToMm(light.position.x)} onChange={(value) => updateLight(light.id, { position: { ...light.position, x: mmToM(value) } })} />
      <NumberField label="Y" unit="mm" value={mToMm(light.position.y)} onChange={(value) => updateLight(light.id, { position: { ...light.position, y: mmToM(value) }, mountHeightM: mmToM(value) })} />
      <NumberField label="Z" unit="mm" value={mToMm(light.position.z)} onChange={(value) => updateLight(light.id, { position: { ...light.position, z: mmToM(value) } })} />
    </div>
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
  </div>
  );
};

const BulkLightInspector = ({
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
        <option value="bed">ベッド</option>
        <option value="kitchen">キッチン</option>
        <option value="cupboard">カップボード</option>
        <option value="fridge">冷蔵庫</option>
        <option value="tv">TV</option>
        <option value="shelf">可動棚</option>
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

const readImageAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

const WallInspector = ({
  wall,
  project,
  updateWall,
  updateMaterial
}: {
  wall: WallSegment;
  project: Project;
  updateWall: (id: string, patch: Partial<WallSegment>) => void;
  updateMaterial: (id: string, patch: Partial<MaterialPreset>) => void;
}) => {
  const material = project.materials.find((item) => item.id === wall.materialId);
  const tile = material?.textureSizeM ?? { w: 0.92, h: 0.92 };
  return (
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
      <span>種別</span>
      <select
        value={wall.kind ?? "wall"}
        onChange={(event) => {
          const v = event.target.value as "wall" | "half" | "railing";
          // 種別切替時に妥当な既定高さを入れる（その後「高さ」欄で微調整可）。
          if (v === "half") updateWall(wall.id, { kind: "half", heightM: 0.95 });
          else if (v === "railing") updateWall(wall.id, { kind: "railing", heightM: 1.05 });
          else updateWall(wall.id, { kind: "wall", heightM: project.room.ceilingHeightM });
        }}
      >
        <option value="wall">通常壁</option>
        <option value="half">腰壁</option>
        <option value="railing">手すり</option>
      </select>
      <p className="field-hint">腰壁/手すりは吹き抜けまわりの表現に使えます。高さは上の欄で微調整可。</p>
    </label>
    <label className="field">
      <span>内側方向</span>
      <select
        value={wall.innerSide ?? "center"}
        onChange={(event) => {
          const v = event.target.value;
          updateWall(wall.id, { innerSide: v === "center" ? undefined : (v as "left" | "right") });
        }}
      >
        <option value="center">中央（既定）</option>
        <option value="left">左（start→end向きで左）</option>
        <option value="right">右（start→end向きで右）</option>
      </select>
      <p className="field-hint">start→endへ向かって室内側がどちらか。背景間取り図の内壁線にトレース線を合わせるとき使う</p>
    </label>
    <label className="field">
      <span>素材</span>
      <select
        value={wall.materialId}
        onChange={(event) => updateWall(wall.id, { materialId: event.target.value })}
      >
        {project.materials.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
      </select>
    </label>

    {material && (
      <section className="wallpaper-block">
        <p className="field-hint">壁紙はこの素材「{material.name}」を使う全ての壁に反映されます。</p>
        <label className="field">
          <span>壁紙画像</span>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              event.currentTarget.value = "";
              if (!file) return;
              const dataUrl = await readImageAsDataUrl(file);
              updateMaterial(material.id, {
                textureDataUrl: dataUrl,
                textureSizeM: material.textureSizeM ?? { w: 0.92, h: 0.92 }
              });
            }}
          />
        </label>
        {material.textureDataUrl && (
          <>
            <div className="wallpaper-preview">
              <img src={material.textureDataUrl} alt="壁紙プレビュー" />
            </div>
            <div className="field-row">
              <NumberField label="柄の幅" unit="mm" value={mToMm(tile.w)} min={50} onChange={(value) => updateMaterial(material.id, { textureSizeM: { w: mmToM(value), h: tile.h } })} />
              <NumberField label="柄の高さ" unit="mm" value={mToMm(tile.h)} min={50} onChange={(value) => updateMaterial(material.id, { textureSizeM: { w: tile.w, h: mmToM(value) } })} />
            </div>
            <button className="ghost-button" onClick={() => updateMaterial(material.id, { textureDataUrl: undefined })}>
              壁紙を外す
            </button>
          </>
        )}
      </section>
    )}
  </div>
  );
};

const WindowInspector = ({
  windowItem,
  project,
  updateWindow
}: {
  windowItem: WindowOpening;
  project: Project;
  updateWindow: (id: string, patch: Partial<WindowOpening>) => void;
}) => {
  const style = windowItem.style ?? (windowItem.hasGlass ? "window" : "opening");
  return (
  <div className="form-grid">
    <TextField label="名前" value={windowItem.name} onChange={(name) => updateWindow(windowItem.id, { name })} />
    <label className="field">
      <span>種類</span>
      <select
        value={style}
        onChange={(event) => {
          const next = event.target.value as "window" | "opening" | "door";
          updateWindow(windowItem.id, { style: next, hasGlass: next === "window" });
        }}
      >
        <option value="window">窓（ガラス）</option>
        <option value="door">扉</option>
        <option value="opening">開口</option>
      </select>
    </label>
    <label className="field">
      <span>設置する壁</span>
      <select
        value={windowItem.wallId}
        onChange={(event) => updateWindow(windowItem.id, { wallId: event.target.value })}
      >
        {project.walls.map((wall) => (
          <option key={wall.id} value={wall.id}>
            {wall.name}
          </option>
        ))}
      </select>
    </label>
    <div className="field-row">
      <NumberField label="幅" unit="mm" value={mToMm(windowItem.widthM)} min={100} onChange={(value) => updateWindow(windowItem.id, { widthM: mmToM(value) })} />
      <NumberField label="高さ" unit="mm" value={mToMm(windowItem.heightM)} min={100} onChange={(value) => updateWindow(windowItem.id, { heightM: mmToM(value) })} />
      <NumberField label="床から" unit="mm" value={mToMm(windowItem.sillHeightM)} min={0} onChange={(value) => updateWindow(windowItem.id, { sillHeightM: mmToM(value) })} />
    </div>
    <NumberField label="壁上の位置" unit="%" value={Math.round(windowItem.centerRatio * 100)} min={0} max={100} onChange={(value) => updateWindow(windowItem.id, { centerRatio: clamp(value / 100, 0, 1) })} />
  </div>
  );
};

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

const CeilingZoneInspector = ({
  zone,
  updateCeilingZone
}: {
  zone: CeilingZone;
  updateCeilingZone: (id: string, patch: Partial<CeilingZone>) => void;
}) => (
  <div className="form-grid">
    <TextField label="名前" value={zone.name} onChange={(name) => updateCeilingZone(zone.id, { name })} />
    <div className="field-row">
      <NumberField label="X" unit="mm" value={mToMm(zone.center.x)} onChange={(value) => updateCeilingZone(zone.id, { center: { ...zone.center, x: mmToM(value) } })} />
      <NumberField label="Z" unit="mm" value={mToMm(zone.center.z)} onChange={(value) => updateCeilingZone(zone.id, { center: { ...zone.center, z: mmToM(value) } })} />
    </div>
    <div className="field-row">
      <NumberField label="幅" unit="mm" value={mToMm(zone.size.x)} min={100} onChange={(value) => updateCeilingZone(zone.id, { size: { ...zone.size, x: mmToM(value) } })} />
      <NumberField label="奥行" unit="mm" value={mToMm(zone.size.z)} min={100} onChange={(value) => updateCeilingZone(zone.id, { size: { ...zone.size, z: mmToM(value) } })} />
    </div>
    <NumberField label="下がり" unit="mm" value={mToMm(zone.dropM)} min={20} max={1000} onChange={(value) => updateCeilingZone(zone.id, { dropM: mmToM(value) })} />
  </div>
);

const FloorZoneInspector = ({
  zone,
  updateFloorZone,
  floorLevelM,
  setFloorLevel
}: {
  zone: FloorZone;
  updateFloorZone: (id: string, patch: Partial<FloorZone>) => void;
  floorLevelM: number;
  setFloorLevel: (v: number) => void;
}) => (
  <div className="form-grid">
    <TextField label="名前" value={zone.name} onChange={(name) => updateFloorZone(zone.id, { name })} />
    <div className="field-row">
      <NumberField label="X" unit="mm" value={mToMm(zone.center.x)} onChange={(value) => updateFloorZone(zone.id, { center: { ...zone.center, x: mmToM(value) } })} />
      <NumberField label="Z" unit="mm" value={mToMm(zone.center.z)} onChange={(value) => updateFloorZone(zone.id, { center: { ...zone.center, z: mmToM(value) } })} />
    </div>
    <div className="field-row">
      <NumberField label="幅" unit="mm" value={mToMm(zone.size.x)} min={100} onChange={(value) => updateFloorZone(zone.id, { size: { ...zone.size, x: mmToM(value) } })} />
      <NumberField label="奥行" unit="mm" value={mToMm(zone.size.z)} min={100} onChange={(value) => updateFloorZone(zone.id, { size: { ...zone.size, z: mmToM(value) } })} />
    </div>
    <NumberField label="下げ量" unit="mm" value={mToMm(zone.dropM)} min={20} max={500} onChange={(value) => updateFloorZone(zone.id, { dropM: mmToM(value) })} />
    <NumberField
      label="室内床レベル"
      unit="mm"
      value={mToMm(floorLevelM)}
      min={0}
      onChange={(value) => setFloorLevel(mmToM(value))}
    />
    <p className="field-hint">土間の下がり量をこの値に合わせると土間が地面(0)になる</p>
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
