# Robust Workspace Explorer Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Broaden workspace file handling so common text, image, and PDF files preview internally while unsupported files offer safe external fallback actions.

**Architecture:** Keep all filesystem and OS integration in the Electron main process. Extend `workspace_file_preview.js` to classify file kinds and return bounded text or base64 media payloads, add narrow preload IPC for external open and reveal actions, and keep renderer responsibilities limited to inspector state plus DOM rendering. Preserve the current canvas-owned workspace model and explicitly defer the large-workspace lazy tree rewrite to a later plan.

**Tech Stack:** Electron, Node.js built-in test runner, plain DOM renderer, browser `Blob` and object URLs, existing smoke-test hooks in `main.js`

---

## File Structure

- `workspace_file_preview.js`
Purpose: classify workspace files by preview kind, enforce text and media size limits, and return plain serializable payloads.

- `test/workspace-file-preview.test.js`
Purpose: verify file-kind classification, size limits, fallback metadata, and path-safety rules.

- `main.js`
Purpose: add validated `workspace-file:open-external` and `workspace-file:reveal` IPC handlers, then extend smoke coverage for image, PDF, and fallback inspector states.

- `test/canvas-workspace-ipc-main.test.js`
Purpose: cover external-open and reveal IPC handlers with the existing mocked-electron main-process test style.

- `preload.js`
Purpose: expose narrow bridge methods for external-open and reveal actions.

- `test/preload-bridge.test.js`
Purpose: verify the new preload methods hit the intended IPC channels.

- `renderer_workspace_preview.js`
Purpose: provide a browser-safe view-model helper that maps preview payloads into inspector modes such as text, media, fallback, loading, and error.

- `test/renderer-workspace-preview.test.js`
Purpose: cover the view-model helper in Node without booting the full renderer.

- `test/renderer-browser-helpers.test.js`
Purpose: verify the new helper exposes browser-safe globals the same way the other renderer helper modules do.

- `index.html`
Purpose: load the new browser-safe preview helper before `renderer.js`.

- `renderer.js`
Purpose: request richer preview payloads, manage preview blob URLs safely, render image and PDF inspector branches, and show fallback actions for non-rendered file kinds without changing canvas-owned preview persistence.

- `styles.css`
Purpose: style media previews and the fallback action panel while keeping the inspector visually secondary to the canvas.

### Task 1: Broaden workspace preview classification in main

**Files:**
- Modify: `test/workspace-file-preview.test.js`
- Modify: `workspace_file_preview.js`

- [ ] **Step 1: Write the failing file-kind tests**

```js
const { MAX_WORKSPACE_TEXT_PREVIEW_BYTES, readWorkspaceFilePreview } = require("../workspace_file_preview.js");

test("readWorkspaceFilePreview pretty prints valid json files", () => withTempDirectory((rootPath) => {
  fs.writeFileSync(path.join(rootPath, "report.json"), JSON.stringify({ status: "ok", count: 2 }), "utf8");

  const preview = readWorkspaceFilePreview(rootPath, "report.json");

  assert.equal(preview.kind, "json");
  assert.equal(preview.language, "json");
  assert.match(preview.textContents, /\n  "status": "ok",\n/u);
}));

test("readWorkspaceFilePreview rejects files larger than the preview limit", () => withTempDirectory((rootPath) => {
  fs.writeFileSync(path.join(rootPath, "large.md"), "a".repeat(MAX_WORKSPACE_TEXT_PREVIEW_BYTES + 1), "utf8");

  const preview = readWorkspaceFilePreview(rootPath, "large.md");

  assert.equal(preview.kind, "too-large");
  assert.equal(preview.textContents, "");
}));

test("readWorkspaceFilePreview returns image payloads as bounded base64 previews", () => withTempDirectory((rootPath) => {
  fs.writeFileSync(
    path.join(rootPath, "pixel.png"),
    Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WnB9pAAAAAASUVORK5CYII=", "base64")
  );

  const preview = readWorkspaceFilePreview(rootPath, "pixel.png");

  assert.equal(preview.kind, "image");
  assert.equal(preview.mimeType, "image/png");
  assert.equal(preview.textContents, "");
  assert.ok(preview.binaryContentsBase64.length > 0);
}));

test("readWorkspaceFilePreview returns pdf payloads as bounded base64 previews", () => withTempDirectory((rootPath) => {
  fs.writeFileSync(
    path.join(rootPath, "report.pdf"),
    Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n", "utf8")
  );

  const preview = readWorkspaceFilePreview(rootPath, "report.pdf");

  assert.equal(preview.kind, "pdf");
  assert.equal(preview.mimeType, "application/pdf");
  assert.ok(preview.binaryContentsBase64.length > 0);
}));

test("readWorkspaceFilePreview returns fallback metadata for audio and binary files", () => withTempDirectory((rootPath) => {
  fs.writeFileSync(path.join(rootPath, "clip.mp3"), Buffer.from([0x49, 0x44, 0x33]));
  fs.writeFileSync(path.join(rootPath, "bundle.zip"), Buffer.from([0x50, 0x4b, 0x03, 0x04]));

  const audioPreview = readWorkspaceFilePreview(rootPath, "clip.mp3");
  const binaryPreview = readWorkspaceFilePreview(rootPath, "bundle.zip");

  assert.equal(audioPreview.kind, "audio");
  assert.match(audioPreview.fallbackReason, /not previewed inside the app/u);
  assert.equal(binaryPreview.kind, "binary");
  assert.equal(binaryPreview.binaryContentsBase64, "");
}));
```

