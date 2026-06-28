import { useEffect, useState } from "react";
import { furnitureCatalog } from "../data/furnitureCatalog";
import type { FurniturePreset } from "../data/furnitureCatalog";
import { windowCatalog } from "../data/windowCatalog";
import type { WindowPreset } from "../data/windowCatalog";
import { fixtureCatalog } from "../data/fixtureCatalog";
import { fixtureAddKind, fixtureModelFromAddKind } from "../data/fixtureAddKinds";

// 操作モードはコンボボックスのまま（要望: 操作はコンボボックス）。
// 追加は「＋追加」ボタン→ポップアップで種別選択（要望: 追加はポップアップ）。
export type EditMode = "select" | "move" | "wall";

type AddItem = { kind: string; label: string; hint?: string };

// 追加ポップアップのグループ。kind は App.handleAddObject と一致させる。
// 家具はカタログから生成し、kind を "furniture:<presetId>" とする。
const ADD_GROUPS: { title: string; items: AddItem[] }[] = [
  {
    title: "照明",
    items: fixtureCatalog.map((model) => ({
      kind: fixtureAddKind(model.id),
      label: model.label,
      hint: model.description
    }))
  },
  {
    // 窓はカタログから選ぶ（kind = "window:<presetId>"）。掃き出し/腰窓/高窓など。
    title: "窓",
    items: windowCatalog
      .filter((preset) => preset.style === "window" || preset.style === "opening")
      .map((preset) => ({ kind: `window:${preset.id}`, label: preset.label, hint: "壁をクリック" }))
  },
  {
    title: "建具",
    items: [
      { kind: "door", label: "扉", hint: "壁をクリック" },
      ...windowCatalog
        .filter((preset) => preset.style === "door")
        .map((preset) => ({ kind: `window:${preset.id}`, label: preset.label, hint: "壁をクリック" }))
    ]
  },
  {
    title: "開口・構造",
    items: [
      { kind: "void", label: "吹き抜け" },
      { kind: "ceilingZone", label: "下げ天井" },
      { kind: "floorZone", label: "下げ床(土間)" },
      { kind: "stair", label: "階段" }
    ]
  },
  {
    title: "家具",
    items: furnitureCatalog.map((preset) => ({ kind: `furniture:${preset.id}`, label: preset.label }))
  }
];

// --- アイコン SVG ヘルパー ---

// 照明アイコン: 照明 kind ごとに上面/側面の形状を描き分ける
function LightIcon({ kind }: { kind: string }) {
  const model = fixtureModelFromAddKind(kind);
  const iconKind =
    model?.id === "sp-wall" || model?.baseType === "bracket"
      ? "wallspot"
      : model?.baseType === "pendant"
        ? "pendant"
        : model?.baseType === "tape"
          ? "linelight"
          : "downlight";
  if (iconKind === "downlight") {
    // ダウンライト: 天井埋め込み円 + 放射線
    return (
      <svg viewBox="0 0 40 40" className="add-item-icon" aria-hidden>
        <circle cx="20" cy="14" r="7" fill="rgba(245,198,77,0.7)" stroke="rgba(245,198,77,0.9)" strokeWidth="1.5" />
        <line x1="20" y1="22" x2="14" y2="34" stroke="rgba(245,198,77,0.5)" strokeWidth="1.5" />
        <line x1="20" y1="22" x2="20" y2="36" stroke="rgba(245,198,77,0.5)" strokeWidth="1.5" />
        <line x1="20" y1="22" x2="26" y2="34" stroke="rgba(245,198,77,0.5)" strokeWidth="1.5" />
      </svg>
    );
  }
  if (iconKind === "wallspot") {
    // 壁付スポット: 壁板 + 傾いたスポット
    return (
      <svg viewBox="0 0 40 40" className="add-item-icon" aria-hidden>
        <rect x="4" y="4" width="6" height="32" rx="2" fill="rgba(200,190,170,0.35)" stroke="rgba(200,190,170,0.6)" strokeWidth="1" />
        <ellipse cx="22" cy="16" rx="9" ry="6" transform="rotate(-20 22 16)" fill="rgba(245,198,77,0.65)" stroke="rgba(245,198,77,0.9)" strokeWidth="1.5" />
        <line x1="14" y1="16" x2="10" y2="20" stroke="rgba(200,190,170,0.7)" strokeWidth="2" />
      </svg>
    );
  }
  if (iconKind === "pendant") {
    // ペンダント: コード + 傘
    return (
      <svg viewBox="0 0 40 40" className="add-item-icon" aria-hidden>
        <line x1="20" y1="2" x2="20" y2="14" stroke="rgba(200,190,170,0.7)" strokeWidth="1.5" />
        <path d="M10 14 Q10 26 20 26 Q30 26 30 14 Z" fill="rgba(245,198,77,0.55)" stroke="rgba(245,198,77,0.85)" strokeWidth="1.5" />
        <ellipse cx="20" cy="14" rx="10" ry="3" fill="rgba(200,190,170,0.3)" stroke="rgba(200,190,170,0.55)" strokeWidth="1" />
      </svg>
    );
  }
  if (iconKind === "linelight") {
    // ライン照明: 横長バー + 下方グロー
    return (
      <svg viewBox="0 0 40 40" className="add-item-icon" aria-hidden>
        <rect x="6" y="12" width="28" height="5" rx="2.5" fill="rgba(245,198,77,0.7)" stroke="rgba(245,198,77,0.9)" strokeWidth="1" />
        <rect x="8" y="18" width="24" height="8" rx="1" fill="rgba(245,198,77,0.15)" />
      </svg>
    );
  }
  return null;
}

