import { fixtureModelMap } from "../data/fixtureCatalog";
import type { LightFixture, Project } from "../types";
import { ceilingMountHeightAt } from "./ceiling";

export const isCeilingMountedFixture = (fixture: Pick<LightFixture, "model" | "type">): boolean => {
  const model = fixture.model ? fixtureModelMap.get(fixture.model) : undefined;
  const modelId = model?.id ?? fixture.model;
  const baseType = model?.baseType ?? fixture.type;
  return (
    (modelId?.startsWith("dl-") ?? false) ||
    baseType === "downlight" ||
    baseType === "pendant" ||
    baseType === "tape"
  );
};

export const normalizeCeilingMountedFixture = (project: Project, fixture: LightFixture): LightFixture => {
  if (!isCeilingMountedFixture(fixture)) return fixture;
  const mountHeightM = ceilingMountHeightAt(
    project,
    { x: fixture.position.x, z: fixture.position.z },
    fixture.floor ?? project.activeFloor ?? 1
  );
  const y = fixture.type === "pendant" ? mountHeightM - (fixture.cordLengthM ?? 0.6) : mountHeightM - 0.04;
  return {
    ...fixture,
    mountHeightM,
    position: { ...fixture.position, y }
  };
};
