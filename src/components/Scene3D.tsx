import { ContactShadows, OrbitControls, Sky } from "@react-three/drei";
import { Canvas, ThreeEvent, useFrame, useThree } from "@react-three/fiber";
import type { MutableRefObject, ReactNode } from "react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { DenoiseMaterial, WebGLPathTracer } from "three-gpu-pathtracer";
import { GenerateMeshBVHWorker } from "three-mesh-bvh/src/workers/index.js";
import { FullScreenQuad } from "three/examples/jsm/postprocessing/Pass.js";
import {
  buildSkyEnvironment,
  SKY_ENVIRONMENT_INTENSITY,
  SUN_INTENSITY_FACTOR,
  type SkyEnvironment
} from "../rendering/skyEnvironment";
import type { RenderDebugMode } from "../rendering/pathTracer";
import type { RenderContext } from "../rendering/renderContext";
import type {
  CeilingZone,
  FloorTag,
  FloorZone,
  FurnitureItem,
  LightFixture,
  MaterialPreset,
  Project,
  ProjectCamera,
  Selection,
  VoidArea,
  VoidSide,
  WallSegment,
  WindowOpening
} from "../types";
import { bracketRoomwardOffset, colorTemperatureToHex, lumensToPhysicalPower } from "../utils/lighting";
import { getFurniturePreset } from "../data/furnitureCatalog";
import { getWindowPreset } from "../data/windowCatalog";
import { isCeilingLightAddKind, isWallLightAddKind } from "../data/fixtureAddKinds";
import { isAimable } from "../data/fixtureCatalog";
import { useProjectStore } from "../store/projectStore";
import { degToRad } from "../utils/units";
import { DEFAULT_DAYLIGHT, sunVector } from "../utils/sun";
import { ceilingMountHeightAt, voidCeilingHeightAt } from "../utils/ceiling";
import {
  isWallMountedFixture,
  nearestWallMountSurfaceAt,
  parseVoidWallId,
  visibleVoidSides,
  voidWallId,
  wallMountedLightPlacementAt
} from "../utils/fixtureMounting";
import { constrainFurniturePlacement } from "../utils/furniturePlacement";
import { wallInwardNormal } from "../utils/wallGeometry";

export type ViewMode = "raster" | "realistic";

export type LiveTraceStatus = {
  phase: "off" | "building" | "rendering" | "converged";
  samples: number;
};

type Scene3DProps = {
  project: Project;
  selection: Selection;
  onSelect: (selection: Selection) => void;
  onCanvasReady: (canvas: HTMLCanvasElement) => void;
  onRenderContextReady: (context: RenderContext) => void;
  debugMode: RenderDebugMode;
  viewMode: ViewMode;
  mode: EditMode;
  onLiveTraceStatus?: (status: LiveTraceStatus) => void;
  // 3Dビューポートでの追加配置（ゴーストプレビュー）。pendingAdd がある間だけ有効。
  pendingAdd?: string | null;
  onPlaceObject?: (at: { x: number; z: number }) => void;
  // 壁配置。壁ライト(wallspot)はカーソルの壁上ワールドYを heightM で渡し、自由な高さに付ける。
  // 窓/扉は従来どおり heightM 省略（種別既定の高さ）。
  onPlaceOnWall?: (wallId: string, centerRatio: number, heightM?: number) => void;
  canEditWalls: boolean;
};

export type EditMode = "select" | "move" | "delete";
// 操作モードをシーン全体へ配る。通常の選択モードでドラッグ移動も行う。
const EditModeContext = createContext<EditMode>("select");
const useEditMode = () => useContext(EditModeContext);

type TouchDragGuard = { hasMultiTouch: () => boolean };
const TouchDragGuardContext = createContext<TouchDragGuard>({ hasMultiTouch: () => false });
const useTouchDragGuard = () => useContext(TouchDragGuardContext);

const TOUCH_ORBIT_SPEED = {
  rotate: 0.45,
  zoom: 0.3,
  pan: 0.35
};

const TOUCH_PINCH_DOLLY_M_PER_PX = 0.0025;
const TOUCH_PINCH_DOLLY_MAX_STEP_M = 0.08;

const DESKTOP_ORBIT_SPEED = {
  rotate: 1,
  zoom: 1,
  pan: 1
};

const usePrefersTouchControls = () => {
  const [prefersTouchControls, setPrefersTouchControls] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(pointer: coarse)");
    const update = () => setPrefersTouchControls(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return prefersTouchControls;
};

const TouchDragGuardProvider = ({ children }: { children: ReactNode }) => {
  const gl = useThree((state) => state.gl);
  const touchPointerIds = useRef(new Set<number>());
  useEffect(() => {
    const canvas = gl.domElement;
    const track = (event: PointerEvent) => {
      if (event.pointerType === "touch") touchPointerIds.current.add(event.pointerId);
    };
    const untrack = (event: PointerEvent) => {
      if (event.pointerType === "touch") touchPointerIds.current.delete(event.pointerId);
    };
    const clear = () => touchPointerIds.current.clear();
    canvas.addEventListener("pointerdown", track, { capture: true });
    canvas.addEventListener("pointerup", untrack, { capture: true });
    canvas.addEventListener("pointercancel", untrack, { capture: true });
    window.addEventListener("blur", clear);
    return () => {
      canvas.removeEventListener("pointerdown", track, { capture: true });
      canvas.removeEventListener("pointerup", untrack, { capture: true });
      canvas.removeEventListener("pointercancel", untrack, { capture: true });
      window.removeEventListener("blur", clear);
    };
  }, [gl.domElement]);

  const value = useMemo<TouchDragGuard>(
    () => ({ hasMultiTouch: () => touchPointerIds.current.size >= 2 }),
    []
  );
  return <TouchDragGuardContext.Provider value={value}>{children}</TouchDragGuardContext.Provider>;
};

type TouchPoint = { x: number; y: number };

const TouchPinchDolly = ({
  controlsRef
}: {
  controlsRef: MutableRefObject<OrbitControlsImpl | null>;
}) => {
  const { camera, gl } = useThree();
  const pointersRef = useRef(new Map<number, TouchPoint>());
  const pinchDistanceRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = gl.domElement;
    const forward = new THREE.Vector3();
    const move = new THREE.Vector3();
    const targetDir = new THREE.Vector3();

    const pinchDistance = () => {
      const points = Array.from(pointersRef.current.values());
      if (points.length < 2) return null;
      const [a, b] = points;
      return Math.hypot(a.x - b.x, a.y - b.y);
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType !== "touch") return;
      pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      pinchDistanceRef.current = pinchDistance();
    };

    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType !== "touch" || !pointersRef.current.has(event.pointerId)) return;
      pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      const nextDistance = pinchDistance();
      const prevDistance = pinchDistanceRef.current;
      pinchDistanceRef.current = nextDistance;
      if (nextDistance === null || prevDistance === null) return;
      const controls = controlsRef.current;
      if (!controls) return;
      const distanceDeltaPx = nextDistance - prevDistance;
      if (Math.abs(distanceDeltaPx) > 0.4) {
        event.preventDefault();
      }

      forward.copy(camera.getWorldDirection(forward));
      forward.y = 0;
      if (forward.lengthSq() < 1e-6) {
        targetDir.copy(controls.target).sub(camera.position);
        targetDir.y = 0;
        forward.copy(targetDir);
      }
      if (forward.lengthSq() < 1e-6) return;
      forward.normalize();

      const deltaM = THREE.MathUtils.clamp(
        distanceDeltaPx * TOUCH_PINCH_DOLLY_M_PER_PX,
        -TOUCH_PINCH_DOLLY_MAX_STEP_M,
        TOUCH_PINCH_DOLLY_MAX_STEP_M
      );
      if (Math.abs(deltaM) < 1e-4) return;
      move.copy(forward).multiplyScalar(deltaM);
      camera.position.add(move);
      controls.target.add(move);
      controls.update();
    };

    const onPointerEnd = (event: PointerEvent) => {
      if (event.pointerType !== "touch") return;
      pointersRef.current.delete(event.pointerId);
      pinchDistanceRef.current = pinchDistance();
    };

    const clear = () => {
      pointersRef.current.clear();
      pinchDistanceRef.current = null;
    };

    canvas.addEventListener("pointerdown", onPointerDown, { capture: true });
    canvas.addEventListener("pointermove", onPointerMove, { capture: true, passive: false });
    canvas.addEventListener("pointerup", onPointerEnd, { capture: true });
    canvas.addEventListener("pointercancel", onPointerEnd, { capture: true });
    window.addEventListener("blur", clear);
    return () => {
      canvas.removeEventListener("pointerdown", onPointerDown, { capture: true });
      canvas.removeEventListener("pointermove", onPointerMove, { capture: true });
      canvas.removeEventListener("pointerup", onPointerEnd, { capture: true });
      canvas.removeEventListener("pointercancel", onPointerEnd, { capture: true });
      window.removeEventListener("blur", clear);
    };
  }, [camera, controlsRef, gl.domElement]);

  return null;
};

// パストレ常駐モードでは選択枠・グロー・補助光など非物理の演出を隠す。
// これにより編集用シーンをそのまま物理ベースで描画でき、見たまま=最終結果になる。
const PathTracedContext = createContext(false);
const usePathTraced = () => useContext(PathTracedContext);

// 追加配置中かどうかを編集メッシュへ配る。配置中は子メッシュのクリックを
// 「選択」ではなく「配置」に振り替える/素通りさせる（パストレ常駐時は null=無効）。
// 壁ライト(wallspot)のゴーストプレビュー用に、壁メッシュが拾ったカーソルの壁上ヒットを共有する。
type WallHover = { wallId: string; ratio: number; x: number; y: number; z: number; angle: number } | null;
type PlacementCtx = {
  pendingAdd: string | null;
  onPlaceOnWall?: (wallId: string, centerRatio: number, heightM?: number) => void;
  // 壁メッシュ→SceneRoot へ壁上カーソルを上げる（wallspot 配置時のみ使用）。
  onWallHover?: (hit: WallHover) => void;
};
const PlacementContext = createContext<PlacementCtx>({ pendingAdd: null });
const usePlacement = () => useContext(PlacementContext);
const isWallPending = (pendingAdd: string | null) =>
  pendingAdd === "door" || isWallLightAddKind(pendingAdd) || (pendingAdd?.startsWith("window") ?? false);

// 太陽高度から空色を補間する。昼=明るい空青、日の出/日没=橙、夜=暗い紺。
// scene.background に色を入れると常駐パストレが GradientEquirect 環境光として拾う。
const NIGHT_SKY = new THREE.Color("#06070b");
const DUSK_SKY = new THREE.Color("#e8915a");
const DAY_SKY = new THREE.Color("#9ec6e8");
export const skyColorForAltitude = (altitudeDeg: number): THREE.Color => {
  if (altitudeDeg <= 0) return NIGHT_SKY.clone();
  if (altitudeDeg < 8) {
    // 地平線付近は橙→紺をブレンド（薄明）。
    const t = altitudeDeg / 8;
    return NIGHT_SKY.clone().lerp(DUSK_SKY, t);
  }
  // 高度が上がるにつれ橙→空青。
  const t = Math.min(1, (altitudeDeg - 8) / 24);
  return DUSK_SKY.clone().lerp(DAY_SKY, t);
};

// 太陽光の色。低高度=暖色、高高度=ほぼ白。
const SUN_WARM = new THREE.Color("#ffd9a8");
const SUN_WHITE = new THREE.Color("#fff4e6");
const sunColorForAltitude = (altitudeDeg: number): THREE.Color => {
  const t = Math.min(1, Math.max(0, altitudeDeg / 35));
  return SUN_WARM.clone().lerp(SUN_WHITE, t);
};

// dataURL画像を一度だけ読み込み、面ごとにリピートを変えたテクスチャを返す。
const wallpaperImageCache = new Map<string, HTMLImageElement>();
const useWallpaperTexture = (
  dataUrl: string | undefined,
  repeatX: number,
  repeatY: number
): THREE.Texture | null => {
  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  useEffect(() => {
    if (!dataUrl) {
      setTexture(null);
      return;
    }
    let cancelled = false;
    const build = (image: HTMLImageElement) => {
      if (cancelled) return;
      const tex = new THREE.Texture(image);
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.repeat.set(Math.max(0.01, repeatX), Math.max(0.01, repeatY));
      tex.anisotropy = 4;
      tex.needsUpdate = true;
      setTexture(tex);
    };
    const cached = wallpaperImageCache.get(dataUrl);
    if (cached) {
      build(cached);
    } else {
      const image = new Image();
      image.onload = () => {
        wallpaperImageCache.set(dataUrl, image);
        build(image);
      };
      image.src = dataUrl;
    }
    return () => {
      cancelled = true;
    };
  }, [dataUrl, repeatX, repeatY]);
  return texture;
};

// 3Dビュー上で床平面に沿ってオブジェクトをドラッグ移動するためのハンドラ群。
// ドラッグ中はOrbitControlsを無効化し、ポインタを掴んだ点との相対位置を保つ。
const useFloorDrag = (
  current: { x: number; z: number },
  floorY: number,
  onMove: (x: number, z: number) => void
) => {
  const controls = useThree((state) => state.controls) as { enabled: boolean } | null;
  const touchGuard = useTouchDragGuard();
  const dragging = useRef(false);
  const grab = useRef({ x: 0, z: 0 });
  const plane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), []);
  const hit = useMemo(() => new THREE.Vector3(), []);
  const stopDrag = (event: ThreeEvent<PointerEvent>) => {
    if (!dragging.current) return;
    dragging.current = false;
    (event.target as Element | null)?.releasePointerCapture?.(event.pointerId);
    if (controls) controls.enabled = true;
  };

  return {
    onPointerDown: (event: ThreeEvent<PointerEvent>) => {
      if (event.button !== 0) return;
      if (event.pointerType === "touch" && touchGuard.hasMultiTouch()) return;
      event.stopPropagation();
      plane.constant = -floorY;
      if (!event.ray.intersectPlane(plane, hit)) return;
      grab.current = { x: current.x - hit.x, z: current.z - hit.z };
      dragging.current = true;
      (event.target as Element | null)?.setPointerCapture?.(event.pointerId);
      if (controls) controls.enabled = false;
    },
    onPointerMove: (event: ThreeEvent<PointerEvent>) => {
      if (!dragging.current) return;
      if (event.pointerType === "touch" && touchGuard.hasMultiTouch()) {
        stopDrag(event);
        return;
      }
      if (event.ray.intersectPlane(plane, hit)) {
        onMove(hit.x + grab.current.x, hit.z + grab.current.z);
      }
    },
    onPointerUp: (event: ThreeEvent<PointerEvent>) => {
      stopDrag(event);
    },
    onPointerCancel: (event: ThreeEvent<PointerEvent>) => {
      stopDrag(event);
    }
  };
};

// 天井照明のように視点とほぼ同じ高さの物体は、水平面レイ交差だと
// 平行に近くなって飛びやすい。カメラ方向に向いた縦平面で掴み、
// x/z だけを移動量として使う。
const useViewPlaneDrag = (
  current: { x: number; z: number },
  anchorY: number,
  onMove: (x: number, z: number) => void
) => {
  const camera = useThree((state) => state.camera);
  const controls = useThree((state) => state.controls) as { enabled: boolean } | null;
  const touchGuard = useTouchDragGuard();
  const dragging = useRef(false);
  const grab = useRef({ x: 0, z: 0 });
  const plane = useMemo(() => new THREE.Plane(), []);
  const hit = useMemo(() => new THREE.Vector3(), []);
  const anchor = useMemo(() => new THREE.Vector3(), []);
  const normal = useMemo(() => new THREE.Vector3(), []);

  const setDragPlane = () => {
    anchor.set(current.x, anchorY, current.z);
    normal.set(camera.position.x - current.x, 0, camera.position.z - current.z);
    if (normal.lengthSq() < 1e-6) normal.set(0, 0, 1);
    normal.normalize();
    plane.setFromNormalAndCoplanarPoint(normal, anchor);
  };

  const stopDrag = (event: ThreeEvent<PointerEvent>) => {
    if (!dragging.current) return;
    dragging.current = false;
    (event.target as Element | null)?.releasePointerCapture?.(event.pointerId);
    if (controls) controls.enabled = true;
  };

  return {
    onPointerDown: (event: ThreeEvent<PointerEvent>) => {
      if (event.button !== 0) return;
      if (event.pointerType === "touch" && touchGuard.hasMultiTouch()) return;
      event.stopPropagation();
      setDragPlane();
      if (!event.ray.intersectPlane(plane, hit)) return;
      grab.current = { x: current.x - hit.x, z: current.z - hit.z };
      dragging.current = true;
      (event.target as Element | null)?.setPointerCapture?.(event.pointerId);
      if (controls) controls.enabled = false;
    },
    onPointerMove: (event: ThreeEvent<PointerEvent>) => {
      if (!dragging.current) return;
      if (event.pointerType === "touch" && touchGuard.hasMultiTouch()) {
        stopDrag(event);
        return;
      }
      if (event.ray.intersectPlane(plane, hit)) {
        onMove(hit.x + grab.current.x, hit.z + grab.current.z);
      }
    },
    onPointerUp: (event: ThreeEvent<PointerEvent>) => {
      stopDrag(event);
    },
    onPointerCancel: (event: ThreeEvent<PointerEvent>) => {
      stopDrag(event);
    }
  };
};

// 3Dビュー上で平面ヒットを取りながらドラッグするための汎用ハンドラ（リサイズハンドル用）。
const useHandleDrag = (getPlane: () => THREE.Plane, onHit: (point: THREE.Vector3) => void) => {
  const controls = useThree((state) => state.controls) as { enabled: boolean } | null;
  const touchGuard = useTouchDragGuard();
  const dragging = useRef(false);
  const hit = useMemo(() => new THREE.Vector3(), []);
  const stopDrag = (event: ThreeEvent<PointerEvent>) => {
    if (!dragging.current) return;
    dragging.current = false;
    (event.target as Element | null)?.releasePointerCapture?.(event.pointerId);
    if (controls) controls.enabled = true;
  };
  return {
    onPointerDown: (event: ThreeEvent<PointerEvent>) => {
      if (event.button !== 0) return;
      if (event.pointerType === "touch" && touchGuard.hasMultiTouch()) return;
      event.stopPropagation();
      dragging.current = true;
      (event.target as Element | null)?.setPointerCapture?.(event.pointerId);
      if (controls) controls.enabled = false;
    },
    onPointerMove: (event: ThreeEvent<PointerEvent>) => {
      if (!dragging.current) return;
      if (event.pointerType === "touch" && touchGuard.hasMultiTouch()) {
        stopDrag(event);
        return;
      }
      if (event.ray.intersectPlane(getPlane(), hit)) onHit(hit);
    },
    onPointerUp: (event: ThreeEvent<PointerEvent>) => {
      stopDrag(event);
    },
    onPointerCancel: (event: ThreeEvent<PointerEvent>) => {
      stopDrag(event);
    }
  };
};

// 箱の1面をヒット点まで動かしてリサイズ（反対面を固定, Y回転考慮）。y軸は下面=床を固定。
const resizeBox3D = (
  center: { x: number; y: number; z: number },
  size: { x: number; y: number; z: number },
  rotationYDeg: number,
  axis: "x" | "z" | "y",
  sign: 1 | -1,
  hit: { x: number; y: number; z: number }
): { center: { x: number; y: number; z: number }; size: { x: number; y: number; z: number } } => {
  const MIN = 0.2;
  if (axis === "y") {
    const bottom = center.y - size.y / 2;
    const newSizeY = Math.max(MIN, hit.y - bottom);
    return { center: { ...center, y: bottom + newSizeY / 2 }, size: { ...size, y: newSizeY } };
  }
  const th = (rotationYDeg * Math.PI) / 180;
  const c = Math.cos(th);
  const s = Math.sin(th);
  const dx = hit.x - center.x;
  const dz = hit.z - center.z;
  const local = axis === "x" ? dx * c - dz * s : dx * s + dz * c; // world→local
  const half = axis === "x" ? size.x / 2 : size.z / 2;
  const oppositeLocal = -sign * half;
  const newSize = Math.max(MIN, sign * (local - oppositeLocal));
  const newCenterLocal = oppositeLocal + sign * (newSize / 2);
  const offLx = axis === "x" ? newCenterLocal : 0;
  const offLz = axis === "z" ? newCenterLocal : 0;
  return {
    center: { x: center.x + offLx * c + offLz * s, y: center.y, z: center.z - offLx * s + offLz * c },
    size: axis === "x" ? { ...size, x: newSize } : { ...size, z: newSize }
  };
};

const materialById = (materials: MaterialPreset[]) =>
  new Map(materials.map((material) => [material.id, material]));

const debugColorForRole = (role: string, mode: RenderDebugMode, fallback: string) => {
  if (mode === "beauty") return fallback;
  if (mode === "frontback") return "#58d36a";
  const colors: Record<string, string> = {
    wall: "#fff07a",
    ceiling: "#b8ff8d",
    floor: "#7fc8ff",
    furniture: "#ff9bd1",
    fixture: "#ffb35c",
    glass: "#89d7ff"
  };
  return colors[role] ?? fallback;
};

const StandardMaterial = ({ material, role = "furniture", debugMode = "beauty" }: { material: MaterialPreset; role?: string; debugMode?: RenderDebugMode }) => (
  <meshStandardMaterial
    color={debugColorForRole(role, debugMode, material.baseColor)}
    roughness={material.roughness}
    metalness={material.metalness}
    emissive={material.emissiveColor}
    emissiveIntensity={debugMode === "beauty" ? material.emissiveIntensity : 0}
  />
);

const createWoodTexture = () => {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.fillStyle = "#9d754a";
  ctx.fillRect(0, 0, 512, 512);
  for (let y = 0; y < 512; y += 36) {
    ctx.fillStyle = y % 72 === 0 ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)";
    ctx.fillRect(0, y, 512, 3);
  }
  for (let i = 0; i < 1200; i += 1) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    ctx.fillStyle = `rgba(35, 20, 10, ${Math.random() * 0.05})`;
    ctx.fillRect(x, y, Math.random() * 72 + 18, 1);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(4, 3);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
};