- [ ] **Step 2: Run the targeted preview helper test to verify it fails**

Run: `node --test test/workspace-file-preview.test.js`
Expected: FAIL because `workspace_file_preview.js` still returns the old `{ kind, language, contents }` shape and does not classify image, PDF, audio, or binary kinds.

- [ ] **Step 3: Replace the old text-only preview helper with file-kind classification and bounded media payloads**

```js
const MAX_WORKSPACE_TEXT_PREVIEW_BYTES = 256 * 1024;
const MAX_WORKSPACE_MEDIA_PREVIEW_BYTES = 8 * 1024 * 1024;

const TEXT_LANGUAGE_BY_EXTENSION = new Map([
  [".css", "css"],
  [".html", "html"],
  [".js", "javascript"],
  [".json", "json"],
  [".jsx", "javascript"],
  [".md", "markdown"],
  [".py", "python"],
  [".sh", "shell"],
  [".ts", "typescript"],
  [".tsx", "typescript"],
  [".txt", "text"],
  [".yaml", "yaml"],
  [".yml", "yaml"]
]);

const FILE_KIND_BY_EXTENSION = new Map([
  [".png", { kind: "image", mimeType: "image/png" }],
  [".jpg", { kind: "image", mimeType: "image/jpeg" }],
  [".jpeg", { kind: "image", mimeType: "image/jpeg" }],
  [".gif", { kind: "image", mimeType: "image/gif" }],
  [".webp", { kind: "image", mimeType: "image/webp" }],
  [".pdf", { kind: "pdf", mimeType: "application/pdf" }],
  [".mp3", { kind: "audio", mimeType: "audio/mpeg" }],
  [".wav", { kind: "audio", mimeType: "audio/wav" }],
  [".mp4", { kind: "video", mimeType: "video/mp4" }],
  [".mov", { kind: "video", mimeType: "video/quicktime" }],
  [".zip", { kind: "binary", mimeType: "application/zip" }],
  [".gz", { kind: "binary", mimeType: "application/gzip" }]
]);

function createPreviewPayload(rootPath, relativePath, filePath, stats, overrides = {}) {
  return {
    rootPath,
    relativePath,
    fileName: path.basename(filePath),
    kind: overrides.kind ?? "unsupported",
    language: overrides.language ?? null,
    mimeType: overrides.mimeType ?? null,
    textContents: overrides.textContents ?? "",
    binaryContentsBase64: overrides.binaryContentsBase64 ?? "",
    lastModifiedMs: stats.mtimeMs,
    fallbackReason: overrides.fallbackReason ?? ""
  };
}

module.exports = {
  MAX_WORKSPACE_TEXT_PREVIEW_BYTES,
  MAX_WORKSPACE_MEDIA_PREVIEW_BYTES,
  resolveWorkspaceFilePath,
  readWorkspaceFilePreview
};
```

- [ ] **Step 4: Implement the read-path branches for text, media, and fallback kinds**

