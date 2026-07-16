/**
 * 深度（可視性）付き Irradiance Probe フィールド（Phase 2 間接光）。
 *
 * - 部屋内部に 0.5〜0.75m 間隔の3D格子でプローブを配置（吹抜けの天井高差対応）
 * - 各プローブから全球レイを収集し、ヒット面の拡散反射放射輝度
 *   L = ρ·(E_direct + E_indirect_prev)/π を SH2次9係数へ投影
 * - ヒット結果はキャッシュし、光源のみの変更時は再レイキャストなしで
 *   再ライティング（差分再計算）できる
 * - サンプリングはトライリニア補間＋プローブへの可視性レイキャスト重み
 *   （壁越しのプローブを除外 = 簡易 depth/visibility）
 *
 * 測光コアの一部としてレンダラー非依存。GPU描画側は同じ係数配列
 * （coeffs / グリッド定義）を 3D テクスチャとして参照する。
 */
import { boundingBox, ceilingHeightAt, pointInPolygon } from '../core/room';
import type { Lux, SceneModel, Vec3 } from '../core/types';
import { add, scale } from '../core/vec3';
import {
  illuminanceAt,
  NO_OCCLUSION,
  type IndirectIlluminanceProvider,
  type OcclusionTester,
  type PhotometricLight,
  type SurfacePoint,
} from './illuminance';
import {
  evalIrradiance,
  fibonacciSphere,
  irradianceLuminance,
  projectRadianceSamples,
  SH_COEFF_COUNT,
} from './sh';

/** レイのヒット面情報（放射輝度計算に必要な最小限） */
export interface RadianceHit {
  point: Vec3;
  /** レイ側を向いた面法線 */
  normal: Vec3;
  /** linear RGB 拡散反射率 */
  albedoLinear: [number, number, number];
}

/** シーンへのレイキャスト抽象（render/ 側が遮蔽メッシュ集合で実装する） */
export interface RadianceScene {
  hit(origin: Vec3, dir: Vec3): RadianceHit | null;
}

export interface ProbeFieldConfig {
  /** プローブ間隔 [m]（仕様: 0.5〜0.75） */
  spacing?: number;
  /** 壁・床・天井からの最小距離 [m] */
  margin?: number;
  /** ワールド座標の床高 [m]。未指定は0 */
  floorY?: number;
  /** テスト用: ヒット→放射輝度の解決を差し替える */
  patchRadiance?: (hit: RadianceHit) => [number, number, number];
}

export interface ProbeGridInfo {
  origin: Vec3;
  spacing: number;
  nx: number;
  ny: number;
  nz: number;
  /** ix + nx*(iy + ny*iz) × 27（Data3DTexture と同レイアウト） */
  coeffs: Float32Array;
  validity: Uint8Array;
}

const RADIANCE_PATCH_QUANT = 0.25;

export class IrradianceProbeField implements IndirectIlluminanceProvider {
  readonly origin: Vec3;
  readonly spacing: number;
  readonly nx: number;
  readonly ny: number;
  readonly nz: number;
  readonly count: number;
  /** コミット済み係数（サンプリング対象） */
  readonly coeffs: Float32Array;
  readonly validity: Uint8Array;
  /** プローブ位置（無効プローブも格子位置を持つ） */
  readonly positions: Vec3[] = [];

  private readonly margin: number;
  private readonly floorY: number;
  private readonly patchRadianceOverride?: (hit: RadianceHit) => [number, number, number];
  /** 直近 gather のレイ方向（全プローブ共通） */
  private cachedDirs: Vec3[] = [];
  /** プローブ×レイのヒットキャッシュ（光源のみ変更時の差分再計算に使う） */
  private cachedHits: (RadianceHit | null)[][] = [];
  /** サンプリング時の可視性判定 */
  private visibilityTester: OcclusionTester = NO_OCCLUSION;
  private ready = false;

