import { useRef } from "react";
import type { Project } from "../types";

type HeaderBarProps = {
  project: Project;
  onImportFloorPlan: (file: File) => void;
  onImportProject: (file: File) => void;
  onExportProject: () => void;
  onToggleOutput: () => void;
  outputOpen: boolean;
};

export const HeaderBar = ({
  project,
  onImportFloorPlan,
  onImportProject,
  onExportProject,
  onToggleOutput,
  outputOpen
}: HeaderBarProps) => {
  const planInputRef = useRef<HTMLInputElement | null>(null);
  const projectInputRef = useRef<HTMLInputElement | null>(null);

  return (
    <header className="app-header">
      <div className="brand">
        <div className="brand-mark" aria-hidden="true" />
        <div>
          <p className="eyebrow">Local Web Simulator</p>
          <h1>{project.name}</h1>
        </div>
      </div>

      <nav className="header-actions" aria-label="プロジェクト操作">
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
        <button onClick={() => planInputRef.current?.click()}>間取り図の読込</button>
        <button onClick={onExportProject}>プロジェクト保存</button>
        <button onClick={() => projectInputRef.current?.click()}>プロジェクト読込</button>
        {/* レンダリング(パストレ)は普段使わないため出力ポップオーバーに集約（要望: PathTracer邪魔）。 */}
        <button className={outputOpen ? "primary-action is-active" : "primary-action"} onClick={onToggleOutput}>
          出力 / レンダリング
        </button>
      </nav>
    </header>
  );
};
