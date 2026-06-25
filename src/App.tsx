import { useCallback, useEffect, useRef, useState } from "react";
import { HeaderBar } from "./components/HeaderBar";
import { Inspector } from "./components/Inspector";
import { Plan2D } from "./components/Plan2D";
import { Scene3D, type LiveTraceStatus, type ViewMode } from "./components/Scene3D";
import { SceneStrip } from "./components/SceneStrip";
import { renderPathTracedImage, sampleCountByMode, type PathTraceMode, type RenderDebugMode } from "./rendering/pathTracer";
import type { RenderContext } from "./rendering/renderContext";
import { projectSchema } from "./schema/projectSchema";
import { loadProjectFromIndexedDb, saveProjectToIndexedDb } from "./storage/projectStorage";
import { useProjectStore } from "./store/projectStore";
import type { CompareShot, Project } from "./types";
import { floorPlanFileToDataUrl } from "./utils/floorplanImport";
import { DEFAULT_DAYLIGHT } from "./utils/sun";
import { cloneProject } from "./utils/units";
import { newCeilingZone, newDoor, newDownlight, newFurnitureFromPreset, newStair, newVoid, newWallSpot, newWindow, newWindowFromPreset } from "./data/objectFactory";
import { getFurniturePreset } from "./data/furnitureCatalog";
import { getWindowPreset } from "./data/windowCatalog";
import { EditToolbar, type EditMode } from "./components/EditToolbar";

// 小数hourをHH:MM文字列に変換する（例: 14.5 → "14:30"）。
const formatHour = (hour: number): string => {
  const h = Math.floor(hour);
  const m = Math.round((hour - h) * 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

const readTextFile = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });

const downloadText = (fileName: string, text: string) => {
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
};

const downloadDataUrl = (fileName: string, dataUrl: string) => {
  const anchor = document.createElement("a");
  anchor.href = dataUrl;
  anchor.download = fileName;
  anchor.click();
};

type RenderProgressState = {
  status: "idle" | "running" | "complete" | "stopped" | "error";
  samples: number;
  targetSamples: number;
  elapsedMs: number;
  message: string;
};