```js
function readWorkspaceFilePreview(rootPath, relativePath, options = {}) {
  const resolved = resolveWorkspaceFilePath(rootPath, relativePath);
  const normalizedRelativePath = normalizeRelativePath(resolved.rootPath, resolved.filePath);
  const extension = path.extname(resolved.filePath).toLowerCase();
  const textLanguage = TEXT_LANGUAGE_BY_EXTENSION.get(extension) ?? null;
  const descriptor = FILE_KIND_BY_EXTENSION.get(extension) ?? null;

  if (textLanguage !== null) {
    if (resolved.stats.size > MAX_WORKSPACE_TEXT_PREVIEW_BYTES) {
      return createPreviewPayload(resolved.rootPath, normalizedRelativePath, resolved.filePath, resolved.stats, {
        kind: "too-large",
        language: textLanguage,
        fallbackReason: "This file is too large for internal preview."
      });
    }

    const rawContents = fs.readFileSync(resolved.filePath, "utf8");

    if (textLanguage === "json") {
      try {
        return createPreviewPayload(resolved.rootPath, normalizedRelativePath, resolved.filePath, resolved.stats, {
          kind: "json",
          language: "json",
          mimeType: "application/json",
          textContents: `${JSON.stringify(JSON.parse(rawContents), null, 2)}\n`
        });
      } catch {
        return createPreviewPayload(resolved.rootPath, normalizedRelativePath, resolved.filePath, resolved.stats, {
          kind: "text",
          language: "json",
          mimeType: "application/json",
          textContents: rawContents
        });
      }
    }

    return createPreviewPayload(resolved.rootPath, normalizedRelativePath, resolved.filePath, resolved.stats, {
      kind: "text",
      language: textLanguage,
      mimeType: "text/plain",
      textContents: rawContents
    });
  }

  if (descriptor?.kind === "image" || descriptor?.kind === "pdf") {
    if (resolved.stats.size > MAX_WORKSPACE_MEDIA_PREVIEW_BYTES) {
      return createPreviewPayload(resolved.rootPath, normalizedRelativePath, resolved.filePath, resolved.stats, {
        kind: "too-large",
        mimeType: descriptor.mimeType,
        fallbackReason: "This file is too large for internal preview."
      });
    }

    return createPreviewPayload(resolved.rootPath, normalizedRelativePath, resolved.filePath, resolved.stats, {
      kind: descriptor.kind,
      mimeType: descriptor.mimeType,
      binaryContentsBase64: fs.readFileSync(resolved.filePath).toString("base64")
    });
  }

  if (descriptor !== null) {
    return createPreviewPayload(resolved.rootPath, normalizedRelativePath, resolved.filePath, resolved.stats, {
      kind: descriptor.kind,
      mimeType: descriptor.mimeType,
      fallbackReason: "This file type is not previewed inside the app."
    });
  }

  return createPreviewPayload(resolved.rootPath, normalizedRelativePath, resolved.filePath, resolved.stats, {
    kind: "unsupported",
    fallbackReason: "This file type is not previewed inside the app."
  });
}
```

- [ ] **Step 5: Re-run the preview helper tests to verify they pass**

Run: `node --test test/workspace-file-preview.test.js`
Expected: PASS, including the new image, PDF, and fallback classification coverage.

- [ ] **Step 6: Commit the preview-classification milestone**

```bash
git add test/workspace-file-preview.test.js workspace_file_preview.js
git commit -m "feat: classify workspace preview file kinds"
```

### Task 2: Add safe external-open and reveal actions to the Electron boundary

**Files:**
- Modify: `test/canvas-workspace-ipc-main.test.js`
- Modify: `test/preload-bridge.test.js`
- Modify: `main.js`
- Modify: `preload.js`

- [ ] **Step 1: Write the failing main-process and preload tests**

