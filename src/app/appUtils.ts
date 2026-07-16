import { APP_NAME, getAppDisplayUrl } from "../config/appMeta";
import { migrateRenderExposure } from "../rendering/exposure";
import { rasterizeSvgBackground } from "../utils/floorplanImport";
import type { Project } from "../types";

export const withWatermark = (dataUrl: string): Promise<string> =>
  new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) { resolve(dataUrl); return; }
      ctx.drawImage(img, 0, 0);
      const fontSize = Math.max(12, Math.round(h * 0.022));
      ctx.font = `${fontSize}px Inter, ui-sans-serif, system-ui, sans-serif`;
      ctx.globalAlpha = 0.55;
      ctx.shadowColor = "rgba(0,0,0,0.7)";
      ctx.shadowBlur = 4;
      ctx.fillStyle = "#ffffff";
      const text = `${APP_NAME} · ${getAppDisplayUrl()}`;
      const margin = Math.round(fontSize * 0.9);
      ctx.fillText(text, w - ctx.measureText(text).width - margin, h - margin);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });

// 小数hourをHH:MM文字列に変換する（例: 14.5 → "14:30"）。
export const formatHour = (hour: number): string => {
  const h = Math.floor(hour);
  const m = Math.round((hour - h) * 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

export const readTextFile = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });

export const downloadText = (fileName: string, text: string) => {
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
};

export const downloadDataUrl = (fileName: string, dataUrl: string) => {
  const anchor = document.createElement("a");
  anchor.href = dataUrl;
  anchor.download = fileName;
  anchor.click();
};

export const migrateLoadedProject = async <T extends Project>(project: T): Promise<T> => {
  const next = { ...project };
  const renderCalibration = migrateRenderExposure(
    next.camera.exposure,
    next.renderCalibrationVersion
  );
  next.camera = { ...next.camera, exposure: renderCalibration.exposure };
  next.renderCalibrationVersion = renderCalibration.renderCalibrationVersion;
  // SVG背景はモバイルのピンチ操作を殺すため、旧JSONと自動保存の読込時にPNG化する。
  if (next.backgroundPlan) next.backgroundPlan = await rasterizeSvgBackground(next.backgroundPlan);
  if (next.backgroundPlan2) next.backgroundPlan2 = await rasterizeSvgBackground(next.backgroundPlan2);
  return next;
};
