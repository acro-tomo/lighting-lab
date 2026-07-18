import type { FurniturePreset } from "../../data/furnitureCatalog";
import { furnitureCatalog } from "../../data/furnitureCatalog";
import type { WindowPreset } from "../../data/windowCatalog";
import { windowPresetFromAddKind } from "../../data/windowCatalog";
import { fixtureModelFromAddKind } from "../../data/fixtureAddKinds";

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
    const spread = model ? Math.max(4, Math.min(13, model.beamAngleDeg / 9)) : 8;
    const isUniversal = model?.aimable === true;
    return (
      <svg viewBox="0 0 40 40" className="add-item-icon" aria-hidden>
        <path d="M8 8h24" fill="none" stroke="rgba(220,210,190,0.8)" strokeWidth="1.5" />
        {isUniversal ? (
          <ellipse cx="21" cy="14" rx="7" ry="5" transform="rotate(-22 21 14)" fill="none" stroke="rgba(245,198,77,0.9)" strokeWidth="1.8" />
        ) : (
          <>
            <path d="M13 9v6c0 4 14 4 14 0V9" fill="none" stroke="rgba(245,198,77,0.9)" strokeWidth="1.8" />
            {model?.glareless && <path d="M16 10v5c0 2 8 2 8 0v-5" fill="none" stroke="rgba(220,210,190,0.75)" strokeWidth="1.4" />}
          </>
        )}
        <path d={`M20 20L${20 - spread} 35M20 20L${20 + spread} 35`} fill="none" stroke="rgba(245,198,77,0.58)" strokeWidth="1.4" />
      </svg>
    );
  }
  if (iconKind === "wallspot") {
    // 壁付スポット: 壁板 + 傾いたスポット
    return (
      <svg viewBox="0 0 40 40" className="add-item-icon" aria-hidden>
        <rect x="4" y="4" width="6" height="32" rx="2" fill="none" stroke="rgba(200,190,170,0.75)" strokeWidth="1.5" />
        <ellipse cx="22" cy="16" rx="9" ry="6" transform="rotate(-20 22 16)" fill="none" stroke="rgba(245,198,77,0.9)" strokeWidth="1.5" />
        <line x1="14" y1="16" x2="10" y2="20" stroke="rgba(200,190,170,0.7)" strokeWidth="2" />
      </svg>
    );
  }
  if (iconKind === "pendant") {
    // ペンダント: コード + 傘
    return (
      <svg viewBox="0 0 40 40" className="add-item-icon" aria-hidden>
        <line x1="20" y1="2" x2="20" y2="14" stroke="rgba(200,190,170,0.7)" strokeWidth="1.5" />
        <path d="M10 14 Q10 26 20 26 Q30 26 30 14 Z" fill="none" stroke="rgba(245,198,77,0.85)" strokeWidth="1.5" />
        <ellipse cx="20" cy="14" rx="10" ry="3" fill="none" stroke="rgba(200,190,170,0.75)" strokeWidth="1" />
      </svg>
    );
  }
  if (iconKind === "linelight") {
    // ライン照明: 横長バー + 下方グロー
    return (
      <svg viewBox="0 0 40 40" className="add-item-icon" aria-hidden>
        <rect x="6" y="12" width="28" height="5" rx="2.5" fill="none" stroke="rgba(245,198,77,0.9)" strokeWidth="1.5" />
        <path d="M9 20h22M12 25h16" stroke="rgba(245,198,77,0.55)" strokeWidth="1.5" strokeLinecap="round" />
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
          fill="none" stroke="rgba(200,175,130,0.85)" strokeWidth="1.5" />
        <circle cx={svgX + svgW - 3} cy={svgTop + svgH * 0.5} r="2" fill="rgba(245,198,77,0.7)" />
      </svg>
    );
  }
  // window: ガラス枠 + 十字桟
  return (
    <svg viewBox="0 0 40 40" className="add-item-icon" aria-hidden>
      <rect x={svgX} y={svgTop} width={svgW} height={svgH} rx="1"
      fill="none" stroke="rgba(160,215,245,0.85)" strokeWidth="1.5" />
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

  const fill = "none";
  const stroke = "rgba(220,210,190,0.75)";
  const sw = "1.5";

  switch (preset.type) {
    case "roundTable":
      return (
        <svg viewBox="0 0 40 40" className="add-item-icon" aria-hidden>
          <ellipse cx="20" cy="20" rx={bw / 2} ry={bh / 2} fill={fill} stroke={stroke} strokeWidth={sw} />
        </svg>
      );
    case "rectTable":
    case "desk":
    case "counter":
      return (
        <svg viewBox="0 0 40 40" className="add-item-icon" aria-hidden>
          <rect x={bx} y={by} width={bw} height={bh} rx="2" fill="none" stroke={stroke} strokeWidth={sw} />
          <circle cx={bx + 4} cy={by + 4} r="1.5" fill={stroke} />
          <circle cx={bx + bw - 4} cy={by + 4} r="1.5" fill={stroke} />
          <circle cx={bx + 4} cy={by + bh - 4} r="1.5" fill={stroke} />
          <circle cx={bx + bw - 4} cy={by + bh - 4} r="1.5" fill={stroke} />
          {preset.type === "desk" && <path d={`M${bx + bw * 0.58} ${by + 3}h${bw * 0.3}v${Math.max(3, bh - 6)}h-${bw * 0.3}z`} fill="none" stroke={stroke} strokeWidth="1" />}
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
    case "cupboard":
    case "shelf":
    case "shoeCabinet":
      return (
        <svg viewBox="0 0 40 40" className="add-item-icon" aria-hidden>
          <rect x={bx} y={by} width={bw} height={bh} rx="1" fill="none" stroke={stroke} strokeWidth={sw} />
          {[0.33, 0.66].map((ratio) => <line key={ratio} x1={bx + 2} y1={by + bh * ratio} x2={bx + bw - 2} y2={by + bh * ratio} stroke={stroke} strokeWidth="1" />)}
        </svg>
      );
    case "fridge":
    case "washer":
      return (
        <svg viewBox="0 0 40 40" className="add-item-icon" aria-hidden>
          <rect x={bx} y={by} width={bw} height={bh} rx="2" fill="none" stroke={stroke} strokeWidth={sw} />
          {preset.type === "washer" ? (
            <circle cx="20" cy="20" r={Math.min(bw, bh) * 0.28} fill="none" stroke="rgba(160,210,240,0.75)" strokeWidth="1.5" />
          ) : (
            <><line x1={bx} y1={by + bh * 0.42} x2={bx + bw} y2={by + bh * 0.42} stroke={stroke} /><line x1={bx + bw - 4} y1={by + 4} x2={bx + bw - 4} y2={by + bh * 0.35} stroke={stroke} /></>
          )}
        </svg>
      );
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
export function ItemIcon({ kind }: { kind: string }) {
  if (fixtureModelFromAddKind(kind) || kind === "downlight" || kind === "wallspot" || kind === "pendant" || kind === "linelight") {
    return <LightIcon kind={kind} />;
  }
  if (kind.startsWith("window:")) {
    const preset = windowPresetFromAddKind(kind);
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
export function GroupIcon({ groupId }: { groupId: string }) {
  switch (groupId) {
    case "lighting":
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
    case "window":
      return (
        <svg viewBox="0 0 40 40" className="add-group-icon" aria-hidden>
          <rect x="8" y="8" width="24" height="28" rx="1"
            fill="rgba(150,210,240,0.18)" stroke="rgba(160,215,245,0.85)" strokeWidth="1.5" />
          <line x1="20" y1="8" x2="20" y2="36" stroke="rgba(160,215,245,0.55)" strokeWidth="1" />
          <line x1="8" y1="22" x2="32" y2="22" stroke="rgba(160,215,245,0.55)" strokeWidth="1" />
        </svg>
      );
    case "door":
      return (
        <svg viewBox="0 0 40 40" className="add-group-icon" aria-hidden>
          <rect x="10" y="4" width="20" height="32" rx="1"
            fill="rgba(180,150,110,0.25)" stroke="rgba(200,175,130,0.85)" strokeWidth="1.5" />
          <circle cx="27" cy="20" r="2.5" fill="rgba(245,198,77,0.7)" />
        </svg>
      );
    case "structure":
      return (
        <svg viewBox="0 0 40 40" className="add-group-icon" aria-hidden>
          <rect x="6" y="6" width="28" height="28" rx="2"
            fill="rgba(76,97,114,0.18)" stroke="rgba(177,204,222,0.75)" strokeWidth="1.5" strokeDasharray="6 4" />
          <line x1="6" y1="6" x2="34" y2="34" stroke="rgba(177,204,222,0.45)" strokeWidth="1" strokeDasharray="3 3" />
        </svg>
      );
    case "furniture":
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

export function CategoryIcon({ categoryId }: { categoryId: string }) {
  const stroke = "rgba(220,210,190,0.82)";
  const accent = "rgba(245,198,77,0.9)";
  if (["downlight", "pendant", "wall-light", "indirect"].includes(categoryId)) {
    return (
      <svg viewBox="0 0 40 40" className="add-category-icon" aria-hidden>
        {categoryId === "downlight" && <><path d="M9 8h22M14 9v6c0 4 12 4 12 0V9" fill="none" stroke={stroke} strokeWidth="1.7" /><path d="M20 21l-8 14m8-14 8 14" stroke={accent} strokeWidth="1.4" /></>}
        {categoryId === "pendant" && <><path d="M20 3v13" stroke={stroke} strokeWidth="1.7" /><path d="M11 25h18l-5-9h-8z" fill="none" stroke={accent} strokeWidth="1.7" /></>}
        {categoryId === "wall-light" && <><path d="M8 5v30" stroke={stroke} strokeWidth="2" /><path d="m9 19 10-6 8 5-9 6z" fill="none" stroke={accent} strokeWidth="1.7" /></>}
        {categoryId === "indirect" && <><path d="M6 15h28v6H6z" fill="none" stroke={stroke} strokeWidth="1.7" /><path d="M9 27h22" stroke={accent} strokeWidth="3" strokeLinecap="round" /></>}
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 40 40" className="add-category-icon" aria-hidden>
      {categoryId === "living" && <><path d="M6 16h28v15H6zM9 13h22v8H9z" fill="none" stroke={stroke} strokeWidth="1.6" /></>}
      {categoryId === "dining-work" && <><path d="M7 15h26v8H7zM11 23v10m18-10v10" fill="none" stroke={stroke} strokeWidth="1.6" /><circle cx="20" cy="10" r="3" fill="none" stroke={accent} /></>}
      {categoryId === "kitchen" && <><path d="M5 12h30v18H5z" fill="none" stroke={stroke} strokeWidth="1.6" /><circle cx="27" cy="18" r="3" fill="none" stroke={accent} /><path d="M9 17h10v8H9z" fill="none" stroke={stroke} /></>}
      {categoryId === "water" && <><path d="M8 12h24v20H8z" fill="none" stroke={stroke} strokeWidth="1.6" /><circle cx="20" cy="22" r="7" fill="none" stroke={accent} /></>}
      {categoryId === "bed-storage" && <><path d="M5 15h30v16H5zM9 11h9v8H9z" fill="none" stroke={stroke} strokeWidth="1.6" /></>}
      {categoryId === "free" && <><path d="m8 12 13-6 12 8-13 7zM8 12v16l12 7V21m13-7v15l-13 6" fill="none" stroke={accent} strokeWidth="1.6" /></>}
    </svg>
  );
}
