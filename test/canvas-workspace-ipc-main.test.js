const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Module = require("node:module");

function loadMainWithMocks({ smokeTest = false, showOpenDialog }) {
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

  return { handlers, mainPath };
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
