const { app, BrowserWindow, dialog, ipcMain, webContents } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const pty = require("node-pty");
const { createDirectorySnapshot } = require("./directory_snapshot");
const { readWorkspaceFilePreview } = require("./workspace_file_preview");

const terminalSessions = new Map();
const workspaceDirectories = new Map();
const workspaceWatchers = new Map();
const WORKSPACE_WATCH_DEBOUNCE_MS = 180;

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

function resolveExistingDirectoryPath(requestedPath) {
  if (typeof requestedPath !== "string" || requestedPath.trim().length === 0) {
    return null;
  }

  const normalizedPath = path.resolve(requestedPath);

  try {
    if (fs.existsSync(normalizedPath) && fs.statSync(normalizedPath).isDirectory()) {
      return normalizedPath;
    }
  } catch {
    return null;
  }

  return null;
}

function resolveTerminalWorkingDirectory(requestedCwd) {
  return resolveExistingDirectoryPath(requestedCwd) ?? resolveInitialWorkingDirectory();
}

function getOwnerWorkspaceDirectory(ownerWebContentsId) {
  return workspaceDirectories.get(ownerWebContentsId) ?? null;
}

function destroyWorkspaceWatcher(ownerWebContentsId) {
  const workspaceWatcher = workspaceWatchers.get(ownerWebContentsId);

  if (workspaceWatcher === undefined) {
    return;
  }

  if (workspaceWatcher.refreshTimeout !== 0) {
    clearTimeout(workspaceWatcher.refreshTimeout);
  }

  workspaceWatcher.watcher?.close();
  workspaceWatchers.delete(ownerWebContentsId);
}

function pushWorkspaceSnapshotToOwner(ownerWebContentsId) {
  const workspaceDirectory = getOwnerWorkspaceDirectory(ownerWebContentsId);
  const resolvedDirectoryPath = resolveExistingDirectoryPath(workspaceDirectory);

  if (resolvedDirectoryPath === null) {
    setOwnerWorkspaceDirectory(ownerWebContentsId, null);
    sendToOwner(ownerWebContentsId, "workspace-directory:data", null);
    return;
  }

  try {
    sendToOwner(ownerWebContentsId, "workspace-directory:data", createDirectorySnapshot(resolvedDirectoryPath));
  } catch {
    setOwnerWorkspaceDirectory(ownerWebContentsId, null);
    sendToOwner(ownerWebContentsId, "workspace-directory:data", null);
  }
}

function scheduleWorkspaceSnapshotPush(ownerWebContentsId) {
  const workspaceWatcher = workspaceWatchers.get(ownerWebContentsId);

  if (workspaceWatcher === undefined) {
    return;
  }

  if (workspaceWatcher.refreshTimeout !== 0) {
    clearTimeout(workspaceWatcher.refreshTimeout);
  }

  workspaceWatcher.refreshTimeout = setTimeout(() => {
    workspaceWatcher.refreshTimeout = 0;
    pushWorkspaceSnapshotToOwner(ownerWebContentsId);
  }, WORKSPACE_WATCH_DEBOUNCE_MS);
}

function watchWorkspaceDirectory(ownerWebContentsId, directoryPath) {
  destroyWorkspaceWatcher(ownerWebContentsId);

  try {
    const watcher = fs.watch(directoryPath, { recursive: true }, () => {
      scheduleWorkspaceSnapshotPush(ownerWebContentsId);
    });

    watcher.on("error", () => {
      scheduleWorkspaceSnapshotPush(ownerWebContentsId);
    });

    workspaceWatchers.set(ownerWebContentsId, {
      watcher,
      refreshTimeout: 0
    });
  } catch {
    workspaceWatchers.delete(ownerWebContentsId);
  }
}

function setOwnerWorkspaceDirectory(ownerWebContentsId, directoryPath) {
  if (typeof directoryPath === "string" && directoryPath.length > 0) {
    workspaceDirectories.set(ownerWebContentsId, directoryPath);
    return;
  }

  workspaceDirectories.delete(ownerWebContentsId);
  destroyWorkspaceWatcher(ownerWebContentsId);
}

function resolveDialogDefaultDirectory(ownerWebContentsId) {
  return resolveExistingDirectoryPath(getOwnerWorkspaceDirectory(ownerWebContentsId)) ?? app.getPath("documents");
}

