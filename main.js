const { app, BrowserWindow, dialog, ipcMain, shell, webContents, Menu, Notification } = require("electron");
const { spawn } = require("node:child_process");
const { randomUUID } = require("node:crypto");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const pty = require("node-pty");
const { createDirectorySnapshotAsync } = require("./directory_snapshot");
const { getNodePtyHelperPaths } = require("./node_pty_runtime");
const { readWorkspaceFilePreviewAsync, resolveWorkspaceFilePath } = require("./workspace_file_preview");
const { createWorkspaceService } = require("./main_workspace_service");
const { buildPackagedRuntimePath, createAgentmuxService, isAgentmuxUnavailableError } = require("./main_agentmux_service");
const { createAgentGraphWatcher } = require("./main_agent_graph_watcher");
const { createTerminalSessionRegistry } = require("./main_terminal_registry");
const { createTmuxBackend } = require("./main_tmux_backend");
const { normalizeAppSessionSnapshot } = require("./session_snapshot");

const terminalSessionRegistry = createTerminalSessionRegistry();
const activeTerminalShortcutStates = new Map();
const WORKSPACE_WATCH_DEBOUNCE_MS = 180;
const APP_SESSION_FILE_NAME = "app-session.json";
const AGENTMUX_SKILL_NAME = "agentmux";
const AGENTMUX_SKILL_FILE_NAME = "SKILL.md";
const TMUX_SESSION_PREFIX = "termcanvas";
const TERMINAL_COLOR_ENV = Object.freeze({
  TERM: "xterm-256color",
  COLORTERM: "truecolor",
  TERM_PROGRAM: "TermCanvas",
  CLICOLOR: "1",
  CLICOLOR_FORCE: "1",
  FORCE_COLOR: "3"
});
const TERMINAL_UTF8_LOCALE = "en_US.UTF-8";
const TMUX_COLOR_ENV = Object.freeze({
  COLORTERM: TERMINAL_COLOR_ENV.COLORTERM,
  TERM_PROGRAM: TERMINAL_COLOR_ENV.TERM_PROGRAM,
  CLICOLOR: TERMINAL_COLOR_ENV.CLICOLOR,
  CLICOLOR_FORCE: TERMINAL_COLOR_ENV.CLICOLOR_FORCE,
  FORCE_COLOR: TERMINAL_COLOR_ENV.FORCE_COLOR
});

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

      if ((currentMode & 0o111) === 0) {
        fs.chmodSync(helperPath, currentMode | 0o111);
      }
    }
  });
}

function resolveInitialWorkingDirectory() {
  return os.homedir();
}

function resolveAgentmuxSkillSourcePath() {
  const candidatePaths = [
    app.isPackaged === true
      ? path.join(process.resourcesPath, "agentmux", "skills", AGENTMUX_SKILL_NAME, AGENTMUX_SKILL_FILE_NAME)
      : null,
    path.join(__dirname, "vendor", "agentmux", "skills", AGENTMUX_SKILL_NAME, AGENTMUX_SKILL_FILE_NAME),
    path.join(__dirname, "skills", AGENTMUX_SKILL_NAME, AGENTMUX_SKILL_FILE_NAME)
  ].filter((candidatePath) => typeof candidatePath === "string");

  return candidatePaths.find((candidatePath) => fs.existsSync(candidatePath)) ?? null;
}

function resolveAgentSkillRootPath() {
  const requestedRootPath = typeof process.env.TERMCANVAS_AGENT_SKILL_ROOT === "string" && process.env.TERMCANVAS_AGENT_SKILL_ROOT.trim().length > 0
    ? process.env.TERMCANVAS_AGENT_SKILL_ROOT.trim()
    : path.join(os.homedir(), ".agents", "skills");

  return path.resolve(requestedRootPath);
}

function resolveAgentmuxSkillTargetPath() {
  return path.join(resolveAgentSkillRootPath(), AGENTMUX_SKILL_NAME, AGENTMUX_SKILL_FILE_NAME);
}

function readUtf8FileIfPresent(filePath) {
  try {
    return fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : null;
  } catch {
    return null;
  }
}

function getAgentmuxSkillStatus() {
  const sourcePath = resolveAgentmuxSkillSourcePath();
  const targetPath = resolveAgentmuxSkillTargetPath();
  const sourceContents = sourcePath === null ? null : readUtf8FileIfPresent(sourcePath);
  const targetContents = readUtf8FileIfPresent(targetPath);

  return {
    name: AGENTMUX_SKILL_NAME,
    available: sourcePath !== null && sourceContents !== null,
    installed: targetContents !== null,
    current: sourceContents !== null && targetContents !== null && sourceContents === targetContents,
    sourcePath,
    targetPath,
    targetDirectory: path.dirname(targetPath)
  };
}

function installAgentmuxSkill() {
  const status = getAgentmuxSkillStatus();

  if (status.available !== true || typeof status.sourcePath !== "string") {
    throw new Error("Bundled agentmux skill is not available in this TermCanvas build.");
  }

  const sourceContents = fs.readFileSync(status.sourcePath, "utf8");
  const targetDirectory = path.dirname(status.targetPath);
  const temporaryPath = path.join(targetDirectory, `${AGENTMUX_SKILL_FILE_NAME}.tmp.${process.pid}.${Date.now()}`);

  fs.mkdirSync(targetDirectory, { recursive: true });
  fs.writeFileSync(temporaryPath, sourceContents, "utf8");
  fs.renameSync(temporaryPath, status.targetPath);

  return {
    ...getAgentmuxSkillStatus(),
    installedNow: true
  };
}

function requestAgentSkillInstallFromFocusedWindow() {
  const focusedWindow = typeof BrowserWindow.getFocusedWindow === "function"
    ? BrowserWindow.getFocusedWindow()
    : null;
  const targetWindow = focusedWindow ?? BrowserWindow.getAllWindows()[0] ?? null;

  if (targetWindow?.webContents != null && typeof targetWindow.webContents.send === "function") {
    targetWindow.webContents.send("agent-skill:install-requested", getAgentmuxSkillStatus());
  }
}

