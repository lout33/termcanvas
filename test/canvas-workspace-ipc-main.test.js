const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Module = require("node:module");

function createMockContents(id, contentsEventHandlers, sentMessages) {
  return {
    id,
    on: (eventName, handler) => {
      contentsEventHandlers.set(eventName, handler);
    },
    once: (eventName, handler) => {
      contentsEventHandlers.set(eventName, handler);
    },
    isDestroyed: () => false,
    send: (channel, payload) => {
      sentMessages.push({ ownerWebContentsId: id, channel, payload });
    }
  };
}

function loadMainWithMocks({ smokeTest = false, showOpenDialog, showSaveDialog, openPathResult = "", resolveWhenReady = false }) {
  const handlers = new Map();
  const openPathCalls = [];
  const openExternalCalls = [];
  const showItemInFolderCalls = [];
  const createdWindows = [];
  const appEventHandlers = new Map();
  const contentsEventHandlers = new Map();
  const sentMessages = [];

  function createMockWindow(options = {}) {
    const window = {
      title: options.title,
      once: () => {},
      show: () => {},
      loadFile: () => {},
      webContents: {
        once: () => {},
        on: () => {},
        setWindowOpenHandler: (handler) => {
          window.webContents.windowOpenHandler = handler;
        }
      }
    };

    createdWindows.push(window);
    return window;
  }

  function MockBrowserWindow(options) {
    return createMockWindow(options);
  }

  MockBrowserWindow.fromWebContents = () => ({});
  MockBrowserWindow.getAllWindows = () => createdWindows;

  const electronStub = {
    app: {
      whenReady: () => resolveWhenReady ? Promise.resolve() : new Promise(() => {}),
      on: (eventName, handler) => {
        appEventHandlers.set(eventName, handler);
      },
      quit: () => {},
      exit: () => {},
      getPath: () => os.homedir()
    },
    BrowserWindow: MockBrowserWindow,
    dialog: {
      showOpenDialog,
      showSaveDialog
    },
    shell: {
      openPath: async (targetPath) => {
        openPathCalls.push(targetPath);
        return typeof openPathResult === "function"
          ? openPathResult(targetPath)
          : openPathResult;
      },
      openExternal: async (targetPath) => {
        openExternalCalls.push(targetPath);
      },
      showItemInFolder: (targetPath) => {
        showItemInFolderCalls.push(targetPath);
      }
    },
    ipcMain: {
      handle: (channel, handler) => {
        handlers.set(channel, handler);
      },
      on: (channel, handler) => {
        handlers.set(channel, handler);
      }
    },
    webContents: {
      fromId: (id) => createMockContents(id, contentsEventHandlers, sentMessages)
    }
  };

  const originalLoad = Module._load;
  const originalSmokeTest = process.env.CANVAS_SMOKE_TEST;
  const mainPath = require.resolve("../main.js");

  if (smokeTest) {
    process.env.CANVAS_SMOKE_TEST = "1";
  } else {
    delete process.env.CANVAS_SMOKE_TEST;
  }

  Module._load = function mockLoad(request, parent, isMain) {
    if (request === "electron") {
      return electronStub;
    }

    if (request === "node-pty") {
      return {};
    }

    return originalLoad.call(this, request, parent, isMain);
  };

  delete require.cache[mainPath];

  try {
    require(mainPath);
  } finally {
    Module._load = originalLoad;

    if (originalSmokeTest === undefined) {
      delete process.env.CANVAS_SMOKE_TEST;
    } else {
      process.env.CANVAS_SMOKE_TEST = originalSmokeTest;
    }
  }

  return {
    handlers,
    mainPath,
    openPathCalls,
    openExternalCalls,
    createdWindows,
    showItemInFolderCalls,
    appEventHandlers,
    contentsEventHandlers,
    sentMessages
  };
}

