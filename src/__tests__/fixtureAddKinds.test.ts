import { describe, expect, it } from "vitest";
import {
  fixtureAddKind,
  fixtureModelFromAddKind,
  fixtureModelIdFromAddKind,
  iesAssetIdFromAddKind,
  isCeilingLightAddKind
} from "../data/fixtureAddKinds";

// IES付き kind は「通常の器具 kind と同じ経路を通る」ことが前提の設計なので、
// 接尾辞を足してもモデル解決・天井照明判定が壊れないことを固定する。
describe("fixtureAddKind with IES asset", () => {
  const assetId = "a".repeat(64);
  const kind = fixtureAddKind("dl-diffuse", assetId);

  it("keeps model resolution intact", () => {
    expect(fixtureModelIdFromAddKind(kind)).toBe("dl-diffuse");
    expect(fixtureModelFromAddKind(kind)?.id).toBe("dl-diffuse");
    expect(isCeilingLightAddKind(kind)).toBe(true);
  });

  it("round-trips the asset id", () => {
    expect(iesAssetIdFromAddKind(kind)).toBe(assetId);
    expect(iesAssetIdFromAddKind(fixtureAddKind("dl-diffuse"))).toBeNull();
    expect(iesAssetIdFromAddKind(null)).toBeNull();
  });
});
