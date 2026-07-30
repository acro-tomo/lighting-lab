import { describe, expect, it } from "vitest";
import { ShaderMaterial } from "three";
import { light_sampling_functions } from "three-gpu-pathtracer/src/shader/sampling/light_sampling_functions.glsl.js";
import { IES_2D_SUPPORTED, patchIesSampling } from "../rendering/iesShaderPatch";

// このテストが落ちたら three-gpu-pathtracer 側の実装が変わったということ。
// 差し替えが当たらないと非対称配光は φ=0 断面で描かれるので、気付けるようにする。
describe("IESサンプリングのシェーダ差し替え", () => {
  it("導入済みライブラリに差し替え対象が存在する", () => {
    expect(IES_2D_SUPPORTED).toBe(true);
  });

  it("上流は u/v を引数に取りながら1次元でしか引いていない（差し替えの前提）", () => {
    expect(light_sampling_functions).toContain(
      "getPhotometricAttenuation( sampler2DArray iesProfiles, int iesProfile, vec3 posToLight, vec3 lightDir, vec3 u, vec3 v )"
    );
  });

  it("差し替え後は φ を計算して2次元で引く", () => {
    const material = new ShaderMaterial({ fragmentShader: light_sampling_functions });
    const versionBefore = material.version;
    expect(patchIesSampling(material)).toBe(true);
    expect(material.fragmentShader).toContain("iesPhiNorm");
    expect(material.fragmentShader).toContain("vec3( angle, iesPhiNorm, iesProfile )");
    expect(material.fragmentShader).not.toContain("vec3( angle, 0.0, iesProfile )");
    // needsUpdate は書き込み専用（読むと undefined）なので version で再コンパイル要求を見る。
    expect(material.version).toBeGreaterThan(versionBefore);
  });

  it("差し替え済みマテリアルを再度渡しても壊さない", () => {
    const material = new ShaderMaterial({ fragmentShader: light_sampling_functions });
    patchIesSampling(material);
    const once = material.fragmentShader;
    expect(patchIesSampling(material)).toBe(true);
    expect(material.fragmentShader).toBe(once);
  });

  it("対象が見つからないシェーダには何もしない", () => {
    const material = new ShaderMaterial({ fragmentShader: "void main() {}" });
    expect(patchIesSampling(material)).toBe(false);
  });
});