test("workspace-directory:choose-canvas replaces the owner's existing workspace registry", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "canvas-workspace-ipc-"));
  const firstWorkspacePath = path.join(tempRoot, "workspace-a");
  const secondWorkspacePath = path.join(tempRoot, "workspace-b");
  const originalSmokeTest = process.env.CANVAS_SMOKE_TEST;

  fs.mkdirSync(firstWorkspacePath, { recursive: true });
  fs.mkdirSync(secondWorkspacePath, { recursive: true });

  const { handlers, mainPath } = loadMainWithMocks({
    smokeTest: true,
    showOpenDialog: async () => ({
      canceled: false,
      filePaths: [secondWorkspacePath]
    })
  });

  const debugOpenHandler = handlers.get("workspace-directory:debug-open");
  const chooseCanvasHandler = handlers.get("workspace-directory:choose-canvas");
  const restoreHandler = handlers.get("workspace-session:restore");

  assert.equal(typeof debugOpenHandler, "function");
  assert.equal(typeof chooseCanvasHandler, "function");

  process.env.CANVAS_SMOKE_TEST = "1";

  await debugOpenHandler(
    { sender: { id: 17 } },
    { directoryPath: firstWorkspacePath }
  );

  const response = await chooseCanvasHandler({ sender: { id: 17 } });

  assert.equal(response.canceled, false);
  assert.deepEqual(
    response.state.importedFolders.map((folder) => folder.rootPath),
    [fs.realpathSync(secondWorkspacePath)]
  );

  restoreHandler({ sender: { id: 17 } }, { importedRootPaths: [], activeRootPath: null });
  delete require.cache[mainPath];
  fs.rmSync(tempRoot, { recursive: true, force: true });

  if (originalSmokeTest === undefined) {
    delete process.env.CANVAS_SMOKE_TEST;
  } else {
    process.env.CANVAS_SMOKE_TEST = originalSmokeTest;
  }
});

test("workspace-directory:choose-canvas preserves the current workspace when the replacement directory is unavailable", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "canvas-workspace-ipc-"));
  const firstWorkspacePath = path.join(tempRoot, "workspace-a");
  const missingWorkspacePath = path.join(tempRoot, "missing-workspace");
  const originalSmokeTest = process.env.CANVAS_SMOKE_TEST;

  fs.mkdirSync(firstWorkspacePath, { recursive: true });

  const { handlers, mainPath } = loadMainWithMocks({
    smokeTest: true,
    showOpenDialog: async () => ({
      canceled: false,
      filePaths: [missingWorkspacePath]
    })
  });

  const debugOpenHandler = handlers.get("workspace-directory:debug-open");
  const chooseCanvasHandler = handlers.get("workspace-directory:choose-canvas");
  const stateHandler = handlers.get("workspace-directory:state");
  const restoreHandler = handlers.get("workspace-session:restore");

  process.env.CANVAS_SMOKE_TEST = "1";

  await debugOpenHandler(
    { sender: { id: 23 } },
    { directoryPath: firstWorkspacePath }
  );

  await assert.rejects(
    () => chooseCanvasHandler({ sender: { id: 23 } }),
    /Selected workspace folder is unavailable\./u
  );

  const state = stateHandler({ sender: { id: 23 } });

  assert.deepEqual(
    state.importedFolders.map((folder) => folder.rootPath),
    [fs.realpathSync(firstWorkspacePath)]
  );

  restoreHandler({ sender: { id: 23 } }, { importedRootPaths: [], activeRootPath: null });
  delete require.cache[mainPath];
  fs.rmSync(tempRoot, { recursive: true, force: true });

  if (originalSmokeTest === undefined) {
    delete process.env.CANVAS_SMOKE_TEST;
  } else {
    process.env.CANVAS_SMOKE_TEST = originalSmokeTest;
  }
});

