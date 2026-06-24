import { ContactShadows, OrbitControls, Sky } from "@react-three/drei";
import { Canvas, ThreeEvent, useFrame, useThree } from "@react-three/fiber";
import type { MutableRefObject } from "react";
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { WebGLPathTracer } from "three-gpu-pathtracer";
import { GenerateMeshBVHWorker } from "three-mesh-bvh/src/workers/index.js";
import {
  buildSkyEnvironment,
  SKY_ENVIRONMENT_INTENSITY,
  SUN_INTENSITY_FACTOR,
  type SkyEnvironment
} from "../rendering/skyEnvironment";
import type { RenderDebugMode } from "../rendering/pathTracer";
import type { RenderContext } from "../rendering/renderContext";
import type {
  CameraView,
  FurnitureItem,
  LightFixture,
  LightingScene,
  MaterialPreset,
  Project,
  Selection,
  VoidArea,
  WallSegment,
  WindowOpening
} from "../types";
import { colorTemperatureToHex, getSceneLightState, lumensToPhysicalPower } from "../utils/lighting";
import { useProjectStore } from "../store/projectStore";
import { degToRad } from "../utils/units";
import { DEFAULT_DAYLIGHT, sunVector } from "../utils/sun";

export type ViewMode = "raster" | "realistic";

export type LiveTraceStatus = {
  phase: "off" | "building" | "rendering";
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
};

export type EditMode = "select" | "move" | "delete";
// 操作モード（選択/移動/削除）をシーン全体へ配る。移動モードのときだけドラッグ可能。
const EditModeContext = createContext<EditMode>("select");
const useEditMode = () => useContext(EditModeContext);

