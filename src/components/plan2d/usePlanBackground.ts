import { useEffect, useMemo, useState } from "react";
import type { FloorPlanBackground, Project, Vec2M } from "../../types";
import type { ContentBox, PlanSize } from "./types";
import { useI18n } from "../../i18n";

// 背景画像レイヤ: 縮尺未設定時のフィット配置(defaultPlacement)、2階の背景合わせモード、
// 縮尺キャリブレーション(画像px2点+実距離mm→placement)、描画用transform(bgRender)。
export const usePlanBackground = ({
  project,
  activeFloor,
  activeBackground,
  backgroundUrl,
  bgNaturalSize,
  planSize,
  contentBox,
  worldToSvg,
  setBackgroundPlan
}: {
  project: Project;
  activeFloor: number;
  activeBackground: FloorPlanBackground | undefined;
  backgroundUrl: string | undefined;
  bgNaturalSize: { width: number; height: number } | null;
  planSize: PlanSize;
  contentBox: ContentBox;
  worldToSvg: (point: Vec2M) => { x: number; y: number };
  setBackgroundPlan: (backgroundPlan: FloorPlanBackground) => void;
}) => {
  const { language, t } = useI18n();
  const [scaleModalOpen, setScaleModalOpen] = useState(false);
  const [backgroundAlignMode, setBackgroundAlignMode] = useState(false);
  const canAlignBackground = activeFloor === 2 && Boolean(activeBackground);

  useEffect(() => {
    if (activeFloor !== 2 || !activeBackground) setBackgroundAlignMode(false);
  }, [activeFloor, activeBackground]);

  useEffect(() => {
    if (activeFloor === 2 && activeBackground?.alignmentPending) setBackgroundAlignMode(true);
  }, [activeFloor, activeBackground?.alignmentPending]);

  // 間取り図が新たに読み込まれ、まだ縮尺(scale/placement)が未設定なら
  // 自動的に縮尺合わせモーダルを開いて誘導する（要望10）。
  const hasScale = Boolean(activeBackground?.scale);
  useEffect(() => {
    if (backgroundUrl && !hasScale) {
      setScaleModalOpen(true);
    }
  }, [backgroundUrl, hasScale]);

  // 縮尺未設定の背景は「部屋の矩形(room.widthM/depthM)」へ meet フィットさせる。
  // 壁/家具/void など編集のたびに変わる contentBox(表示用バウンディングボックス)には
  // 依存させない。room寸法は編集操作では動かない安定値なので、無関係な編集のたびに
  // 背景画像だけ再フィットされてズレる問題がここで根本的に起きなくなる。
  const defaultPlacement = useMemo(() => {
    if (!bgNaturalSize || bgNaturalSize.width === 0 || bgNaturalSize.height === 0) return null;
    const roomWidthM = project.room.widthM;
    const roomDepthM = project.room.depthM;
    if (!(roomWidthM > 0) || !(roomDepthM > 0)) return null;
    const metersPerPixel = Math.min(roomWidthM / bgNaturalSize.width, roomDepthM / bgNaturalSize.height);
    const imageWidthM = bgNaturalSize.width * metersPerPixel;
    const imageHeightM = bgNaturalSize.height * metersPerPixel;
    // room矩形は中心原点([-w/2,w/2] x [-d/2,d/2])。画像をその中央に収める。
    return {
      originXM: -roomWidthM / 2 + (roomWidthM - imageWidthM) / 2,
      originZM: -roomDepthM / 2 + (roomDepthM - imageHeightM) / 2,
      metersPerPixel
    } satisfies NonNullable<FloorPlanBackground["placement"]>;
  }, [bgNaturalSize, project.room.widthM, project.room.depthM]);

  // 実寸キャリブレーション(scale)済み、または背景合わせモードでドラッグ中/確定待ち
  // (alignmentPending)の placement だけを信頼する。scale も alignmentPending も無い
  // placement は、旧実装が壁/家具編集のたびに再フィットした値を誤って永続化していた
  // 残骸である可能性があるため、常に安定した defaultPlacement を優先し直す（自己修復）。
  const placement =
    activeBackground?.placement && (activeBackground.scale || activeBackground.alignmentPending)
      ? activeBackground.placement
      : defaultPlacement;

  const confirmBackgroundAlignment = () => {
    if (!activeBackground) return;
    const { alignmentPending, ...confirmedBackground } = activeBackground;
    void alignmentPending;
    setBackgroundPlan(confirmedBackground);
    setBackgroundAlignMode(false);
  };

  // 1階基準へリセットするのは「実寸キャリブレーション済みの1階」を信頼できる場合だけ。
  // 1階も未キャリブレーションなら、1階の placement は単なる room フィット(または旧実装が
  // 誤って永続化した不安定値)でしかなく、2階へコピーしても意味がない。
  const resetBackgroundToFirstFloor = () => {
    if (!activeBackground || !project.backgroundPlan?.placement || !project.backgroundPlan.scale) return;
    setBackgroundPlan({
      ...activeBackground,
      placement: { ...project.backgroundPlan.placement },
      scale: { ...project.backgroundPlan.scale },
      alignmentPending: true
    });
    setBackgroundAlignMode(true);
  };

  // 画像ピクセル座標 → ワールド座標(m)
  const imagePixelToWorld = (ipx: number, ipy: number): Vec2M | null => {
    if (!placement) return null;
    return {
      x: placement.originXM + ipx * placement.metersPerPixel,
      z: placement.originZM + ipy * placement.metersPerPixel
    };
  };

  // モーダルで選んだ画像ピクセル2点と実距離(mm)を placement(原点・m/px)へ変換して
  // 保存する。2点の中点は現 placement のワールド位置に固定し、縮尺変更で図面が
  // 大きくずれないようにする（旧world版と同じ思想）。
  const calibrateFromImagePixels = (
    pix1: { x: number; y: number },
    pix2: { x: number; y: number },
    millimeters: number
  ) => {
    const background = activeBackground;
    if (!background) return;
    const pixels = Math.hypot(pix2.x - pix1.x, pix2.y - pix1.y);
    if (pixels <= 1 || !(millimeters > 0)) return;

    const metersPerPixel = millimeters / 1000 / pixels;
    const midPix = { x: (pix1.x + pix2.x) / 2, y: (pix1.y + pix2.y) / 2 };
    const midWorld = imagePixelToWorld(midPix.x, midPix.y);
    if (!midWorld) return;

    const { alignmentPending, ...confirmedBackground } = background;
    void alignmentPending;
    setBackgroundPlan({
      ...confirmedBackground,
      scale: { pixels, millimeters },
      placement: {
        originXM: midWorld.x - midPix.x * metersPerPixel,
        originZM: midWorld.z - midPix.y * metersPerPixel,
        metersPerPixel
      }
    });
  };

  // 背景画像を placement に従って SVG ユーザー空間へ配置する transform。
  // 画像ピクセル(0,0)の SVG 位置へ平行移動し、m/px × pxPerM で等倍拡大する。
  const bgRender = useMemo(() => {
    if (!bgNaturalSize || !placement) return null;
    const topLeftWorld = imagePixelToWorld(0, 0);
    if (!topLeftWorld) return null;
    const topLeftSvg = worldToSvg(topLeftWorld);
    return {
      width: bgNaturalSize.width,
      height: bgNaturalSize.height,
      tx: topLeftSvg.x,
      ty: topLeftSvg.y,
      scale: placement.metersPerPixel * planSize.pxPerM
    };
    // imagePixelToWorld/worldToSvg は placement・contentBox(min/MARGIN) から導出される。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bgNaturalSize, placement, planSize.pxPerM, contentBox]);

  const scaleLabel = activeBackground?.alignmentPending
    ? t("1階基準で仮合わせ（要確認）")
    : activeBackground?.scale
    ? t("実寸合わせ済み（{millimeters}mm基準）", { millimeters: Math.round(activeBackground.scale.millimeters).toLocaleString(language === "ja" ? "ja-JP" : "en-US") })
    : activeBackground
    ? t("縮尺未設定（フィット表示）")
    : t("背景なし");

  return {
    scaleModalOpen,
    setScaleModalOpen,
    backgroundAlignMode,
    setBackgroundAlignMode,
    canAlignBackground,
    placement,
    confirmBackgroundAlignment,
    resetBackgroundToFirstFloor,
    calibrateFromImagePixels,
    bgRender,
    scaleLabel
  };
};