function openWorkspaceDirectoryForOwner(ownerWebContentsId, directoryPath) {
  const resolvedDirectoryPath = resolveExistingDirectoryPath(directoryPath);

  if (resolvedDirectoryPath === null) {
    throw new Error("Selected workspace folder is unavailable.");
  }

  const snapshot = createDirectorySnapshot(resolvedDirectoryPath);
  setOwnerWorkspaceDirectory(ownerWebContentsId, resolvedDirectoryPath);
  watchWorkspaceDirectory(ownerWebContentsId, resolvedDirectoryPath);
  return snapshot;
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

function destroyOwnedWindowState(ownerWebContentsId) {
  destroyOwnedTerminalSessions(ownerWebContentsId);
  setOwnerWorkspaceDirectory(ownerWebContentsId, null);
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
  let smokeWorkspacePath = null;

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

    logStep("verify workspace section stays visible");
    await window.webContents.executeJavaScript(`Array.from({ length: 18 }, () => window.__canvasLearningDebug.createCanvas())`);
    const workspaceSidebarSnapshot = await window.webContents.executeJavaScript("window.__canvasLearningDebug.populateWorkspaceEntries(240)");

    if (
      workspaceSidebarSnapshot.workspaceRootPath !== "/tmp/canvas-learning-workspace-debug"
      || workspaceSidebarSnapshot.workspaceEntryPaths.length !== 240
      || workspaceSidebarSnapshot.workspaceSectionVisible !== true
    ) {
      throw new Error(`Smoke test failed: workspace sidebar section was clipped after loading folder entries. Snapshot: ${JSON.stringify(workspaceSidebarSnapshot)}`);
    }

    const sidebarScrollSnapshot = await window.webContents.executeJavaScript(`(() => {
      const sidebarContent = document.querySelector('.canvas-sidebar-content');

      if (!(sidebarContent instanceof HTMLElement)) {
        return null;
      }

      return {
        clientHeight: sidebarContent.clientHeight,
        scrollHeight: sidebarContent.scrollHeight,
        overflowY: getComputedStyle(sidebarContent).overflowY
      };
    })()`);

    if (
      sidebarScrollSnapshot === null
      || !["auto", "scroll"].includes(sidebarScrollSnapshot.overflowY)
    ) {
      throw new Error(`Smoke test failed: crowded sidebar content was not scrollable. Snapshot: ${JSON.stringify(sidebarScrollSnapshot)}`);
    }

    logStep("preview workspace markdown file");
    smokeWorkspacePath = fs.mkdtempSync(path.join(os.tmpdir(), "canvas-learning-smoke-workspace-"));
    fs.mkdirSync(path.join(smokeWorkspacePath, "agent-output", "reports"), { recursive: true });
    fs.writeFileSync(path.join(smokeWorkspacePath, "agent-output", "reports", "notes.md"), "# Smoke Report\n\nfirst pass\n", "utf8");
    fs.writeFileSync(path.join(smokeWorkspacePath, "artifact.bin"), Buffer.from([0xde, 0xad, 0xbe, 0xef]));

    await window.webContents.executeJavaScript(`window.__canvasLearningDebug.openWorkspaceDirectoryForPath(${JSON.stringify(smokeWorkspacePath)})`);
    const workspaceOpenSnapshot = await waitForSnapshot(
      "window.__canvasLearningDebug.getSnapshot()",
      (snapshot) => snapshot.workspaceRootPath === smokeWorkspacePath && snapshot.workspaceVisibleEntryPaths.includes("agent-output"),
      4000
    );

    if (workspaceOpenSnapshot.workspaceRootPath !== smokeWorkspacePath) {
      throw new Error("Smoke test failed: debug workspace path did not open in the renderer.");
    }

    await window.webContents.executeJavaScript(`window.__canvasLearningDebug.toggleWorkspaceDirectory(${JSON.stringify("agent-output")})`);
    await window.webContents.executeJavaScript(`window.__canvasLearningDebug.toggleWorkspaceDirectory(${JSON.stringify("agent-output/reports")})`);
    const expandedWorkspaceSnapshot = await waitForSnapshot(
      "window.__canvasLearningDebug.getSnapshot()",
      (snapshot) => snapshot.workspaceVisibleEntryPaths.includes("agent-output/reports/notes.md"),
      4000
    );

    if (!expandedWorkspaceSnapshot.workspaceVisibleEntryPaths.includes("agent-output/reports/notes.md")) {
      throw new Error("Smoke test failed: nested workspace file did not become visible after expanding folders.");
    }

    await window.webContents.executeJavaScript(`window.__canvasLearningDebug.selectWorkspaceFile(${JSON.stringify("agent-output/reports/notes.md")})`);
    const markdownPreviewSnapshot = await waitForSnapshot(
      "window.__canvasLearningDebug.getSnapshot()",
      (snapshot) => snapshot.fileInspectorVisible === true && snapshot.workspacePreviewContents.includes("# Smoke Report"),
      4000
    );

    if (
      markdownPreviewSnapshot.workspaceSelectedFilePath !== "agent-output/reports/notes.md"
      || markdownPreviewSnapshot.workspacePreviewContents.includes("# Smoke Report") !== true
    ) {
      throw new Error(`Smoke test failed: markdown preview did not open correctly. Snapshot: ${JSON.stringify(markdownPreviewSnapshot)}`);
    }

    logStep("refresh selected workspace file preview");
    fs.writeFileSync(path.join(smokeWorkspacePath, "agent-output", "reports", "notes.md"), "# Smoke Report\n\nsecond pass\n", "utf8");
    await window.webContents.executeJavaScript("window.__canvasLearningDebug.refreshSelectedWorkspaceFilePreview()");
    const refreshedPreviewSnapshot = await waitForSnapshot(
      "window.__canvasLearningDebug.getSnapshot()",
      (snapshot) => snapshot.workspacePreviewContents.includes("second pass"),
      4000
    );

    if (!refreshedPreviewSnapshot.workspacePreviewContents.includes("second pass")) {
      throw new Error("Smoke test failed: manual file preview refresh did not reload updated content.");
    }

    logStep("preview unsupported workspace file");
    await window.webContents.executeJavaScript(`window.__canvasLearningDebug.selectWorkspaceFile(${JSON.stringify("artifact.bin")})`);
    const unsupportedPreviewSnapshot = await waitForSnapshot(
      "window.__canvasLearningDebug.getSnapshot()",
      (snapshot) => snapshot.workspacePreviewKind === "unsupported",
      4000
    );

    if (unsupportedPreviewSnapshot.workspacePreviewKind !== "unsupported") {
      throw new Error("Smoke test failed: unsupported workspace file did not produce the expected fallback preview state.");
    }

    console.log("Smoke test passed.");
    app.quit();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    app.exit(1);
  } finally {
    if (typeof smokeWorkspacePath === "string") {
      fs.rmSync(smokeWorkspacePath, { recursive: true, force: true });
    }
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
    destroyOwnedWindowState(contents.id);
  });
});

