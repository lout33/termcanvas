# Canvas File Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a collapsible folder tree plus a read-only right-side file preview for markdown, JSON, and text/code files inside the selected workspace.

**Architecture:** Keep filesystem reads in the Electron main process and expose one narrow preview IPC through preload. Derive folder-tree state in the renderer from the existing flat workspace snapshot, then render a secondary right inspector that previews supported files with manual refresh while leaving the terminal canvas as the primary workspace.

**Tech Stack:** Electron, Node.js built-in test runner, plain DOM renderer, existing CSS token system

---

### Task 1: Add failing tests for guarded workspace file preview reads

**Files:**
- Create: `test/workspace-file-preview.test.js`
- Create: `workspace_file_preview.js`

- [ ] **Step 1: Write the failing test**

```js
test("readWorkspaceFilePreview rejects path traversal outside the workspace root", () => {
  assert.throws(() => {
    readWorkspaceFilePreview(rootPath, "../outside.txt");
  }, /workspace root/);
});

test("readWorkspaceFilePreview pretty prints valid json files", () => {
  const preview = readWorkspaceFilePreview(rootPath, "report.json");
  assert.equal(preview.kind, "json");
  assert.match(preview.contents, /\n  "status": "ok"\n/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/workspace-file-preview.test.js`
Expected: FAIL because `workspace_file_preview.js` does not exist yet.

- [ ] **Step 3: Write minimal implementation**

```js
function readWorkspaceFilePreview(rootPath, relativePath) {
  // Resolve path under root, reject traversal, classify file type,
  // reject oversized files, and return a plain preview payload.
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/workspace-file-preview.test.js`
Expected: PASS

### Task 2: Expose preview reads through the Electron boundary

**Files:**
- Modify: `main.js`
- Modify: `preload.js`
- Create: `workspace_file_preview.js`

- [ ] **Step 1: Add a narrow preload API**

```js
readWorkspaceFile: (relativePath) => ipcRenderer.invoke("workspace-file:read", { relativePath })
```

- [ ] **Step 2: Add the main-process file preview IPC**

```js
ipcMain.handle("workspace-file:read", (event, payload) => {
  const workspaceDirectory = getOwnerWorkspaceDirectory(event.sender.id);
  return readWorkspaceFilePreview(workspaceDirectory, payload.relativePath);
});
```

- [ ] **Step 3: Re-run the preview helper tests**

Run: `node --test test/workspace-file-preview.test.js`
Expected: PASS

### Task 3: Replace the flat folders list with a collapsible tree

**Files:**
- Modify: `renderer.js`
- Modify: `styles.css`

- [ ] **Step 1: Add renderer state for expanded folders and selected file**

```js
const workspaceTreeState = {
  expandedDirectories: new Set(),
  selectedFilePath: null
};
```

- [ ] **Step 2: Derive visible tree rows from the flat workspace snapshot**

```js
function buildWorkspaceTreeRows(entries, expandedDirectories) {
  // Group by parent path, render directories first, and only show nested rows
  // when every ancestor directory is expanded.
}
```

- [ ] **Step 3: Render directory toggles and file rows**

```js
if (entry.kind === "directory") {
  row.addEventListener("click", () => toggleWorkspaceDirectory(entry.relativePath));
} else {
  row.addEventListener("click", () => {
    void selectWorkspaceFile(entry.relativePath);
  });
}
```

- [ ] **Step 4: Run build to catch renderer syntax regressions**

Run: `npm run build`
Expected: PASS

### Task 4: Add the right-side read-only file inspector

**Files:**
- Modify: `index.html`
- Modify: `styles.css`
- Modify: `renderer.js`

- [ ] **Step 1: Add inspector markup to the app shell**

```html
<aside class="file-inspector" id="file-inspector" aria-label="File preview"></aside>
```

- [ ] **Step 2: Add preview loading and refresh behavior**

```js
async function selectWorkspaceFile(relativePath) {
  previewState.status = "loading";
  previewState.relativePath = relativePath;
  previewState.data = await window.noteCanvas.readWorkspaceFile(relativePath);
  previewState.status = "ready";
}
```

- [ ] **Step 3: Render read-only preview states**

```js
switch (previewState.status) {
  case "empty":
  case "loading":
  case "error":
  case "ready":
}
```

- [ ] **Step 4: Run build again**

Run: `npm run build`
Expected: PASS

### Task 5: Extend smoke/debug coverage for file preview

**Files:**
- Modify: `renderer.js`
- Modify: `main.js`

- [ ] **Step 1: Add debug helpers for opening a workspace path and selecting/refreshing a preview file**

```js
openWorkspaceDirectoryForPath: async (directoryPath) => { /* debug-only helper */ },
selectWorkspaceFile: async (relativePath) => { /* click-equivalent helper */ },
refreshSelectedWorkspaceFile: async () => { /* refresh button equivalent */ }
```

- [ ] **Step 2: Add smoke assertions for preview flow**

```js
// create temp workspace files, open workspace, preview markdown,
// mutate file on disk, click refresh, assert preview updates
```

- [ ] **Step 3: Run full verification**

Run: `npm test`
Expected: PASS

Run: `npm run build`
Expected: PASS

Run: `CANVAS_SMOKE_TEST=1 npm run dev`
Expected: PASS, including tree selection and preview refresh assertions
