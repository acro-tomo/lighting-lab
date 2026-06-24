import { useEffect, useState } from "react";

// 操作モードはコンボボックスのまま（要望: 操作はコンボボックス）。
// 追加は「＋追加」ボタン→ポップアップで種別選択（要望: 追加はポップアップ）。
export type EditMode = "select" | "move" | "wall";

// 追加できるオブジェクト種別。kind は App.handleAddObject と一致させる。
const ADD_ITEMS: { kind: string; label: string; hint?: string }[] = [
  { kind: "downlight", label: "ダウンライト" },
  { kind: "wallspot", label: "壁付スポット" },
  { kind: "window", label: "窓", hint: "壁をクリックして設置" },
  { kind: "door", label: "扉", hint: "壁をクリックして設置" },
  { kind: "furniture", label: "家具" },
  { kind: "stair", label: "階段" },
  { kind: "void", label: "吹き抜け" }
];

type EditToolbarProps = {
  mode: EditMode;
  onModeChange: (mode: EditMode) => void;
  onAdd: (kind: string) => void;
  pendingAdd: string | null;
};

export const EditToolbar = ({ mode, onModeChange, onAdd, pendingAdd }: EditToolbarProps) => {
  const [menuOpen, setMenuOpen] = useState(false);

  // モーダル表示中は Esc で閉じる。
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  return (
    <div className="edit-toolbar">
      <label className="edit-toolbar-mode">
        操作
        <select value={mode} onChange={(event) => onModeChange(event.target.value as EditMode)}>
          <option value="select">選択</option>
          <option value="move">移動（ドラッグで動かす）</option>
          <option value="wall">壁を引く（クリックで連続）</option>
        </select>
      </label>

      <button
        type="button"
        className={pendingAdd ? "add-button is-active" : "add-button"}
        onClick={() => setMenuOpen(true)}
      >
        ＋追加
      </button>

      {menuOpen && (
        <div className="add-modal-backdrop" onPointerDown={() => setMenuOpen(false)}>
          <div className="add-modal" role="menu" onPointerDown={(event) => event.stopPropagation()}>
            <p className="add-modal-title">追加するもの</p>
            <div className="add-modal-grid">
              {ADD_ITEMS.map((item) => (
                <button
                  key={item.kind}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onAdd(item.kind);
                    setMenuOpen(false);
                  }}
                >
                  <span>{item.label}</span>
                  {item.hint && <em>{item.hint}</em>}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
