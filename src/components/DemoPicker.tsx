import { useEffect } from "react";
import { demoAssetUrl, demoRooms, type DemoRoom } from "../data/demoRooms";
import { useI18n } from "../i18n";

type DemoPickerProps = {
  open: boolean;
  onSelect: (room: DemoRoom) => void;
  onClose: () => void;
};

/** ?demo（値なし）で開く部屋の選択画面。サムネイルは public/demo/rooms/thumbs/。 */
export const DemoPicker = ({ open, onSelect, onClose }: DemoPickerProps) => {
  const { t } = useI18n();

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="demo-picker-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={t("部屋を選ぶ")}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="demo-picker-card">
        <div className="demo-picker-head">
          <div>
            <h2 className="demo-picker-title">{t("部屋を選ぶ")}</h2>
            <p className="demo-picker-lead">
              {t("夜の照明を作り込んだサンプルです。選ぶとそのまま編集できます。")}
            </p>
          </div>
          <button type="button" className="demo-picker-close" onClick={onClose} aria-label={t("閉じる")}>
            ×
          </button>
        </div>

        <ul className="demo-picker-grid">
          {demoRooms.map((room) => (
            <li key={room.key}>
              <button type="button" className="demo-picker-item" onClick={() => onSelect(room)}>
                <img
                  className="demo-picker-thumb"
                  src={demoAssetUrl(room.thumb)}
                  alt=""
                  loading="lazy"
                  width={480}
                  height={360}
                />
                <span className="demo-picker-label">{t(room.label)}</span>
                <span className="demo-picker-summary">{t(room.summary)}</span>
              </button>
            </li>
          ))}
        </ul>

        <p className="demo-picker-note">
          {t("雰囲気比較用シミュレーションです。実照度（lux）の保証はしません。")}
        </p>
      </div>
    </div>
  );
};
