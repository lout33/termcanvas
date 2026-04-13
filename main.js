const { app, BrowserWindow, dialog, ipcMain, shell, webContents } = require("electron");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const pty = require("node-pty");
const { createDirectorySnapshotAsync } = require("./directory_snapshot");
const { getNodePtyHelperPaths } = require("./node_pty_runtime");
const { readWorkspaceFilePreviewAsync, resolveWorkspaceFilePath } = require("./workspace_file_preview");
const { createWorkspaceService } = require("./main_workspace_service");
const { normalizeAppSessionSnapshot } = require("./session_snapshot");

const terminalSessions = new Map();
const activeTerminalShortcutStates = new Map();
const WORKSPACE_WATCH_DEBOUNCE_MS = 180;
const APP_SESSION_FILE_NAME = "app-session.json";
const TMUX_SESSION_PREFIX = "termcanvas";
let cachedTmuxBinary = undefined;

function resolveShell() {
  return process.env.SHELL || "/bin/zsh";
}

function ensureNodePtyHelperPermissions() {
  const helperPaths = getNodePtyHelperPaths({
    isPackaged: app.isPackaged,
    appDirectory: __dirname,
    resourcesPath: process.resourcesPath
  });

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

function getTerminalEnvironment() {
  const environment = {
    ...process.env,
    TERM: "xterm-256color"
  };

  delete environment.TMUX;
  return environment;
}

function normalizeTerminalSessionKey(value) {
  return typeof value === "string" && /^[A-Za-z0-9_-]+$/u.test(value)
    ? value
    : null;
}

function getTmuxBinary() {
  if (cachedTmuxBinary !== undefined) {
    return cachedTmuxBinary;
  }

  const tmuxCheck = spawnSync("tmux", ["-V"], {
    encoding: "utf8",
    env: getTerminalEnvironment()
  });

  cachedTmuxBinary = tmuxCheck.status === 0 ? "tmux" : null;
  return cachedTmuxBinary;
}

function getTmuxSessionName(sessionKey) {
  return `${TMUX_SESSION_PREFIX}-${sessionKey}`;
}

function runTmuxCommand(args) {
  const tmuxBinary = getTmuxBinary();

  if (tmuxBinary === null) {
    return null;
  }

  return spawnSync(tmuxBinary, args, {
    encoding: "utf8",
    env: getTerminalEnvironment()
  });
}

function isTmuxSessionMissing(result) {
  return typeof result?.stderr === "string" && /can't find session/u.test(result.stderr);
}

function hasTmuxSession(sessionName) {
  const result = runTmuxCommand(["has-session", "-t", sessionName]);
  return result !== null && result.status === 0;
}

function ensureTmuxCommandSucceeded(result, actionLabel) {
  if (result === null || result.status !== 0) {
    const details = typeof result?.stderr === "string" && result.stderr.trim().length > 0
      ? result.stderr.trim()
      : `tmux failed while trying to ${actionLabel}.`;
    throw new Error(details);
  }
}

function configureTmuxSession(sessionName) {
  [["status", "off"], ["destroy-unattached", "off"]].forEach(([optionName, optionValue]) => {
    ensureTmuxCommandSucceeded(
      runTmuxCommand(["set-option", "-t", sessionName, optionName, optionValue]),
      `configure tmux session ${sessionName}`
    );
  });
}

function createTmuxSession(sessionName, cwd) {
  ensureTmuxCommandSucceeded(
    runTmuxCommand(["new-session", "-d", "-s", sessionName, "-c", cwd]),
    `create tmux session ${sessionName}`
  );
  configureTmuxSession(sessionName);
}

function destroyTmuxSession(sessionName) {
  const result = runTmuxCommand(["kill-session", "-t", sessionName]);

  if (result !== null && result.status !== 0 && !isTmuxSessionMissing(result)) {
    throw new Error(result.stderr?.trim() || `Failed to close tmux session ${sessionName}.`);
  }
}

function resolveTmuxSessionWorkingDirectory(sessionName) {
  const result = runTmuxCommand(["display-message", "-p", "-t", sessionName, "#{pane_current_path}"]);

  if (result === null || result.status !== 0) {
    return null;
  }

  return resolveExistingDirectoryPath(result.stdout?.trim() ?? "");
}

function shouldPreserveTerminalSessionsOnWindowClose() {
  return process.env.CANVAS_SMOKE_TEST !== "1";
}

function isAppSessionPersistenceEnabled() {
  return process.env.CANVAS_SMOKE_TEST !== "1";
}

function getAppSessionFilePath() {
  return path.join(app.getPath("userData"), APP_SESSION_FILE_NAME);
}

function loadPersistedAppSession() {
  if (!isAppSessionPersistenceEnabled()) {
    return null;
  }

  try {
    const appSessionFilePath = getAppSessionFilePath();

    if (!fs.existsSync(appSessionFilePath)) {
      return null;
    }

    return normalizeAppSessionSnapshot(JSON.parse(fs.readFileSync(appSessionFilePath, "utf8")));
  } catch {
    return null;
  }
}

function savePersistedAppSession(snapshot) {
  if (!isAppSessionPersistenceEnabled()) {
    return null;
  }

  const normalizedSnapshot = normalizeAppSessionSnapshot(snapshot);
  const appSessionFilePath = getAppSessionFilePath();
  const tempFilePath = `${appSessionFilePath}.tmp`;

  fs.mkdirSync(path.dirname(appSessionFilePath), { recursive: true });
  fs.writeFileSync(tempFilePath, JSON.stringify(normalizedSnapshot, null, 2), "utf8");
  fs.renameSync(tempFilePath, appSessionFilePath);

  return normalizedSnapshot;
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

const workspaceService = createWorkspaceService({
  app,
  shell,
  sendToOwner,
  createDirectorySnapshotAsync,
  readWorkspaceFilePreviewAsync,
  resolveWorkspaceFilePath,
  resolveExistingDirectoryPath,
  workspaceWatchDebounceMs: WORKSPACE_WATCH_DEBOUNCE_MS
});

function resolveDialogDefaultDirectory(ownerWebContentsId) {
  return workspaceService.getActiveFolderRootPath(ownerWebContentsId) ?? app.getPath("documents");
}

function isToggleActiveTerminalMaximizeShortcut(input) {
  return process.platform === "darwin"
    && input?.type === "keyDown"
    && String(input?.key || "").toLowerCase() === "m"
    && input?.meta === true
    && input?.control !== true
    && input?.alt !== true
    && input?.shift !== true;
}

function destroyTerminalSession(terminalId, options = {}) {
  const session = getSession(terminalId);
  const preserveSession = options.preserveSession === true;

  if (session === undefined || session.isDisposing) {
    return;
  }

  session.isDisposing = true;

  if (!preserveSession && session.backend === "tmux" && typeof session.tmuxSessionName === "string") {
    try {
      destroyTmuxSession(session.tmuxSessionName);
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
    }
  }

  session.pty.kill();
  terminalSessions.delete(terminalId);
}

function destroyOwnedTerminalSessions(ownerWebContentsId, options = {}) {
  terminalSessions.forEach((session, terminalId) => {
    if (session.ownerWebContentsId === ownerWebContentsId) {
      destroyTerminalSession(terminalId, options);
    }
  });
}

function destroyOwnedWindowState(ownerWebContentsId) {
  destroyOwnedTerminalSessions(ownerWebContentsId, {
    preserveSession: shouldPreserveTerminalSessionsOnWindowClose()
  });
  workspaceService.destroyOwner(ownerWebContentsId);
  activeTerminalShortcutStates.delete(ownerWebContentsId);
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

function createTmuxClientSession(options) {
  const tmuxBinary = getTmuxBinary();

  if (tmuxBinary === null) {
    return null;
  }

  const tmuxSessionName = getTmuxSessionName(options.sessionKey);
  const sessionAlreadyExists = hasTmuxSession(tmuxSessionName);

  if (!sessionAlreadyExists) {
    createTmuxSession(tmuxSessionName, options.cwd);
  }

  try {
    const terminalPty = pty.spawn(tmuxBinary, ["attach-session", "-t", tmuxSessionName], {
      name: "xterm-256color",
      cols: options.cols,
      rows: options.rows,
      cwd: options.cwd,
      env: getTerminalEnvironment()
    });
    const resolvedCwd = resolveTmuxSessionWorkingDirectory(tmuxSessionName) ?? options.cwd;

    return {
      session: {
        ownerWebContentsId: options.ownerWebContentsId,
        pty: terminalPty,
        shellName: options.shellName,
        cwd: resolvedCwd,
        isDisposing: false,
        backend: "tmux",
        sessionKey: options.sessionKey,
        tmuxSessionName
      },
      cwd: resolvedCwd
    };
  } catch (error) {
    if (!sessionAlreadyExists) {
      try {
        destroyTmuxSession(tmuxSessionName);
      } catch {
        // Best effort cleanup when attach fails after creating the tmux session.
      }
    }

    throw error;
  }
}

function createMainWindow() {
  const window = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: "#0f1218",
    title: "TermCanvas",
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

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//u.test(url)) {
      void shell.openExternal(url);
    }

    return { action: "deny" };
  });

  window.webContents.on("will-navigate", (event, url) => {
    if (/^https?:\/\//u.test(url)) {
      event.preventDefault();
      void shell.openExternal(url);
    }
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

    const getCanvasWorkspaceOwnership = (snapshot, canvasName) => {
      if (!Array.isArray(snapshot?.canvasWorkspaceOwnerships)) {
        return null;
      }

      return snapshot.canvasWorkspaceOwnerships.find((entry) => entry.canvasName === canvasName) ?? null;
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

    const createTerminalResult = await window.webContents.executeJavaScript(`(async () => {
      try {
        const deadline = Date.now() + 5000;

        while (typeof window.__canvasLearningDebug?.createTerminalAt !== "function" && Date.now() < deadline) {
          await new Promise((resolve) => window.setTimeout(resolve, 100));
        }

        if (typeof window.__canvasLearningDebug?.createTerminalAt !== "function") {
          throw new Error(
            "window.__canvasLearningDebug.createTerminalAt is unavailable. noteCanvas="
            + typeof window.noteCanvas
            + ", isSmokeTest="
            + String(window.noteCanvas?.isSmokeTest)
            + ", bootError="
            + String(window.__canvasLearningBootError)
          );
        }

        await window.__canvasLearningDebug.createTerminalAt(840, 360);
        return { ok: true };
      } catch (error) {
        return {
          ok: false,
          message: error instanceof Error ? (error.stack || error.message) : String(error)
        };
      }
    })()`);

    if (createTerminalResult?.ok !== true) {
      throw new Error(`Smoke test failed: renderer could not create the first terminal. Details: ${createTerminalResult?.message ?? "unknown error"}`);
    }

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

    logStep("toggle selected terminal maximize with Command+M");
    window.webContents.sendInputEvent({ type: "keyDown", keyCode: "M", modifiers: ["meta"] });
    window.webContents.sendInputEvent({ type: "keyUp", keyCode: "M", modifiers: ["meta"] });
    const maximizedTerminalSnapshot = await waitForSnapshot(
      "window.__canvasLearningDebug.getCanvasSnapshot()",
      (nextSnapshot) => nextSnapshot.maximizedNodeTitle === nextSnapshot.nodeTitles[0],
      4000
    );

    if (maximizedTerminalSnapshot.maximizedNodeTitle !== maximizedTerminalSnapshot.nodeTitles[0] || window.isMinimized()) {
      throw new Error(`Smoke test failed: Command+M did not maximize the selected terminal. Snapshot: ${JSON.stringify(maximizedTerminalSnapshot)}`);
    }

    logStep("restore selected terminal with Command+M");
    window.webContents.sendInputEvent({ type: "keyDown", keyCode: "M", modifiers: ["meta"] });
    window.webContents.sendInputEvent({ type: "keyUp", keyCode: "M", modifiers: ["meta"] });
    const restoredTerminalSnapshot = await waitForSnapshot(
      "window.__canvasLearningDebug.getCanvasSnapshot()",
      (nextSnapshot) => nextSnapshot.maximizedNodeTitle === null,
      4000
    );

    if (restoredTerminalSnapshot.maximizedNodeTitle !== null || window.isMinimized()) {
      throw new Error(`Smoke test failed: Command+M did not restore the selected terminal. Snapshot: ${JSON.stringify(restoredTerminalSnapshot)}`);
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

    logStep("ignore Command+M when no terminal is selected");
    window.webContents.sendInputEvent({ type: "keyDown", keyCode: "M", modifiers: ["meta"] });
    window.webContents.sendInputEvent({ type: "keyUp", keyCode: "M", modifiers: ["meta"] });
    await delay(150);
    const emptyCanvasShortcutSnapshot = await window.webContents.executeJavaScript("window.__canvasLearningDebug.getCanvasSnapshot()");

    if (
      window.isMinimized()
      || emptyCanvasShortcutSnapshot.activeCanvasName !== "Canvas 2"
      || emptyCanvasShortcutSnapshot.activeNodeCount !== 0
      || emptyCanvasShortcutSnapshot.maximizedNodeTitle !== null
    ) {
      throw new Error(`Smoke test failed: Command+M did not no-op on an empty canvas. Snapshot: ${JSON.stringify(emptyCanvasShortcutSnapshot)}`);
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
      workspaceSidebarSnapshot.workspaceRootPath !== "/tmp/termcanvas-workspace-debug"
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

    logStep("verify top canvas strip owns primary navigator");
    const topCanvasStripSnapshot = await waitForSnapshot(
      "window.__canvasLearningDebug.getSnapshot()",
      (snapshot) => snapshot.topCanvasStripVisible === true && Array.isArray(snapshot.topCanvasStripNames),
      4000
    );

    if (
      topCanvasStripSnapshot.topCanvasStripVisible !== true
      || topCanvasStripSnapshot.leftDrawerOwnsPrimaryCanvasSwitcher !== false
      || topCanvasStripSnapshot.topCanvasStripNames.length !== topCanvasStripSnapshot.canvasNames.length
      || topCanvasStripSnapshot.topCanvasStripNames.join("\n") !== topCanvasStripSnapshot.canvasNames.join("\n")
    ) {
      throw new Error(`Smoke test failed: top canvas strip did not replace the drawer-owned primary navigator. Snapshot: ${JSON.stringify(topCanvasStripSnapshot)}`);
    }

    logStep("keep top canvas strip usable while terminals are maximized");
    await window.webContents.executeJavaScript("window.__canvasLearningDebug.clickCanvasStripItem(0)");
    await window.webContents.executeJavaScript("window.__canvasLearningDebug.renameFirstTerminal('Canvas 1 Maximized Terminal')");
    await window.webContents.executeJavaScript("window.__canvasLearningDebug.toggleMaximizeFirstTerminal()");
    const maximizedCanvasOneSnapshot = await waitForSnapshot(
      "window.__canvasLearningDebug.getSnapshot()",
      (snapshot) => snapshot.activeCanvasName === "Canvas 1"
        && snapshot.maximizedNodeTitle === "Canvas 1 Maximized Terminal"
        && snapshot.topCanvasStripVisible === true,
      4000
    );

    if (
      maximizedCanvasOneSnapshot.maximizedNodeTitle !== "Canvas 1 Maximized Terminal"
      || maximizedCanvasOneSnapshot.topCanvasStripVisible !== true
    ) {
      throw new Error(`Smoke test failed: maximizing the first canvas terminal hid or desynced the top strip. Snapshot: ${JSON.stringify(maximizedCanvasOneSnapshot)}`);
    }

    await window.webContents.executeJavaScript("window.__canvasLearningDebug.clickCanvasStripItem(1)");
    const secondCanvasReadySnapshot = await waitForSnapshot(
      "window.__canvasLearningDebug.getSnapshot()",
      (snapshot) => snapshot.activeCanvasName === "Canvas 2",
      4000
    );

    if (secondCanvasReadySnapshot.activeNodeCount === 0) {
      const createdCanvasTwoTerminalSnapshot = await window.webContents.executeJavaScript("window.__canvasLearningDebug.createTerminalAt(840, 360)");
      const canvasTwoTerminalSnapshot = await waitForSnapshot(
        "window.__canvasLearningDebug.getSnapshot()",
        (snapshot) => snapshot.activeCanvasName === "Canvas 2" && snapshot.activeNodeCount > 0,
        4000
      );

      if (
        createdCanvasTwoTerminalSnapshot?.activeNodeCount <= 0
        || canvasTwoTerminalSnapshot.activeNodeCount <= 0
      ) {
        throw new Error(`Smoke test failed: Canvas 2 did not create a terminal before maximize assertions. Snapshots: ${JSON.stringify({
          createdCanvasTwoTerminalSnapshot,
          canvasTwoTerminalSnapshot
        })}`);
      }
    }

    await window.webContents.executeJavaScript("window.__canvasLearningDebug.renameFirstTerminal('Canvas 2 Maximized Terminal')");
    await window.webContents.executeJavaScript("window.__canvasLearningDebug.toggleMaximizeFirstTerminal()");
    const maximizedCanvasTwoSnapshot = await waitForSnapshot(
      "window.__canvasLearningDebug.getSnapshot()",
      (snapshot) => snapshot.activeCanvasName === "Canvas 2"
        && snapshot.maximizedNodeTitle === "Canvas 2 Maximized Terminal"
        && snapshot.topCanvasStripVisible === true,
      4000
    );

    if (
      maximizedCanvasTwoSnapshot.maximizedNodeTitle !== "Canvas 2 Maximized Terminal"
      || maximizedCanvasTwoSnapshot.topCanvasStripVisible !== true
    ) {
      throw new Error(`Smoke test failed: the second canvas did not preserve its own maximized terminal while keeping the top strip visible. Snapshot: ${JSON.stringify(maximizedCanvasTwoSnapshot)}`);
    }

    await window.webContents.executeJavaScript("window.__canvasLearningDebug.clickCanvasStripItem(0)");
    const restoredCanvasOneSnapshot = await waitForSnapshot(
      "window.__canvasLearningDebug.getSnapshot()",
      (snapshot) => snapshot.activeCanvasName === "Canvas 1" && snapshot.maximizedNodeTitle === "Canvas 1 Maximized Terminal",
      4000
    );

    if (restoredCanvasOneSnapshot.maximizedNodeTitle !== "Canvas 1 Maximized Terminal") {
      throw new Error(`Smoke test failed: returning to Canvas 1 did not restore its maximized terminal. Snapshot: ${JSON.stringify(restoredCanvasOneSnapshot)}`);
    }

    await window.webContents.executeJavaScript("window.__canvasLearningDebug.clickCanvasStripItem(1)");
    const restoredCanvasTwoSnapshot = await waitForSnapshot(
      "window.__canvasLearningDebug.getSnapshot()",
      (snapshot) => snapshot.activeCanvasName === "Canvas 2" && snapshot.maximizedNodeTitle === "Canvas 2 Maximized Terminal",
      4000
    );

    if (restoredCanvasTwoSnapshot.maximizedNodeTitle !== "Canvas 2 Maximized Terminal") {
      throw new Error(`Smoke test failed: returning to Canvas 2 did not restore its maximized terminal. Snapshot: ${JSON.stringify(restoredCanvasTwoSnapshot)}`);
    }

    const topCanvasStripLayoutSnapshot = await window.webContents.executeJavaScript(`(() => {
      const boardElement = document.getElementById("board");
      const stripList = document.getElementById("canvas-strip-list");

      if (!(boardElement instanceof HTMLElement) || !(stripList instanceof HTMLElement)) {
        return null;
      }

      const boardRect = boardElement.getBoundingClientRect();
      const stripRect = stripList.getBoundingClientRect();
      const availableHeightBelowStrip = window.innerHeight - stripRect.bottom;

      return {
        boardTop: boardRect.top,
        boardHeight: boardRect.height,
        stripBottom: stripRect.bottom,
        stripHeight: stripRect.height,
        availableHeightBelowStrip,
        boardHeightRatioBelowStrip: availableHeightBelowStrip > 0 ? (boardRect.height / availableHeightBelowStrip) : 0
      };
    })()`);

    if (
      topCanvasStripLayoutSnapshot === null
      || topCanvasStripLayoutSnapshot.boardTop + 2 < topCanvasStripLayoutSnapshot.stripBottom
      || topCanvasStripLayoutSnapshot.boardHeightRatioBelowStrip < 0.72
    ) {
      throw new Error(`Smoke test failed: the board no longer keeps most of the vertical space beneath the top strip. Snapshot: ${JSON.stringify(topCanvasStripLayoutSnapshot)}`);
    }

    const workspaceOwnerCanvasIndex = workspaceSidebarSnapshot.canvasCount - 1;
    const workspaceOwnerCanvasName = workspaceSidebarSnapshot.activeCanvasName;

    await window.webContents.executeJavaScript(`window.__canvasLearningDebug.switchCanvas(${JSON.stringify(workspaceOwnerCanvasIndex)})`);

    logStep("preview workspace markdown file");
    const smokeWorkspacePath = fs.mkdtempSync(path.join(os.tmpdir(), "termcanvas-smoke-workspace-"));
    smokeWorkspacePaths.push(smokeWorkspacePath);
    const canonicalSmokeWorkspacePath = fs.realpathSync(smokeWorkspacePath);
    fs.mkdirSync(path.join(smokeWorkspacePath, "agent-output", "reports"), { recursive: true });
    fs.writeFileSync(path.join(smokeWorkspacePath, "agent-output", "reports", "notes.md"), "# Smoke Report\n\nfirst pass\n", "utf8");
    fs.writeFileSync(
      path.join(smokeWorkspacePath, "diagram.png"),
      Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7Z0xoAAAAASUVORK5CYII=", "base64")
    );
    fs.writeFileSync(
      path.join(smokeWorkspacePath, "spec.pdf"),
      Buffer.from("%PDF-1.1\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Count 1 /Kids [3 0 R] >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n", "utf8")
    );
    fs.writeFileSync(path.join(smokeWorkspacePath, "artifact.bin"), Buffer.from([0xde, 0xad, 0xbe, 0xef]));

    for (let entryIndex = 0; entryIndex < 48; entryIndex += 1) {
      fs.writeFileSync(
        path.join(smokeWorkspacePath, `log-${String(entryIndex).padStart(2, "0")}.txt`),
        `workspace log ${entryIndex}\n`,
        "utf8"
      );
    }

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

    logStep("preserve workspace browser scroll after file selection");
    const workspaceBrowserScrollBeforePreview = await window.webContents.executeJavaScript(`(() => {
      const list = document.querySelector('.workspace-browser-list');

      if (!(list instanceof HTMLElement)) {
        return null;
      }

      list.scrollTop = 160;

      return {
        scrollTop: list.scrollTop,
        scrollHeight: list.scrollHeight,
        clientHeight: list.clientHeight
      };
    })()`);

    if (
      workspaceBrowserScrollBeforePreview === null
      || workspaceBrowserScrollBeforePreview.scrollHeight <= workspaceBrowserScrollBeforePreview.clientHeight
      || workspaceBrowserScrollBeforePreview.scrollTop < 100
    ) {
      throw new Error(`Smoke test failed: workspace browser did not become scrollable for the scroll-preservation assertion. Snapshot: ${JSON.stringify(workspaceBrowserScrollBeforePreview)}`);
    }

    logStep("preview workspace image file");
    await window.webContents.executeJavaScript(`window.__canvasLearningDebug.selectWorkspaceFile(${JSON.stringify("diagram.png")})`);
    const imagePreviewSnapshot = await waitForSnapshot(
      "window.__canvasLearningDebug.getSnapshot()",
      (snapshot) => snapshot.workspaceSelectedFilePath === "diagram.png" && snapshot.workspacePreviewKind === "image" && snapshot.workspacePreviewMode === "image" && snapshot.workspacePreviewImageLoaded === true,
      4000
    );

    if (
      imagePreviewSnapshot.workspaceSelectedFilePath !== "diagram.png"
      || imagePreviewSnapshot.workspacePreviewKind !== "image"
      || imagePreviewSnapshot.workspacePreviewMode !== "image"
      || imagePreviewSnapshot.workspacePreviewHasImage !== true
      || imagePreviewSnapshot.workspacePreviewImageLoaded !== true
    ) {
      throw new Error(`Smoke test failed: image file did not open as an internal preview. Snapshot: ${JSON.stringify(imagePreviewSnapshot)}`);
    }

    const workspaceBrowserScrollAfterPreview = await window.webContents.executeJavaScript(`(() => {
      const list = document.querySelector('.workspace-browser-list');

      if (!(list instanceof HTMLElement)) {
        return null;
      }

      return list.scrollTop;
    })()`);

    if (typeof workspaceBrowserScrollAfterPreview !== "number" || workspaceBrowserScrollAfterPreview < 100) {
      throw new Error(`Smoke test failed: workspace browser scroll reset after selecting a file. Value: ${JSON.stringify(workspaceBrowserScrollAfterPreview)}`);
    }

    logStep("preview workspace pdf file");
    await window.webContents.executeJavaScript(`window.__canvasLearningDebug.selectWorkspaceFile(${JSON.stringify("spec.pdf")})`);
    const pdfPreviewSnapshot = await waitForSnapshot(
      "window.__canvasLearningDebug.getSnapshot()",
      (snapshot) => snapshot.workspaceSelectedFilePath === "spec.pdf" && snapshot.workspacePreviewKind === "pdf" && snapshot.workspacePreviewMode === "pdf" && snapshot.workspacePreviewPdfBlobUrl !== "" && snapshot.workspacePreviewPdfLoaded === true,
      4000
    );

    if (
      pdfPreviewSnapshot.workspaceSelectedFilePath !== "spec.pdf"
      || pdfPreviewSnapshot.workspacePreviewKind !== "pdf"
      || pdfPreviewSnapshot.workspacePreviewMode !== "pdf"
      || pdfPreviewSnapshot.workspacePreviewHasPdfFrame !== true
      || pdfPreviewSnapshot.workspacePreviewPdfBlobUrl === ""
      || pdfPreviewSnapshot.workspacePreviewPdfLoaded !== true
    ) {
      throw new Error(`Smoke test failed: PDF file did not open as an internal preview. Snapshot: ${JSON.stringify(pdfPreviewSnapshot)}`);
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
      || markdownPreviewSnapshot.sidebarCollapsed !== false
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

    logStep("close workspace preview with Command+L");
    await window.webContents.executeJavaScript(`window.dispatchEvent(new KeyboardEvent("keydown", { key: "l", metaKey: true, bubbles: true, cancelable: true }))`);
    const closedPreviewSnapshot = await waitForSnapshot(
      "window.__canvasLearningDebug.getSnapshot()",
      (snapshot) => snapshot.fileInspectorVisible === false && snapshot.workspaceSelectedFilePath === null,
      4000
    );

    if (
      closedPreviewSnapshot.fileInspectorVisible !== false
      || closedPreviewSnapshot.workspaceSelectedFilePath !== null
      || closedPreviewSnapshot.sidebarCollapsed !== false
    ) {
      throw new Error(`Smoke test failed: Command+L did not close the file inspector without collapsing the workspace drawer. Snapshot: ${JSON.stringify(closedPreviewSnapshot)}`);
    }

    logStep("preview unsupported workspace file");
    await window.webContents.executeJavaScript(`window.__canvasLearningDebug.selectWorkspaceFile(${JSON.stringify("artifact.bin")})`);
    const unsupportedPreviewSnapshot = await waitForSnapshot(
      "window.__canvasLearningDebug.getSnapshot()",
      (snapshot) => snapshot.workspacePreviewKind === "binary" && snapshot.workspacePreviewMode === "fallback",
      4000
    );

    if (
      unsupportedPreviewSnapshot.workspacePreviewKind !== "binary"
      || unsupportedPreviewSnapshot.workspacePreviewMode !== "fallback"
      || unsupportedPreviewSnapshot.workspacePreviewCanOpenExternally !== true
      || unsupportedPreviewSnapshot.workspacePreviewCanRevealInFinder !== true
    ) {
      throw new Error(`Smoke test failed: binary workspace file did not produce fallback actions. Snapshot: ${JSON.stringify(unsupportedPreviewSnapshot)}`);
    }

    logStep("restore markdown preview before canvas ownership checks");
    await window.webContents.executeJavaScript(`window.__canvasLearningDebug.selectWorkspaceFile(${JSON.stringify("agent-output/reports/notes.md")})`);
    const restoredMarkdownPreviewSnapshot = await waitForSnapshot(
      "window.__canvasLearningDebug.getSnapshot()",
      (snapshot) => snapshot.workspaceSelectedFilePath === "agent-output/reports/notes.md" && snapshot.workspacePreviewContents.includes("second pass"),
      4000
    );

    if (
      restoredMarkdownPreviewSnapshot.workspaceSelectedFilePath !== "agent-output/reports/notes.md"
      || !restoredMarkdownPreviewSnapshot.workspacePreviewContents.includes("second pass")
    ) {
      throw new Error(`Smoke test failed: markdown preview was not restored before canvas ownership checks. Snapshot: ${JSON.stringify(restoredMarkdownPreviewSnapshot)}`);
    }

    logStep("fresh new canvas starts with null workspace");
    const freshCanvasSnapshot = await window.webContents.executeJavaScript("window.__canvasLearningDebug.createCanvas()");
    const freshCanvasName = freshCanvasSnapshot.activeCanvasName;
    const freshCanvasOwnership = getCanvasWorkspaceOwnership(freshCanvasSnapshot, freshCanvasName);

    if (
      freshCanvasSnapshot.workspaceRootPath !== null
      || freshCanvasSnapshot.workspaceSelectedFilePath !== null
      || freshCanvasSnapshot.fileInspectorVisible !== false
      || freshCanvasOwnership?.workspaceRootPath !== null
      || freshCanvasOwnership?.workspacePreviewRelativePath !== null
    ) {
      throw new Error(`Smoke test failed: fresh canvas inherited workspace state instead of starting empty. Snapshot: ${JSON.stringify(freshCanvasSnapshot)}`);
    }

    const freshCanvasDefaultCwd = await window.webContents.executeJavaScript("window.__canvasLearningDebug.getDefaultTerminalWorkingDirectory()");

    if (freshCanvasDefaultCwd !== null) {
      throw new Error(`Smoke test failed: fresh canvas default cwd should be null. Value: ${JSON.stringify(freshCanvasDefaultCwd)}`);
    }

    logStep("bind second canvas to a different workspace");
    const secondWorkspacePath = fs.mkdtempSync(path.join(os.tmpdir(), "termcanvas-smoke-workspace-"));
    smokeWorkspacePaths.push(secondWorkspacePath);
    const canonicalSecondWorkspacePath = fs.realpathSync(secondWorkspacePath);
    fs.mkdirSync(path.join(secondWorkspacePath, "secondary"), { recursive: true });
    fs.writeFileSync(path.join(secondWorkspacePath, "secondary", "beta.txt"), "second workspace\n", "utf8");

    await window.webContents.executeJavaScript(`window.__canvasLearningDebug.openWorkspaceDirectoryForPath(${JSON.stringify(secondWorkspacePath)})`);
    const secondCanvasWorkspaceSnapshot = await waitForSnapshot(
      "window.__canvasLearningDebug.getSnapshot()",
      (snapshot) => snapshot.workspaceRootPath === canonicalSecondWorkspacePath,
      4000
    );
    const firstCanvasOwnershipOnSecondCanvas = getCanvasWorkspaceOwnership(secondCanvasWorkspaceSnapshot, workspaceOwnerCanvasName);
    const secondCanvasOwnership = getCanvasWorkspaceOwnership(secondCanvasWorkspaceSnapshot, freshCanvasName);

    if (
      secondCanvasWorkspaceSnapshot.workspaceRootPath !== canonicalSecondWorkspacePath
      || secondCanvasWorkspaceSnapshot.workspaceSelectedFilePath !== null
      || secondCanvasWorkspaceSnapshot.fileInspectorVisible !== false
      || firstCanvasOwnershipOnSecondCanvas?.workspaceRootPath !== canonicalSmokeWorkspacePath
      || firstCanvasOwnershipOnSecondCanvas?.workspacePreviewRelativePath !== "agent-output/reports/notes.md"
      || secondCanvasOwnership?.workspaceRootPath !== canonicalSecondWorkspacePath
      || secondCanvasOwnership?.workspacePreviewRelativePath !== null
    ) {
      throw new Error(`Smoke test failed: binding a second canvas to its own workspace did not preserve per-canvas ownership. Snapshot: ${JSON.stringify(secondCanvasWorkspaceSnapshot)}`);
    }

    const secondCanvasDefaultCwd = await window.webContents.executeJavaScript("window.__canvasLearningDebug.getDefaultTerminalWorkingDirectory()");

    if (secondCanvasDefaultCwd !== canonicalSecondWorkspacePath) {
      throw new Error(`Smoke test failed: second canvas workspace did not drive the default terminal cwd. Value: ${JSON.stringify(secondCanvasDefaultCwd)}`);
    }

    logStep("switch canvases restores the original preview and workspace");
    await window.webContents.executeJavaScript(`window.__canvasLearningDebug.switchCanvas(${JSON.stringify(workspaceOwnerCanvasIndex)})`);
    const restoredOwnerCanvasSnapshot = await waitForSnapshot(
      "window.__canvasLearningDebug.getSnapshot()",
      (snapshot) => snapshot.workspaceRootPath === canonicalSmokeWorkspacePath && snapshot.workspaceSelectedFilePath === "agent-output/reports/notes.md" && snapshot.workspacePreviewContents.includes("second pass"),
      4000
    );
    const restoredOwnerCanvasOwnership = getCanvasWorkspaceOwnership(restoredOwnerCanvasSnapshot, workspaceOwnerCanvasName);

    if (
      restoredOwnerCanvasSnapshot.workspaceRootPath !== canonicalSmokeWorkspacePath
      || restoredOwnerCanvasSnapshot.workspaceSelectedFilePath !== "agent-output/reports/notes.md"
      || !restoredOwnerCanvasSnapshot.workspacePreviewContents.includes("second pass")
      || restoredOwnerCanvasOwnership?.workspaceRootPath !== canonicalSmokeWorkspacePath
      || restoredOwnerCanvasOwnership?.workspacePreviewRelativePath !== "agent-output/reports/notes.md"
    ) {
      throw new Error(`Smoke test failed: returning to the original canvas did not restore its workspace preview. Snapshot: ${JSON.stringify(restoredOwnerCanvasSnapshot)}`);
    }

    const firstCanvasDefaultCwd = await window.webContents.executeJavaScript("window.__canvasLearningDebug.getDefaultTerminalWorkingDirectory()");

    if (firstCanvasDefaultCwd !== canonicalSmokeWorkspacePath) {
      throw new Error(`Smoke test failed: original canvas workspace did not drive the default terminal cwd. Value: ${JSON.stringify(firstCanvasDefaultCwd)}`);
    }

    logStep("switching canvases clears preview on the other workspace");
    const freshCanvasIndex = restoredOwnerCanvasSnapshot.canvasNames.indexOf(freshCanvasName);

    if (freshCanvasIndex < 0) {
      throw new Error(`Smoke test failed: second canvas index was unavailable during restore checks. Snapshot: ${JSON.stringify(restoredOwnerCanvasSnapshot)}`);
    }

    await window.webContents.executeJavaScript(`window.__canvasLearningDebug.switchCanvas(${JSON.stringify(freshCanvasIndex)})`);
    const switchedSecondCanvasSnapshot = await waitForSnapshot(
      "window.__canvasLearningDebug.getSnapshot()",
      (snapshot) => snapshot.workspaceRootPath === canonicalSecondWorkspacePath && snapshot.workspaceSelectedFilePath === null && snapshot.fileInspectorVisible === false,
      4000
    );
    const switchedSecondCanvasOwnership = getCanvasWorkspaceOwnership(switchedSecondCanvasSnapshot, freshCanvasName);

    if (
      switchedSecondCanvasSnapshot.workspaceRootPath !== canonicalSecondWorkspacePath
      || switchedSecondCanvasSnapshot.workspaceSelectedFilePath !== null
      || switchedSecondCanvasSnapshot.fileInspectorVisible !== false
      || switchedSecondCanvasOwnership?.workspaceRootPath !== canonicalSecondWorkspacePath
    ) {
      throw new Error(`Smoke test failed: switching to the second canvas did not clear the first canvas preview. Snapshot: ${JSON.stringify(switchedSecondCanvasSnapshot)}`);
    }

    logStep("imported canvas starts with null workspace");
    await window.webContents.executeJavaScript(`window.__canvasLearningDebug.switchCanvas(${JSON.stringify(workspaceOwnerCanvasIndex)})`);
    await window.webContents.executeJavaScript("window.__canvasLearningDebug.exportActiveCanvasData()");
    const importedWorkspaceCanvasResult = await window.webContents.executeJavaScript("window.__canvasLearningDebug.importLastExportedCanvasData()");
    const importedCanvasName = importedWorkspaceCanvasResult.snapshot.activeCanvasName;
    const importedCanvasOwnership = getCanvasWorkspaceOwnership(importedWorkspaceCanvasResult.snapshot, importedCanvasName);

    if (
      importedWorkspaceCanvasResult.snapshot.workspaceRootPath !== null
      || importedWorkspaceCanvasResult.snapshot.workspaceSelectedFilePath !== null
      || importedWorkspaceCanvasResult.snapshot.fileInspectorVisible !== false
      || importedCanvasOwnership?.workspaceRootPath !== null
      || importedCanvasOwnership?.workspacePreviewRelativePath !== null
    ) {
      throw new Error(`Smoke test failed: imported canvas auto-bound a workspace instead of starting empty. Snapshot: ${JSON.stringify(importedWorkspaceCanvasResult.snapshot)}`);
    }

    const importedCanvasDefaultCwd = await window.webContents.executeJavaScript("window.__canvasLearningDebug.getDefaultTerminalWorkingDirectory()");

    if (importedCanvasDefaultCwd !== null) {
      throw new Error(`Smoke test failed: imported canvas default cwd should be null. Value: ${JSON.stringify(importedCanvasDefaultCwd)}`);
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
  contents.on("before-input-event", (event, input) => {
    if (!isToggleActiveTerminalMaximizeShortcut(input)) {
      return;
    }

    event.preventDefault();

    if (activeTerminalShortcutStates.get(contents.id) === true) {
      sendToOwner(contents.id, "terminal:toggle-maximize-active", null);
    }
  });

  contents.on("did-finish-load", () => {
    workspaceService.pushState(contents.id);
  });

  contents.on("destroyed", () => {
    destroyOwnedWindowState(contents.id);
  });
});

ipcMain.handle("app-session:load", () => {
  return loadPersistedAppSession();
});

ipcMain.on("app-session:save", (_event, payload) => {
  try {
    savePersistedAppSession(payload);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
  }
});

ipcMain.handle("app-session:save-file", async (event, payload) => {
  const ownerWindow = BrowserWindow.fromWebContents(event.sender);

  if (ownerWindow === null) {
    throw new Error("Unable to resolve owner window.");
  }

  const suggestedName = typeof payload?.suggestedName === "string" && payload.suggestedName.trim().length > 0
    ? payload.suggestedName.trim()
    : "termcanvas-app-data";
  const contents = typeof payload?.contents === "string" ? payload.contents : "";

  if (contents.length === 0) {
    throw new Error("App data export contents are required.");
  }

  const { canceled, filePath } = await dialog.showSaveDialog(ownerWindow, {
    title: "Export app data JSON",
    defaultPath: path.join(resolveDialogDefaultDirectory(event.sender.id), `${suggestedName}.json`),
    filters: [{ name: "TermCanvas App Data", extensions: ["json"] }]
  });

  if (canceled || typeof filePath !== "string") {
    return { canceled: true };
  }

  fs.writeFileSync(filePath, contents, "utf8");
  return { canceled: false, filePath };
});

ipcMain.handle("app-session:open-file", async (event) => {
  const ownerWindow = BrowserWindow.fromWebContents(event.sender);

  if (ownerWindow === null) {
    throw new Error("Unable to resolve owner window.");
  }

  const { canceled, filePaths } = await dialog.showOpenDialog(ownerWindow, {
    title: "Import app data JSON",
    defaultPath: resolveDialogDefaultDirectory(event.sender.id),
    properties: ["openFile"],
    filters: [{ name: "TermCanvas App Data", extensions: ["json"] }]
  });

  const filePath = filePaths[0];

  if (canceled || typeof filePath !== "string") {
    return { canceled: true };
  }

  return {
    canceled: false,
    filePath,
    snapshot: normalizeAppSessionSnapshot(JSON.parse(fs.readFileSync(filePath, "utf8")))
  };
});

ipcMain.on("terminal:active-state", (event, payload) => {
  activeTerminalShortcutStates.set(event.sender.id, payload?.hasActiveTerminal === true);
});

ipcMain.handle("workspace-session:restore", async (event, payload) => {
  return workspaceService.restoreSession(event.sender.id, payload);
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

  const snapshot = await workspaceService.openDirectory(event.sender.id, selectedPath);

  return {
    canceled: false,
    state: snapshot
  };
});

ipcMain.handle("workspace-directory:choose-canvas", async (event) => {
  const ownerWindow = BrowserWindow.fromWebContents(event.sender);

  if (ownerWindow === null) {
    throw new Error("Unable to resolve owner window.");
  }

  const { canceled, filePaths } = await dialog.showOpenDialog(ownerWindow, {
    title: "Choose workspace for canvas",
    defaultPath: resolveDialogDefaultDirectory(event.sender.id),
    properties: ["openDirectory"]
  });

  const selectedPath = filePaths[0];

  if (canceled || typeof selectedPath !== "string") {
    return { canceled: true };
  }

  return {
    canceled: false,
    state: await workspaceService.chooseCanvasWorkspace(event.sender.id, selectedPath)
  };
});

ipcMain.handle("workspace-directory:state", (event) => {
  return workspaceService.getState(event.sender.id);
});

ipcMain.handle("workspace-directory:debug-open", async (event, payload) => {
  if (process.env.CANVAS_SMOKE_TEST !== "1") {
    throw new Error("Workspace debug open is only available during smoke tests.");
  }

  return workspaceService.chooseCanvasWorkspace(
    event.sender.id,
    typeof payload?.directoryPath === "string" ? payload.directoryPath : ""
  );
});

ipcMain.handle("workspace-folder:activate", async (event, payload) => {
  return workspaceService.activateFolder(
    event.sender.id,
    typeof payload?.folderId === "string" ? payload.folderId : ""
  );
});

ipcMain.handle("workspace-folder:remove", async (event, payload) => {
  const folderId = typeof payload?.folderId === "string" ? payload.folderId : "";
  return workspaceService.removeFolder(event.sender.id, folderId);
});

ipcMain.handle("workspace-folder:reorder", (event, payload) => {
  return workspaceService.reorderFolder(
    event.sender.id,
    typeof payload?.folderId === "string" ? payload.folderId : "",
    Number.isFinite(payload?.targetIndex) ? payload.targetIndex : 0
  );
});

ipcMain.handle("workspace-directory:refresh", async (event) => {
  return workspaceService.refreshActiveFolder(event.sender.id);
});

ipcMain.handle("workspace-file:read", async (event, payload) => {
  return workspaceService.readFile(
    event.sender.id,
    typeof payload?.folderId === "string" ? payload.folderId : "",
    typeof payload?.relativePath === "string" ? payload.relativePath : ""
  );
});

ipcMain.handle("workspace-file:write", async (event, payload) => {
  return workspaceService.writeFile(
    event.sender.id,
    typeof payload?.folderId === "string" ? payload.folderId : "",
    typeof payload?.relativePath === "string" ? payload.relativePath : "",
    typeof payload?.textContents === "string" ? payload.textContents : "",
    payload?.expectedLastModifiedMs
  );
});

ipcMain.handle("workspace-file:open-external", async (event, payload) => {
  return workspaceService.openFileExternally(
    event.sender.id,
    typeof payload?.folderId === "string" ? payload.folderId : "",
    typeof payload?.relativePath === "string" ? payload.relativePath : ""
  );
});

ipcMain.handle("workspace-file:reveal", (event, payload) => {
  return workspaceService.revealFile(
    event.sender.id,
    typeof payload?.folderId === "string" ? payload.folderId : "",
    typeof payload?.relativePath === "string" ? payload.relativePath : ""
  );
});

ipcMain.handle("workspace-entry:reveal", (event, payload) => {
  return workspaceService.revealEntry(
    event.sender.id,
    typeof payload?.folderId === "string" ? payload.folderId : "",
    typeof payload?.relativePath === "string" ? payload.relativePath : ""
  );
});

ipcMain.handle("workspace-entry:create-file", async (event, payload) => {
  return workspaceService.createFileWithRefresh(
    event.sender.id,
    typeof payload?.folderId === "string" ? payload.folderId : "",
    typeof payload?.parentRelativePath === "string" ? payload.parentRelativePath : "",
    payload?.name
  );
});

ipcMain.handle("workspace-entry:create-directory", async (event, payload) => {
  return workspaceService.createDirectoryWithRefresh(
    event.sender.id,
    typeof payload?.folderId === "string" ? payload.folderId : "",
    typeof payload?.parentRelativePath === "string" ? payload.parentRelativePath : "",
    payload?.name
  );
});

ipcMain.handle("workspace-entry:rename", async (event, payload) => {
  return workspaceService.renameEntryWithRefresh(
    event.sender.id,
    typeof payload?.folderId === "string" ? payload.folderId : "",
    typeof payload?.relativePath === "string" ? payload.relativePath : "",
    payload?.nextName
  );
});

ipcMain.handle("workspace-entry:delete", async (event, payload) => {
  return workspaceService.deleteEntry(
    event.sender.id,
    typeof payload?.folderId === "string" ? payload.folderId : "",
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
  const sessionKey = normalizeTerminalSessionKey(payload?.sessionKey) ?? terminalId;
  const shouldEnforceRequestedCwd = typeof cwd === "string" && cwd.trim().length > 0;

  const tmuxSession = createTmuxClientSession({
    ownerWebContentsId: event.sender.id,
    cols: safeCols,
    rows: safeRows,
    cwd: terminalCwd,
    shellName,
    sessionKey
  });
  const terminalPty = tmuxSession?.session?.pty ?? pty.spawn(shell, [], {
    name: "xterm-256color",
    cols: safeCols,
    rows: safeRows,
    cwd: terminalCwd,
    env: getTerminalEnvironment()
  });

  const session = tmuxSession?.session ?? {
    ownerWebContentsId: event.sender.id,
    pty: terminalPty,
    shellName,
    cwd: terminalCwd,
    isDisposing: false,
    backend: "pty",
    sessionKey,
    tmuxSessionName: null
  };

  terminalSessions.set(terminalId, session);

  if (shouldEnforceRequestedCwd && session.backend !== "tmux") {
    terminalPty.write(`cd -- '${escapeShellPathForSingleQuotes(terminalCwd)}'\r`);
  }

  terminalPty.onData((data) => {
    sendToOwner(session.ownerWebContentsId, "terminal:data", {
      terminalId,
      data
    });
  });

  terminalPty.onExit(({ exitCode, signal }) => {
    if (!session.isDisposing) {
      sendToOwner(session.ownerWebContentsId, "terminal:exit", {
        terminalId,
        exitCode,
        signal
      });
    }

    terminalSessions.delete(terminalId);
  });

  return {
    terminalId,
    shellName,
    cwd: session.cwd,
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
  const session = getSession(payload.terminalId);

  if (session === undefined) {
    return;
  }

  if (session.ownerWebContentsId !== event.sender.id) {
    throw new Error("Terminal session is not owned by this window.");
  }

  const data = typeof payload.data === "string" ? payload.data : "";

  if (data.length > 0) {
    const trackedCwd = resolveTrackedWorkingDirectoryFromInput(session.cwd, data);

    if (trackedCwd !== null) {
      session.cwd = trackedCwd;
      sendToOwner(session.ownerWebContentsId, "terminal:cwd-changed", {
        terminalId: payload.terminalId,
        cwd: trackedCwd
      });
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

  destroyTerminalSession(payload.terminalId, {
    preserveSession: payload?.preserveSession === true
  });
});

ipcMain.handle("canvas:save-file", async (event, payload) => {
  const ownerWindow = BrowserWindow.fromWebContents(event.sender);

  if (ownerWindow === null) {
    throw new Error("Unable to resolve owner window.");
  }

  const suggestedName = typeof payload?.suggestedName === "string" && payload.suggestedName.trim().length > 0
    ? payload.suggestedName.trim()
    : "termcanvas-canvas";
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