// 窓/建具アイコン: WindowPreset の style・寸法比を反映
function WindowIcon({ preset }: { preset: WindowPreset }) {
  const totalH = 2.6; // 壁高さ基準
  const top = preset.sillHeightM / totalH;
  const h = Math.min(preset.heightM / totalH, 1 - top);
  const aspect = preset.widthM / preset.heightM;

  // SVG 内座標: 幅40, 高さ40
  const svgTop = 3 + top * 34;
  const svgH = h * 34;
  const svgW = Math.min(aspect * svgH * 0.8, 34);
  const svgX = (40 - svgW) / 2;

  if (preset.style === "opening") {
    // 開口: 破線枠のみ
    return (
      <svg viewBox="0 0 40 40" className="add-item-icon" aria-hidden>
        <rect x={svgX} y={svgTop} width={svgW} height={svgH} rx="1"
          fill="rgba(180,160,120,0.12)" stroke="rgba(180,160,120,0.7)" strokeWidth="1.5" strokeDasharray="4 3" />
      </svg>
    );
  }
  if (preset.style === "door") {
    // 扉: 実線枠 + ドア板 + 開き弧
    return (
      <svg viewBox="0 0 40 40" className="add-item-icon" aria-hidden>
        <rect x={svgX} y={svgTop} width={svgW} height={svgH} rx="1"
          fill="rgba(180,150,110,0.28)" stroke="rgba(200,175,130,0.85)" strokeWidth="1.5" />
        <circle cx={svgX + svgW - 3} cy={svgTop + svgH * 0.5} r="2" fill="rgba(245,198,77,0.7)" />
      </svg>
    );
  }
  // window: ガラス枠 + 十字桟
  return (
    <svg viewBox="0 0 40 40" className="add-item-icon" aria-hidden>
      <rect x={svgX} y={svgTop} width={svgW} height={svgH} rx="1"
        fill="rgba(150,210,240,0.18)" stroke="rgba(160,215,245,0.85)" strokeWidth="1.5" />
      <line x1={svgX + svgW / 2} y1={svgTop} x2={svgX + svgW / 2} y2={svgTop + svgH}
        stroke="rgba(160,215,245,0.55)" strokeWidth="1" />
      {svgH > 10 && (
        <line x1={svgX} y1={svgTop + svgH / 2} x2={svgX + svgW} y2={svgTop + svgH / 2}
          stroke="rgba(160,215,245,0.55)" strokeWidth="1" />
      )}
    </svg>
  );
}

