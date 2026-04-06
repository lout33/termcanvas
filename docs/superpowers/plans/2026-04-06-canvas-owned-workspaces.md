# Canvas-Owned Workspaces Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make each canvas own exactly one workspace so switching canvases also switches the navigator, preview context, and default cwd for new terminals.

**Architecture:** Persist workspace ownership inside each canvas snapshot, not in top-level app state. Keep the Electron main process responsible for exactly one live workspace registry per window, and have `renderer.js` swap that live registry whenever the active canvas changes.

**Tech Stack:** Electron, Node.js built-in test runner, plain DOM renderer, existing CSS token system, existing smoke-test hooks in `main.js`

---

**Baseline note:** In the clean `canvas-owned-workspaces` worktree, `npm test` passes but `npm run build` currently fails because `renderer.js` contains a stray `sessionKey:` token inside `serializeWorkspaceSession()` around line 2167. Task 1 removes that pre-existing syntax error while moving workspace persistence into canvas snapshots.

## File Structure

- `session_snapshot.js`
Purpose: normalize per-canvas workspace state and migrate legacy top-level workspace state onto the active canvas.

- `test/session-snapshot.test.js`
Purpose: cover per-canvas workspace normalization, null-workspace canvases, and legacy migration.

- `main.js`
Purpose: add a narrow `chooseCanvasWorkspace` IPC flow that resets the live per-window workspace registry to a single folder, and update smoke assertions from multi-folder behavior to canvas-owned behavior.

- `preload.js`
Purpose: expose `chooseCanvasWorkspace()` while keeping the bridge narrow.

- `renderer.js`
Purpose: add `canvas.workspace` records, restore the active canvas workspace into main on switch, scope expanded-directory and preview state to the active canvas, switch the sidebar to a canvas-first flow, and update debug helpers.

- `index.html`
Purpose: replace the separate canvas list and imported-folder list sections with a canvas switcher header plus one navigator section.

- `styles.css`
Purpose: style the switcher trigger/menu/header metadata and simplify the workspace section layout now that there is no imported-folder list.

### Task 1: Move persisted workspace ownership into canvas snapshots

**Files:**
- Modify: `test/session-snapshot.test.js`
- Modify: `session_snapshot.js`
- Modify: `renderer.js`

- [ ] **Step 1: Write the failing session snapshot tests**

```js
test("normalizeAppSessionSnapshot keeps per-canvas workspace state", () => {
  const snapshot = normalizeAppSessionSnapshot({
    activeCanvasId: "canvas-2",
    canvases: [
      {
        id: "canvas-1",
        name: "One",
        workspace: null,
        terminalNodes: []
      },
      {
        id: "canvas-2",
        name: "Two",
        workspace: {
          rootPath: "/tmp/project-b",
          rootName: "project-b",
          expandedDirectoryPaths: ["src", "src", "src/components"],
          previewRelativePath: "README.md"
        },
        terminalNodes: []
      }
    ]
  });

  assert.equal(snapshot.canvases[0].workspace, null);
  assert.deepEqual(snapshot.canvases[1].workspace, {
    rootPath: "/tmp/project-b",
    rootName: "project-b",
    expandedDirectoryPaths: ["src", "src/components"],
    previewRelativePath: "README.md"
  });
});

test("normalizeAppSessionSnapshot migrates legacy top-level workspace state onto the active canvas only", () => {
  const snapshot = normalizeAppSessionSnapshot({
    activeCanvasId: "canvas-2",
    workspace: {
      importedRootPaths: ["/tmp/legacy"],
      activeRootPath: "/tmp/legacy",
      expandedDirectoriesByRootPath: [{
        rootPath: "/tmp/legacy",
        directoryPaths: ["src", "src/components"]
      }],
      preview: {
        rootPath: "/tmp/legacy",
        relativePath: "README.md"
      }
    },
    canvases: [
      { id: "canvas-1", name: "One", terminalNodes: [] },
      { id: "canvas-2", name: "Two", terminalNodes: [] }
    ]
  });

  assert.equal(snapshot.canvases[0].workspace, null);
  assert.deepEqual(snapshot.canvases[1].workspace, {
    rootPath: "/tmp/legacy",
    rootName: null,
    expandedDirectoryPaths: ["src", "src/components"],
    previewRelativePath: "README.md"
  });
  assert.equal(snapshot.workspace, undefined);
});
```

