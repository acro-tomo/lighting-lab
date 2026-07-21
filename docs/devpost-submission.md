# Devpost submission draft

Use this as a draft only. Do not submit or publish anything until the project owner confirms every external field.

## Submission fields

| Field | Draft |
| --- | --- |
| Project title | `LDK Lighting Lab` — confirm before entering in Devpost |
| Category | Apps for Your Life |
| Public GitHub repository | `https://github.com/acro-tomo/lighting-lab` |
| Demo URL | Confirm the approved production URL before submission. The expected Pages domain is `https://lighting-lab-46l.pages.dev/`. |
| Demo video asset | `output/demo-video/lighting-lab-openai-build-week-demo.mp4` (2:58, 1080p30, upload to public YouTube only after owner approval) |
| Thumbnail draft | `output/demo-video/lighting-lab-thumbnail.png` (1920 × 1080; warm/white split of the real dining view. 1280 × 720 JPG: `lighting-lab-thumbnail-1280.jpg`) |
| Feedback Session ID | Paste the final `/feedback` Session ID here after it is created: `[SESSION_ID]` |
| License | MIT |

## Tagline

Try lighting in your own floor plan before you build.

## YouTube metadata draft

**Title**

`Lighting Lab — See Your Home's Lighting Before You Build`

**Description**

Choosing home lighting from drawings and catalogs is hard — you can't feel how a room will actually look at night until the house is built.

Lighting Lab is a free browser tool that lets you try lighting in your own floor plan. Import your plan, place fixtures, and walk through your future rooms in 3D.

In this demo:
- Import a floor plan and see it become a 3D room
- Pick a pendant light and place it over the dining table
- Compare warm, neutral, and white light — same room, same furniture
- Adjust brightness for cooking, work, or a quiet evening
- Change how far the light spreads, from a focused pool to the whole counter
- Walk through the living room, dining, and kitchen to check every angle
- Save plans and compare your ideas

Try it: `https://lighting-lab-46l.pages.dev/`

Source: `https://github.com/acro-tomo/lighting-lab`

Built with Codex and GPT-5.6 during OpenAI Build Week.

Note: Lighting Lab is a visual simulator for comparing lighting layouts and atmosphere. It does not guarantee actual illuminance (lux), light distribution, or the finished result.

## Project description

Choosing residential lighting usually happens before construction, when a fixture schedule and a floor plan still make it difficult to imagine how the room will feel. LDK Lighting Lab is a browser-based visual simulator that helps homeowners compare lighting ideas in the context of their own layout.

Start with the built-in LDK sample or import a PNG, JPG, or PDF floor plan. Add lights, windows, furniture, stairs, and double-height zones in a 2D editor; then adjust fixture placement, brightness, color temperature, dimming, and beam distribution. Switch to the 3D view to compare the room in a fast raster editing mode or, on supported hardware, an optional progressive path-traced Finished Look. Save comparison shots and export a PNG when you are ready to discuss an option.

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

Codex with GPT-5.6 was used in the Build Week finalization session to inspect the existing architecture, validate builds and browser behavior, harden the feedback destination, implement the bilingual UI layer, localize sample display data and browser metadata, improve test setup, fix completed path-traced PNG generation, and prepare the public documentation and submission materials.

The core 2D/3D editor and rendering features already existed before this finalization session; they are not represented as newly generated work. See [the development record](build-week-development.md) for a precise breakdown.

## Judge test steps

1. Open the public demo URL and keep the included Demo LDK project.
2. Use **JA / EN** in the header if needed.
3. In 2D, select the **Dining pendant, west** light and compare its **Brightness**, **Color temperature**, and **Beam spread**.
4. Change **Brightness** or choose a different **Color temperature** preset.
5. Switch to **3D** and select **Finished look** if your browser supports it. The Edit view remains fully usable if it does not.
6. Choose **Create finished image** to make a completed render, or save a comparison shot and export a PNG.
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
- [ ] YouTube title, description, thumbnail, and public visibility are owner-approved.
- [ ] `/feedback` Session ID is pasted.
- [ ] Project title, URL, and all copy are owner-approved.