test("workspace-file:open-external opens a file inside the owner workspace and rejects cross-owner access", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "canvas-workspace-ipc-"));
  const ownerWorkspacePath = path.join(tempRoot, "owner-workspace");
  const otherWorkspacePath = path.join(tempRoot, "other-workspace");
  const ownerFilePath = path.join(ownerWorkspacePath, "docs", "notes.md");
  const otherFilePath = path.join(otherWorkspacePath, "private.txt");
  const originalSmokeTest = process.env.CANVAS_SMOKE_TEST;

  fs.mkdirSync(path.dirname(ownerFilePath), { recursive: true });
  fs.mkdirSync(otherWorkspacePath, { recursive: true });
  fs.writeFileSync(ownerFilePath, "owner notes\n", "utf8");
  fs.writeFileSync(otherFilePath, "private\n", "utf8");

  const { handlers, mainPath, openPathCalls } = loadMainWithMocks({
    smokeTest: true,
    showOpenDialog: async () => ({ canceled: true, filePaths: [] })
  });

  const debugOpenHandler = handlers.get("workspace-directory:debug-open");
  const openExternalHandler = handlers.get("workspace-file:open-external");
  const stateHandler = handlers.get("workspace-directory:state");
  const restoreHandler = handlers.get("workspace-session:restore");

  assert.equal(typeof openExternalHandler, "function");

  process.env.CANVAS_SMOKE_TEST = "1";

  await debugOpenHandler({ sender: { id: 41 } }, { directoryPath: ownerWorkspacePath });
  await debugOpenHandler({ sender: { id: 42 } }, { directoryPath: otherWorkspacePath });

  const ownerFolderId = stateHandler({ sender: { id: 41 } }).importedFolders[0].id;

  await openExternalHandler(
    { sender: { id: 41 } },
    { folderId: ownerFolderId, relativePath: "docs/notes.md" }
  );

  assert.deepEqual(openPathCalls, [fs.realpathSync(ownerFilePath)]);

  await assert.rejects(
    () => openExternalHandler(
      { sender: { id: 43 } },
      { folderId: ownerFolderId, relativePath: "docs/notes.md" }
    ),
    /Open a workspace folder before opening files externally\./u
  );

  restoreHandler({ sender: { id: 41 } }, { importedRootPaths: [], activeRootPath: null });
  restoreHandler({ sender: { id: 42 } }, { importedRootPaths: [], activeRootPath: null });
  delete require.cache[mainPath];
  fs.rmSync(tempRoot, { recursive: true, force: true });

  if (originalSmokeTest === undefined) {
    delete process.env.CANVAS_SMOKE_TEST;
  } else {
    process.env.CANVAS_SMOKE_TEST = originalSmokeTest;
  }
});

test("workspace-file:reveal shows a file in its folder and rejects paths outside the workspace root", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "canvas-workspace-ipc-"));
  const workspacePath = path.join(tempRoot, "workspace");
  const revealFilePath = path.join(workspacePath, "reports", "result.txt");
  const outsideFilePath = path.join(tempRoot, "escape.txt");
  const originalSmokeTest = process.env.CANVAS_SMOKE_TEST;

  fs.mkdirSync(path.dirname(revealFilePath), { recursive: true });
  fs.writeFileSync(revealFilePath, "result\n", "utf8");
  fs.writeFileSync(outsideFilePath, "escape\n", "utf8");

  const { handlers, mainPath, showItemInFolderCalls } = loadMainWithMocks({
    smokeTest: true,
    showOpenDialog: async () => ({ canceled: true, filePaths: [] })
  });

  const debugOpenHandler = handlers.get("workspace-directory:debug-open");
  const revealHandler = handlers.get("workspace-file:reveal");
  const stateHandler = handlers.get("workspace-directory:state");
  const restoreHandler = handlers.get("workspace-session:restore");

  assert.equal(typeof revealHandler, "function");

  process.env.CANVAS_SMOKE_TEST = "1";

  await debugOpenHandler({ sender: { id: 51 } }, { directoryPath: workspacePath });

  const folderId = stateHandler({ sender: { id: 51 } }).importedFolders[0].id;

  await revealHandler(
    { sender: { id: 51 } },
    { folderId, relativePath: "reports/result.txt" }
  );

  assert.deepEqual(showItemInFolderCalls, [fs.realpathSync(revealFilePath)]);

  assert.throws(
    () => revealHandler(
      { sender: { id: 51 } },
      { folderId, relativePath: "../escape.txt" }
    ),
    /Workspace file preview must stay inside the workspace root\./u
  );

  restoreHandler({ sender: { id: 51 } }, { importedRootPaths: [], activeRootPath: null });
  delete require.cache[mainPath];
  fs.rmSync(tempRoot, { recursive: true, force: true });

  if (originalSmokeTest === undefined) {
    delete process.env.CANVAS_SMOKE_TEST;
  } else {
    process.env.CANVAS_SMOKE_TEST = originalSmokeTest;
  }
});

