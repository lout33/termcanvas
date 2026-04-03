const { app, BrowserWindow, dialog, ipcMain, webContents } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const pty = require("node-pty");

const terminalSessions = new Map();

function resolveShell() {
  return process.env.SHELL || "/bin/zsh";
}

function ensureNodePtyHelperPermissions() {
  const helperPaths = [
    path.join(__dirname, "node_modules", "node-pty", "prebuilds", "darwin-arm64", "spawn-helper"),
    path.join(__dirname, "node_modules", "node-pty", "prebuilds", "darwin-x64", "spawn-helper")
  ];

  helperPaths.forEach((helperPath) => {
    if (fs.existsSync(helperPath)) {
      const currentMode = fs.statSync(helperPath).mode;
      fs.chmodSync(helperPath, currentMode | 0o111);
    }
  });
}

function resolveInitialWorkingDirectory() {
  return os.homedir();
}

function resolveTerminalWorkingDirectory(requestedCwd) {
  if (typeof requestedCwd !== "string" || requestedCwd.trim().length === 0) {
    return resolveInitialWorkingDirectory();
  }

  const normalizedPath = path.resolve(requestedCwd);

  try {
    if (fs.existsSync(normalizedPath) && fs.statSync(normalizedPath).isDirectory()) {
      return normalizedPath;
    }
  } catch {
    return resolveInitialWorkingDirectory();
  }

  return resolveInitialWorkingDirectory();
}

function escapeShellPathForSingleQuotes(targetPath) {
  return targetPath.replace(/'/g, "'\\''");
}

function normalizeCommandPathToken(rawValue) {
  if (typeof rawValue !== "string") {
    return null;
  }

  const trimmedValue = rawValue.trim();

  if (trimmedValue.length === 0) {
    return "";
  }

  if (
    (trimmedValue.startsWith("'") && trimmedValue.endsWith("'"))
    || (trimmedValue.startsWith('"') && trimmedValue.endsWith('"'))
  ) {
    return trimmedValue.slice(1, -1);
  }

  return trimmedValue;
}

function resolveTrackedWorkingDirectoryFromInput(currentCwd, data) {
  if (typeof data !== "string" || !/[\r\n]/u.test(data)) {
    return null;
  }

  const commandLine = data.split(/\r?\n/u)[0]?.trim() ?? "";

  if (!/^cd(?:\s|$)/u.test(commandLine) || /[;&|]/u.test(commandLine)) {
    return null;
  }

  const commandArgument = normalizeCommandPathToken(commandLine.slice(2));
  const baseCwd = currentCwd ?? resolveInitialWorkingDirectory();
  let nextCwd = null;

  if (commandArgument === "") {
    nextCwd = resolveInitialWorkingDirectory();
  } else if (commandArgument === null || commandArgument === "-") {
    return null;
  } else if (commandArgument === "~") {
    nextCwd = resolveInitialWorkingDirectory();
  } else if (commandArgument.startsWith("~/")) {
    nextCwd = path.join(resolveInitialWorkingDirectory(), commandArgument.slice(2));
  } else {
    nextCwd = path.resolve(baseCwd, commandArgument);
  }

  try {
    if (fs.existsSync(nextCwd) && fs.statSync(nextCwd).isDirectory()) {
      return nextCwd;
    }
  } catch {
    return null;
  }

  return null;
}

async function resolveTrackedSessionWorkingDirectory(session) {
  return session?.cwd ?? resolveInitialWorkingDirectory();
}

function getSession(terminalId) {
  return terminalSessions.get(terminalId);
}

function getOwnerContents(ownerWebContentsId) {
  const contents = webContents.fromId(ownerWebContentsId);

  if (contents == null || contents.isDestroyed()) {
    return null;
  }

  return contents;
}

function sendToOwner(ownerWebContentsId, channel, payload) {
  const contents = getOwnerContents(ownerWebContentsId);

  if (contents !== null) {
    contents.send(channel, payload);
  }
}

function destroyTerminalSession(terminalId) {
  const session = getSession(terminalId);

  if (session === undefined || session.isDisposing) {
    return;
  }

  session.isDisposing = true;
  session.pty.kill();
  terminalSessions.delete(terminalId);
}

function destroyOwnedTerminalSessions(ownerWebContentsId) {
  terminalSessions.forEach((session, terminalId) => {
    if (session.ownerWebContentsId === ownerWebContentsId) {
      destroyTerminalSession(terminalId);
    }
  });
}

function ensureAuthorizedSession(event, terminalId) {
  const session = getSession(terminalId);

  if (session === undefined) {
    throw new Error("Terminal session not found.");
  }

  if (session.ownerWebContentsId !== event.sender.id) {
    throw new Error("Terminal session is not owned by this window.");
  }

  return session;
}

function createMainWindow() {
  const window = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: "#0f1218",
    title: "Canvas Learning",
    show: false,
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.js")
    }
  });

  window.once("ready-to-show", () => {
    window.show();
  });

  void window.loadFile(path.join(__dirname, "index.html"));

  if (process.env.CANVAS_SMOKE_TEST === "1") {
    window.webContents.once("did-finish-load", () => {
      void runSmokeTest(window);
    });
  }

  return window;
}

