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
      message: t("シーン変更によりレンダリングをリセットしました。")
    }));
    setNotice(t("カメラ、家具、照明、材質が変更されたためレンダリングを停止しました。"));
  }, [project, setNotice, t]);

  const exportPng = useCallback(async () => {
    if (lastPathTracedImage) {
      const stamped = await withWatermark(lastPathTracedImage);
      downloadDataUrl("ldk-lighting-lab-pathtraced.png", stamped);
      return;
    }
    if (!canvasElement) {
      setNotice(t("3Dキャンバスがまだ準備できていません。"));
      return;
    }
    const raw = canvasElement.toDataURL("image/png");
    const stamped = await withWatermark(raw);
    downloadDataUrl("ldk-lighting-lab-preview.png", stamped);
  }, [canvasElement, lastPathTracedImage, setNotice, t]);

  const captureCompare = useCallback(() => {
    if (renderingRef.current) return;
    if (!renderContext) {
      setNotice(t("レンダリングを開始できませんでした。3D表示を確認してください。"));
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
      message: t("BVH生成とpath tracingを開始しています。")
    });
    setNotice(t("three-gpu-pathtracerで最終レンダリングを開始しました。"));

    void renderPathTracedImage({
      context: renderContext,
      project,
      mode: pathTraceMode,
      debugMode,
      maxWidth: project.camera.resolutionWidth,
      signal: abortController.signal,
      onProgress: (progress) => {
        const buildPercent =
          typeof progress.buildProgress === "number"
            ? ` ${Math.round(progress.buildProgress * 100)}%`
            : "";
        const message =
          progress.phase === "bvh"
            ? `${t("BVH生成中")}${buildPercent}`
            : progress.phase === "sampling"
              ? t("path tracing中")
              : progress.phase === "complete"
                ? t("レンダリング完了")
                : t("準備中");
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
          message: t("完了")
        });
        setNotice(t("{samples} samples のパストレース比較画像を保存しました。", { samples: result.samples }));
      })
      .catch((error: unknown) => {
        const aborted = error instanceof DOMException && error.name === "AbortError";
        setRenderProgress((current) => ({
          ...current,
          status: aborted ? "stopped" : "error",
          message: aborted ? t("停止しました") : error instanceof Error ? error.message : t("レンダリングに失敗しました。")
        }));
        if (!aborted) {
          setNotice(error instanceof Error ? error.message : t("レンダリングに失敗しました。"));
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
    elapsedSeconds,
    renderPercent,
    estimatedRemainingSeconds
  };
};
