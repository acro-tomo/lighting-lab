# Lighting Calibration Report

Date: 2026-06-21

## Scope

No LDK editing features were added in this pass. The work focused on the rendering basis for lighting calibration:

- A closed `Lighting Calibration Room`
- Inward-facing room surfaces for the path tracer
- Fixed calibration materials
- Physical `light.power` based on lm
- Explicit path tracer update calls
- Debug views for material roles, normals, and front/back checks

## Phase 0 Investigation

1. Materials used by the previous path trace scene:
   - Walls, floor, ceiling, furniture: mostly `MeshStandardMaterial`
   - Windows: `MeshPhysicalMaterial`
   - Openings/debug-only objects could use dark/basic visual material in the realtime scene, but the path trace scene was generated separately.

2. Unsupported material check:
   - No `ShaderMaterial` was used in the path trace scene.
   - The realtime scene uses `MeshBasicMaterial` for selection/visual overlays, but the path trace scene now uses only Standard/Physical materials for renderable calibration geometry.

3. Wall/floor/ceiling normals:
   - Previous path trace walls and ceilings were generated as boxes. That made the actual interior receiving surface ambiguous and introduced unnecessary dark side surfaces.
   - The path trace room shell now uses one-sided planes with normals aimed into the room.

4. Camera visibility:
   - The first calibration camera was outside the closed room, so the preview looked black. It was moved inside the room.

5. Path tracer registration:
   - Floor, walls, ceiling, furniture, and lights are explicitly added to the generated path trace scene.
   - The console logs `[lighting-calibration] path trace scene` with mesh/light counts.

6. Geometry changes:
   - `applyPathTracerSceneUpdate()` always starts geometry changes with `pathTracer.setSceneAsync(scene, camera)`.

7. Light changes:
   - `applyPathTracerSceneUpdate()` explicitly calls `pathTracer.updateLights()` and `pathTracer.reset()`.

8. Material changes:
   - `applyPathTracerSceneUpdate()` explicitly calls `pathTracer.updateMaterials()` and `pathTracer.reset()`.

9. Environment changes:
   - `applyPathTracerSceneUpdate()` explicitly calls `pathTracer.updateEnvironment()` and `pathTracer.reset()`.

10. Multiple Importance Sampling:
   - `pathTracer.multipleImportanceSampling = true` is now set explicitly.

11. SpotLight/PointLight with MIS:
   - Calibration lights use Three.js lights with `power` in lm and MIS enabled.
   - No AmbientLight/HemisphereLight is added to the path trace scene.

12. SpotLight target:
   - Spot target is added to the scene and `target.updateMatrixWorld(true)` is called after positioning.

13. Color space/tone mapping/exposure:
   - The offscreen path trace renderer uses `SRGBColorSpace` and `ACESFilmicToneMapping`.
   - Exposure is inherited from the selected camera view and kept around `1.1`, not pushed to extreme values.

14. API usage:
   - The implementation uses `WebGLPathTracer`, not the old direct `PathTracingRenderer` API.

## Cause Classification

Primary causes:

- Geometry: the path trace shell used box geometry instead of explicit inward-facing room planes.
- Light model: lm was converted through a visual intensity coefficient and then multiplied again in the path trace scene.
- Renderer separation: realtime preview used helper lights while path trace used a different scene, so preview brightness did not prove path trace correctness.

Secondary cause:

- Update safety: update calls were implicit in one-shot rendering. They are now centralized and logged.

Not the main cause:

- MIS: available by default in the library, now explicitly enabled.
- Exposure: keeping exposure around `1.1` is enough once geometry and light power are fixed.
- Color space: no evidence of double tone mapping as the primary blackness cause.

## Screenshots

- Before: `output/playwright/before-lighting-calibration.png`
- Calibration realtime preview: `output/playwright/after-calibration-preview.png`
- Calibration path trace fast check: `output/playwright/after-calibration-pathtrace-fast.png`
- Material diagnostic: `output/playwright/after-calibration-material-diagnostic.png`
- Normal diagnostic: `output/playwright/after-calibration-normal-diagnostic.png`

## Current Acceptance Status

Passed:

- Calibration room can be shown in realtime preview.
- Calibration room can be path traced.
- White wall, floor, table, cabinet, and light positions no longer collapse into a black image.
- Pendant and wall spot are built from physical `power` values in lm.
- Spot target is added and updated.
- Path trace result is displayed separately from the realtime preview.
- Material diagnostic and normal diagnostic screenshots exist.
- Project changes clear stale path trace output.

Partially passed:

- Fast check is visually usable but still slow in this environment.
  - 32 samples before optimization: about `58.6s`.
  - 16 samples after optimization: about `52.9s`.
  - This does not meet the "few seconds" target.

Not fully verified in automated screenshots yet:

- 128 sample final check, because it is expected to be much slower than the 16 sample run.
- Spot target movement and OFF state in path trace.
- Material edit propagation in path trace beyond the centralized update implementation.

## Next Required Work Before New LDK Features

- Reduce path trace startup/sample cost or add a lower-cost preview path for fast check.
- Capture final 128 sample calibration render once performance is acceptable.
- Verify pendant 500lm vs 1000lm and spot OFF/target movement with path trace screenshots.
- Only after those checks, continue applying the same basis to broader LDK scenarios.
