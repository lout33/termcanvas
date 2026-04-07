# Top Canvas Strip Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the sidebar-first canvas switcher with a centered one-row top strip that keeps canvas switching fast even when a terminal is maximized.

**Architecture:** Reuse `renderer_canvas_switcher.js` as the pure helper that derives stable canvas items and overflow button state, then move the existing canvas-management menu into the top bar while rendering a new fast-switch strip inside `renderer.js`. Keep maximize scoped to board content only, so the new top navigator remains visible while per-canvas `isMaximized` state continues to come from the existing session model.

**Tech Stack:** Electron, plain DOM renderer, existing smoke-test harness in `main.js`, Node.js built-in test runner, existing browser-safe helper module pattern

---

## File Structure

- `renderer_canvas_switcher.js`
Purpose: derive the ordered top-strip item view model and pure overflow-control state from plain canvas/session data.

- `test/renderer-canvas-switcher.test.js`
Purpose: verify the helper now preserves stable canvas order, marks the active item correctly, and reports overflow affordances without depending on DOM APIs.

- `test/renderer-browser-helpers.test.js`
Purpose: keep the browser-safe global export check honest after adding one more helper export.

- `index.html`
Purpose: move primary canvas navigation into a top bar inside `workspace-shell` and relocate the existing canvas-management menu trigger into that bar.

- `styles.css`
Purpose: style the single-row top strip, chevron controls, top-bar actions, and board layout so the navigator stays visible during maximize mode.

- `renderer.js`
Purpose: render the top strip, manage overflow controls and the top-bar management menu, keep the active canvas visible in the strip, and expose new debug snapshot fields for smoke coverage.

- `main.js`
Purpose: replace sidebar-switcher smoke assertions with top-strip assertions, including maximize-safe switching between canvases.

## Task 1: Update the pure switcher helper for a stable top strip

**Files:**
- Modify: `test/renderer-canvas-switcher.test.js`
- Modify: `test/renderer-browser-helpers.test.js`
- Modify: `renderer_canvas_switcher.js`

- [ ] **Step 1: Rewrite the helper tests around stable strip order and overflow state**

```js
const test = require("node:test");
const assert = require("node:assert/strict");

const {
  deriveCanvasSwitcherViewModel,
  deriveCanvasStripOverflowState
} = require("../renderer_canvas_switcher.js");

test("deriveCanvasSwitcherViewModel preserves canvas order for the top strip", () => {
  const viewModel = deriveCanvasSwitcherViewModel({
    canvases: [
      { id: "canvas-a", name: "Alpha", nodes: [] },
      { id: "canvas-b", name: "Beta", nodes: [{ id: "terminal-1" }] },
      { id: "canvas-c", name: "Gamma", nodes: [] }
    ],
    activeCanvasId: "canvas-b",
    activeCanvasRenameId: null,
    isExpanded: false
  });

  assert.equal(viewModel.strip.label, "Canvas navigator");
  assert.deepEqual(viewModel.strip.items.map((item) => item.id), ["canvas-a", "canvas-b", "canvas-c"]);
  assert.deepEqual(viewModel.strip.items.map((item) => item.isActive), [false, true, false]);
  assert.equal(viewModel.menu.label, "Manage canvases");
});

test("deriveCanvasStripOverflowState reports when the strip can scroll in either direction", () => {
  assert.deepEqual(
    deriveCanvasStripOverflowState({ scrollLeft: 0, clientWidth: 320, scrollWidth: 320 }),
    { hasOverflow: false, canScrollBackward: false, canScrollForward: false }
  );

  assert.deepEqual(
    deriveCanvasStripOverflowState({ scrollLeft: 0, clientWidth: 320, scrollWidth: 640 }),
    { hasOverflow: true, canScrollBackward: false, canScrollForward: true }
  );

  assert.deepEqual(
    deriveCanvasStripOverflowState({ scrollLeft: 160, clientWidth: 320, scrollWidth: 640 }),
    { hasOverflow: true, canScrollBackward: true, canScrollForward: true }
  );
});
```

- [ ] **Step 2: Update the browser-helper export test to cover the new pure overflow helper**

```js
test("renderer helper modules expose browser-safe globals without require", () => {
  const switcherWindow = runHelperInBrowserContext("renderer_canvas_switcher.js");

  assert.equal(typeof switcherWindow.noteCanvasRendererCanvasSwitcher?.deriveCanvasSwitcherViewModel, "function");
  assert.equal(typeof switcherWindow.noteCanvasRendererCanvasSwitcher?.deriveCanvasStripOverflowState, "function");
});
```

