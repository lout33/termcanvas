const { app, BrowserWindow, dialog, ipcMain, webContents } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const pty = require("node-pty");
const { createDirectorySnapshot } = require("./directory_snapshot");
const {
  activateWorkspaceFolder,
  createWorkspaceRegistry,
  getWorkspaceFolder,
  importWorkspaceFolder,
  removeWorkspaceFolder,
  serializeWorkspaceRegistry,
  setWorkspaceFolderError,
  updateWorkspaceFolderSnapshot
} = require("./workspace_registry");
const { readWorkspaceFilePreview } = require("./workspace_file_preview");

const terminalSessions = new Map();
const workspaceRegistries = new Map();
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

function getOwnerWorkspaceRegistry(ownerWebContentsId) {
  let workspaceRegistry = workspaceRegistries.get(ownerWebContentsId);

  if (workspaceRegistry == null) {
    workspaceRegistry = createWorkspaceRegistry();
    workspaceRegistries.set(ownerWebContentsId, workspaceRegistry);
  }

  return workspaceRegistry;
}

function getExistingOwnerWorkspaceRegistry(ownerWebContentsId) {
  return workspaceRegistries.get(ownerWebContentsId) ?? null;
}

function getActiveWorkspaceFolderForOwner(ownerWebContentsId) {
  const workspaceRegistry = getExistingOwnerWorkspaceRegistry(ownerWebContentsId);

  if (workspaceRegistry == null || workspaceRegistry.activeFolderId === null) {
    return null;
  }

  return getWorkspaceFolder(workspaceRegistry, workspaceRegistry.activeFolderId);
}

function getOwnerWorkspaceWatchers(ownerWebContentsId) {
  let ownerWatchers = workspaceWatchers.get(ownerWebContentsId);

  if (ownerWatchers == null) {
    ownerWatchers = new Map();
    workspaceWatchers.set(ownerWebContentsId, ownerWatchers);
  }

  return ownerWatchers;
}

function destroyWorkspaceWatcher(ownerWebContentsId, folderId) {
  const ownerWatchers = workspaceWatchers.get(ownerWebContentsId);

  if (ownerWatchers == null) {
    return;
  }

  const workspaceWatcher = ownerWatchers.get(folderId);

  if (workspaceWatcher === undefined) {
    return;
  }

  if (workspaceWatcher.refreshTimeout !== 0) {
    clearTimeout(workspaceWatcher.refreshTimeout);
  }

  workspaceWatcher.watcher?.close();
  ownerWatchers.delete(folderId);

  if (ownerWatchers.size === 0) {
    workspaceWatchers.delete(ownerWebContentsId);
  }
}

function destroyOwnedWorkspaceWatchers(ownerWebContentsId) {
  const ownerWatchers = workspaceWatchers.get(ownerWebContentsId);

  if (ownerWatchers == null) {
    return;
  }

  ownerWatchers.forEach((workspaceWatcher) => {
    if (workspaceWatcher.refreshTimeout !== 0) {
      clearTimeout(workspaceWatcher.refreshTimeout);
    }

    workspaceWatcher.watcher?.close();
  });

  workspaceWatchers.delete(ownerWebContentsId);
}

function pushWorkspaceRegistryToOwner(ownerWebContentsId) {
  const workspaceRegistry = getExistingOwnerWorkspaceRegistry(ownerWebContentsId);

  if (workspaceRegistry === null) {
    sendToOwner(ownerWebContentsId, "workspace-directory:data", {
      importedFolders: [],
      activeFolderId: null
    });
    return;
  }

  sendToOwner(ownerWebContentsId, "workspace-directory:data", serializeWorkspaceRegistry(workspaceRegistry));
}

function refreshWorkspaceFolderForOwner(ownerWebContentsId, folderId) {
  const workspaceRegistry = getExistingOwnerWorkspaceRegistry(ownerWebContentsId);

  if (workspaceRegistry === null) {
    return {
      importedFolders: [],
      activeFolderId: null
    };
  }

  const workspaceFolder = getWorkspaceFolder(workspaceRegistry, folderId);

  if (workspaceFolder === null) {
    destroyWorkspaceWatcher(ownerWebContentsId, folderId);
    return serializeWorkspaceRegistry(workspaceRegistry);
  }

  const resolvedDirectoryPath = resolveExistingDirectoryPath(workspaceFolder.rootPath);

  if (resolvedDirectoryPath === null) {
    setWorkspaceFolderError(workspaceRegistry, folderId, "Workspace folder is unavailable.");
    return serializeWorkspaceRegistry(workspaceRegistry);
  }

  try {
    updateWorkspaceFolderSnapshot(workspaceRegistry, folderId, {
      ...createDirectorySnapshot(resolvedDirectoryPath),
      lastError: ""
    });
  } catch {
    setWorkspaceFolderError(workspaceRegistry, folderId, "Workspace folder is unavailable.");
  }

  return serializeWorkspaceRegistry(workspaceRegistry);
}