// 家具アイコン: FurniturePreset の type・サイズ(x,z=平面)をもとに上面図を描く
function FurnitureIcon({ preset }: { preset: FurniturePreset }) {
  const W = 36;
  const H = 36;
  const ox = 2;
  const oy = 2;
  // 平面上のアスペクト比 (x=幅, z=奥行き) を正規化
  const rawAspect = preset.size.x / preset.size.z;
  const aspect = Math.max(0.3, Math.min(3.0, rawAspect));
  let bw: number, bh: number;
  if (aspect >= 1) {
    bw = W;
    bh = W / aspect;
  } else {
    bh = H;
    bw = H * aspect;
  }
  const bx = ox + (W - bw) / 2;
  const by = oy + (H - bh) / 2;

  const fill = "rgba(210,200,180,0.28)";
  const stroke = "rgba(220,210,190,0.75)";
  const sw = "1.5";

  switch (preset.type) {
    case "roundTable":
      return (
        <svg viewBox="0 0 40 40" className="add-item-icon" aria-hidden>
          <ellipse cx="20" cy="20" rx={bw / 2} ry={bh / 2} fill={fill} stroke={stroke} strokeWidth={sw} />
        </svg>
      );
    case "sofa": {
      // 座面 + 背もたれ帯（上辺）
      const backH = bh * 0.28;
      return (
        <svg viewBox="0 0 40 40" className="add-item-icon" aria-hidden>
          <rect x={bx} y={by} width={bw} height={bh} rx="3" fill={fill} stroke={stroke} strokeWidth={sw} />
          <rect x={bx} y={by} width={bw} height={backH} rx="3" fill="rgba(180,170,155,0.4)" stroke={stroke} strokeWidth={sw} />
        </svg>
      );
    }
    case "bed": {
      // 床板 + 枕（上部小矩形）
      const pillowH = bh * 0.22;
      return (
        <svg viewBox="0 0 40 40" className="add-item-icon" aria-hidden>
          <rect x={bx} y={by} width={bw} height={bh} rx="2" fill={fill} stroke={stroke} strokeWidth={sw} />
          <rect x={bx + bw * 0.15} y={by + 2} width={bw * 0.7} height={pillowH} rx="2"
            fill="rgba(240,235,220,0.35)" stroke={stroke} strokeWidth="1" />
        </svg>
      );
    }
    case "toilet": {
      // 洋式便器: 楕円タンク + D字ボウル
      return (
        <svg viewBox="0 0 40 40" className="add-item-icon" aria-hidden>
          <ellipse cx="20" cy={by + bh * 0.22} rx={bw * 0.36} ry={bh * 0.2} fill={fill} stroke={stroke} strokeWidth={sw} />
          <path d={`M${bx + bw * 0.15} ${by + bh * 0.38} Q${bx} ${by + bh * 0.88} ${bx + bw * 0.5} ${by + bh} Q${bx + bw} ${by + bh * 0.88} ${bx + bw * 0.85} ${by + bh * 0.38} Z`}
            fill={fill} stroke={stroke} strokeWidth={sw} />
        </svg>
      );
    }
    case "bathtub": {
      return (
        <svg viewBox="0 0 40 40" className="add-item-icon" aria-hidden>
          <rect x={bx} y={by} width={bw} height={bh} rx="4" fill={fill} stroke={stroke} strokeWidth={sw} />
          <ellipse cx="20" cy={by + bh * 0.58} rx={bw * 0.38} ry={bh * 0.28}
            fill="rgba(160,210,240,0.25)" stroke="rgba(160,210,240,0.6)" strokeWidth="1" />
        </svg>
      );
    }
    case "chair": {
      const seatSize = Math.min(bw, bh);
      const sx = ox + (W - seatSize) / 2;
      const sy = oy + (H - seatSize) / 2;
      return (
        <svg viewBox="0 0 40 40" className="add-item-icon" aria-hidden>
          <rect x={sx} y={sy} width={seatSize} height={seatSize} rx="3" fill={fill} stroke={stroke} strokeWidth={sw} />
          <rect x={sx} y={sy} width={seatSize} height={seatSize * 0.25} rx="3"
            fill="rgba(180,170,155,0.4)" stroke={stroke} strokeWidth="1" />
        </svg>
      );
    }
    case "kitchen": {
      // シンク2つ + コンロ4点
      return (
        <svg viewBox="0 0 40 40" className="add-item-icon" aria-hidden>
          <rect x={bx} y={by} width={bw} height={bh} rx="2" fill={fill} stroke={stroke} strokeWidth={sw} />
          <ellipse cx={bx + bw * 0.3} cy="20" rx={bw * 0.16} ry={bh * 0.28}
            fill="rgba(160,210,240,0.2)" stroke="rgba(160,210,240,0.6)" strokeWidth="1" />
          <ellipse cx={bx + bw * 0.62} cy="20" rx={bw * 0.16} ry={bh * 0.28}
            fill="rgba(160,210,240,0.2)" stroke="rgba(160,210,240,0.6)" strokeWidth="1" />
          <circle cx={bx + bw * 0.84} cy={by + bh * 0.28} r="2" fill="rgba(245,198,77,0.5)" />
          <circle cx={bx + bw * 0.84} cy={by + bh * 0.55} r="2" fill="rgba(245,198,77,0.5)" />
          <circle cx={bx + bw * 0.84} cy={by + bh * 0.78} r="2" fill="rgba(245,198,77,0.5)" />
        </svg>
      );
    }
    case "washstand": {
      return (
        <svg viewBox="0 0 40 40" className="add-item-icon" aria-hidden>
          <rect x={bx} y={by} width={bw} height={bh} rx="2" fill={fill} stroke={stroke} strokeWidth={sw} />
          <ellipse cx="20" cy="20" rx={bw * 0.32} ry={bh * 0.32}
            fill="rgba(160,210,240,0.2)" stroke="rgba(160,210,240,0.6)" strokeWidth="1" />
        </svg>
      );
    }
    case "rug": {
      // 薄い平板: 点線枠
      return (
        <svg viewBox="0 0 40 40" className="add-item-icon" aria-hidden>
          <rect x={bx} y={by + (bh < 4 ? (H - 8) / 2 - oy : 0)} width={bw}
            height={Math.max(bh, 8)} rx="2"
            fill="rgba(180,160,140,0.3)" stroke="rgba(200,185,165,0.7)" strokeWidth="1.5" strokeDasharray="4 2" />
        </svg>
      );
    }
    case "tv": {
      // 横長薄板 + スタンド線
      return (
        <svg viewBox="0 0 40 40" className="add-item-icon" aria-hidden>
          <rect x={bx} y={by} width={bw} height={Math.max(bh, 5)} rx="1"
            fill="rgba(40,40,50,0.6)" stroke="rgba(180,180,200,0.7)" strokeWidth="1.5" />
          <line x1="20" y1={by + Math.max(bh, 5)} x2="20" y2={by + Math.max(bh, 5) + 5}
            stroke="rgba(180,180,200,0.6)" strokeWidth="1.5" />
        </svg>
      );
    }
    case "stair": {
      // 踏み段を斜めに積む
      const steps = 4;
      const sw2 = bw / steps;
      const sh2 = bh / steps;
      return (
        <svg viewBox="0 0 40 40" className="add-item-icon" aria-hidden>
          {Array.from({ length: steps }).map((_, i) => (
            <rect key={i} x={bx + i * sw2} y={by + i * sh2}
              width={bw - i * sw2} height={bh - i * sh2}
              fill={`rgba(200,185,165,${0.12 + i * 0.07})`}
              stroke="rgba(210,195,175,0.65)" strokeWidth="1" />
          ))}
        </svg>
      );
    }
    default:
      // 汎用矩形
      return (
        <svg viewBox="0 0 40 40" className="add-item-icon" aria-hidden>
          <rect x={bx} y={by} width={bw} height={bh} rx="2" fill={fill} stroke={stroke} strokeWidth={sw} />
        </svg>
      );
  }
}