- [ ] **Step 3: Run the targeted helper tests to verify they fail**

Run: `node --test test/renderer-canvas-switcher.test.js test/renderer-browser-helpers.test.js`
Expected: FAIL because `renderer_canvas_switcher.js` still returns the old dropdown-oriented trigger/list shape and does not export `deriveCanvasStripOverflowState()`.

- [ ] **Step 4: Replace the dropdown-first helper shape with a strip-plus-menu view model**

```js
function deriveCanvasSwitcherViewModel({ canvases, activeCanvasId, activeCanvasRenameId, isExpanded }) {
  const normalizedCanvases = Array.isArray(canvases) ? canvases : [];
  const activeCanvas = normalizedCanvases.find((canvasRecord) => canvasRecord?.id === activeCanvasId)
    ?? normalizedCanvases[0]
    ?? null;
  const items = normalizedCanvases.map((canvasRecord) => {
    return normalizeCanvasForSwitcher(
      canvasRecord,
      activeCanvas?.id ?? null,
      activeCanvasRenameId,
      normalizedCanvases.length > 1
    );
  });

  return {
    strip: {
      label: "Canvas navigator",
      activeCanvasId: activeCanvas?.id ?? null,
      items
    },
    menu: {
      label: "Manage canvases",
      isExpanded: isExpanded === true,
      items
    }
  };
}
```

- [ ] **Step 5: Add a pure overflow-state helper instead of scattering scroll affordance math through the renderer**

```js
const STRIP_OVERFLOW_EPSILON = 1;

function deriveCanvasStripOverflowState({ scrollLeft, clientWidth, scrollWidth }) {
  const safeScrollLeft = Number.isFinite(scrollLeft) ? Math.max(0, scrollLeft) : 0;
  const safeClientWidth = Number.isFinite(clientWidth) ? Math.max(0, clientWidth) : 0;
  const safeScrollWidth = Number.isFinite(scrollWidth) ? Math.max(0, scrollWidth) : 0;
  const hasOverflow = safeScrollWidth > safeClientWidth + STRIP_OVERFLOW_EPSILON;

  return {
    hasOverflow,
    canScrollBackward: hasOverflow && safeScrollLeft > STRIP_OVERFLOW_EPSILON,
    canScrollForward: hasOverflow && (safeScrollLeft + safeClientWidth) < (safeScrollWidth - STRIP_OVERFLOW_EPSILON)
  };
}

return {
  deriveCanvasSwitcherViewModel,
  deriveCanvasStripOverflowState
};
```

- [ ] **Step 6: Re-run the helper tests to verify they pass**

Run: `node --test test/renderer-canvas-switcher.test.js test/renderer-browser-helpers.test.js`
Expected: PASS with the strip order preserved and overflow state covered without DOM APIs.

- [ ] **Step 7: Commit the helper-first refactor**

```bash
git add test/renderer-canvas-switcher.test.js test/renderer-browser-helpers.test.js renderer_canvas_switcher.js
git commit -m "test: cover top canvas strip state"
```

## Task 2: Move primary canvas navigation into a top bar

**Files:**
- Modify: `index.html`
- Modify: `styles.css`
- Modify: `renderer.js`

- [ ] **Step 1: Replace the sidebar switcher section with top-bar markup inside `workspace-shell`**

```html
<main class="workspace-shell">
  <header class="canvas-topbar" id="canvas-topbar" aria-label="Canvas navigator">
    <div class="canvas-topbar-strip-shell">
      <button class="canvas-strip-scroll-button" id="canvas-strip-prev-button" type="button" aria-label="Show earlier canvases" hidden>
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m9.75 3.25-4.5 4.75 4.5 4.75"></path></svg>
      </button>

      <div class="canvas-strip-viewport" id="canvas-strip-viewport">
        <div class="canvas-strip-list" id="canvas-strip-list" role="tablist" aria-label="Canvas navigator"></div>
      </div>

      <button class="canvas-strip-scroll-button" id="canvas-strip-next-button" type="button" aria-label="Show later canvases" hidden>
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m6.25 3.25 4.5 4.75-4.5 4.75"></path></svg>
      </button>
    </div>

    <div class="canvas-topbar-actions">
      <button class="canvas-topbar-icon-button" id="create-canvas-button" type="button" aria-label="New canvas" title="New canvas">+</button>

      <div class="canvas-topbar-menu-shell">
        <button class="canvas-topbar-icon-button" id="canvas-switcher-button" type="button" aria-label="Manage canvases" aria-expanded="false" aria-controls="canvas-switcher-menu">...</button>
        <div class="canvas-switcher-menu" id="canvas-switcher-menu" hidden>
          <div class="canvas-switcher-menu-body" id="canvas-switcher-menu-body"></div>
          <div class="canvas-switcher-menu-actions" aria-label="Canvas actions">
            <button class="canvas-list-action sidebar-section-action" id="export-canvas-button" type="button" aria-label="Export canvas" title="Export canvas">Export</button>
            <button class="canvas-list-action sidebar-section-action" id="import-canvas-button" type="button" aria-label="Import canvas" title="Import canvas">Import</button>
          </div>
        </div>
      </div>
    </div>
  </header>

  <section class="board" id="board">
```