ipcMain.handle("workspace-directory:open", async (event) => {
  const ownerWindow = BrowserWindow.fromWebContents(event.sender);

  if (ownerWindow === null) {
    throw new Error("Unable to resolve owner window.");
  }

  const { canceled, filePaths } = await dialog.showOpenDialog(ownerWindow, {
    title: "Open workspace folder",
    defaultPath: resolveDialogDefaultDirectory(event.sender.id),
    properties: ["openDirectory"]
  });

  const selectedPath = filePaths[0];

  if (canceled || typeof selectedPath !== "string") {
    return { canceled: true };
  }

  const snapshot = openWorkspaceDirectoryForOwner(event.sender.id, selectedPath);

  return {
    canceled: false,
    snapshot
  };
});

ipcMain.handle("workspace-directory:debug-open", (event, payload) => {
  if (process.env.CANVAS_SMOKE_TEST !== "1") {
    throw new Error("Workspace debug open is only available during smoke tests.");
  }

  return openWorkspaceDirectoryForOwner(
    event.sender.id,
    typeof payload?.directoryPath === "string" ? payload.directoryPath : ""
  );
});

ipcMain.handle("workspace-directory:refresh", (event) => {
  const workspaceDirectory = getOwnerWorkspaceDirectory(event.sender.id);

  if (workspaceDirectory === null) {
    return null;
  }

  const resolvedDirectoryPath = resolveExistingDirectoryPath(workspaceDirectory);

  if (resolvedDirectoryPath === null) {
    setOwnerWorkspaceDirectory(event.sender.id, null);
    throw new Error("Workspace folder is unavailable.");
  }

  try {
    return createDirectorySnapshot(resolvedDirectoryPath);
  } catch {
    setOwnerWorkspaceDirectory(event.sender.id, null);
    throw new Error("Workspace folder is unavailable.");
  }
});

ipcMain.handle("workspace-file:read", (event, payload) => {
  const workspaceDirectory = getOwnerWorkspaceDirectory(event.sender.id);

  if (workspaceDirectory === null) {
    throw new Error("Open a workspace folder before previewing files.");
  }

  return readWorkspaceFilePreview(
    workspaceDirectory,
    typeof payload?.relativePath === "string" ? payload.relativePath : ""
  );
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
    defaultPath: path.join(resolveDialogDefaultDirectory(event.sender.id), `${suggestedName}.json`),
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
    defaultPath: resolveDialogDefaultDirectory(event.sender.id),
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
