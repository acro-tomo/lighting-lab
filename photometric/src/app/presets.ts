/**
 * 器具プリセットJSONの読込と境界検証。
 * 読込JSONは外部入力なので、ここでスキーマを検証してから型に載せる。
 */
import type { FixturePreset } from '../core/types';

function fail(index: number, message: string): never {
  throw new Error(`presets[${index}]: ${message}`);
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

export function parsePreset(raw: unknown, index: number): FixturePreset {
  if (typeof raw !== 'object' || raw === null) fail(index, 'object expected');
  const o = raw as Record<string, unknown>;
  if (typeof o.model !== 'string' || o.model.length === 0) fail(index, 'model');
  if (typeof o.maker !== 'string') fail(index, 'maker');
  if (o.kind !== 'downlight' && o.kind !== 'spot') fail(index, 'kind');
  if (!isFiniteNumber(o.beamAngleDeg) || o.beamAngleDeg <= 0 || o.beamAngleDeg > 180) {
    fail(index, 'beamAngleDeg (0,180]');
  }
  if (!isFiniteNumber(o.flux) || o.flux <= 0) fail(index, 'flux > 0');
  if (!isFiniteNumber(o.cct) || o.cct < 1000 || o.cct > 20000) fail(index, 'cct 1000..20000');
  if (typeof o.dimmable !== 'boolean') fail(index, 'dimmable');
  if (!isFiniteNumber(o.cutoutDiameter) || o.cutoutDiameter < 0) fail(index, 'cutoutDiameter');
  if (!isFiniteNumber(o.apertureDiameter) || o.apertureDiameter <= 0) fail(index, 'apertureDiameter');
  if (o.ies !== undefined && typeof o.ies !== 'string') fail(index, 'ies');
  if (o.dataSource !== 'catalog' && o.dataSource !== 'representative') fail(index, 'dataSource');
  return {
    model: o.model,
    maker: o.maker,
    kind: o.kind,
    beamAngleDeg: o.beamAngleDeg,
    flux: o.flux,
    cct: o.cct,
    dimmable: o.dimmable,
    cutoutDiameter: o.cutoutDiameter,
    apertureDiameter: o.apertureDiameter,
    ies: o.ies as string | undefined,
    dataSource: o.dataSource,
  };
}

export function parsePresets(raw: unknown): FixturePreset[] {
  if (typeof raw !== 'object' || raw === null || !Array.isArray((raw as { presets?: unknown }).presets)) {
    throw new Error('presets JSON: { presets: [...] } expected');
  }
  return ((raw as { presets: unknown[] }).presets).map(parsePreset);
}

export async function loadPresets(url: string): Promise<FixturePreset[]> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`presets fetch failed: ${res.status}`);
  return parsePresets(await res.json());
}