- [ ] **Step 2: Convert `workspace-shell` into a two-row layout so the board sits below the navigator instead of underneath it**

```css
.workspace-shell {
  position: relative;
  z-index: 0;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  min-width: 0;
  min-height: 100vh;
  height: 100vh;
  background: linear-gradient(180deg, var(--color-board) 0%, var(--color-board-deep) 100%);
}

.board {
  position: relative;
  min-height: 0;
  height: 100%;
  overflow: hidden;
  overscroll-behavior: none;
}
```

- [ ] **Step 3: Add the top-strip and action-menu styles, keeping the bar compact and maximize-safe**

```css
.canvas-topbar {
  position: relative;
  z-index: 7;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--space-3);
  padding: 0.75rem 1rem 0.5rem 4.75rem;
}

.canvas-topbar-strip-shell {
  justify-self: center;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--space-2);
  width: min(56rem, calc(100vw - 17rem));
  min-width: 0;
}

.canvas-strip-viewport {
  min-width: 0;
  overflow: hidden;
}

.canvas-strip-list {
  display: flex;
  gap: var(--space-2);
  overflow-x: auto;
  scrollbar-width: none;
  scroll-behavior: smooth;
}

.canvas-strip-list::-webkit-scrollbar {
  display: none;
}

.canvas-strip-button {
  flex: 0 0 auto;
  max-width: 12rem;
  min-height: 2rem;
  padding: 0 var(--space-3);
  border: 1px solid var(--color-sidebar-rule);
  border-radius: var(--radius-full);
  background: rgba(12, 15, 21, 0.68);
  color: var(--color-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.canvas-strip-button.is-active {
  background: var(--color-sidebar-panel-active);
  border-color: var(--color-sidebar-accent-strong);
  color: var(--color-ink);
}

.canvas-strip-scroll-button[hidden] {
  display: none;
}

.canvas-topbar-menu-shell {
  position: relative;
}

.canvas-topbar-menu-shell .canvas-switcher-menu {
  top: calc(100% + var(--space-2));
  right: 0;
  left: auto;
  width: min(18rem, calc(100vw - 2rem));
}
```

- [ ] **Step 4: Rework the renderer to build the strip from the helper model and keep the management menu logic alive under the `...` button**

