import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const readFileAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

const readFileAsArrayBuffer = (file: File) =>
  new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });

export const floorPlanFileToDataUrl = async (file: File) => {
  const extension = file.name.split(".").pop()?.toLowerCase();

  if (extension === "pdf" || file.type === "application/pdf") {
    const buffer = await readFileAsArrayBuffer(file);
    const pdfDocument = await pdfjsLib.getDocument({ data: buffer }).promise;
    const page = await pdfDocument.getPage(1);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error("PDFを描画するCanvasを作成できませんでした。");
    }

    await page.render({ canvas, canvasContext: context, viewport }).promise;
    return {
      dataUrl: canvas.toDataURL("image/png"),
      kind: "pdf" as const
    };
  }

  return {
    dataUrl: await readFileAsDataUrl(file),
    kind: "image" as const
  };
};
