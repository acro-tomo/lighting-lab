import { useEffect, useRef, useState } from "react";

type Pixel = { x: number; y: number };
type Orientation = "horizontal" | "vertical";
type DragState = {
  pointerId: number;
  clientX: number;
  clientY: number;
  offset: { x: number; y: number };
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
  const stageRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState>(null);
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
  const displayScale = baseScale * imageScale;
  const imageWidth = naturalSize.width * displayScale;
  const imageHeight = naturalSize.height * displayScale;
  const imageLeft = (stageSize.width - imageWidth) / 2 + imageOffset.x;
  const imageTop = (stageSize.height - imageHeight) / 2 + imageOffset.y;

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
  const stagePointToImagePixel = (point: { x: number; y: number }): Pixel => ({
    x: (point.x - imageLeft) / displayScale,
    y: (point.y - imageTop) / displayScale
  });
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
    if (!canConfirm) return;
    onConfirm(referencePix1, referencePix2, mm);
  };

  const handleStagePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      offset: imageOffset
    };
  };

  const handleStagePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setImageOffset({
      x: drag.offset.x + event.clientX - drag.clientX,
      y: drag.offset.y + event.clientY - drag.clientY
    });
  };

  const handleStagePointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const zoomBy = (factor: number) => {
    setImageScale((current) => clamp(current * factor, 0.25, 6));
  };

  const resetImageTransform = () => {
    setImageScale(1);
    setImageOffset({ x: 0, y: 0 });
  };

  return (
    <div className="scale-modal-backdrop" role="dialog" aria-modal="true" aria-label="縮尺合わせ">
      <div className="scale-modal">
        <div className="scale-modal-header">
          <h2>縮尺合わせ</h2>
          <p className="scale-modal-help">
            実距離を入力し、表示された線に間取り図の同じ長さの部分を合わせてください。
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
              src={imageUrl}
              alt="間取り図"
              className="scale-modal-image"
              style={{
                width: naturalSize.width,
                height: naturalSize.height,
                transform: `translate(${imageLeft}px, ${imageTop}px) scale(${displayScale})`
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
                    {Number.isFinite(mm) && mm > 0 ? `${Math.round(mm).toLocaleString("ja-JP")}mm` : "実距離"}
                  </text>
                </>
              )}
            </svg>
          </div>
        </div>

        <div className="scale-modal-controls">
          <label className="scale-modal-field">
            実距離 (mm)
            <input
              type="number"
              min={1}
              value={millimeters}
              onChange={(event) => setMillimeters(event.target.value)}
            />
          </label>
          <div className="scale-modal-toggle" role="group" aria-label="ガイド線の向き">
            <button
              type="button"
              className={orientation === "horizontal" ? "is-active" : ""}
              onClick={() => setOrientation("horizontal")}
            >
              横
            </button>
            <button
              type="button"
              className={orientation === "vertical" ? "is-active" : ""}
              onClick={() => setOrientation("vertical")}
            >
              縦
            </button>
          </div>
          <label className="scale-modal-field scale-modal-zoom">
            画像倍率
            <input
              type="range"
              min={0.25}
              max={6}
              step={0.01}
              value={imageScale}
              onChange={(event) => setImageScale(Number(event.target.value))}
            />
          </label>
          <div className="scale-modal-zoom-buttons">
            <button type="button" onClick={() => zoomBy(1 / 1.12)} aria-label="画像を縮小">-</button>
            <button type="button" onClick={() => zoomBy(1.12)} aria-label="画像を拡大">+</button>
          </div>
          <span className="scale-modal-status">
            {referenceWithinImage ? `画像上 ${Math.round(referencePixels)}px` : "線が画像から外れています"}
          </span>
          <div className="scale-modal-actions">
            <button onClick={resetImageTransform}>
              リセット
            </button>
            <button onClick={onCancel}>キャンセル</button>
            <button className="primary" onClick={handleConfirm} disabled={!canConfirm}>
              確定
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