```js
const { deriveCanvasSwitcherViewModel, deriveCanvasStripOverflowState } = window.noteCanvasRendererCanvasSwitcher;

const canvasTopbar = document.getElementById("canvas-topbar");
const canvasStripList = document.getElementById("canvas-strip-list");
const canvasStripPrevButton = document.getElementById("canvas-strip-prev-button");
const canvasStripNextButton = document.getElementById("canvas-strip-next-button");

function syncCanvasStripOverflowState() {
  if (!(canvasStripList instanceof HTMLElement)) {
    return;
  }

  const overflowState = deriveCanvasStripOverflowState({
    scrollLeft: canvasStripList.scrollLeft,
    clientWidth: canvasStripList.clientWidth,
    scrollWidth: canvasStripList.scrollWidth
  });

  if (canvasStripPrevButton instanceof HTMLButtonElement) {
    canvasStripPrevButton.hidden = !overflowState.hasOverflow;
    canvasStripPrevButton.disabled = !overflowState.canScrollBackward;
  }

  if (canvasStripNextButton instanceof HTMLButtonElement) {
    canvasStripNextButton.hidden = !overflowState.hasOverflow;
    canvasStripNextButton.disabled = !overflowState.canScrollForward;
  }
}

function ensureActiveCanvasStripItemVisible() {
  const activeButton = canvasStripList?.querySelector(`[data-canvas-id="${activeCanvasId}"][data-canvas-part="strip-switch"]`);

  if (activeButton instanceof HTMLElement) {
    activeButton.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  syncCanvasStripOverflowState();
}

function createCanvasStripButton(itemView) {
  const button = document.createElement("button");
  button.className = "canvas-strip-button";
  button.type = "button";
  button.dataset.canvasId = itemView.id;
  button.dataset.canvasPart = "strip-switch";
  button.textContent = itemView.name;
  button.title = itemView.name;
  button.classList.toggle("is-active", itemView.isActive);
  button.setAttribute("aria-pressed", String(itemView.isActive));
  button.addEventListener("click", () => {
    setActiveCanvas(itemView.id);
  });
  return button;
}

function renderCanvasSwitcher() {
  const viewModel = getCanvasSwitcherViewModel();
  const stripItems = viewModel.strip.items.map(createCanvasStripButton);
  canvasStripList?.replaceChildren(...stripItems);

  const menuList = document.createElement("ul");
  menuList.className = "canvas-switcher-menu-list canvas-list";
  menuList.id = "canvas-switcher-list";
  menuList.setAttribute("aria-label", viewModel.menu.label);
  viewModel.menu.items.forEach((itemView) => {
    menuList.append(createCanvasSwitcherMenuItem(itemView));
  });
  canvasSwitcherMenuBody?.replaceChildren(menuList);

  requestAnimationFrame(() => {
    ensureActiveCanvasStripItemVisible();
    focusPendingCanvasListControl();
  });
}
```

- [ ] **Step 5: Wire the scroll buttons and resize listeners so overflow remains accurate after switching, creation, and window resizing**

```js
function scrollCanvasStripBy(direction) {
  if (!(canvasStripList instanceof HTMLElement)) {
    return;
  }

  const delta = Math.max(canvasStripList.clientWidth * 0.72, 180);
  canvasStripList.scrollBy({ left: direction * delta, behavior: "smooth" });
}

canvasStripPrevButton?.addEventListener("click", () => {
  scrollCanvasStripBy(-1);
});

canvasStripNextButton?.addEventListener("click", () => {
  scrollCanvasStripBy(1);
});

canvasStripList?.addEventListener("scroll", () => {
  syncCanvasStripOverflowState();
});

window.addEventListener("resize", () => {
  requestAnimationFrame(syncCanvasStripOverflowState);
});
```

- [ ] **Step 6: Run syntax verification before touching smoke coverage**

Run: `npm run build`
Expected: PASS because `main.js`, `preload.js`, and the rewritten `renderer.js` still parse cleanly after the top-bar move.

- [ ] **Step 7: Commit the top-bar UI move**

```bash
git add index.html styles.css renderer.js
git commit -m "feat: move canvas switching into the top bar"
```

## Task 3: Add maximize-safe smoke coverage for the new navigator

**Files:**
- Modify: `renderer.js`
- Modify: `main.js`

- [ ] **Step 1: Replace the old sidebar-switcher smoke assertions with top-bar assertions first**

```js
logStep("verify the top canvas strip stays visible and compact");
const topCanvasSnapshot = await window.webContents.executeJavaScript("window.__canvasLearningDebug.getSnapshot()");
const topCanvasStripSnapshot = await window.webContents.executeJavaScript(`(() => {
  const topbar = document.getElementById("canvas-topbar");
  const strip = document.getElementById("canvas-strip-list");
  const sidebarSection = document.getElementById("canvas-switcher-section");
  const boardElement = document.getElementById("board");

  if (!(topbar instanceof HTMLElement) || !(strip instanceof HTMLElement) || !(boardElement instanceof HTMLElement)) {
    return null;
  }

  return {
    topbarHeight: topbar.getBoundingClientRect().height,
    boardTop: boardElement.getBoundingClientRect().top,
    stripNames: [...strip.querySelectorAll('[data-canvas-part="strip-switch"]')].map((button) => button.textContent.trim()),
    sidebarSectionVisible: sidebarSection instanceof HTMLElement && getComputedStyle(sidebarSection).display !== "none"
  };
})()`);

if (
  topCanvasSnapshot.topCanvasStripVisible !== true
  || !Array.isArray(topCanvasSnapshot.topCanvasStripNames)
  || topCanvasSnapshot.topCanvasStripNames.length === 0
  || topCanvasStripSnapshot === null
  || topCanvasStripSnapshot.stripNames.length === 0
  || topCanvasStripSnapshot.sidebarSectionVisible === true
  || topCanvasStripSnapshot.boardTop < topCanvasStripSnapshot.topbarHeight - 2
) {
  throw new Error(`Smoke test failed: top canvas strip did not replace the old sidebar switcher cleanly. Snapshots: ${JSON.stringify({ topCanvasSnapshot, topCanvasStripSnapshot })}`);
}
```

