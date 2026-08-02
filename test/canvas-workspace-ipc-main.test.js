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
  isPackaged = false,
  resourcesPath = null,
  nodePtyStub = {},
  childProcessStub = null
}) {
  const effectiveChildProcessStub = childProcessStub !== null
    && typeof childProcessStub.spawn !== "function"
    && typeof childProcessStub.spawnSync === "function"
    ? {
      ...childProcessStub,
      spawn: createMockSpawn((command, args, options) => childProcessStub.spawnSync(command, args, options))
    }
    : childProcessStub;
  const handlers = new Map();
  const openPathCalls = [];
  const openExternalCalls = [];
  const showItemInFolderCalls = [];
  const createdWindows = [];
  const appEventHandlers = new Map();
  const contentsEventHandlers = new Map();
  const sentMessages = [];
  const menuTemplates = [];
  const applicationMenus = [];

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
      isPackaged,
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
    Menu: {
      buildFromTemplate: (template) => {
        menuTemplates.push(template);
        return { template };
      },
      setApplicationMenu: (menu) => {
        applicationMenus.push(menu);
      }
    },
    webContents: {
      fromId: (id) => createMockContents(id, contentsEventHandlers, sentMessages)
    }
  };

  const originalLoad = Module._load;
  const originalSmokeTest = process.env.CANVAS_SMOKE_TEST;
  const originalResourcesPath = process.resourcesPath;
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

    if (request === "node:child_process" && effectiveChildProcessStub !== null) {
      return effectiveChildProcessStub;
    }

    return originalLoad.call(this, request, parent, isMain);
  };

  delete require.cache[mainPath];
  delete require.cache[agentmuxServicePath];

  try {
    if (resourcesPath !== null) {
      process.resourcesPath = resourcesPath;
    }

    require(mainPath);
  } finally {
    Module._load = originalLoad;
    process.resourcesPath = originalResourcesPath;

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
    sentMessages,
    menuTemplates,
    applicationMenus
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
  return (command, args, options) => {
    const childProcess = new EventEmitter();
    childProcess.stdout = new EventEmitter();
    childProcess.stderr = new EventEmitter();
    childProcess.kill = () => {};

    setImmediate(() => {
      try {
        const result = handler(command, args, options);

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

function splitTmuxCommandArgs(args) {
  const commands = [[]];

  for (const arg of args) {
    if (arg === ";") {
      commands.push([]);
    } else {
      commands.at(-1).push(arg);
    }
  }

  return commands.filter((command) => command.length > 0);
}

function hasSpawnedTmuxCommand(spawnCalls, ...expectedArgs) {
  return spawnCalls.some(({ command, args }) => (
    command === "tmux"
    && Array.isArray(args)
    && splitTmuxCommandArgs(args).some((tmuxCommand) => (
      tmuxCommand.length === expectedArgs.length
      && expectedArgs.every((expectedArg, index) => tmuxCommand[index] === expectedArg)
    ))
  ));
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

test("terminal:create keeps a missing saved tmux session stopped", async () => {
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
          const sessionTarget = Array.isArray(args) ? args[3] : null;
          const isProbeAttach = command === "tmux"
            && Array.isArray(args)
            && args[0] === "-u"
            && args[1] === "attach-session"
            && typeof sessionTarget === "string"
            && sessionTarget.startsWith("termcanvas-probe-");

          return createMockPtyProcess({ autoExitCode: isProbeAttach ? 0 : null });
        }
      }
    });

    const createTerminalHandler = handlers.get("terminal:create");

    assert.equal(typeof createTerminalHandler, "function");

    await assert.rejects(
      () => createTerminalHandler(
        { sender: { id: 41 } },
        {
          terminalId: "terminal-1",
          cols: 80,
          rows: 24,
          cwd: os.homedir(),
          sessionKey: "joke-worker",
          tmuxSessionName: "termcanvas-joke-worker"
        }
      ),
      (error) => error.code === "TMUX_SESSION_MISSING"
    );

    assert.equal(
      ptySpawnCalls.some(({ command, args }) => command !== "tmux" && Array.isArray(args) && args.length === 0),
      false,
      "restoration must not replace a missing saved session with a new shell"
    );

    delete require.cache[mainPath];
  } finally {
    console.warn = originalWarn;
  }
});

test("terminal:create never auto-resumes a managed agent when its tmux session is gone", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "termcanvas-auto-resume-"));
  const agentmuxRoot = path.join(tempRoot, "agentmux");
  const originalAgentmuxRoot = process.env.TERMCANVAS_AGENTMUX_ROOT;
  const ptySpawnCalls = [];
  const originalWarn = console.warn;
  const warnMessages = [];
  let resumeCallCount = 0;

  console.warn = (message) => {
    warnMessages.push(String(message));
  };

  fs.mkdirSync(agentmuxRoot, { recursive: true });
  fs.writeFileSync(path.join(agentmuxRoot, "agentmux.py"), "#!/usr/bin/env python3\n", "utf8");
  process.env.TERMCANVAS_AGENTMUX_ROOT = agentmuxRoot;

  try {
    const { handlers, mainPath } = loadMainWithMocks({
      smokeTest: true,
      showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
      childProcessStub: {
        spawnSync: (command, args) => {
          // agentmux resume invocation: python3 agentmux.py resume <name>
          if (Array.isArray(args) && args.includes("resume")) {
            resumeCallCount += 1;
            return {
              status: 0,
              stdout: "Resumed opencode-worker (abc123)\ntmux: agentmux-opencode-worker-abc123\nrun:  opencode\n",
              stderr: ""
            };
          }
          if (command === "tmux" && args[0] === "-V") {
            return { status: 0, stdout: "tmux 3.4", stderr: "" };
          }
          if (args[0] === "has-session") {
            const sessionName = args[2];
            if (typeof sessionName === "string" && sessionName.startsWith("termcanvas-probe-")) {
              return { status: 0, stdout: "", stderr: "" };
            }
            // First has-session for the old name fails (missing).
            // After resume, has-session for the resumed name succeeds.
            if (sessionName === "agentmux-opencode-worker-abc123") {
              return { status: 0, stdout: "", stderr: "" };
            }
            return { status: 1, stdout: "", stderr: "can't find session" };
          }
          if (args[0] === "new-session" || args[0] === "display-message" || args[0] === "show-environment" || args[0] === "set-environment") {
            return { status: 0, stdout: "", stderr: "" };
          }
          return { status: 0, stdout: "", stderr: "" };
        }
      },
      nodePtyStub: {
        spawn: (command, args) => {
          ptySpawnCalls.push({ command, args });
          return createMockPtyProcess();
        }
      }
    });

    const createTerminalHandler = handlers.get("terminal:create");

    assert.equal(typeof createTerminalHandler, "function");

    await assert.rejects(
      () => createTerminalHandler(
        { sender: { id: 41 } },
        {
          terminalId: "terminal-1",
          cols: 80,
          rows: 24,
          cwd: os.homedir(),
          sessionKey: "opencode-worker",
          tmuxSessionName: "termcanvas-opencode-worker",
          agentProjectTag: "project-watch",
          managedAgentName: "opencode-worker"
        }
      ),
      (error) => error.code === "TMUX_SESSION_MISSING"
    );

    assert.equal(resumeCallCount, 0, "restoration must never invoke agentmux resume");
    assert.equal(
      ptySpawnCalls.some(({ command, args }) => command !== "tmux" && Array.isArray(args) && args.length === 0),
      false,
      "restoration must not spawn a fallback shell"
    );

    delete require.cache[mainPath];
  } finally {
    console.warn = originalWarn;
    if (originalAgentmuxRoot === undefined) {
      delete process.env.TERMCANVAS_AGENTMUX_ROOT;
    } else {
      process.env.TERMCANVAS_AGENTMUX_ROOT = originalAgentmuxRoot;
    }
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("terminal:create does not fall back to a shell for a stopped managed agent", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "termcanvas-resume-fails-"));
  const agentmuxRoot = path.join(tempRoot, "agentmux");
  const originalAgentmuxRoot = process.env.TERMCANVAS_AGENTMUX_ROOT;
  const ptySpawnCalls = [];
  const originalWarn = console.warn;
  const warnMessages = [];

  console.warn = (message) => {
    warnMessages.push(String(message));
  };

  fs.mkdirSync(agentmuxRoot, { recursive: true });
  fs.writeFileSync(path.join(agentmuxRoot, "agentmux.py"), "#!/usr/bin/env python3\n", "utf8");
  process.env.TERMCANVAS_AGENTMUX_ROOT = agentmuxRoot;

  try {
    const { handlers, mainPath } = loadMainWithMocks({
      smokeTest: true,
      showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
      childProcessStub: {
        spawnSync: (command, args) => {
          if (Array.isArray(args) && args.includes("resume")) {
            return { status: 1, stdout: "", stderr: "No session found for 'opencode-worker'" };
          }
          if (command === "tmux" && args[0] === "-V") {
            return { status: 0, stdout: "tmux 3.4", stderr: "" };
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
          return createMockPtyProcess();
        }
      }
    });

    const createTerminalHandler = handlers.get("terminal:create");

    await assert.rejects(
      () => createTerminalHandler(
        { sender: { id: 41 } },
        {
          terminalId: "terminal-1",
          cols: 80,
          rows: 24,
          cwd: os.homedir(),
          sessionKey: "opencode-worker",
          tmuxSessionName: "termcanvas-opencode-worker",
          agentProjectTag: "project-watch",
          managedAgentName: "opencode-worker"
        }
      ),
      (error) => error.code === "TMUX_SESSION_MISSING"
    );

    assert.equal(
      ptySpawnCalls.some(({ command, args }) => command !== "tmux" && Array.isArray(args) && args.length === 0),
      false,
      "a stopped managed agent must remain stopped"
    );

    delete require.cache[mainPath];
  } finally {
    console.warn = originalWarn;
    if (originalAgentmuxRoot === undefined) {
      delete process.env.TERMCANVAS_AGENTMUX_ROOT;
    } else {
      process.env.TERMCANVAS_AGENTMUX_ROOT = originalAgentmuxRoot;
    }
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("terminal:create reserves stable identity before concurrent requests can spawn duplicates", async () => {
  const ptyProcesses = [];
  const { handlers, mainPath } = loadMainWithMocks({
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
      spawn: () => {
        const ptyProcess = createMockPtyProcess();
        ptyProcesses.push(ptyProcess);
        return ptyProcess;
      }
    }
  });
  const createTerminal = handlers.get("terminal:create");
  const destroyTerminal = handlers.get("terminal:destroy");
  const ownerEvent = { sender: { id: 41 } };
  const firstCreate = createTerminal(ownerEvent, {
    terminalId: "attachment-a",
    sessionKey: "stable-session",
    cols: 80,
    rows: 24,
    cwd: os.homedir()
  });
  const duplicateCreate = createTerminal(ownerEvent, {
    terminalId: "attachment-b",
    sessionKey: "stable-session",
    cols: 80,
    rows: 24,
    cwd: os.homedir()
  });

  await assert.rejects(
    duplicateCreate,
    (error) => error.code === "TERMINAL_SESSION_ALREADY_ATTACHED"
  );
  const created = await firstCreate;

  assert.equal(created.sessionKey, "stable-session");
  assert.equal(ptyProcesses.length, 1);

  await destroyTerminal(ownerEvent, {
    terminalId: "attachment-a",
    preserveSession: true
  });

  const reattached = await createTerminal(ownerEvent, {
    terminalId: "attachment-c",
    sessionKey: "stable-session",
    cols: 80,
    rows: 24,
    cwd: os.homedir()
  });

  assert.equal(reattached.sessionKey, "stable-session");
  assert.equal(ptyProcesses.length, 2);

  await destroyTerminal(ownerEvent, {
    terminalId: "attachment-c",
    preserveSession: false
  });
  delete require.cache[mainPath];
});

test("terminal:create advertises truecolor support to spawned shells", async () => {
  const ptySpawnCalls = [];
  const originalNoColor = process.env.NO_COLOR;
  let mainPath = null;

  process.env.NO_COLOR = "1";

  try {
    const loaded = loadMainWithMocks({
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
        spawn: (command, args, options) => {
          ptySpawnCalls.push({ command, args, options });
          return createMockPtyProcess();
        }
      }
    });

    mainPath = loaded.mainPath;

    const createTerminalHandler = loaded.handlers.get("terminal:create");

    assert.equal(typeof createTerminalHandler, "function");

    await createTerminalHandler(
      { sender: { id: 42 } },
      { terminalId: "color-terminal", cols: 100, rows: 30, cwd: os.homedir() }
    );

    const shellSpawn = ptySpawnCalls.find(({ command, args }) => command !== "tmux" && Array.isArray(args) && args.length === 0);

    assert.ok(shellSpawn, "expected plain shell PTY spawn");
    assert.equal(shellSpawn.options.name, "xterm-256color");
    assert.equal(shellSpawn.options.env.TERM, "xterm-256color");
    assert.equal(shellSpawn.options.env.COLORTERM, "truecolor");
    assert.equal(shellSpawn.options.env.TERM_PROGRAM, "TermCanvas");
    assert.match(shellSpawn.options.env.LANG, /UTF-?8/iu);
    assert.match(shellSpawn.options.env.LC_CTYPE, /UTF-?8/iu);
    assert.equal(shellSpawn.options.env.CLICOLOR, "1");
    assert.equal(shellSpawn.options.env.CLICOLOR_FORCE, "1");
    assert.equal(shellSpawn.options.env.FORCE_COLOR, "3");
    assert.equal(shellSpawn.options.env.NO_COLOR, undefined);
  } finally {
    if (originalNoColor === undefined) {
      delete process.env.NO_COLOR;
    } else {
      process.env.NO_COLOR = originalNoColor;
    }

    if (mainPath !== null) {
      delete require.cache[mainPath];
    }
  }
});

