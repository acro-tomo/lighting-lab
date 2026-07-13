import { useState } from "react";
import { AddObjectMenu } from "./editToolbar/AddObjectMenu";
import type { EditMode } from "./editToolbar/types";

export type { EditMode } from "./editToolbar/types";

type EditToolbarProps = {
  mode: EditMode;
  onModeChange: (mode: EditMode) => void;
  isPlanEditMode: boolean;
  onPlanEditModeChange: (enabled: boolean) => void;
  onAdd: (kind: string) => void;
  pendingAdd: string | null;
};

export const EditToolbar = ({
  mode,
  onModeChange,
  isPlanEditMode,
  onPlanEditModeChange,
  onAdd,
  pendingAdd
}: EditToolbarProps) => {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="edit-toolbar">
      <button
        type="button"
        className={isPlanEditMode ? "tool plan-mode-button is-active" : "tool plan-mode-button"}
        onClick={() => onPlanEditModeChange(!isPlanEditMode)}
      >
        間取り編集
      </button>

      {isPlanEditMode && (
        <button
          type="button"
          className={mode === "wall" ? "tool wall-draw-button is-active" : "tool wall-draw-button"}
          onClick={() => onModeChange(mode === "wall" ? "select" : "wall")}
        >
          壁を引く
        </button>
      )}

      <button
        type="button"
        className={pendingAdd ? "add-button is-active" : "add-button"}
        onClick={() => setMenuOpen(true)}
      >
        ＋追加
      </button>

      {menuOpen && <AddObjectMenu onClose={() => setMenuOpen(false)} onAdd={onAdd} />}
    </div>
  );
};