test("workspace-file:reveal stays scoped to the caller's workspace registry", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "canvas-workspace-ipc-"));
  const ownerWorkspacePath = path.join(tempRoot, "owner-workspace");
  const otherWorkspacePath = path.join(tempRoot, "other-workspace");
  const ownerFilePath = path.join(ownerWorkspacePath, "reports", "result.txt");
  const otherFilePath = path.join(otherWorkspacePath, "reports", "result.txt");
  const originalSmokeTest = process.env.CANVAS_SMOKE_TEST;

  fs.mkdirSync(path.dirname(ownerFilePath), { recursive: true });
  fs.mkdirSync(path.dirname(otherFilePath), { recursive: true });
  fs.writeFileSync(ownerFilePath, "owner result\n", "utf8");
  fs.writeFileSync(otherFilePath, "other result\n", "utf8");

  const { handlers, mainPath, showItemInFolderCalls } = loadMainWithMocks({
    smokeTest: true,
    showOpenDialog: async () => ({ canceled: true, filePaths: [] })
  });

  const debugOpenHandler = handlers.get("workspace-directory:debug-open");
  const revealHandler = handlers.get("workspace-file:reveal");
  const stateHandler = handlers.get("workspace-directory:state");
  const restoreHandler = handlers.get("workspace-session:restore");

  process.env.CANVAS_SMOKE_TEST = "1";

  await debugOpenHandler({ sender: { id: 61 } }, { directoryPath: ownerWorkspacePath });
  await debugOpenHandler({ sender: { id: 62 } }, { directoryPath: otherWorkspacePath });

  const ownerFolderId = stateHandler({ sender: { id: 61 } }).importedFolders[0].id;
  const otherFolderId = stateHandler({ sender: { id: 62 } }).importedFolders[0].id;

  await revealHandler(
    { sender: { id: 61 } },
    { folderId: ownerFolderId, relativePath: "reports/result.txt" }
  );

  await revealHandler(
    { sender: { id: 62 } },
    { folderId: otherFolderId, relativePath: "reports/result.txt" }
  );

  assert.deepEqual(showItemInFolderCalls, [
    fs.realpathSync(ownerFilePath),
    fs.realpathSync(otherFilePath)
  ]);

  restoreHandler({ sender: { id: 61 } }, { importedRootPaths: [], activeRootPath: null });
  restoreHandler({ sender: { id: 62 } }, { importedRootPaths: [], activeRootPath: null });
  delete require.cache[mainPath];
  fs.rmSync(tempRoot, { recursive: true, force: true });

  if (originalSmokeTest === undefined) {
    delete process.env.CANVAS_SMOKE_TEST;
  } else {
    process.env.CANVAS_SMOKE_TEST = originalSmokeTest;
  }
});

