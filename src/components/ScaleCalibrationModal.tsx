import { useEffect, useRef, useState } from "react";
import { useI18n } from "../i18n";

type Pixel = { x: number; y: number };
type Orientation = "horizontal" | "vertical";
type DragState = {
  pointerId: number;
  clientX: number;
  clientY: number;
  offset: { x: number; y: number };
} | null;
type TouchPoint = { clientX: number; clientY: number };
type ImageTransform = { scale: number; offset: { x: number; y: number } };
type PinchState = {
  pointerIds: [number, number];
  distance: number;
  anchorPixel: Pixel;
} | null;

type ScaleCalibrationModalProps = {
  imageUrl: string;
  naturalSize: { width: number; height: number };
  onConfirm: (pix1: Pixel, pix2: Pixel, millimeters: number) => void;
  onCancel: () => void;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export const ScaleCalibrationModal = ({
  imageUrl,
  naturalSize,
  onConfirm,
  onCancel
}: ScaleCalibrationModalProps) => {
  const { t } = useI18n();
  const stageRef = useRef<HTMLDivElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const dragRef = useRef<DragState>(null);
  const pointersRef = useRef<Map<number, TouchPoint>>(new Map());
  const pinchRef = useRef<PinchState>(null);
  const transformRef = useRef<ImageTransform>({ scale: 1, offset: { x: 0, y: 0 } });
  const frameRef = useRef<number | null>(null);
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const [millimeters, setMillimeters] = useState("3640");
  const [orientation, setOrientation] = useState<Orientation>("horizontal");
  const [imageScale, setImageScale] = useState(1);
  const [imageOffset, setImageOffset] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const updateSize = () => {
      const rect = stage.getBoundingClientRect();
      setStageSize({ width: rect.width, height: rect.height });
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  const baseScale = stageSize.width > 0 && stageSize.height > 0
    ? Math.min(stageSize.width / naturalSize.width, stageSize.height / naturalSize.height)
    : 1;
  const imageMetricsFor = (transform: ImageTransform) => {
    const displayScale = baseScale * transform.scale;
    const imageWidth = naturalSize.width * displayScale;
    const imageHeight = naturalSize.height * displayScale;
    return {
      displayScale,
      left: (stageSize.width - imageWidth) / 2 + transform.offset.x,
      top: (stageSize.height - imageHeight) / 2 + transform.offset.y
    };
  };
  const imageMetrics = imageMetricsFor({ scale: imageScale, offset: imageOffset });
  const applyImageTransform = (transform: ImageTransform) => {
    const image = imageRef.current;
    if (!image) return;
    const metrics = imageMetricsFor(transform);
    image.style.transform = `translate(${metrics.left}px, ${metrics.top}px) scale(${metrics.displayScale})`;
  };
  const scheduleImageTransform = (transform: ImageTransform) => {
    transformRef.current = transform;
    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      applyImageTransform(transformRef.current);
    });
  };
  const commitImageTransform = () => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    const transform = transformRef.current;
    applyImageTransform(transform);
    setImageScale(transform.scale);
    setImageOffset(transform.offset);
  };

  useEffect(() => {
    transformRef.current = { scale: imageScale, offset: imageOffset };
    applyImageTransform(transformRef.current);
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
    // applyImageTransform は stageSize/baseScale を使うため、サイズ変化でも再適用する。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageScale, imageOffset, stageSize, naturalSize]);

  const referenceLength = stageSize.width > 0 && stageSize.height > 0
    ? orientation === "horizontal"
      ? Math.min(stageSize.width * 0.68, 560)
      : Math.min(stageSize.height * 0.58, stageSize.width * 0.62, 520)
    : 0;
  const referenceCenter = { x: stageSize.width / 2, y: stageSize.height / 2 };
  const referenceStart = orientation === "horizontal"
    ? { x: referenceCenter.x - referenceLength / 2, y: referenceCenter.y }
    : { x: referenceCenter.x, y: referenceCenter.y - referenceLength / 2 };
  const referenceEnd = orientation === "horizontal"
    ? { x: referenceCenter.x + referenceLength / 2, y: referenceCenter.y }
    : { x: referenceCenter.x, y: referenceCenter.y + referenceLength / 2 };
  const stagePointToImagePixel = (
    point: { x: number; y: number },
    transform: ImageTransform = { scale: imageScale, offset: imageOffset }
  ): Pixel => {
    const metrics = imageMetricsFor(transform);
    return {
      x: (point.x - metrics.left) / metrics.displayScale,
      y: (point.y - metrics.top) / metrics.displayScale
    };
  };
  const clientPointToStage = (clientX: number, clientY: number) => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: clientX - rect.left, y: clientY - rect.top };
  };
  const referencePix1 = stagePointToImagePixel(referenceStart);
  const referencePix2 = stagePointToImagePixel(referenceEnd);
  const referencePixels = Math.hypot(referencePix2.x - referencePix1.x, referencePix2.y - referencePix1.y);
  const referenceWithinImage =
    [referencePix1, referencePix2].every((point) =>
      point.x >= 0 && point.x <= naturalSize.width && point.y >= 0 && point.y <= naturalSize.height
    );

  const mm = Number(millimeters);
  const canConfirm = referenceWithinImage && referencePixels > 1 && Number.isFinite(mm) && mm > 0;

  const handleConfirm = () => {
    const currentPix1 = stagePointToImagePixel(referenceStart, transformRef.current);
    const currentPix2 = stagePointToImagePixel(referenceEnd, transformRef.current);
    const currentPixels = Math.hypot(currentPix2.x - currentPix1.x, currentPix2.y - currentPix1.y);
    const currentWithinImage = [currentPix1, currentPix2].every((point) =>
      point.x >= 0 && point.x <= naturalSize.width && point.y >= 0 && point.y <= naturalSize.height
    );
    if (!currentWithinImage || currentPixels <= 1 || !Number.isFinite(mm) || mm <= 0) return;
    onConfirm(currentPix1, currentPix2, mm);
  };

  const handleStagePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    pointersRef.current.set(event.pointerId, { clientX: event.clientX, clientY: event.clientY });
    if (pointersRef.current.size >= 2) {
      const entries = Array.from(pointersRef.current.entries()).slice(0, 2);
      const [aId, a] = entries[0];
      const [bId, b] = entries[1];
      const center = clientPointToStage((a.clientX + b.clientX) / 2, (a.clientY + b.clientY) / 2);
      pinchRef.current = {
        pointerIds: [aId, bId],
        distance: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
        anchorPixel: stagePointToImagePixel(center, transformRef.current)
      };
      dragRef.current = null;
      return;
    }
    dragRef.current = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      offset: transformRef.current.offset
    };
  };

  const handleStagePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (pointersRef.current.has(event.pointerId)) {
      pointersRef.current.set(event.pointerId, { clientX: event.clientX, clientY: event.clientY });
    }
    const pinch = pinchRef.current;
    if (pinch) {
      const a = pointersRef.current.get(pinch.pointerIds[0]);
      const b = pointersRef.current.get(pinch.pointerIds[1]);
      if (!a || !b || pinch.distance <= 1) return;
      const center = clientPointToStage((a.clientX + b.clientX) / 2, (a.clientY + b.clientY) / 2);
      const distance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      const nextScale = clamp(
        transformRef.current.scale * (distance / pinch.distance),
        0.25,
        6
      );
      const nextDisplayScale = baseScale * nextScale;
      scheduleImageTransform({
        scale: nextScale,
        offset: {
          x: center.x - pinch.anchorPixel.x * nextDisplayScale - (stageSize.width - naturalSize.width * nextDisplayScale) / 2,
          y: center.y - pinch.anchorPixel.y * nextDisplayScale - (stageSize.height - naturalSize.height * nextDisplayScale) / 2
        }
      });
      pinch.distance = distance;
      return;
    }
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    scheduleImageTransform({
      scale: transformRef.current.scale,
      offset: {
        x: drag.offset.x + event.clientX - drag.clientX,
        y: drag.offset.y + event.clientY - drag.clientY
      }
    });
  };

  const handleStagePointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    pointersRef.current.delete(event.pointerId);
    if (pinchRef.current?.pointerIds.includes(event.pointerId)) pinchRef.current = null;
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
    commitImageTransform();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const zoomBy = (factor: number) => {
    const next = {
      scale: clamp(transformRef.current.scale * factor, 0.25, 6),
      offset: transformRef.current.offset
    };
    transformRef.current = next;
    setImageScale(next.scale);
    setImageOffset(next.offset);
  };

  const resetImageTransform = () => {
    transformRef.current = { scale: 1, offset: { x: 0, y: 0 } };
    setImageScale(1);
    setImageOffset({ x: 0, y: 0 });
    pointersRef.current.clear();
    pinchRef.current = null;
    dragRef.current = null;
  };

  return (
    <div className="scale-modal-backdrop" role="dialog" aria-modal="true" aria-label={t("縮尺合わせ")}>
      <div className="scale-modal">
        <div className="scale-modal-header">
          <h2>{t("縮尺合わせ")}</h2>
          <p className="scale-modal-help">
            {t("実距離を入力し、表示された線に間取り図の同じ長さの部分を合わせてください。画像はドラッグ、二本指ピンチで調整できます。")}
          </p>
        </div>

        <div className="scale-modal-stage">
          <div
            ref={stageRef}
            className="scale-modal-image-wrap"
            onPointerDown={handleStagePointerDown}
            onPointerMove={handleStagePointerMove}
            onPointerUp={handleStagePointerEnd}
            onPointerCancel={handleStagePointerEnd}
            onWheel={(event) => {
              event.preventDefault();
              zoomBy(event.deltaY < 0 ? 1.08 : 1 / 1.08);
            }}
          >
            <img
              ref={imageRef}
              src={imageUrl}
              alt={t("間取り図")}
              className="scale-modal-image"
              style={{
                width: naturalSize.width,
                height: naturalSize.height,
                transform: `translate(${imageMetrics.left}px, ${imageMetrics.top}px) scale(${imageMetrics.displayScale})`
              }}
              draggable={false}
            />
            <svg
              className="scale-modal-overlay"
              viewBox={`0 0 ${Math.max(1, stageSize.width)} ${Math.max(1, stageSize.height)}`}
            >
              {referenceLength > 0 && (
                <line
                  x1={referenceStart.x}
                  y1={referenceStart.y}
                  x2={referenceEnd.x}
                  y2={referenceEnd.y}
                  className="scale-modal-guide-line"
                />
              )}
              {referenceLength > 0 && (
                <>
                  <circle cx={referenceStart.x} cy={referenceStart.y} r="7" className="scale-modal-guide-point" />
                  <circle cx={referenceEnd.x} cy={referenceEnd.y} r="7" className="scale-modal-guide-point" />
                  <text
                    x={referenceCenter.x}
                    y={orientation === "horizontal" ? referenceCenter.y - 14 : referenceStart.y - 12}
                    className="scale-modal-guide-label"
                    textAnchor="middle"
                  >
                    {Number.isFinite(mm) && mm > 0 ? `${Math.round(mm).toLocaleString("ja-JP")}mm` : t("実距離")}
                  </text>
                </>
              )}
            </svg>
          </div>
        </div>

        <div className="scale-modal-controls">
          <label className="scale-modal-field">
            {t("実距離")} (mm)
            <input
              type="number"
              min={1}
              value={millimeters}
              onChange={(event) => setMillimeters(event.target.value)}
            />
          </label>
          <div className="scale-modal-toggle" role="group" aria-label={t("ガイド線の向き")}>
            <button
              type="button"
              className={orientation === "horizontal" ? "is-active" : ""}
              onClick={() => setOrientation("horizontal")}
            >
              {t("横")}
            </button>
            <button
              type="button"
              className={orientation === "vertical" ? "is-active" : ""}
              onClick={() => setOrientation("vertical")}
            >
              {t("縦")}
            </button>
          </div>
          <label className="scale-modal-field scale-modal-zoom">
            {t("画像倍率")}
            <input
              type="range"
              min={0.25}
              max={6}
              step={0.01}
              value={imageScale}
              onChange={(event) => {
                const next = { scale: Number(event.target.value), offset: transformRef.current.offset };
                transformRef.current = next;
                setImageScale(next.scale);
                setImageOffset(next.offset);
              }}
            />
          </label>
          <span className="scale-modal-status">
            {referenceWithinImage ? `${t("画像上")} ${Math.round(referencePixels)}px` : t("線が画像から外れています")}
          </span>
          <div className="scale-modal-actions">
            <button onClick={resetImageTransform}>
              {t("リセット")}
            </button>
            <button onClick={onCancel}>{t("キャンセル")}</button>
            <button className="primary" onClick={handleConfirm} disabled={!canConfirm}>
              {t("確定")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
