import { describe, expect, it } from "vitest";
import { demoProject } from "../data/demoProject";
import { projectSchema } from "../schema/projectSchema";
import type { Project } from "../types";

const baseProject = () => JSON.parse(JSON.stringify(demoProject)) as Project;

describe("プロジェクトJSONの後方互換", () => {
  it("ies を持たない旧JSONをそのまま読み込める", () => {
    const legacy = baseProject();
    for (const light of legacy.lights) delete (light as { ies?: unknown }).ies;

    const parsed = projectSchema.parse(legacy) as Project;
    expect(parsed.lights.length).toBe(legacy.lights.length);
    expect(parsed.lights.every((light) => light.ies === undefined)).toBe(true);
  });

  it("ies 参照を保持して読み書きできる", () => {
    const project = baseProject();
    project.lights[0]!.ies = { assetId: "a".repeat(64), fileName: "downlight.ies" };

    const parsed = projectSchema.parse(JSON.parse(JSON.stringify(project))) as Project;
    expect(parsed.lights[0]!.ies).toEqual({ assetId: "a".repeat(64), fileName: "downlight.ies" });
  });

  it("壊れた ies 参照はプロジェクト全体を落とさず、参照なしとして読み込む", () => {
    const project = baseProject();
    (project.lights[0] as { ies?: unknown }).ies = { fileName: "no-asset-id.ies" };

    const parsed = projectSchema.parse(JSON.parse(JSON.stringify(project))) as Project;
    expect(parsed.lights[0]!.ies).toBeUndefined();
    expect(parsed.lights.length).toBe(project.lights.length);
  });

  it("IESがローカルに無くても参照付きJSONの読込は成功する", () => {
    const project = baseProject();
    project.lights[0]!.ies = { assetId: "not-stored-anywhere", fileName: "gone.ies" };
    expect(() => projectSchema.parse(JSON.parse(JSON.stringify(project)))).not.toThrow();
  });
});

describe("書き出したプロジェクトJSONの中身", () => {
  it("assetId と fileName 以外のIESデータを含まない", () => {
    const project = baseProject();
    project.lights[0]!.ies = { assetId: "b".repeat(64), fileName: "spot.ies" };

    // App.tsx の保存と同じ形。
    const json = JSON.stringify({ ...project, name: project.name, compareShots: [] }, null, 2);

    expect(json).toContain("spot.ies");
    expect(json).toContain("b".repeat(64));
    // IES原文・candela配列・DataURL・Blobの痕跡がないこと
    expect(json).not.toMatch(/TILT=/);
    expect(json).not.toMatch(/IESNA/i);
    expect(json).not.toMatch(/data:/);
    expect(json).not.toMatch(/"(source|candela|profile|photometry|distribution)"\s*:/);

    const reparsed = JSON.parse(json) as Project;
    expect(Object.keys(reparsed.lights[0]!.ies!).sort()).toEqual(["assetId", "fileName"]);
  });
});