const CameraViewSync = ({
  view,
  controlsRef,
  floorLevelM,
  ceilingHeightM
}: {
  view: ProjectCamera;
  controlsRef: MutableRefObject<OrbitControlsImpl | null>;
  floorLevelM: number;
  ceilingHeightM: number;
}) => {
  const { camera, gl } = useThree();

  // 2D平面図へカメラ現在地を流すためのスロットル状態。毎フレームstoreに書くと
  // 購読側(Plan2D)が毎フレーム再描画されるので、時間と移動量の両方で間引く。
  const liveEmitRef = useRef({ t: 0, x: 0, z: 0, tx: 0, tz: 0 });
  useFrame(() => {
    const now = performance.now();
    if (now - liveEmitRef.current.t < 100) return;
    const controls = controlsRef.current;
    let tx: number;
    let tz: number;
    if (controls) {
      tx = controls.target.x;
      tz = controls.target.z;
    } else {
      // OrbitControls未取得時はカメラ前方ベクトルを投影した点を注視点相当とする。
      const forward = camera.getWorldDirection(new THREE.Vector3());
      tx = camera.position.x + forward.x;
      tz = camera.position.z + forward.z;
    }
    const last = liveEmitRef.current;
    const moved =
      Math.abs(camera.position.x - last.x) > 0.01 ||
      Math.abs(camera.position.z - last.z) > 0.01 ||
      Math.abs(tx - last.tx) > 0.01 ||
      Math.abs(tz - last.tz) > 0.01;
    if (!moved) return;
    liveEmitRef.current = { t: now, x: camera.position.x, z: camera.position.z, tx, tz };
    useProjectStore.getState().setLiveCamera({ x: camera.position.x, z: camera.position.z, tx, tz });
  });

  // project.camera を初期視点として適用する。家具移動などでプロジェクトが clone され
  // camera オブジェクト参照が変わっても、座標値が同じなら依存配列が変化せず（＝視点は
  // ユーザーのOrbit操作のまま）リセットされない。カメラ値が実際に変わった時だけ適用する。
  useEffect(() => {
    camera.position.set(view.position.x, view.position.y, view.position.z);
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.fov = view.fov;
      camera.updateProjectionMatrix();
    }
    controlsRef.current?.target.set(view.target.x, view.target.y, view.target.z);
    controlsRef.current?.update();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    camera,
    controlsRef,
    view.position.x,
    view.position.y,
    view.position.z,
    view.target.x,
    view.target.y,
    view.target.z,
    view.fov
  ]);

  useEffect(() => {
    gl.toneMappingExposure = view.exposure;
  }, [gl, view.exposure]);

  // 矢印キーは常に視点(カメラ)操作。
  //   矢印        : 視点の前後左右移動（注視点も同量動かし向きは保つ）
  //   Shift+左右  : 位置はそのままで視線方向を左右に旋回（首振り）
  //   Shift+上下  : 位置はそのままで見上げ/見下ろし（ピッチ）
  //   Option+上下 : 向きはそのままで上下に移動（昇降）
  // オブジェクトの移動/回転は3Dドラッグ・Inspector側に集約する。
  const MOVE_M = 0.4; // 矢印1回の移動量(m)
  const TURN_DEG = 5; // Shift+左右/上下1回の旋回・ピッチ角(度)

  // macOS のキーリピート中に Shift を先に離すと、続く repeat keydown で
  // event.shiftKey=false が報告されることがある。これを補正するため修飾キーの
  // 物理押下状態を別途追跡し、「イベントが落としても ref でカバー」する。
  // Shift が優先: shiftDown=true なら必ず pitch 側に入り、昇降には落ちない。
  const modsRef = useRef({ shift: false, alt: false });

  useEffect(() => {
    const onMod = (e: KeyboardEvent) => {
      // 修飾キー自身(Shift/Alt)の押下/解放だけで追跡する。矢印など非修飾イベントの
      // e.shiftKey をコピーすると、キーリピート中に shiftKey=false が混じった瞬間に
      // 追跡値が false へ落ち、補正(下の shiftDown OR)が無意味になるため対象を限定する。
      const down = e.type === "keydown";
      if (e.key === "Shift") modsRef.current.shift = down;
      else if (e.key === "Alt") modsRef.current.alt = down;
    };
    const onBlur = () => {
      // フォーカス喪失時は keyup が届かないため残留をリセットする
      // (ShortcutGuide.tsx と同じ作法)
      modsRef.current = { shift: false, alt: false };
    };
    window.addEventListener("keydown", onMod);
    window.addEventListener("keyup", onMod);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onMod);
      window.removeEventListener("keyup", onMod);
      window.removeEventListener("blur", onBlur);
    };
  }, []); // mount/unmount のみ。modsRef は ref なので依存不要。

  useEffect(() => {
    // ピッチ: target をカメラ位置まわりに上下回転。方位(水平向き)と距離を保ち±80°でクランプ。
    const pitchView = (delta: number) => {
      const controls = controlsRef.current;
      if (!controls) return;
      const dir = controls.target.clone().sub(camera.position);
      const len = dir.length();
      if (len < 1e-6) return;
      const horiz = Math.hypot(dir.x, dir.z);
      const MAX_PITCH = THREE.MathUtils.degToRad(80);
      const pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, Math.atan2(dir.y, horiz) + delta));
      const hx = horiz > 1e-6 ? dir.x / horiz : 0;
      const hz = horiz > 1e-6 ? dir.z / horiz : -1;
      const cos = Math.cos(pitch) * len;
      controls.target.set(
        camera.position.x + hx * cos,
        camera.position.y + Math.sin(pitch) * len,
        camera.position.z + hz * cos
      );
      controls.update();
    };

    const onKey = (event: KeyboardEvent) => {
      const controls = controlsRef.current;
      if (!controls) return;
      const el = event.target as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || el?.isContentEditable) return;
      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
      event.preventDefault();

      const left = event.key === "ArrowLeft";
      const right = event.key === "ArrowRight";
      const up = event.key === "ArrowUp";
      const down = event.key === "ArrowDown";

      // Shift は event.shiftKey を最優先し、キーリピートで落ちた時だけ ref で補正する。
      // Alt は矢印イベント自身の状態だけを見る。ref の残留で Option+上下扱いにしない。
      const shiftDown = event.shiftKey || modsRef.current.shift;
      const altDown = !shiftDown && event.altKey;

      // Shift が Alt に優先（ユーザーのメンタルモデル: Shift=見る / Option=昇降）。
      // shiftDown=true なら Alt 状態や通常移動へ落ちず、必ず pitch/yaw 側に入る。

      // Shift+左右: 視線方向を左右に旋回（首振り）。
      if (shiftDown && (left || right)) {
        const angle = THREE.MathUtils.degToRad(left ? TURN_DEG : -TURN_DEG);
        const dir = controls.target.clone().sub(camera.position);
        dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), angle);
        controls.target.copy(camera.position).add(dir);
        controls.update();
        return;
      }

      // Shift+上下: 見上げ/見下ろし（ピッチ）。水平方位と距離を保ち±80°でクランプ。
      if (shiftDown && up) {
        pitchView(THREE.MathUtils.degToRad(TURN_DEG));
        return;
      }
      if (shiftDown && down) {
        pitchView(THREE.MathUtils.degToRad(-TURN_DEG));
        return;
      }

      const forward = camera.getWorldDirection(new THREE.Vector3());
      forward.y = 0;
      if (forward.lengthSq() < 1e-6) forward.set(0, 0, -1);
      forward.normalize();
      const rightVec = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

      const move = new THREE.Vector3();
      // Option+上下: 昇降。shiftDown=false のときだけここに到達するので排他は順序で担保済み。
      // 天井を抜けるほど上げると「見上げ」ではなく視点高度の破綻に見えるため、
      // カメラ位置だけを室内の自然な高さに収め、target は実際に動けた量だけ追従させる。
      if (altDown && (up || down)) {
        const minEyeY = floorLevelM + 0.35;
        const maxEyeY = floorLevelM + Math.max(0.6, ceilingHeightM - 0.05);
        const nextY = THREE.MathUtils.clamp(camera.position.y + (up ? MOVE_M : -MOVE_M), minEyeY, maxEyeY);
        move.set(0, nextY - camera.position.y, 0);
      }
      else if (left)  move.copy(rightVec).multiplyScalar(-MOVE_M);
      else if (right) move.copy(rightVec).multiplyScalar(MOVE_M);
      else move.copy(forward).multiplyScalar(up ? MOVE_M : -MOVE_M); // 前後

      if (move.lengthSq() < 1e-10) return;
      camera.position.add(move);
      controls.target.add(move);
      controls.update();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [camera, ceilingHeightM, controlsRef, floorLevelM]);

  return null;
};

// 窓から差し込む物理的な日光。常駐パストレ(リアル)でも有効にする本物の光なので、
// 非物理の補助光（hemisphere/directional）とは別物として扱う。
// 壁は不透明ジオメトリなので、窓開口/ガラスを通った光だけが室内に届く。
const SunLight = ({
  dir,
  altitudeDeg,
  roomSpan
}: {
  dir: THREE.Vector3;
  altitudeDeg: number;
  roomSpan: number;
}) => {
  const ref = useRef<THREE.DirectionalLight>(null);
  const targetRef = useRef<THREE.Object3D>(null);
  // Sky 環境が間接光を担うので、太陽は鋭い影・方向感だけ担当する控えめな直射に較正。
  // dir.y = sin(高度) なので高度が高いほど明るい。
  const intensity = Math.max(0, dir.y) * SUN_INTENSITY_FACTOR;
  const color = useMemo(() => sunColorForAltitude(altitudeDeg), [altitudeDeg]);
  const position = useMemo(() => dir.clone().multiplyScalar(30), [dir]);
  const half = Math.max(4, roomSpan);

  useEffect(() => {
    if (ref.current && targetRef.current) {
      ref.current.target = targetRef.current;
      ref.current.target.updateMatrixWorld();
    }
  });

  return (
    <>
      <object3D ref={targetRef} position={[0, 0, 0]} />
      <directionalLight
        ref={ref}
        position={[position.x, position.y, position.z]}
        intensity={intensity}
        color={color}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-near={1}
        shadow-camera-far={80}
        shadow-camera-left={-half}
        shadow-camera-right={half}
        shadow-camera-top={half}
        shadow-camera-bottom={-half}
        shadow-bias={-0.0004}
      />
    </>
  );
};

// 窓の外に「外らしい景色」を作る: 広い地面 + 遠景の建物/木立シルエット。
// すべて実ジオメトリなのでパストレ(リアル)でも同じ見え方になる(WYSIWYG)。
// 空は scene.background(空色グラデ)が担うので、ここは地面と遠景のみ。
const FAR_SCENERY: { x: number; z: number; w: number; h: number; color: string }[] = [
  { x: -14, z: -20, w: 6, h: 5.5, color: "#3a4250" },
  { x: -7, z: -22, w: 4.5, h: 8, color: "#454f5e" },
  { x: 0, z: -24, w: 7, h: 6, color: "#333b48" },
  { x: 8, z: -21, w: 5, h: 9.5, color: "#404a59" },
  { x: 15, z: -19, w: 5.5, h: 4.5, color: "#3d4654" },
  { x: 19, z: 6, w: 5, h: 7, color: "#3a4250" },
  { x: 20, z: 14, w: 6, h: 5, color: "#454f5e" },
  { x: -19, z: 8, w: 5.5, h: 6.5, color: "#3a4250" },
  { x: -20, z: -4, w: 5, h: 8, color: "#404a59" }
];
const FAR_TREES: { x: number; z: number; h: number }[] = [
  { x: -11, z: -16, h: 3.2 },
  { x: 4, z: -17, h: 3.8 },
  { x: 12, z: -15, h: 2.8 },
  { x: 16, z: 2, h: 3.4 },
  { x: -16, z: 2, h: 3.0 }
];
const Outdoors = () => (
  <group>
    {/* 床より下に広い地面平面（窓の外が黒く抜けないように）。 */}
    <mesh rotation-x={-Math.PI / 2} position={[0, -0.02, 0]} receiveShadow>
      <planeGeometry args={[120, 120]} />
      <meshStandardMaterial color="#6f7560" roughness={0.97} metalness={0} />
    </mesh>
    {/* 遠景の低い建物群（シルエット）。窓越しに街並みらしく見せる。 */}
    {FAR_SCENERY.map((b, index) => (
      <mesh key={`bld-${index}`} position={[b.x, b.h / 2, b.z]}>
        <boxGeometry args={[b.w, b.h, b.w * 0.8]} />
        <meshStandardMaterial color={b.color} roughness={0.9} metalness={0} />
      </mesh>
    ))}
    {/* 遠景の木立（円錐＋幹）。 */}
    {FAR_TREES.map((t, index) => (
      <group key={`tree-${index}`} position={[t.x, 0, t.z]}>
        <mesh position={[0, t.h * 0.62, 0]}>
          <coneGeometry args={[t.h * 0.34, t.h * 0.85, 8]} />
          <meshStandardMaterial color="#2f4232" roughness={0.95} metalness={0} />
        </mesh>
        <mesh position={[0, t.h * 0.18, 0]}>
          <cylinderGeometry args={[t.h * 0.05, t.h * 0.06, t.h * 0.36, 6]} />
          <meshStandardMaterial color="#3b2e22" roughness={0.95} metalness={0} />
        </mesh>
      </group>
    ))}
  </group>
);

