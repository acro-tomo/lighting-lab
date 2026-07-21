import * as THREE from "three";
import type { SceneModel } from "../../../photometric/src/core/types";
import type { OcclusionTester } from "../../../photometric/src/photometry/illuminance";
import type {
  RadianceHit,
  RadianceScene
} from "../../../photometric/src/photometry/probes";
import type { Project, VoidArea } from "../../types";
import { voidCeilingHeightAt } from "../../utils/ceiling";
import { objectHasMarker } from "./raycastUtils";
import { computeRoomPolygon, type FloorBounds } from "./roomGeometry";

const SURFACE_EPS = 0.005;
const LIGHT_EPS = 0.02;
const HIGH_TRANSMISSION = 0.9;

const materialAt = (mesh: THREE.Mesh, materialIndex = 0): THREE.Material | null => {
  if (!Array.isArray(mesh.material)) return mesh.material;
  return mesh.material[materialIndex] ?? null;
};

const isPhysicalMaterial = (material: THREE.Material | null): boolean => {
  if (!material) return false;
  const materialFlags = material as THREE.Material & {
    isMeshLambertMaterial?: boolean;
    isMeshPhongMaterial?: boolean;
    isMeshStandardMaterial?: boolean;
    isMeshPhysicalMaterial?: boolean;
    transmission?: number;
  };
  const isSurface =
    materialFlags.isMeshLambertMaterial ||
    materialFlags.isMeshPhongMaterial ||
    materialFlags.isMeshStandardMaterial ||
    materialFlags.isMeshPhysicalMaterial;
  if (
    !isSurface ||
    !material.visible ||
    material.colorWrite === false ||
    (material.transparent && material.opacity <= 0.05)
  ) {
    return false;
  }
  return !(
    materialFlags.isMeshPhysicalMaterial &&
    (materialFlags.transmission ?? 0) >= HIGH_TRANSMISSION
  );
};

export const collectLuxOccluders = (scene: THREE.Scene): THREE.Mesh[] => {
  const occluders: THREE.Mesh[] = [];
  scene.updateMatrixWorld(true);
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
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    if (materials.some(isPhysicalMaterial)) occluders.push(mesh);
  });
  return occluders;
};

export const createSceneOcclusion = (
  occluders: THREE.Object3D[]
): OcclusionTester => {
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
      const blocked = raycaster.intersectObjects(occluders, false).some((intersection) => {
        const mesh = intersection.object as THREE.Mesh;
        return isPhysicalMaterial(materialAt(mesh, intersection.face?.materialIndex));
      });
      return blocked ? 0 : 1;
    }
  };
};

const linearAlbedo = (material: THREE.Material): [number, number, number] => {
  const color = "color" in material && material.color instanceof THREE.Color
    ? material.color
    : new THREE.Color(0);
  return [color.r, color.g, color.b];
};

export const createSceneRadiance = (
  occluders: THREE.Object3D[]
): RadianceScene => {
  const raycaster = new THREE.Raycaster();
  const origin = new THREE.Vector3();
  const direction = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const normalMatrix = new THREE.Matrix3();
  return {
    hit(from, dir): RadianceHit | null {
      origin.set(from.x, from.y, from.z);
      direction.set(dir.x, dir.y, dir.z).normalize();
      raycaster.set(origin, direction);
      raycaster.near = 0.01;
      raycaster.far = 50;
      const nearest = raycaster.intersectObjects(occluders, false).find((intersection) => {
        const mesh = intersection.object as THREE.Mesh;
        return isPhysicalMaterial(materialAt(mesh, intersection.face?.materialIndex));
      });
      if (!nearest?.face) return null;
      const mesh = nearest.object as THREE.Mesh;
      const material = materialAt(mesh, nearest.face.materialIndex);
      if (!material) return null;
      normalMatrix.getNormalMatrix(mesh.matrixWorld);
      normal.copy(nearest.face.normal).applyMatrix3(normalMatrix).normalize();
      if (normal.dot(direction) > 0) normal.multiplyScalar(-1);
      return {
        point: { x: nearest.point.x, y: nearest.point.y, z: nearest.point.z },
        normal: { x: normal.x, y: normal.y, z: normal.z },
        albedoLinear: linearAlbedo(material)
      };
    }
  };
};

