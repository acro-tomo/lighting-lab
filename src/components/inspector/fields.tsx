import type { ChangeEvent, ReactNode } from "react";
import { useI18n } from "../../i18n";

export const NumberField = ({
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

export const TextField = ({
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

export const AdvancedPositionDetails = ({ children }: { children: ReactNode }) => {
  const { t } = useI18n();
  return <details className="advanced-position-details">
    <summary>{t("詳細 +")}</summary>
    <div className="advanced-position-fields">{children}</div>
  </details>;
};
