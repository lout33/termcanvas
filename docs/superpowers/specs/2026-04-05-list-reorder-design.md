# List Reorder Design

## Goal

Let users reorder canvases and imported workspace folders so the drawer reflects their preferred working order.

## Scope

- drag-and-drop reorder for canvas rows
- drag-and-drop reorder for workspace folder rows
- preserve active canvas and active workspace folder while reordering
- keep workspace folder order stable across refresh, remove, activate, and duplicate import flows

## Approach

- canvas order remains renderer-owned and follows the `canvases` array order
- workspace folder order becomes registry-owned so main/preload/renderer all agree on order
- renderer adds a small shared drag-reorder layer for the two sidebar lists
- visual feedback stays minimal: lifted dragged item plus insertion indicator

## Verification

- reorder canvases and confirm active switching still works
- reorder workspace folders and confirm selection/preview still map to the same folder
- refresh and duplicate-import workspaces without losing custom order
- keep `npm run build`, `npm test`, and `CANVAS_SMOKE_TEST=1 npm run dev` green