```js
test("workspace-file:open-external opens a selected file inside the active workspace", async () => {
  const openPathCalls = [];
  const { handlers } = loadMainWithMocks({
    smokeTest: true,
    showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
    shell: {
      openPath: async (filePath) => {
        openPathCalls.push(filePath);
        return "";
      },
      showItemInFolder: () => {}
    }
  });

  await handlers.get("workspace-directory:debug-open")(
    { sender: { id: 44 } },
    { directoryPath: workspacePath }
  );

  const response = await handlers.get("workspace-file:open-external")(
    { sender: { id: 44 } },
    { folderId: handlers.get("workspace-directory:state")({ sender: { id: 44 } }).activeFolderId, relativePath: "report.pdf" }
  );

  assert.deepEqual(openPathCalls, [path.join(fs.realpathSync(workspacePath), "report.pdf")]);
  assert.deepEqual(response, { ok: true });
});

test("preload exposes workspace external-open and reveal methods", () => {
  const { exposedApi, invokeCalls } = loadPreloadWithMocks();

  exposedApi.openWorkspaceFileExternally("folder-1", "report.pdf");
  exposedApi.revealWorkspaceFile("folder-1", "report.pdf");

  assert.deepEqual(invokeCalls, [
    ["workspace-file:open-external", { folderId: "folder-1", relativePath: "report.pdf" }],
    ["workspace-file:reveal", { folderId: "folder-1", relativePath: "report.pdf" }]
  ]);
});

function loadMainWithMocks({
  smokeTest = false,
  showOpenDialog,
  shell = {
    openPath: async () => "",
    showItemInFolder: () => {}
  }
}) {
  const handlers = new Map();
  const electronStub = {
    app: {
      whenReady: () => new Promise(() => {}),
      on: () => {},
      quit: () => {},
      exit: () => {},
      getPath: () => os.homedir()
    },
    BrowserWindow: {
      fromWebContents: () => ({})
    },
    dialog: {
      showOpenDialog
    },
    ipcMain: {
      handle: (channel, handler) => {
        handlers.set(channel, handler);
      },
      on: () => {}
    },
    webContents: {
      fromId: () => ({
        isDestroyed: () => false,
        send: () => {}
      })
    },
    shell
  };

  return { handlers, electronStub };
}
```

- [ ] **Step 2: Run the targeted IPC and preload tests to verify they fail**

Run: `node --test test/canvas-workspace-ipc-main.test.js test/preload-bridge.test.js`
Expected: FAIL because the new IPC handlers and preload methods do not exist yet.

- [ ] **Step 3: Add the narrow preload bridge methods**

```js
openWorkspaceFileExternally: (folderId, relativePath) => {
  return ipcRenderer.invoke("workspace-file:open-external", { folderId, relativePath });
},
revealWorkspaceFile: (folderId, relativePath) => {
  return ipcRenderer.invoke("workspace-file:reveal", { folderId, relativePath });
},
```

- [ ] **Step 4: Add main-process path validation plus external-open and reveal handlers**

```js
const { app, BrowserWindow, dialog, ipcMain, shell, webContents } = require("electron");
const { resolveWorkspaceFilePath } = require("./workspace_file_preview");

function resolveWorkspaceFileForOwner(ownerWebContentsId, folderId, relativePath) {
  const workspaceRegistry = getExistingOwnerWorkspaceRegistry(ownerWebContentsId);
  const folderRecord = workspaceRegistry.importedFolders.find((folder) => folder.id === folderId);

  if (folderRecord == null) {
    throw new Error("Unable to resolve workspace folder for file action.");
  }

  return resolveWorkspaceFilePath(folderRecord.rootPath, relativePath);
}

ipcMain.handle("workspace-file:open-external", async (event, payload) => {
  const resolvedFile = resolveWorkspaceFileForOwner(event.sender.id, payload?.folderId, payload?.relativePath);
  const errorMessage = await shell.openPath(resolvedFile.filePath);

  if (typeof errorMessage === "string" && errorMessage.length > 0) {
    throw new Error(errorMessage);
  }

  return { ok: true };
});

ipcMain.handle("workspace-file:reveal", (event, payload) => {
  const resolvedFile = resolveWorkspaceFileForOwner(event.sender.id, payload?.folderId, payload?.relativePath);
  shell.showItemInFolder(resolvedFile.filePath);
  return { ok: true };
});
```

- [ ] **Step 5: Re-run the IPC and preload tests to verify they pass**

Run: `node --test test/canvas-workspace-ipc-main.test.js test/preload-bridge.test.js`
Expected: PASS

- [ ] **Step 6: Commit the Electron-boundary milestone**

```bash
git add test/canvas-workspace-ipc-main.test.js test/preload-bridge.test.js main.js preload.js
git commit -m "feat: add workspace preview fallback actions"
```