const SceneRoot = ({
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
  // 太陽高度に応じた空色ヘミライトで近似する（非物理・パストレ常駐時は使わない）。
  const daylightFill = useMemo(() => {
    if (!sunUp) return null;
    const sinAlt = Math.max(0, Math.sin((sun.altitudeDeg * Math.PI) / 180));
    return {
      sky: skyColorForAltitude(sun.altitudeDeg).getStyle(),
      ground: "#7d7568",
      intensity: DAYLIGHT_FILL_BASE_INTENSITY + DAYLIGHT_FILL_ALTITUDE_GAIN * sinAlt
    };
  }, [sunUp, sun.altitudeDeg]);

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
    const warmColor = colorTemperatureToHex(kelvin);
    const warm = warmColor.getStyle();
    // 下向き面（天井）側も少し起こす。直接光を外した壁・床が黒く沈むのを防ぎつつ、
    // ダウンライトの下方配光と床の光だまりは残すため、床側よりは暗くする。
    const warmCeiling = warmColor.clone().multiplyScalar(RASTER_BOUNCE_CEILING_FACTOR).getStyle();
    // 総光束→フィル強度。線形だと家庭用の低〜中光束で反射が弱すぎるため、
    // 早めに立ち上がって多灯時は飽和するカーブにする。
    const intensity = rasterBounceIntensity(lumens);
    const ambient = Math.min(RASTER_BOUNCE_MAX_AMBIENT, intensity * RASTER_BOUNCE_AMBIENT_RATIO);
    return { warm, warmCeiling, intensity, ambient };
  }, [floorProject.lights, effectiveLightIds]);

  return (
    <EditModeContext.Provider value={mode}>
    <PathTracedContext.Provider value={pathTraced}>
    <PlacementContext.Provider value={{ pendingAdd: pathTraced ? null : pendingAdd, onPlaceOnWall, onWallHover: setWallCursor }}>
      <CameraViewSync
        view={project.camera}
        controlsRef={controlsRef}
        floorLevelM={floorLevelM}
        ceilingHeightM={project.room.ceilingHeightM}
      />
      <TouchPinchDolly controlsRef={controlsRef} />
      <color attach="background" args={[backgroundColor]} />
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
          ) : (
            <hemisphereLight args={["#2b2a25", "#0a0805", 0.34]} />
          )}
          <directionalLight position={[-2, 4, 3]} intensity={sunUp ? 0.08 : 0.12} color="#c9d6ff" />
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
      {/* 追加配置のゴーストプレビュー。非物理の編集補助なので常駐パストレ時は出さない。 */}
      {!pathTraced && pendingAdd && (
        <PlacementLayer
          pendingAdd={pendingAdd}
          project={floorProject}
          onPlaceObject={onPlaceObject}
          onPlaceOnWall={onPlaceOnWall}
          wallCursor={wallCursor}
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

// ビューポートをそのままパストレで描画する常駐レンダラー。
// - 編集用R3Fシーンを単一の真実として共有し、二重定義をなくす（WYSIWYG）。
// - カメラ移動中は dynamicLowRes が即時の低解像度像を出し、停止すると数秒で
//   間接光込みの写実画像に収束する。
// - mount/unmount で R3F の自動描画を奪う/返す（useFrame priority 1）。

// これ以上サンプルしても視覚差がほぼ出ないため打ち切り、GPUを解放する。
// カメラ操作やシーン編集で reset されると samples が 0 に戻り自動再開する。
const LIVE_TRACE_TARGET_SAMPLES = 512;
const pathTraceSceneKey = (project: Project, debugMode: RenderDebugMode) =>
  JSON.stringify({
    debugMode,
    activeFloor: project.activeFloor ?? 1,
    showCeiling: project.showCeiling,
    room: {
      widthM: project.room.widthM,
      depthM: project.room.depthM,
      ceilingHeightM: project.room.ceilingHeightM,
      floorLevelM: project.room.floorLevelM ?? 0
    },
    walls: project.walls.map(({ id, start, end, thicknessM, heightM, innerSide, kind, floor }) => ({
      id,
      start,
      end,
      thicknessM,
      heightM,
      innerSide,
      kind,
      floor
    })),
    windows: project.windows.map(({ id, wallId, centerRatio, widthM, heightM, sillHeightM, hasGlass, style, floor }) => ({
      id,
      wallId,
      centerRatio,
      widthM,
      heightM,
      sillHeightM,
      hasGlass,
      style,
      floor
    })),
    furniture: project.furniture.map(({ id, type, position, size, rotationYDeg, floor }) => ({
      id,
      type,
      position,
      size,
      rotationYDeg,
      floor
    })),
    lights: project.lights.map(({ id, type, model, position, mountHeightM, rotationDeg, target, lengthM, cordLengthM, floor }) => ({
      id,
      type,
      model,
      position,
      mountHeightM,
      rotationDeg,
      target,
      lengthM,
      cordLengthM,
      floor
    })),
    voids: project.voids.map(({ id, center, size, openSides, floor }) => ({ id, center, size, openSides, floor })),
    ceilingZones: (project.ceilingZones ?? []).map(({ id, center, size, dropM, floor }) => ({ id, center, size, dropM, floor })),
    floorZones: (project.floorZones ?? []).map(({ id, center, size, dropM, floor }) => ({ id, center, size, dropM, floor }))
  });

const pathTraceLightsKey = (project: Project) =>
  JSON.stringify(
    project.lights.map(
      ({ id, type, model, position, mountHeightM, rotationDeg, target, lumens, colorTemperatureK, dimmer, enabled, beamAngleDeg, penumbra, castsShadow, lengthM, cordLengthM, floor }) => ({
        id,
        type,
        model,
        position,
        mountHeightM,
        rotationDeg,
        target,
        lumens,
        colorTemperatureK,
        dimmer,
        enabled,
        beamAngleDeg,
        penumbra,
        castsShadow,
        lengthM,
        cordLengthM,
        floor
      })
    )
  );

const pathTraceMaterialsKey = (project: Project, debugMode: RenderDebugMode) =>
  JSON.stringify({
    debugMode,
    materials: project.materials,
    wallMaterials: project.walls.map(({ id, materialId }) => ({ id, materialId })),
    furnitureMaterials: project.furniture.map(({ id, materialId, color, roughness, metalness }) => ({
      id,
      materialId,
      color,
      roughness,
      metalness
    }))
  });

const pathTraceDaylightKey = (project: Project) =>
  JSON.stringify(project.daylight ?? DEFAULT_DAYLIGHT);

const PathTracerController = ({
  project,
  debugMode,
  onStatus
}: {
  project: Project;
  debugMode: RenderDebugMode;
  onStatus?: (status: LiveTraceStatus) => void;
}) => {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const camera = useThree((state) => state.camera);
  const tracerRef = useRef<WebGLPathTracer | null>(null);
  const workerRef = useRef<GenerateMeshBVHWorker | null>(null);
  const readyRef = useRef(false);
  const lastMatrix = useRef(new THREE.Matrix4());
  const lastReported = useRef(-1);
  const buildTokenRef = useRef(0);
  const sceneKey = useMemo(() => pathTraceSceneKey(project, debugMode), [project, debugMode]);
  const lightsKey = useMemo(() => pathTraceLightsKey(project), [project]);
  const materialsKey = useMemo(() => pathTraceMaterialsKey(project, debugMode), [project, debugMode]);
  const daylightKey = useMemo(() => pathTraceDaylightKey(project), [project]);
  const sceneKeyRef = useRef(sceneKey);
  const builtSceneKeyRef = useRef<string | null>(null);
  sceneKeyRef.current = sceneKey;

  const rebuildScene = useCallback((tracer: WebGLPathTracer, nextSceneKey: string) => {
    const buildToken = ++buildTokenRef.current;
    readyRef.current = false;
    lastReported.current = -1;
    onStatus?.({ phase: "building", samples: 0 });
    scene.updateMatrixWorld(true);
    return tracer
      .setSceneAsync(scene, camera)
      .then(() => {
        if (tracerRef.current !== tracer || buildTokenRef.current !== buildToken) return;
        if (sceneKeyRef.current !== nextSceneKey) {
          builtSceneKeyRef.current = nextSceneKey;
          void rebuildScene(tracer, sceneKeyRef.current);
          return;
        }
        tracer.updateEnvironment();
        tracer.reset();
        tracer.updateLights();
        tracer.reset();
        tracer.updateMaterials();
        tracer.reset();
        readyRef.current = true;
        builtSceneKeyRef.current = nextSceneKey;
        lastMatrix.current.copy(camera.matrixWorld);
        onStatus?.({ phase: "rendering", samples: 0 });
      })
      .catch(() => undefined);
  }, [camera, scene, onStatus]);

  // 常駐パストレ時のみ scene.environment に物理ベースの空(Sky→PMREM)を入れる。
  // WebGLPathTracer は scene.background 単色を「見える背景」としか扱わず環境光に
  // しないため、environment + environmentIntensity がないと直射の当たらない壁が暗い。
  // ラスター編集を汚さないよう、このコントローラの mount 中だけ設定し unmount で戻す。
  // daylight 変更時は Sky を作り直し、tracer が既にあれば updateEnvironment+reset で反映する。
  useEffect(() => {
    const daylight = project.daylight ?? DEFAULT_DAYLIGHT;
    const sun = sunVector(daylight);
    const enabled = daylight.enabled && sun.altitudeDeg > 0;
    const prevEnv = scene.environment;
    const prevBackground = scene.background;
    const prevIntensity = scene.environmentIntensity;

    let skyEnv: SkyEnvironment | null = null;
    if (enabled) {
      skyEnv = buildSkyEnvironment(gl, sun.dir);
      scene.environment = skyEnv.texture;
      scene.background = skyEnv.texture;
      scene.environmentIntensity = SKY_ENVIRONMENT_INTENSITY;
    } else {
      // 夜は環境光をほぼ無くし、照明だけで照らす。
      const night = new THREE.Color("#050504");
      scene.environment = null;
      scene.background = night;
      scene.environmentIntensity = 1;
    }

    // 初回 mount では tracer 生成 useEffect 内の setSceneAsync 完了時に updateEnvironment が走る。
    // ここでは tracer が既にある(daylight 変更など)場合だけ即反映する。
    const tracer = tracerRef.current;
    if (tracer && readyRef.current) {
      tracer.updateEnvironment();
      tracer.reset();
    }

    return () => {
      scene.environment = prevEnv;
      scene.background = prevBackground;
      scene.environmentIntensity = prevIntensity;
      skyEnv?.dispose();
    };
  }, [scene, gl, daylightKey]);

  useEffect(() => {
    const worker = new GenerateMeshBVHWorker();
    const tracer = new WebGLPathTracer(gl);
    tracer.setBVHWorker(worker);
    tracer.multipleImportanceSampling = true;
    // 夜の室内GIは5バウンスでほぼ収束し、8比でサンプル/秒が大きく上がる（待ち時間優先）。
    tracer.bounces = 5;
    tracer.transmissiveBounces = 3;
    // グロッシー反射のファイアフライを抑える（0=無効、大きいほどぼける）。
    tracer.filterGlossyFactor = 0.25;
    tracer.renderScale = 1;
    tracer.dynamicLowRes = true;
    tracer.lowResScale = 0.3;
    tracer.renderDelay = 0;
    tracer.fadeDuration = 0;
    tracer.minSamples = 0;
    tracer.tiles.set(1, 1);
    // 表示ブリットを smartDeNoise で置き換え、低サンプル時のノイズを均す。
    // DenoiseMaterial は既定 quad と同様に tone mapping / colorspace を行うため
    // 見た目の意味（ACES・固定露出）は変わらず、WYSIWYG を保つ。
    const denoiseQuad = new FullScreenQuad(
      new DenoiseMaterial({
        premultipliedAlpha: gl.getContextAttributes().premultipliedAlpha,
        // 上流サンプル(three-gpu-pathtracer example)の既定値。sigma が大きいほど強く均す。
        sigma: 2.5,
        threshold: 0.1,
        kSigma: 1.0
      })
    );
    tracer.renderToCanvasCallback = (target, renderer) => {
      const material = denoiseQuad.material as DenoiseMaterial;
      material.map = target.texture;
      const currentAutoClear = renderer.autoClear;
      renderer.autoClear = false;
      denoiseQuad.render(renderer);
      renderer.autoClear = currentAutoClear;
    };
    tracerRef.current = tracer;
    workerRef.current = worker;
    readyRef.current = false;
    lastReported.current = -1;
    onStatus?.({ phase: "building", samples: 0 });

    // R3Fの子(家具・壁・器具)が全てコミット＆配置され終えてからBVHを組む。
    // 同一コミット内で即 setSceneAsync すると未配置のメッシュ(家具)が
    // BVHから漏れ、リアル表示で家具が消えることがあるため1フレーム待つ。
    const raf = requestAnimationFrame(() => {
      if (tracerRef.current !== tracer) return;
      void rebuildScene(tracer, sceneKeyRef.current);
    });

    return () => {
      cancelAnimationFrame(raf);
      readyRef.current = false;
      tracerRef.current = null;
      workerRef.current = null;
      tracer.dispose();
      worker.dispose();
      denoiseQuad.material.dispose();
      denoiseQuad.dispose();
      onStatus?.({ phase: "off", samples: 0 });
    };
  }, [gl, rebuildScene]);

  // R3Fが形状メッシュを更新し終えた後にBVHだけ再構築する。
  useEffect(() => {
    const tracer = tracerRef.current;
    if (!tracer) return;
    if (builtSceneKeyRef.current === null || builtSceneKeyRef.current === sceneKey) return;
    const handle = window.setTimeout(() => {
      if (tracerRef.current !== tracer) return;
      if (builtSceneKeyRef.current === sceneKey) return;
      void rebuildScene(tracer, sceneKey);
    }, 250);
    return () => window.clearTimeout(handle);
  }, [sceneKey, rebuildScene]);

  useEffect(() => {
    const tracer = tracerRef.current;
    if (!tracer || !readyRef.current) return;
    tracer.updateLights();
    tracer.reset();
    tracer.updateMaterials();
    tracer.reset();
  }, [lightsKey]);

  useEffect(() => {
    const tracer = tracerRef.current;
    if (!tracer || !readyRef.current) return;
    tracer.updateMaterials();
    tracer.reset();
  }, [materialsKey]);

  useFrame(() => {
    const tracer = tracerRef.current;
    if (!tracer || !readyRef.current) return;
    if (!lastMatrix.current.equals(camera.matrixWorld)) {
      lastMatrix.current.copy(camera.matrixWorld);
      tracer.updateCamera();
    }
    // 収束後は renderSample を止めてGPUを解放する（canvasは最終フレームを保持）。
    // reset で samples が 0 に戻ると次フレームから自動再開する。
    if (tracer.samples >= LIVE_TRACE_TARGET_SAMPLES) {
      if (lastReported.current !== -2) {
        lastReported.current = -2; // 収束報告済みの番兵
        onStatus?.({ phase: "converged", samples: Math.floor(tracer.samples) });
      }
      return;
    }
    tracer.renderSample();
    const samples = Math.floor(tracer.samples);
    if (samples !== lastReported.current) {
      lastReported.current = samples;
      onStatus?.({ phase: "rendering", samples });
    }
  }, 1);

  return null;
};

const CanvasReady = ({
  onReady,
  onRenderContextReady
}: {
  onReady: (canvas: HTMLCanvasElement) => void;
  onRenderContextReady: (context: RenderContext) => void;
}) => {
  const { gl, scene, camera } = useThree();
  useEffect(() => {
    onReady(gl.domElement);
    onRenderContextReady({ gl, scene, camera, canvas: gl.domElement });
  }, [camera, gl, gl.domElement, onReady, onRenderContextReady, scene]);
  return null;
};

// 床・天井は壁の囲い（絶対座標）に合わせて生成する。壁が無い/極小なら room 寸法を原点中心でフォールバック。
const computeFloorBounds = (project: Project) => {
  if (project.walls.length === 0) {
    return {
      centerX: 0,
      centerZ: 0,
      sizeX: project.room.widthM,
      sizeZ: project.room.depthM
    };
  }
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  let maxThickness = 0;
  for (const wall of project.walls) {
    minX = Math.min(minX, wall.start.x, wall.end.x);
    maxX = Math.max(maxX, wall.start.x, wall.end.x);
    minZ = Math.min(minZ, wall.start.z, wall.end.z);
    maxZ = Math.max(maxZ, wall.start.z, wall.end.z);
    maxThickness = Math.max(maxThickness, wall.thicknessM);
  }
  // 壁の外周を床/天井が覆うよう、最大厚みの半分を一律マージンで外側へ広げる。
  const margin = maxThickness / 2;
  minX -= margin;
  maxX += margin;
  minZ -= margin;
  maxZ += margin;
  const sizeX = Math.max(maxX - minX, 0.5);
  const sizeZ = Math.max(maxZ - minZ, 0.5);
  if (sizeX < 0.5 || sizeZ < 0.5) {
    return {
      centerX: 0,
      centerZ: 0,
      sizeX: project.room.widthM,
      sizeZ: project.room.depthM
    };
  }
  return {
    centerX: (minX + maxX) / 2,
    centerZ: (minZ + maxZ) / 2,
    sizeX,
    sizeZ
  };
};

type FloorBounds = ReturnType<typeof computeFloorBounds>;

const LIGHT_EFFECT_MARGIN_M = 1.2;
const REALTIME_SHADOW_LIGHT_LIMIT = 6;
// 昼光ヘミライトの強度。パストレ（Sky環境 0.8 + GI）の昼の明るさに視覚合わせした値で、
// 高度 sin に比例して正午前後が最も明るくなる。
const DAYLIGHT_FILL_BASE_INTENSITY = 0.3;
const DAYLIGHT_FILL_ALTITUDE_GAIN = 1.5;
const RASTER_BOUNCE_LUMEN_KNEE = 5200;
const RASTER_BOUNCE_BASE_INTENSITY = 0.06;
const RASTER_BOUNCE_ADDED_INTENSITY = 0.46;
const RASTER_BOUNCE_MAX_INTENSITY = 0.52;
const RASTER_BOUNCE_CEILING_FACTOR = 0.64;
const RASTER_BOUNCE_AMBIENT_RATIO = 0.18;
const RASTER_BOUNCE_MAX_AMBIENT = 0.075;

const rasterBounceIntensity = (lumens: number): number => {
  if (lumens <= 0) return 0;
  const response = 1 - Math.exp(-lumens / RASTER_BOUNCE_LUMEN_KNEE);
  return Math.min(
    RASTER_BOUNCE_MAX_INTENSITY,
    RASTER_BOUNCE_BASE_INTENSITY + response * RASTER_BOUNCE_ADDED_INTENSITY
  );
};

// 誤操作で建物外へ飛んだ照明が露出やシャドウマップを支配しないよう、物理発光だけ抑える。
const lightWithinBounds = (fixture: LightFixture, bounds: FloorBounds): boolean => {
  const minX = bounds.centerX - bounds.sizeX / 2 - LIGHT_EFFECT_MARGIN_M;
  const maxX = bounds.centerX + bounds.sizeX / 2 + LIGHT_EFFECT_MARGIN_M;
  const minZ = bounds.centerZ - bounds.sizeZ / 2 - LIGHT_EFFECT_MARGIN_M;
  const maxZ = bounds.centerZ + bounds.sizeZ / 2 + LIGHT_EFFECT_MARGIN_M;
  return (
    fixture.position.x >= minX &&
    fixture.position.x <= maxX &&
    fixture.position.z >= minZ &&
    fixture.position.z <= maxZ
  );
};

const effectiveLightIdSet = (lights: LightFixture[], bounds: FloorBounds) =>
  new Set(
    lights
      .filter((fixture) => fixture.enabled && fixture.dimmer > 0 && lightWithinBounds(fixture, bounds))
      .map((fixture) => fixture.id)
  );

const realtimeShadowLightIdSet = (lights: LightFixture[], effectiveLightIds: Set<string>) =>
  new Set(
    lights
      .filter((fixture) => effectiveLightIds.has(fixture.id) && fixture.castsShadow)
      .sort((a, b) => b.lumens * b.dimmer - a.lumens * a.dimmer)
      .slice(0, REALTIME_SHADOW_LIGHT_LIMIT)
      .map((fixture) => fixture.id)
  );

// 壁セグメントから室内外周ポリゴン（絶対座標の頂点列）を導出する。
// 端点を近接マージしてグラフ化し、最大面積の閉ループを外周とみなす。
// L字など非矩形の間取りで床/天井を室内だけに張るために使う。
// 綺麗に取れない場合は null を返し、呼び出し側は bbox 矩形へフォールバックする。
const computeRoomPolygon = (project: Project): { x: number; z: number }[] | null => {
  if (project.walls.length < 3) return null;
  // 端点近接マージのしきい値: 最大厚みの半分か 0.05m の大きい方。
  const maxThickness = project.walls.reduce((m, w) => Math.max(m, w.thicknessM), 0);
  const mergeEps = Math.max(maxThickness / 2, 0.05);

  // 代表点(ノード)へ端点を量子化する。近接ノードがあれば共有する。
  const nodes: { x: number; z: number }[] = [];
  const nodeIndex = (p: { x: number; z: number }): number => {
    for (let i = 0; i < nodes.length; i++) {
      if (Math.hypot(nodes[i].x - p.x, nodes[i].z - p.z) <= mergeEps) return i;
    }
    nodes.push({ x: p.x, z: p.z });
    return nodes.length - 1;
  };

  // 無向グラフ（隣接集合）。間仕切りで分岐があっても外周ループ抽出は最大面積で吸収する。
  const adj = new Map<number, Set<number>>();
  const addEdge = (a: number, b: number) => {
    if (a === b) return;
    if (!adj.has(a)) adj.set(a, new Set());
    if (!adj.has(b)) adj.set(b, new Set());
    adj.get(a)!.add(b);
    adj.get(b)!.add(a);
  };
  for (const wall of project.walls) {
    addEdge(nodeIndex(wall.start), nodeIndex(wall.end));
  }
  if (nodes.length < 3) return null;

  const signedArea = (poly: number[]): number => {
    let area = 0;
    for (let i = 0; i < poly.length; i++) {
      const a = nodes[poly[i]];
      const b = nodes[poly[(i + 1) % poly.length]];
      area += a.x * b.z - b.x * a.z;
    }
    return area / 2;
  };

  // 各辺から最も鋭く左へ曲がる隣へ進む「面トレース」で全ての面ループを列挙し、
  // 面積最大（外周）を採用する。無限外面は面積が負/最大絶対値の符号で判別。
  const visited = new Set<string>();
  let best: number[] | null = null;
  let bestArea = 0;
  for (const [from, neighbors] of adj) {
    for (const to of neighbors) {
      const startKey = `${from}->${to}`;
      if (visited.has(startKey)) continue;
      const loop: number[] = [from];
      let prev = from;
      let curr = to;
      let guard = 0;
      let ok = true;
      while (curr !== from && guard < 2000) {
        guard++;
        visited.add(`${prev}->${curr}`);
        loop.push(curr);
        const incoming = Math.atan2(nodes[curr].z - nodes[prev].z, nodes[curr].x - nodes[prev].x);
        const currNeighbors = adj.get(curr);
        if (!currNeighbors || currNeighbors.size === 0) {
          ok = false;
          break;
        }
        // 進入方向に対し最も時計回り側（最小の左回転角）の辺を選ぶ＝最小面に沿う。
        let nextNode = -1;
        let bestTurn = Infinity;
        for (const cand of currNeighbors) {
          if (cand === prev && currNeighbors.size > 1) continue;
          const outgoing = Math.atan2(nodes[cand].z - nodes[curr].z, nodes[cand].x - nodes[curr].x);
          let turn = outgoing - (incoming + Math.PI);
          while (turn <= 0) turn += Math.PI * 2;
          while (turn > Math.PI * 2) turn -= Math.PI * 2;
          if (turn < bestTurn) {
            bestTurn = turn;
            nextNode = cand;
          }
        }
        if (nextNode < 0) {
          ok = false;
          break;
        }
        prev = curr;
        curr = nextNode;
      }
      visited.add(`${prev}->${curr}`);
      if (!ok || curr !== from || loop.length < 3) continue;
      const area = signedArea(loop);
      if (Math.abs(area) > Math.abs(bestArea)) {
        bestArea = area;
        best = loop;
      }
    }
  }

  if (!best || best.length < 3 || Math.abs(bestArea) < 0.25) return null;
  // CCW（正の符号）へ正規化して返す。
  const ordered = bestArea < 0 ? [...best].reverse() : best;
  return ordered.map((i) => ({ x: nodes[i].x, z: nodes[i].z }));
};

// 吹き抜け(void)を介して1階と上方に繋がる「2階の床領域」を、グリッド・フラッドフィルで抽出する。
// 2階壁を越えない（間仕切りも含む）連続領域だけを塗り、それを2階床/壁/天井の生成に使う。
// 1階表示中に「吹き抜けホールの上に見える2階廊下」を出すための土台。2階壁が無ければ null。
type UpperVoidRegion = {
  cell: number; // セル一辺[m]
  cols: number;
  rows: number;
  originX: number; // グリッド原点(セル[0,0]の左下隅)の絶対X
  originZ: number;
  filled: Uint8Array; // 連続領域に属するセル=1
  voidMask: Uint8Array; // voidフットプリントに被るセル=1（床から抜く）
};

const computeUpperVoidRegion = (
  upperWalls: WallSegment[],
  lowerVoids: VoidArea[]
): UpperVoidRegion | null => {
  if (upperWalls.length === 0 || lowerVoids.length === 0) return null;

  // 1. 対象範囲 = 2階壁の bbox（+マージン）。
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  let maxThickness = 0;
  for (const wall of upperWalls) {
    minX = Math.min(minX, wall.start.x, wall.end.x);
    maxX = Math.max(maxX, wall.start.x, wall.end.x);
    minZ = Math.min(minZ, wall.start.z, wall.end.z);
    maxZ = Math.max(maxZ, wall.start.z, wall.end.z);
    maxThickness = Math.max(maxThickness, wall.thicknessM);
  }
  if (!Number.isFinite(minX)) return null;
  const margin = maxThickness / 2 + 0.2;
  minX -= margin;
  maxX += margin;
  minZ -= margin;
  maxZ += margin;

  const cell = 0.1;
  const cols = Math.max(1, Math.min(600, Math.ceil((maxX - minX) / cell)));
  const rows = Math.max(1, Math.min(600, Math.ceil((maxZ - minZ) / cell)));
  const originX = minX;
  const originZ = minZ;
  const idx = (c: number, r: number) => r * cols + c;
  const cellCenter = (c: number, r: number) => ({
    x: originX + (c + 0.5) * cell,
    z: originZ + (r + 0.5) * cell
  });

  // 2. 各セル中心が2階壁(厚み/2 + 小マージン)に被るならバリア（壁を越えない）。
  const barrier = new Uint8Array(cols * rows);
  const segDist = (px: number, pz: number, wall: WallSegment): number => {
    const ax = wall.start.x;
    const az = wall.start.z;
    const bx = wall.end.x;
    const bz = wall.end.z;
    const dx = bx - ax;
    const dz = bz - az;
    const len2 = dx * dx + dz * dz;
    let t = len2 > 1e-9 ? ((px - ax) * dx + (pz - az) * dz) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (ax + t * dx), pz - (az + t * dz));
  };
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const { x, z } = cellCenter(c, r);
      for (const wall of upperWalls) {
        if (segDist(x, z, wall) <= wall.thicknessM / 2 + cell * 0.5) {
          barrier[idx(c, r)] = 1;
          break;
        }
      }
    }
  }

  // 3. シード = いずれかの void footprint に入る非バリアセル。
  const inVoid = (x: number, z: number): boolean => {
    for (const v of lowerVoids) {
      if (
        x >= v.center.x - v.size.x / 2 &&
        x <= v.center.x + v.size.x / 2 &&
        z >= v.center.z - v.size.z / 2 &&
        z <= v.center.z + v.size.z / 2
      ) {
        return true;
      }
    }
    return false;
  };
  const filled = new Uint8Array(cols * rows);
  const voidMask = new Uint8Array(cols * rows);
  const queue: number[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const { x, z } = cellCenter(c, r);
      if (inVoid(x, z)) voidMask[idx(c, r)] = 1;
      if (inVoid(x, z) && !barrier[idx(c, r)]) {
        const i = idx(c, r);
        if (!filled[i]) {
          filled[i] = 1;
          queue.push(i);
        }
      }
    }
  }
  if (queue.length === 0) return null;

  // 4. 4近傍BFSで非バリアセルを塗り広げる。
  while (queue.length > 0) {
    const i = queue.pop()!;
    const c = i % cols;
    const r = (i - c) / cols;
    const neighbors = [
      [c - 1, r],
      [c + 1, r],
      [c, r - 1],
      [c, r + 1]
    ];
    for (const [nc, nr] of neighbors) {
      if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue;
      const ni = idx(nc, nr);
      if (filled[ni] || barrier[ni]) continue;
      filled[ni] = 1;
      queue.push(ni);
    }
  }

  return { cell, cols, rows, originX, originZ, filled, voidMask };
};

// 2階の連続領域(セル集合)から、指定Yレベルに水平スラブを張る BufferGeometry を作る。
// excludeVoid=true なら voidフットプリントのセルは抜く（見上げて吹き抜けが抜ける）。
// faceUp=true で法線+Y(床, 下から見える)、false で-Y(天井, 下から見える)。
const buildUpperSlabGeometry = (
  region: UpperVoidRegion,
  excludeVoid: boolean,
  faceUp: boolean
): THREE.BufferGeometry | null => {
  const { cell, cols, rows, originX, originZ, filled, voidMask } = region;
  const positions: number[] = [];
  const idx = (c: number, r: number) => r * cols + c;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = idx(c, r);
      if (!filled[i]) continue;
      if (excludeVoid && voidMask[i]) continue;
      const x0 = originX + c * cell;
      const x1 = x0 + cell;
      const z0 = originZ + r * cell;
      const z1 = z0 + cell;
      // 2三角形のquad。法線向きは巻き順で決める（faceUpで上面/下面を切替）。
      if (faceUp) {
        positions.push(x0, 0, z0, x1, 0, z1, x1, 0, z0);
        positions.push(x0, 0, z0, x0, 0, z1, x1, 0, z1);
      } else {
        positions.push(x0, 0, z0, x1, 0, z0, x1, 0, z1);
        positions.push(x0, 0, z0, x1, 0, z1, x0, 0, z1);
      }
    }
  }
  if (positions.length === 0) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  return geo;
};

// 連続領域に隣接する2階壁だけを抽出する（領域境界の壁）。壁中心線を細かくサンプルし、
// 壁厚の外側に塗れたセルが在れば「面している」とみなす。これにより吹き抜けホールを
// 囲う2階の壁だけを上方へ立ち上げ、無関係な2階奥の壁は出さない。
const upperBoundaryWalls = (region: UpperVoidRegion, upperWalls: WallSegment[]): WallSegment[] => {
  const { cell, cols, rows, originX, originZ, filled } = region;
  const idx = (c: number, r: number) => r * cols + c;
  const filledAt = (x: number, z: number): boolean => {
    const c = Math.floor((x - originX) / cell);
    const r = Math.floor((z - originZ) / cell);
    if (c < 0 || c >= cols || r < 0 || r >= rows) return false;
    return filled[idx(c, r)] === 1;
  };
  const result: WallSegment[] = [];
  for (const wall of upperWalls) {
    const dx = wall.end.x - wall.start.x;
    const dz = wall.end.z - wall.start.z;
    const len = Math.hypot(dx, dz);
    if (len < 1e-4) continue;
    const nx = -dz / len; // 壁法線
    const nz = dx / len;
    const off = wall.thicknessM / 2 + cell;
    const steps = Math.max(2, Math.ceil(len / cell));
    let adjacent = false;
    for (let s = 0; s <= steps && !adjacent; s++) {
      const t = s / steps;
      const x = wall.start.x + dx * t;
      const z = wall.start.z + dz * t;
      if (filledAt(x + nx * off, z + nz * off) || filledAt(x - nx * off, z - nz * off)) {
        adjacent = true;
      }
    }
    if (adjacent) result.push(wall);
  }
  return result;
};