  constructor(model: SceneModel, config: ProbeFieldConfig = {}) {
    this.spacing = config.spacing ?? 0.65;
    this.margin = config.margin ?? 0.25;
    this.floorY = config.floorY ?? 0;
    this.patchRadianceOverride = config.patchRadiance;

    const { min, max } = boundingBox(model.floorPlan.outline);
    let maxCeil = model.floorPlan.ceilingHeight;
    for (const o of model.floorPlan.ceilingOverrides) maxCeil = Math.max(maxCeil, o.height);

    this.nx = Math.max(2, Math.floor((max.x - min.x - 2 * this.margin) / this.spacing) + 2);
    const nzPlan = Math.max(2, Math.floor((max.y - min.y - 2 * this.margin) / this.spacing) + 2);
    this.ny = Math.max(2, Math.floor((maxCeil - 2 * this.margin) / this.spacing) + 2);
    this.nz = nzPlan;
    this.count = this.nx * this.ny * this.nz;

    // ワールド座標: x → +x、鉛直 → +y、平面y → -z。origin はグリッド最小コーナー
    this.origin = {
      x: min.x + this.margin,
      y: this.floorY + this.margin,
      z: -(max.y - this.margin),
    };

    this.coeffs = new Float32Array(this.count * SH_COEFF_COUNT * 3);
    this.validity = new Uint8Array(this.count);

    for (let iz = 0; iz < this.nz; iz++) {
      for (let iy = 0; iy < this.ny; iy++) {
        for (let ix = 0; ix < this.nx; ix++) {
          const pos = this.probePosition(ix, iy, iz);
          const planP = { x: pos.x, y: -pos.z };
          const index = this.index(ix, iy, iz);
          this.positions[index] = pos;
          const inside = pointInPolygon(planP, model.floorPlan.outline);
          const ceil = inside ? ceilingHeightAt(model.floorPlan, planP) : 0;
          this.validity[index] =
            inside && pos.y <= this.floorY + ceil - this.margin * 0.5 ? 1 : 0;
        }
      }
    }
  }

  index(ix: number, iy: number, iz: number): number {
    return ix + this.nx * (iy + this.ny * iz);
  }

  probePosition(ix: number, iy: number, iz: number): Vec3 {
    return {
      x: this.origin.x + ix * this.spacing,
      y: this.origin.y + iy * this.spacing,
      z: this.origin.z + iz * this.spacing,
    };
  }

  get isReady(): boolean {
    return this.ready;
  }

  gridInfo(): ProbeGridInfo {
    return {
      origin: this.origin,
      spacing: this.spacing,
      nx: this.nx,
      ny: this.ny,
      nz: this.nz,
      coeffs: this.coeffs,
      validity: this.validity,
    };
  }

  /**
   * 収集パス（ジェネレータ）。呼び出し側が時分割で駆動する。
   * rayCount 変更時はレイキャストからやり直し、同一なら relight のみ。
   * secondBounce=true で前回コミット済みフィールドを2バウンス目として参照。
   */
  *gatherPass(
    scene: RadianceScene,
    lights: readonly PhotometricLight[],
    occlusion: OcclusionTester,
    rayCount: number,
    secondBounce = false,
  ): Generator<number> {
    const needRaycast = this.cachedDirs.length !== rayCount || this.cachedHits.length === 0;
    if (needRaycast) {
      this.cachedDirs = fibonacciSphere(rayCount);
      this.cachedHits = new Array(this.count);
    }
    this.visibilityTester = occlusion;

    // 2バウンス目は「現在コミット済み」の係数を凍結して参照する
    const bounceSource = secondBounce && this.ready ? this.coeffs.slice() : null;
    const radianceCache = new Map<string, [number, number, number]>();
    const pending = new Float32Array(this.coeffs.length);

    for (let index = 0; index < this.count; index++) {
      if (this.validity[index] === 0) {
        yield index / this.count;
        continue;
      }
      const pos = this.positions[index]!;
      let hits = this.cachedHits[index];
      if (needRaycast || !hits) {
        hits = this.cachedDirs.map((dir) => scene.hit(pos, dir));
        this.cachedHits[index] = hits;
      }
      const radiance = hits.map((hit) =>
        hit ? this.patchRadiance(hit, lights, occlusion, radianceCache, bounceSource) : ZERO_RGB,
      );
      const sh = projectRadianceSamples(this.cachedDirs, radiance);
      pending.set(sh, index * SH_COEFF_COUNT * 3);
      yield (index + 1) / this.count;
    }

    this.coeffs.set(pending);
    this.ready = true;
  }

  /** 光源のみ変更されたときの差分再計算（レイキャスト再利用）が可能か */
  canRelight(): boolean {
    return this.cachedHits.length > 0 && this.cachedDirs.length > 0;
  }

