import { useRef, useState } from "react";
import { useI18n } from "../i18n";
import type { Project } from "../types";
import type { ViewMode } from "./Scene3D";

type HeaderBarProps = {
  project: Project;
  onImportFloorPlan: (file: File) => void;
  onImportProject: (file: File) => void;
  onExportProject: () => void;
  onToggleOutput: () => void;
  outputOpen: boolean;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  onShowIntro: () => void;
};

export const HeaderBar = ({
  project,
  onImportFloorPlan,
  onImportProject,
  onExportProject,
  onToggleOutput,
  outputOpen,
  viewMode,
  onViewModeChange,
  onShowIntro
}: HeaderBarProps) => {
  const { language, setLanguage, t } = useI18n();
  const planInputRef = useRef<HTMLInputElement | null>(null);
  const projectInputRef = useRef<HTMLInputElement | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="app-header">
      <div className="brand">
        <div className="brand-mark" aria-hidden="true" />
        <div>
          <p className="eyebrow">{t("Local Web Simulator")}</p>
          <h1>{project.name}</h1>
        </div>
      </div>

      <button
        type="button"
        className={mobileMenuOpen ? "mobile-menu-button is-open" : "mobile-menu-button"}
        aria-label={t("メニュー")}
        title={t("メニュー")}
        onClick={() => setMobileMenuOpen((open) => !open)}
      >
        ☰
      </button>

      <nav className={mobileMenuOpen ? "header-actions is-open" : "header-actions"} aria-label={t("プロジェクト操作")}>
        <input
          ref={planInputRef}
          type="file"
          accept=".png,.jpg,.jpeg,.pdf,image/png,image/jpeg,application/pdf"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onImportFloorPlan(file);
            event.currentTarget.value = "";
          }}
        />
        <input
          ref={projectInputRef}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onImportProject(file);
            event.currentTarget.value = "";
          }}
        />
        <button onClick={() => { planInputRef.current?.click(); setMobileMenuOpen(false); }}>{t("間取り図の読込")}</button>
        <button onClick={() => { onExportProject(); setMobileMenuOpen(false); }}>{t("プロジェクト保存")}</button>
        <button onClick={() => { projectInputRef.current?.click(); setMobileMenuOpen(false); }}>{t("プロジェクト読込")}</button>
        <div className="view-mode-toggle" role="group" aria-label={t("表示モード")}>
          <button
            className={viewMode === "raster" ? "view-mode-btn is-active" : "view-mode-btn"}
            onClick={() => { onViewModeChange("raster"); setMobileMenuOpen(false); }}
            title={language === "en" ? "Edit (fast raster)" : "編集（高速ラスター）"}
          >
            {t("編集")}
          </button>
          <button
            className={viewMode === "realistic" ? "view-mode-btn is-active" : "view-mode-btn"}
            onClick={() => { onViewModeChange("realistic"); setMobileMenuOpen(false); }}
            title={language === "en" ? "Realistic (live path tracing)" : "リアル（常駐パストレ）"}
          >
            {t("リアル")}
          </button>
        </div>
        {/* レンダリング(パストレ)は普段使わないため出力ポップオーバーに集約（要望: PathTracer邪魔）。 */}
        <button className={outputOpen ? "primary-action is-active" : "primary-action"} onClick={() => { onToggleOutput(); setMobileMenuOpen(false); }}>
          {t("出力 / レンダリング")}
        </button>
        <div className="language-toggle" role="group" aria-label={t("言語")}>
          <button
            type="button"
            className={language === "ja" ? "is-active" : ""}
            onClick={() => setLanguage("ja")}
            aria-pressed={language === "ja"}
          >
            JA
          </button>
          <button
            type="button"
            className={language === "en" ? "is-active" : ""}
            onClick={() => setLanguage("en")}
            aria-pressed={language === "en"}
          >
            EN
          </button>
        </div>
        <button className="intro-help-btn" onClick={() => { onShowIntro(); setMobileMenuOpen(false); }} title={t("使い方を見る")} aria-label={t("使い方を見る")}>
          ?
        </button>
      </nav>
    </header>
  );
};
