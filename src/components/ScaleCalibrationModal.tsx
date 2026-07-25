import { useEffect, useRef, useState } from "react";
import { useI18n } from "../i18n";

type Pixel = { x: number; y: number };
type Phase = "point1" | "point2" | "review";
type PointDragState = { pointerId: number } | null;
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
  const circle1Ref = useRef<SVGCircleElement | null>(null);
  const circle2Ref = useRef<SVGCircleElement | null>(null);
  const lineRef = useRef<SVGLineElement | null>(null);
  const labelRef = useRef<SVGTextElement | null>(null);
  const pointDragRef = useRef<PointDragState>(null);
  const pointersRef = useRef<Map<number, TouchPoint>>(new Map());
  const pinchRef = useRef<PinchState>(null);
  const transformRef = useRef<ImageTransform>({ scale: 1, offset: { x: 0, y: 0 } });
  const point1Ref = useRef<Pixel | null>(null);
  const point2Ref = useRef<Pixel | null>(null);
  const frameRef = useRef<number | null>(null);
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const [millimeters, setMillimeters] = useState("3640");
  const [imageScale, setImageScale] = useState(1);
  const [imageOffset, setImageOffset] = useState({ x: 0, y: 0 });
  const [phase, setPhase] = useState<Phase>("point1");
  const [point1, setPoint1State] = useState<Pixel | null>(null);
  const [point2, setPoint2State] = useState<Pixel | null>(null);

  // point1Ref/point2Ref はピンチ中の rAF ループから直接DOMを更新するためのミラー。
  // React state 経由だとピンチ中は再レンダーされず、点が画像から取り残されるため必須。
  const updatePoint1 = (p: Pixel | null) => {
    point1Ref.current = p;
    setPoint1State(p);
  };
  const updatePoint2 = (p: Pixel | null) => {
    point2Ref.current = p;
    setPoint2State(p);
  };

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
    const metrics = imageMetricsFor(transform);
    if (image) {
      image.style.transform = `translate(${metrics.left}px, ${metrics.top}px) scale(${metrics.displayScale})`;
    }
    // ピンチ中は React state を更新しない（画像の rAF 直接DOM更新のみ）ため、
    // 既に置いた点のマーカーも同じフレームで直接DOM更新して画像に貼り付いたままにする。
    const p1 = point1Ref.current;
    const p2 = point2Ref.current;
    if (circle1Ref.current && p1) {
      circle1Ref.current.setAttribute("cx", String(metrics.left + p1.x * metrics.displayScale));
      circle1Ref.current.setAttribute("cy", String(metrics.top + p1.y * metrics.displayScale));
    }
    if (circle2Ref.current && p2) {
      circle2Ref.current.setAttribute("cx", String(metrics.left + p2.x * metrics.displayScale));
      circle2Ref.current.setAttribute("cy", String(metrics.top + p2.y * metrics.displayScale));
    }
    if (p1 && p2) {
      const x1 = metrics.left + p1.x * metrics.displayScale;
      const y1 = metrics.top + p1.y * metrics.displayScale;
      const x2 = metrics.left + p2.x * metrics.displayScale;
      const y2 = metrics.top + p2.y * metrics.displayScale;
      if (lineRef.current) {
        lineRef.current.setAttribute("x1", String(x1));
        lineRef.current.setAttribute("y1", String(y1));
        lineRef.current.setAttribute("x2", String(x2));
        lineRef.current.setAttribute("y2", String(y2));
      }
      if (labelRef.current) {
        labelRef.current.setAttribute("x", String((x1 + x2) / 2));
        labelRef.current.setAttribute("y", String((y1 + y2) / 2 - 14));
      }
    }
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
  }, [imageScale, imageOffset, stageSize, naturalSize, point1, point2]);

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
  const imagePixelToStagePoint = (pixel: Pixel) => ({
    x: imageMetrics.left + pixel.x * imageMetrics.displayScale,
    y: imageMetrics.top + pixel.y * imageMetrics.displayScale
  });

  const referencePixels = point1 && point2
    ? Math.hypot(point2.x - point1.x, point2.y - point1.y)
    : 0;
  const mm = Number(millimeters);
  const canConfirmFinal =
    phase === "review" && point1 !== null && point2 !== null && referencePixels > 1 &&
    Number.isFinite(mm) && mm > 0;

  const handleConfirm = () => {
    if (!point1 || !point2) return;
    if (referencePixels <= 1 || !Number.isFinite(mm) || mm <= 0) return;
    onConfirm(point1, point2, mm);
  };

  const placeActivePoint = (stagePt: { x: number; y: number }) => {
    const pix = stagePointToImagePixel(stagePt, transformRef.current);
    const clamped: Pixel = {
      x: clamp(pix.x, 0, naturalSize.width),
      y: clamp(pix.y, 0, naturalSize.height)
    };
    if (phase === "point1") updatePoint1(clamped);
    else if (phase === "point2") updatePoint2(clamped);
  };

  const handleStagePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    pointersRef.current.set(event.pointerId, { clientX: event.clientX, clientY: event.clientY });
    if (pointersRef.current.size >= 2) {
      // 2本指目：以後はピンチ（拡大縮小）専用。点の配置ドラッグは中断する。
      const entries = Array.from(pointersRef.current.entries()).slice(0, 2);
      const [aId, a] = entries[0];
      const [bId, b] = entries[1];
      const center = clientPointToStage((a.clientX + b.clientX) / 2, (a.clientY + b.clientY) / 2);
      pinchRef.current = {
        pointerIds: [aId, bId],
        distance: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
        anchorPixel: stagePointToImagePixel(center, transformRef.current)
      };
      pointDragRef.current = null;
      return;
    }
    if (phase === "review") return;
    pointDragRef.current = { pointerId: event.pointerId };
    placeActivePoint(clientPointToStage(event.clientX, event.clientY));
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
    if (pointDragRef.current?.pointerId === event.pointerId && phase !== "review") {
      placeActivePoint(clientPointToStage(event.clientX, event.clientY));
    }
  };

  const handleStagePointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    pointersRef.current.delete(event.pointerId);
    if (pinchRef.current?.pointerIds.includes(event.pointerId)) pinchRef.current = null;
    if (pointDragRef.current?.pointerId === event.pointerId) pointDragRef.current = null;
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
  };

  const handleConfirmPoint1 = () => {
    if (point1) setPhase("point2");
  };
  const handleConfirmPoint2 = () => {
    if (point2) setPhase("review");
  };
  const handleBack = () => {
    pointDragRef.current = null;
    if (phase === "review") setPhase("point2");
    else if (phase === "point2") setPhase("point1");
  };
  const handleResetPoints = () => {
    pointDragRef.current = null;
    updatePoint1(null);
    updatePoint2(null);
    setPhase("point1");
  };

  const p1Screen = point1 ? imagePixelToStagePoint(point1) : null;
  const p2Screen = point2 ? imagePixelToStagePoint(point2) : null;

  const helpText =
    phase === "point1"
      ? t("画面を指でタップ、またはドラッグして、間取り図の基準となる1点目に印を置いてください。位置は指の動きにリアルタイムに追従します。拡大縮小は二本指ピンチで行えます。")
      : phase === "point2"
        ? t("同じように2点目を配置してください。確定済みの1点目（緑）からの距離がリアルタイムに表示されます。")
        : t("実距離(mm)を入力し、「確定」を押してください。やり直す場合は「戻る」または「点をやり直す」を使ってください。");

  const statusText = (() => {
    if (phase === "point1") {
      return point1
        ? t("この位置でよければ「1点目を確定」を押してください")
        : t("1点目をタップして配置してください");
    }
    if (phase === "point2") {
      return point2
        ? t("{px}px（この位置でよければ「2点目を確定」を押してください）", { px: Math.round(referencePixels) })
        : t("2点目をタップして配置してください");
    }
    return t("{px}px", { px: Math.round(referencePixels) });
  })();

  return (
    <div className="scale-modal-backdrop" role="dialog" aria-modal="true" aria-label={t("縮尺合わせ")}>
      <div className="scale-modal">
        <div className="scale-modal-header">
          <h2>{t("縮尺合わせ")}</h2>
          <p className="scale-modal-help">{helpText}</p>
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
              {p1Screen && p2Screen && (
                <line
                  ref={lineRef}
                  x1={p1Screen.x}
                  y1={p1Screen.y}
                  x2={p2Screen.x}
                  y2={p2Screen.y}
                  className="scale-modal-guide-line"
                />
              )}
              {p1Screen && (
                <circle
                  ref={circle1Ref}
                  cx={p1Screen.x}
                  cy={p1Screen.y}
                  r="9"
                  className={phase === "point1" ? "scale-modal-point-active" : "scale-modal-point-locked"}
                />
              )}
              {p2Screen && (
                <circle
                  ref={circle2Ref}
                  cx={p2Screen.x}
                  cy={p2Screen.y}
                  r="9"
                  className={phase === "point2" ? "scale-modal-point-active" : "scale-modal-point-locked"}
                />
              )}
              {p1Screen && p2Screen && (
                <text
                  ref={labelRef}
                  x={(p1Screen.x + p2Screen.x) / 2}
                  y={(p1Screen.y + p2Screen.y) / 2 - 14}
                  className="scale-modal-guide-label"
                  textAnchor="middle"
                >
                  {phase === "review" && Number.isFinite(mm) && mm > 0
                    ? `${Math.round(mm).toLocaleString("ja-JP")}mm`
                    : `${Math.round(referencePixels)}px`}
                </text>
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
          <span className="scale-modal-status">{statusText}</span>
          <div className="scale-modal-actions">
            <button onClick={resetImageTransform}>{t("画像表示をリセット")}</button>
            {phase !== "point1" && <button onClick={handleBack}>{t("戻る")}</button>}
            <button onClick={handleResetPoints}>{t("点をやり直す")}</button>
            {phase === "point1" && (
              <button className="primary" onClick={handleConfirmPoint1} disabled={!point1}>
                {t("1点目を確定")}
              </button>
            )}
            {phase === "point2" && (
              <button className="primary" onClick={handleConfirmPoint2} disabled={!point2}>
                {t("2点目を確定")}
              </button>
            )}
            <button onClick={onCancel}>{t("キャンセル")}</button>
            {phase === "review" && (
              <button className="primary" onClick={handleConfirm} disabled={!canConfirmFinal}>
                {t("確定")}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