### Task 3: Add a browser-safe preview view-model helper and wire richer inspector rendering

**Files:**
- Create: `renderer_workspace_preview.js`
- Create: `test/renderer-workspace-preview.test.js`
- Modify: `test/renderer-browser-helpers.test.js`
- Modify: `index.html`
- Modify: `renderer.js`
- Modify: `styles.css`

- [ ] **Step 1: Write the failing preview-helper tests**

```js
const test = require("node:test");
const assert = require("node:assert/strict");

const { deriveWorkspacePreviewViewModel } = require("../renderer_workspace_preview.js");

test("deriveWorkspacePreviewViewModel returns a media mode for image and pdf previews", () => {
  const imageView = deriveWorkspacePreviewViewModel({
    status: "ready",
    data: { kind: "image", fileName: "pixel.png", mimeType: "image/png" }
  });
  const pdfView = deriveWorkspacePreviewViewModel({
    status: "ready",
    data: { kind: "pdf", fileName: "report.pdf", mimeType: "application/pdf" }
  });

  assert.equal(imageView.mode, "media");
  assert.equal(imageView.mediaKind, "image");
  assert.equal(pdfView.mode, "media");
  assert.equal(pdfView.mediaKind, "pdf");
});

test("deriveWorkspacePreviewViewModel returns fallback actions for unsupported preview kinds", () => {
  const viewModel = deriveWorkspacePreviewViewModel({
    status: "ready",
    data: {
      kind: "binary",
      fileName: "bundle.zip",
      fallbackReason: "This file type is not previewed inside the app."
    }
  });

  assert.equal(viewModel.mode, "fallback");
  assert.deepEqual(viewModel.actions, ["open-external", "reveal"]);
  assert.match(viewModel.message, /not previewed inside the app/u);
});
```

- [ ] **Step 2: Run the helper tests to verify they fail**

Run: `node --test test/renderer-workspace-preview.test.js test/renderer-browser-helpers.test.js`
Expected: FAIL because `renderer_workspace_preview.js` does not exist and the browser-helper test does not know about it yet.

- [ ] **Step 3: Create the browser-safe preview helper and load it from `index.html`**

```js
(function (root, factory) {
  const exports = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = exports;
  }

  if (root && typeof root === "object") {
    root.noteCanvasRendererWorkspacePreview = exports;

    if (root.window && typeof root.window === "object") {
      root.window.noteCanvasRendererWorkspacePreview = exports;
    }
  }
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  function deriveWorkspacePreviewViewModel(previewState) {
    const data = previewState?.data ?? null;

    if (previewState?.status === "loading") {
      return { mode: "loading", showRefresh: false };
    }

    if (previewState?.status === "error") {
      return {
        mode: "error",
        showRefresh: true,
        message: previewState?.errorMessage || "Preview failed."
      };
    }

    if (data === null) {
      return { mode: "empty", showRefresh: false };
    }

    if (data.kind === "text" || data.kind === "json") {
      return { mode: "text", showRefresh: true };
    }

    if (data.kind === "image" || data.kind === "pdf") {
      return { mode: "media", mediaKind: data.kind, showRefresh: true };
    }

    return {
      mode: "fallback",
      showRefresh: data.kind !== "unsupported",
      message: data.fallbackReason || "This file type is not previewed inside the app.",
      actions: ["open-external", "reveal"]
    };
  }

  return {
    deriveWorkspacePreviewViewModel
  };
});
```

```html
<script src="./renderer_workspace_preview.js"></script>
<script src="./renderer.js"></script>
```

- [ ] **Step 4: Update `renderer.js` to render text, image, PDF, and fallback states while revoking blob URLs safely**