function createApplicationMenu() {
  if (
    Menu == null
    || typeof Menu.buildFromTemplate !== "function"
    || typeof Menu.setApplicationMenu !== "function"
  ) {
    return;
  }

  const installAgentSkillItem = {
    label: "Install / Update Agent Skill",
    click: () => {
      requestAgentSkillInstallFromFocusedWindow();
    }
  };
  const openFullDiskAccessSettingsItem = {
    label: "Open Full Disk Access Settings...",
    click: () => {
      void shell.openExternal("x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles");
    }
  };
  const viewMenu = {
    label: "View",
    submenu: [
      { role: "resetZoom" },
      { role: "zoomIn" },
      { role: "zoomOut" },
      { type: "separator" },
      { role: "togglefullscreen" },
      { type: "separator" },
      { role: "reload" },
      { role: "toggleDevTools" }
    ]
  };
  const template = process.platform === "darwin"
    ? [
        {
          label: "TermCanvas",
          submenu: [
            { role: "about" },
            { type: "separator" },
            installAgentSkillItem,
            openFullDiskAccessSettingsItem,
            { type: "separator" },
            { role: "hide" },
            { role: "hideOthers" },
            { role: "unhide" },
            { type: "separator" },
            { role: "quit" }
          ]
        },
        {
          label: "Edit",
          submenu: [
            { role: "undo" },
            { role: "redo" },
            { type: "separator" },
            { role: "cut" },
            { role: "copy" },
            { role: "paste" },
            { role: "selectAll" }
          ]
        },
        viewMenu
      ]
    : [
        {
          label: "File",
          submenu: [
            installAgentSkillItem,
            { type: "separator" },
            { role: "quit" }
          ]
        },
        {
          label: "Edit",
          submenu: [
            { role: "undo" },
            { role: "redo" },
            { type: "separator" },
            { role: "cut" },
            { role: "copy" },
            { role: "paste" },
            { role: "selectAll" }
          ]
        },
        viewMenu
      ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
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

function resolveUtf8Locale(value) {
  return typeof value === "string" && /UTF-?8/iu.test(value)
    ? value
    : TERMINAL_UTF8_LOCALE;
}

function getTerminalLocaleEnvironment() {
  const localeEnvironment = {
    LANG: resolveUtf8Locale(process.env.LANG),
    LC_CTYPE: resolveUtf8Locale(process.env.LC_CTYPE || process.env.LANG)
  };

  if (typeof process.env.LC_ALL === "string" && process.env.LC_ALL.length > 0) {
    localeEnvironment.LC_ALL = resolveUtf8Locale(process.env.LC_ALL);
  }

  return localeEnvironment;
}

function getTerminalEnvironment() {
  const runtimePath = app.isPackaged === true
    ? buildPackagedRuntimePath(process.env.PATH)
    : process.env.PATH;
  const environment = {
    ...process.env,
    ...getTerminalLocaleEnvironment(),
    ...TERMINAL_COLOR_ENV,
    ...(typeof runtimePath === "string" && runtimePath.length > 0 ? { PATH: runtimePath } : {})
  };

  delete environment.TMUX;
  delete environment.NO_COLOR;
  return environment;
}

const tmuxBackend = createTmuxBackend({
  spawnProcess: spawn,
  pty,
  getEnvironment: getTerminalEnvironment,
  getConfigurationEnvironment: () => ({
    ...getTerminalLocaleEnvironment(),
    ...TMUX_COLOR_ENV
  }),
  resolveExistingDirectory: resolveExistingDirectoryPath,
  sessionPrefix: TMUX_SESSION_PREFIX
});

function normalizeTerminalSessionKey(value) {
  return typeof value === "string" && /^[A-Za-z0-9_-]+$/u.test(value)
    ? value
    : null;
}

function getTmuxSessionName(sessionKey) {
  return `${TMUX_SESSION_PREFIX}-${sessionKey}`;
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
  const tempFilePath = `${appSessionFilePath}.tmp.${process.pid}.${Date.now()}`;

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
  return terminalSessionRegistry.getAttachment(terminalId);
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

function isRecoverablePtyIoError(error) {
  if (!(error instanceof Error)) {
    return false;
  }

  return error.code === "EIO"
    || error.code === "EBADF"
    || /i\/o error/u.test(error.message)
    || /bad file descriptor/u.test(error.message);
}

function closeTerminalSessionAfterPtyFailure(terminalId, session, error, actionLabel) {
  if (session.isDisposing) {
    terminalSessionRegistry.releaseAttachment(terminalId);
    return;
  }

  session.isDisposing = true;
  console.warn(`Terminal session ${actionLabel} failed; treating session as exited.`, {
    terminalId,
    backend: session.backend,
    error: error.message
  });
  sendToOwner(session.ownerWebContentsId, "terminal:exit", {
    terminalId,
    exitCode: null,
    signal: null
  });
  try {
    session.pty.kill();
  } catch {
    // The PTY may already be gone after the failed I/O operation.
  }
  terminalSessionRegistry.releaseAttachment(terminalId);
}

function writeToSessionPty(terminalId, session, data, actionLabel) {
  try {
    session.pty.write(data);
  } catch (error) {
    if (isRecoverablePtyIoError(error)) {
      closeTerminalSessionAfterPtyFailure(terminalId, session, error, actionLabel);
      return false;
    }

    throw error;
  }

  return true;
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
const agentmuxService = createAgentmuxService({ app });
const agentGraphWatcher = createAgentGraphWatcher({
  databasePath: (() => {
    try {
      return path.join(app.getPath("userData"), "agentmux", "agentmux.db");
    } catch {
      return null;
    }
  })()
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

async function destroyTerminalSession(terminalId, options = {}) {
  const session = getSession(terminalId);
  const preserveSession = options.preserveSession === true;
  const retainDetachedIdentity = preserveSession
    && options.retainDetachedIdentity === true
    && session?.backend === "tmux";

  if (session === undefined || session.isDisposing) {
    return;
  }

  session.isDisposing = true;

  if (
    !preserveSession
    && session.backend === "tmux"
    && session.canDestroyTmuxSession === true
    && typeof session.tmuxSessionName === "string"
  ) {
    try {
      await tmuxBackend.destroySession(session.tmuxSessionName);
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
    }
  }

  session.pty.kill();
  if (retainDetachedIdentity) {
    terminalSessionRegistry.detachAttachment(terminalId);
  } else {
    terminalSessionRegistry.releaseAttachment(terminalId);
  }
}

async function destroyOwnedTerminalSessions(ownerWebContentsId, options = {}) {
  const cleanupPromises = [];

  terminalSessionRegistry.forEachAttachment((session, terminalId) => {
    if (session.ownerWebContentsId === ownerWebContentsId) {
      cleanupPromises.push(destroyTerminalSession(terminalId, options));
    }
  });

  terminalSessionRegistry.forEachSession((sessionRecord, sessionKey) => {
    if (sessionRecord.ownerWebContentsId !== ownerWebContentsId || sessionRecord.state !== "detached") {
      return;
    }

    if (options.preserveSession !== true && typeof sessionRecord.tmuxSessionName === "string") {
      cleanupPromises.push(tmuxBackend.destroySession(sessionRecord.tmuxSessionName).catch((error) => {
        console.error(error instanceof Error ? error.message : error);
      }));
    }

    terminalSessionRegistry.releaseSession(sessionKey);
  });

  await Promise.all(cleanupPromises);
}

function destroyOwnedWindowState(ownerWebContentsId) {
  void destroyOwnedTerminalSessions(ownerWebContentsId, {
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

async function createTmuxClientSession(options) {
  const backendSession = await tmuxBackend.createClientSession(options);

  if (backendSession === null) {
    return null;
  }

  return {
    session: {
      ownerWebContentsId: options.ownerWebContentsId,
      pty: backendSession.pty,
      shellName: options.shellName,
      cwd: backendSession.cwd,
      isDisposing: false,
      backend: "tmux",
      sessionKey: options.sessionKey,
      tmuxSessionName: backendSession.tmuxSessionName,
      canDestroyTmuxSession: true
    },
    cwd: backendSession.cwd
  };
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

  if (typeof process.env.CANVAS_CAPTURE === "string" && process.env.CANVAS_CAPTURE.length > 0) {
    const capturePath = process.env.CANVAS_CAPTURE;
    const captureScript = typeof process.env.CANVAS_CAPTURE_SCRIPT === "string" ? process.env.CANVAS_CAPTURE_SCRIPT : "";
    window.webContents.once("did-finish-load", () => {
      void (async () => {
        await delay(1800);
        if (captureScript.length > 0) {
          try {
            const captureResult = await window.webContents.executeJavaScript(captureScript);
            console.log("[capture] result:", captureResult);
            await delay(600);
          } catch (error) {
            console.error("[capture] script error", error);
          }
        }
        const image = await window.webContents.capturePage();
        fs.writeFileSync(capturePath, image.toPNG());
        console.log(`[capture] wrote ${capturePath}`);
        app.quit();
      })();
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
      throw new Error(`Smoke test failed: terminal output did not include expected text. Snapshot: ${JSON.stringify(snapshot)}`);
    }

    if (snapshot.focusedTerminalMode === true) {
      logStep("verify focused terminal layout and resize");
      const focusedResizeResult = await window.webContents.executeJavaScript(`new Promise((resolve) => {
        const errors = [];
        const handleError = (event) => {
          errors.push(event.message);
        };

        window.addEventListener("error", handleError);
        window.dispatchEvent(new Event("resize"));
        window.requestAnimationFrame(() => {
          const nextSnapshot = window.__canvasLearningDebug.getSnapshot();
          window.removeEventListener("error", handleError);
          resolve({
            errors,
            bootError: window.__canvasLearningBootError,
            snapshot: nextSnapshot
          });
        });
      })`);
      const focusedSnapshot = focusedResizeResult?.snapshot;

      if (
        focusedResizeResult?.errors?.length > 0
        || focusedResizeResult?.bootError !== null
        || focusedSnapshot?.activeNodeCount !== 1
        || focusedSnapshot?.visibleNodeCount !== 1
        || focusedSnapshot?.sidebarCollapsed !== false
        || focusedSnapshot?.maximizedNodeTitle !== null
      ) {
        throw new Error(`Smoke test failed: focused terminal layout or resize was unstable. Result: ${JSON.stringify(focusedResizeResult)}`);
      }

      logStep("verify focused mode keeps one mounted terminal");
      const firstSessionKey = snapshot.activeSessionKey;
      await window.webContents.executeJavaScript("window.__canvasLearningDebug.createTerminalAt(960, 420)");
      const secondTerminalSnapshot = await waitForSnapshot(
        "window.__canvasLearningDebug.getSnapshot()",
        (nextSnapshot) => (
          nextSnapshot.activeNodeCount === 2
          && nextSnapshot.mountedXtermCount === 1
          && nextSnapshot.rendererAttachmentCount === 1
          && nextSnapshot.resizeObserverCount === 1
        ),
        5000
      );

      if (
        secondTerminalSnapshot.mountedXtermCount !== 1
        || secondTerminalSnapshot.rendererAttachmentCount !== 1
        || secondTerminalSnapshot.resizeObserverCount !== 1
        || secondTerminalSnapshot.webglRendererCount > 1
      ) {
        throw new Error(`Smoke test failed: focused mode mounted more than one terminal. Snapshot: ${JSON.stringify(secondTerminalSnapshot)}`);
      }

      logStep("verify navigator click and drag separation");
      const navigatorResult = await window.webContents.executeJavaScript(`(async () => {
        document.getElementById("sidebar-view-terminals")?.click();
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

        const getRows = () => [...document.querySelectorAll(".terminal-navigator-row")]
          .filter((row) => getComputedStyle(row).display !== "none");
        const readNavigator = () => {
          const rows = getRows();
          return {
            order: rows.map((row) => row.dataset.nodeId),
            positions: rows.map((row) => {
              const rowRect = row.getBoundingClientRect();
              const entryRect = row.querySelector(".terminal-navigator-entry")?.getBoundingClientRect();
              return {
                nodeId: row.dataset.nodeId,
                row: { left: rowRect.left, top: rowRect.top, width: rowRect.width, height: rowRect.height },
                entry: entryRect == null ? null : { left: entryRect.left, top: entryRect.top, width: entryRect.width, height: entryRect.height }
              };
            }),
            rowDraggable: rows.map((row) => row.draggable),
            entryDraggable: rows.map((row) => row.querySelector(".terminal-navigator-entry")?.draggable),
            handleDraggable: rows.map((row) => row.querySelector(".terminal-navigator-drag-handle")?.draggable),
            draggingRows: document.querySelectorAll(".terminal-navigator-row.is-dragging").length
          };
        };
        const dispatchDrag = (element, type, transfer, clientY = 0) => element?.dispatchEvent(new DragEvent(type, {
          bubbles: true,
          cancelable: true,
          clientY,
          dataTransfer: transfer
        }));

        const before = readNavigator();
        const initialRows = getRows();
        const ignoredTransfer = new DataTransfer();
        dispatchDrag(initialRows[0]?.querySelector(".terminal-navigator-entry"), "dragstart", ignoredTransfer);
        dispatchDrag(initialRows[1], "drop", ignoredTransfer, initialRows[1]?.getBoundingClientRect().bottom - 1);
        const entryDrag = readNavigator();

        initialRows[0]?.querySelector(".terminal-navigator-entry")?.click();
        const clickedSessionKey = window.__canvasLearningDebug.getSnapshot().activeSessionKey;
        await window.__canvasLearningDebug.focusTerminal(0);
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const afterClick = readNavigator();

        const handleRows = getRows();
        const handle = handleRows[0]?.querySelector(".terminal-navigator-drag-handle");
        const handleTransfer = new DataTransfer();
        dispatchDrag(handle, "dragstart", handleTransfer);
        const handleStarted = readNavigator();
        const dropTarget = handleRows[1];
        const dropTargetRect = dropTarget?.getBoundingClientRect();
        dispatchDrag(dropTarget, "dragover", handleTransfer, (dropTargetRect?.bottom ?? 1) - 1);
        const dropIndicator = dropTarget?.classList.contains("is-drop-after") === true;
        dispatchDrag(dropTarget, "drop", handleTransfer, (dropTargetRect?.bottom ?? 1) - 1);
        const handleDropped = readNavigator();

        const reorderedRows = getRows();
        const restoreSource = reorderedRows.find((row) => row.dataset.nodeId === before.order[0]);
        const restoreTarget = reorderedRows.find((row) => row.dataset.nodeId === before.order[1]);
        const restoreTransfer = new DataTransfer();
        dispatchDrag(restoreSource?.querySelector(".terminal-navigator-drag-handle"), "dragstart", restoreTransfer);
        const restoreRect = restoreTarget?.getBoundingClientRect();
        dispatchDrag(restoreTarget, "drop", restoreTransfer, (restoreRect?.top ?? 0) + 1);
        const handleRestored = readNavigator();

        const staleRows = getRows();
        const staleTransfer = new DataTransfer();
        dispatchDrag(staleRows[0]?.querySelector(".terminal-navigator-drag-handle"), "dragstart", staleTransfer);
        const staleStarted = readNavigator();
        staleRows[0]?.querySelector(".terminal-navigator-entry")?.click();
        const nextRows = getRows();
        dispatchDrag(nextRows[1], "drop", staleTransfer, nextRows[1]?.getBoundingClientRect().bottom - 1);
        const afterRerender = readNavigator();

        const keyboardSourceId = before.order[1];
        const pressMoveKey = (key) => getRows()
          .find((row) => row.dataset.nodeId === keyboardSourceId)
          ?.querySelector(".terminal-navigator-drag-handle")
          ?.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
        pressMoveKey("ArrowUp");
        const keyboardMoved = readNavigator();
        pressMoveKey("ArrowDown");
        const keyboardRestored = readNavigator();
        await window.__canvasLearningDebug.focusTerminal(0);

        return {
          before,
          entryDrag,
          clickedSessionKey,
          afterClick,
          handleStarted,
          dropIndicator,
          handleDropped,
          handleRestored,
          staleStarted,
          afterRerender,
          keyboardMoved,
          keyboardRestored
        };
      })()`);

      const expectedOrder = JSON.stringify(navigatorResult.before.order);

      if (
        navigatorResult.before.order.length !== 2
        || navigatorResult.before.rowDraggable.some(Boolean)
        || navigatorResult.before.entryDraggable.some(Boolean)
        || navigatorResult.before.handleDraggable.some((isDraggable) => isDraggable !== true)
        || navigatorResult.entryDrag.draggingRows !== 0
        || JSON.stringify(navigatorResult.entryDrag.order) !== expectedOrder
        || navigatorResult.clickedSessionKey !== firstSessionKey
        || JSON.stringify(navigatorResult.afterClick.order) !== expectedOrder
        || JSON.stringify(navigatorResult.afterClick.positions) !== JSON.stringify(navigatorResult.before.positions)
        || navigatorResult.handleStarted.draggingRows !== 1
        || navigatorResult.dropIndicator !== true
        || JSON.stringify(navigatorResult.handleDropped.order) !== JSON.stringify([...navigatorResult.before.order].reverse())
        || navigatorResult.handleDropped.draggingRows !== 0
        || JSON.stringify(navigatorResult.handleRestored.order) !== expectedOrder
        || navigatorResult.staleStarted.draggingRows !== 1
        || navigatorResult.afterRerender.draggingRows !== 0
        || JSON.stringify(navigatorResult.afterRerender.order) !== expectedOrder
        || JSON.stringify(navigatorResult.keyboardMoved.order) !== JSON.stringify([...navigatorResult.before.order].reverse())
        || JSON.stringify(navigatorResult.keyboardRestored.order) !== expectedOrder
      ) {
        throw new Error(`Smoke test failed: navigator click/drag contract regressed. Result: ${JSON.stringify(navigatorResult)}`);
      }

      const reattachedFirstSnapshot = await waitForSnapshot(
        "window.__canvasLearningDebug.getSnapshot()",
        (nextSnapshot) => (
          nextSnapshot.activeSessionKey === firstSessionKey
          && nextSnapshot.mountedXtermCount === 1
          && nextSnapshot.rendererAttachmentCount === 1
          && typeof nextSnapshot.firstTerminalText === "string"
          && nextSnapshot.firstTerminalText.length > 0
        ),
        5000
      );

      if (
        reattachedFirstSnapshot.activeSessionKey !== firstSessionKey
        || reattachedFirstSnapshot.mountedXtermCount !== 1
        || reattachedFirstSnapshot.rendererAttachmentCount !== 1
        || reattachedFirstSnapshot.firstTerminalText.length === 0
      ) {
        throw new Error(`Smoke test failed: focused terminal did not survive detach and reattach. Snapshot: ${JSON.stringify(reattachedFirstSnapshot)}`);
      }

      logStep("verify double-click preserves managed terminal position");
      const doubleClickSetup = await window.webContents.executeJavaScript(`(async () => {
        await window.__canvasLearningDebug.focusTerminal(0);
        const before = window.__canvasLearningDebug.setTerminalManagedGraph([
          { name: "smoke-parent", parentAgent: null, depth: 0 },
          { name: "smoke-child", parentAgent: "smoke-parent", depth: 1 }
        ]);
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

        return {
          before,
          childId: before.nodes[1]?.id ?? null,
          childSessionKey: before.nodes[1]?.sessionKey ?? null
        };
      })()`);

      if (doubleClickSetup.childId === null || doubleClickSetup.childSessionKey === null) {
        throw new Error(`Smoke test failed: managed child was unavailable for double-click. Setup: ${JSON.stringify(doubleClickSetup)}`);
      }

      const doubleClickResult = await window.webContents.executeJavaScript(`(async () => {
        const childId = ${JSON.stringify(doubleClickSetup.childId)};
        const dispatch = (type, detail) => {
          const entry = document.querySelector('.terminal-navigator-entry[data-node-id="' + childId + '"]');
          entry?.dispatchEvent(new MouseEvent(type, {
            bubbles: true,
            cancelable: true,
            button: 0,
            detail
          }));
        };

        dispatch("click", 1);
        dispatch("click", 2);
        dispatch("dblclick", 2);
        const tree = await window.__canvasLearningDebug.waitForFocusedTerminalIdle();
        const snapshot = window.__canvasLearningDebug.getSnapshot();
        return {
          activeSessionKey: snapshot.activeSessionKey,
          mountedXtermCount: snapshot.mountedXtermCount,
          rendererAttachmentCount: snapshot.rendererAttachmentCount,
          tree
        };
      })()`);

      if (
        doubleClickResult.activeSessionKey !== doubleClickSetup.childSessionKey
        || doubleClickResult.mountedXtermCount !== 1
        || doubleClickResult.rendererAttachmentCount !== 1
        || JSON.stringify(doubleClickResult.tree.nodeOrder) !== JSON.stringify(doubleClickSetup.before.nodeOrder)
        || JSON.stringify(doubleClickResult.tree.nodes) !== JSON.stringify(doubleClickSetup.before.nodes)
        || JSON.stringify(doubleClickResult.tree.rows) !== JSON.stringify(doubleClickSetup.before.rows)
      ) {
        throw new Error(`Smoke test failed: double-click moved a managed terminal. Result: ${JSON.stringify({ setup: doubleClickSetup, result: doubleClickResult })}`);
      }

      await window.webContents.executeJavaScript("window.__canvasLearningDebug.focusTerminal(0)");

      logStep("verify focused terminal title edit button");
      const editedTerminalTitle = "Focused terminal renamed";
      const titleEditResult = await window.webContents.executeJavaScript(
        `window.__canvasLearningDebug.renameActiveTerminalThroughButton(${JSON.stringify(editedTerminalTitle)})`
      );

      if (
        titleEditResult?.editing?.isEditing !== true
        || titleEditResult.editing.hasFocus !== true
        || titleEditResult.editing.isReadOnly !== false
        || titleEditResult.editing.tabIndex !== 0
        || titleEditResult.editing.ariaPressed !== "true"
        || titleEditResult.titleText !== editedTerminalTitle
        || titleEditResult.navigatorLabel !== editedTerminalTitle
        || titleEditResult.sessionSnapshotTitle !== editedTerminalTitle
        || titleEditResult.isEditingAfterCommit !== false
      ) {
        throw new Error(`Smoke test failed: terminal title edit button did not keep the editor active or serialize the title. Result: ${JSON.stringify(titleEditResult)}`);
      }

      logStep("verify terminal input after resize");
      await window.webContents.executeJavaScript("window.__canvasLearningDebug.sendToFirstTerminal('echo focused-resize-check\\r')");
      const resizedTerminalSnapshot = await waitForSnapshot(
        "window.__canvasLearningDebug.getSnapshot()",
        (nextSnapshot) => nextSnapshot.firstTerminalText.includes("focused-resize-check"),
        5000
      );

      if (!resizedTerminalSnapshot.firstTerminalText.includes("focused-resize-check")) {
        throw new Error(`Smoke test failed: focused terminal stopped responding after resize. Snapshot: ${JSON.stringify(resizedTerminalSnapshot)}`);
      }

      await destroyOwnedTerminalSessions(window.webContents.id, { preserveSession: false });
      console.log("Smoke test passed.");
      app.quit();
      return;
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

    logStep("verify vertical canvas rail owns primary navigator");
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
      throw new Error(`Smoke test failed: vertical canvas rail did not replace the drawer-owned primary navigator. Snapshot: ${JSON.stringify(topCanvasStripSnapshot)}`);
    }

    logStep("keep vertical canvas rail usable while terminals are maximized");
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
      throw new Error(`Smoke test failed: maximizing the first canvas terminal hid or desynced the canvas rail. Snapshot: ${JSON.stringify(maximizedCanvasOneSnapshot)}`);
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
      throw new Error(`Smoke test failed: the second canvas did not preserve its own maximized terminal while keeping the canvas rail visible. Snapshot: ${JSON.stringify(maximizedCanvasTwoSnapshot)}`);
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

    const canvasRailLayoutSnapshot = await window.webContents.executeJavaScript(`(() => {
      const boardElement = document.getElementById("board");
      const appRail = document.querySelector(".app-rail");
      const stripList = document.getElementById("canvas-strip-list");

      if (!(boardElement instanceof HTMLElement) || !(appRail instanceof HTMLElement) || !(stripList instanceof HTMLElement)) {
        return null;
      }

      const boardRect = boardElement.getBoundingClientRect();
      const railRect = appRail.getBoundingClientRect();
      const stripRect = stripList.getBoundingClientRect();
      const boardHeightRatio = window.innerHeight > 0 ? (boardRect.height / window.innerHeight) : 0;

      return {
        boardLeft: boardRect.left,
        boardHeight: boardRect.height,
        boardHeightRatio,
        railRight: railRect.right,
        railHeight: railRect.height,
        stripRight: stripRect.right,
        stripHeight: stripRect.height,
        stripVisible: stripRect.width > 0 && stripRect.height > 0
      };
    })()`);

    if (
      canvasRailLayoutSnapshot === null
      || canvasRailLayoutSnapshot.stripVisible !== true
      || canvasRailLayoutSnapshot.boardLeft + 2 < canvasRailLayoutSnapshot.railRight
      || canvasRailLayoutSnapshot.boardHeightRatio < 0.68
    ) {
      throw new Error(`Smoke test failed: the board no longer keeps usable space beside the vertical canvas rail. Snapshot: ${JSON.stringify(canvasRailLayoutSnapshot)}`);
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

    logStep("imported canvas restores exported workspace");
    await window.webContents.executeJavaScript(`window.__canvasLearningDebug.switchCanvas(${JSON.stringify(workspaceOwnerCanvasIndex)})`);
    const exportedWorkspaceCanvas = await window.webContents.executeJavaScript("window.__canvasLearningDebug.exportActiveCanvasData()");

    if (
      exportedWorkspaceCanvas.canvas?.workspace?.rootPath !== canonicalSmokeWorkspacePath
      || exportedWorkspaceCanvas.canvas?.workspace?.previewRelativePath !== "agent-output/reports/notes.md"
    ) {
      throw new Error(`Smoke test failed: canvas export did not include workspace ownership. Payload: ${JSON.stringify(exportedWorkspaceCanvas)}`);
    }

    const importedWorkspaceCanvasResult = await window.webContents.executeJavaScript("window.__canvasLearningDebug.importLastExportedCanvasData()");
    const importedCanvasName = importedWorkspaceCanvasResult.snapshot.activeCanvasName;
    const importedWorkspaceCanvasSnapshot = await waitForSnapshot(
      "window.__canvasLearningDebug.getSnapshot()",
      (snapshot) => (
        snapshot.activeCanvasName === importedCanvasName
        && snapshot.workspaceRootPath === canonicalSmokeWorkspacePath
        && snapshot.workspaceSelectedFilePath === "agent-output/reports/notes.md"
      ),
      4000
    );
    const importedCanvasOwnership = getCanvasWorkspaceOwnership(importedWorkspaceCanvasSnapshot, importedCanvasName);

    if (
      importedWorkspaceCanvasSnapshot.workspaceRootPath !== canonicalSmokeWorkspacePath
      || importedWorkspaceCanvasSnapshot.workspaceSelectedFilePath !== "agent-output/reports/notes.md"
      || importedWorkspaceCanvasSnapshot.fileInspectorVisible !== true
      || importedCanvasOwnership?.workspaceRootPath !== canonicalSmokeWorkspacePath
      || importedCanvasOwnership?.workspacePreviewRelativePath !== "agent-output/reports/notes.md"
    ) {
      throw new Error(`Smoke test failed: imported canvas did not restore exported workspace ownership. Snapshot: ${JSON.stringify(importedWorkspaceCanvasSnapshot)}`);
    }

    const importedCanvasDefaultCwd = await window.webContents.executeJavaScript("window.__canvasLearningDebug.getDefaultTerminalWorkingDirectory()");

    if (importedCanvasDefaultCwd !== canonicalSmokeWorkspacePath) {
      throw new Error(`Smoke test failed: imported canvas default cwd should be the exported workspace. Value: ${JSON.stringify(importedCanvasDefaultCwd)}`);
    }

    await destroyOwnedTerminalSessions(window.webContents.id, { preserveSession: false });
    console.log("Smoke test passed.");
    app.quit();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    await destroyOwnedTerminalSessions(window.webContents.id, { preserveSession: false });
    app.exit(1);
  } finally {
    smokeWorkspacePaths.forEach((workspacePath) => {
      fs.rmSync(workspacePath, { recursive: true, force: true });
    });
  }
}

void app.whenReady().then(() => {
  ensureNodePtyHelperPermissions();
  createApplicationMenu();
  createMainWindow();
  agentGraphWatcher.setDatabasePath(path.join(app.getPath("userData"), "agentmux", "agentmux.db"));
  agentGraphWatcher.start();

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

// Attention layer: dock badge mirrors how many agents are waiting on the user,
// and a native notification fires for each newly-flagged agent while the app
// window is not focused.
ipcMain.on("attention:update", (event, payload) => {
  const count = Number.isInteger(payload?.count) && payload.count > 0 ? payload.count : 0;

  if (process.platform === "darwin" && app.dock) {
    app.dock.setBadge(count > 0 ? String(count) : "");
  }

  const ownerWindow = BrowserWindow.fromWebContents(event.sender);
  const isWindowFocused = ownerWindow !== null && ownerWindow.isFocused();
  const newlyFlagged = Array.isArray(payload?.newlyFlagged) ? payload.newlyFlagged : [];

  if (isWindowFocused || newlyFlagged.length === 0 || !Notification.isSupported()) {
    return;
  }

  for (const item of newlyFlagged.slice(0, 3)) {
    if (typeof item?.title !== "string" || item.title.length === 0) {
      continue;
    }

    const notification = new Notification({
      title: item.state === "error" ? `${item.title} failed` : `${item.title} needs input`,
      body: item.state === "error"
        ? "The agent hit an error. Jump back to the canvas to take a look."
        : "The agent is waiting on you to continue.",
      silent: false
    });

    notification.on("click", () => {
      if (ownerWindow !== null && !ownerWindow.isDestroyed()) {
        if (ownerWindow.isMinimized()) {
          ownerWindow.restore();
        }
        ownerWindow.show();
        ownerWindow.focus();
      }
    });

    notification.show();
  }
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

ipcMain.handle("workspace-directory:refresh", async (event, payload) => {
  return workspaceService.refreshActiveFolder(event.sender.id, {
    expandedDirectoryPaths: Array.isArray(payload?.expandedDirectoryPaths)
      ? payload.expandedDirectoryPaths.filter((directoryPath) => typeof directoryPath === "string")
      : []
  });
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

ipcMain.handle("terminal:create", async (event, payload) => {
  const { terminalId, cols, rows, cwd } = payload ?? {};

  if (typeof terminalId !== "string" || terminalId.trim().length === 0) {
    throw new Error("Terminal id is required.");
  }

  const safeCols = Number.isFinite(cols) ? Math.max(20, Math.floor(cols)) : 80;
  const safeRows = Number.isFinite(rows) ? Math.max(8, Math.floor(rows)) : 24;
  const shell = resolveShell();
  const shellName = path.basename(shell);
  const terminalCwd = resolveTerminalWorkingDirectory(cwd);
  const sessionKey = normalizeTerminalSessionKey(payload?.sessionKey) ?? terminalId;
  const shouldEnforceRequestedCwd = typeof cwd === "string" && cwd.trim().length > 0;
  const requestedTmuxSessionName = typeof payload?.tmuxSessionName === "string" && payload.tmuxSessionName.trim().length > 0
    ? payload.tmuxSessionName.trim()
    : null;
  const agentProjectTag = typeof payload?.agentProjectTag === "string" && payload.agentProjectTag.trim().length > 0
    ? payload.agentProjectTag.trim()
    : null;
  const payloadManagedAgentName = typeof payload?.managedAgentName === "string" && payload.managedAgentName.trim().length > 0
    ? payload.managedAgentName.trim()
    : null;
  const payloadParentAgentName = typeof payload?.parentAgentName === "string" && payload.parentAgentName.trim().length > 0
    ? payload.parentAgentName.trim()
    : null;

  // Child-spawn path: a parent agent was named, so we delegate tmux session
  // creation to `agentmux worker --parent`, then attach to the resulting
  // session. The agent is already registered in the graph; we do NOT run
  // `agentmux import` again. Returns early — the fresh-root path below is
  // skipped.
  //
  // This branch is reserved for FRESH children (no saved tmux session yet).
  // Restored child terminals pass `tmuxSessionName` so they reattach to the
  // existing session and the agent that agentmux already knows about; they
  // fall through to the standard reattach path below.
  if (payloadParentAgentName !== null && requestedTmuxSessionName === null) {
    if (agentProjectTag === null) {
      throw new Error("Cannot spawn a child terminal outside a managed canvas project.");
    }

    const spawned = await agentmuxService.spawnChildWorker({
      projectTag: agentProjectTag,
      parentAgentName: payloadParentAgentName,
      workdir: terminalCwd
    });
    const childTmuxSessionName = spawned.tmuxSessionName;
    const childReservation = terminalSessionRegistry.reserve({
      terminalId,
      sessionKey,
      tmuxSessionName: childTmuxSessionName,
      ownerWebContentsId: event.sender.id
    });
    let childTerminalPty = null;
    let childDidAttach = false;

    try {
      const childTmuxSession = await createTmuxClientSession({
        ownerWebContentsId: event.sender.id,
        cols: safeCols,
        rows: safeRows,
        cwd: terminalCwd,
        shellName,
        sessionKey,
        tmuxSessionName: childTmuxSessionName,
        createIfMissing: false,
        sessionEnv: {}
      });
      if (childTmuxSession === null) {
        throw new Error(`Could not attach to child tmux session '${childTmuxSessionName}'.`);
      }

      childTerminalPty = childTmuxSession.session.pty;
      const childSession = childTmuxSession.session;

      terminalSessionRegistry.attach(childReservation, childSession);
      childDidAttach = true;

      agentGraphWatcher.notifyProjectTagChanged(agentProjectTag);

      childTerminalPty.onData((data) => {
        sendToOwner(childSession.ownerWebContentsId, "terminal:data", {
          terminalId,
          data
        });
      });

      childTerminalPty.onExit(({ exitCode, signal }) => {
        if (!childSession.isDisposing) {
          sendToOwner(childSession.ownerWebContentsId, "terminal:exit", {
            terminalId,
            exitCode,
            signal
          });
        }
        terminalSessionRegistry.releaseAttachment(terminalId);
      });

      return {
        terminalId,
        shellName,
        cwd: childSession.cwd,
        backend: childSession.backend,
        sessionKey: childSession.sessionKey,
        tmuxSessionName: childSession.tmuxSessionName,
        managedAgentName: spawned.agentName,
        managedParentAgent: spawned.parentAgentName,
        managedProjectTag: agentProjectTag,
        cols: safeCols,
        rows: safeRows
      };
    } catch (error) {
      if (childDidAttach) {
        const attachedSession = terminalSessionRegistry.releaseAttachment(terminalId);

        if (attachedSession !== undefined && !attachedSession.isDisposing) {
          attachedSession.isDisposing = true;
          attachedSession.pty.kill();
        }
      } else {
        terminalSessionRegistry.cancel(childReservation);
        childTerminalPty?.kill();
      }
      throw error;
    }
  }

  // Fresh canvas terminals are born as managed root agents so every process
  // inside them (claude, codex, ...) inherits AGENTMUX_* context. Restored
  // terminals reattach to existing tmux sessions and keep their agent record.
  const shouldAdoptAsAgent = agentProjectTag !== null
    && requestedTmuxSessionName === null
    && payloadManagedAgentName === null;
  const plannedAgentName = shouldAdoptAsAgent ? `terminal-${randomUUID().slice(0, 6)}` : null;
  const plannedTmuxSessionName = requestedTmuxSessionName ?? getTmuxSessionName(sessionKey);
  const sessionEnv = agentProjectTag === null
    ? {}
    : {
        ...agentmuxService.buildTerminalRuntimeEnv(),
        ...(shouldAdoptAsAgent ? agentmuxService.buildTerminalAgentEnv({
          projectTag: agentProjectTag,
          agentName: plannedAgentName,
          workdir: terminalCwd,
          tmuxSessionName: plannedTmuxSessionName
        }) : {})
      };
  const reservation = terminalSessionRegistry.reserve({
    terminalId,
    sessionKey,
    tmuxSessionName: plannedTmuxSessionName,
    ownerWebContentsId: event.sender.id
  });
  let terminalPty = null;
  let didAttach = false;

  try {
    let tmuxSession = null;

    tmuxSession = await createTmuxClientSession({
      ownerWebContentsId: event.sender.id,
      cols: safeCols,
      rows: safeRows,
      cwd: terminalCwd,
      shellName,
      sessionKey,
      tmuxSessionName: requestedTmuxSessionName,
      createIfMissing: requestedTmuxSessionName === null,
      sessionEnv
    });

    // A saved tmux identity is attach-only. Observation and restoration must
    // never recreate a stopped agent or silently replace it with a new shell.
    if (requestedTmuxSessionName !== null && tmuxSession === null) {
      const error = new Error(`tmux session '${requestedTmuxSessionName}' is not running.`);
      error.code = "TMUX_SESSION_MISSING";
      throw error;
    }

    terminalPty = tmuxSession?.session?.pty ?? pty.spawn(shell, [], {
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
      tmuxSessionName: null,
      canDestroyTmuxSession: false
    };

    terminalSessionRegistry.attach(reservation, session);
    didAttach = true;

    let managedAgentName = null;

    if (shouldAdoptAsAgent && session.backend === "tmux" && session.tmuxSessionName !== null) {
      try {
        const adopted = await agentmuxService.adoptAgent({
          tmuxSessionName: session.tmuxSessionName,
          projectTag: agentProjectTag,
          agentName: plannedAgentName,
          workdir: session.cwd
        });
        managedAgentName = adopted.agentName;
        agentGraphWatcher.notifyProjectTagChanged(agentProjectTag);
      } catch (error) {
        console.warn(`Could not register terminal ${terminalId} as a canvas agent: ${error.message}`);
      }
    }

    if (shouldEnforceRequestedCwd && session.backend !== "tmux") {
      writeToSessionPty(
        terminalId,
        session,
        `cd -- '${escapeShellPathForSingleQuotes(terminalCwd)}'\r`,
        "bootstrap write"
      );
    }

    terminalPty.onData((data) => {
      sendToOwner(session.ownerWebContentsId, "terminal:data", {
        terminalId,
        data
      });
    });

    terminalPty.onExit(({ exitCode, signal }) => {
      if (!session.isDisposing) {
        console.warn("Terminal session exited unexpectedly.", {
          terminalId,
          backend: session.backend,
          exitCode,
          signal
        });
        sendToOwner(session.ownerWebContentsId, "terminal:exit", {
          terminalId,
          exitCode,
          signal
        });
      }

      terminalSessionRegistry.releaseAttachment(terminalId);
    });

    return {
      terminalId,
      shellName,
      cwd: session.cwd,
      backend: session.backend,
      sessionKey: session.sessionKey,
      tmuxSessionName: session.tmuxSessionName,
      managedAgentName,
      managedProjectTag: managedAgentName !== null ? agentProjectTag : null,
      cols: safeCols,
      rows: safeRows
    };
  } catch (error) {
    if (didAttach) {
      const attachedSession = terminalSessionRegistry.releaseAttachment(terminalId);

      if (attachedSession !== undefined && !attachedSession.isDisposing) {
        attachedSession.isDisposing = true;
        attachedSession.pty.kill();
      }
    } else {
      terminalSessionRegistry.cancel(reservation);
      terminalPty?.kill();
    }

    throw error;
  }
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

    writeToSessionPty(payload.terminalId, session, data, "write");
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

// Ask tmux to repaint the whole pane for every attached client. Used when a
// hidden terminal node is revealed after its output was dropped renderer-side.
ipcMain.handle("terminal:redraw", async (event, payload) => {
  const session = getSession(payload.terminalId);

  if (session === undefined) {
    return;
  }

  if (session.ownerWebContentsId !== event.sender.id) {
    throw new Error("Terminal session is not owned by this window.");
  }

  if (session.backend !== "tmux" || typeof session.tmuxSessionName !== "string") {
    return;
  }

  await tmuxBackend.redrawSession(session.tmuxSessionName);
});

ipcMain.handle("terminal:destroy", async (event, payload) => {
  const terminalId = typeof payload?.terminalId === "string" ? payload.terminalId : null;
  const sessionKey = normalizeTerminalSessionKey(payload?.sessionKey);
  const tmuxSessionName = typeof payload?.tmuxSessionName === "string" && payload.tmuxSessionName.length > 0
    ? payload.tmuxSessionName
    : null;
  const session = terminalId === null ? undefined : getSession(terminalId);

  if (session === undefined && sessionKey === null) {
    return;
  }

  if (session !== undefined) {
    if (session.ownerWebContentsId !== event.sender.id) {
      throw new Error("Terminal session is not owned by this window.");
    }

    await destroyTerminalSession(terminalId, {
      preserveSession: payload?.preserveSession === true,
      retainDetachedIdentity: payload?.retainDetachedIdentity === true
    });
    return;
  }

  const detachedSession = terminalSessionRegistry.getSession(sessionKey);

  if (detachedSession === undefined) {
    return;
  }

  if (
    detachedSession.state !== "detached"
    || detachedSession.ownerWebContentsId !== event.sender.id
    || detachedSession.tmuxSessionName !== tmuxSessionName
  ) {
    throw new Error("Detached terminal session is not owned by this window.");
  }

  if (payload?.preserveSession !== true && tmuxSessionName !== null) {
    try {
      await tmuxBackend.destroySession(tmuxSessionName);
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
    }
  }

  terminalSessionRegistry.releaseSession(sessionKey);
});

ipcMain.handle("canvas-agent:sync", async (_event, payload) => {
  try {
    return await agentmuxService.syncCanvasProject({
      canvasId: payload?.canvasId,
      canvasName: payload?.canvasName,
      workspaceRootPath: payload?.workspaceRootPath,
      projectTag: payload?.projectTag
    });
  } catch (error) {
    if (isAgentmuxUnavailableError(error)) {
      return {
        unavailable: true,
        reason: error.message
      };
    }

    throw error;
  }
});

ipcMain.handle("canvas-agent:delete", async (_event, payload) => {
  await agentmuxService.deleteAgent(payload?.agentName);
  agentGraphWatcher.notifyProjectTagChanged(payload?.projectTag);
  return { ok: true };
});

ipcMain.handle("canvas-agent:send", async (_event, payload) => {
  await agentmuxService.sendAgentPrompt(payload?.agentName, payload?.message);
  agentGraphWatcher.notifyProjectTagChanged(payload?.projectTag);
  return { ok: true };
});

ipcMain.handle("canvas-agent:connect", async (_event, payload) => {
  await agentmuxService.connectAgents(payload?.agentA, payload?.agentB);
  agentGraphWatcher.notifyProjectTagChanged(payload?.projectTag);
  return { ok: true };
});

ipcMain.handle("canvas-agent:adopt", async (_event, payload) => {
  const result = await agentmuxService.adoptAgent({
    agentName: payload?.agentName,
    tmuxSessionName: payload?.tmuxSessionName,
    projectTag: payload?.projectTag,
    workdir: payload?.workdir
  });
  agentGraphWatcher.notifyProjectTagChanged(payload?.projectTag);
  return result;
});

ipcMain.handle("canvas-agent:resume", async (_event, payload) => {
  try {
    const result = await agentmuxService.resumeAgent({
      agentName: payload?.agentName,
      prompt: payload?.prompt,
      readyTimeout: payload?.readyTimeout
    });
    agentGraphWatcher.notifyProjectTagChanged(payload?.projectTag);
    return result;
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error ?? "")
    };
  }
});

ipcMain.handle("canvas-agent:subscribe", async (event, payload) => {
  const ownerWebContentsId = event.sender.id;
  const projectTag = typeof payload?.projectTag === "string" ? payload.projectTag : null;
  if (projectTag !== null && projectTag.length > 0) {
    agentGraphWatcher.watchProjectTag(projectTag);
  }
  const removeListener = agentGraphWatcher.registerListener(ownerWebContentsId, (changePayload) => {
    sendToOwner(ownerWebContentsId, "canvas-agent:changed", changePayload);
  });
  event.sender.once("destroyed", () => {
    removeListener();
    agentGraphWatcher.unregisterListener(ownerWebContentsId);
  });
  return { ok: true };
});

ipcMain.handle("canvas-agent:unsubscribe", async (event, payload) => {
  const ownerWebContentsId = event.sender.id;
  const projectTag = typeof payload?.projectTag === "string" ? payload.projectTag : null;
  if (projectTag !== null && projectTag.length > 0) {
    agentGraphWatcher.unwatchProjectTag(projectTag);
  }
  agentGraphWatcher.unregisterListener(ownerWebContentsId);
  return { ok: true };
});

// Read-only canvas snapshot for agents (roadmap M3). The renderer pushes the
// latest swarm facts; we persist them atomically so any terminal agent can
// read real canvas state from disk.
function getCanvasSnapshotFilePath() {
  return path.join(app.getPath("userData"), "canvas-snapshot.json");
}

let canvasSnapshotWriteChain = Promise.resolve();

ipcMain.handle("canvas-snapshot:update", (_event, payload) => {
  const snapshotFilePath = getCanvasSnapshotFilePath();

  if (payload?.snapshot != null && typeof payload.snapshot === "object") {
    const contents = `${JSON.stringify(payload.snapshot, null, 2)}\n`;

    // Chain writes so they stay ordered and atomic without ever blocking the
    // main-process event loop on the renderer's periodic snapshot tick.
    canvasSnapshotWriteChain = canvasSnapshotWriteChain
      .then(async () => {
        const temporaryPath = `${snapshotFilePath}.tmp`;
        await fsp.writeFile(temporaryPath, contents);
        await fsp.rename(temporaryPath, snapshotFilePath);
      })
      .catch((error) => {
        console.warn("Failed to persist canvas snapshot.", error);
      });
  }

  return { path: snapshotFilePath };
});

ipcMain.handle("agent-skill:status", () => getAgentmuxSkillStatus());

ipcMain.handle("agent-skill:install", () => installAgentmuxSkill());

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