  private patchRadiance(
    hit: RadianceHit,
    lights: readonly PhotometricLight[],
    occlusion: OcclusionTester,
    cache: Map<string, [number, number, number]>,
    bounceSource: Float32Array | null,
  ): [number, number, number] {
    if (this.patchRadianceOverride) return this.patchRadianceOverride(hit);
    const q = RADIANCE_PATCH_QUANT;
    const key =
      `${Math.round(hit.point.x / q)},${Math.round(hit.point.y / q)},${Math.round(hit.point.z / q)},` +
      `${Math.round(hit.normal.x * 2)},${Math.round(hit.normal.y * 2)},${Math.round(hit.normal.z * 2)}`;
    const cached = cache.get(key);
    if (cached) return cached;

    const surface: SurfacePoint = {
      position: add(hit.point, scale(hit.normal, 0.005)),
      normal: hit.normal,
    };
    let irradiance = illuminanceAt(surface, lights, occlusion).direct;
    if (bounceSource) {
      irradiance += this.sampleLuminanceFrom(bounceSource, surface.position, surface.normal);
    }
    const invPi = 1 / Math.PI;
    const [ar, ag, ab] = hit.albedoLinear;
    const radiance: [number, number, number] = [
      ar * irradiance * invPi,
      ag * irradiance * invPi,
      ab * irradiance * invPi,
    ];
    cache.set(key, radiance);
    return radiance;
  }

  /** 可視性重み付きトライリニアで放射照度[lx]をサンプル */
  indirectAt(point: SurfacePoint): Lux {
    if (!this.ready) return 0;
    return this.sampleLuminanceFrom(this.coeffs, point.position, point.normal);
  }

  private sampleLuminanceFrom(source: Float32Array, position: Vec3, normal: Vec3): Lux {
    const gx = (position.x - this.origin.x) / this.spacing;
    const gy = (position.y - this.origin.y) / this.spacing;
    const gz = (position.z - this.origin.z) / this.spacing;
    const ix0 = Math.max(0, Math.min(this.nx - 1, Math.floor(gx)));
    const iy0 = Math.max(0, Math.min(this.ny - 1, Math.floor(gy)));
    const iz0 = Math.max(0, Math.min(this.nz - 1, Math.floor(gz)));
    const fx = Math.max(0, Math.min(1, gx - ix0));
    const fy = Math.max(0, Math.min(1, gy - iy0));
    const fz = Math.max(0, Math.min(1, gz - iz0));

    let sumWeight = 0;
    let r = 0;
    let g = 0;
    let b = 0;
    for (let dz = 0; dz <= 1; dz++) {
      const iz = Math.min(this.nz - 1, iz0 + dz);
      for (let dy = 0; dy <= 1; dy++) {
        const iy = Math.min(this.ny - 1, iy0 + dy);
        for (let dx = 0; dx <= 1; dx++) {
          const ix = Math.min(this.nx - 1, ix0 + dx);
          const index = this.index(ix, iy, iz);
          if (this.validity[index] === 0) continue;
          let weight =
            (dx === 1 ? fx : 1 - fx) * (dy === 1 ? fy : 1 - fy) * (dz === 1 ? fz : 1 - fz);
          if (weight <= 1e-6) continue;
          // 可視性: 遮蔽物（壁・家具）越しのプローブを除外
          const probePos = this.positions[index]!;
          if (this.visibilityTester.visibility(position, probePos) <= 0) continue;
          sumWeight += weight;
          const base = index * SH_COEFF_COUNT * 3;
          const irr = evalIrradiance(source.subarray(base, base + SH_COEFF_COUNT * 3), normal);
          r += irr[0] * weight;
          g += irr[1] * weight;
          b += irr[2] * weight;
        }
      }
    }
    if (sumWeight <= 1e-6) return 0;
    return irradianceLuminance([r / sumWeight, g / sumWeight, b / sumWeight]);
  }
}

const ZERO_RGB: [number, number, number] = [0, 0, 0];

/** ジェネレータを最後まで同期実行する（テスト・小規模シーン用） */
export function runToCompletion(pass: Generator<number>): void {
  let step = pass.next();
  while (!step.done) step = pass.next();
}
