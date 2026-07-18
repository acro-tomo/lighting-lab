import { useCallback, useEffect, useRef, useState } from "react";
import type { LiveTraceStatus, ViewMode } from "../../components/Scene3D";
import { renderPathTracedImage, sampleCountByMode, type PathTraceMode, type RenderDebugMode } from "../../rendering/pathTracer";
import type { RenderContext } from "../../rendering/renderContext";
import type { CompareShot, Project } from "../../types";
import { downloadDataUrl, withWatermark } from "../appUtils";
import { useI18n } from "../../i18n";

type RenderProgressState = {
  status: "idle" | "running" | "complete" | "stopped" | "error";
  samples: number;
  targetSamples: number;
  elapsedMs: number;
  message: string;
};

// 3Dプレビューのpath tracing実行・進捗・PNG書き出しをまとめて扱う。
export const useRenderPipeline = ({
  project,
  compareShots,
  addCompareShot,
  setNotice
}: {
  project: Project;
  compareShots: CompareShot[];
  addCompareShot: (shot: CompareShot) => void;
  setNotice: (notice: string) => void;
}) => {
  const { t } = useI18n();
  const [canvasElement, setCanvasElement] = useState<HTMLCanvasElement | null>(null);
  const [renderContext, setRenderContext] = useState<RenderContext | null>(null);
  const [compareOpen, setCompareOpen] = useState(false);
  const [pathTraceMode, setPathTraceMode] = useState<PathTraceMode>("standard");
  const [viewMode, setViewMode] = useState<ViewMode>("raster");
  const [liveTrace, setLiveTrace] = useState<LiveTraceStatus>({ phase: "off", samples: 0 });
  const [debugMode, setDebugMode] = useState<RenderDebugMode>("beauty");
  const [lastPathTracedImage, setLastPathTracedImage] = useState<string | null>(null);
  const [renderProgress, setRenderProgress] = useState<RenderProgressState>({
    status: "idle",
    samples: 0,
    targetSamples: sampleCountByMode.standard,
    elapsedMs: 0,
    message: t("待機中")
  });
  const renderAbortRef = useRef<AbortController | null>(null);
  const renderingRef = useRef(false);

  useEffect(() => {
    setLastPathTracedImage(null);
  }, [project]);

  useEffect(() => {
    if (!renderingRef.current) return;
    renderAbortRef.current?.abort();
    setLastPathTracedImage(null);
    setRenderProgress((current) => ({
      ...current,
      status: "stopped",
      message: t("画像の作成を停止しました")
    }));
    setNotice(t("画像の作成を停止しました"));
  }, [project, setNotice, t]);

  const exportPng = useCallback(async () => {
    if (lastPathTracedImage) {
      const stamped = await withWatermark(lastPathTracedImage);
      downloadDataUrl("ldk-lighting-lab-pathtraced.png", stamped);
      return;
    }
    if (!canvasElement) {
      setNotice(t("3D表示を準備中です。"));
      return;
    }
    const raw = canvasElement.toDataURL("image/png");
    const stamped = await withWatermark(raw);
    downloadDataUrl("ldk-lighting-lab-preview.png", stamped);
  }, [canvasElement, lastPathTracedImage, setNotice, t]);

  const captureCompare = useCallback(() => {
    if (renderingRef.current) return;
    if (!renderContext) {
      setNotice(t("画像を作れませんでした。3D表示を確認してください"));
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
      message: t("高画質画像を作成しています")
    });
    setNotice(t("高画質画像を作成しています"));

    void renderPathTracedImage({
      context: renderContext,
      project,
      mode: pathTraceMode,
      debugMode,
      maxWidth: project.camera.resolutionWidth,
      signal: abortController.signal,
      onProgress: (progress) => {
        setRenderProgress({
          status: "running",
          samples: progress.samples,
          targetSamples: progress.targetSamples,
          elapsedMs: progress.elapsedMs,
          message: progress.phase === "complete" ? t("画像ができました") : t("高画質画像を作成しています")
        });
      }
    })
      .then((result) => {
        const shot: CompareShot = {
          id: `shot-${Date.now()}`,
          name: t("案 {count}", { count: compareShots.length + 1 }),
          dataUrl: result.dataUrl,
          createdAt: new Date().toISOString(),
          cameraViewName: t("視点"),
          lightingSceneName: "",
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
          message: t("画像ができました")
        });
        setNotice(t("画像ができました"));
      })
      .catch((error: unknown) => {
        const aborted = error instanceof DOMException && error.name === "AbortError";
        const errorMessage = error instanceof Error && error.message.includes("WebGL2")
          ? t("この端末では高画質画像を作れません")
          : t("画像を作れませんでした。時間をおいてもう一度お試しください");
        setRenderProgress((current) => ({
          ...current,
          status: aborted ? "stopped" : "error",
          message: aborted ? t("画像の作成を停止しました") : errorMessage
        }));
        if (!aborted) {
          setNotice(errorMessage);
        }
      })
      .finally(() => {
        renderAbortRef.current = null;
        renderingRef.current = false;
      });
  }, [addCompareShot, compareShots.length, debugMode, pathTraceMode, project, renderContext, setNotice, t]);

  const stopRender = useCallback(() => {
    renderAbortRef.current?.abort();
  }, []);

  const handleLiveTraceStatus = useCallback((status: LiveTraceStatus) => {
    setLiveTrace(status);
  }, []);

  const renderPercent = renderProgress.targetSamples
    ? Math.min(100, Math.round((renderProgress.samples / renderProgress.targetSamples) * 100))
    : 0;

  return {
    canvasElement,
    setCanvasElement,
    renderContext,
    setRenderContext,
    compareOpen,
    setCompareOpen,
    pathTraceMode,
    setPathTraceMode,
    viewMode,
    setViewMode,
    liveTrace,
    debugMode,
    setDebugMode,
    lastPathTracedImage,
    renderProgress,
    exportPng,
    captureCompare,
    stopRender,
    handleLiveTraceStatus,
    renderPercent
  };
};
