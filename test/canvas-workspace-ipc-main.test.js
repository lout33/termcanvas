const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Module = require("node:module");

function loadMainWithMocks({ smokeTest = false, showOpenDialog, openPathResult = "" }) {
  const handlers = new Map();
  const openPathCalls = [];
  const showItemInFolderCalls = [];
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
    shell: {
      openPath: async (targetPath) => {
        openPathCalls.push(targetPath);
        return typeof openPathResult === "function"
          ? openPathResult(targetPath)
          : openPathResult;
      },
      showItemInFolder: (targetPath) => {
        showItemInFolderCalls.push(targetPath);
      }
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

  return { handlers, mainPath, openPathCalls, showItemInFolderCalls };
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