// 1階表示中に、吹き抜けと繋がる2階の床/壁/天井だけを上方レベルに描く。
// 実構造なので常駐パストレでも表示する（!pathTracedで隠さない）。
const UpperVoidLevel = ({
  region,
  upperWalls,
  floorY,
  ceilingY,
  wallHeightM,
  floorMaterial,
  floorTexture,
  ceilingMaterial,
  materialMap,
  debugMode
}: {
  region: UpperVoidRegion;
  upperWalls: WallSegment[];
  floorY: number;
  ceilingY: number;
  wallHeightM: number;
  floorMaterial: MaterialPreset;
  floorTexture: THREE.Texture | null;
  ceilingMaterial: MaterialPreset;
  materialMap: Map<string, MaterialPreset>;
  debugMode: RenderDebugMode;
}) => {
  // 2階床(voidを抜く・上面が下から見える)、天井(下面が下から見える)スラブ。
  const floorGeo = useMemo(() => buildUpperSlabGeometry(region, true, true), [region]);
  const ceilingGeo = useMemo(() => buildUpperSlabGeometry(region, false, false), [region]);
  const boundaryWalls = useMemo(() => upperBoundaryWalls(region, upperWalls), [region, upperWalls]);
  const upperFloorBounds = useMemo(
    () => ({
      centerX: region.originX + (region.cols * region.cell) / 2,
      centerZ: region.originZ + (region.rows * region.cell) / 2,
      sizeX: region.cols * region.cell,
      sizeZ: region.rows * region.cell
    }),
    [region]
  );
  useEffect(() => () => floorGeo?.dispose(), [floorGeo]);
  useEffect(() => () => ceilingGeo?.dispose(), [ceilingGeo]);

  return (
    <group>
      {/* 2階床スラブ（吹き抜けフットプリントは抜けて廊下のフチが見える） */}
      {floorGeo && (
        <mesh position={[0, floorY, 0]} geometry={floorGeo} receiveShadow castShadow>
          <meshStandardMaterial
            map={debugMode === "beauty" ? floorTexture ?? undefined : undefined}
            color={debugColorForRole("floor", debugMode, floorMaterial.baseColor)}
            roughness={floorMaterial.roughness}
            metalness={floorMaterial.metalness}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}
      {/* 2階天井スラブ（見上げて黒/空へ抜けない蓋） */}
      {ceilingGeo && (
        <mesh position={[0, ceilingY, 0]} geometry={ceilingGeo} receiveShadow castShadow>
          <meshStandardMaterial
            color={debugColorForRole("ceiling", debugMode, ceilingMaterial.baseColor)}
            roughness={ceilingMaterial.roughness}
            metalness={ceilingMaterial.metalness}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}
      {/* 領域境界の2階壁を、2階床レベルから立ち上げる。 */}
      <group position={[0, floorY, 0]}>
        {boundaryWalls.map((wall) => (
          <WallMesh
            key={`upper-${wall.id}`}
            // 通常壁は2階全高に揃えるが、腰壁/手すりは自前の低い高さを保つ（吹抜周りに回せる）。
            wall={{ ...wall, heightM: wall.kind === "half" || wall.kind === "railing" ? wall.heightM : wallHeightM }}
            walls={upperWalls}
            windows={[]}
            material={materialMap.get(wall.materialId) ?? ceilingMaterial}
            roomCenter={new THREE.Vector3(region.originX + (region.cols * region.cell) / 2, 0, region.originZ + (region.rows * region.cell) / 2)}
            floorBounds={upperFloorBounds}
            selected={false}
            onSelect={() => {}}
            debugMode={debugMode}
            canEditWalls={false}
          />
        ))}
      </group>
    </group>
  );
};

const RoomShell = ({
  project,
  materialMap,
  floorTexture,
  floorMaterial,
  selection,
  onSelect,
  debugMode,
  upperVoid,
  canEditWalls
}: {
  project: Project;
  materialMap: Map<string, MaterialPreset>;
  floorTexture: THREE.Texture | null;
  floorMaterial: MaterialPreset;
  selection: Selection;
  onSelect: (selection: Selection) => void;
  debugMode: RenderDebugMode;
  // 2階の吹き抜け連続領域がある(=1階表示で2階を見せる)。void上蓋を出さず上方へ抜く。
  upperVoid: UpperVoidRegion | null;
  canEditWalls: boolean;
}) => {
  const ceilingMaterial = materialMap.get("cal-ceiling-white") ?? materialMap.get("wall-white") ?? project.materials[0];
  // 吹き抜けは下階天井を開口するだけだと黒背景に抜けて「穴」に見える。
  // 上階天井の高さまで側面と上蓋で囲い、二層分の吹き抜けとして閉じる。
  // 天井付け照明の設置高さ(ceilingMountHeightAt)と同じ式を使い、見た目と設置高さを揃える。
  const upperCeilingHeight = voidCeilingHeightAt(project, project.activeFloor ?? 1);
  const floorBounds = computeFloorBounds(project);
  const roomCenter = useMemo(
    () => new THREE.Vector3(floorBounds.centerX, 0, floorBounds.centerZ),
    [floorBounds.centerX, floorBounds.centerZ]
  );
  // 室内仕上げ床のレベル。土間(FloorZone)が地面(Y=0)より下に潜らないよう室内全体を持ち上げる。
  // 未設定(=0)なら translate ゼロで従来とピクセル等価。
  const floorLevelM = project.room.floorLevelM ?? 0;
  const showCeiling = project.showCeiling ?? true;

  return (
    <group position={[0, floorLevelM, 0]}>
      <Floor
        project={project}
        floorTexture={floorTexture}
        floorMaterial={floorMaterial}
        debugMode={debugMode}
      />
      {(project.floorZones ?? []).map((zone) => (
        <FloorZoneMesh
          key={zone.id}
          zone={zone}
          floorTexture={floorTexture}
          floorMaterial={floorMaterial}
          selected={selection?.kind === "floorZone" && selection.id === zone.id}
          onSelect={onSelect}
          debugMode={debugMode}
        />
      ))}
      {project.voids.map((voidArea) => (
        <VoidMarker
          key={voidArea.id}
          voidArea={voidArea}
          heightM={project.room.ceilingHeightM}
          selected={selection?.kind === "void" && selection.id === voidArea.id}
          onSelect={onSelect}
        />
      ))}
      {/* 天井ON/OFF: 非矩形間取りでバウンディングボックス天井が室外にかかる場合に手動で消せる。
          void の上蓋(VoidWell)は吹き抜けの黒抜け防止のため天井OFFでも残す。 */}
      {showCeiling && <Ceiling project={project} material={ceilingMaterial} debugMode={debugMode} />}
      {showCeiling &&
        (project.ceilingZones ?? []).map((zone) => (
          <CeilingZoneMesh
            key={zone.id}
            zone={zone}
            ceilingHeightM={project.room.ceilingHeightM}
            material={ceilingMaterial}
            selected={selection?.kind === "ceilingZone" && selection.id === zone.id}
            debugMode={debugMode}
          />
        ))}
      {project.voids.map((voidArea) => (
        <VoidWell
          key={`well-${voidArea.id}`}
          voidArea={voidArea}
          lowerY={project.room.ceilingHeightM}
          // 2階を見せるときは側面を2階床レベルまでに留め、上蓋は出さない（2階床/天井へ抜く）。
          upperY={upperVoid ? project.room.ceilingHeightM : upperCeilingHeight}
          showLid={!upperVoid}
          material={ceilingMaterial}
          debugMode={debugMode}
        />
      ))}
      {project.walls.map((wall) => (
        <WallMesh
          key={wall.id}
          wall={wall}
          walls={project.walls}
          windows={project.windows.filter((windowItem) => windowItem.wallId === wall.id)}
          material={materialMap.get(wall.materialId) ?? ceilingMaterial}
          roomCenter={roomCenter}
          floorBounds={floorBounds}
          selected={canEditWalls && selection?.kind === "wall" && selection.id === wall.id}
          onSelect={onSelect}
          debugMode={debugMode}
          canEditWalls={canEditWalls}
        />
      ))}
      {project.windows.map((windowItem) => {
        const kind = windowItem.hasGlass ? "window" : "opening";
        return (
          <WindowMesh
            key={windowItem.id}
            windowItem={windowItem}
            walls={project.walls}
            selected={selection?.kind === kind && selection.id === windowItem.id}
            onSelect={onSelect}
            debugMode={debugMode}
          />
        );
      })}
      <BaseBoards project={project} />
    </group>
  );
};

const Ceiling = ({ project, material, debugMode }: { project: Project; material: MaterialPreset; debugMode: RenderDebugMode }) => {
  // 部屋矩形を1枚の Shape にし、全 void を hole(THREE.Path) として抜く。
  // 任意個数の吹き抜けに対応でき、旧4分割方式の破綻も無い。
  // 床と同じく壁の囲いに合わせる。mesh を中心(centerX,centerZ)へ移動するので
  // Shape は中心原点・サイズ sizeX×sizeZ、void hole は mesh ローカルへオフセットする。
  const bounds = computeFloorBounds(project);
  const { centerX, centerZ, sizeX, sizeZ } = bounds;
  // L字など非矩形は室内ポリゴンで張る。取れなければ bbox 矩形にフォールバック。
  const polygon = useMemo(() => computeRoomPolygon(project), [project.walls]);
  const geometry = useMemo(() => {
    const halfW = sizeX / 2;
    const halfD = sizeZ / 2;
    // Shape は XY 平面で作る。ローカル(u,v) = (x, z) とし、後で回転して水平面に置く。
    // 頂点は mesh(centerX,centerZ) 中心のローカル座標へ変換する（void hole と同じ規約）。
    const shape = new THREE.Shape();
    if (polygon) {
      polygon.forEach((p, i) => {
        const lx = p.x - centerX;
        const lz = p.z - centerZ;
        if (i === 0) shape.moveTo(lx, lz);
        else shape.lineTo(lx, lz);
      });
      shape.closePath();
    } else {
      shape.moveTo(-halfW, -halfD);
      shape.lineTo(halfW, -halfD);
      shape.lineTo(halfW, halfD);
      shape.lineTo(-halfW, halfD);
      shape.closePath();
    }
    for (const voidArea of project.voids) {
      // void の center は絶対座標。mesh が centerX/centerZ にあるためローカルへ変換する。
      const minX = voidArea.center.x - centerX - voidArea.size.x / 2;
      const maxX = voidArea.center.x - centerX + voidArea.size.x / 2;
      const minZ = voidArea.center.z - centerZ - voidArea.size.z / 2;
      const maxZ = voidArea.center.z - centerZ + voidArea.size.z / 2;
      if (maxX - minX < 0.02 || maxZ - minZ < 0.02) continue;
      const hole = new THREE.Path();
      hole.moveTo(minX, minZ);
      hole.lineTo(maxX, minZ);
      hole.lineTo(maxX, maxZ);
      hole.lineTo(minX, maxZ);
      hole.closePath();
      shape.holes.push(hole);
    }
    const geo = new THREE.ShapeGeometry(shape);
    // XY平面(法線+Z)生成。+90°回転で水平に倒すと法線は -Y（下向き）になり、
    // 室内（下）から見える＝旧単一void実装と同じ向き。
    geo.rotateX(Math.PI / 2);
    return geo;
  }, [centerX, centerZ, sizeX, sizeZ, project.voids, polygon]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <mesh receiveShadow castShadow position={[centerX, project.room.ceilingHeightM, centerZ]} geometry={geometry}>
      <meshStandardMaterial
        color={debugColorForRole("ceiling", debugMode, material.baseColor)}
        roughness={material.roughness}
        metalness={material.metalness}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
};

// 床。下げ床(floorZones)がある場合は天井と同じ Shape+holes 方式で各ピットを刳り抜く。
// floorZones が無ければ従来通り単純な planeGeometry のままにする。
const Floor = ({
  project,
  floorTexture,
  floorMaterial,
  debugMode
}: {
  project: Project;
  floorTexture: THREE.Texture | null;
  floorMaterial: MaterialPreset;
  debugMode: RenderDebugMode;
}) => {
  const bounds = computeFloorBounds(project);
  const { centerX, centerZ, sizeX, sizeZ } = bounds;
  const zones = project.floorZones ?? [];
  // 床も室内ポリゴンで張れば室外へはみ出さない。取れなければ bbox 矩形。
  const polygon = useMemo(() => computeRoomPolygon(project), [project.walls]);

  const geometry = useMemo(() => {
    // ポリゴンも下げ床ピットも無ければ従来通り planeGeometry を使う（null を返す）。
    if (zones.length === 0 && !polygon) return null;
    const halfW = sizeX / 2;
    const halfD = sizeZ / 2;
    const shape = new THREE.Shape();
    if (polygon) {
      polygon.forEach((p, i) => {
        const lx = p.x - centerX;
        const lz = p.z - centerZ;
        if (i === 0) shape.moveTo(lx, lz);
        else shape.lineTo(lx, lz);
      });
      shape.closePath();
    } else {
      shape.moveTo(-halfW, -halfD);
      shape.lineTo(halfW, -halfD);
      shape.lineTo(halfW, halfD);
      shape.lineTo(-halfW, halfD);
      shape.closePath();
    }
    for (const zone of zones) {
      // zone.center は絶対座標。mesh が centerX/centerZ にあるためローカルへ変換する。
      const minX = zone.center.x - centerX - zone.size.x / 2;
      const maxX = zone.center.x - centerX + zone.size.x / 2;
      const minZ = zone.center.z - centerZ - zone.size.z / 2;
      const maxZ = zone.center.z - centerZ + zone.size.z / 2;
      if (maxX - minX < 0.02 || maxZ - minZ < 0.02) continue;
      const hole = new THREE.Path();
      hole.moveTo(minX, minZ);
      hole.lineTo(maxX, minZ);
      hole.lineTo(maxX, maxZ);
      hole.lineTo(minX, maxZ);
      hole.closePath();
      shape.holes.push(hole);
    }
    const geo = new THREE.ShapeGeometry(shape);
    // 床は上向き(+Y)。-90°回転で法線を +Y にする（planeGeometry の rotation-x=-π/2 と同じ向き）。
    geo.rotateX(-Math.PI / 2);
    return geo;
  }, [centerX, centerZ, sizeX, sizeZ, zones, polygon]);

  useEffect(() => () => geometry?.dispose(), [geometry]);

  const materialProps = {
    map: debugMode === "beauty" ? floorTexture ?? undefined : undefined,
    color: debugColorForRole("floor", debugMode, floorMaterial.baseColor),
    roughness: floorMaterial.roughness,
    metalness: floorMaterial.metalness
  };

  if (!geometry) {
    return (
      <mesh receiveShadow rotation-x={-Math.PI / 2} position={[centerX, 0, centerZ]}>
        <planeGeometry args={[sizeX, sizeZ]} />
        <meshStandardMaterial {...materialProps} />
      </mesh>
    );
  }

  return (
    <mesh receiveShadow position={[centerX, 0, centerZ]} geometry={geometry}>
      <meshStandardMaterial {...materialProps} />
    </mesh>
  );
};

// 下げ床(玄関土間など): 床に開けたピットへ Y=-dropM の床パネルを敷き、縁に蹴込みの側面を立てる。
const FloorZoneMesh = ({
  zone,
  floorTexture,
  floorMaterial,
  selected,
  onSelect,
  debugMode
}: {
  zone: FloorZone;
  floorTexture: THREE.Texture | null;
  floorMaterial: MaterialPreset;
  selected: boolean;
  onSelect: (selection: Selection) => void;
  debugMode: RenderDebugMode;
}) => {
  const pathTraced = usePathTraced();
  const editMode = useEditMode();
  const deleteSelection = useProjectStore((store) => store.deleteSelection);
  const drop = Math.max(0.02, zone.dropM);
  const { center, size } = zone;
  const color = debugColorForRole("floor", debugMode, floorMaterial.baseColor);
  const sideColor = debugColorForRole("wall", debugMode, floorMaterial.baseColor);
  const wall = (
    <meshStandardMaterial color={sideColor} roughness={floorMaterial.roughness} metalness={0} side={THREE.DoubleSide} />
  );
  return (
    <group
      onPointerDown={(event: ThreeEvent<PointerEvent>) => {
        event.stopPropagation();
        if (editMode === "delete") {
          deleteSelection({ kind: "floorZone", id: zone.id });
          return;
        }
        // 選択中の下げ床を再クリックしたら選択解除（手軽に解除できるように）。
        onSelect(selected ? null : { kind: "floorZone", id: zone.id });
      }}
    >
      {/* 下げパネル（ピット底） */}
      <mesh receiveShadow rotation-x={-Math.PI / 2} position={[center.x, -drop, center.z]}>
        <planeGeometry args={[size.x, size.z]} />
        <meshStandardMaterial
          map={debugMode === "beauty" ? floorTexture ?? undefined : undefined}
          color={color}
          roughness={floorMaterial.roughness}
          metalness={floorMaterial.metalness}
        />
      </mesh>
      {/* 蹴込み（立ち上がり）: Y=0→-drop の側面4枚。黒抜け防止。 */}
      <mesh receiveShadow position={[center.x, -drop / 2, center.z - size.z / 2]}>
        <boxGeometry args={[size.x, drop, 0.02]} />
        {wall}
      </mesh>
      <mesh receiveShadow position={[center.x, -drop / 2, center.z + size.z / 2]}>
        <boxGeometry args={[size.x, drop, 0.02]} />
        {wall}
      </mesh>
      <mesh receiveShadow position={[center.x - size.x / 2, -drop / 2, center.z]}>
        <boxGeometry args={[0.02, drop, size.z]} />
        {wall}
      </mesh>
      <mesh receiveShadow position={[center.x + size.x / 2, -drop / 2, center.z]}>
        <boxGeometry args={[0.02, drop, size.z]} />
        {wall}
      </mesh>
      {selected && !pathTraced && (
        <mesh position={[center.x, -drop / 2, center.z]}>
          <boxGeometry args={[size.x + 0.04, drop + 0.04, size.z + 0.04]} />
          <meshBasicMaterial color="#f5c64d" wireframe transparent opacity={0.8} />
        </mesh>
      )}
    </group>
  );
};

// 下げ天井: 天井から dropM 分だけ垂れ下がる軒（ソフィット）の箱として描く。
const CeilingZoneMesh = ({
  zone,
  ceilingHeightM,
  material,
  selected,
  debugMode
}: {
  zone: CeilingZone;
  ceilingHeightM: number;
  material: MaterialPreset;
  selected: boolean;
  debugMode: RenderDebugMode;
}) => {
  const pathTraced = usePathTraced();
  const drop = Math.max(0.02, zone.dropM);
  return (
    <group position={[zone.center.x, ceilingHeightM - drop / 2, zone.center.z]}>
      <mesh receiveShadow castShadow>
        <boxGeometry args={[zone.size.x, drop, zone.size.z]} />
        <meshStandardMaterial
          color={debugColorForRole("ceiling", debugMode, material.baseColor)}
          roughness={material.roughness}
          metalness={material.metalness}
        />
      </mesh>
      {selected && !pathTraced && (
        <mesh>
          <boxGeometry args={[zone.size.x + 0.04, drop + 0.04, zone.size.z + 0.04]} />
          <meshBasicMaterial color="#f5c64d" wireframe transparent opacity={0.8} />
        </mesh>
      )}
    </group>
  );
};

const voidOutsideFaceIndex = (side: VoidSide) => {
  switch (side) {
    case "north":
      return 5;
    case "south":
      return 4;
    case "west":
      return 1;
    case "east":
      return 0;
  }
};

const VoidWell = ({
  voidArea,
  lowerY,
  upperY,
  material,
  debugMode,
  showLid = true
}: {
  voidArea: VoidArea;
  lowerY: number;
  upperY: number;
  material: MaterialPreset;
  debugMode: RenderDebugMode;
  // 上蓋(天井蓋)を出すか。2階を見せるときは false にして上方へ抜く。
  showLid?: boolean;
}) => {
  const height = upperY - lowerY;
  if (height <= 0.02) return null;
  const midY = (lowerY + upperY) / 2;
  const { center, size } = voidArea;
  const placement = usePlacement();
  const color = debugColorForRole("ceiling", debugMode, material.baseColor);
  const sideConfigs = visibleVoidSides(voidArea).map((sideName) => ({
    sideName,
    position:
      sideName === "north"
        ? [center.x, midY, center.z - size.z / 2]
        : sideName === "south"
          ? [center.x, midY, center.z + size.z / 2]
          : sideName === "west"
            ? [center.x - size.x / 2, midY, center.z]
            : [center.x + size.x / 2, midY, center.z],
    args: sideName === "north" || sideName === "south" ? [size.x, height, 0.04] : [0.04, height, size.z],
    outsideFaceIndex: voidOutsideFaceIndex(sideName)
  })) as {
    sideName: VoidSide;
    position: [number, number, number];
    args: [number, number, number];
    outsideFaceIndex: number;
  }[];
  const resolveVoidHitPoint = (sideName: "north" | "south" | "west" | "east", event: ThreeEvent<PointerEvent>) => {
    const candidates = [event.point.clone()];
    if (event.object) candidates.push(event.object.localToWorld(event.point.clone()));
    const minX = center.x - size.x / 2;
    const maxX = center.x + size.x / 2;
    const minZ = center.z - size.z / 2;
    const maxZ = center.z + size.z / 2;
    const plane =
      sideName === "north"
        ? { axis: "z" as const, value: minZ }
        : sideName === "south"
          ? { axis: "z" as const, value: maxZ }
          : sideName === "west"
            ? { axis: "x" as const, value: minX }
            : { axis: "x" as const, value: maxX };
    const outside = (value: number, min: number, max: number) => Math.max(0, min - value, value - max);
    let best = candidates[0];
    let bestScore = Infinity;
    for (const point of candidates) {
      const sideScore = Math.abs(point[plane.axis] - plane.value);
      const rangeScore = plane.axis === "z" ? outside(point.x, minX, maxX) : outside(point.z, minZ, maxZ);
      const heightScore = outside(point.y, lowerY, upperY);
      const score = sideScore + rangeScore * 2 + heightScore;
      if (score < bestScore) {
        bestScore = score;
        best = point;
      }
    }
    return best;
  };
  const voidWallHit = (sideName: "north" | "south" | "west" | "east", point: THREE.Vector3) => {
    const alongX = sideName === "north" || sideName === "south";
    const ratio = alongX
      ? THREE.MathUtils.clamp((point.x - (center.x - size.x / 2)) / size.x, 0, 1)
      : THREE.MathUtils.clamp((point.z - (center.z - size.z / 2)) / size.z, 0, 1);
    const x = alongX
      ? center.x + (ratio - 0.5) * size.x
      : sideName === "west"
        ? center.x - size.x / 2
        : center.x + size.x / 2;
    const z = alongX
      ? sideName === "north"
        ? center.z - size.z / 2
        : center.z + size.z / 2
      : center.z + (ratio - 0.5) * size.z;
    return {
      wallId: voidWallId(voidArea.id, sideName),
      ratio,
      x,
      y: point.y,
      z,
      angle: alongX ? 0 : Math.PI / 2
    };
  };
  const voidWallHandlers = (sideName: "north" | "south" | "west" | "east") => ({
    onPointerMove: isWallLightAddKind(placement.pendingAdd)
      ? (event: ThreeEvent<PointerEvent>) => {
          event.stopPropagation();
          placement.onWallHover?.(voidWallHit(sideName, resolveVoidHitPoint(sideName, event)));
        }
      : undefined,
    onPointerDown: isWallLightAddKind(placement.pendingAdd)
      ? (event: ThreeEvent<PointerEvent>) => {
          const hit = voidWallHit(sideName, resolveVoidHitPoint(sideName, event));
          // グリップや奥の別の壁/吹き抜け壁があれば、この面より優先して譲る。
          if (eventHitsDragHandle(event) || eventHitsOtherWall(event, hit.wallId)) return;
          event.stopPropagation();
          placement.onPlaceOnWall?.(hit.wallId, hit.ratio, hit.y);
        }
      : undefined
  });
  const outsideOpacity = debugMode === "beauty" ? 0.36 : 0.62;
  return (
    <group>
      {sideConfigs.map((config) => (
        <mesh
          key={config.sideName}
          position={config.position}
          receiveShadow
          castShadow
          userData={{ wallId: voidWallId(voidArea.id, config.sideName) }}
          {...voidWallHandlers(config.sideName)}
        >
          <boxGeometry args={config.args} />
          {Array.from({ length: 6 }, (_, index) => {
            const outside = index === config.outsideFaceIndex;
            return (
              <meshStandardMaterial
                key={index}
                attach={`material-${index}`}
                color={color}
                roughness={material.roughness}
                metalness={material.metalness}
                transparent={outside}
                opacity={outside ? outsideOpacity : 1}
                depthWrite={!outside}
              />
            );
          })}
        </mesh>
      ))}
      {showLid && (
        <mesh position={[center.x, upperY, center.z]} rotation-x={Math.PI / 2} receiveShadow castShadow>
          <planeGeometry args={[size.x, size.z]} />
          <meshStandardMaterial
            color={color}
            roughness={material.roughness}
            metalness={material.metalness}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}
    </group>
  );
};

// 壁を窓/扉/開口の矩形でくり抜き、残った無地部分を矩形パネル群で埋める。
// 壁を1枚の不透明プレーンにすると、ガラスの後ろに壁が居座り「窓の外=壁」に
// 見える。開口を実際に開けることで、窓越しに外(空+地面+遠景)が見える。
type WallPanelRect = { cx: number; cy: number; w: number; h: number };
const wallPanelsWithHoles = (
  length: number,
  height: number,
  holes: { cx: number; w: number; bottom: number; top: number }[]
): WallPanelRect[] => {
  const halfL = length / 2;
  if (holes.length === 0) {
    return [{ cx: 0, cy: height / 2, w: length, h: height }];
  }
  // 壁内座標(0..length)で扱い、最後に中心基準(-halfL..halfL)へ変換する。
  const spans = holes
    .map((hole) => {
      const x0 = Math.max(0, hole.cx - hole.w / 2);
      const x1 = Math.min(length, hole.cx + hole.w / 2);
      const bottom = Math.max(0, hole.bottom);
      const top = Math.min(height, hole.top);
      return { x0, x1, bottom, top };
    })
    .filter((span) => span.x1 - span.x0 > 0.001 && span.top - span.bottom > 0.001)
    .sort((a, b) => a.x0 - b.x0);

  const panels: WallPanelRect[] = [];
  const pushColumn = (left: number, right: number, bottom: number, top: number) => {
    const w = right - left;
    const h = top - bottom;
    if (w <= 0.001 || h <= 0.001) return;
    panels.push({ cx: (left + right) / 2 - halfL, cy: (bottom + top) / 2, w, h });
  };

  let cursor = 0;
  spans.forEach((span) => {
    // 開口の左側を全高で埋める。
    pushColumn(cursor, span.x0, 0, height);
    // 開口の上下を埋める（左右方向は開口幅ぶん）。
    pushColumn(span.x0, span.x1, 0, span.bottom);
    pushColumn(span.x0, span.x1, span.top, height);
    cursor = Math.max(cursor, span.x1);
  });
  // 最後の開口の右側を全高で埋める。
  pushColumn(cursor, length, 0, height);
  return panels;
};

// 壁パネル1枚。壁紙テクスチャはパネル実寸でタイルするよう repeat を割り当て、
// パネルごとにクローンして縮尺を揃える（くり抜きで分割されても見た目が連続）。
const WallPanel = ({
  rect,
  wallHeight,
  depth,
  wallpaper,
  tile,
  material,
  debugMode,
  seeThrough
}: {
  rect: WallPanelRect;
  wallHeight: number;
  depth: number;
  wallpaper: THREE.Texture | null;
  tile: { w: number; h: number };
  material: MaterialPreset;
  debugMode: RenderDebugMode;
  // カメラがこの壁の外側にいるとき true。外壁スキン(material-5)を薄く透かして
  // 室外から室内を覗けるようにする。mesh 自体は raycast 対象のまま残す。
  seeThrough: boolean;
}) => {
  const map = useMemo(() => {
    if (!wallpaper) return null;
    const clone = wallpaper.clone();
    clone.needsUpdate = true;
    clone.repeat.set(
      Math.max(0.01, rect.w / Math.max(0.05, tile.w)),
      Math.max(0.01, rect.h / Math.max(0.05, tile.h))
    );
    return clone;
  }, [wallpaper, rect.w, rect.h, tile.w, tile.h]);
  const wallColor = debugColorForRole("wall", debugMode, material.baseColor);

  return (
    <mesh position={[rect.cx, rect.cy - wallHeight / 2, 0]} receiveShadow castShadow>
      <boxGeometry args={[rect.w, rect.h, depth]} />
      {[0, 1, 2, 3, 4].map((index) => (
        <meshStandardMaterial
          key={index}
          attach={`material-${index}`}
          map={map ?? undefined}
          color={map ? "#ffffff" : wallColor}
          roughness={material.roughness}
          metalness={material.metalness}
          emissive={material.emissiveColor}
          emissiveIntensity={debugMode === "beauty" ? material.emissiveIntensity : 0}
        />
      ))}
      {/* BoxGeometry material-5 is local -Z = 外壁スキン。室内側から見るときは不透明にして
          窓越しの見え方を正す(f80ab97)。室外側から覗くときは薄く透かして室内が見えるようにする。 */}
      <meshStandardMaterial
        attach="material-5"
        map={map ?? undefined}
        color={map ? "#ffffff" : wallColor}
        roughness={material.roughness}
        metalness={material.metalness}
        emissive={material.emissiveColor}
        emissiveIntensity={debugMode === "beauty" ? material.emissiveIntensity : 0}
        side={THREE.DoubleSide}
        transparent={seeThrough}
        opacity={seeThrough ? (debugMode === "beauty" ? 0.08 : 0.16) : 1}
        depthWrite={!seeThrough}
      />
    </mesh>
  );
};

// 壁コーナーの隙間埋め: 各端点が他の壁の端点と近接(=接続)していれば、その端だけ
// 半厚ぶん延長して隣接壁へ食い込ませる。自由端(どの壁とも接続しない端)は延長しない
// （外側へ飛び出さないように）。延長後の start/end を返す。
const cornerExtendedWall = (wall: WallSegment, walls: WallSegment[]): { start: { x: number; z: number }; end: { x: number; z: number } } => {
  const dx = wall.end.x - wall.start.x;
  const dz = wall.end.z - wall.start.z;
  const length = Math.hypot(dx, dz);
  if (length < 1e-4) return { start: { ...wall.start }, end: { ...wall.end } };
  const ux = dx / length;
  const uz = dz / length;
  // 端点が他の壁のいずれかの端点と近接しているか。epsilon は厚みの和の半分程度。
  const connected = (px: number, pz: number) => {
    for (const other of walls) {
      if (other.id === wall.id) continue;
      const eps = (wall.thicknessM + other.thicknessM) / 2 + 0.02;
      for (const pt of [other.start, other.end]) {
        if (Math.hypot(px - pt.x, pz - pt.z) <= eps) return true;
      }
    }
    return false;
  };
  const ext = wall.thicknessM / 2;
  const startExt = connected(wall.start.x, wall.start.z) ? ext : 0;
  const endExt = connected(wall.end.x, wall.end.z) ? ext : 0;
  return {
    start: { x: wall.start.x - ux * startExt, z: wall.start.z - uz * startExt },
    end: { x: wall.end.x + ux * endExt, z: wall.end.z + uz * endExt }
  };
};

// event.intersections の各ヒットの祖先を辿り、指定した userData キーを持つオブジェクトが
// 含まれるか調べる。壁/吹き抜けの見た目上の奥にある要素を優先させたい判定の共通処理。
const eventHitsMarker = (event: ThreeEvent<PointerEvent>, key: string): boolean =>
  event.intersections.some((intersection) => {
    return objectHasMarker(intersection.object, key);
  });

const objectHasMarker = (object: THREE.Object3D | null | undefined, key: string): boolean => {
  let current = object ?? null;
  while (current) {
    if (current.userData?.[key]) return true;
    current = current.parent;
  }
  return false;
};

const eventObjectHasMarker = (event: { object: THREE.Object3D }, key: string): boolean =>
  objectHasMarker(event.object, key);

const ignoreRaycast: THREE.Object3D["raycast"] = () => {};

// 距離ソート済みの event.intersections に、壁以外の選択可能オブジェクト
// （userData.selectable を持つ照明/家具ルート）が含まれるか。raycast は
// opacity/transparent を無視するため外壁面も手前ヒットになる。室外から
// 外壁面をクリックした時、奥に選択対象があれば壁が手前でも選択を譲るための判定。
const eventHitsSelectable = (event: ThreeEvent<PointerEvent>): boolean => eventHitsMarker(event, "selectable");

// ドラッグハンドル(グリップ)は depthTest 無効で常に手前に見えるよう描くため、raycast上は
// 奥の壁/吹き抜けに負けることがある。見た目どおりグリップを優先して掴めるようにする判定。
const eventHitsDragHandle = (event: ThreeEvent<PointerEvent>): boolean => eventHitsMarker(event, "dragHandle");

// event.intersections に、自分(ownWallId)以外の壁面/吹き抜け壁面(userData.wallId)が
// 含まれるか。外壁の外側からその奥の壁/吹き抜け壁へ窓・扉・壁ライトを置きたい時、
// 手前の外壁ではなく奥の壁を優先させるための判定。
const eventHitsOtherWall = (event: ThreeEvent<PointerEvent>, ownWallId: string): boolean =>
  event.intersections.some((intersection) => {
    let object: THREE.Object3D | null = intersection.object;
    while (object) {
      const id = object.userData?.wallId;
      if (typeof id === "string" && id !== ownWallId) return true;
      object = object.parent;
    }
    return false;
  });

const WallMesh = ({
  wall,
  walls,
  windows,
  material,
  roomCenter,
  floorBounds,
  selected,
  onSelect,
  debugMode,
  canEditWalls
}: {
  wall: WallSegment;
  walls: WallSegment[];
  windows: WindowOpening[];
  material: MaterialPreset;
  roomCenter: THREE.Vector3;
  floorBounds: FloorBounds;
  selected: boolean;
  onSelect: (selection: Selection) => void;
  debugMode: RenderDebugMode;
  canEditWalls: boolean;
}) => {
  // コーナーの隙間を塞ぐため接続端だけ半厚ぶん延長した端点で描く。
  // 窓 hole は元の centerRatio から絶対座標(wx,wz)を求め、延長後の midpoint/length に
  // 対して射影するので、延長してもガラス位置・幅はずれない（cx は絶対位置基準）。
  const ext = cornerExtendedWall(wall, walls);
  const dx = ext.end.x - ext.start.x;
  const dz = ext.end.z - ext.start.z;
  const length = Math.hypot(dx, dz);
  const midpointVector = new THREE.Vector3((ext.start.x + ext.end.x) / 2, wall.heightM / 2, (ext.start.z + ext.end.z) / 2);
  const inward = wallInwardNormal(wall, { x: roomCenter.x, z: roomCenter.z });
  const inwardNormal = new THREE.Vector3(inward.x, 0, inward.z);
  const rotationY = Math.atan2(inwardNormal.x, inwardNormal.z);
  const pathTraced = usePathTraced();
  const placement = usePlacement();
  const camera = useThree((state) => state.camera);
  const tile = material.textureSizeM ?? { w: 0.92, h: 0.92 };
  const groupRef = useRef<THREE.Group>(null);

  // 外壁スキンの外向き法線(=inwardの逆)。カメラがこの側にいる=室外から覗いている。
  const exteriorNormal = useMemo(
    () => new THREE.Vector3(-inwardNormal.x, 0, -inwardNormal.z),
    [inwardNormal.x, inwardNormal.z]
  );
  // 外壁を透かすのは、カメラが建物外形の外から覗いている時だけ。
  // 壁単体の外側判定だけだと、室内から窓越しに見た別壁の外側面まで透ける。
  const [exteriorSeeThrough, setExteriorSeeThrough] = useState(false);
  useFrame(() => {
    // 常駐パストレ時は f80ab97 の不透明挙動を維持（編集ビュー専用の可視化）。
    if (pathTraced) return;
    const outsideWall =
      (camera.position.x - midpointVector.x) * exteriorNormal.x +
        (camera.position.z - midpointVector.z) * exteriorNormal.z >
      0;
    const halfX = floorBounds.sizeX / 2;
    const halfZ = floorBounds.sizeZ / 2;
    const insideFloorBounds =
      camera.position.x >= floorBounds.centerX - halfX &&
      camera.position.x <= floorBounds.centerX + halfX &&
      camera.position.z >= floorBounds.centerZ - halfZ &&
      camera.position.z <= floorBounds.centerZ + halfZ;
    const next = outsideWall && !insideFloorBounds;
    setExteriorSeeThrough((prev) => (prev === next ? prev : next));
  });

  const wallHitFromEvent = (event: ThreeEvent<PointerEvent>) => {
    const group = groupRef.current;
    const candidates = [event.point.clone()];
    if (event.object) candidates.push(event.object.localToWorld(event.point.clone()));
    let bestWorld = candidates[0];
    let bestScore = Infinity;
    for (const world of candidates) {
      const local = group ? group.worldToLocal(world.clone()) : world.clone();
      const clampedX = THREE.MathUtils.clamp(local.x, -length / 2, length / 2);
      const clampedY = THREE.MathUtils.clamp(local.y, -wall.heightM / 2, wall.heightM / 2);
      const score =
        Math.abs(local.x - clampedX) +
        Math.abs(local.y - clampedY) +
        Math.abs(local.z) * 2;
      if (score < bestScore) {
        bestScore = score;
        bestWorld = world;
      }
    }
    const { ratio } = projectPointOntoWall(bestWorld.x, bestWorld.z, wall);
    const surfaceOffset = wall.thicknessM / 2 + 0.04;
    const wallX = wall.start.x + (wall.end.x - wall.start.x) * ratio;
    const wallZ = wall.start.z + (wall.end.z - wall.start.z) * ratio;
    const angle = Math.atan2(inwardNormal.x, inwardNormal.z);
    return {
      wallId: wall.id,
      ratio,
      x: wallX + inwardNormal.x * surfaceOffset,
      y: bestWorld.y,
      z: wallZ + inwardNormal.z * surfaceOffset,
      angle
    };
  };

  // この壁に属する開口を、壁ローカルX(-length/2..length/2)・高さに変換してくり抜く。
  // パネルの並ぶローカル +X 軸（rotationY適用後の(1,0,0)）に窓中心を射影して
  // cx を求めることで、壁の向きやrotationの符号によらず WindowMesh と必ず一致する。
  const localXAxis = new THREE.Vector3(Math.cos(rotationY), 0, -Math.sin(rotationY));
  const holes = windows.map((windowItem) => {
    const wx = wall.start.x + (wall.end.x - wall.start.x) * windowItem.centerRatio;
    const wz = wall.start.z + (wall.end.z - wall.start.z) * windowItem.centerRatio;
    const cxCentered = new THREE.Vector3(wx - midpointVector.x, 0, wz - midpointVector.z).dot(localXAxis);
    return {
      // wallPanelsWithHoles は壁内座標(0..length)で扱うので中心基準から変換。
      cx: cxCentered + length / 2,
      w: windowItem.widthM,
      bottom: windowItem.sillHeightM,
      top: windowItem.sillHeightM + windowItem.heightM
    };
  });
  // 手すりは「抜け」が要るのでソリッドパネルにせず笠木+縦支柱で組む（窓くり抜きは不要）。
  const isRailing = wall.kind === "railing";
  const panels = isRailing ? [] : wallPanelsWithHoles(length, wall.heightM, holes);
  // 縦支柱を約0.11m間隔で両端含めて配置（壁ローカルX: -length/2..length/2）。
  const postSpacing = 0.11;
  const postCount = Math.max(2, Math.round(length / postSpacing) + 1);
  const postXs = isRailing
    ? Array.from({ length: postCount }, (_, i) => -length / 2 + (length * i) / (postCount - 1))
    : [];
  // 笠木/下桟の厚みは壁厚を上限に細くする。
  const railDepth = Math.min(wall.thicknessM, 0.06);
  // 壁全体ぶんの基準テクスチャ(repeat=1)を読み、パネルごとに repeat を実寸で割り当てる。
  const wallpaper = useWallpaperTexture(
    debugMode === "beauty" ? material.textureDataUrl : undefined,
    1,
    1
  );

  return (
    <group
      ref={groupRef}
      position={[midpointVector.x, midpointVector.y, midpointVector.z]}
      rotation={[0, rotationY, 0]}
      // canEditWalls=false の壁（吹き抜け上部の2階echo壁など、UpperVoidLevel由来の非編集複製）は
      // 実際のクリック対象ではないため wallId を持たせず、eventHitsOtherWall の誤判定を避ける。
      userData={canEditWalls ? { wallId: wall.id } : undefined}
      // 選択は onPointerDown で確定する。手前の家具/照明は同じ pointerdown で
      // stopPropagation するため、onClick だと手前を選んでも click が壁へ伝播して
      // 選択が壁に転写される再発バグになる。pointer 系で統一して伝播を断つ。
      // 壁ライト(wallspot)配置中は、カーソルが壁上に来たら壁面ヒットをゴーストへ上げる。
      onPointerMove={
        isWallLightAddKind(placement.pendingAdd)
          ? (event: ThreeEvent<PointerEvent>) => {
              event.stopPropagation();
              placement.onWallHover?.(wallHitFromEvent(event));
            }
          : undefined
      }
      onPointerDown={(event: ThreeEvent<PointerEvent>) => {
        // 壁物（窓・扉・壁ライト）の配置中は、選択ではなくクリックした壁自身へ設置する。
        // クリック点(x,z)をこの壁に射影して比率を求める（最寄り壁＝クリック壁）。
        if (isWallPending(placement.pendingAdd)) {
          // 外壁の外側面をクリックした時、奥に別の壁/吹き抜け壁があればそちらを優先する
          // （外から窓/壁ライト等を置こうとすると手前の外壁に置かれてしまう問題への対処）。
          if ((event.face?.normal.z ?? 0) < 0 && eventHitsOtherWall(event, wall.id)) return;
          event.stopPropagation();
          const hit = wallHitFromEvent(event);
          // 壁ライトはカーソルの壁上ワールドYをそのまま高さに渡す（壁面に吸い付かせる）。
          // 窓/扉は heightM 省略で種別既定の高さに任せる。
          const heightM = isWallLightAddKind(placement.pendingAdd) ? hit.y : undefined;
          placement.onPlaceOnWall?.(wall.id, hit.ratio, heightM);
          return;
        }
        // ドラッグハンドル(グリップ)は depthTest 無効で常に手前に見えるため、
        // 見た目どおりグリップを優先して掴めるようにする（奥の壁に負けない）。
        if (eventHitsDragHandle(event)) return;
        // 外壁スキン(local -Z = exterior, material-5)を室外からクリックした
        // 場合のみ、奥にライト/家具があれば壁を奪わず伝播させ奥を選ばせる。室内側の不透明
        // 面(+Z)クリックは従来どおり壁を選択する（壁裏の不可視オブジェクトを誤選択しない）。
        // 手前に選択可能物がある場合は相手が先に stopPropagation するため、ここに来る時点で
        // 選択可能物は常に壁より奥のケースに限られる。
        if ((event.face?.normal.z ?? 0) < 0 && eventHitsSelectable(event)) return;
        event.stopPropagation();
        if (!canEditWalls) return;
        // 選択中の壁を再クリックしたら選択解除（手軽に解除できるように）。
        onSelect(selected ? null : { kind: "wall", id: wall.id });
      }}
    >
      {/* 壁を開口でくり抜いた残りパネル群。castShadow で窓開口を通る日光が
          室内に差し込む（夜間の人工照明は器具側の影で支配的なので影響は小さい）。 */}
      {panels.map((panel, index) => (
        <WallPanel
          key={index}
          rect={panel}
          wallHeight={wall.heightM}
          depth={wall.thicknessM}
          wallpaper={wallpaper}
          tile={tile}
          material={material}
          debugMode={debugMode}
          seeThrough={exteriorSeeThrough && !pathTraced}
        />
      ))}
      {isRailing && (
        <>
          {/* 笠木（上桟）と下桟。group原点Yは heightM/2 なので局所Yは world高さ-heightM/2。 */}
          <mesh position={[0, (wall.heightM - 0.025) - wall.heightM / 2, 0]} receiveShadow castShadow>
            <boxGeometry args={[length, 0.05, railDepth]} />
            <meshStandardMaterial
              color={debugColorForRole("wall", debugMode, material.baseColor)}
              roughness={material.roughness}
              metalness={material.metalness}
            />
          </mesh>
          <mesh position={[0, 0.05 - wall.heightM / 2, 0]} receiveShadow castShadow>
            <boxGeometry args={[length, 0.05, railDepth]} />
            <meshStandardMaterial
              color={debugColorForRole("wall", debugMode, material.baseColor)}
              roughness={material.roughness}
              metalness={material.metalness}
            />
          </mesh>
          {postXs.map((px, index) => (
            <mesh key={`post-${index}`} position={[px, 0, 0]} receiveShadow castShadow>
              <boxGeometry args={[0.04, wall.heightM, 0.04]} />
              <meshStandardMaterial
                color={debugColorForRole("wall", debugMode, material.baseColor)}
                roughness={material.roughness}
                metalness={material.metalness}
              />
            </mesh>
          ))}
        </>
      )}
      {selected && !pathTraced && (
        <mesh>
          <planeGeometry args={[length + 0.03, wall.heightM + 0.03]} />
          <meshBasicMaterial color="#f5c64d" wireframe transparent opacity={0.85} side={THREE.DoubleSide} />
        </mesh>
      )}
    </group>
  );
};

const BaseBoards = ({ project }: { project: Project }) => (
  <>
    {project.walls.map((wall) => {
      // 手すりは床から浮く笠木構造なので、下に巾木が出ると不自然。巾木を描かない。
      if (wall.kind === "railing") return null;
      const dx = wall.end.x - wall.start.x;
      const dz = wall.end.z - wall.start.z;
      const length = Math.hypot(dx, dz);
      const angle = Math.atan2(dz, dx);
      return (
        <mesh
          key={`${wall.id}-baseboard`}
          position={[(wall.start.x + wall.end.x) / 2, 0.055, (wall.start.z + wall.end.z) / 2]}
          rotation={[0, -angle, 0]}
          castShadow
        >
          <boxGeometry args={[length, 0.11, 0.035]} />
          <meshStandardMaterial color="#cfc8bb" roughness={0.82} />
        </mesh>
      );
    })}
  </>
);

const WindowMesh = ({
  windowItem,
  walls,
  selected,
  onSelect,
  debugMode
}: {
  windowItem: WindowOpening;
  walls: WallSegment[];
  selected: boolean;
  onSelect: (selection: Selection) => void;
  debugMode: RenderDebugMode;
}) => {
  const wall = walls.find((item) => item.id === windowItem.wallId);
  const pathTraced = usePathTraced();
  const placement = usePlacement();
  const editMode = useEditMode();
  const updateWindow = useProjectStore((store) => store.updateWindow);
  const floorLevelM = useProjectStore((store) => store.project.room.floorLevelM ?? 0);
  // 窓の現在のワールド中心(x,z)。掴み位置の相対オフセットを保つため useFloorDrag の current に渡す。
  const centerX = wall ? wall.start.x + (wall.end.x - wall.start.x) * windowItem.centerRatio : 0;
  const centerZ = wall ? wall.start.z + (wall.end.z - wall.start.z) * windowItem.centerRatio : 0;
  // 窓は壁に拘束されるので、床平面ヒット(x,z)を所属壁へ射影し centerRatio を再計算する。
  // x,z は平面のY高さに依存しないため、平面Yは floorLevelM(室内床)に揃えれば十分。
  // 選択済みオブジェクトの再クリックで選択解除するトグル判定用。実際にドラッグが
  // 発生した場合（=移動操作）は解除しない、クリックのみ(移動なし)の時だけ解除する。
  const wasSelectedRef = useRef(false);
  const movedRef = useRef(false);
  const drag = useFloorDrag(
    { x: centerX, z: centerZ },
    floorLevelM,
    (x, z) => {
      if (!wall) return;
      movedRef.current = true;
      const { ratio } = projectPointOntoWall(x, z, wall);
      updateWindow(windowItem.id, { centerRatio: Math.max(0, Math.min(1, ratio)) });
    }
  );
  if (!wall) return null;

  const x = centerX;
  const z = centerZ;
  const angle = Math.atan2(wall.end.z - wall.start.z, wall.end.x - wall.start.x);
  const y = windowItem.sillHeightM + windowItem.heightM / 2;
  const style = windowItem.style ?? (windowItem.hasGlass ? "window" : "opening");
  const kind = windowItem.hasGlass ? "window" : "opening";
  const w = windowItem.widthM;
  const h = windowItem.heightM;
  const f = 0.06; // 枠の見付け幅
  const frameColor = debugColorForRole("fixture", debugMode, style === "door" ? "#cfc7b8" : "#e7e3da");
  const frame = (
    <meshStandardMaterial color={frameColor} roughness={0.6} metalness={0} />
  );

  return (
    <group
      position={[x, y, z - 0.012]}
      rotation={[0, -angle, 0]}
      // 選択は pointerdown で確定（onClick だと手前→背後へ click が伝播して選択転写が起きる）。
      onPointerDown={(event: ThreeEvent<PointerEvent>) => {
        // 配置中は既存の窓/扉の上に重ねて置けるよう、壁メッシュへ素通りさせる。
        if (placement.pendingAdd) return;
        event.stopPropagation();
        wasSelectedRef.current = selected;
        movedRef.current = false;
        if (!selected) onSelect({ kind, id: windowItem.id });
        // 通常操作では壁沿いの水平移動ドラッグを開始（高さ変更は矢印キーに任せる）。
        if (editMode === "select" && selected) drag.onPointerDown(event);
      }}
      onPointerMove={editMode === "select" ? drag.onPointerMove : undefined}
      onPointerUp={
        editMode === "select"
          ? (event: ThreeEvent<PointerEvent>) => {
              drag.onPointerUp(event);
              // 移動を伴わないクリックで、既に選択中の窓/扉を再選択しようとした場合のみ解除する。
              if (wasSelectedRef.current && !movedRef.current) onSelect(null);
              wasSelectedRef.current = false;
            }
          : undefined
      }
      onPointerCancel={
        editMode === "select"
          ? (event: ThreeEvent<PointerEvent>) => {
              drag.onPointerCancel(event);
              wasSelectedRef.current = false;
            }
          : undefined
      }
    >
      {/* 枠（窓・扉とも周囲に回す） */}
      {style !== "opening" && (
        <>
          <mesh position={[0, h / 2 - f / 2, 0]} castShadow receiveShadow>
            <boxGeometry args={[w, f, 0.1]} />
            {frame}
          </mesh>
          <mesh position={[0, -h / 2 + f / 2, 0]} castShadow receiveShadow>
            <boxGeometry args={[w, f, 0.1]} />
            {frame}
          </mesh>
          <mesh position={[-w / 2 + f / 2, 0, 0]} castShadow receiveShadow>
            <boxGeometry args={[f, h, 0.1]} />
            {frame}
          </mesh>
          <mesh position={[w / 2 - f / 2, 0, 0]} castShadow receiveShadow>
            <boxGeometry args={[f, h, 0.1]} />
            {frame}
          </mesh>
        </>
      )}

      {style === "window" && (
        <>
          <mesh>
            <boxGeometry args={[w - f * 2, h - f * 2, 0.012]} />
            <meshPhysicalMaterial
              color={debugColorForRole("glass", debugMode, "#bcd4e0")}
              roughness={0.03}
              metalness={0}
              transmission={0.95}
              transparent
              opacity={1.0}
              ior={1.5}
            />
          </mesh>
          {/* 中桟（横） */}
          <mesh castShadow>
            <boxGeometry args={[w - f * 2, 0.035, 0.05]} />
            {frame}
          </mesh>
        </>
      )}

      {style === "door" && (
        <>
          {/* ドア板 */}
          <mesh position={[0, 0, 0.01]} castShadow receiveShadow>
            <boxGeometry args={[w - f * 2, h - f * 2, 0.04]} />
            <meshStandardMaterial color={debugColorForRole("furniture", debugMode, "#9d8b73")} roughness={0.7} metalness={0} />
          </mesh>
          {/* 取手 */}
          <mesh position={[w / 2 - f - 0.07, 0, 0.05]}>
            <boxGeometry args={[0.025, 0.14, 0.03]} />
            <meshStandardMaterial color="#2a2a28" roughness={0.4} metalness={0.7} />
          </mesh>
        </>
      )}

      {style === "opening" && (
        <mesh>
          <boxGeometry args={[w, h, 0.012]} />
          <meshBasicMaterial color="#0a0908" transparent opacity={0.42} />
        </mesh>
      )}

      {selected && !pathTraced && (
        <mesh position={[0, 0, -0.02]}>
          <boxGeometry args={[w + 0.08, h + 0.08, 0.025]} />
          <meshBasicMaterial color="#f5c64d" wireframe />
        </mesh>
      )}
    </group>
  );
};

const VoidMarker = ({
  voidArea,
  heightM,
  selected,
  onSelect
}: {
  voidArea: VoidArea;
  heightM: number;
  selected: boolean;
  onSelect: (selection: Selection) => void;
}) => {
  const pathTraced = usePathTraced();
  const placement = usePlacement();
  if (pathTraced) return null;
  return (
  <group
    position={[voidArea.center.x, heightM + 0.36, voidArea.center.z]}
    // 選択は pointerdown で確定（onClick だと手前→背後へ click が伝播して選択転写が起きる）。
    onPointerDown={(event: ThreeEvent<PointerEvent>) => {
      // 配置中はクリックを床キャッチャーへ素通りさせる（選択も伝播停止もしない）。
      if (placement.pendingAdd) return;
      // ドラッグハンドル(グリップ)は常に手前に見えるため、覆いかぶさるこのマーカーより
      // 優先して掴めるようにする（吹き抜け際の照明グリップを掴みにくい問題への対処）。
      if (eventHitsDragHandle(event)) return;
      event.stopPropagation();
      // 選択中の吹き抜けを再クリックしたら選択解除（手軽に解除できるように）。
      onSelect(selected ? null : { kind: "void", id: voidArea.id });
    }}
  >
    {selected && (
      <mesh>
        <boxGeometry args={[voidArea.size.x, 0.72, voidArea.size.z]} />
        <meshBasicMaterial color="#f5c64d" wireframe transparent opacity={0.45} />
      </mesh>
    )}
    <mesh position={[0, -0.39, 0]} rotation-x={-Math.PI / 2}>
      <planeGeometry args={[voidArea.size.x, voidArea.size.z]} />
      <meshBasicMaterial color="#050505" transparent opacity={selected ? 0.42 : 0.16} />
    </mesh>
  </group>
  );
};

// 3Dの面ハンドル（球）1つ。平面ヒットで掴んだ点を resize に渡す。
const ResizeHandle3D = ({
  position,
  color,
  getPlane,
  onHit
}: {
  position: [number, number, number];
  color: string;
  getPlane: () => THREE.Plane;
  onHit: (point: THREE.Vector3) => void;
}) => {
  const drag = useHandleDrag(getPlane, onHit);
  return (
    <mesh
      position={position}
      onPointerDown={drag.onPointerDown}
      onPointerMove={drag.onPointerMove}
      onPointerUp={drag.onPointerUp}
      onPointerCancel={drag.onPointerCancel}
    >
      <sphereGeometry args={[0.085, 16, 12]} />
      <meshBasicMaterial color={color} depthTest={false} transparent opacity={0.95} />
    </mesh>
  );
};

// 選択中の家具に幅(±x)・奥行(±z)・高さ(+y)のリサイズハンドルを表示する（3Dでの大きさ変更）。
const FurnitureResizeHandles = ({ item }: { item: FurnitureItem }) => {
  const updateFurniture = useProjectStore((state) => state.updateFurniture);
  const camera = useThree((state) => state.camera);
  const apply = (axis: "x" | "z" | "y", sign: 1 | -1) => (hit: THREE.Vector3) => {
    const r = resizeBox3D(item.position, item.size, item.rotationYDeg, axis, sign, { x: hit.x, y: hit.y, z: hit.z });
    updateFurniture(item.id, { position: r.center, size: r.size });
  };
  // x/z は家具の中心高さの水平面、y はカメラ方向を向いた鉛直面でヒットを取る。
  const horizPlane = () => new THREE.Plane(new THREE.Vector3(0, 1, 0), -item.position.y);
  const vertPlane = () => {
    const n = new THREE.Vector3(camera.position.x - item.position.x, 0, camera.position.z - item.position.z);
    if (n.lengthSq() < 1e-6) n.set(0, 0, 1);
    n.normalize();
    return new THREE.Plane(n, -n.dot(new THREE.Vector3(item.position.x, item.position.y, item.position.z)));
  };
  const hx = item.size.x / 2;
  const hy = item.size.y / 2;
  const hz = item.size.z / 2;
  return (
    <>
      <ResizeHandle3D position={[hx, 0, 0]} color="#ff5d8f" getPlane={horizPlane} onHit={apply("x", 1)} />
      <ResizeHandle3D position={[-hx, 0, 0]} color="#ff5d8f" getPlane={horizPlane} onHit={apply("x", -1)} />
      <ResizeHandle3D position={[0, 0, hz]} color="#5dd0ff" getPlane={horizPlane} onHit={apply("z", 1)} />
      <ResizeHandle3D position={[0, 0, -hz]} color="#5dd0ff" getPlane={horizPlane} onHit={apply("z", -1)} />
      <ResizeHandle3D position={[0, hy, 0]} color="#ffd95d" getPlane={vertPlane} onHit={apply("y", 1)} />
    </>
  );
};

const FurnitureMesh = ({
  project,
  item,
  materialMap,
  selected,
  onSelect,
  debugMode
}: {
  project: Project;
  item: FurnitureItem;
  materialMap: Map<string, MaterialPreset>;
  selected: boolean;
  onSelect: (selection: Selection) => void;
  debugMode: RenderDebugMode;
}) => {
  const material = materialMap.get(item.materialId);
  const color = item.color ?? material?.baseColor ?? "#777";
  const roughness = item.roughness ?? material?.roughness ?? 0.75;
  const metalness = item.metalness ?? material?.metalness ?? 0;
  const pathTraced = usePathTraced();
  const editMode = useEditMode();
  const placement = usePlacement();
  const updateFurniture = useProjectStore((state) => state.updateFurniture);
  const deleteSelection = useProjectStore((state) => state.deleteSelection);
  const floorLevelM = useProjectStore((state) => state.project.room.floorLevelM ?? 0);
  // 選択済みオブジェクトの再クリックで選択解除するトグル判定用。実際にドラッグが
  // 発生した場合（=移動操作）は解除しない、クリックのみ(移動なし)の時だけ解除する。
  const wasSelectedRef = useRef(false);
  const movedRef = useRef(false);
  const drag = useFloorDrag(
    { x: item.position.x, z: item.position.z },
    // 家具は floorLevelM 群に乗るのでドラッグ平面も同量持ち上げる（floorLevelM=0で従来同一）。
    floorLevelM + item.position.y,
    (x, z) => {
      movedRef.current = true;
      const next = constrainFurniturePlacement(project, item, { ...item.position, x, z });
      updateFurniture(item.id, { position: next.position, rotationYDeg: next.rotationYDeg });
    }
  );

  return (
    <group
      position={[item.position.x, item.position.y, item.position.z]}
      rotation={[0, degToRad(item.rotationYDeg), 0]}
      // 外壁越しに奥のこのオブジェクトを選べるよう、選択可能マーカーを付与。
      userData={{ selectable: true }}
      onPointerDown={(event: ThreeEvent<PointerEvent>) => {
        const hitFurnitureBody = eventObjectHasMarker(event, "furnitureBody");
        // 配置中は家具の上に重ねて置けるよう、床キャッチャーへ素通りさせる。
        if (placement.pendingAdd) return;
        // 手前の家具をクリックしたら確定（背後の壁へ選択が伝播するのを止める）。
        event.stopPropagation();
        if (editMode === "delete") {
          deleteSelection({ kind: "furniture", id: item.id });
          return;
        }
        wasSelectedRef.current = selected;
        movedRef.current = false;
        if (!selected) onSelect({ kind: "furniture", id: item.id });
        if (editMode === "select" && selected && hitFurnitureBody) drag.onPointerDown(event);
      }}
      onPointerMove={editMode === "select" ? drag.onPointerMove : undefined}
      onPointerUp={
        editMode === "select"
          ? (event: ThreeEvent<PointerEvent>) => {
              drag.onPointerUp(event);
              // 移動を伴わないクリックで、既に選択中の家具を再選択しようとした場合のみ解除する。
              if (wasSelectedRef.current && !movedRef.current) onSelect(null);
              wasSelectedRef.current = false;
            }
          : undefined
      }
      onPointerCancel={
        editMode === "select"
          ? (event: ThreeEvent<PointerEvent>) => {
              drag.onPointerCancel(event);
              wasSelectedRef.current = false;
            }
          : undefined
      }
    >
      <group userData={{ furnitureBody: true }}>
        <FurniturePrimitive
          item={item}
          color={debugColorForRole("furniture", debugMode, color)}
          roughness={roughness}
          metalness={debugMode === "beauty" ? metalness : 0}
        />
      </group>
      {selected && !pathTraced && (
        <>
          <mesh raycast={ignoreRaycast}>
            <boxGeometry args={[item.size.x + 0.08, item.size.y + 0.08, item.size.z + 0.08]} />
            <meshBasicMaterial color="#f5c64d" wireframe transparent opacity={0.9} />
          </mesh>
          <FurnitureResizeHandles item={item} />
        </>
      )}
    </group>
  );
};

const FurniturePrimitive = ({
  item,
  color,
  roughness,
  metalness
}: {
  item: FurnitureItem;
  color: string;
  roughness: number;
  metalness: number;
}) => {
  if (item.type === "roundTable") {
    return (
      <>
        <mesh castShadow receiveShadow position={[0, item.size.y / 2, 0]}>
          <cylinderGeometry args={[item.size.x / 2, item.size.x / 2, 0.08, 72]} />
          <meshStandardMaterial color={color} roughness={roughness} metalness={metalness} />
        </mesh>
        <mesh castShadow position={[0, item.size.y / 4, 0]}>
          <cylinderGeometry args={[0.055, 0.085, item.size.y / 2, 32]} />
          <meshStandardMaterial color="#1d1c19" roughness={0.44} metalness={0.6} />
        </mesh>
      </>
    );
  }

  if (item.type === "chair") {
    return (
      <>
        <mesh castShadow receiveShadow position={[0, -0.08, 0]}>
          <boxGeometry args={[item.size.x, 0.1, item.size.z]} />
          <meshStandardMaterial color={color} roughness={roughness} metalness={metalness} />
        </mesh>
        <mesh castShadow receiveShadow position={[0, 0.26, -item.size.z / 2 + 0.06]}>
          <boxGeometry args={[item.size.x, 0.72, 0.09]} />
          <meshStandardMaterial color={color} roughness={roughness} metalness={metalness} />
        </mesh>
      </>
    );
  }

  if (item.type === "sofa") {
    return (
      <>
        <mesh castShadow receiveShadow position={[0, -0.08, 0]}>
          <boxGeometry args={[item.size.x, 0.35, item.size.z]} />
          <meshStandardMaterial color={color} roughness={roughness} />
        </mesh>
        <mesh castShadow receiveShadow position={[0, 0.22, -item.size.z / 2 + 0.1]}>
          <boxGeometry args={[item.size.x, 0.72, 0.2]} />
          <meshStandardMaterial color={color} roughness={roughness} />
        </mesh>
        {[-0.62, 0, 0.62].map((x) => (
          <mesh key={x} castShadow receiveShadow position={[x, 0.14, 0.12]}>
            <boxGeometry args={[0.58, 0.18, 0.52]} />
            <meshStandardMaterial color="#817b70" roughness={0.96} />
          </mesh>
        ))}
      </>
    );
  }

  if (item.type === "kitchen") {
    return (
      <>
        <mesh castShadow receiveShadow>
          <boxGeometry args={[item.size.x, item.size.y, item.size.z]} />
          <meshStandardMaterial color={color} roughness={roughness} metalness={metalness} />
        </mesh>
        <mesh position={[0, item.size.y / 2 + 0.035, 0]} castShadow receiveShadow>
          <boxGeometry args={[item.size.x + 0.08, 0.07, item.size.z + 0.08]} />
          <meshStandardMaterial color="#b8b4aa" roughness={0.38} />
        </mesh>
        {[-0.85, 0, 0.85].map((x) => (
          <mesh key={x} position={[x, 0.02, item.size.z / 2 + 0.012]}>
            <boxGeometry args={[0.62, 0.64, 0.018]} />
            <meshStandardMaterial color="#0c0c0b" roughness={0.78} />
          </mesh>
        ))}
      </>
    );
  }

  if (item.type === "tv") {
    return (
      <mesh castShadow receiveShadow>
        <boxGeometry args={[item.size.x, item.size.y, item.size.z]} />
        <meshStandardMaterial color="#030303" roughness={0.18} metalness={0.02} emissive="#050914" emissiveIntensity={0.22} />
      </mesh>
    );
  }

  if (item.type === "bed") {
    const { x: w, y: h, z: d } = item.size;
    return (
      <>
        {/* フレーム */}
        <mesh castShadow receiveShadow position={[0, -h / 2 + h * 0.22, 0]}>
          <boxGeometry args={[w, h * 0.44, d]} />
          <meshStandardMaterial color="#6b5b45" roughness={0.7} />
        </mesh>
        {/* マットレス＋掛け布団 */}
        <mesh castShadow receiveShadow position={[0, -h / 2 + h * 0.62, d * 0.04]}>
          <boxGeometry args={[w * 0.96, h * 0.36, d * 0.92]} />
          <meshStandardMaterial color={color} roughness={roughness} metalness={metalness} />
        </mesh>
        {/* 枕 */}
        <mesh castShadow position={[0, -h / 2 + h * 0.86, -d / 2 + d * 0.13]}>
          <boxGeometry args={[w * 0.82, h * 0.16, d * 0.16]} />
          <meshStandardMaterial color="#f0ece2" roughness={0.88} />
        </mesh>
        {/* ヘッドボード */}
        <mesh castShadow receiveShadow position={[0, 0, -d / 2 + 0.04]}>
          <boxGeometry args={[w, h, 0.08]} />
          <meshStandardMaterial color="#5c4d3a" roughness={0.72} />
        </mesh>
      </>
    );
  }

  if (item.type === "fridge") {
    const { x: w, y: h, z: d } = item.size;
    return (
      <>
        <mesh castShadow receiveShadow>
          <boxGeometry args={[w, h, d]} />
          <meshStandardMaterial color={color} roughness={roughness} metalness={metalness} />
        </mesh>
        {/* 上下ドアの分割溝（正面=+z） */}
        <mesh position={[0, h * 0.08, d / 2 + 0.002]}>
          <boxGeometry args={[w * 0.98, 0.014, 0.012]} />
          <meshStandardMaterial color="#9a9a9c" roughness={0.5} metalness={0.3} />
        </mesh>
        {/* 縦ハンドル2本 */}
        {[h * 0.3, -h * 0.16].map((y) => (
          <mesh key={y} position={[-w / 2 + 0.07, y, d / 2 + 0.022]}>
            <boxGeometry args={[0.03, h * 0.22, 0.03]} />
            <meshStandardMaterial color="#b8b8ba" roughness={0.3} metalness={0.55} />
          </mesh>
        ))}
      </>
    );
  }

  if (item.type === "shelf") {
    // 可動棚（オープンシェルフ）: 側板＋背板＋複数の棚板。奥行=z, 背面=-z を壁付け想定。
    const { x: w, y: h, z: d } = item.size;
    const bays = Math.max(2, Math.round(h / 0.4));
    return (
      <>
        {[-1, 1].map((side) => (
          <mesh key={side} castShadow receiveShadow position={[side * (w / 2 - 0.02), 0, 0]}>
            <boxGeometry args={[0.04, h, d]} />
            <meshStandardMaterial color={color} roughness={roughness} metalness={metalness} />
          </mesh>
        ))}
        <mesh receiveShadow position={[0, 0, -d / 2 + 0.015]}>
          <boxGeometry args={[w, h, 0.03]} />
          <meshStandardMaterial color={color} roughness={roughness} />
        </mesh>
        {Array.from({ length: bays + 1 }).map((_, index) => (
          <mesh key={index} castShadow receiveShadow position={[0, -h / 2 + (h / bays) * index, 0]}>
            <boxGeometry args={[w - 0.04, 0.03, d - 0.02]} />
            <meshStandardMaterial color={color} roughness={roughness} metalness={metalness} />
          </mesh>
        ))}
      </>
    );
  }

  if (item.type === "rug") {
    return (
      <mesh receiveShadow>
        <boxGeometry args={[item.size.x, item.size.y, item.size.z]} />
        <meshStandardMaterial color={color} roughness={roughness} metalness={metalness} />
      </mesh>
    );
  }

  if (item.type === "stair") {
    // スケルトン階段（蹴込み板なし）: 段板＋両側ストリンガーのみで構成し、隙間から向こうが見える。
    const steps = Math.max(3, Math.min(24, Math.round(item.size.y / 0.18)));
    const tread = item.size.z / steps;
    const riser = item.size.y / steps;
    const stringerLength = Math.hypot(item.size.y, item.size.z);
    const stringerAngle = Math.atan2(item.size.z, item.size.y);
    return (
      <>
        {Array.from({ length: steps }).map((_, index) => (
          <mesh
            key={index}
            castShadow
            receiveShadow
            position={[0, (index + 1) * riser - 0.026, -item.size.z / 2 + index * tread + tread / 2]}
          >
            <boxGeometry args={[item.size.x, 0.052, tread * 0.82]} />
            <meshStandardMaterial color={color} roughness={roughness} metalness={metalness} />
          </mesh>
        ))}
        {[-1, 1].map((side) => (
          <mesh
            key={side}
            castShadow
            receiveShadow
            position={[side * (item.size.x / 2 - 0.04), item.size.y / 2, 0]}
            rotation={[stringerAngle, 0, 0]}
          >
            <boxGeometry args={[0.06, stringerLength, 0.16]} />
            <meshStandardMaterial color="#1c1c1a" roughness={0.5} metalness={0.6} />
          </mesh>
        ))}
      </>
    );
  }

  if (item.type === "washer") {
    // 洗濯機: 白い箱＋正面(+z)の丸い扉。
    const { x: w, y: h, z: d } = item.size;
    return (
      <>
        <mesh castShadow receiveShadow>
          <boxGeometry args={[w, h, d]} />
          <meshStandardMaterial color="#f0f0ee" roughness={0.45} metalness={metalness} />
        </mesh>
        <mesh position={[0, -h * 0.05, d / 2 + 0.004]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[Math.min(w, h) * 0.32, Math.min(w, h) * 0.32, 0.02, 32]} />
          <meshStandardMaterial color="#2a2c30" roughness={0.3} metalness={0.4} />
        </mesh>
      </>
    );
  }

  if (item.type === "washstand") {
    // 洗面化粧台: カウンター＋下部キャビネット＋上部の鏡板。
    const { x: w, y: h, z: d } = item.size;
    const counterY = h * 0.45;
    return (
      <>
        {/* 下部キャビネット */}
        <mesh castShadow receiveShadow position={[0, -h / 2 + counterY / 2, 0]}>
          <boxGeometry args={[w, counterY, d]} />
          <meshStandardMaterial color="#e9e7e1" roughness={0.5} metalness={metalness} />
        </mesh>
        {/* カウンター天板 */}
        <mesh castShadow receiveShadow position={[0, -h / 2 + counterY + 0.02, 0]}>
          <boxGeometry args={[w + 0.03, 0.04, d + 0.03]} />
          <meshStandardMaterial color="#f4f3ef" roughness={0.3} metalness={metalness} />
        </mesh>
        {/* 鏡板（背面寄り上部） */}
        <mesh receiveShadow position={[0, h / 2 - h * 0.18, -d / 2 + 0.02]}>
          <boxGeometry args={[w * 0.86, h * 0.34, 0.02]} />
          <meshStandardMaterial color="#aab4bc" roughness={0.08} metalness={0.55} />
        </mesh>
      </>
    );
  }

  if (item.type === "toilet") {
    // 便器（ボウル）＋背面タンクの2段構成。
    const { x: w, y: h, z: d } = item.size;
    const bowlH = h * 0.55;
    const tankH = h * 0.45;
    return (
      <>
        {/* ボウル */}
        <mesh castShadow receiveShadow position={[0, -h / 2 + bowlH / 2, d * 0.12]}>
          <boxGeometry args={[w * 0.7, bowlH, d * 0.72]} />
          <meshStandardMaterial color="#f3f3f1" roughness={0.25} metalness={metalness} />
        </mesh>
        {/* 便座（上面） */}
        <mesh receiveShadow position={[0, -h / 2 + bowlH + 0.015, d * 0.12]}>
          <boxGeometry args={[w * 0.76, 0.04, d * 0.78]} />
          <meshStandardMaterial color="#fafafa" roughness={0.3} />
        </mesh>
        {/* 背面タンク */}
        <mesh castShadow receiveShadow position={[0, h / 2 - tankH / 2, -d / 2 + d * 0.16]}>
          <boxGeometry args={[w * 0.82, tankH, d * 0.3]} />
          <meshStandardMaterial color="#f3f3f1" roughness={0.25} metalness={metalness} />
        </mesh>
      </>
    );
  }

  if (item.type === "bathtub") {
    // 浴槽: 外箱＋内側を浅く窪ませた湯面。窪みは薄い縁を残した内箱で表現する。
    const { x: w, y: h, z: d } = item.size;
    const rim = Math.min(w, d) * 0.12;
    return (
      <>
        <mesh castShadow receiveShadow>
          <boxGeometry args={[w, h, d]} />
          <meshStandardMaterial color="#eef0f0" roughness={0.3} metalness={metalness} />
        </mesh>
        {/* 内側の窪み（湯面を兼ねた青みがかった面） */}
        <mesh position={[0, h / 2 - 0.06, 0]}>
          <boxGeometry args={[w - rim * 2, 0.06, d - rim * 2]} />
          <meshStandardMaterial color="#cfe0e6" roughness={0.12} metalness={0.1} />
        </mesh>
      </>
    );
  }

  if (item.type === "desk") {
    // デスク: 天板＋4本脚。
    const { x: w, y: h, z: d } = item.size;
    const topT = 0.04;
    const legW = 0.05;
    const legY = -h / 2 + (h - topT) / 2;
    const legH = h - topT;
    const offX = w / 2 - legW / 2 - 0.02;
    const offZ = d / 2 - legW / 2 - 0.02;
    return (
      <>
        <mesh castShadow receiveShadow position={[0, h / 2 - topT / 2, 0]}>
          <boxGeometry args={[w, topT, d]} />
          <meshStandardMaterial color={color} roughness={roughness} metalness={metalness} />
        </mesh>
        {[
          [offX, offZ],
          [-offX, offZ],
          [offX, -offZ],
          [-offX, -offZ]
        ].map(([x, z], index) => (
          <mesh key={index} castShadow receiveShadow position={[x, legY, z]}>
            <boxGeometry args={[legW, legH, legW]} />
            <meshStandardMaterial color="#3a342b" roughness={0.6} metalness={metalness} />
          </mesh>
        ))}
      </>
    );
  }

  if (item.type === "shoeCabinet") {
    // 下駄箱: 縦長キャビネット＋扉の分割溝（正面=+z）。
    const { x: w, y: h, z: d } = item.size;
    return (
      <>
        <mesh castShadow receiveShadow>
          <boxGeometry args={[w, h, d]} />
          <meshStandardMaterial color={color} roughness={roughness} metalness={metalness} />
        </mesh>
        {/* 扉の縦溝（左右2枚扉想定） */}
        <mesh position={[0, 0, d / 2 + 0.002]}>
          <boxGeometry args={[0.012, h * 0.96, 0.012]} />
          <meshStandardMaterial color="#9a9a96" roughness={0.5} />
        </mesh>
      </>
    );
  }

  return (
    <mesh castShadow={item.castsShadow} receiveShadow>
      <boxGeometry args={[item.size.x, item.size.y, item.size.z]} />
      <meshStandardMaterial color={color} roughness={roughness} metalness={metalness} />
    </mesh>
  );
};

const DuctRail = () => (
  <mesh position={[-3.0, 2.37, -1.18]} castShadow>
    <boxGeometry args={[2.2, 0.035, 0.055]} />
    <meshStandardMaterial color="#10100f" roughness={0.45} metalness={0.8} />
  </mesh>
);

// ドラッグ移動中、他ライトのX/Z軸への吸着（パワポ風の整列スナップ）。自分自身は除外し、
// x/z 独立で最寄り候補に吸い付く。snapX/snapZ は効いている軸のガイド線座標（null=非吸着）。
const DRAG_SNAP_M = 0.12;
const snapDragToLightAxes = (
  x: number,
  z: number,
  lights: LightFixture[],
  selfId: string
): { x: number; z: number; snapX: number | null; snapZ: number | null } => {
  let snapX: number | null = null;
  let snapZ: number | null = null;
  let bestX = DRAG_SNAP_M;
  let bestZ = DRAG_SNAP_M;
  for (const light of lights) {
    if (light.id === selfId) continue;
    const dx = Math.abs(light.position.x - x);
    if (dx < bestX) {
      bestX = dx;
      snapX = light.position.x;
    }
    const dz = Math.abs(light.position.z - z);
    if (dz < bestZ) {
      bestZ = dz;
      snapZ = light.position.z;
    }
  }
  return { x: snapX ?? x, z: snapZ ?? z, snapX, snapZ };
};

type FixtureMoveMode = "horizontal" | "vertical";

const FixtureMesh = ({
  fixture,
  emitsLight,
  castsRealtimeShadow,
  selected,
  onSelect,
  debugMode
}: {
  fixture: LightFixture;
  emitsLight: boolean;
  castsRealtimeShadow: boolean;
  selected: boolean;
  onSelect: (selection: Selection) => void;
  debugMode: RenderDebugMode;
}) => {
  const lightColor = colorTemperatureToHex(fixture.colorTemperatureK);
  const controls = useThree((state) => state.controls) as { enabled: boolean } | null;
  const touchGuard = useTouchDragGuard();
  const pathTraced = usePathTraced();
  const editMode = useEditMode();
  const placement = usePlacement();
  const updateLight = useProjectStore((store) => store.updateLight);
  const deleteSelection = useProjectStore((store) => store.deleteSelection);
  const project = useProjectStore((store) => store.project);
  const floorLevelM = useProjectStore((store) => store.project.room.floorLevelM ?? 0);
  const lights = useProjectStore((store) => store.project.lights);
  const toggleLightSelection = useProjectStore((store) => store.toggleLightSelection);
  const multiSelected = useProjectStore((store) => store.selectedLightIds.includes(fixture.id));
  const wallMounted = isWallMountedFixture(fixture);
  const [moveMode, setMoveMode] = useState<FixtureMoveMode>("horizontal");
  // ドラッグ中に効いている整列軸のガイド位置（編集時のみ描画）。
  const [dragSnap, setDragSnap] = useState<{ snapX: number | null; snapZ: number | null } | null>(null);
  const wasSelectedRef = useRef(false);
  const movedRef = useRef(false);
  const heightDragging = useRef(false);
  const heightGrabY = useRef(0);
  const heightHit = useMemo(() => new THREE.Vector3(), []);
  const minMoveY = wallMounted ? 0.3 : 0.08;
  const maxMoveY = Math.max(
    minMoveY + 0.2,
    wallMounted
      ? wallMountHeightLimit(project, fixture) - 0.05
      : ceilingMountHeightAt(project, { x: fixture.position.x, z: fixture.position.z }) - 0.02
  );
  const drag = useViewPlaneDrag(
    { x: fixture.position.x, z: fixture.position.z },
    floorLevelM + fixture.position.y,
    (rawX, rawZ) => {
      if (wallMounted) {
        const placement = wallMountedLightPlacementAt(
          project,
          rawX,
          rawZ,
          fixture.position.y,
          fixture.floor ?? project.activeFloor ?? 1
        );
        if (!placement) return;
        movedRef.current = true;
        updateLight(fixture.id, {
          position: placement.position,
          mountHeightM: placement.position.y,
          rotationDeg: { ...fixture.rotationDeg, y: placement.rotationYDeg },
          target: placement.target
        });
        return;
      }
      // 生の(x,z)を他ライト軸へ吸着してから反映（掴み相対オフセットは useFloorDrag が保持済み）。
      const snap = snapDragToLightAxes(rawX, rawZ, lights, fixture.id);
      setDragSnap(snap.snapX !== null || snap.snapZ !== null ? { snapX: snap.snapX, snapZ: snap.snapZ } : null);
      movedRef.current = true;
      const x = snap.x;
      const z = snap.z;
      const dx = x - fixture.position.x;
      const dz = z - fixture.position.z;
      updateLight(fixture.id, {
        position: { ...fixture.position, x, z },
        target: fixture.target ? { ...fixture.target, x: fixture.target.x + dx, z: fixture.target.z + dz } : undefined
      });
    }
  );

  useEffect(() => {
    return () => {
      if (controls) controls.enabled = true;
    };
  }, [controls]);

  const heightFromRay = (event: ThreeEvent<PointerEvent>) => {
    const start = new THREE.Vector3(fixture.position.x, floorLevelM + minMoveY, fixture.position.z);
    const end = new THREE.Vector3(fixture.position.x, floorLevelM + maxMoveY, fixture.position.z);
    event.ray.distanceSqToSegment(start, end, undefined, heightHit);
    return heightHit.y - floorLevelM;
  };

  const startHeightDrag = (event: ThreeEvent<PointerEvent>) => {
    if (event.button !== 0) return;
    if (event.pointerType === "touch" && touchGuard.hasMultiTouch()) return;
    event.stopPropagation();
    heightDragging.current = true;
    heightGrabY.current = fixture.position.y - heightFromRay(event);
    (event.target as Element | null)?.setPointerCapture?.(event.pointerId);
    if (controls) controls.enabled = false;
  };

  const stopHeightDrag = (event: ThreeEvent<PointerEvent>) => {
    if (!heightDragging.current) return;
    heightDragging.current = false;
    (event.target as Element | null)?.releasePointerCapture?.(event.pointerId);
    if (controls) controls.enabled = true;
  };

  const handleHeightDragMove = (event: ThreeEvent<PointerEvent>) => {
    if (!heightDragging.current) return;
    if (event.pointerType === "touch" && touchGuard.hasMultiTouch()) {
      stopHeightDrag(event);
      return;
    }
    event.stopPropagation();
    const y = THREE.MathUtils.clamp(heightFromRay(event) + heightGrabY.current, minMoveY, maxMoveY);
    movedRef.current = true;
    updateLight(fixture.id, { position: { ...fixture.position, y }, mountHeightM: y });
  };

  const showOutline = (selected || multiSelected) && !pathTraced;
  const showAimEditor = selected && isAimable(fixture) && !pathTraced && editMode !== "delete";
  // ガイド線は非物理の編集補助なので常駐パストレ時は出さない（WYSIWYG不変条件）。
  const guideY = floorLevelM + fixture.position.y;
  const guideSpan = 40;

  return (
    <group
      position={[fixture.position.x, fixture.position.y, fixture.position.z]}
      // 外壁越しに奥のこの照明を選べるよう、選択可能マーカーを付与。
      userData={{ selectable: true }}
      onPointerDown={(event: ThreeEvent<PointerEvent>) => {
        const canDragFixture = !eventHitsDragHandle(event);
        // 配置中は照明の上に重ねて置けるよう、床キャッチャーへ素通りさせる。
        if (placement.pendingAdd) return;
        // 手前の照明をクリックしたら確定（背後の壁へ選択が伝播するのを止める）。
        event.stopPropagation();
        if (editMode === "delete") {
          deleteSelection({ kind: "light", id: fixture.id });
          return;
        }
        // Shift+クリックは複数選択トグル。通常クリックは従来どおり単一選択。
        if (event.shiftKey) {
          toggleLightSelection(fixture.id);
          return;
        }
        wasSelectedRef.current = selected;
        movedRef.current = false;
        if (!selected) onSelect({ kind: "light", id: fixture.id });
        if (editMode === "select" && canDragFixture && (selected || multiSelected)) {
          if (moveMode === "vertical") startHeightDrag(event);
          else drag.onPointerDown(event);
        }
      }}
      onDoubleClick={(event: ThreeEvent<MouseEvent>) => {
        if (placement.pendingAdd || !eventObjectHasMarker(event, "fixtureBody")) return;
        event.stopPropagation();
        if (!selected) onSelect({ kind: "light", id: fixture.id });
        setMoveMode((current) => (current === "horizontal" ? "vertical" : "horizontal"));
      }}
      onPointerMove={
        editMode === "select"
          ? (event: ThreeEvent<PointerEvent>) => {
              drag.onPointerMove(event);
              handleHeightDragMove(event);
            }
          : undefined
      }
      onPointerUp={
        editMode === "select"
          ? (event: ThreeEvent<PointerEvent>) => {
              drag.onPointerUp(event);
              stopHeightDrag(event);
              if (wasSelectedRef.current && !movedRef.current) onSelect(null);
              wasSelectedRef.current = false;
              setDragSnap(null);
            }
          : undefined
      }
      onPointerCancel={
        editMode === "select"
          ? (event: ThreeEvent<PointerEvent>) => {
              drag.onPointerCancel(event);
              stopHeightDrag(event);
              wasSelectedRef.current = false;
              setDragSnap(null);
            }
          : undefined
      }
    >
      <group userData={{ fixtureBody: true }}>
        {!pathTraced && <FixtureDragHitTarget fixture={fixture} />}
        <FixtureBody fixture={fixture} color={lightColor} active={emitsLight} debugMode={debugMode} />
        {emitsLight && <PhysicalLight fixture={fixture} castsRealtimeShadow={castsRealtimeShadow} debugMode={debugMode} />}
      </group>
      {showOutline && (
        <>
          <mesh raycast={ignoreRaycast}>
            <sphereGeometry args={[0.18, 24, 16]} />
            <meshBasicMaterial color="#f5c64d" wireframe transparent opacity={0.95} />
          </mesh>
          <FixtureMoveModeCue mode={moveMode} minY={minMoveY} maxY={maxMoveY} currentY={fixture.position.y} />
        </>
      )}
      {!pathTraced && dragSnap?.snapX != null && (
        // group はライト中心に乗っているのでローカル座標へ戻して水平方向に描く。
        <line>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              args={[new Float32Array([0, guideY - fixture.position.y, -guideSpan, 0, guideY - fixture.position.y, guideSpan]), 3]}
            />
          </bufferGeometry>
          <lineBasicMaterial color="#ffd24a" transparent opacity={0.8} />
        </line>
      )}
      {!pathTraced && dragSnap?.snapZ != null && (
        <line>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              args={[new Float32Array([-guideSpan, guideY - fixture.position.y, 0, guideSpan, guideY - fixture.position.y, 0]), 3]}
            />
          </bufferGeometry>
          <lineBasicMaterial color="#ffd24a" transparent opacity={0.8} />
        </line>
      )}
      {showAimEditor && <LightAimHandle fixture={fixture} />}
      {!showAimEditor && debugMode !== "beauty" && fixture.target && (
        <LightDirectionLine fixture={fixture} />
      )}
      {/* 壁付き照明は設置高さ(position.y)自体を上下ドラッグできる専用グリップを出す
          （狙い先=targetの高さドラッグとは別物。壁面のx,z拘束は維持したまま高さだけ動かす）。 */}
      {wallMounted && selected && !pathTraced && editMode !== "delete" && <FixtureHeightHandle fixture={fixture} />}
    </group>
  );
};

const InvisibleHitMaterial = () => (
  <meshBasicMaterial colorWrite={false} depthWrite={false} transparent opacity={0} />
);

const FixtureDragHitTarget = ({ fixture }: { fixture: LightFixture }) => {
  if (fixture.type === "tape") {
    return (
      <mesh>
        <boxGeometry args={[Math.max(fixture.lengthM ?? 1.2, 0.5), 0.36, 0.36]} />
        <InvisibleHitMaterial />
      </mesh>
    );
  }

  return (
    <mesh>
      <sphereGeometry args={[0.42, 18, 12]} />
      <InvisibleHitMaterial />
    </mesh>
  );
};

const FixtureMoveModeCue = ({
  mode,
  minY,
  maxY,
  currentY
}: {
  mode: FixtureMoveMode;
  minY: number;
  maxY: number;
  currentY: number;
}) => {
  if (mode === "vertical") {
    const x = 0.32;
    const low = minY - currentY;
    const high = maxY - currentY;
    return (
      <group renderOrder={39}>
        <DebugLine from={[x, low, 0]} to={[x, high, 0]} color="#7fd6ff" />
        <mesh position={[x, Math.min(high, 0.42), 0]} renderOrder={39} raycast={ignoreRaycast}>
          <coneGeometry args={[0.04, 0.1, 18]} />
          <meshBasicMaterial color="#7fd6ff" transparent opacity={0.88} depthTest={false} />
        </mesh>
        <mesh position={[x, Math.max(low, -0.42), 0]} rotation-x={Math.PI} renderOrder={39} raycast={ignoreRaycast}>
          <coneGeometry args={[0.04, 0.1, 18]} />
          <meshBasicMaterial color="#7fd6ff" transparent opacity={0.88} depthTest={false} />
        </mesh>
      </group>
    );
  }

  return (
    <mesh rotation-x={Math.PI / 2} renderOrder={39} raycast={ignoreRaycast}>
      <torusGeometry args={[0.28, 0.01, 8, 48]} />
      <meshBasicMaterial color="#f5c64d" transparent opacity={0.78} depthTest={false} />
    </mesh>
  );
};

const LightAimHandle = ({ fixture }: { fixture: LightFixture }) => {
  const controls = useThree((state) => state.controls) as { enabled: boolean } | null;
  const touchGuard = useTouchDragGuard();
  const updateLight = useProjectStore((store) => store.updateLight);
  const project = useProjectStore((store) => store.project);
  const floorLevelM = useProjectStore((store) => store.project.room.floorLevelM ?? 0);
  const target = fixture.target ?? { x: fixture.position.x, y: 0, z: fixture.position.z };
  const minTargetY = 0;
  const maxTargetY = Math.max(
    minTargetY + 0.2,
    fixture.position.y + 1.2,
    wallMountHeightLimit(project, fixture),
    project.room.ceilingHeightM + 0.8
  );
  const localOffset = {
    x: target.x - fixture.position.x,
    y: target.y - fixture.position.y,
    z: target.z - fixture.position.z
  };
  const dragRef = useRef<{
    mode: "plane" | "height" | null;
    grabX: number;
    grabY: number;
    grabZ: number;
  }>({ mode: null, grabX: 0, grabY: 0, grabZ: 0 });
  const horizontalPlane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), []);
  const hit = useMemo(() => new THREE.Vector3(), []);
  const heightHit = useMemo(() => new THREE.Vector3(), []);
  const heightGripOffsetX = 0.28;

  useEffect(() => {
    return () => {
      if (controls) controls.enabled = true;
    };
  }, [controls]);

  const heightFromRay = (event: ThreeEvent<PointerEvent>) => {
    const start = new THREE.Vector3(target.x + heightGripOffsetX, floorLevelM + minTargetY, target.z);
    const end = new THREE.Vector3(target.x + heightGripOffsetX, floorLevelM + maxTargetY, target.z);
    event.ray.distanceSqToSegment(start, end, undefined, heightHit);
    return heightHit.y - floorLevelM;
  };

  const startHorizontalDrag = (event: ThreeEvent<PointerEvent>) => {
    if (event.button !== 0) return;
    if (event.pointerType === "touch" && touchGuard.hasMultiTouch()) return;
    event.stopPropagation();
    horizontalPlane.constant = -(floorLevelM + target.y);
    // レイが水平面とほぼ平行(カメラが面と同高)だと intersectPlane が外れるが、
    // ここで return するとドラッグが起動しない。掴みオフセット0でモードだけ確定し、
    // 以降の move で面ヒットが取れた時点から追従を開始する（信頼性優先）。
    const grabbed = event.ray.intersectPlane(horizontalPlane, hit);
    dragRef.current = {
      mode: "plane",
      grabX: grabbed ? target.x - hit.x : 0,
      grabY: 0,
      grabZ: grabbed ? target.z - hit.z : 0
    };
    (event.target as Element | null)?.setPointerCapture?.(event.pointerId);
    if (controls) controls.enabled = false;
  };

  const startHeightDrag = (event: ThreeEvent<PointerEvent>) => {
    if (event.button !== 0) return;
    if (event.pointerType === "touch" && touchGuard.hasMultiTouch()) return;
    event.stopPropagation();
    dragRef.current = {
      mode: "height",
      grabX: 0,
      grabY: target.y - heightFromRay(event),
      grabZ: 0
    };
    (event.target as Element | null)?.setPointerCapture?.(event.pointerId);
    if (controls) controls.enabled = false;
  };

  const handlePointerMove = (event: ThreeEvent<PointerEvent>) => {
    const drag = dragRef.current;
    if (!drag.mode) return;
    if (event.pointerType === "touch" && touchGuard.hasMultiTouch()) {
      stopDrag(event);
      return;
    }
    event.stopPropagation();
    if (drag.mode === "plane") {
      horizontalPlane.constant = -(floorLevelM + target.y);
      if (!event.ray.intersectPlane(horizontalPlane, hit)) return;
      updateLight(fixture.id, {
        target: {
          ...target,
          x: hit.x + drag.grabX,
          z: hit.z + drag.grabZ
        }
      });
      return;
    }
    updateLight(fixture.id, {
      target: {
        ...target,
        y: THREE.MathUtils.clamp(heightFromRay(event) + drag.grabY, minTargetY, maxTargetY)
      }
    });
  };

  const stopDrag = (event: ThreeEvent<PointerEvent>) => {
    if (!dragRef.current.mode) return;
    event.stopPropagation();
    dragRef.current.mode = null;
    (event.target as Element | null)?.releasePointerCapture?.(event.pointerId);
    if (controls) controls.enabled = true;
  };

  // setPointerCapture は event.target（＝onPointerDown を持つグリップmesh）に掛かるため、
  // 追従/終了ハンドラも同じmeshに置かないと move が親グループに届かず即ドロップする。
  // useFloorDrag と同じく capture 先とハンドラ所有者を一致させる。
  const gripDragHandlers = {
    onPointerMove: handlePointerMove,
    onPointerUp: stopDrag,
    onPointerCancel: stopDrag,
    onLostPointerCapture: stopDrag
  };

  return (
    <group renderOrder={40}>
      <DebugLine from={[0, 0, 0]} to={[localOffset.x, localOffset.y, localOffset.z]} color="#ffd34f" />
      <DebugLine
        from={[localOffset.x + heightGripOffsetX, minTargetY - fixture.position.y, localOffset.z]}
        to={[localOffset.x + heightGripOffsetX, maxTargetY - fixture.position.y, localOffset.z]}
        color="#ffe38a"
      />
      {/* depthTest 無効で常に手前に描く=見た目は最優先のため、raycast上も奥の壁/吹き抜けに
          負けないよう userData.dragHandle を付与する（WallMesh/VoidMarker側が優先譲歩する）。 */}
      <group position={[localOffset.x, localOffset.y, localOffset.z]} userData={{ dragHandle: true }}>
        {/* 当たり判定プロキシ: リング内側まで掴める不可視ディスク（colorWrite=false で
            描画されないが raycast 対象）。極小グリップのヒット面積不足を補う。 */}
        <mesh onPointerDown={startHorizontalDrag} {...gripDragHandlers} renderOrder={41}>
          <cylinderGeometry args={[0.2, 0.2, 0.04, 24]} />
          <meshBasicMaterial colorWrite={false} depthWrite={false} depthTest={false} transparent opacity={0} />
        </mesh>
        <mesh rotation-x={Math.PI / 2} onPointerDown={startHorizontalDrag} {...gripDragHandlers} renderOrder={42}>
          <torusGeometry args={[0.17, 0.02, 8, 40]} />
          <meshBasicMaterial color="#ffd34f" transparent opacity={0.95} depthTest={false} />
        </mesh>
        <mesh onPointerDown={startHorizontalDrag} {...gripDragHandlers} renderOrder={43}>
          <sphereGeometry args={[0.06, 18, 12]} />
          <meshBasicMaterial color="#fff2a8" transparent opacity={0.95} depthTest={false} />
        </mesh>
        <mesh position={[heightGripOffsetX, 0, 0]} onPointerDown={startHeightDrag} {...gripDragHandlers} renderOrder={44}>
          <sphereGeometry args={[0.055, 18, 12]} />
          <meshBasicMaterial color="#ffb347" transparent opacity={0.95} depthTest={false} />
        </mesh>
        <mesh position={[heightGripOffsetX, 0.12, 0]} onPointerDown={startHeightDrag} {...gripDragHandlers} renderOrder={44}>
          <coneGeometry args={[0.045, 0.09, 18]} />
          <meshBasicMaterial color="#ffb347" transparent opacity={0.85} depthTest={false} />
        </mesh>
        <mesh position={[heightGripOffsetX, -0.12, 0]} rotation-x={Math.PI} onPointerDown={startHeightDrag} {...gripDragHandlers} renderOrder={44}>
          <coneGeometry args={[0.045, 0.09, 18]} />
          <meshBasicMaterial color="#ffb347" transparent opacity={0.85} depthTest={false} />
        </mesh>
      </group>
    </group>
  );
};

// 壁付き照明の可動域上限の目安。所属する壁の高さ（吹き抜け壁なら吹き抜け上部の高さ）を使い、
// 見つからなければ通常天井高さにフォールバックする。
const wallMountHeightLimit = (project: Project, fixture: LightFixture): number => {
  const floor = fixture.floor ?? project.activeFloor ?? 1;
  const surface = nearestWallMountSurfaceAt(project, fixture.position.x, fixture.position.z, floor);
  if (!surface) return project.room.ceilingHeightM;
  if (parseVoidWallId(surface.wallId)) return voidCeilingHeightAt(project, floor);
  const wall = project.walls.find((candidate) => candidate.id === surface.wallId);
  return wall?.heightM ?? project.room.ceilingHeightM;
};

// 壁付き照明の設置高さ(position.y)を直接ドラッグするグリップ。壁面へのx,z拘束は保ったまま
// 高さだけ動かす（狙い先=targetの高さドラッグ(startHeightDrag/LightAimHandle)とは別物）。
const FixtureHeightHandle = ({ fixture }: { fixture: LightFixture }) => {
  const controls = useThree((state) => state.controls) as { enabled: boolean } | null;
  const touchGuard = useTouchDragGuard();
  const updateLight = useProjectStore((store) => store.updateLight);
  const project = useProjectStore((store) => store.project);
  const floorLevelM = useProjectStore((store) => store.project.room.floorLevelM ?? 0);
  const minY = 0.3;
  const maxY = Math.max(minY + 0.2, wallMountHeightLimit(project, fixture) - 0.05);
  const gripOffsetX = -0.26;
  const dragging = useRef(false);
  const grabY = useRef(0);
  const hit = useMemo(() => new THREE.Vector3(), []);

  useEffect(() => {
    return () => {
      if (controls) controls.enabled = true;
    };
  }, [controls]);

  const heightFromRay = (event: ThreeEvent<PointerEvent>) => {
    const start = new THREE.Vector3(fixture.position.x + gripOffsetX, floorLevelM + minY, fixture.position.z);
    const end = new THREE.Vector3(fixture.position.x + gripOffsetX, floorLevelM + maxY, fixture.position.z);
    event.ray.distanceSqToSegment(start, end, undefined, hit);
    return hit.y - floorLevelM;
  };

  const startDrag = (event: ThreeEvent<PointerEvent>) => {
    if (event.button !== 0) return;
    if (event.pointerType === "touch" && touchGuard.hasMultiTouch()) return;
    event.stopPropagation();
    dragging.current = true;
    grabY.current = fixture.position.y - heightFromRay(event);
    (event.target as Element | null)?.setPointerCapture?.(event.pointerId);
    if (controls) controls.enabled = false;
  };

  const stopDrag = (event: ThreeEvent<PointerEvent>) => {
    if (!dragging.current) return;
    dragging.current = false;
    (event.target as Element | null)?.releasePointerCapture?.(event.pointerId);
    if (controls) controls.enabled = true;
  };

  const handlePointerMove = (event: ThreeEvent<PointerEvent>) => {
    if (!dragging.current) return;
    if (event.pointerType === "touch" && touchGuard.hasMultiTouch()) {
      stopDrag(event);
      return;
    }
    event.stopPropagation();
    const y = THREE.MathUtils.clamp(heightFromRay(event) + grabY.current, minY, maxY);
    updateLight(fixture.id, { position: { ...fixture.position, y }, mountHeightM: y });
  };

  const gripDragHandlers = {
    onPointerMove: handlePointerMove,
    onPointerUp: stopDrag,
    onPointerCancel: stopDrag,
    onLostPointerCapture: stopDrag
  };

  return (
    <group renderOrder={40}>
      <DebugLine
        from={[gripOffsetX, minY - fixture.position.y, 0]}
        to={[gripOffsetX, maxY - fixture.position.y, 0]}
        color="#7fd6ff"
      />
      {/* WallMesh/VoidMarker側が奥の壁より優先して譲るための目印(LightAimHandleと同じ仕組み)。 */}
      <group position={[gripOffsetX, 0, 0]} userData={{ dragHandle: true }}>
        <mesh onPointerDown={startDrag} {...gripDragHandlers} renderOrder={41}>
          <sphereGeometry args={[0.06, 18, 12]} />
          <meshBasicMaterial color="#7fd6ff" transparent opacity={0.95} depthTest={false} />
        </mesh>
        <mesh position={[0, 0.11, 0]} onPointerDown={startDrag} {...gripDragHandlers} renderOrder={41}>
          <coneGeometry args={[0.045, 0.09, 18]} />
          <meshBasicMaterial color="#7fd6ff" transparent opacity={0.85} depthTest={false} />
        </mesh>
        <mesh position={[0, -0.11, 0]} rotation-x={Math.PI} onPointerDown={startDrag} {...gripDragHandlers} renderOrder={41}>
          <coneGeometry args={[0.045, 0.09, 18]} />
          <meshBasicMaterial color="#7fd6ff" transparent opacity={0.85} depthTest={false} />
        </mesh>
      </group>
    </group>
  );
};

// 首振り器具（ユニバーサル/壁付スポット）の本体を照射先に向ける。
const AimableSpotBody = ({
  fixture,
  color,
  active,
  bodyColor,
  debugMode
}: {
  fixture: LightFixture;
  color: THREE.Color;
  active: boolean;
  bodyColor: string;
  debugMode: RenderDebugMode;
}) => {
  const ref = useRef<THREE.Group>(null);
  const target = fixture.target;
  useEffect(() => {
    const group = ref.current;
    if (!group) return;
    const aim = target ?? { x: fixture.position.x, y: 0, z: fixture.position.z };
    const dir = new THREE.Vector3(
      aim.x - fixture.position.x,
      aim.y - fixture.position.y,
      aim.z - fixture.position.z
    );
    if (dir.lengthSq() < 1e-6) return;
    dir.normalize();
    // 本体の下向き(-Y)＝レンズ面を照射方向に合わせる。
    group.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
  }, [fixture.position.x, fixture.position.y, fixture.position.z, target?.x, target?.y, target?.z]);

  return (
    <group ref={ref}>
      {/* 取付プレート（壁付スポットの根元） */}
      <mesh position={[0, 0.12, 0]}>
        <cylinderGeometry args={[0.05, 0.05, 0.04, 20]} />
        <meshStandardMaterial color={bodyColor} roughness={0.5} metalness={debugMode === "beauty" ? 0.6 : 0} />
      </mesh>
      <mesh>
        <cylinderGeometry args={[0.07, 0.092, 0.2, 32]} />
        <meshStandardMaterial color={bodyColor} roughness={0.34} metalness={debugMode === "beauty" ? 0.78 : 0} />
      </mesh>
      <mesh position={[0, -0.11, 0]}>
        <sphereGeometry args={[0.05, 20, 12]} />
        <meshBasicMaterial color={color} transparent opacity={active ? 0.85 : 0.16} />
      </mesh>
    </group>
  );
};

const FixtureBody = ({
  fixture,
  color,
  active,
  debugMode
}: {
  fixture: LightFixture;
  color: THREE.Color;
  active: boolean;
  debugMode: RenderDebugMode;
}) => {
  const bodyColor = debugColorForRole("fixture", debugMode, "#10100f");
  if (fixture.type === "pendant") {
    return (
      <>
        <mesh position={[0, (fixture.cordLengthM ?? 0.8) / 2, 0]}>
          <cylinderGeometry args={[0.012, 0.012, fixture.cordLengthM ?? 0.8, 12]} />
          <meshStandardMaterial color="#111" roughness={0.5} metalness={0.6} />
        </mesh>
        {/* 開口のシェード側面（内側も見えるよう両面）。 */}
        <mesh castShadow>
          <coneGeometry args={[0.24, 0.22, 48, 1, true]} />
          <meshStandardMaterial color={bodyColor} roughness={0.36} metalness={debugMode === "beauty" ? 0.7 : 0} side={THREE.DoubleSide} />
        </mesh>
        {/* シェード上面の不透明キャップ。上方への光漏れ(天井照り)を物理的に遮る。 */}
        <mesh position={[0, 0.11, 0]} castShadow>
          <cylinderGeometry args={[0.072, 0.072, 0.012, 32]} />
          <meshStandardMaterial color={bodyColor} roughness={0.4} metalness={debugMode === "beauty" ? 0.5 : 0} />
        </mesh>
        <mesh position={[0, -0.08, 0]}>
          <sphereGeometry args={[0.085, 24, 16]} />
          <meshBasicMaterial color={color} transparent opacity={active ? 0.9 : 0.18} />
        </mesh>
      </>
    );
  }

  if (fixture.type === "spotlight") {
    return <AimableSpotBody fixture={fixture} color={color} active={active} bodyColor={bodyColor} debugMode={debugMode} />;
  }

  if (fixture.type === "bracket") {
    return (
      <group rotation={[0, degToRad(fixture.rotationDeg.y), 0]}>
        <mesh castShadow position={[0, 0, 0]}>
          <boxGeometry args={[0.09, 0.32, 0.08]} />
          <meshStandardMaterial color={bodyColor} roughness={0.36} metalness={debugMode === "beauty" ? 0.72 : 0} />
        </mesh>
        <mesh position={[-0.07, 0, 0]}>
          <sphereGeometry args={[0.08, 24, 16]} />
          <meshBasicMaterial color={color} transparent opacity={active ? 0.72 : 0.14} />
        </mesh>
      </group>
    );
  }

  if (fixture.type === "tape") {
    return (
      <mesh>
        <boxGeometry args={[fixture.lengthM ?? 1.2, 0.035, 0.018]} />
        <meshStandardMaterial
          color={debugColorForRole("fixture", debugMode, "#fff2d4")}
          emissive={color}
          emissiveIntensity={debugMode === "beauty" ? (active ? 1.7 : 0.08) : 0}
          roughness={0.36}
        />
      </mesh>
    );
  }

  // 埋込ダウンライト: 天井に埋まる暗色トリム＋上方を塞ぐ不透明キャップ＋真下向きの発光アパーチャ。
  // キャップとトリムで上方への発光・漏れを物理的に遮り、天井面が照らないようにする（要望: 天井が明るくなるのを是正）。
  return (
    <>
      {/* 天井開口の暗色トリム（自発光しない） */}
      <mesh position={[0, 0.0, 0]}>
        <cylinderGeometry args={[0.105, 0.092, 0.05, 40, 1, true]} />
        <meshStandardMaterial
          color={debugColorForRole("fixture", debugMode, "#201e1a")}
          roughness={0.6}
          metalness={debugMode === "beauty" ? 0.1 : 0}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* 上方への光漏れ・発光の天井照りを塞ぐ不透明キャップ */}
      <mesh position={[0, 0.04, 0]}>
        <cylinderGeometry args={[0.108, 0.108, 0.014, 24]} />
        <meshStandardMaterial color="#17150f" roughness={0.75} />
      </mesh>
      {/* 真下を向く発光アパーチャ。rotation[+π/2]で法線を -Y(真下)にし、室内（下）から
          見て器具が光って見えるようにする（要望: ダウンライト自体が光っていないのを是正）。 */}
      <mesh position={[0, -0.024, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.07, 32]} />
        <meshBasicMaterial color={color} transparent opacity={active ? 0.92 : 0.16} side={THREE.FrontSide} />
      </mesh>
    </>
  );
};

const PhysicalLight = ({
  fixture,
  castsRealtimeShadow,
  debugMode
}: {
  fixture: LightFixture;
  castsRealtimeShadow: boolean;
  debugMode: RenderDebugMode;
}) => {
  const scene = useThree((state) => state.scene);
  const pathTraced = usePathTraced();
  const target = useMemo(() => new THREE.Object3D(), []);
  const power = lumensToPhysicalPower(fixture);
  const color = colorTemperatureToHex(fixture.colorTemperatureK);
  const targetPosition = fixture.target ?? { x: fixture.position.x, y: 0.1, z: fixture.position.z };
  const castShadow = !pathTraced && castsRealtimeShadow;

  useEffect(() => {
    scene.add(target);
    return () => {
      scene.remove(target);
    };
  }, [scene, target]);

  useFrame(() => {
    target.position.set(targetPosition.x, targetPosition.y, targetPosition.z);
    target.updateMatrixWorld();
  });

  if (fixture.type === "tape") {
    return (
      <>
        <pointLight color={color} power={power * 0.5} distance={0} decay={2} position={[0, 0.08, 0.04]} />
        <pointLight color={color} power={power * 0.5} distance={0} decay={2} position={[0, -0.08, 0.04]} />
      </>
    );
  }

  if (fixture.type === "bracket") {
    // 光源を取付面（壁）から室内側へ離す。壁に密着した点光源は decay=2 の
    // 逆二乗で至近距離の壁を焼き白飛びさせる。target（照射方向＝室内向き）へ
    // 水平に ~0.16m 出して至近の壁の白飛びを防ぐ。
    const off = bracketRoomwardOffset(fixture, 0.16);
    return (
      <pointLight
        color={color}
        power={power}
        distance={0}
        decay={2}
        position={[off.x, 0, off.z]}
        castShadow={castShadow}
        shadow-mapSize={[512, 512]}
      />
    );
  }

  if (fixture.type === "pendant") {
    // ペンダントは下方配光。全方向 pointLight だと天井まで照ってしまうため、
    // 真下向きの広角スポット(≈140°)にしてテーブル面を主に照らす。
    // 上方への漏れはシェード上面(不透明)でも遮るが、配光自体も下向きに限定する。
    return (
      <spotLight
        color={color}
        power={power}
        angle={degToRad(70)}
        penumbra={0.5}
        distance={0}
        decay={2}
        position={[0, -0.08, 0]}
        target={target}
        castShadow={castShadow}
        shadow-mapSize={[1024, 1024]}
      />
    );
  }

  // 光源を器具本体より下に出す。本体内部に光源があると真下方向の光が
  // 器具自身に遮られ、床の光だまり中心が抜けてドーナツ状になるため。
  // 器具本体の厚みぶんだけ下げる（過剰に下げるとビーム形状が歪むので最小限）。
  const lightDrop = fixture.type === "spotlight" ? 0.2 : 0.05;
  return (
    <spotLight
      color={color}
      power={power}
      angle={degToRad(fixture.beamAngleDeg / 2)}
      penumbra={fixture.penumbra}
      distance={0}
      decay={2}
      position={[0, -lightDrop, 0]}
      target={target}
      castShadow={castShadow}
      shadow-mapSize={[1024, 1024]}
    />
  );
};

const DebugLine = ({
  from,
  to,
  color
}: {
  from: [number, number, number];
  to: [number, number, number];
  color: string;
}) => {
  const positions = useMemo(() => new Float32Array([...from, ...to]), [from, to]);
  return (
    <line>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <lineBasicMaterial color={color} />
    </line>
  );
};

const LightDirectionLine = ({ fixture }: { fixture: LightFixture }) => {
  if (!fixture.target) return null;
  return (
    <DebugLine
      from={[0, 0, 0]}
      to={[
        fixture.target.x - fixture.position.x,
        fixture.target.y - fixture.position.y,
        fixture.target.z - fixture.position.z
      ]}
      color="#ffd34f"
    />
  );
};

const NormalDebugHelpers = ({ project }: { project: Project }) => {
  const wallLines = project.walls.map((wall) => {
    const dx = wall.end.x - wall.start.x;
    const dz = wall.end.z - wall.start.z;
    const length = Math.hypot(dx, dz);
    const midpoint = new THREE.Vector3((wall.start.x + wall.end.x) / 2, wall.heightM / 2, (wall.start.z + wall.end.z) / 2);
    if (length <= 0.001) return null;
    const inward = wallInwardNormal(wall, { x: 0, z: 0 });
    const normal = new THREE.Vector3(inward.x, 0, inward.z);
    const to = midpoint.clone().add(normal.multiplyScalar(0.45));
    return (
      <DebugLine
        key={wall.id}
        from={[midpoint.x, midpoint.y, midpoint.z]}
        to={[to.x, to.y, to.z]}
        color="#78e08f"
      />
    );
  });

  return (
    <>
      <DebugLine from={[0, 0.03, 0]} to={[0, 0.48, 0]} color="#78e08f" />
      <DebugLine from={[0, project.room.ceilingHeightM - 0.03, 0]} to={[0, project.room.ceilingHeightM - 0.48, 0]} color="#74a8ff" />
      {wallLines}
    </>
  );
};

// 点をワールド床(x,z)で壁線分に射影し、壁上比率(0..1)と距離を返す（Plan2D と同等）。
const projectPointOntoWall = (x: number, z: number, wall: WallSegment) => {
  const dx = wall.end.x - wall.start.x;
  const dz = wall.end.z - wall.start.z;
  const len2 = dx * dx + dz * dz;
  const t = len2 > 1e-9 ? ((x - wall.start.x) * dx + (z - wall.start.z) * dz) / len2 : 0;
  const ratio = Math.max(0, Math.min(1, t));
  const dist = Math.hypot(x - (wall.start.x + dx * ratio), z - (wall.start.z + dz * ratio));
  return { ratio, dist };
};

const nearestWallAt = (x: number, z: number, walls: WallSegment[]) => {
  let best: { wall: WallSegment; ratio: number; dist: number } | null = null;
  for (const wall of walls) {
    const { ratio, dist } = projectPointOntoWall(x, z, wall);
    if (!best || dist < best.dist) best = { wall, ratio, dist };
  }
  return best;
};

// 追加配置のゴーストプレビューとクリック設置。床全面を覆う不可視キャッチャーで
// カーソルのワールド座標を拾い、種別に応じて床ゴースト or 壁スナップゴーストを出す。
// 天井ライトを既存ライトのX/Z軸に整列スナップする。最寄りライトのx/zがしきい値内なら吸着し、
// どの軸を吸着したか（ガイド線描画用）も返す。
const LIGHT_SNAP_M = 0.15;
const snapToLightAxes = (
  x: number,
  z: number,
  lights: LightFixture[]
): { x: number; z: number; snapX: number | null; snapZ: number | null } => {
  let snapX: number | null = null;
  let snapZ: number | null = null;
  let bestX = LIGHT_SNAP_M;
  let bestZ = LIGHT_SNAP_M;
  for (const light of lights) {
    const dx = Math.abs(light.position.x - x);
    if (dx < bestX) {
      bestX = dx;
      snapX = light.position.x;
    }
    const dz = Math.abs(light.position.z - z);
    if (dz < bestZ) {
      bestZ = dz;
      snapZ = light.position.z;
    }
  }
  return { x: snapX ?? x, z: snapZ ?? z, snapX, snapZ };
};

const PlacementLayer = ({
  pendingAdd,
  project,
  onPlaceObject,
  onPlaceOnWall,
  wallCursor
}: {
  pendingAdd: string;
  project: Project;
  onPlaceObject?: (at: { x: number; z: number }) => void;
  onPlaceOnWall?: (wallId: string, centerRatio: number, heightM?: number) => void;
  wallCursor: WallHover;
}) => {
  const [cursor, setCursor] = useState<{ x: number; z: number } | null>(null);
  // 窓・扉は床カーソルから最寄り壁へスナップ。壁ライト(wallspot)は壁メッシュのヒット(wallCursor)を使う。
  const isWindowOrDoor = pendingAdd === "door" || pendingAdd.startsWith("window");
  const isWallItem = isWindowOrDoor || isWallLightAddKind(pendingAdd);
  // 天井ライトは既存ライトのX/Z軸へ吸着し、整列ガイド線を出す。
  const isCeilingLight = isCeilingLightAddKind(pendingAdd);

  // ゴーストの寸法・形状を種別から決める。
  const ghostColor = "#7fe9ff";
  const ghostMaterial = (
    <meshBasicMaterial color={ghostColor} transparent opacity={0.45} depthWrite={false} />
  );

  // 天井ライトのスナップ結果（ガイド線描画とクリック設置で共有）。
  const ceilingSnap = cursor && isCeilingLight ? snapToLightAxes(cursor.x, cursor.z, project.lights) : null;

  // 床に置く物（家具・吹き抜け・下げ天井・階段）と天井ライトのゴースト。
  const floorGhost = (() => {
    if (!cursor || isWallItem) return null;
    if (pendingAdd.startsWith("furniture:")) {
      const preset = getFurniturePreset(pendingAdd.slice("furniture:".length));
      const s = preset?.size ?? { x: 0.6, y: 0.6, z: 0.6 };
      return (
        <mesh position={[cursor.x, s.y / 2, cursor.z]}>
          <boxGeometry args={[s.x, s.y, s.z]} />
          {ghostMaterial}
        </mesh>
      );
    }
    if (isCeilingLight && ceilingSnap) {
      // 天井ライトはスナップ後の(x,z)で天井面付近にマーカーを出す。
      const ceil = ceilingMountHeightAt(project, ceilingSnap);
      return (
        <group position={[ceilingSnap.x, 0, ceilingSnap.z]}>
          <mesh position={[0, ceil - 0.05, 0]}>
            <sphereGeometry args={[0.1, 16, 12]} />
            {ghostMaterial}
          </mesh>
          <mesh position={[0, ceil - 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.18, 0.24, 24]} />
            {ghostMaterial}
          </mesh>
        </group>
      );
    }
    // void / ceilingZone / stair は床上の薄い箱で十分。
    return (
      <mesh position={[cursor.x, 0.05, cursor.z]}>
        <boxGeometry args={[1.2, 0.1, 1.2]} />
        {ghostMaterial}
      </mesh>
    );
  })();

  // 整列スナップが効いている軸に細いガイド線を出す（パストレ常駐時は PlacementLayer 自体が非表示）。
  const snapGuides = (() => {
    if (!isCeilingLight || !ceilingSnap) return null;
    const y = ceilingMountHeightAt(project, ceilingSnap) - 0.04;
    const span = Math.max(project.room.widthM, project.room.depthM) + 4;
    return (
      <>
        {ceilingSnap.snapX !== null && (
          <line>
            <bufferGeometry>
              <bufferAttribute
                attach="attributes-position"
                args={[new Float32Array([ceilingSnap.snapX, y, -span, ceilingSnap.snapX, y, span]), 3]}
              />
            </bufferGeometry>
            <lineBasicMaterial color="#ffd24a" transparent opacity={0.8} />
          </line>
        )}
        {ceilingSnap.snapZ !== null && (
          <line>
            <bufferGeometry>
              <bufferAttribute
                attach="attributes-position"
                args={[new Float32Array([-span, y, ceilingSnap.snapZ, span, y, ceilingSnap.snapZ]), 3]}
              />
            </bufferGeometry>
            <lineBasicMaterial color="#ffd24a" transparent opacity={0.8} />
          </line>
        )}
      </>
    );
  })();

  // 窓・扉のゴースト: 床カーソルから最寄り壁へスナップし壁面上に板を出す。
  const windowWall = isWindowOrDoor && cursor ? nearestWallAt(cursor.x, cursor.z, project.walls) : null;
  // 壁ライト(wallspot)のゴースト: 壁メッシュが拾ったヒット(wallCursor)へ壁面に吸い付けて出す。
  const wallGhost = (() => {
    if (isWallLightAddKind(pendingAdd)) {
      if (!wallCursor) return null;
      return (
        <group position={[wallCursor.x, wallCursor.y, wallCursor.z]} rotation={[0, wallCursor.angle, 0]}>
          <mesh>
            <boxGeometry args={[0.16, 0.16, 0.08]} />
            {ghostMaterial}
          </mesh>
        </group>
      );
    }
    if (!windowWall) return null;
    let w = 0.85;
    let h = 2.0;
    let sill = 0;
    if (pendingAdd.startsWith("window")) {
      const preset = getWindowPreset(pendingAdd.slice("window:".length));
      if (preset) {
        w = preset.widthM;
        h = preset.heightM;
        sill = preset.sillHeightM;
      }
    }
    const { wall: seg, ratio } = windowWall;
    const x = seg.start.x + (seg.end.x - seg.start.x) * ratio;
    const z = seg.start.z + (seg.end.z - seg.start.z) * ratio;
    const angle = Math.atan2(seg.end.z - seg.start.z, seg.end.x - seg.start.x);
    const y = sill + h / 2;
    return (
      <group position={[x, y, z]} rotation={[0, -angle, 0]}>
        <mesh>
          <boxGeometry args={[w, h, 0.06]} />
          {ghostMaterial}
        </mesh>
      </group>
    );
  })();

  const place = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    const x = event.point.x;
    const z = event.point.z;
    // 壁ライトは床カーソルでは確定しない（壁/吹き抜け側面のヒット＋高さで設置）。
    if (isWallLightAddKind(pendingAdd)) return;
    if (isWindowOrDoor) {
      const hit = nearestWallAt(x, z, project.walls);
      if (hit) onPlaceOnWall?.(hit.wall.id, hit.ratio);
    } else if (isCeilingLight) {
      const snap = snapToLightAxes(x, z, project.lights);
      onPlaceObject?.({ x: snap.x, z: snap.z });
    } else {
      onPlaceObject?.({ x, z });
    }
  };

  return (
    <group>
      {/* 部屋外でもカーソルを拾えるよう広い不可視キャッチャー。床 y=0 のわずか上。 */}
      <mesh
        position={[0, 0.001, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        onPointerMove={(event: ThreeEvent<PointerEvent>) => {
          event.stopPropagation();
          setCursor({ x: event.point.x, z: event.point.z });
        }}
        onClick={place}
      >
        <planeGeometry args={[100, 100]} />
        <meshBasicMaterial visible={false} transparent opacity={0} depthWrite={false} />
      </mesh>
      {floorGhost}
      {snapGuides}
      {wallGhost}
    </group>
  );
};

export const Scene3D = (props: Scene3DProps) => (
  <Canvas
    shadows
    dpr={[1, 1.6]}
    camera={{ position: [4.2, 3.4, 4.8], fov: 56, near: 0.05, far: 80 }}
    gl={{ antialias: true, preserveDrawingBuffer: true, powerPreference: "high-performance" }}
    onCreated={({ gl }) => {
      gl.outputColorSpace = THREE.SRGBColorSpace;
      gl.toneMapping = THREE.ACESFilmicToneMapping;
      gl.toneMappingExposure = 0.9;
      gl.shadowMap.enabled = true;
      gl.shadowMap.type = THREE.PCFSoftShadowMap;
    }}
  >
    <TouchDragGuardProvider>
      <SceneRoot {...props} />
    </TouchDragGuardProvider>
  </Canvas>
);
