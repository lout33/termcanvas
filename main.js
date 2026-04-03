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
    const logStep = (label) => {
      console.log(`[smoke] ${label}`);
    };

    const waitForSnapshot = async (readerScript, predicate, timeout = 5000, interval = 200) => {
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
    await delay(800);

    await window.webContents.executeJavaScript("window.__canvasLearningDebug.createTerminalAt(840, 360)");
    await delay(1000);

    const created = await window.webContents.executeJavaScript("window.__canvasLearningDebug.getSnapshot()");

    if (!created.hasNodes) {
      throw new Error("Smoke test failed: no terminal nodes were created.");
    }

    logStep("echo smoke-check");
    await window.webContents.executeJavaScript("window.__canvasLearningDebug.sendToFirstTerminal('echo smoke-check\\r')");
    await delay(1200);

    const snapshot = await window.webContents.executeJavaScript("window.__canvasLearningDebug.getSnapshot()");

    if (!snapshot.firstTerminalText.includes("smoke-check")) {
      throw new Error("Smoke test failed: terminal output did not include expected text.");
    }

    logStep("wheel pan background");
    const beforeWheelPan = await window.webContents.executeJavaScript("window.__canvasLearningDebug.getSnapshot()");
    const afterWheelPan = await window.webContents.executeJavaScript("window.__canvasLearningDebug.panBoardByWheel(90, 45)");

    if (
      beforeWheelPan.viewportOffset === null
      || afterWheelPan.viewportOffset === null
      || afterWheelPan.viewportOffset.x === beforeWheelPan.viewportOffset.x
      || afterWheelPan.viewportOffset.y === beforeWheelPan.viewportOffset.y
    ) {
      throw new Error("Smoke test failed: wheel navigation did not move the canvas viewport.");
    }

    logStep("modifier zoom background");
    const beforeZoom = await window.webContents.executeJavaScript("window.__canvasLearningDebug.getSnapshot()");
    const zoomAnchor = beforeZoom.firstNodeScreenPosition;
    const afterZoom = await window.webContents.executeJavaScript(`window.__canvasLearningDebug.zoomBoardByWheel(-120, ${JSON.stringify(zoomAnchor?.x ?? 840)}, ${JSON.stringify(zoomAnchor?.y ?? 360)})`);

    if (
      beforeZoom.viewportScale === null
      || afterZoom.viewportScale === null
      || zoomAnchor == null
      || afterZoom.viewportScale <= beforeZoom.viewportScale
      || afterZoom.firstNodeScreenPosition == null
      || Math.abs((afterZoom.firstNodeScreenPosition?.x ?? Number.NaN) - zoomAnchor.x) > 1
      || Math.abs((afterZoom.firstNodeScreenPosition?.y ?? Number.NaN) - zoomAnchor.y) > 1
    ) {
      throw new Error("Smoke test failed: modifier-wheel zoom did not change scale while keeping the pointer anchor stable.");
    }

    logStep("clamp zoom bounds");
    let zoomClampSnapshot = afterZoom;

    for (let iteration = 0; iteration < 20; iteration += 1) {
      zoomClampSnapshot = await window.webContents.executeJavaScript("window.__canvasLearningDebug.zoomBoardByWheel(-240)");
    }

    if (zoomClampSnapshot.viewportScale !== 1.8) {
      throw new Error("Smoke test failed: zoom-in scale did not clamp at the expected maximum.");
    }

    for (let iteration = 0; iteration < 30; iteration += 1) {
      zoomClampSnapshot = await window.webContents.executeJavaScript("window.__canvasLearningDebug.zoomBoardByWheel(240)");
    }

    if (zoomClampSnapshot.viewportScale !== 0.55) {
      throw new Error("Smoke test failed: zoom-out scale did not clamp at the expected minimum.");
    }

    logStep("block terminal wheel pan");
    const beforeTerminalWheelPan = await window.webContents.executeJavaScript("window.__canvasLearningDebug.getSnapshot()");
    const afterTerminalWheelPan = await window.webContents.executeJavaScript("window.__canvasLearningDebug.panBoardByWheel(90, 45, 'terminal')");

    if (
      beforeTerminalWheelPan.viewportOffset === null
      || afterTerminalWheelPan.viewportOffset === null
      || afterTerminalWheelPan.viewportOffset.x !== beforeTerminalWheelPan.viewportOffset.x
      || afterTerminalWheelPan.viewportOffset.y !== beforeTerminalWheelPan.viewportOffset.y
    ) {
      throw new Error("Smoke test failed: terminal-surface wheel gestures incorrectly panned the canvas.");
    }

    logStep("block terminal modifier zoom");
    const beforeTerminalZoom = await window.webContents.executeJavaScript("window.__canvasLearningDebug.getSnapshot()");
    const afterTerminalZoom = await window.webContents.executeJavaScript("window.__canvasLearningDebug.zoomBoardByWheel(-120, 840, 360, 'terminal')");

    if (
      beforeTerminalZoom.viewportScale === null
      || afterTerminalZoom.viewportScale === null
      || afterTerminalZoom.viewportScale !== beforeTerminalZoom.viewportScale
    ) {
      throw new Error("Smoke test failed: terminal-surface modifier-wheel gestures incorrectly zoomed the canvas.");
    }

    logStep("rename terminal");
    const renamedSnapshot = await window.webContents.executeJavaScript("window.__canvasLearningDebug.renameFirstTerminal('Main shell')");

    if (renamedSnapshot.nodeTitles[0] !== "Main shell") {
      throw new Error("Smoke test failed: terminal rename did not persist in renderer state.");
    }

    logStep("resize terminal");
    const resizedSnapshot = await window.webContents.executeJavaScript("window.__canvasLearningDebug.resizeFirstTerminalTo(660, 420)");

    if (
      resizedSnapshot.nodeSizes[0]?.width !== 660
      || resizedSnapshot.nodeSizes[0]?.height !== 420
    ) {
      throw new Error("Smoke test failed: terminal resize did not persist the new frame size.");
    }

    logStep("maximize terminal");
    const maximizedSnapshot = await window.webContents.executeJavaScript("window.__canvasLearningDebug.toggleMaximizeFirstTerminal()");

    if (maximizedSnapshot.maximizedNodeTitle !== "Main shell" || maximizedSnapshot.fullscreenExitVisible !== true) {
      throw new Error("Smoke test failed: terminal maximize did not activate for the renamed node.");
    }

    logStep("block zoom while maximized");
    const beforeMaximizedZoom = await window.webContents.executeJavaScript("window.__canvasLearningDebug.getSnapshot()");
    const afterMaximizedZoom = await window.webContents.executeJavaScript("window.__canvasLearningDebug.zoomBoardByWheel(-120, 840, 360)");

    if (
      beforeMaximizedZoom.viewportScale === null
      || afterMaximizedZoom.viewportScale === null
      || afterMaximizedZoom.viewportScale !== beforeMaximizedZoom.viewportScale
    ) {
      throw new Error("Smoke test failed: maximized-node mode did not block modifier-wheel zoom.");
    }

    logStep("block wheel while maximized");
    const beforeMaximizedWheelPan = await window.webContents.executeJavaScript("window.__canvasLearningDebug.getSnapshot()");
    const afterMaximizedWheelPan = await window.webContents.executeJavaScript("window.__canvasLearningDebug.panBoardByWheel(90, 45)");

    if (
      beforeMaximizedWheelPan.viewportOffset === null
      || afterMaximizedWheelPan.viewportOffset === null
      || afterMaximizedWheelPan.viewportOffset.x !== beforeMaximizedWheelPan.viewportOffset.x
      || afterMaximizedWheelPan.viewportOffset.y !== beforeMaximizedWheelPan.viewportOffset.y
    ) {
      throw new Error("Smoke test failed: maximized-node mode did not block wheel panning.");
    }

    logStep("restore terminal");
    const restoredSnapshot = await window.webContents.executeJavaScript("window.__canvasLearningDebug.exitFullscreen()");

    if (restoredSnapshot.maximizedNodeTitle !== null || restoredSnapshot.fullscreenExitVisible !== false) {
      throw new Error("Smoke test failed: terminal maximize restore did not clear focused mode.");
    }

    logStep("exit terminal");
    await window.webContents.executeJavaScript("window.__canvasLearningDebug.sendToFirstTerminal('exit\\r')");

    const exitedSnapshot = await waitForSnapshot(
      "window.__canvasLearningDebug.getSnapshot()",
      (snapshot) => snapshot.exitedNodeTitles[0] === "Main shell"
    );

    if (exitedSnapshot.exitedNodeTitles[0] !== "Main shell") {
      throw new Error("Smoke test failed: exited terminal state was not reflected after shell exit.");
    }

    logStep("reopen terminal");
    await window.webContents.executeJavaScript("window.__canvasLearningDebug.reopenFirstTerminal()");
    await waitForSnapshot(
      "window.__canvasLearningDebug.getSnapshot()",
      (snapshot) => snapshot.exitedNodeTitles.length === 0,
      6000
    );
    await window.webContents.executeJavaScript("window.__canvasLearningDebug.sendToFirstTerminal('echo reopen-check\\r')");
    const reopenedSnapshot = await waitForSnapshot(
      "window.__canvasLearningDebug.getSnapshot()",
      (snapshot) => snapshot.exitedNodeTitles.length === 0 && snapshot.firstTerminalText.includes("reopen-check"),
      6000
    );

    if (reopenedSnapshot.exitedNodeTitles.length !== 0 || !reopenedSnapshot.firstTerminalText.includes("reopen-check")) {
      throw new Error("Smoke test failed: reopen shell did not restore a live terminal session.");
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

    logStep("handoff canvas rename focus");
    const renameHandoffSnapshot = await window.webContents.executeJavaScript("window.__canvasLearningDebug.handoffCanvasRename(0, 1, 'Workspace', 'Research draft')");

    if (
      renameHandoffSnapshot.canvasNames[0] !== "Workspace"
      || renameHandoffSnapshot.activeCanvasRenameId === null
      || renameHandoffSnapshot.focusedCanvasRenameId !== renameHandoffSnapshot.activeCanvasRenameId
    ) {
      throw new Error("Smoke test failed: canvas rename handoff did not keep the second inline editor focused.");
    }

    logStep("rename second canvas");
    const renamedCanvasSnapshot = await window.webContents.executeJavaScript("window.__canvasLearningDebug.renameCanvasAt(1, 'Research canvas')");

    if (renamedCanvasSnapshot.canvasNames[1] !== "Research canvas" || renamedCanvasSnapshot.activeCanvasName !== "Research canvas") {
      throw new Error("Smoke test failed: inline canvas rename did not persist for the active canvas.");
    }

    await window.webContents.executeJavaScript("window.__canvasLearningDebug.createTerminalAt(840, 360)");
    await delay(1000);

    const secondCanvasSnapshot = await window.webContents.executeJavaScript("window.__canvasLearningDebug.getCanvasSnapshot()");

    if (secondCanvasSnapshot.activeCanvasName !== "Research canvas" || secondCanvasSnapshot.activeNodeCount !== 1) {
      throw new Error("Smoke test failed: second canvas did not keep its own terminal node.");
    }

    logStep("switch back first canvas");
    await window.webContents.executeJavaScript("window.__canvasLearningDebug.switchCanvas(0)");
    await delay(300);

    const firstCanvasSnapshot = await window.webContents.executeJavaScript("window.__canvasLearningDebug.getCanvasSnapshot()");

    if (
      firstCanvasSnapshot.activeCanvasName !== "Workspace"
      || firstCanvasSnapshot.activeNodeCount !== 1
      || firstCanvasSnapshot.visibleNodeCount !== 1
      || firstCanvasSnapshot.nodeTitles[0] !== "Main shell"
      || firstCanvasSnapshot.exitedNodeTitles.length !== 0
    ) {
      throw new Error("Smoke test failed: switching canvases did not restore the first canvas metadata and live state.");
    }

    logStep("toggle sidebar");
    const sidebarToggleSnapshot = await window.webContents.executeJavaScript("window.__canvasLearningDebug.toggleSidebar()");

    if (sidebarToggleSnapshot.sidebarCollapsed !== true) {
      throw new Error("Smoke test failed: sidebar did not collapse after toggle.");
    }

    const sidebarRestoreSnapshot = await window.webContents.executeJavaScript("window.__canvasLearningDebug.toggleSidebar()");

    if (sidebarRestoreSnapshot.sidebarCollapsed !== false) {
      throw new Error("Smoke test failed: sidebar did not reopen after second toggle.");
    }

    logStep("export import canvas");
    await window.webContents.executeJavaScript("window.__canvasLearningDebug.switchCanvas(0)");
    await window.webContents.executeJavaScript("window.__canvasLearningDebug.toggleMaximizeFirstTerminal()");
    const exportedCanvasJson = await window.webContents.executeJavaScript("JSON.stringify(window.__canvasLearningDebug.exportActiveCanvasData())");
    const importedCanvasResult = await window.webContents.executeJavaScript(`window.__canvasLearningDebug.importCanvasData(${JSON.stringify(exportedCanvasJson)})`);

    if (
      importedCanvasResult.snapshot.canvasCount !== 3
      || importedCanvasResult.snapshot.activeNodeCount !== 1
      || importedCanvasResult.snapshot.nodeTitles[0] !== "Main shell"
      || importedCanvasResult.snapshot.nodeSizes[0]?.width !== 660
      || importedCanvasResult.snapshot.nodeSizes[0]?.height !== 420
      || importedCanvasResult.snapshot.maximizedNodeTitle !== "Main shell"
      || importedCanvasResult.snapshot.viewportScale !== 0.55
      || importedCanvasResult.snapshot.viewportOffset === null
      || Math.abs(importedCanvasResult.snapshot.viewportOffset.x - zoomClampSnapshot.viewportOffset.x) > 0.001
      || Math.abs(importedCanvasResult.snapshot.viewportOffset.y - zoomClampSnapshot.viewportOffset.y) > 0.001
    ) {
      throw new Error("Smoke test failed: importing canvas JSON did not restore terminal node metadata and viewport zoom state.");
    }

    logStep("delete canvases");
    await window.webContents.executeJavaScript("window.__canvasLearningDebug.switchCanvas(0)");
    await window.webContents.executeJavaScript("window.__canvasLearningDebug.deleteActiveCanvas()");
    await delay(500);

    const afterCanvasDelete = await window.webContents.executeJavaScript("window.__canvasLearningDebug.getCanvasSnapshot()");

    if (afterCanvasDelete.canvasCount !== 2 || afterCanvasDelete.activeNodeCount !== 1) {
      throw new Error("Smoke test failed: deleting the active canvas did not fall back to the remaining canvas.");
    }

    const afterSecondCanvasDelete = await window.webContents.executeJavaScript("window.__canvasLearningDebug.deleteActiveCanvas()");

    if (afterSecondCanvasDelete.canvasCount !== 1) {
      throw new Error("Smoke test failed: deleting down to the final remaining canvas did not work.");
    }

    const afterLastCanvasDeleteAttempt = await window.webContents.executeJavaScript("window.__canvasLearningDebug.deleteActiveCanvas()");

    if (afterLastCanvasDeleteAttempt.canvasCount !== 1) {
      throw new Error("Smoke test failed: the final remaining canvas was deleted.");
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
