import { useEffect, useState } from "react";
import { HeaderBar } from "./components/HeaderBar";
import { Inspector } from "./components/Inspector";
import { Plan2D } from "./components/Plan2D";
import { Scene3D } from "./components/Scene3D";
import type { PathTraceMode } from "./rendering/pathTracer";
import { projectSchema } from "./schema/projectSchema";
import { useProjectStore } from "./store/projectStore";
import type { CompareShot, FloorPlanBackground, Project, Selection } from "./types";
import { floorPlanFileToDataUrl } from "./utils/floorplanImport";
import { DEFAULT_DAYLIGHT } from "./utils/sun";
import { EditToolbar } from "./components/EditToolbar";
import { ShortcutGuide } from "./components/ShortcutGuide";
import { IntroGuide } from "./components/IntroGuide";
import { FeedbackForm } from "./components/FeedbackForm";
import { isWallLightAddKind } from "./data/fixtureAddKinds";
import { downloadText, formatHour, migrateLoadedProject, readTextFile } from "./app/appUtils";
import { useProjectPersistence } from "./app/hooks/useProjectPersistence";
import { useKeyboardShortcuts } from "./app/hooks/useKeyboardShortcuts";
import { useEditModeControls } from "./app/hooks/useEditModeControls";
import { useAddObjectHandlers } from "./app/hooks/useAddObjectHandlers";
import { useRenderPipeline } from "./app/hooks/useRenderPipeline";
import { useI18n } from "./i18n";

