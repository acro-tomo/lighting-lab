import type { CeilingZone, FloorZone } from "../../types";
import { mToMm, mmToM } from "../../utils/units";
import { NumberField, TextField } from "./fields";
import { useI18n } from "../../i18n";

export const CeilingZoneInspector = ({
  zone,
  updateCeilingZone
}: {
  zone: CeilingZone;
  updateCeilingZone: (id: string, patch: Partial<CeilingZone>) => void;
}) => {
  const { t } = useI18n();
  return <div className="form-grid">
    <TextField label={t("名前")} value={zone.name} onChange={(name) => updateCeilingZone(zone.id, { name })} />
    <div className="field-row">
      <NumberField label="X" unit="mm" value={mToMm(zone.center.x)} onChange={(value) => updateCeilingZone(zone.id, { center: { ...zone.center, x: mmToM(value) } })} />
      <NumberField label="Z" unit="mm" value={mToMm(zone.center.z)} onChange={(value) => updateCeilingZone(zone.id, { center: { ...zone.center, z: mmToM(value) } })} />
    </div>
    <div className="field-row">
      <NumberField label={t("幅")} unit="mm" value={mToMm(zone.size.x)} min={100} onChange={(value) => updateCeilingZone(zone.id, { size: { ...zone.size, x: mmToM(value) } })} />
      <NumberField label={t("奥行")} unit="mm" value={mToMm(zone.size.z)} min={100} onChange={(value) => updateCeilingZone(zone.id, { size: { ...zone.size, z: mmToM(value) } })} />
    </div>
    <NumberField label={t("下がり")} unit="mm" value={mToMm(zone.dropM)} min={20} max={1000} onChange={(value) => updateCeilingZone(zone.id, { dropM: mmToM(value) })} />
  </div>;
};

export const FloorZoneInspector = ({
  zone,
  updateFloorZone,
  floorLevelM,
  setFloorLevel
}: {
  zone: FloorZone;
  updateFloorZone: (id: string, patch: Partial<FloorZone>) => void;
  floorLevelM: number;
  setFloorLevel: (v: number) => void;
}) => {
  const { t } = useI18n();
  return <div className="form-grid">
    <TextField label={t("名前")} value={zone.name} onChange={(name) => updateFloorZone(zone.id, { name })} />
    <div className="field-row">
      <NumberField label="X" unit="mm" value={mToMm(zone.center.x)} onChange={(value) => updateFloorZone(zone.id, { center: { ...zone.center, x: mmToM(value) } })} />
      <NumberField label="Z" unit="mm" value={mToMm(zone.center.z)} onChange={(value) => updateFloorZone(zone.id, { center: { ...zone.center, z: mmToM(value) } })} />
    </div>
    <div className="field-row">
      <NumberField label={t("幅")} unit="mm" value={mToMm(zone.size.x)} min={100} onChange={(value) => updateFloorZone(zone.id, { size: { ...zone.size, x: mmToM(value) } })} />
      <NumberField label={t("奥行")} unit="mm" value={mToMm(zone.size.z)} min={100} onChange={(value) => updateFloorZone(zone.id, { size: { ...zone.size, z: mmToM(value) } })} />
    </div>
    <NumberField label={t("下げ量")} unit="mm" value={mToMm(zone.dropM)} min={20} max={500} onChange={(value) => updateFloorZone(zone.id, { dropM: mmToM(value) })} />
    <NumberField
      label={t("室内床レベル")}
      unit="mm"
      value={mToMm(floorLevelM)}
      min={0}
      onChange={(value) => setFloorLevel(mmToM(value))}
    />
    <p className="field-hint">{t("土間の下がり量をこの値に合わせると土間が地面(0)になる")}</p>
  </div>;
};
