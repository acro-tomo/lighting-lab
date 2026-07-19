import type { FurnitureItem, Project } from "../../types";
import { mToMm, mmToM } from "../../utils/units";
import { AdvancedPositionDetails, NumberField, TextField } from "./fields";
import { PlacementGuide } from "./PlacementGuide";
import { useI18n } from "../../i18n";

export const FurnitureInspector = ({
  item,
  project,
  updateFurniture
}: {
  item: FurnitureItem;
  project: Project;
  updateFurniture: (id: string, patch: Partial<FurnitureItem>) => void;
}) => {
  const { t } = useI18n();
  return <div className="form-grid">
    <header className="selection-inspector-heading">
      <p>{t("選択中の家具")}</p>
      <h2>{t(item.name)}</h2>
      <span>{item.type === "sofa" ? t("ソファ") : item.type === "tv" ? "TV" : t("家具")}</span>
    </header>
    <TextField label={t("名前")} value={t(item.name)} onChange={(name) => updateFurniture(item.id, { name })} />
    <PlacementGuide
      project={project}
      subject={{ id: item.id, name: item.name, kindLabel: t("家具"), position: item.position, floor: item.floor }}
    />
    <label className="field">
      <span>{t("種類")}</span>
      <select
        value={item.type}
        onChange={(event) => updateFurniture(item.id, { type: event.target.value as FurnitureItem["type"] })}
      >
        <option value="box">{t("ボックス")}</option>
        <option value="roundTable">{t("丸テーブル")}</option>
        <option value="rectTable">{t("角テーブル")}</option>
        <option value="chair">{t("椅子")}</option>
        <option value="loungeChair">{t("ラウンジチェア")}</option>
        <option value="sofa">{t("ソファ")}</option>
        <option value="plant">{t("大型植物")}</option>
        <option value="bed">{t("ベッド")}</option>
        <option value="kitchen">{t("キッチン")}</option>
        <option value="cupboard">{t("カップボード")}</option>
        <option value="fridge">{t("冷蔵庫")}</option>
        <option value="tv">TV</option>
        <option value="shelf">{t("可動棚")}</option>
        <option value="counter">{t("カウンター")}</option>
        <option value="rug">{t("ラグ")}</option>
        <option value="stair">{t("階段")}</option>
      </select>
    </label>
    <div className="field-row">
      <NumberField label={t("幅")} unit="mm" value={mToMm(item.size.x)} min={10} onChange={(value) => updateFurniture(item.id, { size: { ...item.size, x: mmToM(value) } })} />
      <NumberField label={t("高さ")} unit="mm" value={mToMm(item.size.y)} min={10} onChange={(value) => updateFurniture(item.id, { size: { ...item.size, y: mmToM(value) } })} />
      <NumberField label={t("奥行")} unit="mm" value={mToMm(item.size.z)} min={10} onChange={(value) => updateFurniture(item.id, { size: { ...item.size, z: mmToM(value) } })} />
    </div>
    <NumberField label={t("回転")} unit="deg" value={item.rotationYDeg} onChange={(rotationYDeg) => updateFurniture(item.id, { rotationYDeg })} />
    <label className="scene-control">
      <input
        type="checkbox"
        checked={item.castsShadow}
        onChange={(event) => updateFurniture(item.id, { castsShadow: event.target.checked })}
      />
      {t("影を落とす")}
    </label>
    <AdvancedPositionDetails>
      <div className="field-row">
        <NumberField label="X" unit="mm" value={mToMm(item.position.x)} onChange={(value) => updateFurniture(item.id, { position: { ...item.position, x: mmToM(value) } })} />
        <NumberField label="Y" unit="mm" value={mToMm(item.position.y)} onChange={(value) => updateFurniture(item.id, { position: { ...item.position, y: mmToM(value) } })} />
        <NumberField label="Z" unit="mm" value={mToMm(item.position.z)} onChange={(value) => updateFurniture(item.id, { position: { ...item.position, z: mmToM(value) } })} />
      </div>
    </AdvancedPositionDetails>
  </div>;
};
