import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { windowAddKind, windowPresetFromAddKind } from "../../data/windowCatalog";
import { useI18n } from "../../i18n";
import { ADD_GROUPS } from "./addGroups";
import { CategoryIcon, GroupIcon, ItemIcon } from "./icons";
import type { AddItem } from "./types";

type AddObjectMenuProps = {
  onClose: () => void;
  onAdd: (kind: string) => void;
};

type WindowSizeDraft = {
  item: AddItem;
  presetId: string;
  widthMm: string;
  heightMm: string;
};

export const AddObjectMenu = ({ onClose, onAdd }: AddObjectMenuProps) => {
  const { t } = useI18n();
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [windowSize, setWindowSize] = useState<WindowSizeDraft | null>(null);
  const currentGroup = ADD_GROUPS.find((group) => group.id === activeGroup) ?? null;
  const currentCategory = currentGroup?.categories?.find((category) => category.id === activeCategory) ?? null;

  const goBack = useCallback(() => {
    if (windowSize) {
      setWindowSize(null);
    } else if (activeCategory) {
      setActiveCategory(null);
    } else {
      setActiveGroup(null);
    }
  }, [activeCategory, windowSize]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (activeGroup === null) onClose();
      else goBack();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeGroup, goBack, onClose]);

  const chooseItem = (item: AddItem) => {
    const windowPreset = windowPresetFromAddKind(item.kind);
    if (windowPreset) {
      setWindowSize({
        item,
        presetId: windowPreset.id,
        widthMm: String(Math.round(windowPreset.widthM * 1000)),
        heightMm: String(Math.round(windowPreset.heightM * 1000))
      });
      return;
    }
    onAdd(item.kind);
    onClose();
  };

  const items = currentCategory?.items ?? currentGroup?.items ?? [];
  const title = windowSize?.item.label ?? currentCategory?.title ?? currentGroup?.title;
  const windowWidthMm = Number(windowSize?.widthMm);
  const windowHeightMm = Number(windowSize?.heightMm);
  const hasValidWindowSize = windowSize !== null && windowSize.widthMm.trim() !== "" && windowSize.heightMm.trim() !== "" &&
    Number.isFinite(windowWidthMm) && windowWidthMm >= 100 &&
    Number.isFinite(windowHeightMm) && windowHeightMm >= 100;

  const modal = (
    <div className="add-modal-backdrop" onPointerDown={onClose}>
      <div className="add-modal" role="dialog" aria-modal onPointerDown={(event) => event.stopPropagation()}>
        {currentGroup === null ? (
          <>
            <p className="add-modal-title">{t("追加するもの")}</p>
            <div className="add-group-list">
              {ADD_GROUPS.map((group) => (
                <button key={group.id} type="button" className="add-group-item" onClick={() => setActiveGroup(group.id)}>
                  <GroupIcon groupId={group.id} />
                  <span>{t(group.title)}</span>
                  <span className="add-group-arrow">›</span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="add-modal-nav">
              <button type="button" className="add-modal-back" onClick={goBack}>{t("← 戻る")}</button>
              <p className="add-modal-title">{title ? t(title) : ""}</p>
            </div>

            {windowSize ? (
              <div className="add-window-size">
                <ItemIcon kind={hasValidWindowSize ? windowAddKind(windowSize.presetId, windowWidthMm / 1000, windowHeightMm / 1000) : windowSize.item.kind} />
                <p>{t("配置する窓の大きさ")}</p>
                <div className="add-window-size-fields">
                  <label>
                    <span>{t("横幅")}</span>
                    <div><input type="number" min={100} step={10} value={windowSize.widthMm} onChange={(event) => setWindowSize({ ...windowSize, widthMm: event.target.value })} /><em>mm</em></div>
                  </label>
                  <label>
                    <span>{t("高さ")}</span>
                    <div><input type="number" min={100} step={10} value={windowSize.heightMm} onChange={(event) => setWindowSize({ ...windowSize, heightMm: event.target.value })} /><em>mm</em></div>
                  </label>
                </div>
                <button
                  type="button"
                  className="add-window-confirm"
                  disabled={!hasValidWindowSize}
                  onClick={() => {
                    onAdd(windowAddKind(windowSize.presetId, windowWidthMm / 1000, windowHeightMm / 1000));
                    onClose();
                  }}
                >
                  {t("この大きさで配置")}
                </button>
              </div>
            ) : currentGroup.categories && !currentCategory ? (
              <div className="add-category-list">
                {currentGroup.categories.map((category) => (
                  <button key={category.id} type="button" className="add-category-item" onClick={() => setActiveCategory(category.id)}>
                    <CategoryIcon categoryId={category.id} />
                    <span className="add-category-copy"><strong>{t(category.title)}</strong>{category.hint && <small>{t(category.hint)}</small>}</span>
                    <span className="add-group-arrow">›</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="add-modal-scroll">
                <div className="add-modal-grid">
                  {items.map((item) => (
                    <button key={item.kind} type="button" role="menuitem" className="add-item-button" onClick={() => chooseItem(item)}>
                      <ItemIcon kind={item.kind} />
                      <span className="add-item-label">{t(item.label)}</span>
                      {item.hint && <em className="add-item-hint">{t(item.hint)}</em>}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );

  return createPortal(modal, document.body);
};
