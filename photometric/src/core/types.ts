/**
 * ドメインデータモデル。
 *
 * 単位規約（アーキテクチャ原則）:
 * - 長さ・座標は常にメートル [m]
 * - lm（光束）= 器具の入力値（カタログ値をそのまま保持）
 * - cd（光度）= 配光。IESまたはビーム角近似から方向別に算出
 * - lx（照度）= 計算結果。受照点ごとに算出
 * これらを型レベルで区別し、混用をコードレビューで検出可能にする。
 */

export type Meters = number;
export type Lumens = number;
export type Candelas = number;
export type Lux = number;
export type Kelvin = number;
export type Degrees = number;

/** 平面図座標 [m]。x: 右(東)、y: 上(北)。3D空間では x→X, y→Z(反転なし), 高さ→Y */
export interface Vec2 {
  x: Meters;
  y: Meters;
}

export interface Vec3 {
  x: Meters;
  y: Meters;
  z: Meters;
}

/** 2D間取り: 多角形＋天井高。壁・床・天井はここから自動生成する */
export interface FloorPlan {
  /** 外周多角形（反時計回り）[m] */
  outline: Vec2[];
  /** 基準天井高 [m] */
  ceilingHeight: Meters;
  /** 吹抜け等、部分的に天井高が異なる領域 */
  ceilingOverrides: CeilingOverride[];
}

export interface CeilingOverride {
  polygon: Vec2[];
  height: Meters;
}

/**
 * マテリアル。壁・床・天井の拡散反射率が照度精度に最も影響する。
 * baseColor は sRGB 入力。反射率として使う際は必ず linear へ変換する（materials.ts）。
 */
export interface MaterialParams {
  /** sRGB 0..1 */
  baseColor: [number, number, number];
  /**
   * 拡散反射率 ρ (0..1)。指定時はこちらが優先。
   * 未指定時は baseColor を linear 変換した輝度から導出する。
   */
  reflectance?: number;
  roughness: number;
  metallic: number;
  emissiveIntensity?: number;
  opacity?: number;
  transmission?: number;
  doubleSided?: boolean;
}

/**
 * 簡略家具（直方体ベース）。
 * 遮蔽判定用の簡略形状（この直方体）と表示用メッシュは分離する。
 * Phase 1 では表示も同じ直方体だが、表示メッシュを差し替えても
 * 遮蔽判定はこの寸法定義を使い続ける。
 */
export interface Furniture {
  id: string;
  name: string;
  /** 平面上の中心位置 [m] */
  position: Vec2;
  rotationDeg: Degrees;
  /** 底面の床からの高さ [m]（TVボード上のTVなどに使用） */
  elevation: Meters;
  /** 幅(x)・奥行(y)・高さ(h) [m] */
  size: { w: Meters; d: Meters; h: Meters };
  material: MaterialParams;
}

/**
 * 器具プリセット（JSONで供給）。
 * dataSource='representative' は代表値サンプル（実測カタログ値未確認）を意味し、
 * UI上で区別して表示する。
 */
export interface FixturePreset {
  /** 品番 */
  model: string;
  maker: string;
  kind: 'downlight' | 'spot';
  /** ビーム角（全角）[deg]。IESなし時のフォールバック配光に使用 */
  beamAngleDeg: Degrees;
  /** 全光束 [lm]（カタログ値） */
  flux: Lumens;
  /** 色温度 [K] */
  cct: Kelvin;
  dimmable: boolean;
  /** 埋込穴径 [m] */
  cutoutDiameter: Meters;
  /** IESファイル参照（任意）。無い器具は「推定配光」としてUIに明示する */
  ies?: string;
  /**
   * 発光面寸法（直径）[m]。ソフトシャドウ用。
   * IESデータには含まれないため独立した必須データとして保持する。
   */
  apertureDiameter: Meters;
  dataSource: 'catalog' | 'representative';
}

/** 配置された光源。位置・方向・調光率はユーザー編集対象 */
export interface Luminaire {
  id: string;
  preset: FixturePreset;
  /** 平面位置 [m] */
  position: Vec2;
  /** 発光面の床からの高さ [m]（ダウンライトなら天井面） */
  mountHeight: Meters;
  /** 光軸方向。tilt=0 が真下。pan は平面上の回転 */
  aim: { tiltDeg: Degrees; panDeg: Degrees };
  /** 調光率 0..1 */
  dimming: number;
}

export interface SceneModel {
  floorPlan: FloorPlan;
  furniture: Furniture[];
  luminaires: Luminaire[];
  surfaces: {
    floor: MaterialParams;
    wall: MaterialParams;
    ceiling: MaterialParams;
  };
}
