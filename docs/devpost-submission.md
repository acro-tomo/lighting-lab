# Devpost submission draft

Use this as a draft only. Do not submit or publish anything until the project owner confirms every external field.

## Submission fields

| Field | Draft |
| --- | --- |
| Project title | `LDK Lighting Lab` — confirm before entering in Devpost |
| Category | Apps for Your Life |
| Public GitHub repository | `https://github.com/acro-tomo/lighting-lab` |
| Demo URL | Confirm the approved production URL before submission. The expected Pages domain is `https://lighting-lab-46l.pages.dev/`. |
| Feedback Session ID | Paste the final `/feedback` Session ID here after it is created: `[SESSION_ID]` |
| License | MIT |

## Tagline

Compare home lighting layouts and nighttime atmosphere in your own floor plan before construction.

## Project description

Choosing residential lighting usually happens before construction, when a fixture schedule and a floor plan still make it difficult to imagine what a room will feel like at night. LDK Lighting Lab is a browser-based visual simulator that helps homeowners compare lighting ideas in the context of their own layout.

Start with the built-in LDK sample or import a PNG, JPG, or PDF floor plan. Add lights, windows, furniture, stairs, and double-height zones in a 2D editor; then adjust fixture placement, brightness, color temperature, dimming, and beam distribution. Switch to the 3D view to compare the scene in a fast raster editing mode or, on supported hardware, an optional progressive path-traced realistic mode. Save comparison shots and export a PNG when you are ready to discuss an option.

LDK Lighting Lab is deliberately not a replacement for DIALux, certified illuminance calculations, or construction documentation. It makes the earlier homeowner decision easier: compare the visual character of possible lighting layouts before the cost of changing them becomes high.

## What makes it useful

- Works without an account and keeps projects in the browser by default.
- Gives non-specialists a short path from a floor plan to a lighting comparison.
- Keeps fast raster editing available even when path tracing is slow or unsupported.
- Separates visual atmosphere comparison from guaranteed lux or compliance claims.
- Supports both Japanese and English so the same demo is usable locally and by English-speaking judges.

## Technology

- React, TypeScript, Vite
- Three.js, React Three Fiber, React Drei
- `three-gpu-pathtracer` for optional live and final path-traced views
- Zustand project state, IndexedDB autosave, JSON import/export
- PDF.js for first-page PDF floor-plan import
- Cloudflare Pages and a Pages Function for optional private feedback handling

## How Codex and GPT-5.6 were used

Codex with GPT-5.6 was used in the Build Week finalization session to inspect the existing architecture, validate builds and browser behavior, harden the feedback destination, implement the bilingual UI layer, localize sample display data and browser metadata, improve test setup, and prepare the public documentation and submission materials.

The core 2D/3D editor and rendering features already existed before this finalization session; they are not represented as newly generated work. See [the development record](build-week-development.md) for a precise breakdown.

## Judge test steps

1. Open the public demo URL and keep the included Demo LDK project.
2. Use **JA / EN** in the header if needed.
3. In 2D, select a light such as **Living-room downlight 1**.
4. Change **Brightness** or choose a different **Color temperature** preset.
5. Switch to **3D** and select **Realistic** if your browser supports it. The Edit view remains fully usable if it does not.
6. Open **Export / Render**, save a comparison shot, then use **Export PNG**.
7. Optional: use **+ Add** to add another fixture, then place it on the 2D plan.

## Limitations to disclose

- This is a visual comparison simulator, not a certified photometric or compliance tool.
- No manufacturer-specific fixture data or validated IES/LDT distributions are included.
- Live and final path tracing require WebGL2 and depend on GPU performance.
- PDF import rasterizes the first page; it does not automatically recognize walls.

## Submission checklist

- [ ] Production demo is deployed from the approved commit.
- [ ] Demo works on desktop and a phone.
- [ ] Production and Preview feedback secrets are confirmed.
- [ ] Screenshot/thumbnail is replaced with a real product image.
- [ ] Public YouTube video under 3 minutes is uploaded.
- [ ] `/feedback` Session ID is pasted.
- [ ] Project title, URL, and all copy are owner-approved.

