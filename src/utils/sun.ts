import * as THREE from "three";
import type { Daylight } from "../types";

export const DEFAULT_DAYLIGHT: Daylight = {
  enabled: true,
  month: 10,
  day: 15,
  hour: 14,
  northOffsetDeg: 0,
  latitudeDeg: 35
};

// うるう年は無視した月初の累積日数（1月1日 = 1）。
const CUMULATIVE_DAYS = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];

const dayOfYear = (month: number, day: number) => {
  const m = Math.min(12, Math.max(1, Math.round(month)));
  return CUMULATIVE_DAYS[m - 1] + Math.max(1, day);
};

const DEG = Math.PI / 180;

/**
 * 太陽方向を計算する。dir は「原点から太陽へ向かう」単位ベクトル。
 * directionalLight を dir*距離 に置き、target=原点 にすると日光が降り注ぐ向きになる。
 * altitudeDeg<=0 は地平線下（夜）を表す。
 */
export const sunVector = (d: Daylight): { dir: THREE.Vector3; altitudeDeg: number } => {
  const N = dayOfYear(d.month, d.day);
  const decl = 23.45 * DEG * Math.sin((2 * Math.PI * (284 + N)) / 365); // 赤緯
  const H = (d.hour - 12) * 15 * DEG; // 時角
  const lat = d.latitudeDeg * DEG; // 緯度

  // ENU（東/北/上、太陽向き）
  const east = -Math.cos(decl) * Math.sin(H);
  const north = Math.sin(decl) * Math.cos(lat) - Math.cos(decl) * Math.cos(H) * Math.sin(lat);
  const up = Math.sin(decl) * Math.sin(lat) + Math.cos(decl) * Math.cos(H) * Math.cos(lat);

  // シーン座標（+Y=上, 北=-Z, 東=+X）へ変換。
  const v = new THREE.Vector3(east, up, -north);
  v.applyAxisAngle(new THREE.Vector3(0, 1, 0), d.northOffsetDeg * DEG);
  v.normalize();

  const altitudeDeg = (Math.asin(Math.min(1, Math.max(-1, up))) * 180) / Math.PI;
  return { dir: v, altitudeDeg };
};