// パストレ常駐モードでは選択枠・グロー・補助光など非物理の演出を隠す。
// これにより編集用シーンをそのまま物理ベースで描画でき、見たまま=最終結果になる。
const PathTracedContext = createContext(false);
const usePathTraced = () => useContext(PathTracedContext);

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
  const dragging = useRef(false);
  const grab = useRef({ x: 0, z: 0 });
  const plane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), []);
  const hit = useMemo(() => new THREE.Vector3(), []);

  return {
    onPointerDown: (event: ThreeEvent<PointerEvent>) => {
      if (event.button !== 0) return;
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
      if (event.ray.intersectPlane(plane, hit)) {
        onMove(hit.x + grab.current.x, hit.z + grab.current.z);
      }
    },
    onPointerUp: (event: ThreeEvent<PointerEvent>) => {
      if (!dragging.current) return;
      dragging.current = false;
      (event.target as Element | null)?.releasePointerCapture?.(event.pointerId);
      if (controls) controls.enabled = true;
    }
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
  controlsRef
}: {
  view: CameraView;
  controlsRef: MutableRefObject<OrbitControlsImpl | null>;
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

  // ビューの「切替」時だけカメラを適用する。view.id をキーにすることで、
  // 家具移動などでプロジェクトがcloneされ view オブジェクト参照が変わっても
  // （＝同じビューのまま）カメラがリセットされない。露出は毎回反映する。
  useEffect(() => {
    camera.position.set(view.position.x, view.position.y, view.position.z);
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.fov = view.fov;
      camera.updateProjectionMatrix();
    }
    controlsRef.current?.target.set(view.target.x, view.target.y, view.target.z);
    controlsRef.current?.update();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera, controlsRef, view.id]);

  useEffect(() => {
    gl.toneMappingExposure = view.exposure;
  }, [gl, view.exposure]);

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
  onLiveTraceStatus
}: Scene3DProps) => {
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const materialMap = useMemo(() => materialById(project.materials), [project.materials]);
  const activeScene = project.lightingScenes.find((scene) => scene.id === project.activeSceneId);
  const activeView =
    project.cameraViews.find((view) => view.id === project.activeCameraViewId) ??
    project.cameraViews[0];
  const floorTexture = useMemo(createWoodTexture, []);
  const floorMaterial = materialMap.get("floor-oak") ?? project.materials[0];
  const pathTraced = viewMode === "realistic";

  const daylight = project.daylight ?? DEFAULT_DAYLIGHT;
  const sun = useMemo(() => sunVector(daylight), [daylight]);
  const sunUp = daylight.enabled && sun.altitudeDeg > 0;
  // 空色（夜=既定の暗色 / 日中=空色）。scene.background 経由でパストレの環境光にもなる。
  const backgroundColor = useMemo(
    () => (daylight.enabled ? skyColorForAltitude(sun.altitudeDeg).getStyle() : "#060504"),
    [daylight.enabled, sun.altitudeDeg]
  );
  const roomSpan = Math.max(project.room.widthM, project.room.depthM);

  return (
    <EditModeContext.Provider value={mode}>
    <PathTracedContext.Provider value={pathTraced}>
      <CameraViewSync view={activeView} controlsRef={controlsRef} />
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
          <fog attach="fog" args={["#060504", 8, 16]} />
          <hemisphereLight args={["#1f2530", "#0a0805", 0.34]} />
          <directionalLight position={[-2, 4, 3]} intensity={0.16} color="#c9d6ff" />
        </>
      )}
      <group onPointerMissed={() => onSelect(null)}>
        <RoomShell
          project={project}
          materialMap={materialMap}
          floorTexture={floorTexture}
          floorMaterial={floorMaterial}
          selection={selection}
          onSelect={onSelect}
          debugMode={debugMode}
        />
        {project.furniture.map((item) => (
          <FurnitureMesh
            key={item.id}
            item={item}
            materialMap={materialMap}
            selected={selection?.kind === "furniture" && selection.id === item.id}
            onSelect={onSelect}
            debugMode={debugMode}
          />
        ))}
        <DuctRail />
        {project.lights.map((fixture) => (
          <FixtureMesh
            key={fixture.id}
            fixture={fixture}
            activeScene={activeScene}
            selected={selection?.kind === "light" && selection.id === fixture.id}
            onSelect={onSelect}
            debugMode={debugMode}
          />
        ))}
        {debugMode === "normals" && <NormalDebugHelpers project={project} />}
      </group>
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
        dampingFactor={0.08}
        minDistance={1.2}
        maxDistance={12}
        maxPolarAngle={Math.PI * 0.49}
      />
      {pathTraced && (
        <PathTracerController
          project={project}
          activeScene={activeScene}
          debugMode={debugMode}
          onStatus={onLiveTraceStatus}
        />
      )}
      <CanvasReady onReady={onCanvasReady} onRenderContextReady={onRenderContextReady} />
    </PathTracedContext.Provider>
    </EditModeContext.Provider>
  );
};

