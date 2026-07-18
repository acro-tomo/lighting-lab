import type { CSSProperties } from "react";
import { useLuxLabStore } from "../../utils/luxLab";
import { useI18n } from "../../i18n";

// 照度ヒートマップ（?lux=1 隠し機能）の HUD パネル。3Dビューポート
// （.scene-stage, position:relative）内に絶対配置する DOM overlay。
// 既存UIへの影響ゼロを最優先し、スタイルは styles.css に足さず全てインラインで持つ。

// photometric/src/photometry/grid.ts の lxToColor と同じストップ列（凡例用）。
const LEGEND_GRADIENT =
  "linear-gradient(to right, rgb(10,18,68) 0%, rgb(28,92,168) 20%, rgb(24,160,152) 40%, rgb(96,196,72) 60%, rgb(232,208,48) 80%, rgb(224,60,40) 100%)";

const panelStyle: CSSProperties = {
  position: "absolute",
  left: 12,
  bottom: 12,
  zIndex: 20,
  width: 240,
  padding: "10px 12px",
  borderRadius: 8,
  background: "rgba(16, 15, 13, 0.88)",
  border: "1px solid rgba(255, 255, 255, 0.14)",
  color: "#e8e2d6",
  font: "12px/1.5 system-ui, sans-serif",
  pointerEvents: "auto"
};

const rowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
  marginTop: 6
};

const scaleButtonStyle = (active: boolean): CSSProperties => ({
  flex: 1,
  padding: "2px 0",
  borderRadius: 4,
  border: active ? "1px solid #f5c64d" : "1px solid rgba(255,255,255,0.2)",
  background: active ? "rgba(245, 198, 77, 0.18)" : "transparent",
  color: active ? "#f5c64d" : "#c9c2b4",
  cursor: "pointer",
  font: "inherit"
});

const formatLx = (value: number): string =>
  value >= 100 ? Math.round(value).toString() : value.toFixed(1);

export const LuxPanel = () => {
  const { t } = useI18n();
  const visible = useLuxLabStore((state) => state.visible);
  const heightM = useLuxLabStore((state) => state.heightM);
  const scaleMax = useLuxLabStore((state) => state.scaleMax);
  const stats = useLuxLabStore((state) => state.stats);
  const probe = useLuxLabStore((state) => state.probe);
  const calculation = useLuxLabStore((state) => state.calculation);
  const setVisible = useLuxLabStore((state) => state.setVisible);
  const setHeightM = useLuxLabStore((state) => state.setHeightM);
  const setScaleMax = useLuxLabStore((state) => state.setScaleMax);

  return (
    <div style={panelStyle}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <strong style={{ fontSize: 12 }}>{t("明るさの目安")}</strong>
        <label style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={visible}
            onChange={(event) => setVisible(event.target.checked)}
          />
          {t("色で表示")}
        </label>
      </div>

      <div style={rowStyle}>
        <span>{t("確認する高さ")}</span>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <input
            type="number"
            min={0}
            max={2.5}
            step={0.05}
            value={heightM}
            onChange={(event) => {
              const next = Number(event.target.value);
              if (Number.isFinite(next)) setHeightM(next);
            }}
            style={{ width: 64, font: "inherit" }}
          />
          m
        </span>
      </div>

      <div style={rowStyle}>
        <span>{t("表示範囲")}</span>
        <span style={{ display: "flex", gap: 4, flex: 1, maxWidth: 130 }}>
          <button type="button" style={scaleButtonStyle(scaleMax === 300)} onClick={() => setScaleMax(300)}>
            0-300
          </button>
          <button type="button" style={scaleButtonStyle(scaleMax === 500)} onClick={() => setScaleMax(500)}>
            0-500
          </button>
        </span>
      </div>

      <div style={{ marginTop: 8 }}>
        <div style={{ height: 10, borderRadius: 3, background: LEGEND_GRADIENT }} />
        <div style={{ display: "flex", justifyContent: "space-between", color: "#a89f8d", fontSize: 10 }}>
          <span>0</span>
          <span>{Math.round(scaleMax * 0.25)}</span>
          <span>{Math.round(scaleMax * 0.5)}</span>
          <span>{Math.round(scaleMax * 0.75)}</span>
          <span>{scaleMax} lx</span>
        </div>
      </div>

      <div style={rowStyle}>
        <span>{t("表示の準備")}</span>
        <span>
          {calculation.status === "computing"
            ? t("計算中 {percent}%", { percent: Math.round(calculation.progress * 100) })
            : calculation.status === "ready"
              ? t("計算完了")
              : t("停止中")}
        </span>
      </div>

      <div style={rowStyle}>
        <span>{t("部屋の平均 / 最大")}</span>
        <span>{stats ? `${formatLx(stats.mean.total)} / ${formatLx(stats.max.total)} lx` : "—"}</span>
      </div>

      <div style={rowStyle}>
        <span>{t("選んだ場所")}</span>
        <span>{probe ? `${formatLx(probe.value.total)} lx` : t("床をクリック")}</span>
      </div>

      <p style={{ margin: "8px 0 0", color: "#a89f8d", fontSize: 10, lineHeight: 1.5 }}>
        {t("明るさを比べるための参考値です。実際の照度を保証するものではありません。")}
      </p>
    </div>
  );
};
