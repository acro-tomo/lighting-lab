---
name: code-quality
description: General code-quality rules for this project — naming, error handling, defensive code, comments, dead code, and tests. Use when reviewing or writing code. Project invariants in CLAUDE.md override these where they conflict.
user-invocable: false
---

# Code quality baseline

## Change discipline

- Smallest viable change. No drive-by refactors mixed into a feature change.
- If you change a function signature or a shared type, update every call site (and `projectSchema.ts` if a project-data shape changed) in the same change.
- Don't add features, helpers, abstractions, error handling, fallbacks, or validation for scenarios that can't happen.

## Trust internal code

Only validate at system boundaries:
- User input (2D editor interactions, property fields)
- Loaded project JSON (validated by Zod in `projectSchema.ts`)
- Imported background files (PNG/JPG/PDF)
- WebGL2 / GPU capability checks before path tracing

Don't pepper internal call sites with null checks or "defensive" guards. Internal contracts are part of the design; if you don't trust them, fix the contract.

## Naming

- Match the existing convention in the file (this project is TypeScript + camelCase).
- Booleans answer a yes/no: `isOpen`, `hasError`, `shouldRetry`. Not `flagA`.
- Don't encode types in names (`strName`, `intCount`).

## Comments

- Default: no comments on code you write.
- Add one only when the WHY is non-obvious: a hidden constraint enforced upstream, a workaround for an external (Three.js / pathtracer) quirk, a performance-critical micro-optimization, or a subtle invariant a reader would break.
- Never explain what the code already says. Never reference the current task ("added for X").
- One short line is enough. Don't write multi-paragraph docstrings.
- Don't add docstrings, comments, or type annotations to code you didn't change.

## Error handling

- Errors at boundaries: convert to a meaningful result for the caller; surface to the UI if the user needs to act (e.g. WebGL2 unsupported, PDF parse failure).
- Errors inside business logic: let them propagate unless the caller has a recovery strategy.
- Never `catch {}` (swallow silently). If you genuinely want to ignore, leave a one-line comment explaining why.

## Dead code

- Don't keep commented-out code. Git remembers.
- Don't keep `TODO` markers older than the current change.
- Don't keep `console.log` after debugging.

## Tests

- This project verifies via `npm run typecheck`, `npm run build`, and `npm run visual-check` (Playwright screenshot + non-empty 3D canvas) rather than unit tests.
- New behavior should be visually confirmed (delegate to `visual-verify`) or the absence of confirmation explicitly noted.

## React / Three.js specifics

- Respect react-three-fiber idioms already in `Scene3D.tsx`; don't introduce a second rendering pattern.
- Keep non-physical helpers (補助光/霧/接地影/選択枠) gated so they are disabled in the resident path-traced "リアル" mode.
- Memoize heavy geometry/material creation; don't recreate Three.js objects every render.