```js
const { deriveWorkspacePreviewViewModel } = window.noteCanvasRendererWorkspacePreview;

let activeWorkspacePreviewObjectUrl = null;

function revokeWorkspacePreviewObjectUrl() {
  if (typeof activeWorkspacePreviewObjectUrl === "string") {
    URL.revokeObjectURL(activeWorkspacePreviewObjectUrl);
    activeWorkspacePreviewObjectUrl = null;
  }
}

function getWorkspacePreviewObjectUrl(previewData) {
  revokeWorkspacePreviewObjectUrl();

  if (typeof previewData?.binaryContentsBase64 !== "string" || previewData.binaryContentsBase64.length === 0 || typeof previewData?.mimeType !== "string") {
    return null;
  }

  const binaryString = window.atob(previewData.binaryContentsBase64);
  const bytes = Uint8Array.from(binaryString, (character) => character.charCodeAt(0));
  activeWorkspacePreviewObjectUrl = URL.createObjectURL(new Blob([bytes], { type: previewData.mimeType }));
  return activeWorkspacePreviewObjectUrl;
}

function clearWorkspacePreview(options = {}) {
  revokeWorkspacePreviewObjectUrl();
  // existing preview-state reset logic stays here
}

function renderFileInspector() {
  const viewModel = deriveWorkspacePreviewViewModel(workspacePreviewState);
  const activeFolder = getActiveWorkspaceFolder();
  const selectedRelativePath = workspacePreviewState.relativePath;

  if (viewModel.mode === "text") {
    const pre = document.createElement("pre");
    pre.className = "file-inspector-pre";
    pre.textContent = workspacePreviewState.data?.textContents ?? "";
    body.append(pre);
  } else if (viewModel.mode === "media") {
    const previewUrl = getWorkspacePreviewObjectUrl(workspacePreviewState.data);

    if (viewModel.mediaKind === "image") {
      const image = document.createElement("img");
      image.className = "file-inspector-media-image";
      image.src = previewUrl ?? "";
      body.append(image);
    } else {
      const frame = document.createElement("iframe");
      frame.className = "file-inspector-media-pdf";
      frame.src = previewUrl ?? "";
      body.append(frame);
    }
  } else if (viewModel.mode === "fallback") {
    const openButton = document.createElement("button");
    openButton.className = "file-inspector-action";
    openButton.textContent = "Open externally";
    openButton.addEventListener("click", () => {
      if (activeFolder && selectedRelativePath) {
        void window.noteCanvas.openWorkspaceFileExternally(activeFolder.id, selectedRelativePath).catch(console.error);
      }
    });

    const revealButton = document.createElement("button");
    revealButton.className = "file-inspector-action";
    revealButton.textContent = "Reveal in Finder";
    revealButton.addEventListener("click", () => {
      if (activeFolder && selectedRelativePath) {
        void window.noteCanvas.revealWorkspaceFile(activeFolder.id, selectedRelativePath).catch(console.error);
      }
    });

    body.append(openButton, revealButton);
  }
}
```

- [ ] **Step 5: Add the new inspector styles without making the panel feel editor-heavy**

```css
.file-inspector-media {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 240px;
  padding: 16px;
}

.file-inspector-media-image,
.file-inspector-media-pdf {
  width: 100%;
  max-height: 100%;
  border: 0;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.04);
}

.file-inspector-fallback {
  display: grid;
  gap: 12px;
}

.file-inspector-action {
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.04);
  color: inherit;
  border-radius: 10px;
  padding: 10px 12px;
  text-align: left;
}
```

- [ ] **Step 6: Run the helper tests and parser build to verify the renderer milestone passes**

Run: `node --test test/renderer-workspace-preview.test.js test/renderer-browser-helpers.test.js`
Expected: PASS

Run: `npm run build`
Expected: PASS

- [ ] **Step 7: Commit the renderer preview milestone**

```bash
git add renderer_workspace_preview.js test/renderer-workspace-preview.test.js test/renderer-browser-helpers.test.js index.html renderer.js styles.css
git commit -m "feat: render richer workspace previews"
```

### Task 4: Extend smoke coverage for image, PDF, and fallback states, then run full verification

**Files:**
- Modify: `main.js`

- [ ] **Step 1: Add failing smoke assertions for image preview, PDF preview, and fallback actions**

