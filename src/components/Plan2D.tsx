import { useEffect, useMemo, useRef, useState } from "react";
import type { Project, Selection, WallSegment } from "../types";
import { useProjectStore } from "../store/projectStore";
import { useI18n } from "../i18n";
import { DEFAULT_DAYLIGHT } from "../utils/sun";
import { ScaleCalibrationModal } from "./ScaleCalibrationModal";
import type { EditMode } from "./EditToolbar";
import { isWallLightAddKind } from "../data/fixtureAddKinds";
import { windowPresetFromAddKind } from "../data/windowCatalog";
import { GESTURE_DEBUG, VIEW_PAD } from "./plan2d/constants";
import { isWallOpening, snapPoint } from "./plan2d/geometry";
import type { ResizeKind, TouchWallTraceState } from "./plan2d/types";
import { usePlanBounds, usePlanViewport } from "./plan2d/usePlanViewport";
import { usePlanBackground } from "./plan2d/usePlanBackground";
import { useWallTrace } from "./plan2d/useWallTrace";
import { usePlanPointerGestures } from "./plan2d/usePlanPointerGestures";
import { OpeningPlanItem, RoomOutline } from "./plan2d/wallItems";
import { CeilingZonePlanItem, FloorZonePlanItem, VoidPlanItem } from "./plan2d/zoneItems";
import { FurniturePlanItem, LightPlanItem, ResizeHandles } from "./plan2d/objectItems";
import {
  CameraMarker,
  FurnitureWallCenterGuide,
  GestureDebugHud,
  GhostWallsLayer,
  SnapGuideLines,
  WallTargetHighlight,
  WallTracePreview
} from "./plan2d/overlays";

type Plan2DProps = {
  project: Project;
  selection: Selection;
  onSelect: (selection: Selection) => void;
  mode: EditMode;
  onModeChange: (mode: EditMode) => void;
  pendingAdd: string | null;
  onPlaceObject: (at: { x: number; z: number }) => void;
  onPlaceOnWall: (wallId: string, centerRatio: number, heightM?: number) => void;
  canEditWalls: boolean;
  focusPlan: boolean;
  onToggleFocusPlan: () => void;
};

