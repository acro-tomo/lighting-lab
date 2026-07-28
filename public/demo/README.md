# Share Demo Assets

These demo assets are original sample materials for LDK Lighting Lab.

- `dimensioned-ldk-demo-plan.svg`: original fictional dimensioned LDK plan (source of truth for edits).
- `dimensioned-ldk-demo-plan.png`: 2400x1800 rasterized version of the plan. The project JSON embeds this PNG because an SVG background is re-rasterized by WebKit on every pinch/pan frame, which freezes touch gestures on mobile.
- `share-demo-project.json`: importable LDK Lighting Lab project using the PNG plan as the calibrated 2D background.
- `rooms/*.json`: room variations opened with `?demo=<key>`. See [rooms/README.md](rooms/README.md) for the concepts and the key list.

## `?demo=` query

| URL | Opens |
|---|---|
| `?demo=1` | `share-demo-project.json` (the share link demo) |
| `?demo=2` | the bundled default project |
| `?demo=machiya` / `hiraya` / `skipfloor` / `copenhagen` / `mediterranean` / `loft` | `rooms/*.json` |

Keys are declared in [`src/data/demoRooms.ts`](../../src/data/demoRooms.ts). The JSON is fetched at
load time, so adding a room does not grow the bundle. The query is removed from the URL after loading,
and an existing autosave is confirmed before it gets overwritten.

Copyright note: the floor plan is generated for this repository and is not copied from a real listing, builder catalog, or architectural drawing. The room variations are original designs based on architectural typologies, not traced from real houses.
