import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ceilingHeightAt } from '../src/core/room';
const adapterPath = '../../src/components/scene3d/luxSceneAdapter';
const {
  collectLuxOccluders,
  createProbeSceneModel,
  createSceneOcclusion,
  createSceneRadiance,
} = await import(adapterPath);

const baseProject = (): any => ({
  id: 'test',
  name: 'test',
  room: { widthM: 5, depthM: 4.5, ceilingHeightM: 2.4 },
  materials: [],
  walls: [],
  windows: [],
  voids: [],
  furniture: [],
  lights: [],
  camera: {
    position: { x: 0, y: 2, z: 5 },
    target: { x: 0, y: 1, z: 0 },
    fovDeg: 45,
  },
});

const twoMaterialMesh = (): THREE.Mesh => {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      [
        -1.5, -0.5, 0, -0.5, -0.5, 0, -1, 0.5, 0,
        0.5, -0.5, 0, 1.5, -0.5, 0, 1, 0.5, 0,
      ],
      3,
    ),
  );
  geometry.addGroup(0, 3, 0);
  geometry.addGroup(3, 3, 1);
  const glass = new THREE.MeshPhysicalMaterial({
    color: '#ffffff',
    transmission: 0.95,
    side: THREE.DoubleSide,
  });
  const wall = new THREE.MeshStandardMaterial({ color: '#808080', side: THREE.DoubleSide });
  return new THREE.Mesh(geometry, [glass, wall]);
};

describe('lux scene adapter', () => {
  it('高透過材は除外し、不透明面を含む多材質meshは面ごとに判定する', () => {
    const scene = new THREE.Scene();
    const glassOnly = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshPhysicalMaterial({ transmission: 0.95 }),
    );
    const editOverlay = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ color: '#f5c64d' }),
    );
    glassOnly.position.x = 3;
    const mixed = twoMaterialMesh();
    scene.add(glassOnly, editOverlay, mixed);

    const occluders = collectLuxOccluders(scene);
    expect(occluders).toEqual([mixed]);

    const visibility = createSceneOcclusion(occluders);
    expect(visibility.visibility({ x: -1, y: 0, z: 1 }, { x: -1, y: 0, z: -1 })).toBe(1);
    expect(visibility.visibility({ x: 1, y: 0, z: 1 }, { x: 1, y: 0, z: -1 })).toBe(0);

    const radiance = createSceneRadiance(occluders);
    expect(radiance.hit({ x: -1, y: 0, z: 1 }, { x: 0, y: 0, z: -1 })).toBeNull();
    expect(radiance.hit({ x: 1, y: 0, z: 1 }, { x: 0, y: 0, z: -1 })).not.toBeNull();
  });

  it('吹き抜け高と下げ天井の重なりを実描画の規約に合わせる', () => {
    const project = baseProject();
    project.voids = [
      { id: 'void', name: 'void', center: { x: 0, z: 0 }, size: { x: 2, z: 2 } },
    ];
    project.ceilingZones = [
      {
        id: 'zone',
        name: 'zone',
        center: { x: 1, z: 0 },
        size: { x: 1, z: 2 },
        dropM: 0.3,
      },
    ];
    const model = createProbeSceneModel(
      project,
      { centerX: 0, centerZ: 0, sizeX: 5, sizeZ: 4.5 },
      { upperVoidCeilingHeightM: 5.2 },
    );

    expect(ceilingHeightAt(model.floorPlan, { x: -0.5, y: 0 })).toBeCloseTo(5.2);
    expect(ceilingHeightAt(model.floorPlan, { x: 0.75, y: 0 })).toBeCloseTo(4.9);
    expect(ceilingHeightAt(model.floorPlan, { x: 1.25, y: 0 })).toBeCloseTo(2.1);
    expect(ceilingHeightAt(model.floorPlan, { x: 2, y: 0 })).toBeCloseTo(2.4);
  });

  it('UpperVoidが無い場合はvoidCeilingHeightAt相当の高さを使う', () => {
    const project = baseProject();
    project.voids = [
      { id: 'void', name: 'void', center: { x: 0, z: 0 }, size: { x: 1, z: 1 } },
    ];
    const model = createProbeSceneModel(project, {
      centerX: 0,
      centerZ: 0,
      sizeX: 5,
      sizeZ: 4.5,
    });

    expect(ceilingHeightAt(model.floorPlan, { x: 0, y: 0 })).toBeCloseTo(3.8);
  });
});
