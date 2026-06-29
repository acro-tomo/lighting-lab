import { fixtureModelMap, type FixtureModel } from "./fixtureCatalog";

const FIXTURE_PREFIX = "fixture:";

export const fixtureAddKind = (modelId: string) => `${FIXTURE_PREFIX}${modelId}`;

export const fixtureModelIdFromAddKind = (kind: string | null): string | null =>
  kind?.startsWith(FIXTURE_PREFIX) ? kind.slice(FIXTURE_PREFIX.length) : null;

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
