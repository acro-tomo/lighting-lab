import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ADD_GROUPS } from "./addGroups";
import { GroupIcon, ItemIcon } from "./icons";
import { useI18n } from "../../i18n";

type AddObjectMenuProps = {
  onClose: () => void;
  onAdd: (kind: string) => void;
};

// 追加ポップアップ本体。EditToolbar 側は開閉のみ管理し、
// グループ内ナビゲーション（第1画面/第2画面）はここで完結させる。
export const AddObjectMenu = ({ onClose, onAdd }: AddObjectMenuProps) => {
  const { t } = useI18n();
  // null = 第1画面（グループ選択）、string = 第2画面（グループ内アイテム）
  const [activeGroup, setActiveGroup] = useState<string | null>(null);

  // Esc で閉じる。第2画面なら第1画面へ戻る。
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (activeGroup !== null) {
          setActiveGroup(null);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeGroup, onClose]);

  const currentGroup = ADD_GROUPS.find((g) => g.title === activeGroup) ?? null;
  const modal = (
    <div className="add-modal-backdrop" onPointerDown={onClose}>
      <div className="add-modal" role="dialog" aria-modal onPointerDown={(event) => event.stopPropagation()}>

        {/* 第1画面: グループ選択 */}
        {currentGroup === null && (
          <>
            <p className="add-modal-title">{t("追加するもの")}</p>
            <div className="add-group-list">
              {ADD_GROUPS.map((group) => (
                <button
                  key={group.title}
                  type="button"
                  className="add-group-item"
                  onClick={() => setActiveGroup(group.title)}
                >
                  <GroupIcon title={t(group.title)} />
                  <span>{t(group.title)}</span>
                  <span className="add-group-arrow">›</span>
                </button>
              ))}
            </div>
          </>
        )}

        {/* 第2画面: グループ内アイテム */}
        {currentGroup !== null && (
          <>
            <div className="add-modal-nav">
              <button type="button" className="add-modal-back" onClick={() => setActiveGroup(null)}>
                {t("← 戻る")}
              </button>
              <p className="add-modal-title">{t(currentGroup.title)}</p>
            </div>
            <div className="add-modal-scroll">
              <div className="add-modal-grid">
                {currentGroup.items.map((item) => (
                  <button
                    key={item.kind}
                    type="button"
                    role="menuitem"
                    className="add-item-button"
                    onClick={() => {
                      onAdd(item.kind);
                      onClose();
                    }}
                  >
                    <ItemIcon kind={item.kind} />
                    <span className="add-item-label">{t(item.label)}</span>
                    {item.hint && <em className="add-item-hint">{t(item.hint)}</em>}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

      </div>
    </div>
  );

  return createPortal(modal, document.body);
};
