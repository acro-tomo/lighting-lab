import type { FurnitureItem, Project } from "../../types";
import { mToMm, mmToM } from "../../utils/units";
import { AdvancedPositionDetails, NumberField, TextField } from "./fields";
import { PlacementGuide } from "./PlacementGuide";

export const FurnitureInspector = ({
  item,
  project,
  updateFurniture
}: {
  item: FurnitureItem;
  project: Project;
  updateFurniture: (id: string, patch: Partial<FurnitureItem>) => void;
}) => (
  <div className="form-grid">
    <TextField label="名前" value={item.name} onChange={(name) => updateFurniture(item.id, { name })} />
    <PlacementGuide
      project={project}
      subject={{ id: item.id, name: item.name, kindLabel: "家具", position: item.position, floor: item.floor }}
    />
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
    <AdvancedPositionDetails>
      <div className="field-row">
        <NumberField label="X" unit="mm" value={mToMm(item.position.x)} onChange={(value) => updateFurniture(item.id, { position: { ...item.position, x: mmToM(value) } })} />
        <NumberField label="Y" unit="mm" value={mToMm(item.position.y)} onChange={(value) => updateFurniture(item.id, { position: { ...item.position, y: mmToM(value) } })} />
        <NumberField label="Z" unit="mm" value={mToMm(item.position.z)} onChange={(value) => updateFurniture(item.id, { position: { ...item.position, z: mmToM(value) } })} />
      </div>
    </AdvancedPositionDetails>
  </div>
);
