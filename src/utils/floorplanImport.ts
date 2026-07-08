import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";
import type { FloorPlanBackground } from "../types";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const FLOOR_PLAN_MAX_IMAGE_DIMENSION = 2400;
const FLOOR_PLAN_JPEG_QUALITY = 0.82;

const readFileAsArrayBuffer = (file: File) =>
  new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("間取り図画像を読み込めませんでした。"));
    image.src = src;
  });

const compressedCanvasDataUrl = (canvas: HTMLCanvasElement) =>
  canvas.toDataURL("image/jpeg", FLOOR_PLAN_JPEG_QUALITY);

const drawCompressedImage = (image: CanvasImageSource, width: number, height: number) => {
  const scale = Math.min(1, FLOOR_PLAN_MAX_IMAGE_DIMENSION / Math.max(width, height));
  const outputWidth = Math.max(1, Math.round(width * scale));
  const outputHeight = Math.max(1, Math.round(height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = outputWidth;
  canvas.height = outputHeight;
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("間取り図画像を圧縮するCanvasを作成できませんでした。");
  }

  context.fillStyle = "#fff";
  context.fillRect(0, 0, outputWidth, outputHeight);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(image, 0, 0, outputWidth, outputHeight);
  return compressedCanvasDataUrl(canvas);
};

const compressImageFile = async (file: File) => {
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await loadImage(objectUrl);
    return drawCompressedImage(image, image.naturalWidth, image.naturalHeight);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
};

// SVG背景はピンチ/パン中の変形のたびにWebKitが再ラスタライズしてモバイルで
// 操作不能になるため、プロジェクト読み込み時にPNGへ変換する（旧JSON・自動保存の救済）。
export const rasterizeSvgBackground = async (
  background: FloorPlanBackground
): Promise<FloorPlanBackground> => {
  if (!background.dataUrl.startsWith("data:image/svg")) return background;
  try {
    const image = await loadImage(background.dataUrl);
    if (!image.naturalWidth || !image.naturalHeight) return background;
    const scale = Math.min(
      2,
      FLOOR_PLAN_MAX_IMAGE_DIMENSION / Math.max(image.naturalWidth, image.naturalHeight)
    );
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return background;
    context.fillStyle = "#fff";
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    // 実寸配置(m) = naturalSize × metersPerPixel を保つよう解像度変更ぶんを補正する。
    const ratio = width / image.naturalWidth;
    return {
      ...background,
      dataUrl: canvas.toDataURL("image/png"),
      fileName: background.fileName.replace(/\.svg$/i, ".png"),
      scale: background.scale
        ? { ...background.scale, pixels: background.scale.pixels * ratio }
        : background.scale,
      placement: background.placement
        ? { ...background.placement, metersPerPixel: background.placement.metersPerPixel / ratio }
        : background.placement
    };
  } catch {
    return background;
  }
};

export const floorPlanFileToDataUrl = async (file: File) => {
  const extension = file.name.split(".").pop()?.toLowerCase();

  if (extension === "pdf" || file.type === "application/pdf") {
    const buffer = await readFileAsArrayBuffer(file);
    const pdfDocument = await pdfjsLib.getDocument({ data: buffer }).promise;
    const page = await pdfDocument.getPage(1);
    const baseViewport = page.getViewport({ scale: 1 });
    const renderScale = Math.min(2, FLOOR_PLAN_MAX_IMAGE_DIMENSION / Math.max(baseViewport.width, baseViewport.height));
    const viewport = page.getViewport({ scale: renderScale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(viewport.width));
    canvas.height = Math.max(1, Math.round(viewport.height));
    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error("PDFを描画するCanvasを作成できませんでした。");
    }

    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas, canvasContext: context, viewport }).promise;
    return {
      dataUrl: compressedCanvasDataUrl(canvas),
      kind: "pdf" as const
    };
  }

  return {
    dataUrl: await compressImageFile(file),
    kind: "image" as const
  };
};