// 開口・構造アイコン
function StructureIcon({ kind }: { kind: string }) {
  if (kind === "void") {
    return (
      <svg viewBox="0 0 40 40" className="add-item-icon" aria-hidden>
        <rect x="6" y="6" width="28" height="28" rx="2"
          fill="rgba(76,97,114,0.2)" stroke="rgba(177,204,222,0.75)" strokeWidth="1.5" strokeDasharray="6 4" />
        <text x="20" y="24" textAnchor="middle" fontSize="10" fill="rgba(177,204,222,0.8)">吹</text>
      </svg>
    );
  }
  if (kind === "ceilingZone") {
    return (
      <svg viewBox="0 0 40 40" className="add-item-icon" aria-hidden>
        <rect x="5" y="5" width="30" height="30" rx="2"
          fill="rgba(150,120,90,0.18)" stroke="rgba(220,190,150,0.8)" strokeWidth="1.5" strokeDasharray="4 4" />
        <line x1="5" y1="5" x2="35" y2="5" stroke="rgba(220,190,150,0.9)" strokeWidth="3" />
      </svg>
    );
  }
  if (kind === "floorZone") {
    return (
      <svg viewBox="0 0 40 40" className="add-item-icon" aria-hidden>
        <rect x="5" y="5" width="30" height="30" rx="2"
          fill="rgba(80,130,170,0.18)" stroke="rgba(150,200,240,0.8)" strokeWidth="1.5" strokeDasharray="5 3" />
        <line x1="5" y1="35" x2="35" y2="35" stroke="rgba(150,200,240,0.9)" strokeWidth="3" />
      </svg>
    );
  }
  if (kind === "stair") {
    return (
      <svg viewBox="0 0 40 40" className="add-item-icon" aria-hidden>
        {[0, 1, 2, 3].map((i) => (
          <rect key={i} x={6 + i * 7} y={34 - (i + 1) * 7} width={34 - i * 7} height={7}
            fill={`rgba(200,185,165,${0.15 + i * 0.1})`} stroke="rgba(210,195,175,0.65)" strokeWidth="1" />
        ))}
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 40 40" className="add-item-icon" aria-hidden>
      <rect x="6" y="6" width="28" height="28" rx="2"
        fill="rgba(200,190,170,0.15)" stroke="rgba(200,190,170,0.6)" strokeWidth="1.5" />
    </svg>
  );
}

// kind から対応するアイコンを返す
function ItemIcon({ kind }: { kind: string }) {
  if (fixtureModelFromAddKind(kind) || kind === "downlight" || kind === "wallspot" || kind === "pendant" || kind === "linelight") {
    return <LightIcon kind={kind} />;
  }
  if (kind.startsWith("window:")) {
    const id = kind.slice("window:".length);
    const preset = windowCatalog.find((p) => p.id === id);
    if (preset) return <WindowIcon preset={preset} />;
  }
  if (kind === "door") {
    // 汎用扉アイコン
    const mock: WindowPreset = { id: "door", label: "扉", widthM: 0.9, heightM: 2.0, sillHeightM: 0, hasGlass: false, style: "door" };
    return <WindowIcon preset={mock} />;
  }
  if (kind.startsWith("furniture:")) {
    const id = kind.slice("furniture:".length);
    const preset = furnitureCatalog.find((p) => p.id === id);
    if (preset) return <FurnitureIcon preset={preset} />;
  }
  return <StructureIcon kind={kind} />;
}

// --- グループ第1画面のアイコン ---
function GroupIcon({ title }: { title: string }) {
  switch (title) {
    case "照明":
      return (
        <svg viewBox="0 0 40 40" className="add-group-icon" aria-hidden>
          <circle cx="20" cy="18" r="8" fill="rgba(245,198,77,0.65)" stroke="rgba(245,198,77,0.9)" strokeWidth="1.5" />
          <line x1="20" y1="27" x2="20" y2="36" stroke="rgba(245,198,77,0.6)" strokeWidth="2" />
          <line x1="6" y1="18" x2="2" y2="18" stroke="rgba(245,198,77,0.5)" strokeWidth="1.5" />
          <line x1="34" y1="18" x2="38" y2="18" stroke="rgba(245,198,77,0.5)" strokeWidth="1.5" />
          <line x1="10" y1="8" x2="7" y2="5" stroke="rgba(245,198,77,0.5)" strokeWidth="1.5" />
          <line x1="30" y1="8" x2="33" y2="5" stroke="rgba(245,198,77,0.5)" strokeWidth="1.5" />
        </svg>
      );
    case "窓":
      return (
        <svg viewBox="0 0 40 40" className="add-group-icon" aria-hidden>
          <rect x="8" y="8" width="24" height="28" rx="1"
            fill="rgba(150,210,240,0.18)" stroke="rgba(160,215,245,0.85)" strokeWidth="1.5" />
          <line x1="20" y1="8" x2="20" y2="36" stroke="rgba(160,215,245,0.55)" strokeWidth="1" />
          <line x1="8" y1="22" x2="32" y2="22" stroke="rgba(160,215,245,0.55)" strokeWidth="1" />
        </svg>
      );
    case "建具":
      return (
        <svg viewBox="0 0 40 40" className="add-group-icon" aria-hidden>
          <rect x="10" y="4" width="20" height="32" rx="1"
            fill="rgba(180,150,110,0.25)" stroke="rgba(200,175,130,0.85)" strokeWidth="1.5" />
          <circle cx="27" cy="20" r="2.5" fill="rgba(245,198,77,0.7)" />
        </svg>
      );
    case "開口・構造":
      return (
        <svg viewBox="0 0 40 40" className="add-group-icon" aria-hidden>
          <rect x="6" y="6" width="28" height="28" rx="2"
            fill="rgba(76,97,114,0.18)" stroke="rgba(177,204,222,0.75)" strokeWidth="1.5" strokeDasharray="6 4" />
          <line x1="6" y1="6" x2="34" y2="34" stroke="rgba(177,204,222,0.45)" strokeWidth="1" strokeDasharray="3 3" />
        </svg>
      );
    case "家具":
      return (
        <svg viewBox="0 0 40 40" className="add-group-icon" aria-hidden>
          <rect x="5" y="12" width="30" height="18" rx="3"
            fill="rgba(210,200,180,0.28)" stroke="rgba(220,210,190,0.75)" strokeWidth="1.5" />
          <rect x="5" y="12" width="30" height="5" rx="3"
            fill="rgba(180,170,155,0.4)" stroke="rgba(220,210,190,0.75)" strokeWidth="1" />
        </svg>
      );
    default:
      return null;
  }
}

// ---

type EditToolbarProps = {
  mode: EditMode;
  onModeChange: (mode: EditMode) => void;
  onAdd: (kind: string) => void;
  pendingAdd: string | null;
};

export const EditToolbar = ({ mode, onModeChange, onAdd, pendingAdd }: EditToolbarProps) => {
  const [menuOpen, setMenuOpen] = useState(false);
  // null = 第1画面（グループ選択）、string = 第2画面（グループ内アイテム）
  const [activeGroup, setActiveGroup] = useState<string | null>(null);

  // モーダル表示中は Esc で閉じる。第2画面なら第1画面へ戻る。
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (activeGroup !== null) {
          setActiveGroup(null);
        } else {
          setMenuOpen(false);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen, activeGroup]);

  const handleClose = () => {
    setMenuOpen(false);
    setActiveGroup(null);
  };

  const currentGroup = ADD_GROUPS.find((g) => g.title === activeGroup) ?? null;

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
        <div className="add-modal-backdrop" onPointerDown={handleClose}>
          <div className="add-modal" role="dialog" aria-modal onPointerDown={(event) => event.stopPropagation()}>

            {/* 第1画面: グループ選択 */}
            {currentGroup === null && (
              <>
                <p className="add-modal-title">追加するもの</p>
                <div className="add-group-list">
                  {ADD_GROUPS.map((group) => (
                    <button
                      key={group.title}
                      type="button"
                      className="add-group-item"
                      onClick={() => setActiveGroup(group.title)}
                    >
                      <GroupIcon title={group.title} />
                      <span>{group.title}</span>
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
                    ← 戻る
                  </button>
                  <p className="add-modal-title">{currentGroup.title}</p>
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
                          handleClose();
                        }}
                      >
                        <ItemIcon kind={item.kind} />
                        <span className="add-item-label">{item.label}</span>
                        {item.hint && <em className="add-item-hint">{item.hint}</em>}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

          </div>
        </div>
      )}
    </div>
  );
};
