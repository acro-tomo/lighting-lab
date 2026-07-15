/**
 * RadianceScene（プローブ収集用レイキャスト）の three 実装。
 * 対象は遮蔽メッシュ集合＝シャドウ・測光遮蔽と同一のジオメトリ。
 * 各メッシュの userData.albedoLinear（sceneBuilder が設定）を反射率として返す。
 */
import * as THREE from 'three/webgpu';
import type { Vec3 } from '../core/types';
import type { RadianceHit, RadianceScene } from '../photometry/probes';

export function createRadianceScene(occluders: readonly THREE.Object3D[]): RadianceScene {
  const raycaster = new THREE.Raycaster();
  const origin = new THREE.Vector3();
  const direction = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const normalMatrix = new THREE.Matrix3();

  return {
    hit(from: Vec3, dir: Vec3): RadianceHit | null {
      origin.set(from.x, from.y, from.z);
      direction.set(dir.x, dir.y, dir.z);
      raycaster.set(origin, direction);
      raycaster.near = 0.01;
      raycaster.far = 50;
      let nearest: THREE.Intersection | null = null;
      for (const occluder of occluders) {
        for (const hit of raycaster.intersectObject(occluder, true)) {
          if (!nearest || hit.distance < nearest.distance) nearest = hit;
        }
      }
      if (!nearest || !nearest.face) return null;
      const mesh = nearest.object as THREE.Mesh;
      normalMatrix.getNormalMatrix(mesh.matrixWorld);
      normal.copy(nearest.face.normal).applyMatrix3(normalMatrix).normalize();
      // レイ側を向いた法線に揃える（両面ジオメトリ対応）
      if (normal.dot(direction) > 0) normal.multiplyScalar(-1);
      const albedo = (mesh.userData.albedoLinear as [number, number, number] | undefined) ?? [
        0, 0, 0,
      ];
      return {
        point: { x: nearest.point.x, y: nearest.point.y, z: nearest.point.z },
        normal: { x: normal.x, y: normal.y, z: normal.z },
        albedoLinear: albedo,
      };
    },
  };
}