test("workspace-entry:reveal supports files, directories, and the workspace root", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "canvas-workspace-ipc-"));
  const workspacePath = path.join(tempRoot, "workspace");
  const directoryPath = path.join(workspacePath, "docs");
  const filePath = path.join(directoryPath, "notes.md");
  const originalSmokeTest = process.env.CANVAS_SMOKE_TEST;

  fs.mkdirSync(directoryPath, { recursive: true });
  fs.writeFileSync(filePath, "notes\n", "utf8");

  const { handlers, mainPath, showItemInFolderCalls } = loadMainWithMocks({
    smokeTest: true,
    showOpenDialog: async () => ({ canceled: true, filePaths: [] })
  });

  const debugOpenHandler = handlers.get("workspace-directory:debug-open");
  const revealEntryHandler = handlers.get("workspace-entry:reveal");
  const stateHandler = handlers.get("workspace-directory:state");
  const restoreHandler = handlers.get("workspace-session:restore");

  assert.equal(typeof revealEntryHandler, "function");

  process.env.CANVAS_SMOKE_TEST = "1";

  await debugOpenHandler({ sender: { id: 66 } }, { directoryPath: workspacePath });

  const folderId = stateHandler({ sender: { id: 66 } }).importedFolders[0].id;

  await revealEntryHandler(
    { sender: { id: 66 } },
    { folderId, relativePath: "docs/notes.md" }
  );
  await revealEntryHandler(
    { sender: { id: 66 } },
    { folderId, relativePath: "docs" }
  );
  await revealEntryHandler(
    { sender: { id: 66 } },
    { folderId, relativePath: "" }
  );

  assert.deepEqual(showItemInFolderCalls, [
    fs.realpathSync(filePath),
    fs.realpathSync(directoryPath),
    fs.realpathSync(workspacePath)
  ]);

  restoreHandler({ sender: { id: 66 } }, { importedRootPaths: [], activeRootPath: null });
  delete require.cache[mainPath];
  fs.rmSync(tempRoot, { recursive: true, force: true });

  if (originalSmokeTest === undefined) {
    delete process.env.CANVAS_SMOKE_TEST;
  } else {
    process.env.CANVAS_SMOKE_TEST = originalSmokeTest;
  }
});

test("workspace-file:open-external surfaces shell.openPath errors", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "canvas-workspace-ipc-"));
  const workspacePath = path.join(tempRoot, "workspace");
  const filePath = path.join(workspacePath, "docs", "notes.md");
  const originalSmokeTest = process.env.CANVAS_SMOKE_TEST;

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, "notes\n", "utf8");

  const { handlers, mainPath } = loadMainWithMocks({
    smokeTest: true,
    showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
    openPathResult: "Launch Services failed"
  });

  const debugOpenHandler = handlers.get("workspace-directory:debug-open");
  const openExternalHandler = handlers.get("workspace-file:open-external");
  const stateHandler = handlers.get("workspace-directory:state");
  const restoreHandler = handlers.get("workspace-session:restore");

  process.env.CANVAS_SMOKE_TEST = "1";

  await debugOpenHandler({ sender: { id: 71 } }, { directoryPath: workspacePath });

  const folderId = stateHandler({ sender: { id: 71 } }).importedFolders[0].id;

  await assert.rejects(
    () => openExternalHandler(
      { sender: { id: 71 } },
      { folderId, relativePath: "docs/notes.md" }
    ),
    /Launch Services failed/u
  );

  restoreHandler({ sender: { id: 71 } }, { importedRootPaths: [], activeRootPath: null });
  delete require.cache[mainPath];
  fs.rmSync(tempRoot, { recursive: true, force: true });

  if (originalSmokeTest === undefined) {
    delete process.env.CANVAS_SMOKE_TEST;
  } else {
    process.env.CANVAS_SMOKE_TEST = originalSmokeTest;
  }
});

