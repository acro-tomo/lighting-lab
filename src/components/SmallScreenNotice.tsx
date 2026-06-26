import { useEffect, useState } from "react";

// 横幅がこの値を下回ったとき案内を出す。
const NARROW_THRESHOLD = 900;

export const SmallScreenNotice = () => {
  const [isNarrow, setIsNarrow] = useState(() => window.innerWidth < NARROW_THRESHOLD);
  // 一度「このまま続ける」を押したら resize で復活させない。
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${NARROW_THRESHOLD - 1}px)`);
    const onChange = (e: MediaQueryListEvent) => {
      if (!dismissed) setIsNarrow(e.matches);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [dismissed]);

  if (!isNarrow || dismissed) return null;

  return (
    <div className="small-screen-overlay" role="dialog" aria-modal="true" aria-label="画面サイズのご案内">
      <div className="small-screen-card">
        <h2 className="small-screen-title">横長の画面が必要です</h2>
        <p className="small-screen-body">
          このツールはPC・タブレットの横長画面に最適化されています。
          スマホでもご覧いただけますが、操作はPC / タブレットがおすすめです。
        </p>
        <button
          className="small-screen-continue"
          onClick={() => {
            setDismissed(true);
            setIsNarrow(false);
          }}
        >
          このまま続ける
        </button>
      </div>
    </div>
  );
};
