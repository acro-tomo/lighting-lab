import type { ThreeEvent } from "@react-three/fiber";
import { useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type {
  OcclusionTester,
  PhotometricLight
} from "../../../photometric/src/photometry/illuminance";
import { illuminanceAt } from "../../../photometric/src/photometry/illuminance";
import { lxToColor } from "../../../photometric/src/photometry/grid";
import type { Project } from "../../types";
import { useLuxLabStore } from "../../utils/luxLab";
import { projectLightsToPhotometric } from "../../utils/photometricLights";
import { usePathTraced } from "./contexts";
import { objectHasMarker } from "./raycastUtils";
import { computeRoomPolygon, type FloorBounds } from "./roomGeometry";

// 照度(lx)ヒートマップ（?lux=1 の隠し機能）。計算は photometric/ の測光コア
// （露出・トーンマッピング非依存）で行い、結果を CanvasTexture の水平面として
// 編集ビューに重ねる。非物理のオーバーレイなので常駐パストレ時は描画しない
// （WYSIWYG不変条件）。

const GRID_SPACING_M = 0.15;
// 極端に広い間取りでメインスレッドを止めないための格子数上限（超えたら間隔を粗くする）。
const MAX_GRID_CELLS = 40000;
const RECOMPUTE_DEBOUNCE_MS = 500;
const OVERLAY_ALPHA = 0.82;
// photometric/src/render/occlusion.ts と同じ定数（遮蔽実装の整合を保つ）。
const SURFACE_EPS = 0.005;
const LIGHT_EPS = 0.02;

// シーン全体から遮蔽ジオメトリを収集して OcclusionTester を作る。
// 除外するもの:
// - fixtureBody 配下（器具本体・発光アパーチャ・不可視ドラッグ判定）。器具ボディで
//   光源が自己遮蔽されるのを防ぐ。ラスター側も光源を本体外へ出しており整合する。
// - dragHandle 配下（照準グリップ等の編集ヘルパー）
// - luxIgnore 配下（ヒートマップ自身・配置ゴースト等の非物理オーバーレイ）
// - 不可視マテリアル（colorWrite=false / visible=false / 完全透明のヒット判定用）
// なお選択枠ワイヤーフレーム等は raycast=ignoreRaycast のため交差自体が発生しない。
const collectOccluders = (scene: THREE.Scene): THREE.Object3D[] => {
  const occluders: THREE.Object3D[] = [];
  scene.traverseVisible((object) => {
    if (!(object as THREE.Mesh).isMesh) return;
    const mesh = object as THREE.Mesh;
    if (
      objectHasMarker(mesh, "fixtureBody") ||
      objectHasMarker(mesh, "dragHandle") ||
      objectHasMarker(mesh, "luxIgnore")
    ) {
      return;
    }
    const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    if (!material || !material.visible || material.colorWrite === false) return;
    if (material.transparent && material.opacity <= 0.05) return;
    occluders.push(mesh);
  });
  return occluders;
};

const createSceneOcclusion = (occluders: readonly THREE.Object3D[]): OcclusionTester => {
  const raycaster = new THREE.Raycaster();
  const origin = new THREE.Vector3();
  const direction = new THREE.Vector3();
  return {
    visibility(from, to) {
      direction.set(to.x - from.x, to.y - from.y, to.z - from.z);
      const distance = direction.length();
      if (distance <= SURFACE_EPS + LIGHT_EPS) return 1;
      direction.multiplyScalar(1 / distance);
      origin.set(from.x, from.y, from.z).addScaledVector(direction, SURFACE_EPS);
      raycaster.set(origin, direction);
      raycaster.near = 0;
      raycaster.far = distance - SURFACE_EPS - LIGHT_EPS;
      for (const occluder of occluders) {
        if (raycaster.intersectObject(occluder, false).length > 0) return 0;
      }
      return 1;
    }
  };
};

const pointInPolygonXZ = (
  x: number,
  z: number,
  polygon: readonly { x: number; z: number }[]
): boolean => {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    if (a.z > z !== b.z > z && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) {
      inside = !inside;
    }
  }
  return inside;
};

type GridData = {
  originX: number;
  originZ: number;
  spacing: number;
  cols: number;
  rows: number;
  /** 行優先。室内ポリゴン外は NaN */
  values: Float32Array;
};

