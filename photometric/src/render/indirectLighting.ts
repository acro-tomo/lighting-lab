/**
 * 間接光（Irradiance Probe）のGPU描画側。
 *
 * CPU測光（photometry/probes.ts）が計算した SH9 係数配列を
 * 9枚の RGBA Float 3D テクスチャ（テクスチャ0のαに有効フラグ）として保持し、
 * TSL ノードでフラグメントごとに
 *   E(n) = Σ Â_l c_lm Y_lm(n)（トライリニア補間・有効フラグで再正規化）
 *   emissive = albedo × (1−metalness) × E / π
 * を評価して各マテリアルの emissiveNode に注入する。
 * 係数はCPUと単一ソース（同じ Float32Array 由来）。表示のみで lx には不関与。
 *
 * 制限: GPUのハードウェアトライリニアは壁越しプローブの可視性を評価しない
 * （測光系は可視性レイキャストで除外する。DEVLOG参照）。
 */
import * as THREE from 'three/webgpu';
import {
  Fn,
  add,
  float,
  materialColor,
  materialMetalness,
  max,
  normalWorld,
  positionWorld,
  texture3D,
  uniform,
  vec3,
} from 'three/tsl';
import type { ProbeGridInfo } from '../photometry/probes';
import { SH_COEFF_COUNT } from '../photometry/sh';

const A0 = Math.PI;
const A1 = (2 * Math.PI) / 3;
const A2 = Math.PI / 4;
const A_PER_COEFF = [A0, A1, A1, A1, A2, A2, A2, A2, A2];

export class IndirectLightingGpu {
  /** 0 = 無効、1 = 有効（描画トグル） */
  readonly intensity = uniform(0);

  private textures: THREE.Data3DTexture[] = [];
  private texData: Float32Array[] = [];
  private readonly originUniform = uniform(new THREE.Vector3());
  private readonly spacingUniform = uniform(1);
  private readonly dimsUniform = uniform(new THREE.Vector3(1, 1, 1));
  private dims: [number, number, number] = [0, 0, 0];
  private cachedNode: unknown | null = null;

  /** グリッド寸法に合わせてテクスチャを確保（寸法変更時のみ再確保） */
  private allocate(grid: ProbeGridInfo): void {
    if (this.dims[0] === grid.nx && this.dims[1] === grid.ny && this.dims[2] === grid.nz) return;
    for (const tex of this.textures) tex.dispose();
    this.textures = [];
    this.texData = [];
    this.dims = [grid.nx, grid.ny, grid.nz];
    const texelCount = grid.nx * grid.ny * grid.nz;
    for (let i = 0; i < SH_COEFF_COUNT; i++) {
      const data = new Float32Array(texelCount * 4);
      const tex = new THREE.Data3DTexture(data, grid.nx, grid.ny, grid.nz);
      tex.format = THREE.RGBAFormat;
      tex.type = THREE.FloatType;
      tex.minFilter = THREE.LinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.wrapS = THREE.ClampToEdgeWrapping;
      tex.wrapT = THREE.ClampToEdgeWrapping;
      tex.wrapR = THREE.ClampToEdgeWrapping;
      tex.unpackAlignment = 1;
      this.textures.push(tex);
      this.texData.push(data);
    }
    this.cachedNode = null; // テクスチャ実体が変わったのでノード再構築
  }

  /** CPU側フィールドの係数をテクスチャへ転送する */
  update(grid: ProbeGridInfo): void {
    this.allocate(grid);
    this.originUniform.value.set(grid.origin.x, grid.origin.y, grid.origin.z);
    this.spacingUniform.value = grid.spacing;
    this.dimsUniform.value.set(grid.nx, grid.ny, grid.nz);
    const texelCount = grid.nx * grid.ny * grid.nz;
    for (let i = 0; i < SH_COEFF_COUNT; i++) {
      const data = this.texData[i]!;
      for (let t = 0; t < texelCount; t++) {
        const src = (t * SH_COEFF_COUNT + i) * 3;
        const dst = t * 4;
        data[dst] = grid.coeffs[src]!;
        data[dst + 1] = grid.coeffs[src + 1]!;
        data[dst + 2] = grid.coeffs[src + 2]!;
        data[dst + 3] = i === 0 ? grid.validity[t]! : 0;
      }
      this.textures[i]!.needsUpdate = true;
    }
  }

