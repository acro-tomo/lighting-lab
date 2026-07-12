import type { VoidArea, VoidSide } from "../../types";
import { mToMm, mmToM } from "../../utils/units";
import { NumberField, TextField } from "./fields";

const voidSideLabels: { side: VoidSide; label: string }[] = [
  { side: "north", label: "北" },
  { side: "south", label: "南" },
  { side: "west", label: "西" },
  { side: "east", label: "東" }
];

export const VoidInspector = ({
  voidArea,
  updateVoid
}: {
  voidArea: VoidArea;
  updateVoid: (id: string, patch: Partial<VoidArea>) => void;
}) => {
  const openSides = voidArea.openSides ?? [];
  const toggleSide = (side: VoidSide) => {
    const next = openSides.includes(side)
      ? openSides.filter((item) => item !== side)
      : [...openSides, side];
    updateVoid(voidArea.id, { openSides: next.length > 0 ? next : undefined });
  };
  return (
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
      <label className="field">
        <span>内周壁</span>
        <div className="chip-row">
          {voidSideLabels.map(({ side, label }) => {
            const hasWall = !openSides.includes(side);
            return (
              <button
                key={side}
                type="button"
                className={hasWall ? "chip is-active" : "chip"}
                onClick={() => toggleSide(side)}
              >
                {label}
                <span>{hasWall ? "壁あり" : "開放"}</span>
              </button>
            );
          })}
        </div>
        <p className="field-hint">2階廊下などで壁が無い辺は「開放」にします。壁付け照明は壁ありの辺にだけ付きます。</p>
      </label>
    </div>
  );
};