- [ ] **Step 2: Run the targeted test to verify it fails**

Run: `node --test test/session-snapshot.test.js`
Expected: FAIL because canvases do not yet normalize a `workspace` field and the snapshot still returns top-level `workspace`.

- [ ] **Step 3: Implement per-canvas workspace normalization in `session_snapshot.js`**

```js
function normalizeCanvasWorkspaceSnapshot(workspaceSnapshot) {
  const rootPath = normalizeString(workspaceSnapshot?.rootPath);

  if (rootPath === null) {
    return null;
  }

  const expandedDirectoryPaths = [];
  const seenDirectoryPaths = new Set();

  if (Array.isArray(workspaceSnapshot?.expandedDirectoryPaths)) {
    workspaceSnapshot.expandedDirectoryPaths.forEach((directoryPath) => {
      const normalizedDirectoryPath = normalizeString(directoryPath);

      if (normalizedDirectoryPath !== null && !seenDirectoryPaths.has(normalizedDirectoryPath)) {
        seenDirectoryPaths.add(normalizedDirectoryPath);
        expandedDirectoryPaths.push(normalizedDirectoryPath);
      }
    });
  }

  return {
    rootPath,
    rootName: normalizeString(workspaceSnapshot?.rootName),
    expandedDirectoryPaths,
    previewRelativePath: normalizeString(workspaceSnapshot?.previewRelativePath)
  };
}
```

- [ ] **Step 4: Migrate legacy top-level workspace state onto the active canvas**

```js
function normalizeLegacyCanvasWorkspace(snapshot) {
  const activeRootPath = normalizeString(snapshot?.workspace?.activeRootPath);

  if (activeRootPath === null) {
    return null;
  }

  const expandedDirectoriesEntry = Array.isArray(snapshot?.workspace?.expandedDirectoriesByRootPath)
    ? snapshot.workspace.expandedDirectoriesByRootPath.find((entry) => entry?.rootPath === activeRootPath)
    : null;

  return {
    rootPath: activeRootPath,
    rootName: null,
    expandedDirectoryPaths: Array.isArray(expandedDirectoriesEntry?.directoryPaths)
      ? expandedDirectoriesEntry.directoryPaths.filter((directoryPath) => typeof directoryPath === "string" && directoryPath.length > 0)
      : [],
    previewRelativePath: snapshot?.workspace?.preview?.rootPath === activeRootPath
      ? normalizeString(snapshot.workspace.preview.relativePath)
      : null
  };
}
```

- [ ] **Step 5: Update `renderer.js` serialization to write workspace inside each canvas and delete the top-level workspace serializer**

```js
function serializeCanvasWorkspace(canvasRecord) {
  return canvasRecord.workspace?.rootPath
    ? {
        rootPath: canvasRecord.workspace.rootPath,
        rootName: canvasRecord.workspace.rootName,
        expandedDirectoryPaths: [...canvasRecord.workspace.expandedDirectoryPaths],
        previewRelativePath: canvasRecord.workspace.previewRelativePath
      }
    : null;
}

function serializeCanvasSessionRecord(canvasRecord) {
  const exportedCanvas = serializeCanvasRecord(canvasRecord).canvas;

  return {
    id: canvasRecord.id,
    name: exportedCanvas.name,
    viewportOffset: exportedCanvas.viewportOffset,
    viewportScale: exportedCanvas.viewportScale,
    workspace: serializeCanvasWorkspace(canvasRecord),
    terminalNodes: canvasRecord.nodes.map((nodeRecord, index) => ({
      sessionKey: nodeRecord.sessionKey,
      ...exportedCanvas.terminalNodes[index],
      isExited: nodeRecord.isExited,
      exitCode: nodeRecord.exitCode,
      exitSignal: nodeRecord.exitSignal
    }))
  };
}

function serializeAppSession() {
  return {
    version: APP_SESSION_VERSION,
    ui: {
      isSidebarCollapsed,
      hasDismissedBoardIntro
    },
    canvases: canvases.map(serializeCanvasSessionRecord),
    activeCanvasId
  };
}
```

- [ ] **Step 6: Run verification for the snapshot refactor**

Run: `node --test test/session-snapshot.test.js`
Expected: PASS

Run: `npm run build`
Expected: PASS, including removal of the stray `sessionKey:` syntax error from `renderer.js`

- [ ] **Step 7: Commit the session-model milestone**

