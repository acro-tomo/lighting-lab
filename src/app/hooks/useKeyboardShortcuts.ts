import { useEffect } from "react";
import { useProjectStore } from "../../store/projectStore";
import type { Selection } from "../../types";
import { useI18n } from "../../i18n";

// Cmd/Ctrl+Z(Shift)/C/V、Esc、Delete/Backspaceの全体キーボードショートカット。
export const useKeyboardShortcuts = ({
  undo,
  redo,
  copySelection,
  pasteSelection,
  select,
  deleteSelection,
  pendingAdd,
  setPendingAdd,
  setNotice,
  planEditMode
}: {
  undo: () => void;
  redo: () => void;
  copySelection: () => void;
  pasteSelection: () => void;
  select: (next: Selection) => void;
  deleteSelection: (selection: NonNullable<Selection>) => void;
  pendingAdd: string | null;
  setPendingAdd: (next: string | null) => void;
  setNotice: (notice: string) => void;
  planEditMode: boolean;
}) => {
  const { t } = useI18n();
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z" && event.shiftKey) {
        event.preventDefault();
        redo();
      } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        undo();
      } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "c") {
        const target = event.target as HTMLElement | null;
        const tag = target?.tagName;
        // 入力欄の編集中はブラウザのテキストコピーに任せる。
        if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) return;
        event.preventDefault();
        copySelection();
      } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "v") {
        const target = event.target as HTMLElement | null;
        const tag = target?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) return;
        event.preventDefault();
        pasteSelection();
      } else if (event.key === "Escape") {
        // 配置待ち中は Esc で配置モードを終了し、選択もクリアする。
        if (pendingAdd) {
          setPendingAdd(null);
          setNotice(t("配置を終了しました。"));
        }
        select(null);
      } else if (event.key === "Delete" || event.key === "Backspace") {
        const target = event.target as HTMLElement | null;
        const tag = target?.tagName;
        // 入力欄の編集中は削除キーを通常動作に任せる。
        if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) return;
        const current = useProjectStore.getState().selection;
        if (current && (current.kind !== "wall" || planEditMode)) {
          event.preventDefault();
          deleteSelection(current);
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [copySelection, deleteSelection, pasteSelection, pendingAdd, planEditMode, redo, select, setNotice, setPendingAdd, t, undo]);
};
