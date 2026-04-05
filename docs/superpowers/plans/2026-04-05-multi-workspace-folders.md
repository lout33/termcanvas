# Multi-Workspace Folders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users import multiple folders, switch one active folder at a time, and have that active folder drive the folder tree, file preview, terminal default cwd, and dialog default paths.

**Architecture:** Replace the single-folder window state with a per-window folder registry in `main.js`, then mirror that registry in `renderer.js` while keeping only one active folder visible at a time. Keep the security boundary unchanged by resolving all folder snapshots and file preview reads in the main process and exposing narrow activation/removal APIs through preload.

**Tech Stack:** Electron, Node.js built-in test runner, plain DOM renderer, existing CSS token system

---

### Task 1: Add failing tests for multi-folder registry behavior

**Files:**
- Create: `test/workspace-registry.test.js`
- Create: `workspace_registry.js`

- [ ] **Step 1: Write the failing test**

```js
test("importWorkspaceFolder re-selects an existing folder instead of duplicating it", () => {
  const registry = createWorkspaceRegistry();
  const firstResult = importWorkspaceFolder(registry, "/tmp/a", snapshotA);
  const secondResult = importWorkspaceFolder(registry, "/tmp/a", snapshotA);
  assert.equal(firstResult.state.importedFolders.length, 1);
  assert.equal(secondResult.state.importedFolders.length, 1);
  assert.equal(secondResult.state.activeFolderId, firstResult.state.activeFolderId);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/workspace-registry.test.js`
Expected: FAIL because `workspace_registry.js` does not exist yet.

- [ ] **Step 3: Write minimal implementation**

```js
function createWorkspaceRegistry() {
  return { importedFolders: new Map(), activeFolderId: null, nextFolderNumber: 0 };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/workspace-registry.test.js`
Expected: PASS

### Task 2: Replace single-folder main-process state with a registry

**Files:**
- Create: `workspace_registry.js`
- Modify: `main.js`
- Modify: `preload.js`

- [ ] **Step 1: Move folder-registry rules into `workspace_registry.js`**

```js
function importWorkspaceFolder(registry, rootPath, snapshot) { /* dedupe + activate */ }
function activateWorkspaceFolder(registry, folderId) { /* set active */ }
function removeWorkspaceFolder(registry, folderId) { /* remove + fallback */ }
function updateWorkspaceFolderSnapshot(registry, folderId, snapshot) { /* refresh one folder */ }
```

- [ ] **Step 2: Update `main.js` to store many folders per window**

```js
const workspaceRegistries = new Map();
const workspaceWatchers = new Map();
```

- [ ] **Step 3: Add preload methods for activation/removal**

```js
activateWorkspaceFolder: (folderId) => ipcRenderer.invoke("workspace-folder:activate", { folderId }),
removeWorkspaceFolder: (folderId) => ipcRenderer.invoke("workspace-folder:remove", { folderId })
```

- [ ] **Step 4: Re-run registry tests**

Run: `node --test test/workspace-registry.test.js`
Expected: PASS

### Task 3: Render imported folders list and active-folder tree

**Files:**
- Modify: `index.html`
- Modify: `styles.css`
- Modify: `renderer.js`

- [ ] **Step 1: Add an `Imported Folders` list section above the tree**

```html
<section class="sidebar-section" aria-label="Imported folders section">
  <div class="sidebar-section-header">Imported Folders</div>
  <ul class="workspace-folder-list" id="workspace-folder-list"></ul>
</section>
```

- [ ] **Step 2: Replace the single workspace renderer state with imported-folder state**

```js
const workspaceState = {
  importedFolders: [],
  activeFolderId: null,
  isRefreshing: false
};
```

- [ ] **Step 3: Scope expanded directories by folder id**

```js
const expandedWorkspaceDirectoriesByFolderId = new Map();
```

- [ ] **Step 4: Render the active folder tree from the active folder record only**

```js
const activeFolder = getActiveWorkspaceFolder();
const rows = buildWorkspaceTreeRows(activeFolder.entries, getExpandedDirectoriesForActiveFolder());
```

- [ ] **Step 5: Run build after the renderer refactor**

Run: `npm run build`
Expected: PASS

### Task 4: Scope preview and terminal defaults to the active folder

**Files:**
- Modify: `renderer.js`
- Modify: `main.js`

- [ ] **Step 1: Key preview reads by folder id and relative path**

```js
readWorkspaceFile: (folderId, relativePath) => ipcRenderer.invoke("workspace-file:read", { folderId, relativePath })
```

- [ ] **Step 2: Clear preview when active folder changes**

```js
if (previousActiveFolderId !== workspaceState.activeFolderId) {
  clearWorkspacePreview();
}
```

- [ ] **Step 3: Make new terminals inherit the active folder root**

```js
function getDefaultTerminalWorkingDirectory() {
  return getActiveWorkspaceFolder()?.rootPath ?? null;
}
```

- [ ] **Step 4: Make canvas dialogs default to the active folder in `main.js`**

```js
function resolveDialogDefaultDirectory(ownerWebContentsId) {
  return getActiveWorkspaceFolderPath(ownerWebContentsId) ?? app.getPath("documents");
}
```

### Task 5: Add remove-folder behavior and smoke coverage

**Files:**
- Modify: `renderer.js`
- Modify: `styles.css`
- Modify: `main.js`

- [ ] **Step 1: Add a remove action to imported-folder rows**

```js
removeButton.addEventListener("click", (event) => {
  event.preventDefault();
  event.stopPropagation();
  void removeWorkspaceFolder(folderRecord.id);
});
```

- [ ] **Step 2: Extend smoke helpers for folder import, activation, and removal**

```js
openWorkspaceDirectoryForPath(directoryPath)
activateWorkspaceFolder(folderId)
removeWorkspaceFolder(folderId)
```

- [ ] **Step 3: Add smoke assertions for multi-folder switching**

```js
// import two folders, verify two rows, switch active folder,
// verify tree swaps, verify new terminal cwd follows active folder,
// remove active folder, verify fallback activation
```

- [ ] **Step 4: Run full verification**

Run: `npm test`
Expected: PASS

Run: `npm run build`
Expected: PASS

Run: `CANVAS_SMOKE_TEST=1 npm run dev`
Expected: PASS, including multi-folder switching and fallback assertions
