import { useState } from "react";

const STORAGE_KEY = "ldk-intro-seen";

type IntroGuideProps = {
  // ヘッダーの「?」ボタンから強制表示するためのフラグ。
  forceOpen?: boolean;
  onClose?: () => void;
};

export const IntroGuide = ({ forceOpen, onClose }: IntroGuideProps) => {
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
    <div className="intro-overlay" role="dialog" aria-modal="true" aria-label="LDK Lighting Lab の使い方">
      <div className="intro-card">
        <h2 className="intro-title">自分の間取りで夜の照明を試す</h2>
        <ul className="intro-features">
          <li>自分の間取り図を取り込み、照明の位置・明るさ・色温度を変えて「夜の見え方」を比較できます。</li>
          <li>ダウンライト・ペンダント・壁付スポットなど複数種の照明を自由に配置できます。</li>
          <li>Path Tracing による間接光レンダリングで雰囲気を視覚確認できます。</li>
        </ul>
        <p className="intro-disclaimer">
          雰囲気比較用シミュレーションです。実照度（lux）の保証はしません。
        </p>
        <div className="intro-keys">
          <p className="intro-keys-heading">基本操作</p>
          <ul className="intro-key-list">
            <li><span className="intro-key">2D / 3D / 設定</span> スマホでは下タブで切替</li>
            <li><span className="intro-key">タップ</span> 選択・配置・壁の頂点追加</li>
            <li><span className="intro-key">ピンチ</span> 平面図をズーム</li>
            <li><span className="intro-key">ドラッグ</span> 3D視点を回転</li>
            <li><span className="intro-key">Shift + ↑↓←→</span> 見回す</li>
            <li><span className="intro-key">Option + ↑↓</span> 視点を上下</li>
          </ul>
        </div>
        <button className="intro-start" onClick={handleStart}>
          はじめる
        </button>
      </div>
    </div>
  );
};
