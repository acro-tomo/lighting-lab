import { fixtureModelMap, type FixtureModel } from "./fixtureCatalog";

const FIXTURE_PREFIX = "fixture:";
const IES_SUFFIX = "?ies=";

/** 追加パレットの「IESから追加」が選ばれたときの kind。実際の取り込みは配置確定前に済ませる。 */
export const IES_IMPORT_ADD_KIND = "ies-import";
/** IES取り込みで追加する器具の土台（配光はIESが決めるので拡散ダウンライトを使う）。 */
export const IES_IMPORT_BASE_MODEL_ID = "dl-diffuse";

// IES付きの kind は fixture:<modelId>?ies=<assetId>。モデル判定は接尾辞を落として行うので、
// ゴーストプレビュー・アイコン・天井/壁の判定は通常の器具とまったく同じ経路を通る。
export const fixtureAddKind = (modelId: string, iesAssetId?: string) =>
  `${FIXTURE_PREFIX}${modelId}${iesAssetId ? `${IES_SUFFIX}${iesAssetId}` : ""}`;

export const fixtureModelIdFromAddKind = (kind: string | null): string | null =>
  kind?.startsWith(FIXTURE_PREFIX) ? kind.slice(FIXTURE_PREFIX.length).split(IES_SUFFIX)[0]! : null;

export const iesAssetIdFromAddKind = (kind: string | null): string | null => {
  const at = kind?.indexOf(IES_SUFFIX) ?? -1;
  return at >= 0 ? kind!.slice(at + IES_SUFFIX.length) : null;
};

export const fixtureModelFromAddKind = (kind: string | null): FixtureModel | null => {
  const id = fixtureModelIdFromAddKind(kind);
  return id ? fixtureModelMap.get(id) ?? null : null;
};

export const isWallLightAddKind = (kind: string | null): boolean => {
  const model = fixtureModelFromAddKind(kind);
  return model?.id === "sp-wall" || model?.baseType === "bracket" || kind === "wallspot";
};

export const isCeilingLightAddKind = (kind: string | null): boolean => {
  const model = fixtureModelFromAddKind(kind);
  if (model) return model.id.startsWith("dl-") || model.baseType === "pendant" || model.baseType === "tape";
  return kind === "downlight" || kind === "pendant" || kind === "linelight";
};

export const isLightAddKind = (kind: string | null): boolean =>
  isWallLightAddKind(kind) || isCeilingLightAddKind(kind);
