import type { CSSProperties } from "react";
import { useLuxLabStore } from "../../utils/luxLab";

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
        <strong style={{ fontSize: 12 }}>照度ヒートマップ</strong>
        <label style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={visible}
            onChange={(event) => setVisible(event.target.checked)}
          />
          表示
        </label>
      </div>

      <div style={rowStyle}>
        <span>計算面高さ</span>
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
        <span>スケール</span>
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
        <span>間接光</span>
        <span>
          {calculation.status === "computing"
            ? `${calculation.label} ${Math.round(calculation.progress * 100)}%`
            : calculation.status === "ready"
              ? "計算完了"
              : "停止中"}
        </span>
      </div>

      <div style={rowStyle}>
        <span>平均 / 最大</span>
        <span>{stats ? `${formatLx(stats.mean.total)} / ${formatLx(stats.max.total)} lx` : "—"}</span>
      </div>

      {stats && (
        <div style={{ color: "#bcb3a3", fontSize: 11, textAlign: "right" }}>
          <div>直接 {formatLx(stats.mean.direct)} / {formatLx(stats.max.direct)} lx</div>
          <div>間接 {formatLx(stats.mean.indirect)} / {formatLx(stats.max.indirect)} lx</div>
        </div>
      )}

      <div style={rowStyle}>
        <span>クリック位置</span>
        <span>{probe ? `(${probe.x.toFixed(2)}, ${probe.z.toFixed(2)})` : "—"}</span>
      </div>

      {probe && (
        <div style={{ color: "#bcb3a3", fontSize: 11, textAlign: "right" }}>
          合計 {formatLx(probe.value.total)} = 直接 {formatLx(probe.value.direct)} + 間接{" "}
          {formatLx(probe.value.indirect)} lx
        </div>
      )}

      <p style={{ margin: "8px 0 0", color: "#a89f8d", fontSize: 10, lineHeight: 1.5 }}>
        実験的機能（参考値）: 配光はビーム角からの近似でIES配光ではありません。実照度(lux)を保証するものではありません。
      </p>
    </div>
  );
};