export const App = () => {
  const project = useProjectStore((state) => state.project);
  const selection = useProjectStore((state) => state.selection);
  const compareShots = useProjectStore((state) => state.compareShots);
  const select = useProjectStore((state) => state.select);
  const setProject = useProjectStore((state) => state.setProject);
  const setCompareShots = useProjectStore((state) => state.setCompareShots);
  const setBackgroundPlan = useProjectStore((state) => state.setBackgroundPlan);
  const clearGeometry = useProjectStore((state) => state.clearGeometry);
  const addCompareShot = useProjectStore((state) => state.addCompareShot);
  const undo = useProjectStore((state) => state.undo);
  const redo = useProjectStore((state) => state.redo);
  const duplicateActiveScene = useProjectStore((state) => state.duplicateActiveScene);
  const renameActiveScene = useProjectStore((state) => state.renameActiveScene);
  const saveCameraView = useProjectStore((state) => state.saveCameraView);
  const addLight = useProjectStore((state) => state.addLight);
  const addFurniture = useProjectStore((state) => state.addFurniture);
  const addWindow = useProjectStore((state) => state.addWindow);
  const addVoid = useProjectStore((state) => state.addVoid);
  const addCeilingZone = useProjectStore((state) => state.addCeilingZone);
  const deleteSelection = useProjectStore((state) => state.deleteSelection);
  const setDaylight = useProjectStore((state) => state.setDaylight);
  const [canvasElement, setCanvasElement] = useState<HTMLCanvasElement | null>(null);
  const [renderContext, setRenderContext] = useState<RenderContext | null>(null);
  const [notice, setNotice] = useState("IndexedDBに自動保存します。");
  const [compareOpen, setCompareOpen] = useState(false);
  const [pathTraceMode, setPathTraceMode] = useState<PathTraceMode>("standard");
  const [viewMode, setViewMode] = useState<ViewMode>("raster");
  const [mode, setMode] = useState<EditMode>("select");
  const [pendingAdd, setPendingAdd] = useState<string | null>(null);
  const [focusViewport, setFocusViewport] = useState(false);
  const [focusPlan, setFocusPlan] = useState(false);
  const [outputOpen, setOutputOpen] = useState(false);
  const [daylightOpen, setDaylightOpen] = useState(false);
  const [liveTrace, setLiveTrace] = useState<LiveTraceStatus>({ phase: "off", samples: 0 });
  const [debugMode, setDebugMode] = useState<RenderDebugMode>("beauty");
  const [lastPathTracedImage, setLastPathTracedImage] = useState<string | null>(null);
  const [renderProgress, setRenderProgress] = useState<RenderProgressState>({
    status: "idle",
    samples: 0,
    targetSamples: sampleCountByMode.standard,
    elapsedMs: 0,
    message: "待機中"
  });
  const loadedOnce = useRef(false);
  const renderAbortRef = useRef<AbortController | null>(null);
  const renderingRef = useRef(false);

  useEffect(() => {
    if (loadedOnce.current) return;
    loadedOnce.current = true;
    loadProjectFromIndexedDb()
      .then((savedProject) => {
        if (savedProject) {
          const parsed = projectSchema.parse(savedProject) as Project & { compareShots?: CompareShot[] };
          setProject(parsed);
          if (Array.isArray(parsed.compareShots)) {
            setCompareShots(parsed.compareShots);
          }
          setNotice("前回のプロジェクトをIndexedDBから復元しました。");
        }
      })
      .catch(() => {
        setNotice("自動保存データを読めませんでした。デモプロジェクトで起動しています。");
      });
  }, [setCompareShots, setProject]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      saveProjectToIndexedDb(project).catch(() => {
        setNotice("IndexedDBへの自動保存に失敗しました。JSON保存を使ってください。");
      });
    }, 500);

    return () => window.clearTimeout(handle);
  }, [project]);

  useEffect(() => {
    setLastPathTracedImage(null);
  }, [project]);

  // パネル開閉で3Dコンテナ幅が変わるため、R3Fに再計測させる。
  useEffect(() => {
    const handle = window.setTimeout(() => window.dispatchEvent(new Event("resize")), 80);
    return () => window.clearTimeout(handle);
  }, [focusViewport, focusPlan]);

  useEffect(() => {
    if (!renderingRef.current) return;
    renderAbortRef.current?.abort();
    setLastPathTracedImage(null);
    setRenderProgress((current) => ({
      ...current,
      status: "stopped",
      message: "シーン変更によりレンダリングをリセットしました。"
    }));
    setNotice("カメラ、家具、照明、材質が変更されたためレンダリングを停止しました。");
  }, [project]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z" && event.shiftKey) {
        event.preventDefault();
        redo();
      } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        undo();
      } else if (event.key === "Escape") {
        select(null);
      } else if (event.key === "Delete" || event.key === "Backspace") {
        const target = event.target as HTMLElement | null;
        const tag = target?.tagName;
        // 入力欄の編集中は削除キーを通常動作に任せる。
        if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) return;
        const current = useProjectStore.getState().selection;
        if (current) {
          event.preventDefault();
          deleteSelection(current);
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [deleteSelection, redo, select, undo]);

  const activeScene = project.lightingScenes.find((scene) => scene.id === project.activeSceneId);
  const activeView = project.cameraViews.find((view) => view.id === project.activeCameraViewId);

  const handleImportFloorPlan = async (file: File) => {
    try {
      const result = await floorPlanFileToDataUrl(file);
      setBackgroundPlan({
        dataUrl: result.dataUrl,
        kind: result.kind,
        fileName: file.name
      });
      // 間取り図に沿って一から壁を引けるよう、既存ジオメトリの一括削除を促す。
      // キャンセル時は背景だけ読み込み、既存オブジェクトは残す（誤消し防止）。
      const cleared = window.confirm(
        "間取り図を読み込みました。既存の壁・窓・家具・照明・吹き抜けを削除して、まっさらな状態にしますか？\n（キャンセルすると既存のまま背景だけ読み込みます。Cmd+Zで元に戻せます）"
      );
      if (cleared) clearGeometry();
      setNotice(
        cleared
          ? `${file.name} を背景に読み込み、既存オブジェクトを削除しました。縮尺合わせ後に壁を引けます。`
          : `${file.name} を平面図背景として読み込みました。`
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "間取り図を読み込めませんでした。");
    }
  };

  const handleImportProject = async (file: File) => {
    try {
      const text = await readTextFile(file);
      const parsed = projectSchema.parse(JSON.parse(text)) as Project & { compareShots?: CompareShot[] };
      setProject(parsed);
      setCompareShots(Array.isArray(parsed.compareShots) ? parsed.compareShots : []);
      setNotice(`${file.name} を読み込みました。`);
    } catch {
      setNotice("プロジェクトJSONの形式が不正です。読み込みを中止しました。");
    }
  };

  const exportProject = () => {
    downloadText(
      `ldk-lighting-lab-${new Date().toISOString().slice(0, 10)}.json`,
      JSON.stringify({ ...project, compareShots }, null, 2)
    );
  };

  const exportPng = useCallback(() => {
    if (lastPathTracedImage) {
      downloadDataUrl("ldk-lighting-lab-pathtraced.png", lastPathTracedImage);
      return;
    }
    if (!canvasElement) {
      setNotice("3Dキャンバスがまだ準備できていません。");
      return;
    }
    downloadDataUrl("ldk-lighting-lab-preview.png", canvasElement.toDataURL("image/png"));
  }, [canvasElement, lastPathTracedImage]);

  const captureCompare = useCallback(() => {
    if (renderingRef.current) return;
    if (!renderContext || !activeScene || !activeView) {
      setNotice("レンダリングを開始できませんでした。3D表示を確認してください。");
      return;
    }

    const abortController = new AbortController();
    renderAbortRef.current = abortController;
    renderingRef.current = true;
    setLastPathTracedImage(null);
    setRenderProgress({
      status: "running",
      samples: 0,
      targetSamples: sampleCountByMode[pathTraceMode],
      elapsedMs: 0,
      message: "BVH生成とpath tracingを開始しています。"
    });
    setNotice("three-gpu-pathtracerで最終レンダリングを開始しました。");

    void renderPathTracedImage({
      context: renderContext,
      project,
      activeScene,
      mode: pathTraceMode,
      debugMode,
      maxWidth: activeView.resolutionWidth,
      signal: abortController.signal,
      onProgress: (progress) => {
        const buildPercent =
          typeof progress.buildProgress === "number"
            ? ` ${Math.round(progress.buildProgress * 100)}%`
            : "";
        const message =
          progress.phase === "bvh"
            ? `BVH生成中${buildPercent}`
            : progress.phase === "sampling"
              ? "path tracing中"
              : progress.phase === "complete"
                ? "レンダリング完了"
                : "準備中";
        setRenderProgress({
          status: "running",
          samples: progress.samples,
          targetSamples: progress.targetSamples,
          elapsedMs: progress.elapsedMs,
          message
        });
      }
    })
      .then((result) => {
        const shot: CompareShot = {
          id: `shot-${Date.now()}`,
          name: `案 ${compareShots.length + 1}`,
          dataUrl: result.dataUrl,
          createdAt: new Date().toISOString(),
          cameraViewName: activeView.name,
          lightingSceneName: activeScene.name,
          renderer: "pathtraced",
          samples: result.samples,
          resolution: { width: result.width, height: result.height }
        };
        setLastPathTracedImage(result.dataUrl);
        addCompareShot(shot);
        setCompareOpen(true);
        setRenderProgress({
          status: "complete",
          samples: result.samples,
          targetSamples: result.samples,
          elapsedMs: result.elapsedMs,
          message: "完了"
        });
        setNotice(`Path traced ${result.samples} samples の比較画像を保存しました。`);
      })
      .catch((error: unknown) => {
        const aborted = error instanceof DOMException && error.name === "AbortError";
        setRenderProgress((current) => ({
          ...current,
          status: aborted ? "stopped" : "error",
          message: aborted ? "停止しました" : error instanceof Error ? error.message : "レンダリングに失敗しました。"
        }));
        if (!aborted) {
          setNotice(error instanceof Error ? error.message : "レンダリングに失敗しました。");
        }
      })
      .finally(() => {
        renderAbortRef.current = null;
        renderingRef.current = false;
      });
  }, [activeScene, activeView, addCompareShot, compareShots.length, debugMode, pathTraceMode, project, renderContext]);

  const stopRender = useCallback(() => {
    renderAbortRef.current?.abort();
  }, []);

  const handleLiveTraceStatus = useCallback((status: LiveTraceStatus) => {
    setLiveTrace(status);
  }, []);

  // 配置情報。床に置く物は at(x,z)、壁に付く物(窓/扉)は wallId+centerRatio を使う。
  type PlaceOpts = { at?: { x: number; z: number }; wallId?: string; centerRatio?: number };

  const handleAddObject = useCallback(
    (kind: string, opts: PlaceOpts = {}) => {
      const { at, wallId, centerRatio } = opts;
      // 家具カタログ: kind = "furniture:<presetId>"。
      if (kind.startsWith("furniture:")) {
        const preset = getFurniturePreset(kind.slice("furniture:".length));
        if (preset) addFurniture(newFurnitureFromPreset(preset, at));
        return;
      }
      // 窓カタログ: kind = "window:<presetId>"。クリックした壁に設置。
      if (kind.startsWith("window:")) {
        const preset = getWindowPreset(kind.slice("window:".length));
        if (preset) {
          addWindow(
            newWindowFromPreset(preset, project, { wallId, centerRatio }),
            preset.hasGlass ? "window" : "opening"
          );
        }
        return;
      }
      switch (kind) {
        case "downlight":
          addLight(newDownlight(project, at));
          break;
        case "wallspot":
          addLight(newWallSpot(project, at));
          break;
        case "stair":
          addFurniture(newStair(project, at));
          break;
        case "window":
          addWindow(newWindow(project, { wallId, centerRatio }), "window");
          break;
        case "door":
          addWindow(newDoor(project, { wallId, centerRatio }), "opening");
          break;
        case "void":
          addVoid(newVoid(at));
          break;
        case "ceilingZone":
          addCeilingZone(newCeilingZone(at));
          break;
        default:
          return;
      }
    },
    [addCeilingZone, addFurniture, addLight, addVoid, addWindow, project]
  );

  // 「＋追加」で種別を選んだら配置待ちにする。実際の生成はクリック位置確定時。
  const handleStartAdd = useCallback((kind: string) => {
    setPendingAdd(kind);
    setMode("select");
    setNotice(
      kind === "door" || kind.startsWith("window")
        ? "設置したい壁を2Dでクリックしてください。"
        : "配置したい位置を2Dでクリックしてください。"
    );
  }, []);

  // 床に置く物の配置（クリック位置）。
  const handlePlaceObject = useCallback(
    (at: { x: number; z: number }) => {
      if (!pendingAdd) return;
      handleAddObject(pendingAdd, { at });
      setPendingAdd(null);
      setMode("move");
      setNotice("配置しました。ドラッグで微調整できます。");
    },
    [pendingAdd, handleAddObject]
  );

  // 壁に付く物(窓/扉)の配置。Plan2D がクリック点を最寄り壁へ射影して渡す。
  const handlePlaceOnWall = useCallback(
    (wallId: string, centerRatio: number) => {
      if (!pendingAdd) return;
      handleAddObject(pendingAdd, { wallId, centerRatio });
      setPendingAdd(null);
      setMode("select");
      setNotice("壁に設置しました。2Dで壁上をドラッグして位置を調整できます。");
    },
    [pendingAdd, handleAddObject]
  );

  const saveCurrentCamera = useCallback(() => {
    if (!renderContext || !activeView) {
      setNotice("保存する3Dカメラがまだ準備できていません。");
      return;
    }
    const name = window.prompt("カメラビュー名", `保存ビュー ${project.cameraViews.length + 1}`);
    if (!name?.trim()) return;
    const camera = renderContext.camera as typeof renderContext.camera & { fov?: number };
    saveCameraView({
      id: `view-${Date.now()}`,
      name: name.trim(),
      position: {
        x: camera.position.x,
        y: camera.position.y,
        z: camera.position.z
      },
      target: activeView.target,
      fov: camera.fov ?? activeView.fov,
      exposure: activeView.exposure,
      resolutionWidth: activeView.resolutionWidth
    });
    setNotice(`${name.trim()} をカメラビューとして保存しました。`);
  }, [activeView, project.cameraViews.length, renderContext, saveCameraView]);

  const renameCurrentScene = useCallback(() => {
    const name = window.prompt("照明シーン名", activeScene?.name ?? "照明シーン");
    if (!name?.trim()) return;
    renameActiveScene(name.trim());
  }, [activeScene?.name, renameActiveScene]);

  const elapsedSeconds = (renderProgress.elapsedMs / 1000).toFixed(1);
  const renderPercent = renderProgress.targetSamples
    ? Math.min(100, Math.round((renderProgress.samples / renderProgress.targetSamples) * 100))
    : 0;
  const estimatedRemainingSeconds =
    renderProgress.status === "running" && renderProgress.samples > 1
      ? Math.max(
          0,
          ((renderProgress.elapsedMs / renderProgress.samples) *
            (renderProgress.targetSamples - renderProgress.samples)) /
            1000
        ).toFixed(1)
      : "-";

  return (
    <div className="app-shell">
      <HeaderBar
        project={project}
        onImportFloorPlan={handleImportFloorPlan}
        onImportProject={handleImportProject}
        onExportProject={exportProject}
        onToggleOutput={() => setOutputOpen((current) => !current)}
        outputOpen={outputOpen}
      />
      <main className={focusViewport ? "workspace is-focus-3d" : focusPlan ? "workspace is-focus-2d" : "workspace"}>
        <Plan2D
          project={project}
          selection={selection}
          onSelect={select}
          mode={mode}
          onModeChange={(next) => {
            setMode(next);
            setPendingAdd(null);
          }}
          onAdd={handleStartAdd}
          pendingAdd={pendingAdd}
          onPlaceObject={handlePlaceObject}
          onPlaceOnWall={handlePlaceOnWall}
          focusPlan={focusPlan}
          onToggleFocusPlan={() => {
            setFocusPlan((current) => !current);
            setFocusViewport(false);
          }}
        />
        <section className="viewport-panel" aria-label="3D表示">
          <div className="viewport-toolbar">
            <div className="viewport-title">
              <div>
                <p className="eyebrow">3D Preview</p>
                <h2>{activeView?.name ?? "自由視点"} / {activeScene?.name ?? "照明シーン"}</h2>
              </div>
              <button
                type="button"
                className="focus-toggle"
                title={focusViewport ? "通常表示に戻す" : "3Dを最大化"}
                aria-label={focusViewport ? "通常表示に戻す" : "3Dを最大化"}
                onClick={() => {
                  setFocusViewport((current) => !current);
                  setFocusPlan(false);
                }}
              >
                {focusViewport ? "🗗" : "⤢"}
              </button>
            </div>

            <EditToolbar
              mode={mode}
              onModeChange={(next) => {
                setMode(next);
                setPendingAdd(null);
              }}
              onAdd={handleStartAdd}
              pendingAdd={pendingAdd}
            />
            <span className="toolbar-hint">
              {pendingAdd === "door" || pendingAdd?.startsWith("window")
                ? "壁をクリックして設置"
                : pendingAdd
                  ? "クリックした位置に配置"
                  : mode === "wall"
                    ? "クリックで壁の頂点、Enter/ダブルクリックで終了"
                    : mode === "move"
                      ? "ドラッグで移動"
                      : "クリックで選択・ドラッグで移動"}
            </span>

            <div className="render-status">
              <label>
                表示モード
                <select value={viewMode} onChange={(event) => setViewMode(event.target.value as ViewMode)}>
                  <option value="raster">編集（高速ラスター）</option>
                  <option value="realistic">リアル（常駐パストレ）</option>
                </select>
              </label>
              {viewMode === "realistic" ? (
                <strong>
                  {liveTrace.phase === "building" ? "BVH生成中…" : `間接光リアル描画 / ${liveTrace.samples} samples 収束中`}
                </strong>
              ) : (
                <strong>編集プレビュー / 露出 {activeView?.exposure.toFixed(2)}</strong>
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
                    ☀ 日光{dl.enabled ? `（${formatHour(dl.hour)}）` : "（OFF）"}
                  </button>
                  {daylightOpen && (
                    <div className="daylight-popover">
                      <label className="daylight-row">
                        <input
                          type="checkbox"
                          checked={dl.enabled}
                          onChange={(event) => setDaylight({ enabled: event.target.checked })}
                        />
                        日光を有効にする
                      </label>
                      <label className="daylight-row">
                        時刻
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
                          月
                          <input type="number" min={1} max={12} value={dl.month} disabled={!dl.enabled}
                            onChange={(event) => setDaylight({ month: Number(event.target.value) })} />
                        </label>
                        <label>
                          日
                          <input type="number" min={1} max={31} value={dl.day} disabled={!dl.enabled}
                            onChange={(event) => setDaylight({ day: Number(event.target.value) })} />
                        </label>
                        <label>
                          北方位°
                          <input type="number" min={-180} max={180} value={dl.northOffsetDeg} disabled={!dl.enabled}
                            onChange={(event) => setDaylight({ northOffsetDeg: Number(event.target.value) })} />
                        </label>
                        <label>
                          緯度°
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
            <div className="output-popover" aria-label="出力 / レンダリング">
              <div className="output-row">
                <label>
                  品質
                  <select
                    value={pathTraceMode}
                    disabled={renderProgress.status === "running"}
                    onChange={(event) => setPathTraceMode(event.target.value as PathTraceMode)}
                  >
                    <option value="standard">標準 256 samples</option>
                    <option value="high">高品質 512 samples</option>
                    <option value="ultra">最高 1024 samples</option>
                  </select>
                </label>
                <label>
                  診断
                  <select
                    value={debugMode}
                    disabled={renderProgress.status === "running"}
                    onChange={(event) => setDebugMode(event.target.value as RenderDebugMode)}
                  >
                    <option value="beauty">通常</option>
                    <option value="material">マテリアル</option>
                    <option value="normals">法線</option>
                    <option value="frontback">表裏</option>
                  </select>
                </label>
              </div>
              <div className="output-row">
                <button
                  className="primary-action"
                  onClick={renderProgress.status === "running" ? stopRender : captureCompare}
                >
                  {renderProgress.status === "running" ? "レンダリング停止" : "レンダリング開始"}
                </button>
                <button onClick={exportPng}>PNG書き出し</button>
              </div>
              <div className="output-progress">
                <strong>{renderProgress.samples}/{renderProgress.targetSamples} samples</strong>
                <span className="render-message">{renderProgress.message}</span>
                <span>{elapsedSeconds}s / 残り {estimatedRemainingSeconds}s</span>
                <progress value={renderPercent} max={100} />
              </div>
            </div>
          )}

          <div className="scene-stage">
            <Scene3D
              project={project}
              selection={selection}
              onSelect={select}
              onCanvasReady={setCanvasElement}
              onRenderContextReady={setRenderContext}
              debugMode={debugMode}
              viewMode={viewMode}
              mode={mode === "wall" ? "select" : mode}
              onLiveTraceStatus={handleLiveTraceStatus}
              pendingAdd={pendingAdd}
              onPlaceObject={handlePlaceObject}
              onPlaceOnWall={handlePlaceOnWall}
            />
            {lastPathTracedImage && (
              <div className="pathtrace-result" aria-label="Path traced result">
                <div>Path traced result / {pathTraceMode} samples</div>
                <img src={lastPathTracedImage} alt="Path traced render result" />
              </div>
            )}
          </div>
          <SceneStrip
            project={project}
            compareShots={compareShots}
            compareOpen={compareOpen}
            onDuplicateScene={duplicateActiveScene}
            onRenameScene={renameCurrentScene}
            onSaveCameraView={saveCurrentCamera}
          />
        </section>
        <Inspector project={project} selection={selection} />
      </main>
      <div className="notice" role="status">{notice}</div>
    </div>
  );
};