const surface = {
  baseColor: [0.8, 0.8, 0.8] as [number, number, number],
  roughness: 0.8,
  metallic: 0
};

type ProbeSceneOptions = {
  fullProject?: Project;
  upperVoidCeilingHeightM?: number;
};

const rectangularCeilingOverrides = (
  project: Project,
  voidCeilingHeightM: number
): SceneModel["floorPlan"]["ceilingOverrides"] => {
  const zones = project.ceilingZones ?? [];
  if (project.voids.length === 0 && zones.length === 0) return [];
  const xs = new Set<number>();
  const zs = new Set<number>();
  for (const area of [...project.voids, ...zones]) {
    xs.add(area.center.x - area.size.x / 2);
    xs.add(area.center.x + area.size.x / 2);
    zs.add(area.center.z - area.size.z / 2);
    zs.add(area.center.z + area.size.z / 2);
  }
  const sortedX = [...xs].sort((a, b) => a - b);
  const sortedZ = [...zs].sort((a, b) => a - b);
  const overrides: SceneModel["floorPlan"]["ceilingOverrides"] = [];
  for (let xIndex = 0; xIndex < sortedX.length - 1; xIndex++) {
    const minX = sortedX[xIndex]!;
    const maxX = sortedX[xIndex + 1]!;
    const x = (minX + maxX) / 2;
    for (let zIndex = 0; zIndex < sortedZ.length - 1; zIndex++) {
      const minZ = sortedZ[zIndex]!;
      const maxZ = sortedZ[zIndex + 1]!;
      const z = (minZ + maxZ) / 2;
      const matchedVoid: VoidArea | undefined = project.voids.find(
        (area) =>
          Math.abs(x - area.center.x) <= area.size.x / 2 &&
          Math.abs(z - area.center.z) <= area.size.z / 2
      );
      let dropM = 0;
      for (const zone of zones) {
        if (
          Math.abs(x - zone.center.x) <= zone.size.x / 2 &&
          Math.abs(z - zone.center.z) <= zone.size.z / 2
        ) {
          dropM = Math.max(dropM, zone.dropM);
        }
      }
      if (!matchedVoid && dropM === 0) continue;
      overrides.push({
        polygon: [
          { x: minX, y: -minZ },
          { x: maxX, y: -minZ },
          { x: maxX, y: -maxZ },
          { x: minX, y: -maxZ }
        ],
        height:
          (matchedVoid
            ? matchedVoid.heightM !== undefined
              ? project.room.ceilingHeightM + matchedVoid.heightM
              : voidCeilingHeightM
            : project.room.ceilingHeightM) - dropM
      });
    }
  }
  return overrides;
};

export const createProbeSceneModel = (
  project: Project,
  floorBounds: FloorBounds,
  options: ProbeSceneOptions = {}
): SceneModel => {
  const roomPolygon = computeRoomPolygon(project);
  const outline = (roomPolygon ?? [
    {
      x: floorBounds.centerX - floorBounds.sizeX / 2,
      z: floorBounds.centerZ - floorBounds.sizeZ / 2
    },
    {
      x: floorBounds.centerX + floorBounds.sizeX / 2,
      z: floorBounds.centerZ - floorBounds.sizeZ / 2
    },
    {
      x: floorBounds.centerX + floorBounds.sizeX / 2,
      z: floorBounds.centerZ + floorBounds.sizeZ / 2
    },
    {
      x: floorBounds.centerX - floorBounds.sizeX / 2,
      z: floorBounds.centerZ + floorBounds.sizeZ / 2
    }
  ]).map((point) => ({ x: point.x, y: -point.z }));
  const sourceProject = options.fullProject ?? project;
  const activeFloor = project.activeFloor ?? 1;
  const voidCeilingHeightM =
    options.upperVoidCeilingHeightM ?? voidCeilingHeightAt(sourceProject, activeFloor);
  return {
    floorPlan: {
      outline,
      ceilingHeight: project.room.ceilingHeightM,
      ceilingOverrides: rectangularCeilingOverrides(project, voidCeilingHeightM)
    },
    furniture: [],
    luminaires: [],
    surfaces: { floor: surface, wall: surface, ceiling: surface }
  };
};