function scheduleWorkspaceSnapshotPush(ownerWebContentsId, folderId) {
  const ownerWatchers = workspaceWatchers.get(ownerWebContentsId);

  if (ownerWatchers == null) {
    return;
  }

  const workspaceWatcher = ownerWatchers.get(folderId);

  if (workspaceWatcher === undefined) {
    return;
  }

  if (workspaceWatcher.refreshTimeout !== 0) {
    clearTimeout(workspaceWatcher.refreshTimeout);
  }

  workspaceWatcher.refreshTimeout = setTimeout(() => {
    workspaceWatcher.refreshTimeout = 0;
    refreshWorkspaceFolderForOwner(ownerWebContentsId, folderId);
    pushWorkspaceRegistryToOwner(ownerWebContentsId);
  }, WORKSPACE_WATCH_DEBOUNCE_MS);
}

function watchWorkspaceDirectory(ownerWebContentsId, folderId, directoryPath) {
  destroyWorkspaceWatcher(ownerWebContentsId, folderId);

  try {
    const watcher = fs.watch(directoryPath, { recursive: true }, () => {
      scheduleWorkspaceSnapshotPush(ownerWebContentsId, folderId);
    });

    watcher.on("error", () => {
      scheduleWorkspaceSnapshotPush(ownerWebContentsId, folderId);
    });

    getOwnerWorkspaceWatchers(ownerWebContentsId).set(folderId, {
      watcher,
      refreshTimeout: 0
    });
  } catch {
    const workspaceRegistry = getExistingOwnerWorkspaceRegistry(ownerWebContentsId);

    if (workspaceRegistry !== null) {
      setWorkspaceFolderError(workspaceRegistry, folderId, "Workspace folder watch is unavailable.");
      pushWorkspaceRegistryToOwner(ownerWebContentsId);
    }
  }
}

function resolveDialogDefaultDirectory(ownerWebContentsId) {
  return resolveExistingDirectoryPath(getActiveWorkspaceFolderForOwner(ownerWebContentsId)?.rootPath) ?? app.getPath("documents");
}