```bash
git add test/session-snapshot.test.js session_snapshot.js renderer.js
git commit -m "feat: persist workspaces on canvases"
```

### Task 2: Add a single-workspace canvas picker IPC path

**Files:**
- Modify: `main.js`
- Modify: `preload.js`

- [ ] **Step 1: Add the preload bridge method**

```js
chooseCanvasWorkspace: () => ipcRenderer.invoke("workspace-directory:choose-canvas")
```

- [ ] **Step 2: Add a main-process helper that replaces the live window registry with one selected directory**

```js
function chooseCanvasWorkspaceForOwner(ownerWebContentsId, directoryPath) {
  resetWorkspaceSessionForOwner(ownerWebContentsId);
  return openWorkspaceDirectoryForOwner(ownerWebContentsId, directoryPath);
}
```

- [ ] **Step 3: Add the new IPC handler and route the smoke-only debug open handler through the same helper**

```js
ipcMain.handle("workspace-directory:choose-canvas", async (event) => {
  const ownerWindow = BrowserWindow.fromWebContents(event.sender);

  const { canceled, filePaths } = await dialog.showOpenDialog(ownerWindow, {
    title: "Choose workspace for canvas",
    defaultPath: resolveDialogDefaultDirectory(event.sender.id),
    properties: ["openDirectory"]
  });

  if (canceled || typeof filePaths[0] !== "string") {
    return { canceled: true };
  }

  return {
    canceled: false,
    state: chooseCanvasWorkspaceForOwner(event.sender.id, filePaths[0])
  };
});

ipcMain.handle("workspace-directory:debug-open", (event, payload) => {
  return chooseCanvasWorkspaceForOwner(
    event.sender.id,
    typeof payload?.directoryPath === "string" ? payload.directoryPath : ""
  );
});
```

- [ ] **Step 4: Re-run the parser build after the new IPC surface is in place**

Run: `npm run build`
Expected: PASS

- [ ] **Step 5: Commit the IPC milestone**

```bash
git add main.js preload.js
git commit -m "feat: add canvas workspace picker"
```

### Task 3: Restore the active canvas workspace into the live renderer state

**Files:**
- Modify: `renderer.js`

- [ ] **Step 1: Add a canvas workspace record shape to `createCanvasRecord()`**

```js
function createCanvasWorkspaceRecord(workspace = null) {
  if (workspace == null || typeof workspace.rootPath !== "string" || workspace.rootPath.length === 0) {
    return {
      rootPath: null,
      rootName: null,
      expandedDirectoryPaths: [],
      previewRelativePath: null
    };
  }

  return {
    rootPath: workspace.rootPath,
    rootName: typeof workspace.rootName === "string" && workspace.rootName.length > 0 ? workspace.rootName : null,
    expandedDirectoryPaths: Array.isArray(workspace.expandedDirectoryPaths) ? [...new Set(workspace.expandedDirectoryPaths)] : [],
    previewRelativePath: typeof workspace.previewRelativePath === "string" && workspace.previewRelativePath.length > 0
      ? workspace.previewRelativePath
      : null
  };
}

function createCanvasRecord(options = {}) {
  const requestedName = typeof options.name === "string" ? options.name : `Canvas ${canvasCount}`;
  const requestedId = typeof options.id === "string" && options.id.trim().length > 0 ? options.id : crypto.randomUUID();
  const viewportOffset = options.viewportOffset ?? { x: 0, y: 0 };
  const viewportScale = roundCanvasScale(options.viewportScale ?? 1);
  const safeViewportX = Number.isFinite(viewportOffset.x) ? viewportOffset.x : 0;
  const safeViewportY = Number.isFinite(viewportOffset.y) ? viewportOffset.y : 0;

  const canvasRecord = {
    id: canvasMap.has(requestedId) ? crypto.randomUUID() : requestedId,
    name: getUniqueCanvasName(requestedName),
    viewportOffset: {
      x: safeViewportX,
      y: safeViewportY
    },
    viewportScale,
    highestNodeLayer: 2,
    nodes: [],
    workspace: createCanvasWorkspaceRecord(options.workspace)
  };
}
```

- [ ] **Step 2: Replace folder-id keyed expansion and preview ownership with active-canvas helpers**

