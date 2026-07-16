import { useEffect, useState } from "react";
import { useI18n } from "../i18n";

type Modifier = "none" | "shift" | "alt" | "meta";

const isInputFocused = (): boolean => {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable;
};

// キーキャップ風の小ラベル
const Key = ({ children }: { children: React.ReactNode }) => (
  <span className="sg-key">{children}</span>
);

// キー + ラベルの1行
const Row = ({ keys, label }: { keys: React.ReactNode[]; label: string }) => (
  <div className="sg-row">
    <span className="sg-keys">
      {keys.map((k, i) => (
        <span key={i} className="sg-key-wrap">
          {i > 0 && <span className="sg-plus">+</span>}
          {k}
        </span>
      ))}
    </span>
    <span className="sg-label">{label}</span>
  </div>
);

export const ShortcutGuide = () => {
  const { t } = useI18n();
  const [modifier, setModifier] = useState<Modifier>("none");
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isInputFocused()) return;
      if (e.shiftKey && !e.altKey && !e.metaKey && !e.ctrlKey) {
        setModifier("shift");
      } else if (e.altKey && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
        setModifier("alt");
      } else if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey) {
        setModifier("meta");
      }
    };
    const onKeyUp = () => {
      setModifier("none");
    };
    const onBlur = () => {
      setModifier("none");
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  return (
    <div className="shortcut-guide" aria-label={t("ショートカット案内")}>
      {/* ⌨ トグル — ここだけクリック可能 */}
      <button
        className={`sg-toggle${visible ? " is-open" : ""}`}
        onClick={() => setVisible((v) => !v)}
        title={visible ? t("ショートカット案内を隠す") : t("ショートカット案内を表示")}
        aria-pressed={visible}
      >
        ⌨
      </button>

      {visible && (
        <div className="sg-body">
          {/* 常時ベース */}
          <div className={`sg-section${modifier === "none" ? " is-active" : ""}`}>
            <Row keys={[<Key>←</Key>, <Key>→</Key>, <Key>↑</Key>, <Key>↓</Key>]} label={t("注視点だけを動かして見回す（カメラ固定）")} />
          </div>

          {/* Shift */}
          <div className={`sg-section${modifier === "shift" ? " is-active" : ""}`}>
            <div className="sg-section-label"><Key>⇧ Shift</Key></div>
            <Row keys={[<Key>⇧</Key>, <Key>↑</Key>]} label={t("視点を前に移動")} />
            <Row keys={[<Key>⇧</Key>, <Key>↓</Key>]} label={t("視点を後ろに移動")} />
            <Row keys={[<Key>⇧</Key>, <Key>←</Key>]} label={t("視点を左に移動")} />
            <Row keys={[<Key>⇧</Key>, <Key>→</Key>]} label={t("視点を右に移動")} />
            <Row keys={[<Key>⇧</Key>, <Key>クリック</Key>]} label={t("ライト複数選択")} />
          </div>

          {/* Option / Alt */}
          <div className={`sg-section${modifier === "alt" ? " is-active" : ""}`}>
            <div className="sg-section-label"><Key>⌥ Option</Key></div>
            <Row keys={[<Key>⌥</Key>, <Key>←</Key>]} label={t("カメラが注視点の周りを左に回る")} />
            <Row keys={[<Key>⌥</Key>, <Key>→</Key>]} label={t("カメラが注視点の周りを右に回る")} />
            <Row keys={[<Key>⌥</Key>, <Key>↑</Key>]} label={t("視点を上に移動")} />
            <Row keys={[<Key>⌥</Key>, <Key>↓</Key>]} label={t("視点を下に移動")} />
          </div>

          {/* ⌘ / Ctrl */}
          <div className={`sg-section${modifier === "meta" ? " is-active" : ""}`}>
            <div className="sg-section-label"><Key>⌘ / Ctrl</Key></div>
            <Row keys={[<Key>⌘</Key>, <Key>C</Key>]} label={t("コピー")} />
            <Row keys={[<Key>⌘</Key>, <Key>V</Key>]} label={t("貼り付け")} />
            <Row keys={[<Key>⌘</Key>, <Key>Z</Key>]} label={t("元に戻す")} />
            <Row keys={[<Key>⌘</Key>, <Key>⇧Z</Key>]} label={t("やり直し")} />
          </div>

          {/* 常時補助 */}
          <div className="sg-section sg-aux">
            <Row keys={[<Key>Esc</Key>]} label={t("配置終了 / 選択解除")} />
            <Row keys={[<Key>Del</Key>]} label={t("削除")} />
            <Row keys={[<Key>Enter</Key>]} label={t("壁モード：頂点を確定")} />
          </div>
        </div>
      )}
    </div>
  );
};
