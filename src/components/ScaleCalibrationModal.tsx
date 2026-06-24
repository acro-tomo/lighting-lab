import { useEffect, useRef, useState } from "react";

type Pixel = { x: number; y: number };

type ScaleCalibrationModalProps = {
  imageUrl: string;
  naturalSize: { width: number; height: number };
  onConfirm: (pix1: Pixel, pix2: Pixel, millimeters: number) => void;
  onCancel: () => void;
};

export const ScaleCalibrationModal = ({
  imageUrl,
  naturalSize,
  onConfirm,
  onCancel
}: ScaleCalibrationModalProps) => {
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [points, setPoints] = useState<Pixel[]>([]);
  const [millimeters, setMillimeters] = useState("3640");

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  // クリック位置を img の表示矩形から画像の自然ピクセル座標へ変換する。
  // object-fit:contain のレターボックスでもズレないよう naturalSize/表示サイズ比を使う。
  const handleImageClick = (event: React.MouseEvent<HTMLImageElement>) => {
    if (points.length >= 2) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const naturalX = ((event.clientX - rect.left) * naturalSize.width) / rect.width;
    const naturalY = ((event.clientY - rect.top) * naturalSize.height) / rect.height;
    setPoints((current) => [...current, { x: naturalX, y: naturalY }]);
  };

  const mm = Number(millimeters);
  const canConfirm = points.length === 2 && Number.isFinite(mm) && mm > 0;

  const handleConfirm = () => {
    if (!canConfirm) return;
    onConfirm(points[0], points[1], mm);
  };

  return (
    <div className="scale-modal-backdrop" role="dialog" aria-modal="true" aria-label="縮尺合わせ">
      <div className="scale-modal">
        <div className="scale-modal-header">
          <h2>縮尺合わせ</h2>
          <p className="scale-modal-help">
            間取り図上で実寸が分かる2点をクリックし、その実距離をmmで入力してください。
          </p>
        </div>

        <div className="scale-modal-stage">
          <div className="scale-modal-image-wrap">
            <img
              ref={imgRef}
              src={imageUrl}
              alt="間取り図"
              className="scale-modal-image"
              onClick={handleImageClick}
              draggable={false}
            />
            <svg
              className="scale-modal-overlay"
              viewBox={`0 0 ${naturalSize.width} ${naturalSize.height}`}
              preserveAspectRatio="xMidYMid meet"
            >
              {points.length === 2 && (
                <line
                  x1={points[0].x}
                  y1={points[0].y}
                  x2={points[1].x}
                  y2={points[1].y}
                  className="scale-modal-line"
                />
              )}
              {points.map((point, index) => (
                <circle
                  key={index}
                  cx={point.x}
                  cy={point.y}
                  r={Math.max(4, naturalSize.width / 160)}
                  className="scale-modal-point"
                />
              ))}
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
          <span className="scale-modal-status">{points.length}/2 点選択</span>
          <div className="scale-modal-actions">
            <button onClick={() => setPoints([])} disabled={points.length === 0}>
              やり直し
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
