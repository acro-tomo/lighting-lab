import type { ThreeEvent } from "@react-three/fiber";
import { useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { IndirectController } from "../../../photometric/src/app/indirect";
import type { SceneModel } from "../../../photometric/src/core/types";
import type {
  OcclusionTester,
  PhotometricLight
} from "../../../photometric/src/photometry/illuminance";
import { illuminanceAt } from "../../../photometric/src/photometry/illuminance";
import { lxToColor } from "../../../photometric/src/photometry/grid";
import type {
  IrradianceProbeField,
  RadianceScene
} from "../../../photometric/src/photometry/probes";
import type { Project } from "../../types";
import type { LuxBreakdown } from "../../utils/luxLab";
import { useLuxLabStore } from "../../utils/luxLab";
import { projectLightsToPhotometric } from "../../utils/photometricLights";
import { usePathTraced } from "./contexts";
import {
  collectLuxOccluders,
  createProbeSceneModel,
  createSceneOcclusion,
  createSceneRadiance
} from "./luxSceneAdapter";
import { computeRoomPolygon, type FloorBounds } from "./roomGeometry";

const GRID_SPACING_M = 0.15;
const MAX_GRID_CELLS = 40000;
const RECOMPUTE_DEBOUNCE_MS = 500;
const OVERLAY_ALPHA = 0.82;

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
  values: Float32Array;
};

type ComputeContext = {
  geometryKey: string;
  lightsKey: string;
  lights: PhotometricLight[];
  occlusion: OcclusionTester;
  radianceScene: RadianceScene;
  model: SceneModel;
  floorY: number;
  planeY: number;
  polygon: ReturnType<typeof computeRoomPolygon>;
};

const emptyBreakdown = (): LuxBreakdown => ({ direct: 0, indirect: 0, total: 0 });

