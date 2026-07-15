/**
 * IESファイルの取得・パース・キャッシュ。
 * 起動時にプリセットが参照する IES をまとめてプリフェッチし、
 * 以降の光源再構築は同期で配光を解決できるようにする。
 * 取得・パースに失敗した器具はビーム角近似へフォールバックし、
 * UI では「推定配光」表示のままになる（失敗を隠さない）。
 */
import type { FixturePreset } from '../core/types';
import type { LightDistribution } from '../photometry/distribution';
import { iesDistribution, parseIes } from '../photometry/ies';

const cache = new Map<string, LightDistribution | null>();

export async function prefetchIes(presets: readonly FixturePreset[], baseUrl: string): Promise<void> {
  const paths = [...new Set(presets.map((p) => p.ies).filter((p): p is string => p !== undefined))];
  await Promise.all(
    paths.map(async (path) => {
      try {
        const res = await fetch(baseUrl + path);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        cache.set(path, iesDistribution(parseIes(await res.text())));
      } catch (error) {
        console.warn(`IES読込失敗（ビーム角近似にフォールバック）: ${path}`, error);
        cache.set(path, null);
      }
    }),
  );
}

/** プリフェッチ済みの配光を返す。未取得・失敗は null（=ビーム角近似） */
export function resolveIes(preset: FixturePreset): LightDistribution | null {
  if (preset.ies === undefined) return null;
  return cache.get(preset.ies) ?? null;
}
