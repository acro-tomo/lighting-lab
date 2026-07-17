import type { MaterialPreset, Project, WallSegment } from "../../types";
import { mToMm, mmToM } from "../../utils/units";
import { NumberField, TextField } from "./fields";
import { useI18n } from "../../i18n";

const readImageAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

export const WallInspector = ({
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
  const { t } = useI18n();
  const material = project.materials.find((item) => item.id === wall.materialId);
  const tile = material?.textureSizeM ?? { w: 0.92, h: 0.92 };
  return (
  <div className="form-grid">
    <TextField label={t("名前")} value={wall.name} onChange={(name) => updateWall(wall.id, { name })} />
    <div className="field-row">
      <NumberField label={t("始点X")} unit="mm" value={mToMm(wall.start.x)} onChange={(value) => updateWall(wall.id, { start: { ...wall.start, x: mmToM(value) } })} />
      <NumberField label={t("始点Z")} unit="mm" value={mToMm(wall.start.z)} onChange={(value) => updateWall(wall.id, { start: { ...wall.start, z: mmToM(value) } })} />
    </div>
    <div className="field-row">
      <NumberField label={t("終点X")} unit="mm" value={mToMm(wall.end.x)} onChange={(value) => updateWall(wall.id, { end: { ...wall.end, x: mmToM(value) } })} />
      <NumberField label={t("終点Z")} unit="mm" value={mToMm(wall.end.z)} onChange={(value) => updateWall(wall.id, { end: { ...wall.end, z: mmToM(value) } })} />
    </div>
    <div className="field-row">
      <NumberField label={t("厚み")} unit="mm" value={mToMm(wall.thicknessM)} min={20} onChange={(value) => updateWall(wall.id, { thicknessM: mmToM(value) })} />
      <NumberField label={t("高さ")} unit="mm" value={mToMm(wall.heightM)} min={100} onChange={(value) => updateWall(wall.id, { heightM: mmToM(value) })} />
    </div>
    <label className="field">
      <span>{t("種別")}</span>
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
        <option value="wall">{t("通常壁")}</option>
        <option value="half">{t("腰壁")}</option>
        <option value="railing">{t("手すり")}</option>
      </select>
      <p className="field-hint">{t("腰壁/手すりは吹き抜けまわりの表現に使えます。高さは上の欄で微調整可。")}</p>
    </label>
    <label className="field">
      <span>{t("内側方向")}</span>
      <select
        value={wall.innerSide ?? "center"}
        onChange={(event) => {
          const v = event.target.value;
          updateWall(wall.id, { innerSide: v === "center" ? undefined : (v as "left" | "right") });
        }}
      >
        <option value="center">{t("中央（既定）")}</option>
        <option value="left">{t("左（start→end向きで左）")}</option>
        <option value="right">{t("右（start→end向きで右）")}</option>
      </select>
      <p className="field-hint">{t("start→endへ向かって室内側がどちらか。背景間取り図の内壁線にトレース線を合わせるとき使う")}</p>
    </label>
    <label className="field">
      <span>{t("素材")}</span>
      <select
        value={wall.materialId}
        onChange={(event) => updateWall(wall.id, { materialId: event.target.value })}
      >
        {project.materials.map((item) => (
          <option key={item.id} value={item.id}>
            {t(item.name)}
          </option>
        ))}
      </select>
    </label>

    {material && (
      <section className="wallpaper-block">
        <p className="field-hint">{t("壁紙はこの素材「{name}」を使う全ての壁に反映されます。", { name: t(material.name) })}</p>
        <label className="field">
          <span>{t("壁紙画像")}</span>
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
              <img src={material.textureDataUrl} alt={t("壁紙プレビュー")} />
            </div>
            <div className="field-row">
              <NumberField label={t("柄の幅")} unit="mm" value={mToMm(tile.w)} min={50} onChange={(value) => updateMaterial(material.id, { textureSizeM: { w: mmToM(value), h: tile.h } })} />
              <NumberField label={t("柄の高さ")} unit="mm" value={mToMm(tile.h)} min={50} onChange={(value) => updateMaterial(material.id, { textureSizeM: { w: tile.w, h: mmToM(value) } })} />
            </div>
            <button className="ghost-button" onClick={() => updateMaterial(material.id, { textureDataUrl: undefined })}>
              {t("壁紙を外す")}
            </button>
          </>
        )}
      </section>
    )}
  </div>
  );
};
