import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type Language = "ja" | "en";

const STORAGE_KEY = "ldk-language";

const en: Record<string, string> = {
  "Local Web Simulator": "Local Web Simulator",
  "メニュー": "Menu",
  "プロジェクト操作": "Project actions",
  "間取り図の読込": "Import floor plan",
  "プロジェクト保存": "Save project",
  "プロジェクト読込": "Open project",
  "表示モード": "View mode",
  "編集": "Edit",
  "リアル": "Realistic",
  "出力 / レンダリング": "Export / Render",
  "使い方を見る": "How it works",
  "言語": "Language",
  "日本語": "日本語",
  "English": "English",
  "間取り編集": "Edit plan",
  "壁の選択・移動・削除、壁引き": "Select, move, or delete walls, then draw new walls.",
  "壁を引く": "Draw walls",
  "＋追加": "+ Add",
  "追加するもの": "Add to your plan",
  "← 戻る": "← Back",
  "自分の間取りで夜の照明を試す": "See your home lighting at night",
  "自分の間取り図を取り込み、照明の位置・明るさ・色温度を変えて「夜の見え方」を比較できます。": "Import your floor plan, then compare the nighttime feel by changing fixture placement, brightness, and color temperature.",
  "ダウンライト・ペンダント・壁付スポットなど複数種の照明を自由に配置できます。": "Place downlights, pendants, wall spots, and other fixture types freely.",
  "Path Tracing による間接光レンダリングで雰囲気を視覚確認できます。": "Use path-traced indirect light to visually compare the atmosphere.",
  "雰囲気比較用シミュレーションです。実照度（lux）の保証はしません。": "This is a visual simulation for comparing lighting layouts and atmosphere. It does not guarantee real illuminance (lux).",
  "基本操作": "Getting started",
  "スマホでは読み込み・保存・出力を開く": "On mobile, open import, save, and export from this menu.",
  "スマホでは下タブで切替、設定は歯車": "On mobile, switch views with the bottom tabs and open settings with the gear.",
  "タップ": "Tap",
  "選択・配置": "Select or place",
  "ピンチ": "Pinch",
  "平面図をズーム": "Zoom the plan",
  "ドラッグ / 二本指": "Drag / two fingers",
  "3D視点の回転・パン": "Rotate or pan the 3D view",
  "注視点だけを動かして見回す（カメラ固定）": "Look around by moving the target while keeping the camera fixed.",
  "視点を前後 / 左右に移動": "Move the camera forward/back or left/right.",
  "視点を上下に移動": "Move the camera up/down.",
  "カメラが注視点の周りを回る": "Orbit the camera around the target.",
  "はじめる": "Start exploring",
  "フィードバック": "Feedback",
  "ご意見・不具合の報告": "Feedback or bug report",
  "閉じる": "Close",
  "種別": "Type",
  "要望": "Feature request",
  "不具合": "Bug report",
  "起きたこと・再現手順・期待した動作など": "What happened, steps to reproduce, and what you expected.",
  "ほしい機能・改善してほしい点など": "A feature you would like or an improvement to make.",
  "連絡先（任意・返信がほしい場合）": "Contact (optional, if you would like a reply)",
  "送信中…": "Sending…",
  "送信": "Send",
  "内容は開発者の課題管理（GitHub）に送られます。個人情報や機密は書かないでください。": "Your message goes to the developer's private issue tracker. Do not include personal or sensitive information.",
  "内容を入力してください。": "Please enter a message.",
  "送信しました。ありがとうございます。": "Sent. Thank you!",
  "送信に失敗しました。": "Could not send feedback.",
  "ご意見・不具合を送る": "Send feedback or report a bug",
  "プロパティインスペクター": "Properties inspector",
  "戻る": "Back",
  "部屋設定": "Room settings",
  "部屋の集計": "Room summary",
  "家具を編集": "Edit furniture",
  "を編集": " settings",
  "ダウンライト": "Downlight",
  "スポットライト": "Spotlight",
  "ペンダント": "Pendant",
  "ブラケット": "Wall light",
  "テープライト": "Tape light",
  "照明": "Lights",
  "家具": "Furniture",
  "有効lm": "Active lm",
  "メインクロス（壁全体）": "Main wall finish (all walls)",
  "全壁の素材を一括変更": "Change material for all walls",
  "— 素材を選んで適用 —": "— Select a material to apply —",
  "照明一覧": "Lighting",
  "部屋全体に適用": "Applies to the entire room",
  "{count}灯すべての色温度を変更します": "Changes color temperature for all {count} fixtures",
  "全照明の色温度を一括変更": "Set color temperature for all lights",
  "照明を選択": "Select a light",
  "— 照明を選択 —": "— Select a light —",
  "ℹ 免責": "ℹ Disclaimer",
  "これは照明配置・雰囲気比較用の視覚シミュレーションです。実際の照度、配光、色、施工後の見え方を保証するものではありません。": "This is a visual simulation for comparing lighting layouts and atmosphere. It does not guarantee actual illuminance, light distribution, color, or the finished result.",
  "自動保存": "Autosaved",
  "ON": "ON",
  "OFF": "OFF",
  "壁をクリックして設置（Escで終了）": "Click a wall to place it (Esc to cancel)",
  "クリックした位置に配置": "Click to place",
  "タップ、または押して引いて壁を作成。Enter/ダブルクリックで終了": "Tap, or press and drag to draw walls. Press Enter or double-click to finish.",
  "壁を選択・ドラッグで移動。Deleteで削除": "Select and drag walls to move them. Press Delete to remove.",
  "クリックで選択、選択後ドラッグで移動": "Click to select, then drag the selection to move it.",
  "階切替": "Floor switcher",
  "1階": "Floor 1",
  "2階": "Floor 2",
  "1階を編集": "Edit floor 1",
  "2階を編集（1階の壁を薄く表示して作図補助）": "Edit floor 2 (floor 1 walls remain visible as a guide)",
  "2階編集中 — 1階の壁を薄く表示して作図補助": "Editing floor 2 — floor 1 walls are shown as a guide",
  "スマホ編集操作": "Mobile editing actions",
  "元に戻す": "Undo",
  "やり直す": "Redo",
  "削除": "Delete",
  "解除": "Clear",
  "3D表示": "3D view",
  "通常表示に戻す": "Return to normal view",
  "3Dを最大化": "Maximize 3D",
  "BVH生成中…": "Building BVH…",
  "間接光リアル描画 / {count} samples 収束済み": "Realistic indirect light / {count} samples converged",
  "間接光リアル描画 / {count} samples 収束中": "Realistic indirect light / converging at {count} samples",
  "編集プレビュー": "Edit preview",
  "露出": "Exposure",
  "日光": "Daylight",
  "日光を有効にする": "Enable daylight",
  "時刻": "Time",
  "月": "Month",
  "日": "Day",
  "北方位°": "North offset°",
  "緯度°": "Latitude°",
  "品質": "Quality",
  "標準": "Standard",
  "高品質": "High",
  "最高": "Ultra",
  "診断": "Diagnostics",
  "通常": "Beauty",
  "マテリアル": "Material",
  "法線": "Normals",
  "表裏": "Front / back",
  "レンダリング停止": "Stop render",
  "レンダリング開始": "Start render",
  "PNG書き出し": "Export PNG",
  "残り": "remaining",
  "設定を閉じる": "Close settings",
  "スマホ表示切替": "Mobile view switcher",
  "設定を開く": "Open settings",
  "設定": "Settings"
  ,"2D平面図エディタ": "2D plan editor"
  ,"平面配置": "Plan layout"
  ,"2Dを最大化": "Maximize 2D"
  ,"ズーム": "Zoom"
  ,"拡大": "Zoom in"
  ,"縮小": "Zoom out"
  ,"全体表示": "Fit to view"
  ,"縮尺": "Scale"
  ,"背景合わせ": "Align background"
  ,"1階基準": "Use floor 1 alignment"
  ,"完了": "Done"
  ,"北": "North"
  ,"1階の薄い壁を目安に、二階の背景画像をドラッグして位置を合わせます。終わったら完了。": "Drag the floor 2 background image to align it with the faint floor 1 walls, then select Done."
  ,"壁または吹き抜け内周に近づけると青くハイライト。クリックで壁付け照明を設置。": "A wall or void edge highlights blue when targeted. Click to place the wall-mounted light."
  ,"壁に近づけると青くハイライト。その壁をクリックで設置。設置後は壁上をドラッグで位置調整。": "A nearby wall highlights blue. Click it to place this item, then drag along the wall to adjust it."
  ,"クリックした位置にオブジェクトを配置します。": "Click to place the object."
  ,"オブジェクトをクリックで選択、ドラッグで移動。何もない所のドラッグで平面図をパン。Deleteで削除。": "Click an object to select it and drag to move it. Drag empty space to pan. Press Delete to remove."
  ,"壁をクリックで選択、ドラッグで移動。Deleteで削除。何もない所のドラッグで平面図をパン。": "Click a wall to select it and drag to move it. Press Delete to remove. Drag empty space to pan."
  ,"角に近づけてタップ、または押して引いて離すと壁を作成。スマホは水平/垂直へ強めにスナップします。内側は下のボタンで指定できます。": "Tap near a corner, or press, drag, and release to create a wall. On mobile, walls snap strongly to horizontal or vertical. Choose the inside below."
  ,"壁作成": "Wall drawing"
  ,"1点戻す": "Undo point"
  ,"壁の内側": "Wall interior"
  ,"中央": "Center"
  ,"左": "Left"
  ,"右": "Right"
  ,"中止": "Cancel"
  ,"選択中の照明": "Selected light"
  ,"点灯中": "On"
  ,"消灯中": "Off"
  ,"明るさ": "Brightness"
  ,"色温度": "Color temperature"
  ,"吊り長さ": "Drop length"
  ,"天井から": "From ceiling"
  ,"器具・配光": "Fixture and distribution"
  ,"器具": "Fixture"
  ,"グレアレス": "glare-reduced"
  ,"照射先": "Aim target"
  ,"長さ": "Length"
  ,"名前": "Name"
  ,"明るさ（光束）": "Brightness (luminous flux)"
  ,"光の広がり（器具プリセットを上書き）": "Beam spread (overrides fixture preset)"
  ,"メモ": "Notes"
  ,"{count}個のライトを選択中": "{count} lights selected"
  ,"変更は全選択ライトに適用されます。": "Changes apply to all selected lights."
  ,"調光": "Dimming"
  ,"種類": "Type"
  ,"テープ": "Tape light"
  ,"光束": "Luminous flux"
  ,"色温度プリセット": "Color temperature presets"
  ,"照射角度": "Beam angle"
  ,"電球色": "Warm white"
  ,"温白色": "Neutral white"
  ,"昼白色": "Cool white"
  ,"昼光色": "Daylight white"
  ,"ボックス": "Box"
  ,"丸テーブル": "Round table"
  ,"角テーブル": "Rectangular table"
  ,"椅子": "Chair"
  ,"ソファ": "Sofa"
  ,"ベッド": "Bed"
  ,"キッチン": "Kitchen"
  ,"カップボード": "Cupboard"
  ,"冷蔵庫": "Refrigerator"
  ,"可動棚": "Shelf"
  ,"カウンター": "Counter"
  ,"ラグ": "Rug"
  ,"階段": "Stairs"
  ,"幅": "Width"
  ,"高さ": "Height"
  ,"奥行": "Depth"
  ,"回転": "Rotation"
  ,"影を落とす": "Cast shadow"
  ,"窓（ガラス）": "Window (glass)"
  ,"扉": "Door"
  ,"開口": "Opening"
  ,"設置する壁": "Wall to place on"
  ,"床から": "From floor"
  ,"壁上の位置": "Position on wall"
  ,"内周壁": "Interior walls"
  ,"壁あり": "Wall"
  ,"開放": "Open"
  ,"2階廊下などで壁が無い辺は「開放」にします。壁付け照明は壁ありの辺にだけ付きます。": "Set sides without a wall, such as an upper-floor corridor edge, to Open. Wall-mounted lights can only attach to sides with a wall."
  ,"下がり": "Ceiling drop"
  ,"下げ量": "Floor drop"
  ,"室内床レベル": "Interior floor level"
  ,"土間の下がり量をこの値に合わせると土間が地面(0)になる": "Match the entry floor drop to this value to place the entry floor at ground level (0)."
  ,"始点X": "Start X"
  ,"始点Z": "Start Z"
  ,"終点X": "End X"
  ,"終点Z": "End Z"
  ,"厚み": "Thickness"
  ,"通常壁": "Full wall"
  ,"腰壁": "Half wall"
  ,"手すり": "Railing"
  ,"腰壁/手すりは吹き抜けまわりの表現に使えます。高さは上の欄で微調整可。": "Use half walls or railings around a double-height space. Fine-tune their height above."
  ,"内側方向": "Interior direction"
  ,"中央（既定）": "Center (default)"
  ,"左（start→end向きで左）": "Left (facing start → end)"
  ,"右（start→end向きで右）": "Right (facing start → end)"
  ,"start→endへ向かって室内側がどちらか。背景間取り図の内壁線にトレース線を合わせるとき使う": "Choose which side faces the room when looking from start to end. Use this when tracing an interior wall line on a floor-plan image."
  ,"素材": "Material"
  ,"壁紙はこの素材「{name}」を使う全ての壁に反映されます。": "Wallpaper applies to every wall using the material “{name}”."
  ,"壁紙画像": "Wallpaper image"
  ,"壁紙プレビュー": "Wallpaper preview"
  ,"柄の幅": "Pattern width"
  ,"柄の高さ": "Pattern height"
  ,"壁紙を外す": "Remove wallpaper"
  ,"詳細 +": "Details +"
  ,"フィードバック送信は現在利用できません。": "Feedback is unavailable right now."
  ,"フィードバック送信に失敗しました。時間をおいて再度お試しください。": "Could not send feedback. Please try again later."
  ,"中心": "Center"
  ,"から": "from"
  ,"壁との距離を確認": "Check distance from walls"
  ,"配置の目安": "Placement guide"
  ,"2D/3D共通": "Shared by 2D / 3D"
  ,"基準壁": "Reference wall"
  ,"壁なし": "No wall"
  ,"壁中心": "Wall center"
  ,"終点側": "toward end"
  ,"始点側": "toward start"
  ,"未計算": "Not calculated"
  ,"壁線から": "From wall line"
  ,"横ライン": "Horizontal alignment"
  ,"奥行ライン": "Depth alignment"
  ,"比較対象なし": "No reference"
  ,"{name} と一致": "Aligned with {name}"
  ,"{name} まで {distance}": "{distance} from {name}"
  ,"近い基準なし（最寄り {name} まで {distance}）": "No close alignment (nearest: {name}, {distance})"
  ,"設置位置": "Placement"
  ,"窓": "Windows"
  ,"建具": "Doors"
  ,"開口・構造": "Openings and structure"
  ,"吹き抜け": "Double-height void"
  ,"下げ天井": "Dropped ceiling"
  ,"下げ床(土間)": "Lowered entry floor"
  ,"壁をクリック": "Click a wall"
  ,"ショートカット案内": "Keyboard shortcuts"
  ,"ショートカット案内を隠す": "Hide keyboard shortcuts"
  ,"ショートカット案内を表示": "Show keyboard shortcuts"
  ,"視点を前に移動": "Move camera forward"
  ,"視点を後ろに移動": "Move camera backward"
  ,"視点を左に移動": "Move camera left"
  ,"視点を右に移動": "Move camera right"
  ,"クリック": "Click"
  ,"ライト複数選択": "Select multiple lights"
  ,"カメラが注視点の周りを左に回る": "Orbit camera left around target"
  ,"カメラが注視点の周りを右に回る": "Orbit camera right around target"
  ,"視点を上に移動": "Move camera up"
  ,"視点を下に移動": "Move camera down"
  ,"コピー": "Copy"
  ,"貼り付け": "Paste"
  ,"やり直し": "Redo"
  ,"配置終了 / 選択解除": "Finish placement / clear selection"
  ,"壁モード：頂点を確定": "Wall mode: confirm vertex"
  ,"縮尺合わせ": "Scale calibration"
  ,"実距離を入力し、表示された線に間取り図の同じ長さの部分を合わせてください。画像はドラッグ、二本指ピンチで調整できます。": "Enter a real-world distance, then align the displayed line with the same length on the floor plan. Drag or pinch with two fingers to adjust the image."
  ,"間取り図": "Floor plan"
  ,"実距離": "Real distance"
  ,"ガイド線の向き": "Guide-line orientation"
  ,"横": "Horizontal"
  ,"縦": "Vertical"
  ,"画像倍率": "Image zoom"
  ,"画像上": "On image"
  ,"線が画像から外れています": "The line is outside the image"
  ,"リセット": "Reset"
  ,"キャンセル": "Cancel"
  ,"確定": "Confirm"
};

type I18nContextValue = {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (key: string, values?: Record<string, string | number>) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

const initialLanguage = (): Language => {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === "ja" || saved === "en") return saved;
  return navigator.language.toLowerCase().startsWith("ja") ? "ja" : "en";
};

export const LanguageProvider = ({ children }: { children: ReactNode }) => {
  const [language, setLanguageState] = useState<Language>(initialLanguage);
  const setLanguage = (nextLanguage: Language) => {
    localStorage.setItem(STORAGE_KEY, nextLanguage);
    setLanguageState(nextLanguage);
  };

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const value = useMemo<I18nContextValue>(() => ({
    language,
    setLanguage,
    t: (key, values) => {
      const translation = language === "en" ? (en[key] ?? key) : key;
      return Object.entries(values ?? {}).reduce(
        (message, [name, replacement]) => message.replaceAll(`{${name}}`, String(replacement)),
        translation
      );
    }
  }), [language]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};

export const useI18n = (): I18nContextValue => {
  const value = useContext(I18nContext);
  if (!value) throw new Error("useI18n must be used within LanguageProvider");
  return value;
};