- [ ] **Step 2: Run the smoke harness to verify those new assertions fail before the debug fields exist**

Run: `CANVAS_SMOKE_TEST=1 npm run dev`
Expected: FAIL because `window.__canvasLearningDebug.getSnapshot()` does not yet expose `topCanvasStripVisible` and `topCanvasStripNames`, and the later maximize-switch step still has no real strip-click helper.

- [ ] **Step 3: Extend the debug snapshot and helpers so smoke coverage can click the real strip UI**

```js
function getCanvasSnapshot() {
  const canvasStripButtons = [...(canvasStripList?.querySelectorAll('[data-canvas-part="strip-switch"]') ?? [])];

  return {
    // existing fields...
    topCanvasStripVisible: canvasTopbar instanceof HTMLElement
      && Number.parseFloat(getComputedStyle(canvasTopbar).opacity || "1") > 0.01,
    topCanvasStripNames: canvasStripButtons.map((button) => button.textContent?.trim() ?? ""),
    topCanvasStripCanScrollBackward: canvasStripPrevButton instanceof HTMLButtonElement && !canvasStripPrevButton.hidden && canvasStripPrevButton.disabled === false,
    topCanvasStripCanScrollForward: canvasStripNextButton instanceof HTMLButtonElement && !canvasStripNextButton.hidden && canvasStripNextButton.disabled === false
  };
}

window.__canvasLearningDebug = {
  // existing helpers...
  clickCanvasStripAt: async (index) => {
    const button = [...(canvasStripList?.querySelectorAll('[data-canvas-part="strip-switch"]') ?? [])][index];

    if (button instanceof HTMLButtonElement) {
      button.click();
      await waitForUiTransition();
    }

    return getCanvasSnapshot();
  },
  scrollCanvasStripForward: async () => {
    canvasStripNextButton?.click();
    await waitForUiTransition();
    return getCanvasSnapshot();
  }
};
```

- [ ] **Step 4: Add maximize-mode switching assertions that prove the top strip survives and each canvas restores its own maximized terminal state**

```js
logStep("keep the top strip visible while switching between maximized canvases");
await window.webContents.executeJavaScript("window.__canvasLearningDebug.switchCanvas(0)");
await window.webContents.executeJavaScript("window.__canvasLearningDebug.toggleMaximizeFirstTerminal()");

await window.webContents.executeJavaScript("window.__canvasLearningDebug.switchCanvas(1)");
await window.webContents.executeJavaScript("window.__canvasLearningDebug.createTerminalAt(420, 260)");
await window.webContents.executeJavaScript("window.__canvasLearningDebug.renameFirstTerminal('Canvas 2 shell')");
await window.webContents.executeJavaScript("window.__canvasLearningDebug.toggleMaximizeFirstTerminal()");

const firstMaximizedCanvasSnapshot = await window.webContents.executeJavaScript("window.__canvasLearningDebug.clickCanvasStripAt(0)");
const secondMaximizedCanvasSnapshot = await window.webContents.executeJavaScript("window.__canvasLearningDebug.clickCanvasStripAt(1)");

if (
  firstMaximizedCanvasSnapshot.topCanvasStripVisible !== true
  || firstMaximizedCanvasSnapshot.maximizedNodeTitle === null
  || secondMaximizedCanvasSnapshot.topCanvasStripVisible !== true
  || secondMaximizedCanvasSnapshot.maximizedNodeTitle !== "Canvas 2 shell"
) {
  throw new Error(`Smoke test failed: maximized canvases no longer keep the top strip interactive. Snapshots: ${JSON.stringify({ firstMaximizedCanvasSnapshot, secondMaximizedCanvasSnapshot })}`);
}
```

- [ ] **Step 5: Re-run the automated smoke harness and the full test suite**

Run: `CANVAS_SMOKE_TEST=1 npm run dev`
Expected: PASS with `Smoke test passed.` after the app verifies the top strip, overflow affordances, and maximize-safe switching.

Run: `npm test`
Expected: PASS with the full Node test suite green after the helper and renderer changes.

- [ ] **Step 6: Commit the maximize-safe smoke coverage**

```bash
git add renderer.js main.js
git commit -m "test: cover top strip canvas switching while maximized"
```
