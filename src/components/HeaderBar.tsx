import { useRef, useState } from "react";
import { useI18n } from "../i18n";
import type { Project } from "../types";

type HeaderBarProps = {
  project: Project;
  onImportFloorPlan: (file: File) => void;
  onImportProject: (file: File) => void;
  onExportProject: () => void;
  onShowIntro: () => void;
};

export const HeaderBar = ({
  project,
  onImportFloorPlan,
  onImportProject,
  onExportProject,
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
          <h1>{t(project.name)}</h1>
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
        <div className="header-action-group" aria-label={t("プロジェクト操作")}>
          <div>
            <button onClick={() => { planInputRef.current?.click(); setMobileMenuOpen(false); }}>{t("間取り図の読込")}</button>
            <button onClick={() => { projectInputRef.current?.click(); setMobileMenuOpen(false); }}>{t("プロジェクト読込")}</button>
            <button onClick={() => { onExportProject(); setMobileMenuOpen(false); }}>{t("プロジェクト保存")}</button>
          </div>
        </div>
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
        <div className="header-action-group" aria-label={t("使い方を見る")}>
          <button className="intro-help-btn" onClick={() => { onShowIntro(); setMobileMenuOpen(false); }} title={t("使い方を見る")} aria-label={t("使い方を見る")}>
            ?
          </button>
        </div>
      </nav>
    </header>
  );
};