export const Plan2D = ({
  project,
  selection,
  onSelect,
  mode,
  onModeChange,
  pendingAdd,
  onPlaceObject,
  onPlaceOnWall,
  canEditWalls,
  focusPlan,
  onToggleFocusPlan
}: Plan2DProps) => {
  const { t } = useI18n();
  // 壁トレースのタッチ状態は useWallTrace（後始末）と usePlanPointerGestures（判定）の
  // 両方が触るため、本体で ref を作って両フックへ渡す。
  const touchWallTraceRef = useRef<TouchWallTraceState>(null);
  const [bgNaturalSize, setBgNaturalSize] = useState<{ width: number; height: number } | null>(null);
  // ダブルクリックで開始する辺ドラッグリサイズ。resizeTarget=ハンドル表示中のオブジェクト。
  const [resizeTarget, setResizeTarget] = useState<{ kind: ResizeKind; id: string } | null>(null);

  const updateFurniture = useProjectStore((state) => state.updateFurniture);
  const updateLight = useProjectStore((state) => state.updateLight);
  const selectedLightIds = useProjectStore((state) => state.selectedLightIds);
  const toggleLightSelection = useProjectStore((state) => state.toggleLightSelection);
  const clearLightSelection = useProjectStore((state) => state.clearLightSelection);
  const updateVoid = useProjectStore((state) => state.updateVoid);
  const setBackgroundPlan = useProjectStore((state) => state.setBackgroundPlan);
  const updateWindow = useProjectStore((state) => state.updateWindow);
  const updateCeilingZone = useProjectStore((state) => state.updateCeilingZone);
  const updateFloorZone = useProjectStore((state) => state.updateFloorZone);
  const updateWall = useProjectStore((state) => state.updateWall);
  const addWall = useProjectStore((state) => state.addWall);
  const undo = useProjectStore((state) => state.undo);
  const beginHistoryGroup = useProjectStore((state) => state.beginHistoryGroup);
  const endHistoryGroup = useProjectStore((state) => state.endHistoryGroup);
  const setDaylight = useProjectStore((state) => state.setDaylight);
  // 3Dビューの現在カメラ位置/注視点(ワールドm)。null のとき平面図にマーカーを描かない。
  const liveCamera = useProjectStore((state) => state.liveCamera);

  // 方位ダイヤル。northOffsetDeg は「真北が -Z からY軸まわり時計回りに何度ずれるか」。
  // worldToSvg は -Z を画面上に保つので 0° で N矢印が真上、増やすと画面上で時計回り。
  const northOffsetDeg = project.daylight?.northOffsetDeg ?? DEFAULT_DAYLIGHT.northOffsetDeg;

  // 活性階。オブジェクトの所属階フィルタ・背景の切替・ゴースト壁の基準。
  const activeFloor = project.activeFloor ?? 1;
  const pendingWindowPreset = pendingAdd ? windowPresetFromAddKind(pendingAdd) : undefined;
  const pendingWindowWidthM = pendingWindowPreset?.style === "window" ? pendingWindowPreset.widthM : undefined;
  // 活性階に紐づく背景（2階なら backgroundPlan2、1階なら backgroundPlan）。
  const activeBackground = activeFloor === 2 ? project.backgroundPlan2 : project.backgroundPlan;

  // 活性階に属するオブジェクトだけを編集対象にする（floor 未指定は1階扱い）。
  const onActiveFloor = <T extends { floor?: number }>(obj: T) => (obj.floor ?? 1) === activeFloor;
  const activeWalls = useMemo(() => project.walls.filter(onActiveFloor), [project.walls, activeFloor]);
  const activeFurniture = useMemo(() => project.furniture.filter(onActiveFloor), [project.furniture, activeFloor]);
  const activeLights = useMemo(() => project.lights.filter(onActiveFloor), [project.lights, activeFloor]);
  const activeWindows = useMemo(() => project.windows.filter(onActiveFloor), [project.windows, activeFloor]);
  const activeVoids = useMemo(() => project.voids.filter(onActiveFloor), [project.voids, activeFloor]);
  const activeCeilingZones = useMemo(
    () => (project.ceilingZones ?? []).filter(onActiveFloor),
    [project.ceilingZones, activeFloor]
  );
  const activeFloorZones = useMemo(
    () => (project.floorZones ?? []).filter(onActiveFloor),
    [project.floorZones, activeFloor]
  );
  // 非活性階の壁（ゴースト表示用・操作不可）。2階編集時に1階壁を透かして見せ、
  // それに合わせて2階壁を引けるようにする。
  const ghostWalls = useMemo(
    () => project.walls.filter((wall) => (wall.floor ?? 1) !== activeFloor),
    [project.walls, activeFloor]
  );

  const backgroundUrl = activeBackground?.dataUrl;
  useEffect(() => {
    if (!backgroundUrl) {
      setBgNaturalSize(null);
      return;
    }
    let cancelled = false;
    const image = new Image();
    image.onload = () => {
      if (!cancelled) setBgNaturalSize({ width: image.naturalWidth, height: image.naturalHeight });
    };
    image.src = backgroundUrl;
    return () => {
      cancelled = true;
    };
  }, [backgroundUrl]);

  const { contentBox, planSize } = usePlanBounds({
    project,
    activeWalls,
    ghostWalls,
    activeFurniture,
    activeVoids,
    activeCeilingZones,
    activeFloorZones,
    activeBackground,
    bgNaturalSize
  });

  const {
    svgRef,
    viewportLayerRef,
    viewportRef,
    gestureBaseRef,
    zoom,
    pan,
    baseViewBox,
    viewBox,
    viewBoxFor,
    viewBoxStringFor,
    viewportTransformFor,
    screenMappingFor,
    beginViewportGesture,
    gestureUserPoint,
    commitViewport,
    scheduleViewport,
    worldToSvg,
    svgPointToWorld,
    clientToSvgPoint,
    svgToWorld,
    zoomAtCenter
  } = usePlanViewport({ contentBox, planSize });

  const {
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
  } = usePlanBackground({
    project,
    activeFloor,
    activeBackground,
    backgroundUrl,
    bgNaturalSize,
    planSize,
    contentBox,
    worldToSvg,
    setBackgroundPlan
  });

  const {
    wallDraft,
    setWallDraft,
    wallCursor,
    setWallCursor,
    draftInnerSide,
    setDraftInnerSide,
    draftSideLabels,
    commitWallSegment,
    clearWallTrace,
    finishWallTrace,
    undoWallPoint,
    wallTracePoint
  } = useWallTrace({
    mode,
    project,
    activeWalls,
    ghostWalls,
    addWall,
    undo,
    onSelect,
    onModeChange,
    svgRef,
    viewBox,
    worldToSvg,
    contentBox,
    planSize,
    touchWallTraceRef
  });

  const {
    touchPointersRef,
    pinchRef,
    gestureDebugRef,
    dragging,
    setDragging,
    setResizing,
    snapGuides,
    furnitureWallGuide,
    wallTarget,
    handleObjectPointerDownCapture,
    handleCanvasPointerDown,
    onPointerMove,
    handleCanvasPointerEnd
  } = usePlanPointerGestures({
    project,
    mode,
    pendingAdd,
    activeFloor,
    activeWalls,
    activeLights,
    activeBackground,
    placement,
    backgroundAlignMode,
    onPlaceObject,
    onPlaceOnWall,
    updateFurniture,
    updateLight,
    updateVoid,
    updateCeilingZone,
    updateFloorZone,
    updateWall,
    updateWindow,
    setBackgroundPlan,
    svgRef,
    viewportRef,
    gestureBaseRef,
    viewBoxFor,
    beginViewportGesture,
    gestureUserPoint,
    screenMappingFor,
    scheduleViewport,
    commitViewport,
    clientToSvgPoint,
    svgToWorld,
    planSize,
    wallDraft,
    setWallDraft,
    setWallCursor,
    draftInnerSide,
    commitWallSegment,
    wallTracePoint,
    touchWallTraceRef,
    beginHistoryGroup,
    endHistoryGroup
  });

  // pendingAdd 中・wall モード中は背景SVGにクリックを通す（オブジェクトは pointerEvents:none）。
  const canSelectObjects = !backgroundAlignMode && !pendingAdd && mode === "select";
  // 選択モードでもドラッグで動かせるほうが直感的。クリックのみなら移動は起きず選択だけ。
  const canDragObjects = !backgroundAlignMode && mode === "select";

  const handleSelect = (nextSelection: Selection) => {
    if (nextSelection?.kind === "wall" && !canEditWalls) return;
    // 別オブジェクトを選んだらリサイズハンドルを閉じる。
    if (!nextSelection || resizeTarget?.id !== nextSelection.id) setResizeTarget(null);
    // 削除モードは廃止。選択中のオブジェクトはDeleteキーで消す（App側で処理）。
    onSelect(nextSelection);
  };

  // ライトのクリック選択。Shift+クリックは複数選択トグル、通常は単一選択。
  const selectLight = (id: string, shiftKey: boolean) => {
    if (shiftKey) {
      toggleLightSelection(id);
      return;
    }
    clearLightSelection();
    handleSelect({ kind: "light", id });
  };

  const startWallDrag = (wall: WallSegment, event: React.PointerEvent<SVGLineElement>) => {
    if (!canEditWalls) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    handleSelect({ kind: "wall", id: wall.id });
    setDragging({
      kind: "wall",
      id: wall.id,
      pointerStart: snapPoint(svgToWorld(event.clientX, event.clientY)),
      start: { ...wall.start },
      end: { ...wall.end }
    });
  };

  // ダブルクリックでリサイズハンドルを表示する（矩形フットプリント物のみ）。
  const startResize = (kind: ResizeKind, id: string) => {
    onSelect({ kind, id });
    setResizeTarget({ kind, id });
  };

  // 方位ダイヤルのドラッグ。中心→ポインタの角度を「上向き(画面 -y)からの時計回り角」に
  // 変換し northOffsetDeg(0..360) に書く。Shift 押下中以外は8方位±4°へソフトスナップ。
  const compassRef = useRef<HTMLDivElement | null>(null);
  const handleCompassPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    const dial = compassRef.current;
    if (!dial) return;
    const rect = dial.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    // atan2(dx, -dy): 上向き=0、時計回り(右回り)が正。
    let deg = (Math.atan2(event.clientX - cx, -(event.clientY - cy)) * 180) / Math.PI;
    deg = ((deg % 360) + 360) % 360;
    if (!event.shiftKey) {
      for (const snapDeg of [0, 45, 90, 135, 180, 225, 270, 315, 360]) {
        if (Math.abs(deg - snapDeg) <= 4) {
          deg = snapDeg % 360;
          break;
        }
      }
    }
    setDaylight({ northOffsetDeg: deg });
  };

  return (
    <section className="plan-panel" aria-label={t("2D平面図エディタ")}>
      <div className="panel-heading">
        <div>
          <p className="eyebrow">2D Plan</p>
          <h2>{t("平面配置")}</h2>
        </div>
        <div className="panel-heading-actions">
          <span className="unit-chip">{scaleLabel}</span>
          <button
            type="button"
            className="focus-toggle"
            title={focusPlan ? t("通常表示に戻す") : t("2Dを最大化")}
            aria-label={focusPlan ? t("通常表示に戻す") : t("2Dを最大化")}
            onClick={onToggleFocusPlan}
          >
            {focusPlan ? "🗗" : "⤢"}
          </button>
        </div>
      </div>

      <div className="plan-meta">
        <span>{t("ズーム")} {Math.round(zoom * 100)}%</span>
        <button type="button" onClick={() => zoomAtCenter(1.2)} aria-label={t("拡大")}>+</button>
        <button type="button" onClick={() => zoomAtCenter(1 / 1.2)} aria-label={t("縮小")}>-</button>
        {/* zoom=1/pan=0 がコンテンツbbox全体のフィット表示（座標系をbbox基準にしたため）。 */}
        <button type="button" onClick={() => scheduleViewport(1, { x: 0, y: 0 }, true)}>{t("全体表示")}</button>
        {/* 縮尺合わせは専用モーダルで実施。背景画像があるときだけ押せる。 */}
        {activeBackground && (
          <button type="button" onClick={() => setScaleModalOpen(true)}>
            {t("縮尺")}
          </button>
        )}
        {canAlignBackground && (
          <button
            type="button"
            className={backgroundAlignMode ? "is-active" : ""}
            onClick={() => setBackgroundAlignMode((current) => !current)}
          >
            {t("背景合わせ")}
          </button>
        )}
        {backgroundAlignMode && (
          <>
            {project.backgroundPlan?.placement && project.backgroundPlan?.scale && (
              <button type="button" onClick={resetBackgroundToFirstFloor}>
                {t("1階基準")}
              </button>
            )}
            <button type="button" className="primary-action" onClick={confirmBackgroundAlignment}>
              {t("完了")}
            </button>
          </>
        )}

        {/* 方位ダイヤル。N矢印をドラッグして実際の北に合わせる。
            図面上に被せると編集対象を隠すため、キャンバス外の操作列に置く。 */}
        <div
          className="plan-compass"
          ref={compassRef}
          onPointerDown={(event) => {
            beginHistoryGroup();
            event.currentTarget.setPointerCapture(event.pointerId);
            handleCompassPointer(event);
          }}
          onPointerMove={(event) => {
            if (event.currentTarget.hasPointerCapture(event.pointerId)) handleCompassPointer(event);
          }}
          onPointerUp={(event) => {
            event.currentTarget.releasePointerCapture(event.pointerId);
            endHistoryGroup();
          }}
          onPointerCancel={endHistoryGroup}
          onLostPointerCapture={endHistoryGroup}
        >
          <svg viewBox="-40 -40 80 80" className="plan-compass-dial">
            <circle cx="0" cy="0" r="34" className="plan-compass-ring" />
            {/* northOffsetDeg だけ時計回りに回す（SVGはy下向きなので正回転=時計回り）。 */}
            <g transform={`rotate(${northOffsetDeg})`}>
              <line x1="0" y1="22" x2="0" y2="-26" className="plan-compass-needle" />
              <polygon points="0,-32 -6,-20 6,-20" className="plan-compass-arrow" />
              <text x="0" y="-12" className="plan-compass-n">N</text>
            </g>
          </svg>
          <span className="plan-compass-label">{t("北")} {Math.round(northOffsetDeg) % 360}°</span>
        </div>
      </div>

      <p className="tool-help">
        {backgroundAlignMode && t("1階の薄い壁を目安に、二階の背景画像をドラッグして位置を合わせます。終わったら完了。")}
        {!backgroundAlignMode && isWallLightAddKind(pendingAdd) && t("壁または吹き抜け内周に近づけると青くハイライト。クリックで壁付け照明を設置。")}
        {!backgroundAlignMode && isWallOpening(pendingAdd) && !isWallLightAddKind(pendingAdd) && t("壁に近づけると青くハイライト。その壁をクリックで設置。設置後は壁上をドラッグで位置調整。")}
        {!backgroundAlignMode && pendingAdd && !isWallOpening(pendingAdd) && t("クリックした位置にオブジェクトを配置します。")}
        {!backgroundAlignMode && !pendingAdd && mode === "select" && !canEditWalls && t("オブジェクトをクリックで選択、ドラッグで移動。何もない所のドラッグで平面図をパン。Deleteで削除。")}
        {!backgroundAlignMode && !pendingAdd && mode === "select" && canEditWalls && t("壁をクリックで選択、ドラッグで移動。Deleteで削除。何もない所のドラッグで平面図をパン。")}
        {!backgroundAlignMode && !pendingAdd && mode === "wall" && t("角に近づけてタップ、または押して引いて離すと壁を作成。スマホは水平/垂直へ強めにスナップします。内側は下のボタンで指定できます。")}
      </p>

      {canEditWalls && mode === "wall" && !pendingAdd && (
        <div className="wall-trace-controls" role="toolbar" aria-label={t("壁作成")}>
          <button type="button" onClick={undoWallPoint} disabled={wallDraft.length === 0}>{t("1点戻す")}</button>
          <span className="wall-side-caption">{t("室内側")}</span>
          <div className="wall-side-toggle" role="group" aria-label={t("壁の内側")}>
            <button
              type="button"
              className={draftInnerSide === undefined ? "is-active" : ""}
              onClick={() => setDraftInnerSide(undefined)}
            >
              {t("間仕切り")}
            </button>
            <button
              type="button"
              className={draftInnerSide === "left" ? "is-active" : ""}
              onClick={() => setDraftInnerSide("left")}
            >
              {draftSideLabels ? draftSideLabels.left : "←"}
            </button>
            <button
              type="button"
              className={draftInnerSide === "right" ? "is-active" : ""}
              onClick={() => setDraftInnerSide("right")}
            >
              {draftSideLabels ? draftSideLabels.right : "→"}
            </button>
          </div>
          <button type="button" className="primary-action" onClick={finishWallTrace}>{t("完了")}</button>
          <button type="button" onClick={finishWallTrace}>{t("中止")}</button>
        </div>
      )}

      <div className="plan-canvas-wrap">
        {GESTURE_DEBUG && (
          <GestureDebugHud
            touchPointersRef={touchPointersRef}
            pinchRef={pinchRef}
            gestureBaseRef={gestureBaseRef}
            viewportRef={viewportRef}
            gestureDebugRef={gestureDebugRef}
            dragging={dragging}
          />
        )}
        <svg
          ref={svgRef}
          className="plan-canvas"
          tabIndex={0}
          style={{ cursor: backgroundAlignMode ? "move" : mode === "wall" || pendingAdd ? "crosshair" : undefined, outline: "none" }}
          viewBox={viewBoxStringFor(1, { x: 0, y: 0 })}
          onPointerDown={handleCanvasPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={handleCanvasPointerEnd}
          onPointerCancel={handleCanvasPointerEnd}
          onPointerLeave={handleCanvasPointerEnd}
          onLostPointerCapture={(event) => {
            if (event.pointerType !== "touch") handleCanvasPointerEnd(event);
          }}
          onDoubleClick={() => {
            clearWallTrace();
          }}
        >
          <defs>
            <pattern id="smallGrid" width={planSize.pxPerM / 2} height={planSize.pxPerM / 2} patternUnits="userSpaceOnUse">
              <path d={`M ${planSize.pxPerM / 2} 0 L 0 0 0 ${planSize.pxPerM / 2}`} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="1" />
            </pattern>
            <pattern id="meterGrid" width={planSize.pxPerM} height={planSize.pxPerM} patternUnits="userSpaceOnUse">
              <rect width={planSize.pxPerM} height={planSize.pxPerM} fill="url(#smallGrid)" />
              <path d={`M ${planSize.pxPerM} 0 L 0 0 0 ${planSize.pxPerM}`} fill="none" stroke="rgba(255,255,255,.16)" strokeWidth="1.4" />
            </pattern>
          </defs>
          <rect
            x={baseViewBox.x}
            y={baseViewBox.y}
            width={baseViewBox.width}
            height={baseViewBox.height}
            fill="transparent"
          />
          <g ref={viewportLayerRef} transform={viewportTransformFor({ zoom, pan })}>
          {/* 背景の間取り図画像。壁と同じ<g>内にSVGネイティブ<image>として置くことで、
              このgのtransform(ズーム/パン)だけで壁と常に同じ座標系に追従する
              （CSS transformでの近似計算・別レイヤー同期は行わない）。壁より前＝下に
              描画されるようgの最初の子にする。ポインタイベントは壁/選択に譲る。 */}
          {activeBackground && bgRender && (
            <image
              href={activeBackground.dataUrl}
              x={bgRender.x}
              y={bgRender.y}
              width={bgRender.width}
              height={bgRender.height}
              opacity={0.42}
              style={{ pointerEvents: "none" }}
              aria-hidden="true"
            />
          )}
          <rect
            x={-VIEW_PAD}
            y={-VIEW_PAD}
            width={planSize.width + VIEW_PAD * 2}
            height={planSize.height + VIEW_PAD * 2}
            fill="transparent"
          />
          <rect
            x={-VIEW_PAD}
            y={-VIEW_PAD}
            width={planSize.width + VIEW_PAD * 2}
            height={planSize.height + VIEW_PAD * 2}
            fill="url(#meterGrid)"
          />
          {/* 非活性階の壁ゴースト（薄く・操作不可）。2階作図時に1階壁を透かして見せ、
              それに合わせて2階壁を引けるようにする。選択ヒット線は付けない。 */}
          {ghostWalls.length > 0 && (
            <GhostWallsLayer ghostWalls={ghostWalls} worldToSvg={worldToSvg} pxPerM={planSize.pxPerM} />
          )}
          {/* 壁作図/追加中はオブジェクトがクリックを奪わないよう pointerEvents を切り、
              背景の handleCanvasPointerDown に素通りさせる。通常操作だけ受け取る。 */}
          <g
            style={{ pointerEvents: canSelectObjects ? "auto" : "none" }}
            onPointerDownCapture={handleObjectPointerDownCapture}
          >
            <RoomOutline
              walls={activeWalls}
              selection={selection}
              worldToSvg={worldToSvg}
              pxPerM={planSize.pxPerM}
              onSelect={handleSelect}
              canEditWalls={canEditWalls}
              mode={mode}
              onWallDragStart={startWallDrag}
            />
            {activeWindows.map((windowItem) => (
              <OpeningPlanItem
                key={windowItem.id}
                windowItem={windowItem}
                walls={project.walls}
                selection={selection}
                worldToSvg={worldToSvg}
                onSelect={handleSelect}
                canDrag={canDragObjects}
                onDragStart={() => setDragging({ kind: "window", id: windowItem.id })}
              />
            ))}
            {activeVoids.map((voidArea) => (
              <VoidPlanItem
                key={voidArea.id}
                voidArea={voidArea}
                planSize={planSize}
                worldToSvg={worldToSvg}
                selected={selection?.kind === "void" && selection.id === voidArea.id}
                onSelect={handleSelect}
                onDragStart={(offset) => setDragging({ kind: "void", id: voidArea.id, offset })}
                onResize={() => startResize("void", voidArea.id)}
                svgToWorld={svgToWorld}
                canDrag={canDragObjects}
              />
            ))}
            {activeCeilingZones.map((zone) => (
              <CeilingZonePlanItem
                key={zone.id}
                zone={zone}
                planSize={planSize}
                worldToSvg={worldToSvg}
                selected={selection?.kind === "ceilingZone" && selection.id === zone.id}
                onSelect={handleSelect}
                onDragStart={(offset) => setDragging({ kind: "ceilingZone", id: zone.id, offset })}
                onResize={() => startResize("ceilingZone", zone.id)}
                svgToWorld={svgToWorld}
                canDrag={canDragObjects}
              />
            ))}
            {activeFloorZones.map((zone) => (
              <FloorZonePlanItem
                key={zone.id}
                zone={zone}
                planSize={planSize}
                worldToSvg={worldToSvg}
                selected={selection?.kind === "floorZone" && selection.id === zone.id}
                onSelect={handleSelect}
                onDragStart={(offset) => setDragging({ kind: "floorZone", id: zone.id, offset })}
                onResize={() => startResize("floorZone", zone.id)}
                svgToWorld={svgToWorld}
                canDrag={canDragObjects}
              />
            ))}
            {activeFurniture.map((item) => (
              <FurniturePlanItem
                key={item.id}
                item={item}
                planSize={planSize}
                worldToSvg={worldToSvg}
                selected={selection?.kind === "furniture" && selection.id === item.id}
                onSelect={handleSelect}
                onDragStart={(offset) => setDragging({ kind: "furniture", id: item.id, offset })}
                onResize={() => startResize("furniture", item.id)}
                svgToWorld={svgToWorld}
                canDrag={canDragObjects}
              />
            ))}
            {activeLights.map((fixture) => (
              <LightPlanItem
                key={fixture.id}
                fixture={fixture}
                worldToSvg={worldToSvg}
                selected={
                  (selection?.kind === "light" && selection.id === fixture.id) ||
                  selectedLightIds.includes(fixture.id)
                }
                togglesOffOnClick={selection?.kind === "light" && selection.id === fixture.id}
                onSelectLight={selectLight}
                onClearSelection={() => handleSelect(null)}
                onDragStart={(offset) => setDragging({ kind: "light", id: fixture.id, offset })}
                svgToWorld={svgToWorld}
                canDrag={canDragObjects}
              />
            ))}
          </g>

          {/* ライトのドラッグ整列スナップが効いている軸のガイド線（一時表示）。 */}
          <SnapGuideLines
            snapGuides={snapGuides}
            worldToSvg={worldToSvg}
            viewBox={viewBox}
            contentBox={contentBox}
          />
          <FurnitureWallCenterGuide wallSnap={furnitureWallGuide} worldToSvg={worldToSvg} />

          {/* ダブルクリックで開いた矩形オブジェクトの辺リサイズハンドル（最前面）。 */}
          {resizeTarget && !pendingAdd && (
            <ResizeHandles
              target={resizeTarget}
              project={project}
              worldToSvg={worldToSvg}
              onEdgePointerDown={(edge) => setResizing({ kind: resizeTarget.kind, id: resizeTarget.id, edge })}
            />
          )}

          {/* 窓/扉/壁付ライトの設置先になる壁のハイライト（最前面・クリック非対象）。 */}
          {isWallOpening(pendingAdd) && wallTarget && (
            <WallTargetHighlight
              wallTarget={wallTarget}
              project={project}
              worldToSvg={worldToSvg}
              pxPerM={planSize.pxPerM}
              previewWidthM={pendingWindowWidthM}
            />
          )}

          {/* 壁トレースのプレビュー（頂点マーカー＋カーソルへのラバーバンド）。最前面・クリック非対象。 */}
          {mode === "wall" && (wallDraft.length > 0 || wallCursor) && (
            <WallTracePreview
              wallDraft={wallDraft}
              wallCursor={wallCursor}
              draftInnerSide={draftInnerSide}
              worldToSvg={worldToSvg}
            />
          )}

          {/* カメラ現在地マーカー: 円=位置、三角=視線方向。最前面・クリック非対象。
              方向は worldToSvg(pos)→worldToSvg(target) の差分から算出（軸向きの取り違え回避）。 */}
          {liveCamera && <CameraMarker liveCamera={liveCamera} worldToSvg={worldToSvg} />}
          </g>
        </svg>

      </div>

      {scaleModalOpen && activeBackground?.dataUrl && bgNaturalSize && (
        <ScaleCalibrationModal
          imageUrl={activeBackground.dataUrl}
          naturalSize={bgNaturalSize}
          onCancel={() => setScaleModalOpen(false)}
          onConfirm={(p1, p2, mm) => {
            calibrateFromImagePixels(p1, p2, mm);
            setScaleModalOpen(false);
          }}
        />
      )}
    </section>
  );
};
