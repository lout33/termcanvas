const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Module = require("node:module");
const { EventEmitter } = require("node:events");

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

function loadMainWithMocks({
  smokeTest = false,
  showOpenDialog,
  showSaveDialog,
  openPathResult = "",
  resolveWhenReady = false,
  getPath = () => os.homedir(),
  nodePtyStub = {},
  childProcessStub = null
}) {
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
      getPath
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
  const agentmuxServicePath = require.resolve("../main_agentmux_service.js");

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
      return nodePtyStub;
    }

    if (request === "node:child_process" && childProcessStub !== null) {
      return childProcessStub;
    }

    return originalLoad.call(this, request, parent, isMain);
  };

  delete require.cache[mainPath];
  delete require.cache[agentmuxServicePath];

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

function createMockPtyProcess({ autoExitCode = null } = {}) {
  const dataListeners = [];
  const exitListeners = [];

  return {
    onData: (listener) => {
      dataListeners.push(listener);
    },
    onExit: (listener) => {
      exitListeners.push(listener);
      if (autoExitCode !== null) {
        setImmediate(() => {
          listener({ exitCode: autoExitCode, signal: 0 });
        });
      }
    },
    write: () => {},
    resize: () => {},
    kill: () => {}
  };
}

function createMockSpawn(handler) {
  return (command, args) => {
    const childProcess = new EventEmitter();
    childProcess.stdout = new EventEmitter();
    childProcess.stderr = new EventEmitter();
    childProcess.kill = () => {};

    setImmediate(() => {
      try {
        const result = handler(command, args);

        if (result?.error instanceof Error) {
          childProcess.emit("error", result.error);
          return;
        }

        if (typeof result?.stdout === "string" && result.stdout.length > 0) {
          childProcess.stdout.emit("data", result.stdout);
        }

        if (typeof result?.stderr === "string" && result.stderr.length > 0) {
          childProcess.stderr.emit("data", result.stderr);
        }

        childProcess.emit("close", Number.isInteger(result?.status) ? result.status : 0);
      } catch (error) {
        childProcess.emit("error", error);
      }
    });

    return childProcess;
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

  await restoreHandler({ sender: { id: 17 } }, { importedRootPaths: [], activeRootPath: null });
  delete require.cache[mainPath];
  fs.rmSync(tempRoot, { recursive: true, force: true });

  if (originalSmokeTest === undefined) {
    delete process.env.CANVAS_SMOKE_TEST;
  } else {
    process.env.CANVAS_SMOKE_TEST = originalSmokeTest;
  }
});