function openWorkspaceDirectoryForOwner(ownerWebContentsId, directoryPath) {
  const resolvedDirectoryPath = resolveExistingDirectoryPath(directoryPath);

  if (resolvedDirectoryPath === null) {
    throw new Error("Selected workspace folder is unavailable.");
  }

  const canonicalDirectoryPath = fs.realpathSync(resolvedDirectoryPath);

  const workspaceRegistry = getOwnerWorkspaceRegistry(ownerWebContentsId);
  const snapshot = {
    ...createDirectorySnapshot(canonicalDirectoryPath),
    lastError: ""
  };
  const importResult = importWorkspaceFolder(workspaceRegistry, snapshot);

  if (importResult.deduplicated) {
    updateWorkspaceFolderSnapshot(workspaceRegistry, importResult.folderId, snapshot);
  }

  watchWorkspaceDirectory(ownerWebContentsId, importResult.folderId, canonicalDirectoryPath);
  return serializeWorkspaceRegistry(workspaceRegistry);
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
  destroyOwnedWorkspaceWatchers(ownerWebContentsId);
  workspaceRegistries.delete(ownerWebContentsId);
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
  const smokeWorkspacePaths = [];

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
    const smokeWorkspacePath = fs.mkdtempSync(path.join(os.tmpdir(), "canvas-learning-smoke-workspace-"));
    smokeWorkspacePaths.push(smokeWorkspacePath);
    const canonicalSmokeWorkspacePath = fs.realpathSync(smokeWorkspacePath);
    fs.mkdirSync(path.join(smokeWorkspacePath, "agent-output", "reports"), { recursive: true });
    fs.writeFileSync(path.join(smokeWorkspacePath, "agent-output", "reports", "notes.md"), "# Smoke Report\n\nfirst pass\n", "utf8");
    fs.writeFileSync(path.join(smokeWorkspacePath, "artifact.bin"), Buffer.from([0xde, 0xad, 0xbe, 0xef]));

    await window.webContents.executeJavaScript(`window.__canvasLearningDebug.openWorkspaceDirectoryForPath(${JSON.stringify(smokeWorkspacePath)})`);
    const workspaceOpenSnapshot = await waitForSnapshot(
      "window.__canvasLearningDebug.getSnapshot()",
      (snapshot) => snapshot.workspaceRootPath === canonicalSmokeWorkspacePath && snapshot.workspaceVisibleEntryPaths.includes("agent-output"),
      4000
    );

    if (workspaceOpenSnapshot.workspaceRootPath !== canonicalSmokeWorkspacePath) {
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

    logStep("import second workspace folder");
    const secondWorkspacePath = fs.mkdtempSync(path.join(os.tmpdir(), "canvas-learning-smoke-workspace-"));
    smokeWorkspacePaths.push(secondWorkspacePath);
    const canonicalSecondWorkspacePath = fs.realpathSync(secondWorkspacePath);
    fs.mkdirSync(path.join(secondWorkspacePath, "secondary"), { recursive: true });
    fs.writeFileSync(path.join(secondWorkspacePath, "secondary", "beta.txt"), "second workspace\n", "utf8");

    await window.webContents.executeJavaScript(`window.__canvasLearningDebug.openWorkspaceDirectoryForPath(${JSON.stringify(secondWorkspacePath)})`);
    const multiWorkspaceSnapshot = await waitForSnapshot(
      "window.__canvasLearningDebug.getSnapshot()",
      (snapshot) => snapshot.workspaceImportedFolderPaths.includes(canonicalSmokeWorkspacePath) && snapshot.workspaceImportedFolderPaths.includes(canonicalSecondWorkspacePath),
      4000
    );

    if (
      multiWorkspaceSnapshot.workspaceImportedFolderPaths.length !== 2
      || multiWorkspaceSnapshot.workspaceRootPath !== canonicalSecondWorkspacePath
      || multiWorkspaceSnapshot.workspaceSelectedFilePath !== null
      || multiWorkspaceSnapshot.fileInspectorVisible !== false
    ) {
      throw new Error(`Smoke test failed: importing a second workspace folder did not produce the expected active-folder state. Snapshot: ${JSON.stringify(multiWorkspaceSnapshot)}`);
    }

    const firstWorkspaceFolderId = multiWorkspaceSnapshot.workspaceImportedFolders.find((folder) => folder.rootPath === canonicalSmokeWorkspacePath)?.id ?? null;
    const secondWorkspaceFolderId = multiWorkspaceSnapshot.workspaceImportedFolders.find((folder) => folder.rootPath === canonicalSecondWorkspacePath)?.id ?? null;

    if (firstWorkspaceFolderId === null || secondWorkspaceFolderId === null) {
      throw new Error(`Smoke test failed: imported workspace folder ids were unavailable. Snapshot: ${JSON.stringify(multiWorkspaceSnapshot)}`);
    }

    logStep("switch active workspace folder");
    await window.webContents.executeJavaScript(`window.__canvasLearningDebug.activateWorkspaceFolder(${JSON.stringify(firstWorkspaceFolderId)})`);
    const switchedWorkspaceSnapshot = await waitForSnapshot(
      "window.__canvasLearningDebug.getSnapshot()",
      (snapshot) => snapshot.workspaceRootPath === canonicalSmokeWorkspacePath && snapshot.workspaceVisibleEntryPaths.includes("agent-output"),
      4000
    );

    if (
      switchedWorkspaceSnapshot.workspaceRootPath !== canonicalSmokeWorkspacePath
      || switchedWorkspaceSnapshot.workspaceVisibleEntryPaths.includes("secondary")
    ) {
      throw new Error(`Smoke test failed: switching the active workspace folder did not swap the visible tree. Snapshot: ${JSON.stringify(switchedWorkspaceSnapshot)}`);
    }

    logStep("new terminal follows active workspace folder");
    const defaultWorkspaceCwd = await window.webContents.executeJavaScript("window.__canvasLearningDebug.getDefaultTerminalWorkingDirectory()");

    if (defaultWorkspaceCwd !== canonicalSmokeWorkspacePath) {
      throw new Error(`Smoke test failed: active workspace folder did not drive the default terminal cwd. Value: ${JSON.stringify(defaultWorkspaceCwd)}`);
    }

    logStep("remove active workspace folder");
    await window.webContents.executeJavaScript(`window.__canvasLearningDebug.removeWorkspaceFolder(${JSON.stringify(firstWorkspaceFolderId)})`);
    const removedWorkspaceSnapshot = await waitForSnapshot(
      "window.__canvasLearningDebug.getSnapshot()",
      (snapshot) => snapshot.workspaceRootPath === canonicalSecondWorkspacePath && snapshot.workspaceImportedFolderPaths.length === 1,
      4000
    );

    if (
      removedWorkspaceSnapshot.workspaceRootPath !== canonicalSecondWorkspacePath
      || removedWorkspaceSnapshot.workspaceImportedFolderPaths.includes(canonicalSmokeWorkspacePath)
    ) {
      throw new Error(`Smoke test failed: removing the active workspace folder did not fall back cleanly. Snapshot: ${JSON.stringify(removedWorkspaceSnapshot)}`);
    }

    logStep("duplicate workspace import re-selects existing folder");
    await window.webContents.executeJavaScript(`window.__canvasLearningDebug.openWorkspaceDirectoryForPath(${JSON.stringify(secondWorkspacePath)})`);
    const deduplicatedWorkspaceSnapshot = await waitForSnapshot(
      "window.__canvasLearningDebug.getSnapshot()",
      (snapshot) => snapshot.workspaceImportedFolderPaths.filter((folderPath) => folderPath === canonicalSecondWorkspacePath).length === 1,
      4000
    );

    if (
      deduplicatedWorkspaceSnapshot.workspaceImportedFolderPaths.length !== 1
      || deduplicatedWorkspaceSnapshot.workspaceActiveFolderId !== secondWorkspaceFolderId
    ) {
      throw new Error(`Smoke test failed: importing a duplicate workspace folder created an unexpected list state. Snapshot: ${JSON.stringify(deduplicatedWorkspaceSnapshot)}`);
    }

    console.log("Smoke test passed.");
    app.quit();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    app.exit(1);
  } finally {
    smokeWorkspacePaths.forEach((workspacePath) => {
      fs.rmSync(workspacePath, { recursive: true, force: true });
    });
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
  contents.on("did-finish-load", () => {
    pushWorkspaceRegistryToOwner(contents.id);
  });

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
    state: snapshot
  };
});

