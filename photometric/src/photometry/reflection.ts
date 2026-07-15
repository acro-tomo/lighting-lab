/**
 * 反射確認モードの映り込み判定（純測光・レンダラー非依存）。
 *
 * 平面鏡近似: 低Roughness面を鏡面矩形とみなし、各光源の鏡像と視点を結ぶ
 * 線分が矩形内を通り、かつ光源がその反射点を実際に照らしている
 * （配光がゼロでない・遮蔽されていない）場合に「映り込みあり」と判定する。
 * 画面が黒く見える＝グレアなし、を目視でなく計算で裏づけるための機能。
 * 明るい床・壁の像（間接光の映り込み）は対象外（Phase 2 以降）。
 */
import type { Candelas, Vec3 } from '../core/types';
import { add, dot, length, normalize, scale, sub } from '../core/vec3';
import { localAngles, type OcclusionTester, type PhotometricLight, NO_OCCLUSION } from './illuminance';

/** 鏡面とみなす矩形（中心・法線・面内直交軸と半径） */
export interface ReflectiveSurface {
  center: Vec3;
  /** 単位法線（視点側を向く） */
  normal: Vec3;
  uAxis: Vec3;
  vAxis: Vec3;
  halfU: number;
  halfV: number;
}

export interface ReflectionHit {
  lightIndex: number;
  /** 面上の反射点 */
  point: Vec3;
  /** 反射点へ向かう光源の光度 [cd]（調光率適用後） */
  intensity: Candelas;
}

export function findLightReflections(
  eye: Vec3,
  surface: ReflectiveSurface,
  lights: readonly PhotometricLight[],
  occlusion: OcclusionTester = NO_OCCLUSION,
): ReflectionHit[] {
  const n = normalize(surface.normal);
  const hits: ReflectionHit[] = [];

  // 視点が面の表側に居ることが前提
  if (dot(sub(eye, surface.center), n) <= 0) return hits;

  lights.forEach((light, lightIndex) => {
    const signedDist = dot(sub(light.position, surface.center), n);
    if (signedDist <= 0) return; // 面の裏側の光源は映らない

    // 鏡像位置
    const image = sub(light.position, scale(n, 2 * signedDist));
    // 視点→鏡像の線分と面の交点
    const dir = sub(image, eye);
    const denom = dot(dir, n);
    if (Math.abs(denom) < 1e-9) return;
    const t = dot(sub(surface.center, eye), n) / denom;
    if (t <= 0 || t >= 1) return;
    const q = add(eye, scale(dir, t));

    // 矩形内チェック
    const local = sub(q, surface.center);
    if (Math.abs(dot(local, surface.uAxis)) > surface.halfU) return;
    if (Math.abs(dot(local, surface.vAxis)) > surface.halfV) return;

    // 光源がこの点を実際に照らしているか（配光）
    const toQ = sub(q, light.position);
    const r = length(toQ);
    if (r < 1e-6) return;
    const incident = scale(toQ, 1 / r);
    const { theta, phi } = localAngles(light, incident);
    const intensity = light.distribution.intensityAt(theta, phi) * light.dimming;
    if (intensity <= 0) return;

    // 遮蔽（反射点→光源）
    if (occlusion.visibility(q, light.position) <= 0) return;

    hits.push({ lightIndex, point: q, intensity });
  });

  return hits;
}