test("terminal:create uses asynchronous tmux subprocesses on the main-process hot path", async () => {
  const asyncSpawnCalls = [];
  const tmuxSessions = new Set();
  const asyncSpawn = createMockSpawn((command, args) => {
    asyncSpawnCalls.push({ command, args });

    if (command === "tmux" && args[0] === "-V") {
      return { status: 0, stdout: "tmux 3.4\n", stderr: "" };
    }

    if (command === "tmux" && args[0] === "new-session") {
      tmuxSessions.add(args[args.indexOf("-s") + 1]);
      return { status: 0, stdout: "", stderr: "" };
    }

    if (command === "tmux" && args[0] === "kill-session") {
      tmuxSessions.delete(args[args.indexOf("-t") + 1]);
      return { status: 0, stdout: "", stderr: "" };
    }

    if (command === "tmux" && args[0] === "has-session") {
      const sessionName = args[args.indexOf("-t") + 1];
      return tmuxSessions.has(sessionName)
        ? { status: 0, stdout: "", stderr: "" }
        : { status: 1, stdout: "", stderr: "no server running" };
    }

    if (command === "tmux" && args[0] === "show-options") {
      return { status: 0, stdout: "terminal-features[0] xterm-256color:RGB:clipboard\n", stderr: "" };
    }

    if (command === "tmux" && args[0] === "display-message") {
      return { status: 0, stdout: `${os.homedir()}\n`, stderr: "" };
    }

    return { status: 0, stdout: "", stderr: "" };
  });
  const { handlers, mainPath } = loadMainWithMocks({
    smokeTest: true,
    showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
    childProcessStub: {
      spawnSync: () => {
        throw new Error("terminal creation must not call spawnSync");
      },
      spawn: asyncSpawn
    },
    nodePtyStub: {
      spawn: (command, args) => {
        const sessionName = args[args.indexOf("-t") + 1];
        return createMockPtyProcess({ autoExitCode: sessionName.startsWith("termcanvas-probe-") ? 0 : null });
      }
    }
  });
  const createTerminal = handlers.get("terminal:create");
  const destroyTerminal = handlers.get("terminal:destroy");
  const ownerEvent = { sender: { id: 46 } };
  const created = await createTerminal(ownerEvent, {
    terminalId: "async-tmux-terminal",
    sessionKey: "async-tmux-session",
    cols: 100,
    rows: 30,
    cwd: os.homedir()
  });

  assert.equal(created.backend, "tmux");
  assert.ok(asyncSpawnCalls.some(({ command, args }) => command === "tmux" && args[0] === "new-session"));

  await destroyTerminal(ownerEvent, {
    terminalId: "async-tmux-terminal",
    preserveSession: false
  });
  delete require.cache[mainPath];
});