```js
const workspacePreviewState = {
  relativePath: null,
  status: "empty",
  data: null,
  errorMessage: ""
};

function getActiveCanvasWorkspace() {
  return getActiveCanvas()?.workspace ?? null;
}

function getExpandedDirectoriesForActiveCanvas() {
  const workspace = getActiveCanvasWorkspace();
  return new Set(workspace?.expandedDirectoryPaths ?? []);
}
```

- [ ] **Step 3: Add an async active-canvas workspace restore token and call it from `initializeApp()` and `setActiveCanvas()`**

```js
let activeCanvasWorkspaceRequestId = 0;

async function restoreWorkspaceForCanvas(canvasRecord) {
  const requestId = ++activeCanvasWorkspaceRequestId;
  const workspace = canvasRecord?.workspace ?? null;

  const nextState = await window.noteCanvas.restoreWorkspaceSession(
    workspace?.rootPath
      ? {
          importedRootPaths: [workspace.rootPath],
          activeRootPath: workspace.rootPath
        }
      : {
          importedRootPaths: [],
          activeRootPath: null
        }
  );

  if (requestId !== activeCanvasWorkspaceRequestId || getActiveCanvas()?.id !== canvasRecord?.id) {
    return null;
  }

  applyWorkspaceState(nextState);
  return restoreCanvasWorkspacePreview(canvasRecord);
}
```

- [ ] **Step 4: Make preview state, directory expansion, and default cwd write back into `canvas.workspace`**

```js
function persistExpandedDirectoriesForActiveCanvas(expandedDirectories) {
  const workspace = getActiveCanvasWorkspace();

  if (workspace !== null) {
    workspace.expandedDirectoryPaths = [...expandedDirectories];
    scheduleAppSessionSave();
  }
}

function getDefaultTerminalWorkingDirectory() {
  return getActiveCanvasWorkspace()?.rootPath ?? null;
}

async function loadWorkspaceFilePreview(relativePath) {
  workspacePreviewState.relativePath = relativePath;
  workspacePreviewState.status = "loading";
  workspacePreviewState.data = null;
  workspacePreviewState.errorMessage = "";

  const workspace = getActiveCanvasWorkspace();

  if (workspace !== null) {
    workspace.previewRelativePath = relativePath;
    scheduleAppSessionSave();
  }
}
```

- [ ] **Step 5: Keep new canvases and imported canvases workspace-empty by default**

```js
function createCanvas() {
  const canvasRecord = createCanvasRecord({ workspace: null });
  setActiveCanvas(canvasRecord.id);
}

async function importCanvasFromData(importedCanvas) {
  const importedCanvasRecord = createCanvasRecord({
    name: importedCanvas.name,
    viewportOffset: importedCanvas.viewportOffset,
    viewportScale: importedCanvas.viewportScale,
    workspace: null
  });
}
```

- [ ] **Step 6: Run build after the renderer ownership refactor**

Run: `npm run build`
Expected: PASS

- [ ] **Step 7: Commit the renderer ownership milestone**

```bash
git add renderer.js
git commit -m "feat: bind live workspace state to active canvas"
```

### Task 4: Replace the left sidebar with a canvas switcher and one navigator

**Files:**
- Modify: `index.html`
- Modify: `styles.css`
- Modify: `renderer.js`

- [ ] **Step 1: Replace the separate canvas list and imported-folder list markup with a switcher header**

```html
<section class="sidebar-section sidebar-primary-section" id="canvas-switcher-section" aria-label="Canvas switcher section">
  <div class="canvas-switcher-header-row">
    <button class="canvas-switcher-trigger" id="canvas-switcher-button" type="button" aria-haspopup="true" aria-expanded="false">
      <span class="canvas-switcher-copy">
        <span class="canvas-switcher-name" id="canvas-switcher-name">Canvas 1</span>
        <span class="canvas-switcher-meta" id="canvas-switcher-meta">Choose workspace</span>
      </span>
    </button>

    <div class="sidebar-section-actions" aria-label="Canvas actions">
      <button class="canvas-list-action sidebar-section-action" id="create-canvas-button" type="button" aria-label="New canvas"></button>
      <button class="canvas-list-action sidebar-section-action" id="rename-canvas-button" type="button" aria-label="Rename canvas"></button>
      <button class="canvas-list-action sidebar-section-action" id="delete-canvas-button" type="button" aria-label="Delete canvas"></button>
    </div>
  </div>

  <div class="canvas-switcher-menu" id="canvas-switcher-menu" hidden></div>
</section>

<section class="sidebar-section sidebar-primary-section" id="workspace-browser-section" aria-label="Workspace browser section">
  <div class="sidebar-section-header-row">
    <div class="sidebar-section-header">Navigator</div>
    <div class="sidebar-section-actions" aria-label="Workspace actions">
      <button class="canvas-list-action sidebar-section-action" id="open-workspace-button" type="button" aria-label="Choose workspace"></button>
      <button class="canvas-list-action sidebar-section-action" id="refresh-workspace-button" type="button" aria-label="Refresh workspace"></button>
    </div>
  </div>
  <div class="workspace-browser" id="workspace-browser" aria-live="polite"></div>
</section>
```