test("workspace entry create, rename, and delete handlers update the owner workspace safely", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "canvas-workspace-ipc-"));
  const workspacePath = path.join(tempRoot, "workspace");
  const originalSmokeTest = process.env.CANVAS_SMOKE_TEST;

  fs.mkdirSync(workspacePath, { recursive: true });

  const { handlers, mainPath } = loadMainWithMocks({
    smokeTest: true,
    showOpenDialog: async () => ({ canceled: true, filePaths: [] })
  });

  const debugOpenHandler = handlers.get("workspace-directory:debug-open");
  const createDirectoryHandler = handlers.get("workspace-entry:create-directory");
  const createFileHandler = handlers.get("workspace-entry:create-file");
  const renameHandler = handlers.get("workspace-entry:rename");
  const deleteHandler = handlers.get("workspace-entry:delete");
  const stateHandler = handlers.get("workspace-directory:state");
  const restoreHandler = handlers.get("workspace-session:restore");

  process.env.CANVAS_SMOKE_TEST = "1";

  await debugOpenHandler({ sender: { id: 81 } }, { directoryPath: workspacePath });

  const folderId = stateHandler({ sender: { id: 81 } }).importedFolders[0].id;

  const createdDirectory = await createDirectoryHandler(
    { sender: { id: 81 } },
    { folderId, parentRelativePath: "", name: "drafts" }
  );
  assert.equal(createdDirectory.relativePath, "drafts");
  assert.equal(fs.statSync(path.join(workspacePath, "drafts")).isDirectory(), true);

  const createdFile = await createFileHandler(
    { sender: { id: 81 } },
    { folderId, parentRelativePath: "drafts", name: "todo.md" }
  );
  assert.equal(createdFile.relativePath, "drafts/todo.md");
  assert.equal(fs.readFileSync(path.join(workspacePath, "drafts", "todo.md"), "utf8"), "");

  const renamedEntry = await renameHandler(
    { sender: { id: 81 } },
    { folderId, relativePath: "drafts/todo.md", nextName: "todo-final.md" }
  );
  assert.equal(renamedEntry.relativePath, "drafts/todo-final.md");
  assert.equal(fs.existsSync(path.join(workspacePath, "drafts", "todo-final.md")), true);
  assert.equal(fs.existsSync(path.join(workspacePath, "drafts", "todo.md")), false);

  const deletedEntry = await deleteHandler(
    { sender: { id: 81 } },
    { folderId, relativePath: "drafts/todo-final.md" }
  );
  assert.equal(deletedEntry.deletedRelativePath, "drafts/todo-final.md");
  assert.equal(fs.existsSync(path.join(workspacePath, "drafts", "todo-final.md")), false);

  const currentState = stateHandler({ sender: { id: 81 } });
  assert.equal(currentState.importedFolders[0].entries.some((entry) => entry.relativePath === "drafts"), true);
  assert.equal(currentState.importedFolders[0].entries.some((entry) => entry.relativePath === "drafts/todo-final.md"), false);

  restoreHandler({ sender: { id: 81 } }, { importedRootPaths: [], activeRootPath: null });
  delete require.cache[mainPath];
  fs.rmSync(tempRoot, { recursive: true, force: true });

  if (originalSmokeTest === undefined) {
    delete process.env.CANVAS_SMOKE_TEST;
  } else {
    process.env.CANVAS_SMOKE_TEST = originalSmokeTest;
  }
});