// ビューポートをそのままパストレで描画する常駐レンダラー。
// - 編集用R3Fシーンを単一の真実として共有し、二重定義をなくす（WYSIWYG）。
// - カメラ移動中は dynamicLowRes が即時の低解像度像を出し、停止すると数秒で
//   間接光込みの写実画像に収束する。
// - mount/unmount で R3F の自動描画を奪う/返す（useFrame priority 1）。
const PathTracerController = ({
  project,
  activeScene,
  debugMode,
  onStatus
}: {
  project: Project;
  activeScene?: LightingScene;
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
    if (tracer) {
      tracer.updateEnvironment();
      tracer.reset();
    }

    return () => {
      scene.environment = prevEnv;
      scene.background = prevBackground;
      scene.environmentIntensity = prevIntensity;
      skyEnv?.dispose();
    };
  }, [scene, gl, project.daylight]);

  useEffect(() => {
    const worker = new GenerateMeshBVHWorker();
    const tracer = new WebGLPathTracer(gl);
    tracer.setBVHWorker(worker);
    tracer.multipleImportanceSampling = true;
    tracer.bounces = 6;
    tracer.transmissiveBounces = 4;
    tracer.renderScale = 1;
    tracer.dynamicLowRes = true;
    tracer.lowResScale = 0.3;
    tracer.renderDelay = 0;
    tracer.fadeDuration = 0;
    tracer.minSamples = 0;
    tracer.tiles.set(1, 1);
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
      scene.updateMatrixWorld(true);
      tracer
        .setSceneAsync(scene, camera)
        .then(() => {
          if (tracerRef.current !== tracer) return;
          // 初回はこの時点で environment useEffect が既に scene.environment を設定済み。
          // tracer 生成前に設定された環境を確実にパストレへ登録する(P2: skylight 抜け対策)。
          tracer.updateEnvironment();
          tracer.reset();
          readyRef.current = true;
          lastMatrix.current.copy(camera.matrixWorld);
          onStatus?.({ phase: "rendering", samples: 0 });
        })
        .catch(() => undefined);
    });

    return () => {
      cancelAnimationFrame(raf);
      readyRef.current = false;
      tracerRef.current = null;
      workerRef.current = null;
      tracer.dispose();
      worker.dispose();
      onStatus?.({ phase: "off", samples: 0 });
    };
  }, [camera, gl, scene]);

  // プロジェクト（家具・照明・材質・シーン）変更時はBVH/シーンを再構築。
  // R3Fがメッシュを更新し終えた後に走るのでデバウンスして拾う。
  useEffect(() => {
    const tracer = tracerRef.current;
    if (!tracer) return;
    const handle = window.setTimeout(() => {
      if (tracerRef.current !== tracer) return;
      readyRef.current = false;
      lastReported.current = -1;
      onStatus?.({ phase: "building", samples: 0 });
      // 再構築前にも全メッシュのワールド行列を確定させ、家具漏れを防ぐ。
      scene.updateMatrixWorld(true);
      tracer
        .setSceneAsync(scene, camera)
        .then(() => {
          if (tracerRef.current !== tracer) return;
          tracer.updateEnvironment();
          tracer.reset();
          readyRef.current = true;
          lastMatrix.current.copy(camera.matrixWorld);
        })
        .catch(() => undefined);
    }, 250);
    return () => window.clearTimeout(handle);
  }, [project, activeScene, debugMode, camera, scene, onStatus]);

  useFrame(() => {
    const tracer = tracerRef.current;
    if (!tracer || !readyRef.current) return;
    if (!lastMatrix.current.equals(camera.matrixWorld)) {
      lastMatrix.current.copy(camera.matrixWorld);
      tracer.updateCamera();
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

const RoomShell = ({
  project,
  materialMap,
  floorTexture,
  floorMaterial,
  selection,
  onSelect,
  debugMode
}: {
  project: Project;
  materialMap: Map<string, MaterialPreset>;
  floorTexture: THREE.Texture | null;
  floorMaterial: MaterialPreset;
  selection: Selection;
  onSelect: (selection: Selection) => void;
  debugMode: RenderDebugMode;
}) => {
  const ceilingMaterial = materialMap.get("cal-ceiling-white") ?? materialMap.get("wall-white") ?? project.materials[0];
  // 吹き抜けは下階天井を開口するだけだと黒背景に抜けて「穴」に見える。
  // 上階天井の高さまで側面と上蓋で囲い、二層分の吹き抜けとして閉じる。
  const wallMaxHeight = project.walls.reduce((max, wall) => Math.max(max, wall.heightM), project.room.ceilingHeightM);
  const upperCeilingHeight =
    wallMaxHeight > project.room.ceilingHeightM + 0.05 ? wallMaxHeight : project.room.ceilingHeightM + 1.4;

  return (
    <>
      <mesh receiveShadow rotation-x={-Math.PI / 2} position={[0, 0, 0]}>
        <planeGeometry args={[project.room.widthM, project.room.depthM]} />
        <meshStandardMaterial
          map={debugMode === "beauty" ? floorTexture ?? undefined : undefined}
          color={debugColorForRole("floor", debugMode, floorMaterial.baseColor)}
          roughness={floorMaterial.roughness}
          metalness={floorMaterial.metalness}
        />
      </mesh>
      {project.voids.map((voidArea) => (
        <VoidMarker
          key={voidArea.id}
          voidArea={voidArea}
          heightM={project.room.ceilingHeightM}
          selected={selection?.kind === "void" && selection.id === voidArea.id}
          onSelect={onSelect}
        />
      ))}
      <Ceiling project={project} material={ceilingMaterial} debugMode={debugMode} />
      {project.voids.map((voidArea) => (
        <VoidWell
          key={`well-${voidArea.id}`}
          voidArea={voidArea}
          lowerY={project.room.ceilingHeightM}
          upperY={upperCeilingHeight}
          material={ceilingMaterial}
          debugMode={debugMode}
        />
      ))}
      {project.walls.map((wall) => (
        <WallMesh
          key={wall.id}
          wall={wall}
          windows={project.windows.filter((windowItem) => windowItem.wallId === wall.id)}
          material={materialMap.get(wall.materialId) ?? ceilingMaterial}
          roomCenter={new THREE.Vector3(0, 0, 0)}
          selected={selection?.kind === "wall" && selection.id === wall.id}
          onSelect={onSelect}
          debugMode={debugMode}
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
    </>
  );
};

const Ceiling = ({ project, material, debugMode }: { project: Project; material: MaterialPreset; debugMode: RenderDebugMode }) => {
  const pieces = useMemo(() => {
    const voidArea = project.voids[0];
    const halfW = project.room.widthM / 2;
    const halfD = project.room.depthM / 2;
    if (!voidArea) {
      return [{ x: 0, z: 0, width: project.room.widthM, depth: project.room.depthM }];
    }

    const minX = voidArea.center.x - voidArea.size.x / 2;
    const maxX = voidArea.center.x + voidArea.size.x / 2;
    const minZ = voidArea.center.z - voidArea.size.z / 2;
    const maxZ = voidArea.center.z + voidArea.size.z / 2;
    return [
      { x: (-halfW + minX) / 2, z: 0, width: minX + halfW, depth: project.room.depthM },
      { x: (maxX + halfW) / 2, z: 0, width: halfW - maxX, depth: project.room.depthM },
      { x: voidArea.center.x, z: (-halfD + minZ) / 2, width: voidArea.size.x, depth: minZ + halfD },
      { x: voidArea.center.x, z: (maxZ + halfD) / 2, width: voidArea.size.x, depth: halfD - maxZ }
    ].filter((piece) => piece.width > 0.04 && piece.depth > 0.04);
  }, [project.room.depthM, project.room.widthM, project.voids]);

  return (
    <>
      {pieces.map((piece) => (
        <mesh
          key={`${piece.x}-${piece.z}-${piece.width}-${piece.depth}`}
          receiveShadow
          position={[piece.x, project.room.ceilingHeightM, piece.z]}
          rotation-x={Math.PI / 2}
        >
          <planeGeometry args={[piece.width, piece.depth]} />
          <meshStandardMaterial
            color={debugColorForRole("ceiling", debugMode, material.baseColor)}
            roughness={material.roughness}
            metalness={material.metalness}
            side={THREE.FrontSide}
          />
        </mesh>
      ))}
    </>
  );
};

const VoidWell = ({
  voidArea,
  lowerY,
  upperY,
  material,
  debugMode
}: {
  voidArea: VoidArea;
  lowerY: number;
  upperY: number;
  material: MaterialPreset;
  debugMode: RenderDebugMode;
}) => {
  const height = upperY - lowerY;
  if (height <= 0.02) return null;
  const midY = (lowerY + upperY) / 2;
  const { center, size } = voidArea;
  const color = debugColorForRole("ceiling", debugMode, material.baseColor);
  const side = (
    <meshStandardMaterial
      color={color}
      roughness={material.roughness}
      metalness={material.metalness}
      side={THREE.DoubleSide}
    />
  );
  return (
    <group>
      <mesh position={[center.x, midY, center.z - size.z / 2]} receiveShadow>
        <boxGeometry args={[size.x, height, 0.04]} />
        {side}
      </mesh>
      <mesh position={[center.x, midY, center.z + size.z / 2]} receiveShadow>
        <boxGeometry args={[size.x, height, 0.04]} />
        {side}
      </mesh>
      <mesh position={[center.x - size.x / 2, midY, center.z]} receiveShadow>
        <boxGeometry args={[0.04, height, size.z]} />
        {side}
      </mesh>
      <mesh position={[center.x + size.x / 2, midY, center.z]} receiveShadow>
        <boxGeometry args={[0.04, height, size.z]} />
        {side}
      </mesh>
      <mesh position={[center.x, upperY, center.z]} rotation-x={Math.PI / 2} receiveShadow>
        <planeGeometry args={[size.x, size.z]} />
        <meshStandardMaterial
          color={color}
          roughness={material.roughness}
          metalness={material.metalness}
          side={THREE.FrontSide}
        />
      </mesh>
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
  wallpaper,
  tile,
  material,
  debugMode
}: {
  rect: WallPanelRect;
  wallHeight: number;
  wallpaper: THREE.Texture | null;
  tile: { w: number; h: number };
  material: MaterialPreset;
  debugMode: RenderDebugMode;
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

  return (
    <mesh position={[rect.cx, rect.cy - wallHeight / 2, 0]} receiveShadow castShadow>
      <planeGeometry args={[rect.w, rect.h]} />
      <meshStandardMaterial
        map={map ?? undefined}
        color={map ? "#ffffff" : debugColorForRole("wall", debugMode, material.baseColor)}
        roughness={material.roughness}
        metalness={material.metalness}
        emissive={material.emissiveColor}
        emissiveIntensity={debugMode === "beauty" ? material.emissiveIntensity : 0}
        // 室内に内壁を立てるとカメラが法線裏側へ回り込んで壁が抜けるため両面描画。
        // 編集ラスター/常駐パストレ共通のメッシュで WYSIWYG を保つ。
        side={THREE.DoubleSide}
      />
    </mesh>
  );
};

const WallMesh = ({
  wall,
  windows,
  material,
  roomCenter,
  selected,
  onSelect,
  debugMode
}: {
  wall: WallSegment;
  windows: WindowOpening[];
  material: MaterialPreset;
  roomCenter: THREE.Vector3;
  selected: boolean;
  onSelect: (selection: Selection) => void;
  debugMode: RenderDebugMode;
}) => {
  const dx = wall.end.x - wall.start.x;
  const dz = wall.end.z - wall.start.z;
  const length = Math.hypot(dx, dz);
  const midpointVector = new THREE.Vector3((wall.start.x + wall.end.x) / 2, wall.heightM / 2, (wall.start.z + wall.end.z) / 2);
  const normalA = new THREE.Vector3(-dz / length, 0, dx / length);
  const normalB = normalA.clone().multiplyScalar(-1);
  const toCenter = roomCenter.clone().sub(midpointVector);
  const inwardNormal = normalA.dot(toCenter) >= normalB.dot(toCenter) ? normalA : normalB;
  const rotationY = Math.atan2(inwardNormal.x, inwardNormal.z);
  const pathTraced = usePathTraced();
  const tile = material.textureSizeM ?? { w: 0.92, h: 0.92 };

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
  const panels = wallPanelsWithHoles(length, wall.heightM, holes);
  // 壁全体ぶんの基準テクスチャ(repeat=1)を読み、パネルごとに repeat を実寸で割り当てる。
  const wallpaper = useWallpaperTexture(
    debugMode === "beauty" ? material.textureDataUrl : undefined,
    1,
    1
  );

  return (
    <group
      position={[midpointVector.x, midpointVector.y, midpointVector.z]}
      rotation={[0, rotationY, 0]}
      onClick={(event: ThreeEvent<MouseEvent>) => {
        event.stopPropagation();
        onSelect({ kind: "wall", id: wall.id });
      }}
    >
      {/* 壁を開口でくり抜いた残りパネル群。castShadow で窓開口を通る日光が
          室内に差し込む（夜間の人工照明は器具側の影で支配的なので影響は小さい）。 */}
      {panels.map((panel, index) => (
        <WallPanel
          key={index}
          rect={panel}
          wallHeight={wall.heightM}
          wallpaper={wallpaper}
          tile={tile}
          material={material}
          debugMode={debugMode}
        />
      ))}
      {selected && !pathTraced && (
        <mesh>
          <planeGeometry args={[length + 0.03, wall.heightM + 0.03]} />
          <meshBasicMaterial color="#f5c64d" wireframe transparent opacity={0.85} />
        </mesh>
      )}
    </group>
  );
};

const BaseBoards = ({ project }: { project: Project }) => (
  <>
    {project.walls.map((wall) => {
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
  if (!wall) return null;

  const x = wall.start.x + (wall.end.x - wall.start.x) * windowItem.centerRatio;
  const z = wall.start.z + (wall.end.z - wall.start.z) * windowItem.centerRatio;
  const angle = Math.atan2(wall.end.z - wall.start.z, wall.end.x - wall.start.x);
  const y = windowItem.sillHeightM + windowItem.heightM / 2;
  const style = windowItem.style ?? (windowItem.hasGlass ? "window" : "opening");
  const kind = windowItem.hasGlass ? "window" : "opening";
  const pathTraced = usePathTraced();
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
      onClick={(event: ThreeEvent<MouseEvent>) => {
        event.stopPropagation();
        onSelect({ kind, id: windowItem.id });
      }}
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
  if (pathTraced) return null;
  return (
  <group
    position={[voidArea.center.x, heightM + 0.36, voidArea.center.z]}
    onClick={(event: ThreeEvent<MouseEvent>) => {
      event.stopPropagation();
      onSelect({ kind: "void", id: voidArea.id });
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

const FurnitureMesh = ({
  item,
  materialMap,
  selected,
  onSelect,
  debugMode
}: {
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
  const updateFurniture = useProjectStore((state) => state.updateFurniture);
  const deleteSelection = useProjectStore((state) => state.deleteSelection);
  const drag = useFloorDrag(
    { x: item.position.x, z: item.position.z },
    item.position.y,
    (x, z) => updateFurniture(item.id, { position: { ...item.position, x, z } })
  );

  return (
    <group
      position={[item.position.x, item.position.y, item.position.z]}
      rotation={[0, degToRad(item.rotationYDeg), 0]}
      onPointerDown={(event: ThreeEvent<PointerEvent>) => {
        if (editMode === "delete") {
          event.stopPropagation();
          deleteSelection({ kind: "furniture", id: item.id });
          return;
        }
        onSelect({ kind: "furniture", id: item.id });
        if (editMode === "move") drag.onPointerDown(event);
      }}
      onPointerMove={editMode === "move" ? drag.onPointerMove : undefined}
      onPointerUp={editMode === "move" ? drag.onPointerUp : undefined}
    >
      <FurniturePrimitive
        item={item}
        color={debugColorForRole("furniture", debugMode, color)}
        roughness={roughness}
        metalness={debugMode === "beauty" ? metalness : 0}
      />
      {selected && !pathTraced && (
        <mesh>
          <boxGeometry args={[item.size.x + 0.08, item.size.y + 0.08, item.size.z + 0.08]} />
          <meshBasicMaterial color="#f5c64d" wireframe transparent opacity={0.9} />
        </mesh>
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

const FixtureMesh = ({
  fixture,
  activeScene,
  selected,
  onSelect,
  debugMode
}: {
  fixture: LightFixture;
  activeScene?: LightingScene;
  selected: boolean;
  onSelect: (selection: Selection) => void;
  debugMode: RenderDebugMode;
}) => {
  const state = getSceneLightState(fixture, activeScene);
  const lightColor = colorTemperatureToHex(fixture.colorTemperatureK);
  const pathTraced = usePathTraced();
  const editMode = useEditMode();
  const updateLight = useProjectStore((store) => store.updateLight);
  const deleteSelection = useProjectStore((store) => store.deleteSelection);
  const drag = useFloorDrag(
    { x: fixture.position.x, z: fixture.position.z },
    fixture.position.y,
    (x, z) => {
      const dx = x - fixture.position.x;
      const dz = z - fixture.position.z;
      updateLight(fixture.id, {
        position: { ...fixture.position, x, z },
        target: fixture.target ? { ...fixture.target, x: fixture.target.x + dx, z: fixture.target.z + dz } : undefined
      });
    }
  );

  return (
    <group
      position={[fixture.position.x, fixture.position.y, fixture.position.z]}
      onPointerDown={(event: ThreeEvent<PointerEvent>) => {
        if (editMode === "delete") {
          event.stopPropagation();
          deleteSelection({ kind: "light", id: fixture.id });
          return;
        }
        onSelect({ kind: "light", id: fixture.id });
        if (editMode === "move") drag.onPointerDown(event);
      }}
      onPointerMove={editMode === "move" ? drag.onPointerMove : undefined}
      onPointerUp={editMode === "move" ? drag.onPointerUp : undefined}
    >
      <FixtureBody fixture={fixture} color={lightColor} active={state.enabled && state.dimmer > 0} debugMode={debugMode} />
      <PhysicalLight fixture={fixture} activeScene={activeScene} debugMode={debugMode} />
      {selected && !pathTraced && (
        <mesh>
          <sphereGeometry args={[0.18, 24, 16]} />
          <meshBasicMaterial color="#f5c64d" wireframe transparent opacity={0.95} />
        </mesh>
      )}
      {debugMode !== "beauty" && fixture.target && (
        <LightDirectionLine fixture={fixture} />
      )}
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

  return (
    <>
      <mesh>
        <cylinderGeometry args={[0.105, 0.105, 0.028, 40]} />
        <meshStandardMaterial color={debugColorForRole("fixture", debugMode, "#efede4")} roughness={0.48} metalness={debugMode === "beauty" ? 0.1 : 0} />
      </mesh>
      <mesh position={[0, -0.018, 0]}>
        <circleGeometry args={[0.078, 32]} />
        <meshBasicMaterial color={color} transparent opacity={active ? 0.75 : 0.16} />
      </mesh>
    </>
  );
};

const PhysicalLight = ({
  fixture,
  activeScene,
  debugMode
}: {
  fixture: LightFixture;
  activeScene?: LightingScene;
  debugMode: RenderDebugMode;
}) => {
  const scene = useThree((state) => state.scene);
  const target = useMemo(() => new THREE.Object3D(), []);
  const power = lumensToPhysicalPower(fixture, activeScene);
  const color = colorTemperatureToHex(fixture.colorTemperatureK);
  const targetPosition = fixture.target ?? { x: fixture.position.x, y: 0.1, z: fixture.position.z };

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
    return (
      <pointLight
        color={color}
        power={power}
        distance={0}
        decay={2}
        castShadow={fixture.castsShadow}
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
        castShadow={fixture.castsShadow}
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
      castShadow={fixture.castsShadow}
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
    const normalA = new THREE.Vector3(-dz / length, 0, dx / length);
    const normalB = normalA.clone().multiplyScalar(-1);
    const normal = normalA.dot(midpoint.clone().multiplyScalar(-1)) >= normalB.dot(midpoint.clone().multiplyScalar(-1)) ? normalA : normalB;
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
    <SceneRoot {...props} />
  </Canvas>
);
