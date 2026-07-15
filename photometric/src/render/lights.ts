/**
 * 光源の three.js 表現。
 *
 * 描画・測光の二重化を防ぐため、すべての光源（IES/ビーム角近似とも）は
 * 単一の LightDistribution から:
 *  - CPU測光: distribution.intensityAt() を直接評価
 *  - GPU描画: 同じ distribution をサンプルした減衰プロファイル
 *    （R32Float テクスチャ、θ∈[0,π]、線形補間）× ピーク光度[cd]
 * として構成する。GPU側は軸対称（φ平均）近似。非対称IESの描画側制限は
 * docs/DEVLOG.md 参照（測光系は常に完全な θ/φ 2D を使う）。
 */
import * as THREE from 'three/webgpu';
import { cctToLinearRgb } from '../core/color';
import type { Luminaire, Vec3 } from '../core/types';
import { vec3 } from '../core/vec3';
import { beamDistribution, type LightDistribution } from '../photometry/distribution';
import type { PhotometricLight } from '../photometry/illuminance';

export const PROFILE_RESOLUTION = 512;
const PROFILE_PHI_SAMPLES = 8;

export interface AttenuationProfile {
  /** I(θ)/peak。θ∈[0,π] を等分割、φ 平均 */
  data: Float32Array;
  /** ピーク光度 [cd]（調光率 1.0 時） */
  peak: number;
}

export function buildAttenuationProfile(
  dist: LightDistribution,
  resolution = PROFILE_RESOLUTION,
): AttenuationProfile {
  const data = new Float32Array(resolution);
  let peak = 0;
  for (let i = 0; i < resolution; i++) {
    const theta = (i / (resolution - 1)) * Math.PI;
    let sum = 0;
    for (let j = 0; j < PROFILE_PHI_SAMPLES; j++) {
      sum += dist.intensityAt(theta, (j / PROFILE_PHI_SAMPLES) * 2 * Math.PI);
    }
    const value = sum / PROFILE_PHI_SAMPLES;
    data[i] = value;
    peak = Math.max(peak, value);
  }
  if (peak > 0) {
    for (let i = 0; i < resolution; i++) data[i]! /= peak;
  }
  return { data, peak };
}

export function profileToTexture(profile: AttenuationProfile): THREE.DataTexture {
  const texture = new THREE.DataTexture(
    profile.data,
    profile.data.length,
    1,
    THREE.RedFormat,
    THREE.FloatType,
  );
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
}

/** aim (tilt/pan) → ワールド光軸（単位ベクトル）。tilt=0 は真下 */
export function aimToAxis(aim: { tiltDeg: number; panDeg: number }): Vec3 {
  const tilt = (aim.tiltDeg * Math.PI) / 180;
  const pan = (aim.panDeg * Math.PI) / 180;
  return vec3(Math.sin(tilt) * Math.cos(pan), -Math.cos(tilt), -Math.sin(tilt) * Math.sin(pan));
}

/** 平面座標 (x,y) → ワールド (x, h, -y) */
export function planToWorld(p: { x: number; y: number }, height: number): Vec3 {
  return vec3(p.x, height, -p.y);
}

export interface BuiltLuminaire {
  /** シーンに追加するグループ（ライト＋ターゲット＋発光面表示） */
  group: THREE.Group;
  light: THREE.IESSpotLight;
  /** CPU測光用の同一光源定義 */
  photometric: PhotometricLight;
  /** IES データに基づくか（false = ビーム角近似 = UIで「推定配光」表示） */
  hasIes: boolean;
}

/**
 * Luminaire → three ライト＋測光光源。
 * distributionResolver は IES 読込済みならその配光を、なければ null を返す。
 */
export function buildLuminaire(
  lum: Luminaire,
  iesDistribution: LightDistribution | null,
): BuiltLuminaire {
  const hasIes = iesDistribution !== null;
  const distribution =
    iesDistribution ?? beamDistribution(lum.preset.flux, lum.preset.beamAngleDeg);

  const profile = buildAttenuationProfile(distribution);
  const [r, g, b] = cctToLinearRgb(lum.preset.cct);

  const light = new THREE.IESSpotLight();
  light.color.setRGB(r, g, b, THREE.LinearSRGBColorSpace);
  // intensity は candela。色は輝度正規化済みなので lm/cd との整合が保たれる
  light.intensity = profile.peak * lum.dimming;
  light.decay = 2;
  light.distance = 0;
  light.angle = Math.PI / 2 - 1e-3;
  light.iesMap = profileToTexture(profile);

  // シャドウ（PCF低サンプル。renderer側で PCFShadowMap を指定）
  light.castShadow = true;
  light.shadow.mapSize.set(512, 512);
  light.shadow.camera.near = 0.05;
  light.shadow.camera.far = 30;
  light.shadow.bias = -0.0004;
  light.shadow.normalBias = 0.015;

  const position = planToWorld(lum.position, lum.mountHeight);
  light.position.set(position.x, position.y, position.z);
  const axis = aimToAxis(lum.aim);
  light.target.position.set(position.x + axis.x, position.y + axis.y, position.z + axis.z);

  const group = new THREE.Group();
  group.add(light);
  group.add(light.target);

  // 発光面の表示（アパチャ直径の発光ディスク）。遮蔽判定・照度には関与しない
  const apertureRadius = Math.max(0.015, lum.preset.apertureDiameter / 2);
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(apertureRadius, 24),
    new THREE.MeshStandardMaterial({
      color: 0x000000,
      emissive: new THREE.Color().setRGB(r, g, b, THREE.LinearSRGBColorSpace),
      emissiveIntensity: 20 * Math.max(0.02, lum.dimming),
      side: THREE.DoubleSide,
    }),
  );
  disc.position.set(position.x, position.y, position.z);
  // ディスク法線を光軸方向へ
  const lookAt = new THREE.Vector3(position.x + axis.x, position.y + axis.y, position.z + axis.z);
  disc.lookAt(lookAt);
  disc.name = `luminaire-disc:${lum.id}`;
  group.add(disc);

  const photometric: PhotometricLight = {
    position,
    axis,
    distribution,
    dimming: lum.dimming,
  };

  return { group, light, photometric, hasIes };
}
