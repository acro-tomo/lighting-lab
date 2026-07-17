# OpenAI Build Week development record

This record distinguishes pre-existing product functionality from work completed in the Build Week finalization session. It is intentionally factual and does not claim that Codex built features that already existed.

## Scope

- App: LDK Lighting Lab
- Category: Apps for Your Life
- Working branch: `build-week-final`
- Assistant used in this session: Codex with GPT-5.6

## Existing functionality reviewed

Before implementation, Codex reviewed the existing browser app, including its 2D floor-plan editor, fixture and furniture placement, raster 3D preview, optional live path tracing, final path-traced render, comparison shots, PNG/JSON export, IndexedDB autosave, PDF import, and experimental illuminance heatmap.

These features existed before this Build Week finalization session. Codex did not replace the rendering engine or claim them as newly implemented work.

## Work completed in this session

### Security and feedback handling

- Reviewed public-repository exposure risks without printing secrets.
- Changed the Cloudflare Pages feedback Function so it requires both `GITHUB_TOKEN` and `GITHUB_REPO` secrets. It no longer falls back to a source-repository destination.
- Documented the private feedback-only GitHub repository setup in `docs/feedback-setup.md`.

### Bilingual product experience

- Added a small typed Japanese/English in-app dictionary with no new i18n dependency.
- Added a visible JA/EN language control. It defaults from browser language, persists the user's choice in local storage, and updates the document language.
- Localized navigation, add menus, 2D controls, inspectors, scale calibration, feedback, notices, confirmation prompts, render progress, heatmap UI, and mobile controls.
- Localized display-only sample names and material names without changing saved project JSON values.
- Localized the page title and browser description after language selection; public HTML metadata now starts in English for the English-first Build Week audience.

### Documentation and licensing

- Added the MIT `LICENSE` with `Copyright (c) 2026 Tomoharu Hoshi`.
- Added `"license": "MIT"` to `package.json` while preserving `"private": true`.
- Prepared English `README.md` and retained Japanese `README.ja.md`, with language links and matching run/test guidance.
- Added this development record, Devpost copy, and a video script as submission-preparation materials.

### Test reliability

- Updated browser checks to use `domcontentloaded` plus explicit canvas checks instead of `networkidle`, because the app keeps rendering/worker activity alive.
- Pinned the existing Japanese-label regression checks to a Japanese Playwright locale.
- Aligned Japanese README runtime-check commands with the preview server port used by English README and CI.

## Technical decisions supported by GPT-5.6

- **Keep the existing renderer architecture.** The raster editor remains the dependable baseline; live path tracing is optional and hardware-dependent. Replacing either renderer near the deadline would create disproportionate regression risk.
- **Use a local dictionary rather than an i18n package.** The application has two supported languages and a finite UI surface. A typed dictionary preserves control over existing Japanese copy and avoids an unnecessary dependency.
- **Translate at display time for sample data.** Fixture, furniture, wall, and material names are saved user data. Display translation preserves JSON compatibility and Japanese names when the user switches back.
- **Do not describe the visual simulation as guaranteed photometry.** The illuminance heatmap and rendered brightness remain clearly labelled as reference/visual comparison only.

## Validation performed

| Check | Result | Notes |
| --- | --- | --- |
| `npm run typecheck` | Passed | Re-run after the final localization commits. |
| `npm run build` | Passed | Vite reports an existing large-chunk warning; no build failure. |
| Desktop English UI | Passed | Language switch, sample labels, add menu, light inspector, renderer controls, and page title verified in a real browser. |
| Mobile English UI | Passed | Verified at 390 × 844: menu, edit actions, settings sheet, material selector, lighting controls, and autosave text. |
| Mobile Japanese return path | Passed | Verified switching back to Japanese. |
| Language persistence | Passed | English selection persisted after reload. |
| `npm run visual-check` | Not completed locally | The local Playwright Headless Shell freezes during WebGL/3D initialization on this Mac. The app itself was verified through a headed browser. |
| `npm run exploratory-check` | Not completed locally | Same local Headless Shell limitation. CI remains the intended Linux + Xvfb runtime-check environment. |

The local Headless Shell limitation must not be reported as a passing automated test. Run the CI workflow or the checks on a compatible machine before final submission.

## Human decisions and confirmations required

- Confirm the final public deployment URL points at the approved branch.
- Confirm Cloudflare Production and Preview secrets are both present for the feedback Function.
- Confirm the Devpost project title, thumbnail, video upload, and final submission.
- Obtain and paste the `/feedback` Session ID into the submission form.
- Review the final demo video narration before publication.

## Explicitly deferred

- Certified illuminance calculations, DIALux-equivalent workflows, IES/LDT catalogs, and manufacturer fixture databases.
- Automatic floor-plan recognition or PDF vectorization.
- A renderer rewrite, authentication, billing, or a backend redesign.