export const LuxHeatmap = ({
  project,
  fullProject,
  floorBounds,
  floorLevelM,
  effectiveLightIds,
  upperVoidCeilingHeightM
}: {
  project: Project;
  fullProject: Project;
  floorBounds: FloorBounds;
  floorLevelM: number;
  effectiveLightIds: Set<string>;
  upperVoidCeilingHeightM?: number;
}) => {
  const scene = useThree((state) => state.scene);
  const pathTraced = usePathTraced();
  const visible = useLuxLabStore((state) => state.visible);
  const heightM = useLuxLabStore((state) => state.heightM);
  const scaleMax = useLuxLabStore((state) => state.scaleMax);
  const setStats = useLuxLabStore((state) => state.setStats);
  const setProbe = useLuxLabStore((state) => state.setProbe);
  const setCalculation = useLuxLabStore((state) => state.setCalculation);
  const shown = visible && !pathTraced;

  const canvas = useMemo(() => document.createElement("canvas"), []);
  const texture = useMemo(() => {
    const next = new THREE.CanvasTexture(canvas);
    next.colorSpace = THREE.SRGBColorSpace;
    next.magFilter = THREE.LinearFilter;
    next.minFilter = THREE.LinearFilter;
    return next;
  }, [canvas]);
  useEffect(() => () => texture.dispose(), [texture]);

  const gridRef = useRef<GridData | null>(null);
  const contextRef = useRef<ComputeContext | null>(null);
  const committedFieldRef = useRef<IrradianceProbeField | null>(null);
  const committedKeysRef = useRef<{ geometry: string; lights: string; isFinal: boolean } | null>(
    null
  );
  const gridTaskRef = useRef<{ cancel: () => void } | null>(null);
  const renderGridRef = useRef<
    (field: IrradianceProbeField | undefined, label: string) => Promise<boolean>
  >(async () => false);

  const grid = useMemo(() => {
    const minX = floorBounds.centerX - floorBounds.sizeX / 2;
    const minZ = floorBounds.centerZ - floorBounds.sizeZ / 2;
    let spacing = GRID_SPACING_M;
    let cols = Math.max(2, Math.floor(floorBounds.sizeX / spacing) + 1);
    let rows = Math.max(2, Math.floor(floorBounds.sizeZ / spacing) + 1);
    if (cols * rows > MAX_GRID_CELLS) {
      spacing *= Math.sqrt((cols * rows) / MAX_GRID_CELLS);
      cols = Math.max(2, Math.floor(floorBounds.sizeX / spacing) + 1);
      rows = Math.max(2, Math.floor(floorBounds.sizeZ / spacing) + 1);
    }
    return { minX, minZ, spacing, cols, rows };
  }, [floorBounds]);

  const drawTexture = (data: GridData, max: number) => {
    if (canvas.width !== data.cols || canvas.height !== data.rows) {
      canvas.width = data.cols;
      canvas.height = data.rows;
      texture.dispose();
    }
    const canvasContext = canvas.getContext("2d");
    if (!canvasContext) return;
    const image = canvasContext.createImageData(data.cols, data.rows);
    for (let index = 0; index < data.values.length; index++) {
      const value = data.values[index];
      const offset = index * 4;
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
    canvasContext.putImageData(image, 0, 0);
    texture.needsUpdate = true;
  };

  const cancelGridRender = () => {
    gridTaskRef.current?.cancel();
    gridTaskRef.current = null;
  };

  const renderGrid = (
    field: IrradianceProbeField | undefined,
    label: string
  ): Promise<boolean> => {
    cancelGridRender();
    const context = contextRef.current;
    if (!context) return Promise.resolve(false);
    const values = new Float32Array(grid.cols * grid.rows).fill(Number.NaN);
    const sum = emptyBreakdown();
    const max = emptyBreakdown();
    let count = 0;
    let index = 0;
    const point = {
      position: { x: 0, y: context.planeY, z: 0 },
      normal: { x: 0, y: 1, z: 0 }
    };
    return new Promise((resolve) => {
      let timer = 0;
      let settled = false;
      const finish = (completed: boolean) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        if (gridTaskRef.current?.cancel === cancel) gridTaskRef.current = null;
        resolve(completed);
      };
      const cancel = () => finish(false);
      const step = () => {
        if (settled || contextRef.current !== context) {
          finish(false);
          return;
        }
        const deadline = performance.now() + 8;
        do {
          const row = Math.floor(index / grid.cols);
          const col = index - row * grid.cols;
          const z = grid.minZ + row * grid.spacing;
          const x = grid.minX + col * grid.spacing;
          if (!context.polygon || pointInPolygonXZ(x, z, context.polygon)) {
            point.position.x = x;
            point.position.z = z;
            const result = illuminanceAt(point, context.lights, context.occlusion, field);
            values[index] = result.total;
            sum.direct += result.direct;
            sum.indirect += result.indirect;
            sum.total += result.total;
            max.direct = Math.max(max.direct, result.direct);
            max.indirect = Math.max(max.indirect, result.indirect);
            max.total = Math.max(max.total, result.total);
            count++;
          }
          index++;
        } while (index < values.length && performance.now() < deadline);
        if (index < values.length) {
          setCalculation({ status: "computing", label, progress: index / values.length });
          timer = window.setTimeout(step, 0);
          return;
        }
        const data = {
          originX: grid.minX,
          originZ: grid.minZ,
          spacing: grid.spacing,
          cols: grid.cols,
          rows: grid.rows,
          values
        };
        gridRef.current = data;
        committedFieldRef.current = field ?? null;
        setStats(
          count > 0
            ? {
                mean: {
                  direct: sum.direct / count,
                  indirect: sum.indirect / count,
                  total: sum.total / count
                },
                max,
                points: count
              }
            : null
        );
        drawTexture(data, useLuxLabStore.getState().scaleMax);
        finish(true);
      };
      gridTaskRef.current = { cancel };
      step();
    });
  };
  renderGridRef.current = renderGrid;

  const controller = useMemo(() => {
    let instance: IndirectController;
    instance = new IndirectController({
      getModel: () => contextRef.current!.model,
      getProbeFieldConfig: () => ({ floorY: contextRef.current!.floorY }),
      getRadianceScene: () => contextRef.current!.radianceScene,
      getLights: () => contextRef.current!.lights,
      getOcclusion: () => contextRef.current!.occlusion,
      onPassCommitted: async (field, _passIndex, isFinal) => {
        const context = contextRef.current;
        if (!context) return;
        const completed = await renderGridRef.current(field, "ヒートマップ更新");
        if (!completed || contextRef.current !== context) return;
        committedKeysRef.current = {
          geometry: context.geometryKey,
          lights: context.lightsKey,
          isFinal
        };
      },
      onStatusChanged: () => {
        useLuxLabStore.getState().setCalculation({
          status: instance.status,
          label: instance.passLabel,
          progress: instance.progress
        });
      }
    });
    return instance;
  }, []);

  const geometryKey = useMemo(
    () =>
      JSON.stringify({
        room: fullProject.room,
        walls: fullProject.walls,
        windows: fullProject.windows,
        voids: fullProject.voids,
        ceilingZones: fullProject.ceilingZones,
        floorZones: fullProject.floorZones,
        furniture: fullProject.furniture,
        materials: fullProject.materials,
        showCeiling: fullProject.showCeiling,
        activeFloor: fullProject.activeFloor,
        upperVoidCeilingHeightM
      }),
    [fullProject, upperVoidCeilingHeightM]
  );
  const lightsKey = useMemo(
    () =>
      JSON.stringify({
        lights: project.lights,
        effective: [...effectiveLightIds].sort()
      }),
    [project.lights, effectiveLightIds]
  );
  const needsImmediateComputeRef = useRef(true);

  useEffect(() => {
    if (shown) return;
    controller.dispose();
    cancelGridRender();
    contextRef.current = null;
    committedFieldRef.current = null;
    committedKeysRef.current = null;
    needsImmediateComputeRef.current = true;
    setStats(null);
    setProbe(null);
  }, [shown, controller, setProbe, setStats]);

  useEffect(
    () => () => {
      controller.dispose();
      gridTaskRef.current?.cancel();
    },
    [controller]
  );

  useEffect(() => {
    if (!shown) return;
    controller.cancel();
    cancelGridRender();
    committedFieldRef.current = null;
    setCalculation({ status: "computing", label: "更新待ち", progress: 0 });
    setProbe(null);
    const compute = () => {
      const occluders = collectLuxOccluders(scene);
      const committed = committedKeysRef.current;
      const geometryChanged = !committed || committed.geometry !== geometryKey;
      const lightsChanged = geometryChanged || committed.lights !== lightsKey;
      const context: ComputeContext = {
        geometryKey,
        lightsKey,
        lights: projectLightsToPhotometric(
          project.lights.filter((light) => effectiveLightIds.has(light.id)),
          floorLevelM
        ),
        occlusion: createSceneOcclusion(occluders),
        radianceScene: createSceneRadiance(occluders),
        model: createProbeSceneModel(project, floorBounds, {
          fullProject,
          upperVoidCeilingHeightM
        }),
        floorY: floorLevelM,
        planeY: floorLevelM + heightM,
        polygon: computeRoomPolygon(project)
      };
      contextRef.current = context;
      if (!geometryChanged && !lightsChanged && controller.field?.isReady) {
        void renderGridRef.current(controller.field, "ヒートマップ更新").then((completed) => {
          if (!completed || contextRef.current !== context) return;
          if (committed.isFinal) {
            setCalculation({ status: "ready", label: "", progress: 1 });
          } else {
            controller.invalidate("lights");
          }
        });
        return;
      }
      void renderGridRef.current(undefined, "直接光を計算中").then((completed) => {
        if (!completed || contextRef.current !== context) return;
        controller.invalidate(geometryChanged ? "geometry" : "lights");
      });
    };
    if (needsImmediateComputeRef.current) {
      needsImmediateComputeRef.current = false;
      const frame = requestAnimationFrame(compute);
      return () => cancelAnimationFrame(frame);
    }
    const timer = window.setTimeout(compute, RECOMPUTE_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, geometryKey, lightsKey, floorLevelM, heightM, grid, scene]);

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
    const context = contextRef.current;
    if (!context) return;
    const { x, z } = event.point;
    const value = illuminanceAt(
      { position: { x, y: context.planeY, z }, normal: { x: 0, y: 1, z: 0 } },
      context.lights,
      context.occlusion,
      committedFieldRef.current ?? undefined
    );
    setProbe({ x, z, value });
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
