import { useState } from "react";
import { useI18n } from "../i18n";

const STORAGE_KEY = "ldk-intro-seen";

type IntroGuideProps = {
  // ヘッダーの「?」ボタンから強制表示するためのフラグ。
  forceOpen?: boolean;
  onClose?: () => void;
};

export const IntroGuide = ({ forceOpen, onClose }: IntroGuideProps) => {
  const { t } = useI18n();
  const [dismissed, setDismissed] = useState(() => {
    return localStorage.getItem(STORAGE_KEY) === "1";
  });

  const visible = forceOpen || !dismissed;
  if (!visible) return null;

  const handleStart = () => {
    localStorage.setItem(STORAGE_KEY, "1");
    setDismissed(true);
    onClose?.();
  };

  return (
    <div className="intro-overlay" role="dialog" aria-modal="true" aria-label={`LDK Lighting Lab: ${t("使い方を見る")}`}>
      <div className="intro-card">
        <h2 className="intro-title">{t("自分の間取りで夜の照明を試す")}</h2>
        <ul className="intro-features">
          <li>{t("自分の間取り図を取り込み、照明の位置・明るさ・色温度を変えて「夜の見え方」を比較できます。")}</li>
          <li>{t("ダウンライト・ペンダント・壁付スポットなど複数種の照明を自由に配置できます。")}</li>
          <li>{t("壁や床からの光の反射も含めた仕上がりを確認できます。")}</li>
        </ul>
        <p className="intro-disclaimer">
          {t("雰囲気比較用シミュレーションです。実照度（lux）の保証はしません。")}
        </p>
        <div className="intro-keys">
          <p className="intro-keys-heading">{t("基本操作")}</p>
          <ul className="intro-key-list">
            <li><span className="intro-key">☰</span> {t("スマホでは読み込み・保存・出力を開く")}</li>
            <li><span className="intro-key">2D / 3D</span> {t("スマホでは下タブで切替、設定は歯車")}</li>
            <li><span className="intro-key">{t("タップ")}</span> {t("選択・配置")}</li>
            <li><span className="intro-key">{t("間取り編集")}</span> {t("壁の選択・移動・削除、壁引き")}</li>
            <li><span className="intro-key">{t("ピンチ")}</span> {t("平面図をズーム")}</li>
            <li><span className="intro-key">{t("ドラッグ / 二本指")}</span> {t("3D視点の回転・パン")}</li>
            <li><span className="intro-key">↑↓←→</span> {t("注視点だけを動かして見回す（カメラ固定）")}</li>
            <li><span className="intro-key">Shift + ↑↓ / ←→</span> {t("視点を前後 / 左右に移動")}</li>
            <li><span className="intro-key">Option + ↑↓</span> {t("視点を上下に移動")}</li>
            <li><span className="intro-key">Option + ←→</span> {t("カメラが注視点の周りを回る")}</li>
          </ul>
        </div>
        <button className="intro-start" onClick={handleStart}>
          {t("はじめる")}
        </button>
      </div>
    </div>
  );
};
