import { ContactShadows, OrbitControls } from "@react-three/drei";
import { Canvas, ThreeEvent, useFrame, useThree } from "@react-three/fiber";
import type { MutableRefObject } from "react";
import { createContext, useContext, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { WebGLPathTracer } from "three-gpu-pathtracer";
import { GenerateMeshBVHWorker } from "three-mesh-bvh/src/workers/index.js";
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
import { degToRad } from "../utils/units";

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
  onLiveTraceStatus?: (status: LiveTraceStatus) => void;
};

// パストレ常駐モードでは選択枠・グロー・補助光など非物理の演出を隠す。
// これにより編集用シーンをそのまま物理ベースで描画でき、見たまま=最終結果になる。
const PathTracedContext = createContext(false);
const usePathTraced = () => useContext(PathTracedContext);

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

  useEffect(() => {
    camera.position.set(view.position.x, view.position.y, view.position.z);
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.fov = view.fov;
      camera.updateProjectionMatrix();
    }
    gl.toneMappingExposure = view.exposure;

    controlsRef.current?.target.set(view.target.x, view.target.y, view.target.z);
    controlsRef.current?.update();
  }, [camera, controlsRef, gl, view]);

  return null;
};

const SceneRoot = ({
  project,
  selection,
  onSelect,
  onCanvasReady,
  onRenderContextReady,
  debugMode,
  viewMode,
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

  return (
    <PathTracedContext.Provider value={pathTraced}>
      <CameraViewSync view={activeView} controlsRef={controlsRef} />
      <color attach="background" args={["#060504"]} />
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

    tracer
      .setSceneAsync(scene, camera)
      .then(() => {
        if (tracerRef.current !== tracer) return;
        readyRef.current = true;
        lastMatrix.current.copy(camera.matrixWorld);
        onStatus?.({ phase: "rendering", samples: 0 });
      })
      .catch(() => undefined);

    return () => {
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
      tracer
        .setSceneAsync(scene, camera)
        .then(() => {
          if (tracerRef.current !== tracer) return;
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

const WallMesh = ({
  wall,
  material,
  roomCenter,
  selected,
  onSelect,
  debugMode
}: {
  wall: WallSegment;
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

  return (
    <group
      position={[midpointVector.x, midpointVector.y, midpointVector.z]}
      rotation={[0, rotationY, 0]}
      onClick={(event: ThreeEvent<MouseEvent>) => {
        event.stopPropagation();
        onSelect({ kind: "wall", id: wall.id });
      }}
    >
      <mesh receiveShadow>
        <planeGeometry args={[length, wall.heightM]} />
        <meshStandardMaterial
          color={debugColorForRole("wall", debugMode, material.baseColor)}
          roughness={material.roughness}
          metalness={material.metalness}
          emissive={material.emissiveColor}
          emissiveIntensity={debugMode === "beauty" ? material.emissiveIntensity : 0}
          side={THREE.FrontSide}
        />
      </mesh>
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
  const kind = windowItem.hasGlass ? "window" : "opening";
  const pathTraced = usePathTraced();

  return (
    <group
      position={[x, y, z - 0.012]}
      rotation={[0, -angle, 0]}
      onClick={(event: ThreeEvent<MouseEvent>) => {
        event.stopPropagation();
        onSelect({ kind, id: windowItem.id });
      }}
    >
      <mesh>
        <boxGeometry args={[windowItem.widthM, windowItem.heightM, 0.018]} />
        {windowItem.hasGlass ? (
          <meshPhysicalMaterial
            color={debugColorForRole("glass", debugMode, "#9fbaca")}
            roughness={0.05}
            metalness={0}
            transmission={0.28}
            transparent
            opacity={0.36}
          />
        ) : (
          <meshBasicMaterial color="#050504" transparent opacity={0.58} />
        )}
      </mesh>
      {!pathTraced && (
        <mesh position={[0, 0, -0.018]}>
          <boxGeometry args={[windowItem.widthM + 0.08, windowItem.heightM + 0.08, 0.025]} />
          <meshBasicMaterial color={selected ? "#f5c64d" : "#d8d4ca"} wireframe />
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

  return (
    <group
      position={[item.position.x, item.position.y, item.position.z]}
      rotation={[0, degToRad(item.rotationYDeg), 0]}
      onClick={(event: ThreeEvent<MouseEvent>) => {
        event.stopPropagation();
        onSelect({ kind: "furniture", id: item.id });
      }}
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
    // 蹴上げ約180mmから段数を決め、上り階段の段板を-z→+zに積む。回転で向きを変えられる。
    const steps = Math.max(3, Math.min(24, Math.round(item.size.y / 0.18)));
    const tread = item.size.z / steps;
    const riser = item.size.y / steps;
    return (
      <>
        {Array.from({ length: steps }).map((_, index) => {
          const topY = (index + 1) * riser;
          return (
            <mesh
              key={index}
              castShadow
              receiveShadow
              position={[0, topY / 2, -item.size.z / 2 + index * tread + tread / 2]}
            >
              <boxGeometry args={[item.size.x, topY, tread]} />
              <meshStandardMaterial color={color} roughness={roughness} metalness={metalness} />
            </mesh>
          );
        })}
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

  return (
    <group
      position={[fixture.position.x, fixture.position.y, fixture.position.z]}
      onClick={(event: ThreeEvent<MouseEvent>) => {
        event.stopPropagation();
        onSelect({ kind: "light", id: fixture.id });
      }}
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
        <mesh castShadow>
          <coneGeometry args={[0.24, 0.22, 48, 1, true]} />
          <meshStandardMaterial color={bodyColor} roughness={0.36} metalness={debugMode === "beauty" ? 0.7 : 0} side={THREE.DoubleSide} />
        </mesh>
        <mesh position={[0, -0.08, 0]}>
          <sphereGeometry args={[0.085, 24, 16]} />
          <meshBasicMaterial color={color} transparent opacity={active ? 0.9 : 0.18} />
        </mesh>
      </>
    );
  }

  if (fixture.type === "spotlight") {
    return (
      <group rotation={[degToRad(fixture.rotationDeg.x), degToRad(fixture.rotationDeg.y), degToRad(fixture.rotationDeg.z)]}>
        <mesh castShadow>
          <cylinderGeometry args={[0.075, 0.095, 0.22, 32]} />
          <meshStandardMaterial color={bodyColor} roughness={0.34} metalness={debugMode === "beauty" ? 0.78 : 0} />
        </mesh>
        <mesh position={[0, -0.12, 0]}>
          <sphereGeometry args={[0.048, 20, 12]} />
          <meshBasicMaterial color={color} transparent opacity={active ? 0.8 : 0.16} />
        </mesh>
      </group>
    );
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
      <mesh castShadow>
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
    return (
      <>
        <pointLight color={color} power={power} distance={0} decay={2} />
      </>
    );
  }

  return (
    <spotLight
      color={color}
      power={power}
      angle={degToRad(fixture.beamAngleDeg / 2)}
      penumbra={fixture.penumbra}
      distance={0}
      decay={2}
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
