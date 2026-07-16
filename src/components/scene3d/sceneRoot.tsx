import { ContactShadows, OrbitControls, Sky } from "@react-three/drei";
import { useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { FloorTag, Project } from "../../types";
import { colorTemperatureToLinearColor } from "../../utils/lighting";
import { DEFAULT_DAYLIGHT, sunVector } from "../../utils/sun";
import { CameraViewSync } from "./cameraViewSync";
import { EditModeContext, PathTracedContext, PlacementContext, type WallHover } from "./contexts";
import { Outdoors, skyColorForAltitude, SunLight } from "./daylight";
import { NormalDebugHelpers } from "./debugHelpers";
import { FixtureMesh } from "./fixtureMeshes";
import { DuctRail, FurnitureMesh } from "./furnitureMeshes";
import {
  DAYLIGHT_FILL_ALTITUDE_GAIN,
  DAYLIGHT_FILL_BASE_INTENSITY,
  DAYLIGHT_FILL_MAX_OPENING_SCALE,
  DAYLIGHT_FILL_REFERENCE_OPENING_RATIO,
  effectiveLightIdSet,
  RASTER_BOUNCE_AMBIENT_RATIO,
  RASTER_BOUNCE_CEILING_FACTOR,
  RASTER_BOUNCE_MAX_AMBIENT,
  rasterBounceIntensity,
  realtimeShadowLightIdSet
} from "./lightingFill";
import { isLuxLabEnabled } from "../../utils/luxLab";
import { CanvasReady, PathTracerController } from "./liveTracer";
import { LuxHeatmap } from "./luxHeatmap";
import { createWoodTexture, materialById } from "./materials";
import { PlacementLayer } from "./placementLayer";
import { ReflectionProbe } from "./reflectionProbe";
import { computeFloorBounds } from "./roomGeometry";
import { RoomShell } from "./roomShell";
import {
  DESKTOP_ORBIT_SPEED,
  TOUCH_ORBIT_SPEED,
  TouchLook,
  TouchPinchDolly,
  TrackpadWheelPan,
  usePrefersTouchControls
} from "./touchControls";
import type { Scene3DProps } from "./types";
import { computeUpperVoidRegion, UpperVoidLevel } from "./upperVoid";

export const SceneRoot = ({
  project,
  selection,
  onSelect,
  onCanvasReady,
  onRenderContextReady,
  debugMode,
  viewMode,
  mode,
  onLiveTraceStatus,
  pendingAdd = null,
  onPlaceObject,
  onPlaceOnWall,
  canEditWalls
}: Scene3DProps) => {
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const prefersTouchControls = usePrefersTouchControls();
  const orbitSpeed = prefersTouchControls ? TOUCH_ORBIT_SPEED : DESKTOP_ORBIT_SPEED;
  // 壁ライト(wallspot)配置中の壁上カーソル。壁メッシュが onWallHover で更新する。
  const [wallCursor, setWallCursor] = useState<WallHover>(null);
  const materialMap = useMemo(() => materialById(project.materials), [project.materials]);
  // 「1階/2階」: 活性階のオブジェクトだけを描画する。各オブジェクト群を floor で絞った
  // 浅いコピーを単一の真実として下流（RoomShell/Floor/Ceiling/BaseBoards/配置補助/パストレ）へ渡し、
  // 床/天井/baseboard/室内ポリゴンも自動的に活性階の壁に追従させる（今回は活性階のみ表示）。
  const activeFloor = project.activeFloor ?? 1;
  const floorProject = useMemo<Project>(() => {
    const onFloor = <T extends { floor?: FloorTag }>(item: T) => (item.floor ?? 1) === activeFloor;
    return {
      ...project,
      walls: project.walls.filter(onFloor),
      furniture: project.furniture.filter(onFloor),
      lights: project.lights.filter(onFloor),
      windows: project.windows.filter(onFloor),
      voids: project.voids.filter(onFloor),
      ceilingZones: (project.ceilingZones ?? []).filter(onFloor),
      floorZones: (project.floorZones ?? []).filter(onFloor)
    };
  }, [project, activeFloor]);
  const floorTexture = useMemo(createWoodTexture, []);
  const floorMaterial = materialMap.get("floor-oak") ?? project.materials[0];
  const pathTraced = viewMode === "realistic";

  // 1階表示中だけ、吹き抜け(1階void)を介して上方に繋がる「2階の連続床領域」を抽出する。
  // 2階壁・1階voidが無ければ null（既定の2階なしデモは従来どおり不変）。
  const upperVoid = useMemo(() => {
    if (activeFloor !== 1) return null;
    const upperWalls = project.walls.filter((w) => (w.floor ?? 1) === 2);
    const lowerVoids = project.voids.filter((v) => (v.floor ?? 1) === 1);
    return computeUpperVoidRegion(upperWalls, lowerVoids);
  }, [activeFloor, project.walls, project.voids]);
  const upperWalls = useMemo(() => project.walls.filter((w) => (w.floor ?? 1) === 2), [project.walls]);
  const upperCeilingMaterial =
    materialMap.get("cal-ceiling-white") ?? materialMap.get("wall-white") ?? project.materials[0];
  // 室内仕上げ床のレベル。室内オブジェクト(家具/照明)も床と同じだけ持ち上げる。未設定(=0)で従来同一。
  const floorLevelM = project.room.floorLevelM ?? 0;
  const floorBounds = useMemo(() => computeFloorBounds(floorProject), [floorProject]);
  const floorAreaM2 = floorBounds.sizeX * floorBounds.sizeZ;
  const effectiveLightIds = useMemo(
    () => effectiveLightIdSet(floorProject.lights, floorBounds),
    [floorProject.lights, floorBounds]
  );
  const shadowLightIds = useMemo(
    () => realtimeShadowLightIdSet(floorProject.lights, effectiveLightIds),
    [floorProject.lights, effectiveLightIds]
  );

  const daylight = project.daylight ?? DEFAULT_DAYLIGHT;
  const sun = useMemo(() => sunVector(daylight), [daylight]);
  const sunUp = daylight.enabled && sun.altitudeDeg > 0;
  // 空色（夜=既定の暗色 / 日中=空色）。scene.background 経由でパストレの環境光にもなる。
  const backgroundColor = useMemo(
    () => (daylight.enabled ? skyColorForAltitude(sun.altitudeDeg).getStyle() : "#15110d"),
    [daylight.enabled, sun.altitudeDeg]
  );
  const roomSpan = Math.max(project.room.widthM, project.room.depthM);

  // 昼光の空光フィル（ラスター用）。パストレでは Sky 環境が窓越しの拡散光と GI を
  // 担って昼の室内は明るくなるが、ラスターにはその経路が無く昼でも夜のように沈む。
  // 太陽高度と床面積に対する開口面積に応じた空色ヘミライトで近似する。
  // 非物理なので、窓なしとパストレ常駐時は使わない。
  const daylightFill = useMemo(() => {
    if (!sunUp) return null;
    const openingAreaM2 = floorProject.windows.reduce((area, opening) => {
      const style = opening.style ?? (opening.hasGlass ? "window" : "opening");
      return style === "door" ? area : area + opening.widthM * opening.heightM;
    }, 0);
    if (openingAreaM2 <= 0) return null;
    const sinAlt = Math.max(0, Math.sin((sun.altitudeDeg * Math.PI) / 180));
    // 一様なヘミライトは開口の方向や室奥への減衰を表せないため、基準開口率の2倍で頭打ちにする。
    const openingScale = Math.min(
      DAYLIGHT_FILL_MAX_OPENING_SCALE,
      openingAreaM2 / floorAreaM2 / DAYLIGHT_FILL_REFERENCE_OPENING_RATIO
    );
    return {
      sky: skyColorForAltitude(sun.altitudeDeg).getStyle(),
      ground: "#7d7568",
      intensity: (DAYLIGHT_FILL_BASE_INTENSITY + DAYLIGHT_FILL_ALTITUDE_GAIN * sinAlt) * openingScale
    };
  }, [floorAreaM2, floorProject.windows, sunUp, sun.altitudeDeg]);

  // 高速ラスター用の擬似間接光（バウンスフィル）。点いている照明の総光束と平均色温度に
  // 連動した暖色フィルで、直接ビームの外にある壁・天井もぼんやり持ち上がる＝反射の近似。
  // 物理ではないのでパストレ常駐時は使わない（本物のGIに置き換わる）。
  const bounceFill = useMemo(() => {
    let lumens = 0;
    let kWeighted = 0;
    for (const light of floorProject.lights) {
      if (!effectiveLightIds.has(light.id)) continue;
      const lm = light.lumens * light.dimmer * 0.01;
      lumens += lm;
      kWeighted += light.colorTemperatureK * lm;
    }
    const kelvin = lumens > 0 ? kWeighted / lumens : 2700;
    const warmColor = colorTemperatureToLinearColor(kelvin);
    const warm = warmColor;
    // 下向き面（天井）側も少し起こす。直接光を外した壁・床が黒く沈むのを防ぎつつ、
    // ダウンライトの下方配光と床の光だまりは残すため、床側よりは暗くする。
    const warmCeiling = warmColor.clone().multiplyScalar(RASTER_BOUNCE_CEILING_FACTOR);
    // 床面積当たり光束→フィル強度。線形だと家庭用の低〜中光束で反射が弱すぎるため、
    // 早めに立ち上がって多灯時は飽和するカーブにする。
    const intensity = rasterBounceIntensity(lumens, floorAreaM2);
    const ambient = Math.min(RASTER_BOUNCE_MAX_AMBIENT, intensity * RASTER_BOUNCE_AMBIENT_RATIO);
    return { warm, warmCeiling, intensity, ambient };
  }, [floorAreaM2, floorProject.lights, effectiveLightIds]);

  return (
    <EditModeContext.Provider value={mode}>
    <PathTracedContext.Provider value={pathTraced}>
    <PlacementContext.Provider value={{ pendingAdd: pathTraced ? null : pendingAdd, onPlaceOnWall, onWallHover: setWallCursor }}>
      <CameraViewSync
        view={project.camera}
        controlsRef={controlsRef}
      />
      {prefersTouchControls && <TouchLook controlsRef={controlsRef} />}
      <TouchPinchDolly controlsRef={controlsRef} />
      <TrackpadWheelPan controlsRef={controlsRef} />
      <color attach="background" args={[backgroundColor]} />
      {/* 編集ビュー用の環境反射。パストレ時は内部で無効化される(environmentはliveTracerが所有)。 */}
      <ReflectionProbe />
      <Outdoors />
      {sunUp && <SunLight dir={sun.dir} altitudeDeg={sun.altitudeDeg} roomSpan={roomSpan} />}
      {/* ラスターのみ見栄え用に drei の Sky を重ねる。scene.background は変えないので
          上の color と併用でき、パストレ時は不要（背景色が環境光になる）。 */}
      {!pathTraced && sunUp && (
        <Sky distance={450} sunPosition={[sun.dir.x, sun.dir.y, sun.dir.z]} />
      )}
      {/* 非物理の補助光・霧はラスター編集時の視認性確保のためだけに使う。
          パストレ常駐時は壁・天井・床の反射による本物の間接光に置き換える。 */}
      {!pathTraced && (
        <>
          {/* 霧は夜間の視認性・雰囲気用。昼はパストレ（空光で明るい）との乖離を生むため外す。 */}
          {!sunUp && <fog attach="fog" args={["#060504", 8, 16]} />}
          {daylightFill ? (
            <hemisphereLight args={[daylightFill.sky, daylightFill.ground, daylightFill.intensity]} />
          ) : !sunUp ? (
            <hemisphereLight args={["#2b2a25", "#0a0805", 0.34]} />
          ) : null}
          {!sunUp && <directionalLight position={[-2, 4, 3]} intensity={0.12} color="#c9d6ff" />}
          {/* 照明量に連動した暖色バウンスフィル（疑似間接光）。skyColor=上向き面(床)に当たり、
              groundColor=下向き面(天井)に当たる。壁はその中間色になるため、直接光が外れた
              床・壁・天井をまとめて少し持ち上げ、空間全体に光が回る見え方へ寄せる。 */}
          {bounceFill.intensity > 0.001 && (
            <>
              <ambientLight color={bounceFill.warm} intensity={bounceFill.ambient} />
              <hemisphereLight args={[bounceFill.warm, bounceFill.warmCeiling, bounceFill.intensity]} />
            </>
          )}
        </>
      )}
      {/* 配置モード中はクリックが選択解除に化けないよう抑止する（誤操作防止）。 */}
      <group onPointerMissed={() => { if (!pendingAdd) onSelect(null); }}>
        <RoomShell
          project={floorProject}
          materialMap={materialMap}
          floorTexture={floorTexture}
          floorMaterial={floorMaterial}
          selection={selection}
          onSelect={onSelect}
          debugMode={debugMode}
          upperVoid={upperVoid}
          canEditWalls={canEditWalls}
        />
        {/* 室内オブジェクトも室内床レベルに合わせて持ち上げる（floorLevelM=0で従来同一）。 */}
        <group position={[0, floorLevelM, 0]}>
          {floorProject.furniture.map((item) => (
            <FurnitureMesh
              key={item.id}
              project={floorProject}
              item={item}
              materialMap={materialMap}
              selected={selection?.kind === "furniture" && selection.id === item.id}
              onSelect={onSelect}
              debugMode={debugMode}
            />
          ))}
          <DuctRail />
          {floorProject.lights.map((fixture) => (
            <FixtureMesh
              key={fixture.id}
              fixture={fixture}
              emitsLight={effectiveLightIds.has(fixture.id)}
              castsRealtimeShadow={shadowLightIds.has(fixture.id)}
              selected={selection?.kind === "light" && selection.id === fixture.id}
              onSelect={onSelect}
              debugMode={debugMode}
            />
          ))}
          {debugMode === "normals" && <NormalDebugHelpers project={floorProject} />}
        </group>
        {/* 1階表示中: 吹き抜けと繋がる2階の床/壁/天井だけを上方レベルに見せる（実構造）。
            floorLevelM 補正を効かせるため室内床と同じ group 文脈に置く。 */}
        {upperVoid && (
          <group position={[0, floorLevelM, 0]}>
            <UpperVoidLevel
              region={upperVoid}
              upperWalls={upperWalls}
              floorY={project.room.ceilingHeightM}
              ceilingY={project.room.ceilingHeightM * 2}
              wallHeightM={project.room.ceilingHeightM}
              floorMaterial={floorMaterial}
              floorTexture={floorTexture}
              ceilingMaterial={upperCeilingMaterial}
              materialMap={materialMap}
              debugMode={debugMode}
            />
          </group>
        )}
      </group>
      {/* 追加配置のゴーストプレビュー。非物理の編集補助なので常駐パストレ時は出さない。
          luxIgnore: 照度ヒートマップ(?lux=1)の遮蔽レイキャストからゴーストを除外する目印。 */}
      {!pathTraced && pendingAdd && (
        <group userData={{ luxIgnore: true }}>
          <PlacementLayer
            pendingAdd={pendingAdd}
            project={floorProject}
            onPlaceObject={onPlaceObject}
            onPlaceOnWall={onPlaceOnWall}
            wallCursor={wallCursor}
          />
        </group>
      )}
      {/* 照度ヒートマップ（?lux=1 の隠し機能）。常駐パストレ時は内部で非表示になる。 */}
      {isLuxLabEnabled() && (
        <LuxHeatmap
          project={floorProject}
          fullProject={project}
          floorBounds={floorBounds}
          floorLevelM={floorLevelM}
          effectiveLightIds={effectiveLightIds}
          upperVoidCeilingHeightM={upperVoid ? project.room.ceilingHeightM * 2 : undefined}
        />
      )}
      {!pathTraced && (
        <ContactShadows
          position={[0, 0.012, 0]}
          opacity={0.36}
          scale={10}
          blur={2.7}
          far={3.2}
          resolution={1024}
        />
      )}
      <OrbitControls
        ref={controlsRef}
        makeDefault
        enableDamping
        enablePan
        enableRotate={!prefersTouchControls}
        enableZoom={!prefersTouchControls}
        screenSpacePanning
        keyEvents={false}
        touches={{ ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN }}
        rotateSpeed={orbitSpeed.rotate}
        zoomSpeed={orbitSpeed.zoom}
        panSpeed={orbitSpeed.pan}
        dampingFactor={0.08}
        minDistance={1.2}
        maxDistance={12}
        minPolarAngle={Math.PI * 0.05}
        maxPolarAngle={Math.PI * 0.95}
      />
      {pathTraced && (
        <PathTracerController
          project={project}
          debugMode={debugMode}
          onStatus={onLiveTraceStatus}
        />
      )}
      <CanvasReady onReady={onCanvasReady} onRenderContextReady={onRenderContextReady} />
    </PlacementContext.Provider>
    </PathTracedContext.Provider>
    </EditModeContext.Provider>
  );
};