test("workspace-file:write saves text-like files and rejects stale writes", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "canvas-workspace-ipc-"));
  const workspacePath = path.join(tempRoot, "workspace");
  const filePath = path.join(workspacePath, "docs", "notes.md");
  const originalSmokeTest = process.env.CANVAS_SMOKE_TEST;

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, "before\n", "utf8");

  const { handlers, mainPath } = loadMainWithMocks({
    smokeTest: true,
    showOpenDialog: async () => ({ canceled: true, filePaths: [] })
  });

  const debugOpenHandler = handlers.get("workspace-directory:debug-open");
  const readHandler = handlers.get("workspace-file:read");
  const writeHandler = handlers.get("workspace-file:write");
  const stateHandler = handlers.get("workspace-directory:state");
  const restoreHandler = handlers.get("workspace-session:restore");

  process.env.CANVAS_SMOKE_TEST = "1";

  await debugOpenHandler({ sender: { id: 91 } }, { directoryPath: workspacePath });

  const folderId = stateHandler({ sender: { id: 91 } }).importedFolders[0].id;
  const initialPreview = await readHandler(
    { sender: { id: 91 } },
    { folderId, relativePath: "docs/notes.md" }
  );

  const savedPreview = await writeHandler(
    { sender: { id: 91 } },
    {
      folderId,
      relativePath: "docs/notes.md",
      textContents: "after\n",
      expectedLastModifiedMs: initialPreview.lastModifiedMs
    }
  );

  assert.equal(savedPreview.textContents, "after\n");
  assert.equal(fs.readFileSync(filePath, "utf8"), "after\n");

  fs.writeFileSync(filePath, "external\n", "utf8");
  const nextMtime = new Date(Math.trunc(savedPreview.lastModifiedMs) + 5000);
  fs.utimesSync(filePath, nextMtime, nextMtime);

  assert.throws(
    () => writeHandler(
      { sender: { id: 91 } },
      {
        folderId,
        relativePath: "docs/notes.md",
        textContents: "stale\n",
        expectedLastModifiedMs: savedPreview.lastModifiedMs
      }
    ),
    /changed on disk/u
  );

  restoreHandler({ sender: { id: 91 } }, { importedRootPaths: [], activeRootPath: null });
  delete require.cache[mainPath];
  fs.rmSync(tempRoot, { recursive: true, force: true });

  if (originalSmokeTest === undefined) {
    delete process.env.CANVAS_SMOKE_TEST;
  } else {
    process.env.CANVAS_SMOKE_TEST = originalSmokeTest;
  }
});

test("createMainWindow denies new windows and opens external links in the system browser", async () => {
  const { createdWindows, openExternalCalls, mainPath } = loadMainWithMocks({
    resolveWhenReady: true,
    showOpenDialog: async () => ({ canceled: true, filePaths: [] })
  });

  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(createdWindows.length, 1);
  assert.equal(createdWindows[0].title, "TermCanvas");
  const handlerResult = createdWindows[0].webContents.windowOpenHandler({ url: "https://example.com/docs" });

  assert.deepEqual(handlerResult, { action: "deny" });
  assert.deepEqual(openExternalCalls, ["https://example.com/docs"]);
  delete require.cache[mainPath];
});

test("Cmd+M is intercepted only when the renderer reports an active terminal", async () => {
  const {
    handlers,
    appEventHandlers,
    contentsEventHandlers,
    sentMessages,
    mainPath
  } = loadMainWithMocks({
    smokeTest: true,
    showOpenDialog: async () => ({ canceled: true, filePaths: [] })
  });
  const contents = createMockContents(91, contentsEventHandlers, sentMessages);

  appEventHandlers.get("web-contents-created")({}, contents);

  const setActiveState = handlers.get("terminal:active-state");
  const beforeInput = contentsEventHandlers.get("before-input-event");
  const preventedEvent = {
    preventDefaultCalled: false,
    preventDefault() {
      this.preventDefaultCalled = true;
    }
  };

  assert.equal(typeof setActiveState, "function");
  assert.equal(typeof beforeInput, "function");

  setActiveState({ sender: { id: 91 } }, { hasActiveTerminal: true });
  beforeInput(preventedEvent, {
    type: "keyDown",
    key: "m",
    meta: true,
    control: false,
    alt: false,
    shift: false
  });

  assert.equal(preventedEvent.preventDefaultCalled, true);
  assert.deepEqual(sentMessages, [{
    ownerWebContentsId: 91,
    channel: "terminal:toggle-maximize-active",
    payload: null
  }]);

  delete require.cache[mainPath];
});

