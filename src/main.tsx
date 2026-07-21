import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { LanguageProvider } from "./i18n";
import { useProjectStore } from "./store/projectStore";
import "./styles.css";

// デモ撮影スクリプトからカメラ・照明を直接駆動するためのdev限定ハンドル。
if (import.meta.env.DEV) {
  (window as unknown as { useProjectStore: typeof useProjectStore }).useProjectStore = useProjectStore;
}

createRoot(document.getElementById("app") as HTMLElement).render(
  <React.StrictMode>
    <LanguageProvider>
      <App />
    </LanguageProvider>
  </React.StrictMode>
);