function delay(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

async function runSmokeTest(window) {
  try {
    const logStep = (label) => {
      console.log(`[smoke] ${label}`);
    };

    const waitForSnapshot = async (readerScript, predicate, timeout = 5000, interval = 100) => {
      const startTime = Date.now();

      while (Date.now() - startTime < timeout) {
        const snapshot = await window.webContents.executeJavaScript(readerScript);

        if (predicate(snapshot)) {
          return snapshot;
        }

        await delay(interval);
      }

      return window.webContents.executeJavaScript(readerScript);
    };

    logStep("create first terminal");
    await delay(250);

    await window.webContents.executeJavaScript("window.__canvasLearningDebug.createTerminalAt(840, 360)");
    const created = await waitForSnapshot(
      "window.__canvasLearningDebug.getSnapshot()",
      (snapshot) => snapshot.hasNodes === true,
      4000
    );

    if (!created.hasNodes) {
      throw new Error("Smoke test failed: no terminal nodes were created.");
    }

    logStep("echo smoke-check");
    await window.webContents.executeJavaScript("window.__canvasLearningDebug.sendToFirstTerminal('echo smoke-check\\r')");
    const snapshot = await waitForSnapshot(
      "window.__canvasLearningDebug.getSnapshot()",
      (nextSnapshot) => nextSnapshot.firstTerminalText.includes("smoke-check"),
      5000
    );

    if (!snapshot.firstTerminalText.includes("smoke-check")) {
      throw new Error("Smoke test failed: terminal output did not include expected text.");
    }

    logStep("create second canvas");
    const afterCanvasCreate = await window.webContents.executeJavaScript("window.__canvasLearningDebug.createCanvas()");

    if (
      afterCanvasCreate.canvasCount !== 2
      || afterCanvasCreate.activeCanvasName !== "Canvas 2"
      || afterCanvasCreate.activeNodeCount !== 0
      || afterCanvasCreate.visibleNodeCount !== 0
    ) {
      throw new Error("Smoke test failed: creating a new canvas did not activate an empty second canvas.");
    }

    logStep("switch back first canvas");
    await window.webContents.executeJavaScript("window.__canvasLearningDebug.switchCanvas(0)");
    const firstCanvasSnapshot = await waitForSnapshot(
      "window.__canvasLearningDebug.getCanvasSnapshot()",
      (snapshot) => snapshot.activeCanvasName === "Canvas 1" && snapshot.activeNodeCount === 1 && snapshot.visibleNodeCount === 1,
      3000
    );

    if (firstCanvasSnapshot.activeCanvasName !== "Canvas 1" || firstCanvasSnapshot.visibleNodeCount !== 1) {
      throw new Error("Smoke test failed: switching canvases did not restore the first canvas terminal.");
    }

    logStep("export import canvas");
    const importedWorkingDirectory = __dirname;
    await window.webContents.executeJavaScript("window.__canvasLearningDebug.switchCanvas(0)");
    logStep("export import canvas - set cwd");
    await window.webContents.executeJavaScript(`window.__canvasLearningDebug.setFirstTerminalWorkingDirectory(${JSON.stringify(importedWorkingDirectory)})`);
    logStep("export import canvas - verify cwd before export");
    await window.webContents.executeJavaScript("window.__canvasLearningDebug.sendToFirstTerminal('pwd\\r')");
    const changedCwdSnapshot = await waitForSnapshot(
      "window.__canvasLearningDebug.getSnapshot()",
      (snapshot) => snapshot.firstTerminalText.includes(importedWorkingDirectory),
      6000
    );

    if (!changedCwdSnapshot.firstTerminalText.includes(importedWorkingDirectory)) {
      throw new Error("Smoke test failed: test terminal did not move into the expected working directory before export.");
    }

    const resolvedCurrentCwd = await window.webContents.executeJavaScript("window.__canvasLearningDebug.resolveFirstTerminalWorkingDirectory()");

    if (resolvedCurrentCwd !== importedWorkingDirectory) {
      throw new Error(`Smoke test failed: live cwd resolver returned ${JSON.stringify(resolvedCurrentCwd)} instead of ${JSON.stringify(importedWorkingDirectory)}.`);
    }

    logStep("export import canvas - export payload");
    const exportedCanvas = await window.webContents.executeJavaScript("window.__canvasLearningDebug.exportActiveCanvasData()");

    if (exportedCanvas.canvas?.terminalNodes?.[0]?.cwd !== importedWorkingDirectory) {
      throw new Error("Smoke test failed: exported canvas JSON did not capture the live terminal working directory.");
    }

    logStep("export import canvas - import payload");
    const importedCanvasResult = await window.webContents.executeJavaScript("window.__canvasLearningDebug.importLastExportedCanvasData()");

    if (
      importedCanvasResult.snapshot.canvasCount !== 3
      || importedCanvasResult.snapshot.activeNodeCount !== 1
      || importedCanvasResult.snapshot.nodeWorkingDirectories[0] !== importedWorkingDirectory
    ) {
      throw new Error(`Smoke test failed: importing canvas JSON did not restore terminal node metadata and viewport zoom state. Snapshot: ${JSON.stringify(importedCanvasResult.snapshot)}`);
    }

    logStep("verify imported cwd");
    await window.webContents.executeJavaScript("window.__canvasLearningDebug.sendToFirstTerminal('pwd\\r')");
    const importedCwdSnapshot = await waitForSnapshot(
      "window.__canvasLearningDebug.getSnapshot()",
      (snapshot) => snapshot.firstTerminalText.includes(importedWorkingDirectory),
      6000
    );

    if (!importedCwdSnapshot.firstTerminalText.includes(importedWorkingDirectory)) {
      throw new Error("Smoke test failed: imported terminal did not actually start in the saved working directory.");
    }

    await window.webContents.executeJavaScript("window.__canvasLearningDebug.updateLastExportedCanvasFirstCwd('/Users/lout/Documents/LIFE/output/apps_v3/better_agents_ui/canvas_learning/__missing_cwd__')");
    const fallbackImportResult = await window.webContents.executeJavaScript("window.__canvasLearningDebug.importLastExportedCanvasData()");

    if (fallbackImportResult.snapshot.nodeWorkingDirectories[0] !== os.homedir()) {
      throw new Error("Smoke test failed: importing a missing terminal working directory did not fall back to the default path.");
    }

    logStep("verify fallback cwd");
    await window.webContents.executeJavaScript("window.__canvasLearningDebug.sendToFirstTerminal('pwd\\r')");
    const fallbackCwdSnapshot = await waitForSnapshot(
      "window.__canvasLearningDebug.getSnapshot()",
      (snapshot) => snapshot.firstTerminalText.includes(os.homedir()),
      6000
    );

    if (!fallbackCwdSnapshot.firstTerminalText.includes(os.homedir())) {
      throw new Error("Smoke test failed: fallback imported terminal did not actually start in the default working directory.");
    }

    console.log("Smoke test passed.");
    app.quit();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    app.exit(1);
  }
}

void app.whenReady().then(() => {
  ensureNodePtyHelperPermissions();
  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("web-contents-created", (_event, contents) => {
  contents.on("destroyed", () => {
    destroyOwnedTerminalSessions(contents.id);
  });
});

ipcMain.handle("terminal:create", (event, payload) => {
  const { terminalId, cols, rows, cwd } = payload;

  if (typeof terminalId !== "string" || terminalId.trim().length === 0) {
    throw new Error("Terminal id is required.");
  }

  if (terminalSessions.has(terminalId)) {
    throw new Error("Terminal id already exists.");
  }

  const safeCols = Number.isFinite(cols) ? Math.max(20, Math.floor(cols)) : 80;
  const safeRows = Number.isFinite(rows) ? Math.max(8, Math.floor(rows)) : 24;
  const shell = resolveShell();
  const shellName = path.basename(shell);
  const terminalCwd = resolveTerminalWorkingDirectory(cwd);
  const shouldEnforceRequestedCwd = typeof cwd === "string" && cwd.trim().length > 0;

  const terminalPty = pty.spawn(shell, [], {
    name: "xterm-256color",
    cols: safeCols,
    rows: safeRows,
    cwd: terminalCwd,
    env: {
      ...process.env,
      TERM: "xterm-256color"
    }
  });

  const session = {
    ownerWebContentsId: event.sender.id,
    pty: terminalPty,
    shellName,
    cwd: terminalCwd,
    isDisposing: false
  };

  terminalSessions.set(terminalId, session);

  if (shouldEnforceRequestedCwd) {
    terminalPty.write(`cd -- '${escapeShellPathForSingleQuotes(terminalCwd)}'\r`);
  }

  terminalPty.onData((data) => {
    sendToOwner(session.ownerWebContentsId, "terminal:data", {
      terminalId,
      data
    });
  });

  terminalPty.onExit(({ exitCode, signal }) => {
    sendToOwner(session.ownerWebContentsId, "terminal:exit", {
      terminalId,
      exitCode,
      signal
    });
    terminalSessions.delete(terminalId);
  });

  return {
    terminalId,
    shellName,
    cwd: terminalCwd,
    cols: safeCols,
    rows: safeRows
  };
});

ipcMain.handle("terminal:resolve-tracked-cwds", async (event, payload) => {
  const terminalIds = Array.isArray(payload?.terminalIds) ? payload.terminalIds : [];
  const cwdByTerminalId = {};

  await Promise.all(terminalIds.map(async (terminalId) => {
    if (typeof terminalId !== "string") {
      return;
    }

    const session = ensureAuthorizedSession(event, terminalId);
    cwdByTerminalId[terminalId] = await resolveTrackedSessionWorkingDirectory(session);
  }));

  return cwdByTerminalId;
});

ipcMain.handle("terminal:write", (event, payload) => {
  const session = ensureAuthorizedSession(event, payload.terminalId);
  const data = typeof payload.data === "string" ? payload.data : "";

  if (data.length > 0) {
    const trackedCwd = resolveTrackedWorkingDirectoryFromInput(session.cwd, data);

    if (trackedCwd !== null) {
      session.cwd = trackedCwd;
    }

    session.pty.write(data);
  }
});

ipcMain.handle("terminal:resize", (event, payload) => {
  const session = getSession(payload.terminalId);

  if (session === undefined) {
    return;
  }

  if (session.ownerWebContentsId !== event.sender.id) {
    throw new Error("Terminal session is not owned by this window.");
  }

  const cols = Number.isFinite(payload.cols) ? Math.max(20, Math.floor(payload.cols)) : 80;
  const rows = Number.isFinite(payload.rows) ? Math.max(8, Math.floor(payload.rows)) : 24;

  session.pty.resize(cols, rows);
});

ipcMain.handle("terminal:destroy", (event, payload) => {
  const session = getSession(payload.terminalId);

  if (session === undefined) {
    return;
  }

  if (session.ownerWebContentsId !== event.sender.id) {
    throw new Error("Terminal session is not owned by this window.");
  }

  destroyTerminalSession(payload.terminalId);
});

ipcMain.handle("canvas:save-file", async (event, payload) => {
  const ownerWindow = BrowserWindow.fromWebContents(event.sender);

  if (ownerWindow === null) {
    throw new Error("Unable to resolve owner window.");
  }

  const suggestedName = typeof payload?.suggestedName === "string" && payload.suggestedName.trim().length > 0
    ? payload.suggestedName.trim()
    : "canvas-learning-canvas";
  const contents = typeof payload?.contents === "string" ? payload.contents : "";

  if (contents.length === 0) {
    throw new Error("Canvas export contents are required.");
  }

  const { canceled, filePath } = await dialog.showSaveDialog(ownerWindow, {
    title: "Export canvas JSON",
    defaultPath: path.join(app.getPath("documents"), `${suggestedName}.json`),
    filters: [{ name: "Canvas JSON", extensions: ["json"] }]
  });

  if (canceled || typeof filePath !== "string") {
    return { canceled: true };
  }

  fs.writeFileSync(filePath, contents, "utf8");
  return { canceled: false, filePath };
});

ipcMain.handle("canvas:open-file", async (event) => {
  const ownerWindow = BrowserWindow.fromWebContents(event.sender);

  if (ownerWindow === null) {
    throw new Error("Unable to resolve owner window.");
  }

  const { canceled, filePaths } = await dialog.showOpenDialog(ownerWindow, {
    title: "Import canvas JSON",
    properties: ["openFile"],
    filters: [{ name: "Canvas JSON", extensions: ["json"] }]
  });

  const filePath = filePaths[0];

  if (canceled || typeof filePath !== "string") {
    return { canceled: true };
  }

  return {
    canceled: false,
    filePath,
    contents: fs.readFileSync(filePath, "utf8")
  };
});