export const App = () => {
  const { language, t } = useI18n();
  const project = useProjectStore((state) => state.project);
  const selection = useProjectStore((state) => state.selection);
  const compareShots = useProjectStore((state) => state.compareShots);
  const select = useProjectStore((state) => state.select);
  const setProject = useProjectStore((state) => state.setProject);
  const setCompareShots = useProjectStore((state) => state.setCompareShots);
  const setBackgroundPlan = useProjectStore((state) => state.setBackgroundPlan);
  const clearActiveFloorGeometry = useProjectStore((state) => state.clearActiveFloorGeometry);
  const addCompareShot = useProjectStore((state) => state.addCompareShot);
  const undo = useProjectStore((state) => state.undo);
  const redo = useProjectStore((state) => state.redo);
  const addLight = useProjectStore((state) => state.addLight);
  const addFurniture = useProjectStore((state) => state.addFurniture);
  const addWindow = useProjectStore((state) => state.addWindow);
  const addVoid = useProjectStore((state) => state.addVoid);
  const addCeilingZone = useProjectStore((state) => state.addCeilingZone);
  const addFloorZone = useProjectStore((state) => state.addFloorZone);
  const deleteSelection = useProjectStore((state) => state.deleteSelection);
  const copySelection = useProjectStore((state) => state.copySelection);
  const pasteSelection = useProjectStore((state) => state.pasteSelection);
  const setDaylight = useProjectStore((state) => state.setDaylight);
  const setCeilingHeight = useProjectStore((state) => state.setCeilingHeight);
  const setActiveFloor = useProjectStore((state) => state.setActiveFloor);
  const [notice, setNotice] = useState(() => t("IndexedDBに自動保存します。"));
  const [outputOpen, setOutputOpen] = useState(false);
  const [daylightOpen, setDaylightOpen] = useState(false);
  const [showIntro, setShowIntro] = useState(false);

  useEffect(() => {
    setNotice(t("IndexedDBに自動保存します。"));
  }, [language, t]);

  useProjectPersistence(project, setProject, setCompareShots, setNotice);

  const {
    mode,
    setMode,
    planEditMode,
    pendingAdd,
    setPendingAdd,
    focusViewport,
    setFocusViewport,
    focusPlan,
    setFocusPlan,
    mobileView,
    mobileSettingsOpen,
    setMobileSettingsOpen,
    openMobileView,
    handleSelect,
    handleEditModeChange,
    handlePlanEditModeChange,
    canDeleteSelection,
    handleMobileClear,
    handleMobileDelete
  } = useEditModeControls({ selection, select, deleteSelection, setNotice });

  const {
    canvasElement,
    setCanvasElement,
    renderContext,
    setRenderContext,
    pathTraceMode,
    setPathTraceMode,
    viewMode,
    setViewMode,
    liveTrace,
    debugMode,
    lastPathTracedImage,
    renderProgress,
    exportPng,
    captureCompare,
    stopRender,
    handleLiveTraceStatus,
    renderPercent
  } = useRenderPipeline({ project, compareShots, addCompareShot, setNotice });

  const { handleAddObject, handleStartAdd, handlePlaceObject, handlePlaceOnWall } = useAddObjectHandlers({
    project,
    addLight,
    addFurniture,
    addWindow,
    addVoid,
    addCeilingZone,
    addFloorZone,
    pendingAdd,
    setPendingAdd,
    setMode,
    setNotice
  });

  useKeyboardShortcuts({
    undo,
    redo,
    copySelection,
    pasteSelection,
    select,
    deleteSelection,
    pendingAdd,
    setPendingAdd,
    setNotice,
    planEditMode
  });

  const handleImportFloorPlan = async (file: File) => {
    try {
      const result = await floorPlanFileToDataUrl(file);
      const activeFloor = project.activeFloor ?? 1;
      const floorLabel = activeFloor === 2 ? t("2階") : t("1階");
      const firstFloorPlan = project.backgroundPlan;
      const backgroundPlan: FloorPlanBackground = {
        dataUrl: result.dataUrl,
        kind: result.kind,
        fileName: file.name
      };
      if (activeFloor === 2 && firstFloorPlan?.placement) {
        backgroundPlan.placement = { ...firstFloorPlan.placement };
        backgroundPlan.scale = firstFloorPlan.scale ? { ...firstFloorPlan.scale } : undefined;
        backgroundPlan.alignmentPending = true;
      }
      setBackgroundPlan(backgroundPlan);
      const ceilingInput = window.prompt(
        t("天井高をmmで入力してください。"),
        String(Math.round(project.room.ceilingHeightM * 1000))
      );
      const ceilingMm = ceilingInput === null ? NaN : Number(ceilingInput);
      if (Number.isFinite(ceilingMm) && ceilingMm >= 1800) {
        setCeilingHeight(ceilingMm / 1000);
      }
      // 間取り図に沿って一から壁を引けるよう、既存ジオメトリの一括削除を促す。
      // キャンセル時は背景だけ読み込み、既存オブジェクトは残す（誤消し防止）。
      const cleared = window.confirm(
        t("{floor}の間取り図を読み込みました。{floor}の壁・窓・家具・照明・吹き抜けだけを削除して、まっさらな状態にしますか？\n（キャンセルすると既存のまま背景だけ読み込みます。Cmd+Zで元に戻せます）", { floor: floorLabel })
      );
      if (cleared) clearActiveFloorGeometry();
      const alignmentNotice = backgroundPlan.alignmentPending
        ? ` ${t("1階基準で仮合わせしたので、背景合わせで位置を確認してください。")}`
        : "";
      setNotice(
        cleared
          ? t("{fileName} を{floor}背景に読み込み、{floor}の既存オブジェクトを削除しました。{alignmentNotice}", { fileName: file.name, floor: floorLabel, alignmentNotice })
          : t("{fileName} を{floor}の平面図背景として読み込みました。{alignmentNotice}", { fileName: file.name, floor: floorLabel, alignmentNotice })
      );
    } catch (error) {
      setNotice(error instanceof Error ? t(error.message) : t("間取り図を読み込めませんでした。"));
    }
  };

  const handleImportProject = async (file: File) => {
    try {
      const text = await readTextFile(file);
      const parsed = await migrateLoadedProject(
        projectSchema.parse(JSON.parse(text)) as Project & { compareShots?: CompareShot[] }
      );
      setProject(parsed);
      setCompareShots(Array.isArray(parsed.compareShots) ? parsed.compareShots : []);
      setNotice(t("{fileName} を読み込みました。", { fileName: file.name }));
    } catch {
      setNotice(t("プロジェクトJSONの形式が不正です。読み込みを中止しました。"));
    }
  };

  const exportProject = () => {
    downloadText(
      `ldk-lighting-lab-${new Date().toISOString().slice(0, 10)}.json`,
      JSON.stringify({ ...project, compareShots }, null, 2)
    );
  };

  const workspaceClassName = [
    "workspace",
    focusViewport ? "is-focus-3d" : "",
    focusPlan ? "is-focus-2d" : "",
    mobileSettingsOpen ? "mobile-settings-open" : "",
    `mobile-view-${mobileView}`
  ].filter(Boolean).join(" ");

  return (
    <div className="app-shell">
      <div className="top-chrome">
        <HeaderBar
          project={project}
          onImportFloorPlan={handleImportFloorPlan}
          onImportProject={handleImportProject}
          onExportProject={exportProject}
          onToggleOutput={() => setOutputOpen((current) => !current)}
          outputOpen={outputOpen}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          onShowIntro={() => setShowIntro(true)}
        />
        {/* 操作＋追加ツールバー: 2D/3D 両パネル共通の1インスタンス。 */}
        <div className="shared-toolbar">
          <EditToolbar
            mode={mode}
            onModeChange={handleEditModeChange}
            isPlanEditMode={planEditMode}
            onPlanEditModeChange={handlePlanEditModeChange}
            onAdd={handleStartAdd}
            pendingAdd={pendingAdd}
          />
          <span className="toolbar-status-chip" aria-live="polite">
            {pendingAdd === "door" || pendingAdd?.startsWith("window") || isWallLightAddKind(pendingAdd)
              ? t("壁をクリックして設置（Escで終了）")
              : pendingAdd
                ? t("クリックした位置に配置")
                : mode === "wall"
                  ? t("タップ、または押して引いて壁を作成。Enter/ダブルクリックで終了")
                  : planEditMode
                    ? t("壁を選択・ドラッグで移動。Deleteで削除")
                    : t("クリックで選択、選択後ドラッグで移動")}
          </span>
          <div className="floor-toggle" role="group" aria-label={t("階切替")}>
            <button
              className={(project.activeFloor ?? 1) === 1 ? "floor-toggle-btn is-active" : "floor-toggle-btn"}
              onClick={() => setActiveFloor(1)}
              title={t("1階を編集")}
            >
              {t("1階")}
            </button>
            <button
              className={(project.activeFloor ?? 1) === 2 ? "floor-toggle-btn is-active" : "floor-toggle-btn"}
              onClick={() => setActiveFloor(2)}
              title={t("2階を編集（1階の壁を薄く表示して作図補助）")}
            >
              {t("2階")}
            </button>
          </div>
          {(project.activeFloor ?? 1) === 2 && (
            <span className="floor-hint">{t("2階編集中 — 1階の壁を薄く表示して作図補助")}</span>
          )}
          <div className="mobile-edit-actions" aria-label={t("スマホ編集操作")}>
            <button type="button" onClick={undo} aria-label={t("元に戻す")}>↶</button>
            <button type="button" onClick={redo} aria-label={t("やり直す")}>↷</button>
            <button type="button" onClick={handleMobileDelete} disabled={!canDeleteSelection}>{t("削除")}</button>
            <button type="button" onClick={handleMobileClear} disabled={!pendingAdd && !selection}>{t("解除")}</button>
          </div>
        </div>
      </div>
      <main className={workspaceClassName}>
        <Plan2D
          project={project}
          selection={selection}
          onSelect={handleSelect}
          mode={mode}
          onModeChange={handleEditModeChange}
          pendingAdd={pendingAdd}
          onPlaceObject={handlePlaceObject}
          onPlaceOnWall={handlePlaceOnWall}
          canEditWalls={planEditMode}
          focusPlan={focusPlan}
          onToggleFocusPlan={() => {
            setFocusPlan((current) => !current);
            setFocusViewport(false);
          }}
        />
        <section className="viewport-panel" aria-label={t("3D表示")}>
          <div className="viewport-toolbar">
            <div className="viewport-title">
              <div>
                <h2>3D</h2>
              </div>
              <button
                type="button"
                className="focus-toggle"
                title={focusViewport ? t("通常表示に戻す") : t("3Dを最大化")}
                aria-label={focusViewport ? t("通常表示に戻す") : t("3Dを最大化")}
                onClick={() => {
                  setFocusViewport((current) => !current);
                  setFocusPlan(false);
                }}
              >
                {focusViewport ? "🗗" : "⤢"}
              </button>
            </div>

            <div className="render-status">
              {viewMode === "realistic" ? (
                <strong>
                  {liveTrace.phase === "converged"
                    ? t("仕上がり表示")
                    : t("仕上がりを準備中…")}
                </strong>
              ) : (
                <strong>{t("編集モード")}</strong>
              )}
            </div>

            {(() => {
              const dl = project.daylight ?? DEFAULT_DAYLIGHT;
              return (
                <div className="daylight-wrap">
                  <button
                    type="button"
                    className={daylightOpen ? "daylight-toggle is-active" : "daylight-toggle"}
                    onClick={() => setDaylightOpen((open) => !open)}
                  >
                    ☀ {t("日光")}{dl.enabled ? ` (${formatHour(dl.hour)})` : ` (${t("OFF")})`}
                  </button>
                  {daylightOpen && (
                    <div className="daylight-popover">
                      <label className="daylight-row">
                        <input
                          type="checkbox"
                          checked={dl.enabled}
                          onChange={(event) => setDaylight({ enabled: event.target.checked })}
                        />
                        {t("日光を有効にする")}
                      </label>
                      <label className="daylight-row">
                        {t("時刻")}
                        <input
                          type="range"
                          min={0}
                          max={24}
                          step={0.25}
                          value={dl.hour}
                          disabled={!dl.enabled}
                          onChange={(event) => setDaylight({ hour: Number(event.target.value) })}
                        />
                        <strong>{formatHour(dl.hour)}</strong>
                      </label>
                      <div className="daylight-grid">
                        <label>
                          {t("月")}
                          <input type="number" min={1} max={12} value={dl.month} disabled={!dl.enabled}
                            onChange={(event) => setDaylight({ month: Number(event.target.value) })} />
                        </label>
                        <label>
                          {t("日")}
                          <input type="number" min={1} max={31} value={dl.day} disabled={!dl.enabled}
                            onChange={(event) => setDaylight({ day: Number(event.target.value) })} />
                        </label>
                        <label>
                          {t("北方位°")}
                          <input type="number" min={-180} max={180} value={dl.northOffsetDeg} disabled={!dl.enabled}
                            onChange={(event) => setDaylight({ northOffsetDeg: Number(event.target.value) })} />
                        </label>
                        <label>
                          {t("緯度°")}
                          <input type="number" min={-60} max={60} value={dl.latitudeDeg} disabled={!dl.enabled}
                            onChange={(event) => setDaylight({ latitudeDeg: Number(event.target.value) })} />
                        </label>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>

          {outputOpen && (
            <div className="output-popover" aria-label={t("高画質画像")}>
              <div className="output-row">
                <label>
                  {t("品質")}
                  <select
                    value={pathTraceMode}
                    disabled={renderProgress.status === "running"}
                    onChange={(event) => setPathTraceMode(event.target.value as PathTraceMode)}
                  >
                    <option value="standard">{t("標準")}</option>
                    <option value="high">{t("高品質")}</option>
                    <option value="ultra">{t("最高")}</option>
                  </select>
                </label>
              </div>
              <div className="output-row">
                <button
                  className="primary-action"
                  onClick={renderProgress.status === "running" ? stopRender : captureCompare}
                >
                  {renderProgress.status === "running" ? t("作成を中止") : t("画像を作る")}
                </button>
                {lastPathTracedImage && <button onClick={exportPng}>{t("画像を保存")}</button>}
              </div>
              <div className="output-progress">
                {renderProgress.status === "running" ? (
                  <>
                    <strong>{t("画像を作成中 {percent}%", { percent: renderPercent })}</strong>
                    <progress value={renderPercent} max={100} />
                  </>
                ) : lastPathTracedImage ? (
                  <strong>{t("画像ができました")}</strong>
                ) : (
                  <span>{t("画像を作ると、現在の3D表示を高画質で保存できます。")}</span>
                )}
              </div>
            </div>
          )}

          <div className="scene-stage">
            <Scene3D
              project={project}
              selection={selection}
              onSelect={handleSelect}
              onCanvasReady={setCanvasElement}
              onRenderContextReady={setRenderContext}
              debugMode={debugMode}
              viewMode={viewMode}
              mode={mode === "wall" ? "select" : mode}
              onLiveTraceStatus={handleLiveTraceStatus}
              pendingAdd={pendingAdd}
              onPlaceObject={handlePlaceObject}
              onPlaceOnWall={handlePlaceOnWall}
              canEditWalls={planEditMode}
            />
            {lastPathTracedImage && (
              <div className="pathtrace-result" aria-label={t("高画質画像")}>
                <div>{t("仕上がり画像")}</div>
                <img src={lastPathTracedImage} alt={t("仕上がり画像")} />
              </div>
            )}
          </div>
        </section>
        <Inspector
          project={project}
          selection={selection}
          canEditWalls={planEditMode}
          onCloseMobileSettings={() => setMobileSettingsOpen(false)}
        />
      </main>
      <button
        type="button"
        className={mobileSettingsOpen ? "mobile-settings-backdrop is-open" : "mobile-settings-backdrop"}
        aria-label={t("設定を閉じる")}
        onClick={() => setMobileSettingsOpen(false)}
      />
      <div className="mobile-bottom-bar">
        <nav className="mobile-view-tabs" aria-label={t("スマホ表示切替")}>
          <button
            type="button"
            className={mobileView === "plan" ? "is-active" : ""}
            onClick={() => openMobileView("plan")}
          >
            間取り
          </button>
          <button
            type="button"
            className={mobileView === "scene" ? "is-active" : ""}
            onClick={() => openMobileView("scene")}
          >
            3D表示
          </button>
        </nav>
        <button
          type="button"
          className={mobileSettingsOpen ? "mobile-settings-button is-active" : "mobile-settings-button"}
          aria-label={t("設定を開く")}
          title={t("設定")}
          onClick={() => setMobileSettingsOpen((open) => !open)}
        >
          ⚙
        </button>
      </div>
      <div className="notice" role="status">{notice}</div>
      <ShortcutGuide />
      <FeedbackForm />
      <IntroGuide forceOpen={showIntro} onClose={() => setShowIntro(false)} />
    </div>
  );
};
