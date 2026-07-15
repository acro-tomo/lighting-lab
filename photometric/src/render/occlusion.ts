/**
 * レイキャストによる遮蔽判定（OcclusionTester の実装）。
 *
 * 対象ジオメトリは sceneBuilder が返す遮蔽メッシュ集合であり、
 * シャドウマップのキャスターと同一。描画系と測光系で遮蔽の
 * 実装を二重化しないためのアダプタ。
 */
import * as THREE from 'three/webgpu';
import type { Vec3 } from '../core/types';
import type { OcclusionTester } from '../photometry/illuminance';

/** 受照面からのレイ起点オフセット（自己交差回避）[m] */
const SURFACE_EPS = 0.005;
/** 光源手前の打ち切り（発光面表示メッシュ等との交差回避）[m] */
const LIGHT_EPS = 0.02;

export function createRaycastOcclusion(occluders: readonly THREE.Object3D[]): OcclusionTester {
  const raycaster = new THREE.Raycaster();
  const origin = new THREE.Vector3();
  const direction = new THREE.Vector3();

  return {
    visibility(from: Vec3, to: Vec3): number {
      direction.set(to.x - from.x, to.y - from.y, to.z - from.z);
      const distance = direction.length();
      if (distance <= SURFACE_EPS + LIGHT_EPS) return 1;
      direction.multiplyScalar(1 / distance);
      origin.set(from.x, from.y, from.z).addScaledVector(direction, SURFACE_EPS);
      raycaster.set(origin, direction);
      raycaster.near = 0;
      raycaster.far = distance - SURFACE_EPS - LIGHT_EPS;
      for (const occluder of occluders) {
        if (raycaster.intersectObject(occluder, true).length > 0) return 0;
      }
      return 1;
    },
  };
}