test("terminal:create falls back to a plain shell when a saved tmux session is gone", async () => {
  const spawnCalls = [];
  const ptySpawnCalls = [];
  const originalWarn = console.warn;
  const warnMessages = [];

  console.warn = (message) => {
    warnMessages.push(String(message));
  };

  try {
    const { handlers, mainPath } = loadMainWithMocks({
      smokeTest: true,
      showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
      childProcessStub: {
        spawnSync: (command, args) => {
          spawnCalls.push({ command, args });

          if (command === "tmux" && args[0] === "-V") {
            return { status: 0, stdout: "tmux 3.4", stderr: "" };
          }

          if (args[0] === "new-session") {
            return { status: 0, stdout: "", stderr: "" };
          }

          if (args[0] === "kill-session") {
            return { status: 0, stdout: "", stderr: "" };
          }

          if (args[0] === "has-session") {
            const sessionName = args[2];
            if (typeof sessionName === "string" && sessionName.startsWith("termcanvas-probe-")) {
              return { status: 0, stdout: "", stderr: "" };
            }

            return { status: 1, stdout: "", stderr: "can't find session" };
          }

          return { status: 0, stdout: "", stderr: "" };
        }
      },
      nodePtyStub: {
        spawn: (command, args) => {
          ptySpawnCalls.push({ command, args });
          const sessionTarget = Array.isArray(args) ? args[2] : null;
          const isProbeAttach = command === "tmux"
            && Array.isArray(args)
            && args[0] === "attach-session"
            && typeof sessionTarget === "string"
            && sessionTarget.startsWith("termcanvas-probe-");

          return createMockPtyProcess({ autoExitCode: isProbeAttach ? 0 : null });
        }
      }
    });

    const createTerminalHandler = handlers.get("terminal:create");

    assert.equal(typeof createTerminalHandler, "function");

    const created = await createTerminalHandler(
      { sender: { id: 41 } },
      {
        terminalId: "terminal-1",
        cols: 80,
        rows: 24,
        cwd: os.homedir(),
        sessionKey: "joke-worker",
        tmuxSessionName: "termcanvas-joke-worker"
      }
    );

    assert.equal(created.backend, "pty");
    assert.equal(created.tmuxSessionName, null);
    assert.ok(warnMessages.some((message) => /termcanvas-joke-worker/.test(message)));
    assert.ok(
      ptySpawnCalls.some(({ command, args }) => command !== "tmux" && Array.isArray(args) && args.length === 0),
      "expected fallback shell PTY spawn"
    );

    delete require.cache[mainPath];
  } finally {
    console.warn = originalWarn;
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

  await restoreHandler({ sender: { id: 23 } }, { importedRootPaths: [], activeRootPath: null });
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

  await restoreHandler({ sender: { id: 41 } }, { importedRootPaths: [], activeRootPath: null });
  await restoreHandler({ sender: { id: 42 } }, { importedRootPaths: [], activeRootPath: null });
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

  await restoreHandler({ sender: { id: 51 } }, { importedRootPaths: [], activeRootPath: null });
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

  await restoreHandler({ sender: { id: 61 } }, { importedRootPaths: [], activeRootPath: null });
  await restoreHandler({ sender: { id: 62 } }, { importedRootPaths: [], activeRootPath: null });
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

  await restoreHandler({ sender: { id: 66 } }, { importedRootPaths: [], activeRootPath: null });
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

  await restoreHandler({ sender: { id: 71 } }, { importedRootPaths: [], activeRootPath: null });
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

  await restoreHandler({ sender: { id: 81 } }, { importedRootPaths: [], activeRootPath: null });
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

  await assert.rejects(
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

  await restoreHandler({ sender: { id: 91 } }, { importedRootPaths: [], activeRootPath: null });
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

test("canvas-agent:sync returns an unavailable marker when agentmux is missing", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "termcanvas-agentmux-unavailable-"));
  const originalAgentmuxRoot = process.env.TERMCANVAS_AGENTMUX_ROOT;

  process.env.TERMCANVAS_AGENTMUX_ROOT = tempRoot;

  try {
    const { handlers, mainPath } = loadMainWithMocks({
      smokeTest: true,
      showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
      childProcessStub: {
        spawnSync: () => ({
          error: Object.assign(new Error("spawn agentmux ENOENT"), { code: "ENOENT" })
        })
      }
    });
    const syncCanvasAgent = handlers.get("canvas-agent:sync");

    assert.equal(typeof syncCanvasAgent, "function");

    const result = await syncCanvasAgent(
      { sender: { id: 101 } },
      {
        canvasId: "canvas-1",
        canvasName: "Canvas 1",
        workspaceRootPath: tempRoot
      }
    );

    assert.equal(result.unavailable, true);
    assert.match(result.reason, /agentmux is unavailable/u);
    delete require.cache[mainPath];
  } finally {
    if (originalAgentmuxRoot === undefined) {
      delete process.env.TERMCANVAS_AGENTMUX_ROOT;
    } else {
      process.env.TERMCANVAS_AGENTMUX_ROOT = originalAgentmuxRoot;
    }

    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("canvas-agent:sync bootstraps once then polls agentmux read-only status", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "termcanvas-agentmux-sync-"));
  const agentmuxRoot = path.join(tempRoot, "agentmux");
  const workspaceRoot = path.join(tempRoot, "workspace");
  const originalAgentmuxRoot = process.env.TERMCANVAS_AGENTMUX_ROOT;
  const spawnCalls = [];

  fs.mkdirSync(agentmuxRoot, { recursive: true });
  fs.mkdirSync(workspaceRoot, { recursive: true });
  fs.writeFileSync(path.join(agentmuxRoot, "agentmux.py"), "#!/usr/bin/env python3\n", "utf8");
  process.env.TERMCANVAS_AGENTMUX_ROOT = agentmuxRoot;

  try {
    const { handlers, mainPath } = loadMainWithMocks({
      smokeTest: true,
      showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
      childProcessStub: {
        spawn: createMockSpawn((command, args) => {
          spawnCalls.push({ command, args });

          return {
            status: 0,
            stdout: JSON.stringify({
              project: "canvas-one",
              manager: { name: "manager" },
              sessions: []
            }),
            stderr: ""
          };
        })
      }
    });
    const syncCanvasAgent = handlers.get("canvas-agent:sync");

    assert.equal(typeof syncCanvasAgent, "function");

    const result = await syncCanvasAgent(
      { sender: { id: 101 } },
      {
        canvasId: "canvas-1",
        canvasName: "Canvas 1",
        workspaceRootPath: workspaceRoot,
        projectTag: "canvas-one"
      }
    );
    const nextResult = await syncCanvasAgent(
      { sender: { id: 101 } },
      {
        canvasId: "canvas-1",
        canvasName: "Canvas 1",
        workspaceRootPath: workspaceRoot,
        projectTag: "canvas-one"
      }
    );

    assert.equal(result.project, "canvas-one");
    assert.equal(nextResult.project, "canvas-one");
    const agentsContents = fs.readFileSync(path.join(workspaceRoot, "AGENTS.md"), "utf8");
    assert.match(agentsContents, /Do not assume your role from this file alone/u);
    assert.match(agentsContents, /AGENTMUX_ROLE=commander/u);
    assert.match(agentsContents, /AGENTMUX_ROLE=worker/u);
    assert.match(agentsContents, /If `AGENTMUX_ROLE=worker`, complete your assigned task/u);
    assert.doesNotMatch(agentsContents, /You are the TermCanvas commander/u);
    assert.doesNotMatch(agentsContents, /Agentmux Commander Rules/u);
    assert.deepEqual(spawnCalls, [
      {
        command: "python3",
        args: [
          path.join(agentmuxRoot, "agentmux.py"),
          "project-sync",
          "canvas-one",
          "--workdir",
          workspaceRoot,
          "--harness",
          "shell",
          "--json"
        ]
      },
      {
        command: "python3",
        args: [
          path.join(agentmuxRoot, "agentmux.py"),
          "ls",
          "--project",
          "canvas-one",
          "--json"
        ]
      }
    ]);
    delete require.cache[mainPath];
  } finally {
    if (originalAgentmuxRoot === undefined) {
      delete process.env.TERMCANVAS_AGENTMUX_ROOT;
    } else {
      process.env.TERMCANVAS_AGENTMUX_ROOT = originalAgentmuxRoot;
    }

    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
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

test("terminal:write converts recoverable pty write failures into terminal exit events", async () => {
  const sentMessages = [];
  const mockPty = createMockPtyProcess();
  mockPty.write = () => {
    const error = new Error("EIO: i/o error, write");
    error.code = "EIO";
    throw error;
  };

  const { handlers, mainPath, sentMessages: emittedMessages } = loadMainWithMocks({
    smokeTest: true,
    showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
    childProcessStub: {
      spawnSync: (command, args) => {
        if (command === "tmux" && args[0] === "-V") {
          return { status: 1, stdout: "", stderr: "" };
        }

        return { status: 0, stdout: "", stderr: "" };
      }
    },
    nodePtyStub: {
      spawn: () => mockPty
    }
  });

  const createTerminal = handlers.get("terminal:create");
  const writeTerminal = handlers.get("terminal:write");

  assert.equal(typeof createTerminal, "function");
  assert.equal(typeof writeTerminal, "function");

  await createTerminal(
    { sender: { id: 101 } },
    { terminalId: "write-failure-terminal", cols: 80, rows: 24, cwd: os.homedir() }
  );

  assert.doesNotThrow(() => {
    writeTerminal(
      { sender: { id: 101 } },
      { terminalId: "write-failure-terminal", data: "pwd\r" }
    );
  });

  sentMessages.push(...emittedMessages);
  assert.deepEqual(
    sentMessages.filter((entry) => entry.channel === "terminal:exit").map((entry) => entry.payload),
    [{ terminalId: "write-failure-terminal", exitCode: null, signal: null }]
  );

  assert.doesNotThrow(() => {
    writeTerminal(
      { sender: { id: 101 } },
      { terminalId: "write-failure-terminal", data: "pwd\r" }
    );
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

test("app-session:save writes through a unique temp file path", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "termcanvas-app-session-save-"));
  const renameCalls = [];
  const originalWriteFileSync = fs.writeFileSync;
  const originalRenameSync = fs.renameSync;

  fs.writeFileSync = (filePath, contents, encoding) => {
    originalWriteFileSync(filePath, contents, encoding);
  };

  fs.renameSync = (sourcePath, destinationPath) => {
    renameCalls.push({ sourcePath, destinationPath });
    originalRenameSync(sourcePath, destinationPath);
  };

  const { handlers, mainPath } = loadMainWithMocks({
    showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
    showSaveDialog: async () => ({ canceled: true, filePath: undefined }),
    getPath: (name) => {
      assert.equal(name, "userData");
      return tempRoot;
    }
  });

  try {
    const saveAppSession = handlers.get("app-session:save");

    assert.equal(typeof saveAppSession, "function");

    saveAppSession({ sender: { id: 103 } }, {
      canvases: [],
      activeCanvasId: null
    });

    assert.equal(renameCalls.length, 1);
    assert.equal(renameCalls[0].destinationPath, path.join(tempRoot, "app-session.json"));
    assert.match(renameCalls[0].sourcePath, /app-session\.json\.tmp\..+$/);
  } finally {
    fs.writeFileSync = originalWriteFileSync;
    fs.renameSync = originalRenameSync;
    delete require.cache[mainPath];
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
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
