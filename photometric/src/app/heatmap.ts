/**
 * 照度ヒートマップの表示層。
 *
 * - 計算は photometry/grid.ts（測光コア）。描画像からの逆算はしない。
 * - 色スケールは固定レンジ（0〜300lx / 0〜500lx 切替）。シーンごとの
 *   自動正規化は行わない（案比較の一貫性のため）。
 * - ヒートマップはトーンマッピング・露出の影響を受けない
 *   （toneMapped=false の unlit マテリアル）。
 */
import * as THREE from 'three/webgpu';
import { lxToColor, type IlluminanceGrid } from '../photometry/grid';
import { overlayTextureMaterial } from '../render/overlayMaterial';

export { computeIlluminanceGrid, insideFurniture, lxToColor, GRID_SPACING } from '../photometry/grid';
export type { IlluminanceGrid } from '../photometry/grid';

export const SCALE_OPTIONS = [300, 500] as const;

export function gridToCanvas(grid: IlluminanceGrid, scaleMax: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = grid.cols;
  canvas.height = grid.rows;
  const ctx = canvas.getContext('2d')!;
  const image = ctx.createImageData(grid.cols, grid.rows);
  for (let i = 0; i < grid.values.length; i++) {
    const v = grid.values[i]!;
    const o = i * 4;
    if (Number.isNaN(v)) {
      image.data[o + 3] = 0;
    } else {
      const [r, g, b] = lxToColor(v, scaleMax);
      image.data[o] = r;
      image.data[o + 1] = g;
      image.data[o + 2] = b;
      image.data[o + 3] = 215;
    }
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

/** ヒートマップの three メッシュ（表示のみ。遮蔽判定・照度計算に不関与） */
export function buildHeatmapMesh(
  grid: IlluminanceGrid,
  scaleMax: number,
  height: number,
): THREE.Mesh {
  const texture = new THREE.CanvasTexture(gridToCanvas(grid, scaleMax));
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  // canvas 行0 = グリッド行0 = 平面 y最小。UV v=0 側（ローカル-y = 平面y最小）に合わせる
  texture.flipY = false;

  const width = (grid.cols - 1) * grid.spacing;
  const depth = (grid.rows - 1) * grid.spacing;
  // 露出・トーンマッピングから独立（overlayMaterial 参照）
  const material = overlayTextureMaterial(texture);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(grid.origin.x + width / 2, height + 0.01, -(grid.origin.y + depth / 2));
  mesh.name = 'heatmap';
  mesh.renderOrder = 10;
  return mesh;
}

/** 凡例（パネル用） */
export function buildLegendCanvas(scaleMax: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 260;
  canvas.height = 34;
  const ctx = canvas.getContext('2d')!;
  for (let x = 0; x < canvas.width; x++) {
    const [r, g, b] = lxToColor((x / (canvas.width - 1)) * scaleMax, scaleMax);
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(x, 0, 1, 16);
  }
  ctx.fillStyle = '#b9c0c8';
  ctx.font = '11px sans-serif';
  for (const frac of [0, 0.25, 0.5, 0.75, 1]) {
    const label = `${Math.round(scaleMax * frac)}`;
    const x = Math.min(
      canvas.width - ctx.measureText(label).width,
      Math.max(0, frac * canvas.width - 8),
    );
    ctx.fillText(label, x, 29);
  }
  return canvas;
}
