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

function getSession(terminalId) {
  return terminalSessions.get(terminalId);
}

function getOwnerContents(ownerWebContentsId) {
  const contents = webContents.fromId(ownerWebContentsId);

  if (contents === null || contents.isDestroyed()) {
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
    await delay(800);

    await window.webContents.executeJavaScript("window.__canvasLearningDebug.createTerminalAt(840, 360)");
    await delay(1000);

    const created = await window.webContents.executeJavaScript("window.__canvasLearningDebug.getSnapshot()");

    if (!created.hasNodes) {
      throw new Error("Smoke test failed: no terminal nodes were created.");
    }

    await window.webContents.executeJavaScript("window.__canvasLearningDebug.sendToFirstTerminal('echo smoke-check\\r')");
    await delay(1200);

    const snapshot = await window.webContents.executeJavaScript("window.__canvasLearningDebug.getSnapshot()");

    if (!snapshot.firstTerminalText.includes("smoke-check")) {
      throw new Error("Smoke test failed: terminal output did not include expected text.");
    }

    const afterCanvasCreate = await window.webContents.executeJavaScript("window.__canvasLearningDebug.createCanvas()");

    if (afterCanvasCreate.canvasCount !== 2 || afterCanvasCreate.activeCanvasName !== "Canvas 2" || afterCanvasCreate.activeNodeCount !== 0) {
      throw new Error("Smoke test failed: creating a new canvas did not activate an empty second canvas.");
    }

    await window.webContents.executeJavaScript("window.__canvasLearningDebug.createTerminalAt(840, 360)");
    await delay(1000);

    const secondCanvasSnapshot = await window.webContents.executeJavaScript("window.__canvasLearningDebug.getCanvasSnapshot()");

    if (secondCanvasSnapshot.activeCanvasName !== "Canvas 2" || secondCanvasSnapshot.activeNodeCount !== 1) {
      throw new Error("Smoke test failed: second canvas did not keep its own terminal node.");
    }

    await window.webContents.executeJavaScript("window.__canvasLearningDebug.switchCanvas(0)");
    await delay(300);

    const firstCanvasSnapshot = await window.webContents.executeJavaScript("window.__canvasLearningDebug.getCanvasSnapshot()");

    if (firstCanvasSnapshot.activeCanvasName !== "Canvas 1" || firstCanvasSnapshot.activeNodeCount !== 1 || !firstCanvasSnapshot.firstTerminalText.includes("smoke-check")) {
      throw new Error("Smoke test failed: switching canvases did not restore the first canvas state.");
    }

    await window.webContents.executeJavaScript("window.__canvasLearningDebug.deleteActiveCanvas()");
    await delay(500);

    const afterCanvasDelete = await window.webContents.executeJavaScript("window.__canvasLearningDebug.getCanvasSnapshot()");

    if (afterCanvasDelete.canvasCount !== 1 || afterCanvasDelete.activeCanvasName !== "Canvas 2" || afterCanvasDelete.activeNodeCount !== 1) {
      throw new Error("Smoke test failed: deleting the active canvas did not fall back to the remaining canvas.");
    }

    const afterLastCanvasDeleteAttempt = await window.webContents.executeJavaScript("window.__canvasLearningDebug.deleteActiveCanvas()");

    if (afterLastCanvasDeleteAttempt.canvasCount !== 1) {
      throw new Error("Smoke test failed: the final remaining canvas was deleted.");
    }

    const sidebarToggleSnapshot = await window.webContents.executeJavaScript("window.__canvasLearningDebug.toggleSidebar()");

    if (sidebarToggleSnapshot.sidebarCollapsed !== true) {
      throw new Error("Smoke test failed: sidebar did not collapse after toggle.");
    }

    const sidebarRestoreSnapshot = await window.webContents.executeJavaScript("window.__canvasLearningDebug.toggleSidebar()");

    if (sidebarRestoreSnapshot.sidebarCollapsed !== false) {
      throw new Error("Smoke test failed: sidebar did not reopen after second toggle.");
    }

    await window.webContents.executeJavaScript("window.__canvasLearningDebug.switchCanvas(0)");
    const exportedCanvasJson = await window.webContents.executeJavaScript("JSON.stringify(window.__canvasLearningDebug.exportActiveCanvasData())");
    const importedCanvasResult = await window.webContents.executeJavaScript(`window.__canvasLearningDebug.importCanvasData(${JSON.stringify(exportedCanvasJson)})`);

    if (importedCanvasResult.snapshot.canvasCount !== 2 || importedCanvasResult.snapshot.activeNodeCount !== 1) {
      throw new Error("Smoke test failed: importing canvas JSON did not create a new canvas with restored terminal nodes.");
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
  const { terminalId, cols, rows } = payload;

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

  const terminalPty = pty.spawn(shell, [], {
    name: "xterm-256color",
    cols: safeCols,
    rows: safeRows,
    cwd: resolveInitialWorkingDirectory(),
    env: {
      ...process.env,
      TERM: "xterm-256color"
    }
  });

  const session = {
    ownerWebContentsId: event.sender.id,
    pty: terminalPty,
    shellName,
    isDisposing: false
  };

  terminalSessions.set(terminalId, session);

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
    cols: safeCols,
    rows: safeRows
  };
});

ipcMain.handle("terminal:write", (event, payload) => {
  const session = ensureAuthorizedSession(event, payload.terminalId);
  const data = typeof payload.data === "string" ? payload.data : "";

  if (data.length > 0) {
    session.pty.write(data);
  }
});

ipcMain.handle("terminal:resize", (event, payload) => {
  const session = ensureAuthorizedSession(event, payload.terminalId);
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