- [ ] **Step 2: Add switcher/menu styles and simplify the workspace layout in `styles.css`**

```css
.canvas-switcher-header-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: var(--space-2);
  align-items: start;
}

.canvas-switcher-trigger {
  display: grid;
  gap: 0.25rem;
  width: 100%;
  min-height: 3rem;
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-sidebar-rule);
  border-radius: var(--radius-sm);
  background: var(--color-sidebar-panel);
  text-align: left;
}

.canvas-switcher-menu {
  display: grid;
  gap: var(--space-1);
  margin-top: var(--space-2);
  max-height: min(14rem, 28vh);
  overflow: auto;
}

#workspace-browser-section {
  min-height: 0;
}

.workspace-browser {
  grid-template-rows: auto minmax(0, 1fr) auto;
  min-height: min(32rem, 66vh);
}
```

- [ ] **Step 3: Replace `renderCanvasList()` with `renderCanvasSwitcher()` and menu interactions in `renderer.js`**

```js
function renderCanvasSwitcher() {
  const activeCanvas = getActiveCanvas();

  canvasSwitcherName.textContent = activeCanvas?.name ?? "No canvas";
  canvasSwitcherMeta.textContent = activeCanvas?.workspace?.rootPath ?? "Choose workspace";

  canvasSwitcherMenu.replaceChildren(
    ...canvases.map((canvasRecord) => createCanvasSwitcherOption(canvasRecord))
  );

  renameCanvasButton.disabled = activeCanvas === null;
  deleteCanvasButton.disabled = canvases.length <= 1;
}

function createCanvasSwitcherOption(canvasRecord) {
  const button = document.createElement("button");
  button.className = "canvas-list-button canvas-switcher-option";
  button.type = "button";
  button.addEventListener("click", () => {
    closeCanvasSwitcherMenu();
    setActiveCanvas(canvasRecord.id);
  });
  return button;
}
```

- [ ] **Step 4: Route the workspace action button through `chooseCanvasWorkspace()` and remove the user-facing imported-folder list logic**

```js
async function chooseCanvasWorkspace() {
  const opened = await window.noteCanvas.chooseCanvasWorkspace();

  if (opened?.canceled || opened?.state == null) {
    return null;
  }

  applyWorkspaceState(opened.state);
  openWorkspaceDrawer();
  return opened.state;
}

openWorkspaceButton?.addEventListener("click", () => {
  void chooseCanvasWorkspace().catch(console.error);
});
```

- [ ] **Step 5: Run build after the sidebar UI refactor**

Run: `npm run build`
Expected: PASS

- [ ] **Step 6: Commit the sidebar milestone**

```bash
git add index.html styles.css renderer.js
git commit -m "feat: redesign sidebar around canvas switcher"
```

### Task 5: Update debug helpers and smoke coverage for canvas-owned workspaces

**Files:**
- Modify: `renderer.js`
- Modify: `main.js`

- [ ] **Step 1: Update the renderer debug snapshot to expose per-canvas workspace ownership**

```js
return {
  canvasNames: canvases.map((canvasRecord) => canvasRecord.name),
  canvasWorkspaceRoots: canvases.map((canvasRecord) => canvasRecord.workspace?.rootPath ?? null),
  activeCanvasName: activeCanvas?.name ?? null,
  workspaceRootPath: getActiveCanvasWorkspace()?.rootPath ?? null,
  workspaceVisibleEntryPaths: [...workspaceBrowser.querySelectorAll("[data-workspace-path]")]
    .map((entryElement) => entryElement.dataset.workspacePath)
    .filter((entryPath) => typeof entryPath === "string"),
  workspaceSelectedFilePath: workspacePreviewState.relativePath,
  workspacePreviewContents: workspacePreviewState.data?.contents ?? ""
};
```