test("Cmd+M is swallowed without forwarding when no active terminal is cached", async () => {
  const {
    appEventHandlers,
    contentsEventHandlers,
    sentMessages,
    mainPath
  } = loadMainWithMocks({
    smokeTest: true,
    showOpenDialog: async () => ({ canceled: true, filePaths: [] })
  });
  const contents = createMockContents(92, contentsEventHandlers, sentMessages);

  appEventHandlers.get("web-contents-created")({}, contents);

  const beforeInput = contentsEventHandlers.get("before-input-event");
  const passthroughEvent = {
    preventDefaultCalled: false,
    preventDefault() {
      this.preventDefaultCalled = true;
    }
  };

  assert.equal(typeof beforeInput, "function");

  beforeInput(passthroughEvent, {
    type: "keyDown",
    key: "m",
    meta: true,
    control: false,
    alt: false,
    shift: false
  });

  assert.equal(passthroughEvent.preventDefaultCalled, true);
  assert.deepEqual(sentMessages, []);
  delete require.cache[mainPath];
});

test("terminal:write ignores missing sessions", () => {
  const { handlers, mainPath } = loadMainWithMocks({
    smokeTest: true,
    showOpenDialog: async () => ({ canceled: true, filePaths: [] })
  });

  const writeTerminal = handlers.get("terminal:write");

  assert.equal(typeof writeTerminal, "function");
  assert.doesNotThrow(() => {
    writeTerminal({ sender: { id: 91 } }, {
      terminalId: "missing-terminal",
      data: "pwd\r"
    });
  });

  delete require.cache[mainPath];
});

test("app-session:save-file writes exported app data to a chosen JSON file", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "termcanvas-app-session-ipc-"));
  const targetPath = path.join(tempRoot, "termcanvas-app-data.json");
  const { handlers, mainPath } = loadMainWithMocks({
    smokeTest: true,
    showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
    showSaveDialog: async () => ({ canceled: false, filePath: targetPath })
  });

  const saveAppSessionFile = handlers.get("app-session:save-file");

  assert.equal(typeof saveAppSessionFile, "function");

  const result = await saveAppSessionFile({ sender: { id: 101 } }, {
    suggestedName: "legacy-export",
    contents: "{\n  \"version\": 1\n}\n"
  });

  assert.deepEqual(result, {
    canceled: false,
    filePath: targetPath
  });
  assert.equal(fs.readFileSync(targetPath, "utf8"), "{\n  \"version\": 1\n}\n");

  delete require.cache[mainPath];
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

test("app-session:open-file reads and normalizes imported app data JSON", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "termcanvas-app-session-ipc-"));
  const sourcePath = path.join(tempRoot, "legacy-app-data.json");
  fs.writeFileSync(sourcePath, JSON.stringify({
    ui: {
      isSidebarCollapsed: false,
      hasDismissedBoardIntro: true
    },
    canvases: [{
      id: "canvas-1",
      name: "Imported",
      terminalNodes: [{}]
    }],
    activeCanvasId: "canvas-1"
  }, null, 2), "utf8");

  const { handlers, mainPath } = loadMainWithMocks({
    smokeTest: true,
    showOpenDialog: async () => ({ canceled: false, filePaths: [sourcePath] })
  });

  const openAppSessionFile = handlers.get("app-session:open-file");

  assert.equal(typeof openAppSessionFile, "function");

  const result = await openAppSessionFile({ sender: { id: 102 } });

  assert.equal(result.canceled, false);
  assert.equal(result.filePath, sourcePath);
  assert.equal(result.snapshot.ui.isSidebarCollapsed, false);
  assert.equal(result.snapshot.ui.hasDismissedBoardIntro, true);
  assert.equal(result.snapshot.canvases.length, 1);
  assert.equal(result.snapshot.canvases[0].name, "Imported");
  assert.equal(result.snapshot.canvases[0].terminalNodes.length, 1);
  assert.equal(result.snapshot.activeCanvasId, "canvas-1");

  delete require.cache[mainPath];
  fs.rmSync(tempRoot, { recursive: true, force: true });
});