```js
const onePixelPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WnB9pAAAAAASUVORK5CYII=",
  "base64"
);
const tinyPdf = Buffer.from(
  "%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n",
  "utf8"
);

fs.mkdirSync(path.join(smokeWorkspacePath, "artifacts"), { recursive: true });
fs.writeFileSync(path.join(smokeWorkspacePath, "artifacts", "pixel.png"), onePixelPng);
fs.writeFileSync(path.join(smokeWorkspacePath, "artifacts", "report.pdf"), tinyPdf);
fs.writeFileSync(path.join(smokeWorkspacePath, "artifacts", "bundle.zip"), Buffer.from([0x50, 0x4b, 0x03, 0x04]));

await window.webContents.executeJavaScript(`window.__canvasLearningDebug.selectWorkspaceFile(${JSON.stringify("artifacts/pixel.png")})`);
const imagePreviewSnapshot = await waitForSnapshot(
  `(() => {
    const snapshot = window.__canvasLearningDebug.getSnapshot();
    return {
      ...snapshot,
      hasMediaPreview: Boolean(document.querySelector(".file-inspector-media-image"))
    };
  })()`,
  (snapshot) => snapshot.workspacePreviewKind === "image" && snapshot.workspacePreviewMimeType === "image/png" && snapshot.hasMediaPreview === true,
  4000
);

await window.webContents.executeJavaScript(`window.__canvasLearningDebug.selectWorkspaceFile(${JSON.stringify("artifacts/report.pdf")})`);
const pdfPreviewSnapshot = await waitForSnapshot(
  `(() => {
    const snapshot = window.__canvasLearningDebug.getSnapshot();
    return {
      ...snapshot,
      hasEmbeddedPdf: Boolean(document.querySelector(".file-inspector-media-pdf"))
    };
  })()`,
  (snapshot) => snapshot.workspacePreviewKind === "pdf" && snapshot.workspacePreviewMimeType === "application/pdf" && snapshot.hasEmbeddedPdf === true,
  4000
);

await window.webContents.executeJavaScript(`window.__canvasLearningDebug.selectWorkspaceFile(${JSON.stringify("artifacts/bundle.zip")})`);
const fallbackSnapshot = await waitForSnapshot(
  `(() => ({
    ...window.__canvasLearningDebug.getSnapshot(),
    fallbackActions: [...document.querySelectorAll(".file-inspector-action")].map((node) => node.textContent.trim())
  }))()`,
  (snapshot) => snapshot.workspacePreviewKind === "binary" && snapshot.workspacePreviewFallbackReason.length > 0 && snapshot.fallbackActions.includes("Open externally") && snapshot.fallbackActions.includes("Reveal in Finder"),
  4000
);
```

- [ ] **Step 2: Run the smoke flow to verify the new assertions fail first**

Run: `CANVAS_SMOKE_TEST=1 npm run dev`
Expected: FAIL because the inspector does not yet surface image, PDF, and fallback states in a smoke-observable way.

- [ ] **Step 3: Finish any smoke-only debug snapshot wiring needed for the new inspector states**

```js
getSnapshot: () => ({
  workspacePreviewKind: workspacePreviewState.data?.kind ?? null,
  workspacePreviewMimeType: workspacePreviewState.data?.mimeType ?? null,
  workspacePreviewRelativePath: workspacePreviewState.relativePath,
  workspacePreviewFallbackReason: workspacePreviewState.data?.fallbackReason ?? ""
})
```

- [ ] **Step 4: Run the full verification suite**

Run: `npm test`
Expected: PASS

Run: `npm run build`
Expected: PASS

Run: `CANVAS_SMOKE_TEST=1 npm run dev`
Expected: PASS, including the new image, PDF, and fallback action assertions.

- [ ] **Step 5: Commit the smoke-coverage milestone**

```bash
git add main.js
git commit -m "test: cover richer workspace preview states"
```

## Spec Coverage Check

- Richer internal preview support: Task 1 and Task 3
- Explicit fallback actions: Task 2 and Task 3
- Canvas-owned preview persistence preserved: Task 3 and Task 4
- Security boundary preserved in main/preload: Task 1 and Task 2
- Large-workspace lazy tree rewrite deferred: intentionally out of scope for this plan

## Notes For Execution

- Do not change the canvas-owned workspace model introduced on `canvas-owned-workspaces`.
- Do not add a `webview`, framework migration, or editing surface while implementing this plan.
- Keep `renderer_workspace_preview.js` dual-mode like the existing renderer helper files so Node tests can `require()` it and the browser can consume it as `window.noteCanvasRendererWorkspacePreview`.
- If `shell.openPath()` returns a non-empty string, surface it as an error rather than silently swallowing it.
- Revoke any previously created object URL whenever the selected binary preview changes or clears.
