# Directory Browser Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user open a folder, browse its files in the sidebar, and have new terminals and canvas import/export flows centered on that folder.

**Architecture:** Add one tested filesystem snapshot helper that the Electron main process can call. Keep renderer access narrow through preload IPC methods for opening and refreshing a workspace directory, then render the returned snapshot in a new sidebar section and poll for updates.

**Tech Stack:** Electron, Node.js built-in test runner, plain renderer DOM, existing CSS token system

---

### Task 1: Test and build the directory snapshot helper

**Files:**
- Create: `test/directory-snapshot.test.js`
- Create: `directory_snapshot.js`

- [ ] **Step 1: Write the failing test**

```js
test("createDirectorySnapshot lists nested entries with directory-first ordering", () => {
  const snapshot = createDirectorySnapshot(rootPath, { entryLimit: 20 });
  assert.deepEqual(snapshot.entries, [
    { name: "notes", relativePath: "notes", kind: "directory", depth: 0 },
    { name: "daily", relativePath: "notes/daily", kind: "directory", depth: 1 },
    { name: "todo.txt", relativePath: "notes/daily/todo.txt", kind: "file", depth: 2 },
    { name: "canvas.json", relativePath: "canvas.json", kind: "file", depth: 0 }
  ]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/directory-snapshot.test.js`
Expected: FAIL because `../directory_snapshot.js` does not exist yet.

- [ ] **Step 3: Write minimal implementation**

```js
function createDirectorySnapshot(rootPath, options = {}) {
  // Resolve the directory, sort directories before files, ignore heavy folders,
  // and stop once the configured entry limit is reached.
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/directory-snapshot.test.js`
Expected: PASS

### Task 2: Thread directory access through Electron

**Files:**
- Modify: `main.js`
- Modify: `preload.js`

- [ ] **Step 1: Add workspace directory IPC surface**

```js
openWorkspaceDirectory: () => ipcRenderer.invoke("workspace-directory:open"),
refreshWorkspaceDirectory: (directoryPath) => ipcRenderer.invoke("workspace-directory:refresh", { directoryPath })
```

- [ ] **Step 2: Implement main-process dialog and snapshot handlers**

```js
ipcMain.handle("workspace-directory:open", async (event) => {
  // openDirectory dialog, return selected path plus createDirectorySnapshot(...)
});

ipcMain.handle("workspace-directory:refresh", async (_event, payload) => {
  // rebuild the snapshot for the existing directory path
});
```

- [ ] **Step 3: Reuse the selected workspace directory in canvas file dialogs**

```js
defaultPath: path.join(defaultDirectory ?? app.getPath("documents"), `${suggestedName}.json`)
```

### Task 3: Add renderer workspace state and sidebar browser

**Files:**
- Modify: `index.html`
- Modify: `styles.css`
- Modify: `renderer.js`

- [ ] **Step 1: Add sidebar controls and browser mount points**

```html
<button class="canvas-secondary-button" id="open-workspace-button" type="button">Open Folder</button>
<button class="canvas-secondary-button" id="refresh-workspace-button" type="button">Refresh</button>
<section class="workspace-browser" id="workspace-browser"></section>
```

- [ ] **Step 2: Store workspace snapshot state and refresh loop in the renderer**

```js
const workspaceState = {
  rootPath: null,
  rootName: "",
  entries: [],
  isTruncated: false,
  refreshTimer: 0
};
```

- [ ] **Step 3: Make new terminals start in the selected workspace folder when they have no explicit cwd**

```js
cwd: typeof options.cwd === "string" && options.cwd.trim().length > 0
  ? options.cwd
  : workspaceState.rootPath
```

- [ ] **Step 4: Render the snapshot into a compact relative-path list**

```js
entryElement.style.setProperty("--workspace-entry-depth", String(entry.depth));
entryLabel.textContent = entry.relativePath;
```

### Task 4: Verify the integrated behavior

**Files:**
- Modify: `package.json`
- Modify: `main.js`
- Modify: `renderer.js`

- [ ] **Step 1: Add a test script for the new helper test**

```json
"test": "node --test test/*.test.js"
```

- [ ] **Step 2: Extend smoke/debug helpers enough to inspect workspace state**

```js
workspaceRootPath: workspaceState.rootPath,
workspaceEntryPaths: workspaceState.entries.map((entry) => entry.relativePath)
```

- [ ] **Step 3: Run verification**

Run: `npm test`
Expected: PASS

Run: `npm run build`
Expected: PASS

Run: `CANVAS_SMOKE_TEST=1 npm run dev`
Expected: PASS, including the new workspace-browser assertions.