  get isAllocated(): boolean {
    return this.textures.length === SH_COEFF_COUNT;
  }

  /**
   * マテリアルへ注入する emissive ノード（全マテリアル共有）。
   * albedo(materialColor)×(1−metalness)×E/π×intensity
   */
  emissiveNode(): unknown {
    if (this.cachedNode) return this.cachedNode;
    if (!this.isAllocated) throw new Error('IndirectLightingGpu: update() 前に emissiveNode を要求');

    const node = Fn(() => {
      const texel = positionWorld.sub(this.originUniform).div(this.spacingUniform);
      const uvw = texel.add(vec3(0.5, 0.5, 0.5)).div(this.dimsUniform);
      const n = normalWorld;
      // SH基底 Y_lm(n) × コサイン畳み込み係数
      const weights = [
        float(0.282095 * A_PER_COEFF[0]!),
        n.y.mul(0.488603 * A_PER_COEFF[1]!),
        n.z.mul(0.488603 * A_PER_COEFF[2]!),
        n.x.mul(0.488603 * A_PER_COEFF[3]!),
        n.x.mul(n.y).mul(1.092548 * A_PER_COEFF[4]!),
        n.y.mul(n.z).mul(1.092548 * A_PER_COEFF[5]!),
        n.z.mul(n.z).mul(3).sub(1).mul(0.315392 * A_PER_COEFF[6]!),
        n.x.mul(n.z).mul(1.092548 * A_PER_COEFF[7]!),
        n.x.mul(n.x).sub(n.y.mul(n.y)).mul(0.546274 * A_PER_COEFF[8]!),
      ];
      const sample0 = texture3D(this.textures[0]!, uvw, 0);
      let irradiance = sample0.rgb.mul(weights[0]!);
      for (let i = 1; i < SH_COEFF_COUNT; i++) {
        irradiance = add(irradiance, texture3D(this.textures[i]!, uvw, 0).rgb.mul(weights[i]!));
      }
      // 無効プローブ（係数0・α0）との補間分を再正規化
      const validity = max(sample0.a, 0.05);
      const e = irradiance.div(validity).max(0);
      // materialColor / materialMetalness の型定義が Node ジェネリクスを欠くためキャスト
      const albedo = vec3(materialColor as never);
      const dielectric = float(materialMetalness as never).oneMinus();
      return albedo.mul(dielectric).mul(e).mul(this.intensity.div(Math.PI));
    })();

    this.cachedNode = node;
    return node;
  }

  dispose(): void {
    for (const tex of this.textures) tex.dispose();
    this.textures = [];
    this.texData = [];
    this.dims = [0, 0, 0];
    this.cachedNode = null;
  }
}

/**
 * 建築・家具の PBR マテリアルへ間接光ノードを注入する。
 * 反射スクリーンや発光ディスク等、既に emissiveNode を持つものは対象外。
 */
const giNodes = new WeakSet<object>();

export function injectIndirect(root: THREE.Object3D, gpu: IndirectLightingGpu): void {
  const node = gpu.emissiveNode() as object;
  giNodes.add(node);
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const material = obj.material as THREE.MeshPhysicalNodeMaterial;
    if (material.isMeshPhysicalNodeMaterial !== true) return;
    if (material.emissiveNode === node) return; // 注入済み（再コンパイル回避）
    // null か、過去のGIノードだけを置き換える（他用途の emissiveNode は尊重）
    if (material.emissiveNode !== null && !giNodes.has(material.emissiveNode as object)) return;
    material.emissiveNode = node as never;
    material.needsUpdate = true;
  });
}
