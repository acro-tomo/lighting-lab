// 日本の住宅照明で一般的な色温度プリセット。ワンタップで切替できるようにする。
export const colorTempPresets: { label: string; kelvin: number }[] = [
  { label: "電球色", kelvin: 2700 },
  { label: "温白色", kelvin: 3500 },
  { label: "昼白色", kelvin: 5000 },
  { label: "昼光色", kelvin: 6500 }
];

export const ColorTempPresets = ({
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