export const LuxHeatmap = ({
  project,
  floorBounds,
  floorLevelM,
  effectiveLightIds
}: {
  project: Project;
  floorBounds: FloorBounds;
  floorLevelM: number;
  effectiveLightIds: Set<string>;
}) => {
  const scene = useThree((state) => state.scene);
  const pathTraced = usePathTraced();
  const visible = useLuxLabStore((state) => state.visible);
  const heightM = useLuxLabStore((state) => state.heightM);
  const scaleMax = useLuxLabStore((state) => state.scaleMax);
  const setStats = useLuxLabStore((state) => state.setStats);
  const setProbe = useLuxLabStore((state) => state.setProbe);
  const shown = visible && !pathTraced;

  const canvas = useMemo(() => document.createElement("canvas"), []);
  const texture = useMemo(() => {
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearFilter;
    return t;
  }, [canvas]);
  useEffect(() => () => texture.dispose(), [texture]);

  const gridRef = useRef<GridData | null>(null);
  // クリック照度プローブ用に、最後の計算で使った光源・遮蔽を保持する。
  const probeContextRef = useRef<{
    lights: PhotometricLight[];
    occlusion: OcclusionTester;
    planeY: number;
  } | null>(null);

  // グリッドの実寸（格子点数はセル上限で自動的に粗くする）。
  const grid = useMemo(() => {
    const minX = floorBounds.centerX - floorBounds.sizeX / 2;
    const minZ = floorBounds.centerZ - floorBounds.sizeZ / 2;
    let spacing = GRID_SPACING_M;
    let cols = Math.max(2, Math.floor(floorBounds.sizeX / spacing) + 1);
    let rows = Math.max(2, Math.floor(floorBounds.sizeZ / spacing) + 1);
    if (cols * rows > MAX_GRID_CELLS) {
      const scale = Math.sqrt((cols * rows) / MAX_GRID_CELLS);
      spacing *= scale;
      cols = Math.max(2, Math.floor(floorBounds.sizeX / spacing) + 1);
      rows = Math.max(2, Math.floor(floorBounds.sizeZ / spacing) + 1);
    }
    return { minX, minZ, spacing, cols, rows };
  }, [floorBounds]);

  const drawTexture = (data: GridData, max: number) => {
    if (canvas.width !== data.cols || canvas.height !== data.rows) {
      canvas.width = data.cols;
      canvas.height = data.rows;
      // WebGL2 は texStorage2D の固定サイズで確保されるため、キャンバスの
      // サイズ変更は dispose して再確保させないと左隅への部分更新になる。
      texture.dispose();
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const image = ctx.createImageData(data.cols, data.rows);
    for (let i = 0; i < data.values.length; i++) {
      const value = data.values[i];
      const offset = i * 4;
      if (!Number.isFinite(value)) {
        image.data[offset + 3] = 0;
        continue;
      }
      const [r, g, b] = lxToColor(value, max);
      image.data[offset] = r;
      image.data[offset + 1] = g;
      image.data[offset + 2] = b;
      image.data[offset + 3] = Math.round(OVERLAY_ALPHA * 255);
    }
    ctx.putImageData(image, 0, 0);
    texture.needsUpdate = true;
  };

  // 表示OFF→ONで即時計算し直すためのフラグ（非表示中の編集は反映されていない）。
  const needsImmediateComputeRef = useRef(true);

  // 本計算。プロジェクト変更・計算面高さ変更は 500ms デバウンスで再計算する。
  useEffect(() => {
    if (!shown) {
      needsImmediateComputeRef.current = true;
      return;
    }
    const compute = () => {
      const lights = projectLightsToPhotometric(
        project.lights.filter((light) => effectiveLightIds.has(light.id)),
        floorLevelM
      );
      const occlusion = createSceneOcclusion(collectOccluders(scene));
      const polygon = computeRoomPolygon(project);
      const planeY = floorLevelM + heightM;
      const values = new Float32Array(grid.cols * grid.rows).fill(Number.NaN);
      let sum = 0;
      let max = 0;
      let count = 0;
      const point = { position: { x: 0, y: planeY, z: 0 }, normal: { x: 0, y: 1, z: 0 } };
      for (let row = 0; row < grid.rows; row++) {
        const z = grid.minZ + row * grid.spacing;
        for (let col = 0; col < grid.cols; col++) {
          const x = grid.minX + col * grid.spacing;
          if (polygon && !pointInPolygonXZ(x, z, polygon)) continue;
          point.position.x = x;
          point.position.z = z;
          const lx = illuminanceAt(point, lights, occlusion).total;
          values[row * grid.cols + col] = lx;
          sum += lx;
          max = Math.max(max, lx);
          count++;
        }
      }
      const data: GridData = {
        originX: grid.minX,
        originZ: grid.minZ,
        spacing: grid.spacing,
        cols: grid.cols,
        rows: grid.rows,
        values
      };
      gridRef.current = data;
      probeContextRef.current = { lights, occlusion, planeY };
      setStats(count > 0 ? { mean: sum / count, max, points: count } : null);
      drawTexture(data, useLuxLabStore.getState().scaleMax);
    };
    if (needsImmediateComputeRef.current) {
      needsImmediateComputeRef.current = false;
      // R3F の子メッシュ（遮蔽対象）がコミットされてから初回計算（reflectionProbe と同じ理由）。
      const raf = requestAnimationFrame(compute);
      return () => cancelAnimationFrame(raf);
    }
    // 以降の編集（project prop 変更）はドラッグ中の連続更新を吸収するためデバウンス。
    const timer = window.setTimeout(compute, RECOMPUTE_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, project, effectiveLightIds, floorLevelM, heightM, grid, scene]);

  // スケール切替は再計算せず色の描き直しだけ行う。
  useEffect(() => {
    const data = gridRef.current;
    if (data) drawTexture(data, scaleMax);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scaleMax]);

  if (!shown) return null;

  const width = (grid.cols - 1) * grid.spacing;
  const depth = (grid.rows - 1) * grid.spacing;
  const centerX = grid.minX + width / 2;
  const centerZ = grid.minZ + depth / 2;

  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    const context = probeContextRef.current;
    if (!context) return;
    const { x, z } = event.point;
    const lx = illuminanceAt(
      { position: { x, y: context.planeY, z }, normal: { x: 0, y: 1, z: 0 } },
      context.lights,
      context.occlusion
    ).total;
    setProbe({ x, z, lx });
  };

  return (
    <mesh
      position={[centerX, floorLevelM + heightM + 0.03, centerZ]}
      rotation-x={-Math.PI / 2}
      renderOrder={30}
      userData={{ luxIgnore: true }}
      onClick={handleClick}
    >
      <planeGeometry args={[width, depth]} />
      {/* 測光値の色をそのまま出すため露出・トーンマップの影響を受けない。 */}
      <meshBasicMaterial
        map={texture}
        transparent
        toneMapped={false}
        depthWrite={false}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
};
