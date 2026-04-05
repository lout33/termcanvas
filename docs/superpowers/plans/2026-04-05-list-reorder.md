# List Reorder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add drag-and-drop ordering for canvases and workspace folders without disturbing terminal/session ownership.

**Architecture:** Keep canvas ordering renderer-local by reordering the `canvases` array. Move workspace-folder ordering into `workspace_registry.js` so main, preload, and renderer share one authoritative order while the renderer adds drag/drop UI for both lists.

**Tech Stack:** Electron, plain DOM renderer, Node.js built-in test runner

---

### Task 1: Add failing reorder tests

**Files:**
- Modify: `test/workspace-registry.test.js`
- Modify: `main.js`

- [ ] Add failing workspace-registry coverage for folder reordering.
- [ ] Add failing smoke assertions for canvas and workspace-folder order changes.
- [ ] Run the targeted tests and confirm they fail for the missing feature.

### Task 2: Implement reorder state helpers

**Files:**
- Modify: `workspace_registry.js`
- Modify: `main.js`
- Modify: `preload.js`

- [ ] Add registry-level workspace-folder reorder support.
- [ ] Expose a narrow IPC bridge for workspace-folder reorder.
- [ ] Keep all existing workspace registry flows stable after reordering.

### Task 3: Implement renderer drag-and-drop ordering

**Files:**
- Modify: `renderer.js`
- Modify: `styles.css`

- [ ] Add shared sidebar drag state and DOM wiring for reorderable list items.
- [ ] Reorder canvases locally and workspace folders through the new IPC flow.
- [ ] Add subtle drag and insertion styling.

### Task 4: Verify end to end

**Files:**
- Modify: `renderer.js` (debug helpers only if needed)

- [ ] Run `npm run build`.
- [ ] Run `npm test`.
- [ ] Run `CANVAS_SMOKE_TEST=1 npm run dev`.