- [ ] **Step 2: Replace the multi-folder smoke path in `main.js` with a two-canvas ownership flow**

```js
logStep("bind different workspaces to two canvases");
await window.webContents.executeJavaScript(`window.__canvasLearningDebug.openWorkspaceDirectoryForPath(${JSON.stringify(firstWorkspacePath)})`);
await window.webContents.executeJavaScript("window.__canvasLearningDebug.createCanvas()");
await window.webContents.executeJavaScript(`window.__canvasLearningDebug.openWorkspaceDirectoryForPath(${JSON.stringify(secondWorkspacePath)})`);

const switchedCanvasSnapshot = await waitForSnapshot(
  "window.__canvasLearningDebug.getSnapshot()",
  (snapshot) => snapshot.canvasWorkspaceRoots.includes(canonicalFirstWorkspacePath) && snapshot.canvasWorkspaceRoots.includes(canonicalSecondWorkspacePath),
  4000
);

await window.webContents.executeJavaScript("window.__canvasLearningDebug.switchCanvas(0)");
await waitForSnapshot(
  "window.__canvasLearningDebug.getSnapshot()",
  (snapshot) => snapshot.workspaceRootPath === canonicalFirstWorkspacePath,
  4000
);
```

- [ ] **Step 3: Add smoke assertions for preview restore, default cwd, new-canvas null workspace, and imported-canvas null workspace**

```js
await window.webContents.executeJavaScript(`window.__canvasLearningDebug.selectWorkspaceFile(${JSON.stringify("README.md")})`);
await waitForSnapshot(
  "window.__canvasLearningDebug.getSnapshot()",
  (snapshot) => snapshot.workspaceSelectedFilePath === "README.md" && snapshot.workspacePreviewContents.includes("first workspace"),
  4000
);

await window.webContents.executeJavaScript("window.__canvasLearningDebug.switchCanvas(1)");
await waitForSnapshot(
  "window.__canvasLearningDebug.getSnapshot()",
  (snapshot) => snapshot.workspaceRootPath === canonicalSecondWorkspacePath && snapshot.workspaceSelectedFilePath === null,
  4000
);

await window.webContents.executeJavaScript("window.__canvasLearningDebug.switchCanvas(0)");
await waitForSnapshot(
  "window.__canvasLearningDebug.getSnapshot()",
  (snapshot) => snapshot.workspaceRootPath === canonicalFirstWorkspacePath && snapshot.workspaceSelectedFilePath === "README.md",
  4000
);

const defaultWorkspaceCwd = await window.webContents.executeJavaScript("window.__canvasLearningDebug.getDefaultTerminalWorkingDirectory()");
if (defaultWorkspaceCwd !== canonicalFirstWorkspacePath) {
  throw new Error(`Smoke test failed: active canvas workspace did not drive default cwd. Value: ${JSON.stringify(defaultWorkspaceCwd)}`);
}

const emptyCanvasSnapshot = await window.webContents.executeJavaScript(`(() => {
  window.__canvasLearningDebug.createCanvas();
  return window.__canvasLearningDebug.getSnapshot();
})()`);

if (emptyCanvasSnapshot.workspaceRootPath !== null) {
  throw new Error(`Smoke test failed: fresh canvas did not start workspace-empty. Snapshot: ${JSON.stringify(emptyCanvasSnapshot)}`);
}

const importedCanvasSnapshot = await window.webContents.executeJavaScript(`(async () => {
  await window.__canvasLearningDebug.importLastExportedCanvasData();
  return window.__canvasLearningDebug.getSnapshot();
})()`);

if (importedCanvasSnapshot.workspaceRootPath !== null) {
  throw new Error(`Smoke test failed: imported canvas should not auto-bind a workspace. Snapshot: ${JSON.stringify(importedCanvasSnapshot)}`);
}
```

- [ ] **Step 4: Run full verification**

Run: `npm test`
Expected: PASS

Run: `npm run build`
Expected: PASS

Run: `CANVAS_SMOKE_TEST=1 npm run dev`
Expected: PASS, including the new two-canvas workspace ownership assertions

- [ ] **Step 5: Commit the verification milestone**

```bash
git add renderer.js main.js
git commit -m "test: cover canvas-owned workspace switching"
```