test("packaged terminal:create finds tmux in common macOS CLI paths", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "termcanvas-packaged-tmux-"));
  const spawnCalls = [];
  const ptySpawnCalls = [];

  try {
    const loaded = loadMainWithMocks({
      smokeTest: true,
      isPackaged: true,
      resourcesPath: tempRoot,
      showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
      childProcessStub: {
        spawnSync: (command, args, options = {}) => {
          spawnCalls.push({ command, args, options });

          if (command === "tmux" && args[0] === "-V") {
            return typeof options.env?.PATH === "string" && options.env.PATH.includes("/opt/homebrew/bin")
              ? { status: 0, stdout: "tmux 3.4", stderr: "" }
              : { status: 1, stdout: "", stderr: "tmux not found" };
          }

          if (command === "tmux" && args[0] === "display-message") {
            return { status: 0, stdout: `${os.homedir()}\n`, stderr: "" };
          }

          return { status: 0, stdout: "", stderr: "" };
        }
      },
      nodePtyStub: {
        spawn: (command, args, options) => {
          ptySpawnCalls.push({ command, args, options });
          const sessionTarget = Array.isArray(args) ? args[3] : null;
          const isProbeAttach = command === "tmux"
            && Array.isArray(args)
            && args[0] === "-u"
            && args[1] === "attach-session"
            && typeof sessionTarget === "string"
            && sessionTarget.startsWith("termcanvas-probe-");

          return createMockPtyProcess({ autoExitCode: isProbeAttach ? 0 : null });
        }
      }
    });

    const createTerminalHandler = loaded.handlers.get("terminal:create");

    assert.equal(typeof createTerminalHandler, "function");

    const created = await createTerminalHandler(
      { sender: { id: 45 } },
      {
        terminalId: "packaged-tmux-terminal",
        sessionKey: "packaged-path",
        cols: 100,
        rows: 30,
        cwd: os.homedir()
      }
    );
    const tmuxVersionProbe = spawnCalls.find(({ command, args }) => command === "tmux" && args[0] === "-V");
    const realAttach = ptySpawnCalls.find(({ command, args }) => (
      command === "tmux"
      && Array.isArray(args)
      && args[0] === "-u"
      && args[1] === "attach-session"
      && args[3] === "termcanvas-packaged-path"
    ));

    assert.equal(created.backend, "tmux");
    assert.match(tmuxVersionProbe.options.env.PATH, /\/opt\/homebrew\/bin/u);
    assert.ok(realAttach, "expected packaged app to attach a tmux-backed terminal");

    delete require.cache[loaded.mainPath];
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("terminal:create registers fresh canvas terminals as managed agents with AGENTMUX env", async () => {
  const spawnCalls = [];
  const agentmuxSpawnCalls = [];
  const runTmuxStub = (command, args, options) => {
    spawnCalls.push({ command, args, options });

    if (command === "tmux" && args[0] === "-V") {
      return { status: 0, stdout: "tmux 3.4", stderr: "" };
    }

    if (command === "tmux" && args[0] === "has-session") {
      const targetSession = args[2];
      const wasCreated = targetSession === "termcanvas-agent-env"
        && spawnCalls.some(({ command: priorCommand, args: priorArgs }) => (
          priorCommand === "tmux"
          && priorArgs[0] === "new-session"
          && priorArgs.includes(targetSession)
        ));

      return wasCreated
        ? { status: 0, stdout: "", stderr: "" }
        : { status: 1, stdout: "", stderr: "no such session" };
    }

    if (command === "tmux" && args[0] === "display-message") {
      return { status: 0, stdout: `${os.homedir()}\n`, stderr: "" };
    }

    return { status: 0, stdout: "", stderr: "" };
  };
  const spawnTmux = createMockSpawn(runTmuxStub);

  function createFakeAgentmuxChild() {
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = () => {};
    setImmediate(() => {
      child.stdout.emit("data", "Imported terminal\n");
      child.emit("close", 0);
    });
    return child;
  }

  const { handlers, mainPath } = loadMainWithMocks({
    smokeTest: true,
    showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
    childProcessStub: {
      spawnSync: runTmuxStub,
      spawn: (command, args, options) => {
        if (command === "tmux") {
          return spawnTmux(command, args, options);
        }

        agentmuxSpawnCalls.push({ command, args });
        return createFakeAgentmuxChild();
      }
    },
    nodePtyStub: {
      spawn: (command, args) => {
        const sessionTarget = Array.isArray(args) ? args[3] : null;
        const isProbeAttach = command === "tmux"
          && Array.isArray(args)
          && args[0] === "-u"
          && args[1] === "attach-session"
          && typeof sessionTarget === "string"
          && sessionTarget.startsWith("termcanvas-probe-");

        return createMockPtyProcess({ autoExitCode: isProbeAttach ? 0 : null });
      }
    }
  });

  try {
    const createTerminalHandler = handlers.get("terminal:create");
    const destroyTerminalHandler = handlers.get("terminal:destroy");

    const created = await createTerminalHandler(
      { sender: { id: 47 } },
      {
        terminalId: "managed-terminal",
        sessionKey: "agent-env",
        cols: 100,
        rows: 30,
        cwd: os.homedir(),
        agentProjectTag: "proj-canvas1"
      }
    );

    assert.match(created.managedAgentName, /^terminal-[0-9a-f]{6}$/u);
    assert.equal(created.managedProjectTag, "proj-canvas1");

    const newSession = spawnCalls.find(({ command, args }) => (
      command === "tmux" && args[0] === "new-session" && args.includes("termcanvas-agent-env")
    ));

    assert.ok(newSession, "expected the terminal tmux session to be created");
    assert.ok(newSession.args.includes("AGENTMUX_PROJECT=proj-canvas1"), "session env should carry the project tag");
    assert.ok(
      newSession.args.includes(`AGENTMUX_AGENT_NAME=${created.managedAgentName}`),
      "session env should carry the agent name"
    );
    assert.ok(
      newSession.args.some((arg) => typeof arg === "string" && arg.startsWith("AGENTMUX_BIN=")),
      "session env should carry the CLI path"
    );
    assert.ok(newSession.args.includes("AGENTMUX_TMUX_SESSION=termcanvas-agent-env"));
    assert.ok(
      hasSpawnedTmuxCommand(
        spawnCalls,
        "set-environment",
        "-t",
        "termcanvas-agent-env",
        "AGENTMUX_HOME",
        path.join(os.homedir(), "agentmux")
      ),
      "expected the tmux session environment to retain the app-scoped agentmux home"
    );

    const importCall = agentmuxSpawnCalls.find(({ args }) => Array.isArray(args) && args.includes("import"));

    assert.ok(importCall, "expected the terminal to be imported as an agent");
    assert.deepEqual(
      importCall.args.slice(importCall.args.indexOf("import")),
      [
        "import",
        "--agent", created.managedAgentName,
        "--tmux-session", "termcanvas-agent-env",
        "--harness", "shell",
        "--project", "proj-canvas1",
        "--workdir", os.homedir()
      ]
    );

    await destroyTerminalHandler(
      { sender: { id: 47 } },
      { terminalId: "managed-terminal", preserveSession: true, retainDetachedIdentity: true }
    );

    const restored = await createTerminalHandler(
      { sender: { id: 47 } },
      {
        terminalId: "restored-terminal",
        sessionKey: "agent-env",
        tmuxSessionName: "termcanvas-agent-env",
        cols: 100,
        rows: 30,
        cwd: os.homedir(),
        agentProjectTag: "proj-canvas1"
      }
    );

    assert.equal(restored.managedAgentName, null, "restored terminals must not re-adopt");
    assert.ok(
      spawnCalls.some(({ command, args }) => command === "tmux" && splitTmuxCommandArgs(args).some((tmuxCommand) => (
        tmuxCommand[0] === "set-environment"
        && tmuxCommand[1] === "-t"
        && tmuxCommand[2] === "termcanvas-agent-env"
        && tmuxCommand[3] === "AGENTMUX_BIN"
      ))),
      "expected restored tmux sessions to receive the repaired agentmux runtime environment"
    );

    await destroyTerminalHandler(
      { sender: { id: 47 } },
      { terminalId: "restored-terminal", preserveSession: false }
    );
    assert.equal(
      spawnCalls.filter(({ command, args }) => (
        command === "tmux"
        && args[0] === "kill-session"
        && args[2] === "termcanvas-agent-env"
      )).length,
      1,
      "closing a restored terminal must destroy its tmux session exactly once"
    );
  } finally {
    delete require.cache[mainPath];
  }
});

test("terminal:create with parentAgentName spawns a child agent via agentmux worker --parent", async () => {
  const spawnCalls = [];
  const agentmuxSpawnCalls = [];
  const childTmuxSessionName = "agentmux-child-a1b2c3-fffff";

  const runTmuxStub = (command, args, options) => {
    spawnCalls.push({ command, args, options });

    if (command === "tmux" && args[0] === "-V") {
      return { status: 0, stdout: "tmux 3.4", stderr: "" };
    }

    if (command === "tmux" && args[0] === "has-session") {
      const targetSession = Array.isArray(args) ? args[2] : null;
      return targetSession === childTmuxSessionName
        ? { status: 0, stdout: "", stderr: "" }
        : { status: 1, stdout: "", stderr: "no session" };
    }

    if (command === "tmux" && args[0] === "display-message") {
      return { status: 0, stdout: `${os.homedir()}\n`, stderr: "" };
    }

    return { status: 0, stdout: "", stderr: "" };
  };

  const spawnTmux = createMockSpawn(runTmuxStub);

  function createFakeAgentmuxChild(command, args) {
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = () => {};

    agentmuxSpawnCalls.push({ command, args });

    setImmediate(() => {
      if (Array.isArray(args) && args.includes("worker")) {
        // Mirror agentmux.py's worker output: "Created worker <name> (<short>)\ntmux: <session>\ncwd: <dir>\n"
        const workerIndex = args.indexOf("worker");
        const agentName = args[workerIndex + 2];
        child.stdout.emit("data", `Created worker ${agentName} (abc123)\ntmux: ${childTmuxSessionName}\ncwd:  ${os.homedir()}\n`);
      } else {
        child.stdout.emit("data", "ok\n");
      }
      child.emit("close", 0);
    });

    return child;
  }

  const ptySpawnCalls = [];

  const { handlers, mainPath } = loadMainWithMocks({
    smokeTest: true,
    showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
    childProcessStub: {
      spawnSync: runTmuxStub,
      spawn: (command, args, options) => {
        if (command === "tmux") {
          return spawnTmux(command, args, options);
        }
        return createFakeAgentmuxChild(command, args);
      }
    },
    nodePtyStub: {
      spawn: (command, args) => {
        ptySpawnCalls.push({ command, args });
        return createMockPtyProcess();
      }
    }
  });

  try {
    const createTerminalHandler = handlers.get("terminal:create");

    const created = await createTerminalHandler(
      { sender: { id: 71 } },
      {
        terminalId: "child-terminal-1",
        sessionKey: "child-session-1",
        cols: 80,
        rows: 24,
        cwd: os.homedir(),
        agentProjectTag: "proj-canvas1",
        parentAgentName: "parent-agent"
      }
    );

    assert.equal(created.managedParentAgent, "parent-agent");
    assert.equal(created.managedProjectTag, "proj-canvas1");
    assert.match(created.managedAgentName, /^child-[a-z0-9]{6}$/u);
    assert.equal(created.tmuxSessionName, childTmuxSessionName);
    assert.equal(created.backend, "tmux");

    // agentmux worker should have been invoked with --parent and --harness shell.
    const workerCall = agentmuxSpawnCalls.find(({ args }) => Array.isArray(args) && args.includes("worker"));
    assert.ok(workerCall, "expected agentmux worker to be invoked for the child spawn path");
    const workerArgs = workerCall.args;
    assert.equal(workerArgs[workerArgs.indexOf("worker") + 1], "proj-canvas1");
    assert.equal(workerArgs[workerArgs.indexOf("--parent") + 1], "parent-agent");
    assert.equal(workerArgs[workerArgs.indexOf("--harness") + 1], "shell");

    // The child spawn path must NOT call agentmux import — agentmux worker
    // already registers the agent in the graph.
    const importCall = agentmuxSpawnCalls.find(({ args }) => Array.isArray(args) && args.includes("import"));
    assert.equal(importCall, undefined, "child terminals must not call agentmux import");

    // main must NOT open a fresh `tmux new-session` for this terminal —
    // agentmux worker created it. The startup tmux probe (a `new-session`
    // with a `termcanvas-probe-*` name) is allowed and unrelated.
    const newSessionCall = spawnCalls.find(({ command, args }) => {
      if (command !== "tmux" || !Array.isArray(args) || args[0] !== "new-session") {
        return false;
      }
      const sessionName = args[args.indexOf("-s") + 1];
      return typeof sessionName === "string" && !sessionName.startsWith("termcanvas-probe-");
    });
    assert.equal(newSessionCall, undefined, "child terminals must not spawn a fresh tmux session");

    // main attaches via node-pty to the agentmux-spawned tmux session.
    const attachCall = ptySpawnCalls.find(({ command, args }) => (
      command === "tmux"
      && Array.isArray(args)
      && args[0] === "-u"
      && args[1] === "attach-session"
      && args.includes(childTmuxSessionName)
    ));
    assert.ok(attachCall, "expected main to attach to the agentmux-spawned tmux session");
  } finally {
    delete require.cache[mainPath];
  }
});

test("terminal:create with parentAgentName + tmuxSessionName restores instead of re-spawning a worker", async () => {
  const spawnCalls = [];
  const agentmuxSpawnCalls = [];
  const existingChildTmuxSession = "agentmux-child-restore-1234";

  const runTmuxStub = (command, args, options) => {
    spawnCalls.push({ command, args, options });
    if (command === "tmux" && args[0] === "-V") return { status: 0, stdout: "tmux 3.4", stderr: "" };
    if (command === "tmux" && args[0] === "has-session") {
      return args[2] === existingChildTmuxSession
        ? { status: 0, stdout: "", stderr: "" }
        : { status: 1, stdout: "", stderr: "no session" };
    }
    if (command === "tmux" && args[0] === "display-message") return { status: 0, stdout: `${os.homedir()}\n`, stderr: "" };
    return { status: 0, stdout: "", stderr: "" };
  };

  const { handlers, mainPath } = loadMainWithMocks({
    smokeTest: true,
    showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
    childProcessStub: {
      spawnSync: runTmuxStub,
      spawn: (command, args, options) => {
        if (command === "tmux") return createMockSpawn(runTmuxStub)(command, args, options);
        const child = new EventEmitter();
        child.stdout = new EventEmitter();
        child.stderr = new EventEmitter();
        child.kill = () => {};
        agentmuxSpawnCalls.push({ command, args });
        setImmediate(() => child.emit("close", 0));
        return child;
      }
    },
    nodePtyStub: { spawn: () => createMockPtyProcess() }
  });

  try {
    const createTerminalHandler = handlers.get("terminal:create");

    const restored = await createTerminalHandler(
      { sender: { id: 91 } },
      {
        terminalId: "restored-child",
        sessionKey: "restored-child",
        cols: 80,
        rows: 24,
        cwd: os.homedir(),
        agentProjectTag: "proj-canvas1",
        tmuxSessionName: existingChildTmuxSession,
        managedAgentName: "child-restore",
        parentAgentName: "parent-agent"
      }
    );

    // Restore path returns the existing session — should NOT call worker or import.
    assert.equal(restored.tmuxSessionName, existingChildTmuxSession);
    assert.equal(restored.managedAgentName, null, "restored terminals must not re-adopt");
    assert.equal(restored.managedParentAgent, undefined, "restore path should not synthesize a parent echo");
    assert.equal(agentmuxSpawnCalls.length, 0, "restore must not spawn any agentmux subprocess");
  } finally {
    delete require.cache[mainPath];
  }
});

test("terminal:create with parentAgentName rejects when the canvas project tag is missing", async () => {
  const { handlers, mainPath } = loadMainWithMocks({
    smokeTest: true,
    showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
    childProcessStub: {
      spawnSync: () => ({ status: 0, stdout: "", stderr: "" }),
      spawn: (command, args) => {
        const child = new EventEmitter();
        child.stdout = new EventEmitter();
        child.stderr = new EventEmitter();
        child.kill = () => {};
        setImmediate(() => child.emit("close", 0));
        return child;
      }
    },
    nodePtyStub: { spawn: () => createMockPtyProcess() }
  });

  try {
    const createTerminalHandler = handlers.get("terminal:create");

    await assert.rejects(
      () => createTerminalHandler(
        { sender: { id: 73 } },
        {
          terminalId: "child-terminal-2",
          sessionKey: "child-session-2",
          cols: 80,
          rows: 24,
          cwd: os.homedir(),
          parentAgentName: "parent-agent"
        }
      ),
      /outside a managed canvas project/u
    );
  } finally {
    delete require.cache[mainPath];
  }
});

test("terminal:create repairs tmux color environment before attaching sessions", async () => {
  const spawnCalls = [];
  const ptySpawnCalls = [];
  const existingSessionName = "termcanvas-color-existing";

  const { handlers, mainPath } = loadMainWithMocks({
    smokeTest: true,
    showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
    childProcessStub: {
      spawnSync: (command, args, options) => {
        spawnCalls.push({ command, args, options });

        if (command === "tmux" && args[0] === "-V") {
          return { status: 0, stdout: "tmux 3.4", stderr: "" };
        }

        if (command === "tmux" && args[0] === "show-options" && args.includes("terminal-features")) {
          return { status: 0, stdout: "terminal-features[0] xterm-256color:RGB\n", stderr: "" };
        }

        if (command === "tmux" && args[0] === "display-message") {
          return { status: 0, stdout: `${os.homedir()}\n`, stderr: "" };
        }

        return { status: 0, stdout: "", stderr: "" };
      }
    },
    nodePtyStub: {
      spawn: (command, args, options) => {
        ptySpawnCalls.push({ command, args, options });
        const sessionTarget = Array.isArray(args) ? args[3] : null;
        const isProbeAttach = command === "tmux"
          && Array.isArray(args)
          && args[0] === "-u"
          && args[1] === "attach-session"
          && typeof sessionTarget === "string"
          && sessionTarget.startsWith("termcanvas-probe-");

        return createMockPtyProcess({ autoExitCode: isProbeAttach ? 0 : null });
      }
    }
  });

  const createTerminalHandler = handlers.get("terminal:create");

  assert.equal(typeof createTerminalHandler, "function");

  const created = await createTerminalHandler(
    { sender: { id: 43 } },
    {
      terminalId: "tmux-color-terminal",
      sessionKey: "tmux-color-existing",
      tmuxSessionName: existingSessionName,
      cols: 100,
      rows: 30,
      cwd: os.homedir()
    }
  );

  const realAttach = ptySpawnCalls.find(({ command, args }) => (
    command === "tmux"
    && Array.isArray(args)
    && args[0] === "-u"
    && args[1] === "attach-session"
    && args[3] === existingSessionName
  ));

  assert.equal(created.backend, "tmux");
  assert.ok(realAttach, "expected tmux attach for existing session");
  assert.equal(realAttach.options.env.NO_COLOR, undefined);
  assert.match(realAttach.options.env.LANG, /UTF-?8/iu);
  assert.match(realAttach.options.env.LC_CTYPE, /UTF-?8/iu);
  assert.equal(realAttach.options.env.COLORTERM, "truecolor");
  assert.equal(realAttach.options.env.CLICOLOR_FORCE, "1");
  assert.equal(realAttach.options.env.FORCE_COLOR, "3");

  const hasTmuxCall = (...expectedArgs) => hasSpawnedTmuxCommand(spawnCalls, ...expectedArgs);
  const hasTmuxUtf8EnvironmentCall = (targetFlag, targetName, envName) => spawnCalls.some(({ command, args }) => (
    command === "tmux" && splitTmuxCommandArgs(args).some((tmuxCommand) => {
      if (tmuxCommand[0] !== "set-environment" || tmuxCommand[1] !== targetFlag) {
        return false;
      }

      const nameIndex = targetFlag === "-t" ? 3 : 2;
      const valueIndex = nameIndex + 1;

      return (targetFlag !== "-t" || tmuxCommand[2] === targetName)
        && tmuxCommand[nameIndex] === envName
        && /UTF-?8/iu.test(String(tmuxCommand[valueIndex] ?? ""));
    })
  ));

  assert.ok(
    hasTmuxCall("set-environment", "-g", "-u", "NO_COLOR"),
    "expected tmux global NO_COLOR cleanup"
  );
  assert.ok(
    hasTmuxCall("set-environment", "-g", "FORCE_COLOR", "3"),
    "expected tmux global FORCE_COLOR"
  );
  assert.ok(
    hasTmuxUtf8EnvironmentCall("-g", null, "LANG")
      && hasTmuxUtf8EnvironmentCall("-g", null, "LC_CTYPE"),
    "expected tmux global UTF-8 locale"
  );
  assert.ok(
    hasTmuxCall("set-environment", "-t", existingSessionName, "-u", "NO_COLOR"),
    "expected tmux session NO_COLOR cleanup"
  );
  assert.ok(
    hasTmuxCall("set-environment", "-t", existingSessionName, "FORCE_COLOR", "3"),
    "expected tmux session FORCE_COLOR"
  );
  assert.ok(
    hasTmuxCall("set-option", "-t", existingSessionName, "mouse", "on"),
    "expected tmux mouse mode to be enabled for scrollable terminal harnesses"
  );
  assert.ok(
    hasTmuxCall("set-option", "-t", existingSessionName, "history-limit", "20000"),
    "expected tmux pane history to be large enough for terminal harness scrollback"
  );
  assert.ok(
    hasTmuxCall("set-option", "-t", existingSessionName, "set-clipboard", "external"),
    "expected tmux copy-mode selections to use host clipboard export"
  );
  assert.ok(
    hasTmuxCall("set-option", "-s", "-a", "terminal-features", ",xterm-256color:clipboard"),
    "expected tmux to advertise OSC 52 clipboard support to TermCanvas clients"
  );
  assert.ok(
    hasTmuxUtf8EnvironmentCall("-t", existingSessionName, "LANG")
      && hasTmuxUtf8EnvironmentCall("-t", existingSessionName, "LC_CTYPE"),
    "expected tmux session UTF-8 locale"
  );

  delete require.cache[mainPath];
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

test("workspace-directory:refresh loads expanded deep workspace directories", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "canvas-workspace-ipc-"));
  const workspacePath = path.join(tempRoot, "workspace");
  const deepFilePath = path.join(workspacePath, "src", "features", "auth", "screens", "login.js");
  const originalSmokeTest = process.env.CANVAS_SMOKE_TEST;

  fs.mkdirSync(path.dirname(deepFilePath), { recursive: true });
  fs.writeFileSync(deepFilePath, "export {};\n", "utf8");

  const { handlers, mainPath } = loadMainWithMocks({
    smokeTest: true,
    showOpenDialog: async () => ({ canceled: true, filePaths: [] })
  });

  const debugOpenHandler = handlers.get("workspace-directory:debug-open");
  const refreshHandler = handlers.get("workspace-directory:refresh");
  const restoreHandler = handlers.get("workspace-session:restore");

  process.env.CANVAS_SMOKE_TEST = "1";

  const initialState = await debugOpenHandler({ sender: { id: 29 } }, { directoryPath: workspacePath });
  assert.equal(initialState.importedFolders[0].entries.some((entry) => entry.relativePath === "src"), true);
  assert.equal(initialState.importedFolders[0].entries.some((entry) => entry.relativePath === "src/features"), false);

  const refreshedState = await refreshHandler(
    { sender: { id: 29 } },
    { expandedDirectoryPaths: ["src/features/auth/screens"] }
  );

  assert.deepEqual(refreshedState.importedFolders[0].loadedDirectoryPaths, [
    "",
    "src",
    "src/features",
    "src/features/auth",
    "src/features/auth/screens"
  ]);
  assert.equal(
    refreshedState.importedFolders[0].entries.some((entry) => entry.relativePath === "src/features/auth/screens/login.js"),
    true
  );

  await restoreHandler({ sender: { id: 29 } }, { importedRootPaths: [], activeRootPath: null });
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

test("application menu exposes standard app zoom commands", async () => {
  const { menuTemplates, applicationMenus, mainPath } = loadMainWithMocks({
    resolveWhenReady: true,
    showOpenDialog: async () => ({ canceled: true, filePaths: [] })
  });

  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(menuTemplates.length, 1);
  assert.equal(applicationMenus.length, 1);

  const viewMenu = menuTemplates[0].find((item) => item.label === "View");
  assert.ok(viewMenu);
  assert.deepEqual(
    viewMenu.submenu.filter((item) => typeof item.role === "string").map((item) => item.role),
    ["resetZoom", "zoomIn", "zoomOut", "togglefullscreen", "reload", "toggleDevTools"]
  );
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

test("canvas-agent:sync bootstraps once then polls agentmux without rewriting AGENTS.md", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "termcanvas-agentmux-sync-"));
  const agentmuxRoot = path.join(tempRoot, "agentmux");
  const workspaceRoot = path.join(tempRoot, "workspace");
  const agentsPath = path.join(workspaceRoot, "AGENTS.md");
  const originalAgentsContents = "# Existing project guidance\n\nKeep source instructions stable.\n";
  const originalAgentmuxRoot = process.env.TERMCANVAS_AGENTMUX_ROOT;
  const spawnCalls = [];

  fs.mkdirSync(agentmuxRoot, { recursive: true });
  fs.mkdirSync(workspaceRoot, { recursive: true });
  fs.writeFileSync(path.join(agentmuxRoot, "agentmux.py"), "#!/usr/bin/env python3\n", "utf8");
  fs.writeFileSync(agentsPath, originalAgentsContents, "utf8");
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
    assert.equal(fs.readFileSync(agentsPath, "utf8"), originalAgentsContents);
    const expectedReadCall = {
      command: "python3",
      args: [
        path.join(agentmuxRoot, "agentmux.py"),
        "ls",
        "--project",
        "canvas-one",
        "--json"
      ]
    };

    // Syncing is read-only: no project-sync bootstrap, no default commander.
    assert.deepEqual(spawnCalls, [expectedReadCall, expectedReadCall]);
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

test("canvas-agent:restart restarts a managed agent through the agentmux runtime", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "termcanvas-agent-restart-ipc-"));
  const agentmuxRoot = path.join(tempRoot, "agentmux");
  const originalAgentmuxRoot = process.env.TERMCANVAS_AGENTMUX_ROOT;
  const spawnCalls = [];

  fs.mkdirSync(agentmuxRoot, { recursive: true });
  fs.writeFileSync(
    path.join(agentmuxRoot, "agentmux.py"),
    [
      "import sys",
      "assert sys.argv[1] == 'restart'",
      "assert sys.argv[2] == 'opencode-worker'",
      "print('Restarted opencode-worker (abc123)')",
      "print('tmux: agentmux-opencode-worker-abc123')",
      "print('run:  opencode --model ollama-cloud/glm-5.2 -s abc123')"
    ].join("\n"),
    "utf8"
  );
  process.env.TERMCANVAS_AGENTMUX_ROOT = agentmuxRoot;

  try {
    const { handlers, mainPath } = loadMainWithMocks({
      smokeTest: true,
      showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
      childProcessStub: {
        spawnSync: () => ({ status: 0, stdout: "", stderr: "" }),
        spawn: (command, args) => {
          spawnCalls.push({ command, args });
          return createMockSpawn(() => ({ status: 0, stdout: "Restarted opencode-worker (abc123)\ntmux: agentmux-opencode-worker-abc123\nrun:  opencode\n", stderr: "" }))(command, args);
        }
      }
    });

    const restart = handlers.get("canvas-agent:restart");
    const sender = { id: 221, once: () => {}, isDestroyed: () => false };
    const result = await restart({ sender }, { agentName: "opencode-worker", projectTag: "project-watch" });

    assert.deepEqual(result, { agentName: "opencode-worker", tmuxSessionName: "agentmux-opencode-worker-abc123" });
    assert.ok(spawnCalls.some(({ args }) => Array.isArray(args) && args.includes("restart")));
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

test("canvas-agent:restart surfaces agentmux failures", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "termcanvas-agent-restart-fail-"));
  const agentmuxRoot = path.join(tempRoot, "agentmux");
  const originalAgentmuxRoot = process.env.TERMCANVAS_AGENTMUX_ROOT;

  fs.mkdirSync(agentmuxRoot, { recursive: true });
  fs.writeFileSync(
    path.join(agentmuxRoot, "agentmux.py"),
    [
      "import sys",
      "print('No session found for missing-agent', file=sys.stderr)",
      "raise SystemExit(1)"
    ].join("\n"),
    "utf8"
  );
  process.env.TERMCANVAS_AGENTMUX_ROOT = agentmuxRoot;

  try {
    const { handlers, mainPath } = loadMainWithMocks({
      smokeTest: true,
      showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
      childProcessStub: {
        spawnSync: () => ({ status: 0, stdout: "", stderr: "" }),
        spawn: (command, args) => createMockSpawn(() => ({ status: 1, stdout: "", stderr: "No session found for missing-agent\n" }))(command, args)
      }
    });

    const restart = handlers.get("canvas-agent:restart");
    const sender = { id: 222, once: () => {}, isDestroyed: () => false };
    const result = await restart({ sender }, { agentName: "missing-agent", projectTag: "project-watch" });

    assert.match(result.error, /No session found/u);
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

test("canvas-agent:subscribe receives canvas-agent:changed when an adoption notifies the project tag", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "termcanvas-agent-subscribe-"));
  const agentmuxRoot = path.join(tempRoot, "agentmux");
  const originalAgentmuxRoot = process.env.TERMCANVAS_AGENTMUX_ROOT;

  fs.mkdirSync(agentmuxRoot, { recursive: true });
  fs.writeFileSync(path.join(agentmuxRoot, "agentmux.py"), "#!/usr/bin/env python3\n", "utf8");
  process.env.TERMCANVAS_AGENTMUX_ROOT = agentmuxRoot;

  try {
    const { handlers, mainPath, sentMessages } = loadMainWithMocks({
      smokeTest: true,
      showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
      childProcessStub: {
        spawn: createMockSpawn(() => ({ status: 0, stdout: "", stderr: "" }))
      }
    });
    const subscribe = handlers.get("canvas-agent:subscribe");
    const adopt = handlers.get("canvas-agent:adopt");
    const sender = {
      id: 220,
      once: () => {},
      isDestroyed: () => false
    };

    await subscribe(
      { sender },
      { projectTag: "project-watch" }
    );
    await adopt(
      { sender },
      {
        agentName: "terminal-abc",
        tmuxSessionName: "termcanvas-abc",
        projectTag: "project-watch",
        workdir: tempRoot
      }
    );

    await new Promise((resolve) => setTimeout(resolve, 400));
    const changedEvents = sentMessages.filter((entry) => entry.channel === "canvas-agent:changed");

    assert.ok(changedEvents.length >= 1, "expected at least one canvas-agent:changed event");
    assert.deepEqual(changedEvents[0].payload.changedProjectTags, ["project-watch"]);
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

test("canvas-agent:subscribe ignores change notifications for unwatched project tags", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "termcanvas-agent-subscribe-filter-"));
  const agentmuxRoot = path.join(tempRoot, "agentmux");
  const originalAgentmuxRoot = process.env.TERMCANVAS_AGENTMUX_ROOT;

  fs.mkdirSync(agentmuxRoot, { recursive: true });
  fs.writeFileSync(path.join(agentmuxRoot, "agentmux.py"), "#!/usr/bin/env python3\n", "utf8");
  process.env.TERMCANVAS_AGENTMUX_ROOT = agentmuxRoot;

  try {
    const { handlers, mainPath, sentMessages } = loadMainWithMocks({
      smokeTest: true,
      showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
      childProcessStub: {
        spawn: createMockSpawn(() => ({ status: 0, stdout: "", stderr: "" }))
      }
    });
    const subscribe = handlers.get("canvas-agent:subscribe");
    const adopt = handlers.get("canvas-agent:adopt");
    const sender = {
      id: 221,
      once: () => {},
      isDestroyed: () => false
    };

    await subscribe(
      { sender },
      { projectTag: "project-watch" }
    );
    await adopt(
      { sender },
      {
        agentName: "terminal-xyz",
        tmuxSessionName: "termcanvas-xyz",
        projectTag: "project-other",
        workdir: tempRoot
      }
    );

    await new Promise((resolve) => setTimeout(resolve, 400));
    const changedEvents = sentMessages.filter((entry) => entry.channel === "canvas-agent:changed");

    assert.deepEqual(changedEvents, []);
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

test("agent-skill install writes the bundled skill into the configured global skill root", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "termcanvas-agent-skill-ipc-"));
  const originalSkillRoot = process.env.TERMCANVAS_AGENT_SKILL_ROOT;
  process.env.TERMCANVAS_AGENT_SKILL_ROOT = tempRoot;

  const { handlers, mainPath } = loadMainWithMocks({
    smokeTest: true,
    showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
    showSaveDialog: async () => ({ canceled: true, filePath: undefined })
  });

  try {
    const getAgentSkillStatus = handlers.get("agent-skill:status");
    const installAgentSkill = handlers.get("agent-skill:install");
    const publicSkillPath = path.join(__dirname, "..", "skills", "agentmux", "SKILL.md");
    const installedSkillPath = path.join(tempRoot, "agentmux", "SKILL.md");

    assert.equal(typeof getAgentSkillStatus, "function");
    assert.equal(typeof installAgentSkill, "function");

    const before = await getAgentSkillStatus({ sender: { id: 104 } });
    assert.equal(before.available, true);
    assert.equal(before.installed, false);
    assert.equal(before.current, false);
    assert.equal(before.targetPath, installedSkillPath);

    const after = await installAgentSkill({ sender: { id: 104 } });
    assert.equal(after.installedNow, true);
    assert.equal(after.installed, true);
    assert.equal(after.current, true);
    assert.equal(after.targetPath, installedSkillPath);
    assert.equal(fs.readFileSync(installedSkillPath, "utf8"), fs.readFileSync(publicSkillPath, "utf8"));
  } finally {
    if (originalSkillRoot === undefined) {
      delete process.env.TERMCANVAS_AGENT_SKILL_ROOT;
    } else {
      process.env.TERMCANVAS_AGENT_SKILL_ROOT = originalSkillRoot;
    }
    delete require.cache[mainPath];
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
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
