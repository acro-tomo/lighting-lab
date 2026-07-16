import { useRef } from "react";
import type { LightFixture } from "../../types";
import { useI18n } from "../../i18n";

const aimHeightPresets: { label: string; heightM: number }[] = [
  { label: "床", heightM: 0 },
  { label: "机高", heightM: 0.72 },
  { label: "腰壁", heightM: 1.1 }
];

// 方位角ダイヤル。器具位置を上から見た水平向きをドラッグで変更する。
const AimAzimuthDial = ({
  light,
  aim,
  onChange
}: {
  light: LightFixture;
  aim: LightFixture["target"];
  onChange: (target: NonNullable<LightFixture["target"]>) => void;
}) => {
  const { t } = useI18n();
  const currentAim = aim ?? { x: light.position.x, y: 0, z: light.position.z };
  const dx = currentAim.x - light.position.x;
  const dz = currentAim.z - light.position.z;
  const r = Math.hypot(dx, dz);
  // r がほぼ0のとき（真下向き）は水平距離 1m を仮定して方位だけ変えられるようにする。
  const effectiveR = r < 0.02 ? 1.0 : r;
  const azRad = r < 0.02 ? 0 : Math.atan2(dz, dx);

  const SIZE = 80;
  const CX = SIZE / 2;
  const CY = SIZE / 2;
  const RING_R = 30;

  const needleX = CX + RING_R * Math.cos(azRad);
  const needleY = CY + RING_R * Math.sin(azRad);

  const svgRef = useRef<SVGSVGElement>(null);
  // ドラッグ中かどうかは ref で管理して余計な再レンダーを避ける。
  const draggingRef = useRef(false);

  const getAngle = (clientX: number, clientY: number): number => {
    const svg = svgRef.current;
    if (!svg) return azRad;
    const rect = svg.getBoundingClientRect();
    return Math.atan2(clientY - rect.top - rect.height / 2, clientX - rect.left - rect.width / 2);
  };

  const applyAngle = (az: number) => {
    onChange({
      ...currentAim,
      x: light.position.x + effectiveR * Math.cos(az),
      z: light.position.z + effectiveR * Math.sin(az)
    });
  };

  const cardinalAngles = [0, Math.PI / 2, Math.PI, -Math.PI / 2];

  return (
    <div className="aim-dial-wrap">
      <svg
        ref={svgRef}
        width={SIZE}
        height={SIZE}
        className="aim-dial"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          draggingRef.current = true;
          applyAngle(getAngle(e.clientX, e.clientY));
        }}
        onPointerMove={(e) => {
          if (!draggingRef.current) return;
          applyAngle(getAngle(e.clientX, e.clientY));
        }}
        onPointerUp={(e) => {
          e.currentTarget.releasePointerCapture(e.pointerId);
          draggingRef.current = false;
        }}
      >
        <circle cx={CX} cy={CY} r={RING_R} className="aim-dial-ring" />
        {cardinalAngles.map((t) => (
          <line
            key={t}
            x1={CX + (RING_R - 6) * Math.cos(t)}
            y1={CY + (RING_R - 6) * Math.sin(t)}
            x2={CX + RING_R * Math.cos(t)}
            y2={CY + RING_R * Math.sin(t)}
            className="aim-dial-tick"
          />
        ))}
        <line x1={CX} y1={CY} x2={needleX} y2={needleY} className="aim-dial-needle" />
        <circle cx={CX} cy={CY} r={3} className="aim-dial-center" />
        <circle cx={needleX} cy={needleY} r={4.5} className="aim-dial-tip" />
      </svg>
      <label className="aim-dial-deg field">
        <span>{t("方位角")}</span>
        <div className="number-input">
          <input
            type="number"
            value={Math.round(azRad * (180 / Math.PI))}
            min={-180}
            max={180}
            step={5}
            onChange={(e) => applyAngle(Number(e.target.value) * (Math.PI / 180))}
          />
          <em>°</em>
        </div>
      </label>
    </div>
  );
};

export const AimTargetPresets = ({
  light,
  aim,
  onChange
}: {
  light: LightFixture;
  aim: LightFixture["target"];
  onChange: (target: NonNullable<LightFixture["target"]>) => void;
}) => {
  const { t } = useI18n();
  const currentAim = aim ?? { x: light.position.x, y: 0, z: light.position.z };
  const isStraightDown =
    Math.abs(currentAim.x - light.position.x) < 0.02 &&
    Math.abs(currentAim.z - light.position.z) < 0.02 &&
    Math.abs(currentAim.y) < 0.02;
  const isUpward = currentAim.y > light.position.y + 0.08;

  return (
    <div className="aim-control">
      <div className="chip-row aim-chip-row">
        <button
          type="button"
          className={isStraightDown ? "chip is-active" : "chip"}
          onClick={() => onChange({ x: light.position.x, y: 0, z: light.position.z })}
        >
          {t("真下")}
          <span>{t("直下")}</span>
        </button>
        {aimHeightPresets.map((preset) => (
          <button
            key={preset.label}
            type="button"
            className={Math.abs(currentAim.y - preset.heightM) < 0.03 && !isStraightDown ? "chip is-active" : "chip"}
            onClick={() => onChange({ ...currentAim, y: preset.heightM })}
          >
            {t(preset.label)}
            <span>{Math.round(preset.heightM * 1000)}mm</span>
          </button>
        ))}
        <button
          type="button"
          className={isUpward ? "chip is-active" : "chip"}
          onClick={() => onChange({ ...currentAim, y: light.position.y + 0.8 })}
        >
          {t("上向き")}
          <span>+800mm</span>
        </button>
      </div>
      <AimAzimuthDial light={light} aim={aim} onChange={onChange} />
      <p className="field-hint">{t("黄色の照射ポイントを3Dビュー上でも調整できます")}</p>
    </div>
  );
};
