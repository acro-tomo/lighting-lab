import type { Project, WindowOpening } from "../../types";
import { clamp, mToMm, mmToM } from "../../utils/units";
import { NumberField, TextField } from "./fields";

export const WindowInspector = ({
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
