import { useRef } from "react";
import type { Project } from "../types";
import { useProjectStore } from "../store/projectStore";

type HeaderBarProps = {
  project: Project;
  canUndo: boolean;
  canRedo: boolean;
  onImportFloorPlan: (file: File) => void;
  onImportProject: (file: File) => void;
  onExportProject: () => void;
  onExportPng: () => void;
  onCaptureCompare: () => void;
  onStopRender: () => void;
  onOpenCompare: () => void;
  onOpenCalibrationRoom: () => void;
  onResetDemo: () => void;
  isRendering: boolean;
  focusViewport: boolean;
  onToggleFocusViewport: () => void;
};

export const HeaderBar = ({
  project,
  canUndo,
  canRedo,
  onImportFloorPlan,
  onImportProject,
  onExportProject,
  onExportPng,
  onCaptureCompare,
  onStopRender,
  onOpenCompare,
  onOpenCalibrationRoom,
  onResetDemo,
  isRendering,
  focusViewport,
  onToggleFocusViewport
}: HeaderBarProps) => {
  const planInputRef = useRef<HTMLInputElement | null>(null);
  const projectInputRef = useRef<HTMLInputElement | null>(null);
  const undo = useProjectStore((state) => state.undo);
  const redo = useProjectStore((state) => state.redo);

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
        <button onClick={undo} disabled={!canUndo} title="Cmd+Z">
          元に戻す
        </button>
        <button onClick={redo} disabled={!canRedo} title="Cmd+Shift+Z">
          やり直す
        </button>
        <button className="primary-action" onClick={isRendering ? onStopRender : onCaptureCompare}>
          {isRendering ? "レンダリング停止" : "レンダリング開始"}
        </button>
        <button onClick={onExportPng}>PNG書き出し</button>
        <button className={focusViewport ? "is-active" : undefined} onClick={onToggleFocusViewport}>
          {focusViewport ? "パネル表示" : "3D集中表示"}
        </button>
        <button onClick={onOpenCompare}>比較画面を開く</button>
        <button onClick={onOpenCalibrationRoom}>照明校正室</button>
        <button onClick={onResetDemo}>デモに戻す</button>
      </nav>
    </header>
  );
};
