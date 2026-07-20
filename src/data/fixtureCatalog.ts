import type { LightFixture, LightType } from "../types";

// 実機相当の照明器具カタログ。半影やビーム角はユーザーに調整させず、
// 器具モデルごとに固定する（Panasonic等のダウンライト/グレアレス/ユニバーサルを想定した代表値）。
export type FixtureModel = {
  id: string;
  label: string;
  baseType: LightType;
  beamAngleDeg: number;
  penumbra: number;
  /** 照射方向を変更できる器具か（ユニバーサル/壁付スポット）。 */
  aimable: boolean;
  /** グレアレス（深枠で眩しさを抑えた）器具か。 */
  glareless: boolean;
  /** カタログ標準の光束(lm)。 */
  defaultLumens: number;
  /** モデル選択時に適用する標準色温度。未指定なら現在値を維持する。 */
  defaultColorTemperatureK?: number;
  description: string;
};

export const fixtureCatalog: FixtureModel[] = [
  {
    id: "dl-diffuse",
    label: "拡散ダウンライト",
    baseType: "downlight",
    beamAngleDeg: 110,
    penumbra: 0.95,
    aimable: false,
    glareless: false,
    defaultLumens: 680,
    description: "広角でやわらかく全体を照らす標準ダウンライト"
  },
  {
    id: "dl-medium",
    label: "中角ダウンライト",
    baseType: "downlight",
    beamAngleDeg: 60,
    penumbra: 0.6,
    aimable: false,
    glareless: false,
    defaultLumens: 620,
    description: "一般的な配光のダウンライト"
  },
  {
    id: "dl-narrow",
    label: "集光ダウンライト",
    baseType: "downlight",
    beamAngleDeg: 34,
    penumbra: 0.4,
    aimable: false,
    glareless: false,
    defaultLumens: 560,
    description: "床や対象を絞って照らす集光タイプ"
  },
  {
    id: "dl-glareless",
    label: "グレアレスダウンライト",
    baseType: "downlight",
    beamAngleDeg: 52,
    penumbra: 0.7,
    aimable: false,
    glareless: true,
    defaultLumens: 560,
    description: "深枠で眩しさを抑えた上質な配光"
  },
  {
    id: "dl-universal",
    label: "ユニバーサルダウンライト",
    baseType: "spotlight",
    beamAngleDeg: 40,
    penumbra: 0.5,
    aimable: true,
    glareless: true,
    defaultLumens: 640,
    description: "首振りで照射方向を変えられるダウンライト"
  },
  {
    id: "sp-wall",
    label: "壁付スポット",
    baseType: "spotlight",
    beamAngleDeg: 36,
    penumbra: 0.45,
    aimable: true,
    glareless: false,
    defaultLumens: 600,
    description: "壁面に取り付け、向きを変えられるスポット"
  },
  {
    id: "pendant",
    label: "ペンダント",
    baseType: "pendant",
    beamAngleDeg: 90,
    penumbra: 0.8,
    aimable: false,
    glareless: false,
    defaultLumens: 800,
    description: "ダイニング等に吊るす全方向光"
  },
  {
    id: "pendant-globe",
    label: "乳白ガラスグローブ",
    baseType: "pendant",
    beamAngleDeg: 180,
    penumbra: 1,
    aimable: false,
    glareless: false,
    defaultLumens: 320,
    defaultColorTemperatureK: 2700,
    description: "薄い琥珀色の乳白ガラスがやわらかく光る小型ペンダント"
  },
  {
    id: "bracket",
    label: "ブラケット",
    baseType: "bracket",
    beamAngleDeg: 120,
    penumbra: 0.85,
    aimable: false,
    glareless: false,
    defaultLumens: 360,
    description: "壁付の補助・アクセント照明"
  },
  {
    id: "tape",
    label: "テープライト(間接)",
    baseType: "tape",
    beamAngleDeg: 120,
    penumbra: 0.9,
    aimable: false,
    glareless: false,
    defaultLumens: 420,
    description: "棚下・壁裏の間接照明"
  }
];

export const fixtureModelMap = new Map(fixtureCatalog.map((model) => [model.id, model]));

export const getFixtureModel = (fixture: Pick<LightFixture, "model" | "type">): FixtureModel =>
  (fixture.model ? fixtureModelMap.get(fixture.model) : undefined) ??
  fixtureCatalog.find((model) => model.baseType === fixture.type) ??
  fixtureCatalog[1];

export const isAimable = (fixture: Pick<LightFixture, "model" | "type">) => getFixtureModel(fixture).aimable;

// 器具モデルを適用したときに上書きするフィールド。
export const applyFixtureModel = (model: FixtureModel): Partial<LightFixture> => ({
  model: model.id,
  type: model.baseType,
  beamAngleDeg: model.beamAngleDeg,
  penumbra: model.penumbra,
  ...(model.defaultColorTemperatureK ? { colorTemperatureK: model.defaultColorTemperatureK } : {})
});
