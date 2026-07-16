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
  "OFF": "OFF"
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