ipcMain.handle("workspace-directory:state", (event) => {
  const workspaceRegistry = getExistingOwnerWorkspaceRegistry(event.sender.id);

  return workspaceRegistry === null
    ? { importedFolders: [], activeFolderId: null }
    : serializeWorkspaceRegistry(workspaceRegistry);
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

ipcMain.handle("workspace-folder:activate", (event, payload) => {
  const workspaceRegistry = getExistingOwnerWorkspaceRegistry(event.sender.id);

  if (workspaceRegistry === null) {
    return {
      importedFolders: [],
      activeFolderId: null
    };
  }

  activateWorkspaceFolder(
    workspaceRegistry,
    typeof payload?.folderId === "string" ? payload.folderId : ""
  );

  return refreshWorkspaceFolderForOwner(
    event.sender.id,
    typeof payload?.folderId === "string" ? payload.folderId : ""
  );
});

ipcMain.handle("workspace-folder:remove", (event, payload) => {
  const workspaceRegistry = getExistingOwnerWorkspaceRegistry(event.sender.id);

  if (workspaceRegistry === null) {
    return {
      importedFolders: [],
      activeFolderId: null
    };
  }

  const folderId = typeof payload?.folderId === "string" ? payload.folderId : "";
  destroyWorkspaceWatcher(event.sender.id, folderId);
  removeWorkspaceFolder(workspaceRegistry, folderId);

  if (workspaceRegistry.importedFolders.size === 0) {
    workspaceRegistries.delete(event.sender.id);
    return {
      importedFolders: [],
      activeFolderId: null
    };
  }

  return workspaceRegistry.activeFolderId === null
    ? serializeWorkspaceRegistry(workspaceRegistry)
    : refreshWorkspaceFolderForOwner(event.sender.id, workspaceRegistry.activeFolderId);
});

ipcMain.handle("workspace-directory:refresh", (event) => {
  const workspaceFolder = getActiveWorkspaceFolderForOwner(event.sender.id);

  if (workspaceFolder === null) {
    return null;
  }

  return refreshWorkspaceFolderForOwner(event.sender.id, workspaceFolder.id);
});

ipcMain.handle("workspace-file:read", (event, payload) => {
  const workspaceRegistry = getExistingOwnerWorkspaceRegistry(event.sender.id);

  if (workspaceRegistry === null) {
    throw new Error("Open a workspace folder before previewing files.");
  }

  const workspaceFolder = getWorkspaceFolder(
    workspaceRegistry,
    typeof payload?.folderId === "string" ? payload.folderId : ""
  );

  if (workspaceFolder === null) {
    throw new Error("Open a workspace folder before previewing files.");
  }

  return readWorkspaceFilePreview(
    workspaceFolder.rootPath,
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
