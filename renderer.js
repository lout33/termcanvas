const {
  normalizeCanvasWorkspaceRecord,
  syncCanvasWorkspaceFromLiveState,
  toggleCanvasWorkspaceExpandedDirectory,
  deriveCanvasWorkspaceAfterRestore,
  shouldApplyCanvasWorkspaceRestoreResult,
  getCanvasWorkspaceExpandedDirectories,
  getCanvasWorkspacePreviewRelativePath,
  getCanvasWorkspaceRootPath
} = window.noteCanvasRendererWorkspace;
const {
  createWorkspaceActionDialogState,
  openWorkspaceActionDialog,
  closeWorkspaceActionDialog,
  getWorkspaceActionDialogSubmitValue
} = window.noteCanvasRendererActionDialog;
const {
  deriveCanvasSwitcherViewModel,
  deriveCanvasStripOverflowState,
  deriveTerminalStripViewModel
} = window.noteCanvasRendererCanvasSwitcher;
const {
  shouldHandleCanvasWheel,
  shouldTerminalHandleWheel,
  shouldClearActiveTerminalSelection,
  shouldSelectTerminal,
  shouldEnableTerminalInteractionOverlay,
  shouldShowBoardHintsForCanvas,
  deriveTerminalStripActivation,
  getViewportOffsetToCenterNode,
  getStripScrollTarget,
  getStripOverflowTargetIndex
} = window.noteCanvasRendererCanvasNavigation;
const {
  deriveWorkspacePreviewViewModel,
  shouldApplyWorkspacePreviewActionError
} = window.noteCanvasRendererWorkspacePreview;

if (window.noteCanvas?.isSmokeTest) {
  window.__canvasLearningBootError = null;
  window.addEventListener("error", (event) => {
    const error = event.error;
    window.__canvasLearningBootError = error instanceof Error
      ? (error.stack || error.message)
      : String(event.message || "Unknown renderer boot error.");
  });
}

const appShell = document.querySelector(".app-shell");
const board = document.getElementById("board");
const nodesLayer = document.getElementById("nodes-layer");
const emptyState = document.getElementById("empty-state");
const boardHints = document.getElementById("board-hints");
const boardZoomIndicator = document.getElementById("board-zoom-indicator");
const boardFullscreenExitButton = document.getElementById("board-fullscreen-exit");
const canvasSwitcherSection = document.getElementById("canvas-switcher-section");
const canvasSwitcherButton = document.getElementById("canvas-switcher-button");
const canvasSwitcherMenu = document.getElementById("canvas-switcher-menu");
const canvasSwitcherMenuBody = document.getElementById("canvas-switcher-menu-body");
const canvasStripList = document.getElementById("canvas-strip-list");
const canvasStripPrevButton = document.getElementById("canvas-strip-prev-button");
const canvasStripNextButton = document.getElementById("canvas-strip-next-button");
const terminalStripSection = document.getElementById("terminal-strip-section");
const terminalStripList = document.getElementById("terminal-strip-list");
const terminalStripPrevButton = document.getElementById("terminal-strip-prev-button");
const terminalStripNextButton = document.getElementById("terminal-strip-next-button");
const createCanvasButton = document.getElementById("create-canvas-button");
const exportCanvasButton = document.getElementById("export-canvas-button");
const importCanvasButton = document.getElementById("import-canvas-button");
const exportAppSessionButton = document.getElementById("export-app-session-button");
const importAppSessionButton = document.getElementById("import-app-session-button");
const openWorkspaceButton = document.getElementById("open-workspace-button");
const refreshWorkspaceButton = document.getElementById("refresh-workspace-button");
const createWorkspaceFileButton = document.getElementById("create-workspace-file-button");
const createWorkspaceDirectoryButton = document.getElementById("create-workspace-directory-button");
const renameWorkspaceEntryButton = document.getElementById("rename-workspace-entry-button");
const deleteWorkspaceEntryButton = document.getElementById("delete-workspace-entry-button");
const workspaceBrowser = document.getElementById("workspace-browser");
const fileInspector = document.getElementById("file-inspector");
const fileInspectorResizeHandle = document.getElementById("file-inspector-resize-handle");
const workspaceActionDialog = document.getElementById("workspace-action-dialog");
const workspaceActionDialogBackdrop = document.getElementById("workspace-action-dialog-backdrop");
const workspaceActionDialogForm = document.getElementById("workspace-action-dialog-form");
const workspaceActionDialogTitle = document.getElementById("workspace-action-dialog-title");
const workspaceActionDialogMessage = document.getElementById("workspace-action-dialog-message");
const workspaceActionDialogInput = document.getElementById("workspace-action-dialog-input");
const workspaceActionDialogCancelButton = document.getElementById("workspace-action-dialog-cancel");
const workspaceActionDialogConfirmButton = document.getElementById("workspace-action-dialog-confirm");
const sidebarToggleButton = document.getElementById("sidebar-toggle-button");
const sidebarResizeHandle = document.getElementById("sidebar-resize-handle");
const sidebarPanel = document.querySelector(".canvas-sidebar-panel");
const TerminalConstructor = window.Terminal;
const FitAddonConstructor = window.FitAddon?.FitAddon;
const DRAG_THRESHOLD = 3;
const CANVAS_EXPORT_VERSION = 2;
const LEGACY_CANVAS_EXPORT_VERSION = 1;
const MAX_CANVAS_NAME_LENGTH = 80;
const MAX_TERMINAL_TITLE_LENGTH = 80;
const WHEEL_LINE_DELTA_PX = 16;
const CANVAS_SCALE_MIN = 0.55;
const CANVAS_SCALE_MAX = 1.8;
const CANVAS_SCALE_STEP = 0.0015;
const CANVAS_SCALE_PRECISION = 1000;
const DEFAULT_NODE_WIDTH = 544;
const DEFAULT_NODE_HEIGHT = 352;
const MIN_NODE_WIDTH = 320;
const MIN_NODE_HEIGHT = 220;
const MIN_SIDEBAR_PANEL_WIDTH = 224;
const MIN_FILE_INSPECTOR_WIDTH = 240;
const PANEL_VIEWPORT_MARGIN = 24;
const ZOOM_INDICATOR_VISIBLE_MS = 1200;
const RESIZE_HANDLE_DIRECTIONS = ["n", "s", "e", "w", "nw", "ne", "sw", "se"];
const APP_SESSION_VERSION = 1;
const APP_SESSION_SAVE_DEBOUNCE_MS = 180;

let terminalCount = 0;
let canvasCount = 0;
const canvases = [];
const canvasMap = new Map();
const terminalNodeMap = new Map();
let activeCanvasId = null;
let activeNodeRecord = null;
let activeTitleEditorRecord = null;
let activeCanvasRenameId = null;
let isSidebarCollapsed = true;
let hasDismissedBoardIntro = false;
let isWindowUnloading = false;
let renderedCanvasId = null;
let viewportRenderFrame = 0;
let terminalSizeSyncFrame = 0;
let zoomIndicatorTimeout = 0;
let canvasStripOverflowSyncFrame = 0;
let terminalStripOverflowSyncFrame = 0;
let shouldEnsureActiveCanvasStripItemVisible = false;
let shouldEnsureActiveTerminalStripItemVisible = false;
const pendingTerminalSizeNodes = new Set();
let pendingCanvasListFocus = null;
let isCanvasSwitcherMenuOpen = false;
let lastExportedCanvasDebugPayload = null;
let workspacePreviewRequestId = 0;
let workspacePreviewObjectUrl = null;
let workspaceStateHydrationToken = 0;
let activeCanvasWorkspaceRestoreToken = 0;
let appSessionSaveTimeout = 0;
let isSessionHydrating = false;
let workspaceActionDialogResolve = null;

const workspacePreviewState = {
  folderId: null,
  relativePath: null,
  status: "empty",
  data: null,
  errorMessage: "",
  actionErrorMessage: "",
  viewMode: "auto",
  isEditing: false,
  draftText: "",
  saveErrorMessage: ""
};

const workspaceSelectionState = {
  folderId: null,
  relativePath: null,
  kind: null
};

let workspaceActionDialogState = createWorkspaceActionDialogState();

const workspaceState = {
  importedFolders: [],
  activeFolderId: null,
  isRefreshing: false
};

const panState = {
  pointerId: null,
  startClientX: 0,
  startClientY: 0,
  originX: 0,
  originY: 0,
  hasMoved: false
};

const dragState = {
  pointerId: null,
  nodeRecord: null,
  handleElement: null,
  startClientX: 0,
  startClientY: 0,
  originX: 0,
  originY: 0,
  hasMoved: false
};

const resizeState = {
  pointerId: null,
  nodeRecord: null,
  handleElement: null,
  direction: "",
  startClientX: 0,
  startClientY: 0,
  originX: 0,
  originY: 0,
  originWidth: 0,
  originHeight: 0,
  hasMoved: false
};

const panelResizeState = {
  pointerId: null,
  handleElement: null,
  panelKind: "",
  startClientX: 0,
  originWidth: 0,
  hasMoved: false
};

const listReorderState = {
  kind: null,
  itemId: null,
  sourceIndex: -1,
  targetIndex: -1,
  sourceElement: null,
  targetElement: null,
  isAfterTarget: false,
  moveItem: null
};

const removeTerminalDataListener = window.noteCanvas.onTerminalData(({ terminalId, data }) => {
  const nodeRecord = terminalNodeMap.get(terminalId);

  if (nodeRecord !== undefined) {
    nodeRecord.terminal?.write(data);
  }
});

const removeTerminalExitListener = window.noteCanvas.onTerminalExit(({ terminalId, exitCode, signal }) => {
  const nodeRecord = terminalNodeMap.get(terminalId);

  if (nodeRecord === undefined) {
    return;
  }

  setNodeExitedState(nodeRecord, exitCode, signal);
  renderCanvasSwitcher();
});

const removeTerminalCwdChangeListener = window.noteCanvas.onTerminalCwdChange(({ terminalId, cwd }) => {
  const nodeRecord = terminalNodeMap.get(terminalId);

  if (nodeRecord === undefined || typeof cwd !== "string" || cwd.length === 0) {
    return;
  }

  nodeRecord.cwd = cwd;
  scheduleAppSessionSave();
});

const removeWorkspaceDirectoryDataListener = window.noteCanvas.onWorkspaceDirectoryData((snapshot) => {
  applyWorkspaceState(snapshot);
});

const removeToggleActiveTerminalMaximizeListener = window.noteCanvas.onToggleActiveTerminalMaximize(() => {
  if (activeNodeRecord === null || activeNodeRecord.isRemoved || activeNodeRecord.canvas.id !== activeCanvasId) {
    return;
  }

  setNodeMaximized(activeNodeRecord, !activeNodeRecord.isMaximized);
});

function isElement(value) {
  return value instanceof Element;
}

function getCanvasById(canvasId) {
  return canvasMap.get(canvasId) ?? null;
}

function getDefaultTerminalTitle(nodeRecord) {
  return `Terminal ${nodeRecord.id}`;
}

function normalizeTerminalTitle(value, fallbackTitle) {
  if (typeof value !== "string") {
    return fallbackTitle;
  }

  const trimmedValue = value.trim().slice(0, MAX_TERMINAL_TITLE_LENGTH);
  return trimmedValue.length > 0 ? trimmedValue : fallbackTitle;
}

function normalizeCanvasName(value, fallbackName, excludedCanvasId = null) {
  if (typeof value !== "string") {
    return getUniqueCanvasName(fallbackName, excludedCanvasId);
  }

  const trimmedValue = value.trim().slice(0, MAX_CANVAS_NAME_LENGTH);
  const baseName = trimmedValue.length > 0 ? trimmedValue : fallbackName;
  return getUniqueCanvasName(baseName, excludedCanvasId);
}

function clampNodeDimension(value, minimum, fallback) {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(minimum, Math.round(value));
}

function getNormalizedNodeSize(width, height) {
  return {
    width: clampNodeDimension(width, MIN_NODE_WIDTH, DEFAULT_NODE_WIDTH),
    height: clampNodeDimension(height, MIN_NODE_HEIGHT, DEFAULT_NODE_HEIGHT)
  };
}

function setBoardZoomIndicatorText(scale) {
  if (!(boardZoomIndicator instanceof HTMLElement)) {
    return;
  }

  boardZoomIndicator.textContent = `${Math.round((Number.isFinite(scale) ? scale : 1) * 100)}%`;
}

function showBoardZoomIndicator(scale) {
  if (!(boardZoomIndicator instanceof HTMLElement)) {
    return;
  }

  setBoardZoomIndicatorText(scale);
  boardZoomIndicator.classList.add("is-visible");

  if (zoomIndicatorTimeout !== 0) {
    window.clearTimeout(zoomIndicatorTimeout);
  }

  zoomIndicatorTimeout = window.setTimeout(() => {
    zoomIndicatorTimeout = 0;
    boardZoomIndicator.classList.remove("is-visible");
  }, ZOOM_INDICATOR_VISIBLE_MS);
}

function applyNodeSize(nodeRecord, width, height) {
  const nextSize = getNormalizedNodeSize(width, height);
  nodeRecord.width = nextSize.width;
  nodeRecord.height = nextSize.height;

  if (!nodeRecord.isMaximized) {
    nodeRecord.element.style.width = `${nodeRecord.width}px`;
    nodeRecord.element.style.height = `${nodeRecord.height}px`;
  }
}

function getVisibleMaximizedNode() {
  const activeCanvas = getActiveCanvas();

  if (activeCanvas === null) {
    return null;
  }

  return activeCanvas.nodes.find((nodeRecord) => nodeRecord.isMaximized) ?? null;
}

function applyCanvasFocusMode() {
  const visibleMaximizedNode = getVisibleMaximizedNode();

  appShell?.classList.toggle("has-maximized-node", visibleMaximizedNode !== null);
  board.classList.toggle("has-maximized-node", visibleMaximizedNode !== null);

  if (boardFullscreenExitButton instanceof HTMLButtonElement) {
    const exitLabel = visibleMaximizedNode === null
      ? "Exit terminal fullscreen"
      : `Exit fullscreen for ${visibleMaximizedNode.titleText}`;
    boardFullscreenExitButton.setAttribute("aria-label", exitLabel);
    boardFullscreenExitButton.title = exitLabel;
  }

  const activeCanvas = getActiveCanvas();

  if (activeCanvas === null) {
    return;
  }

  activeCanvas.nodes.forEach((nodeRecord) => {
    nodeRecord.element?.classList.toggle(
      "is-muted-by-maximized-node",
      visibleMaximizedNode !== null && nodeRecord !== visibleMaximizedNode
    );
  });
}

function updateNodeTitleInput(nodeRecord) {
  if (!(nodeRecord.titleInput instanceof HTMLInputElement)) {
    return;
  }

  nodeRecord.titleInput.value = nodeRecord.titleText;
  nodeRecord.titleInput.title = nodeRecord.titleText;
}

function commitNodeTitle(nodeRecord, rawTitle) {
  const nextTitle = normalizeTerminalTitle(rawTitle, getDefaultTerminalTitle(nodeRecord));
  nodeRecord.titleText = nextTitle;
  updateNodeTitleInput(nodeRecord);
  syncMaximizeButton(nodeRecord);
  renderTerminalStrip();
  scheduleAppSessionSave();
}

function cancelNodeTitleEditing(nodeRecord) {
  if (activeTitleEditorRecord === nodeRecord) {
    activeTitleEditorRecord = null;
  }

  updateNodeTitleInput(nodeRecord);
}

function syncMaximizeButton(nodeRecord) {
  if (!(nodeRecord.maximizeButton instanceof HTMLButtonElement)) {
    return;
  }

  const isMaximized = nodeRecord.isMaximized;
  nodeRecord.maximizeButton.textContent = isMaximized ? "❐" : "□";
  nodeRecord.maximizeButton.title = isMaximized ? "Restore terminal" : "Maximize terminal";
  nodeRecord.maximizeButton.setAttribute(
    "aria-label",
    isMaximized ? `Restore ${nodeRecord.titleText}` : `Maximize ${nodeRecord.titleText}`
  );
  nodeRecord.maximizeButton.setAttribute("aria-pressed", String(isMaximized));
}

function setNodeMaximized(nodeRecord, shouldMaximize, options = {}) {
  const shouldSelect = options.shouldSelect !== false;
  resetPointerInteractions();

  if (shouldMaximize) {
    nodeRecord.canvas.nodes.forEach((candidateRecord) => {
      if (candidateRecord !== nodeRecord && candidateRecord.isMaximized) {
        candidateRecord.isMaximized = false;
        candidateRecord.element?.classList.remove("is-maximized");
        syncMaximizeButton(candidateRecord);
      }
    });

    if (shouldSelect && shouldSelectTerminal({ reason: "maximize" })) {
      setActiveNode(nodeRecord);
    }
    nodeRecord.isMaximized = true;
    nodeRecord.element?.classList.add("is-maximized");
  } else {
    nodeRecord.isMaximized = false;
    nodeRecord.element?.classList.remove("is-maximized");
  }

  positionNode(nodeRecord);
  syncMaximizeButton(nodeRecord);
  applyCanvasFocusMode();
  requestAnimationFrame(() => {
    nodeRecord.syncSize();

    if (!nodeRecord.isExited && nodeRecord.canvas.id === activeCanvasId) {
      nodeRecord.terminal?.focus();
    }
  });

  scheduleAppSessionSave();
}

function updateExitedOverlay(nodeRecord) {
  if (!(nodeRecord.overlayTitle instanceof HTMLElement) || !(nodeRecord.overlayMeta instanceof HTMLElement)) {
    return;
  }

  if (nodeRecord.isExited) {
    const { exitCode, exitSignal } = nodeRecord;
    const exitLabel = typeof exitCode === "number"
      ? `Exit ${exitCode}${exitSignal ? ` · ${exitSignal}` : ""}`
      : exitSignal
        ? `Signal ${exitSignal}`
        : "Shell ended";

    nodeRecord.overlayTitle.textContent = "Shell exited";
    nodeRecord.overlayMeta.textContent = `${exitLabel} · Reopen shell to continue here.`;
    nodeRecord.overlay.hidden = false;
  } else {
    nodeRecord.overlay.hidden = true;
  }
}

function setNodeExitedState(nodeRecord, exitCode, signal) {
  nodeRecord.isExited = true;
  nodeRecord.exitCode = typeof exitCode === "number" ? exitCode : null;
  nodeRecord.exitSignal = typeof signal === "string" ? signal : null;
  nodeRecord.resizeObserver?.disconnect();
  nodeRecord.resizeObserver = null;
  nodeRecord.syncSize = () => {};
  nodeRecord.status.textContent = "Exited";
  nodeRecord.meta.textContent = nodeRecord.exitCode === 0
    ? "Shell finished"
    : nodeRecord.exitCode !== null
      ? `Exit ${nodeRecord.exitCode}${nodeRecord.exitSignal ? ` · ${nodeRecord.exitSignal}` : ""}`
      : nodeRecord.exitSignal !== null
        ? `Signal ${nodeRecord.exitSignal}`
        : "Shell ended";
  nodeRecord.element.classList.add("is-exited");
  nodeRecord.disposeInput();
  nodeRecord.terminal?.blur?.();
  nodeRecord.terminal?.write(`\r\n[process exited${typeof exitCode === "number" ? ` with code ${exitCode}` : ""}]\r\n`);
  updateExitedOverlay(nodeRecord);
  scheduleAppSessionSave();
}

function setNodeLiveState(nodeRecord, shellName) {
  nodeRecord.isExited = false;
  nodeRecord.exitCode = null;
  nodeRecord.exitSignal = null;
  nodeRecord.shellName = shellName;
  nodeRecord.status.textContent = "Live";
  nodeRecord.meta.textContent = "";
  nodeRecord.element.classList.remove("is-exited");
  updateExitedOverlay(nodeRecord);
  scheduleAppSessionSave();
}

async function releaseTerminalSession(nodeRecord, options = {}) {
  const shouldDestroySession = options.shouldDestroySession !== false;
  const preserveSession = options.preserveSession === true;
  const terminalId = nodeRecord.terminalId;

  nodeRecord.disposeInput();
  nodeRecord.disposeInput = () => {};
  nodeRecord.resizeObserver?.disconnect();
  nodeRecord.resizeObserver = null;
  nodeRecord.syncSize = () => {};

  if (shouldDestroySession && typeof terminalId === "string") {
    await window.noteCanvas.destroyTerminal(terminalId, { preserveSession });
  }

  if (typeof terminalId === "string") {
    terminalNodeMap.delete(terminalId);
  }

  nodeRecord.terminalId = null;
  nodeRecord.terminal?.dispose();
  nodeRecord.terminal = null;
  nodeRecord.fitAddon = null;
  nodeRecord.terminalMount?.replaceChildren();
}

async function bindTerminalSession(nodeRecord, options = {}) {
  const shouldFocus = options.shouldFocus !== false;

  if (typeof TerminalConstructor !== "function" || typeof FitAddonConstructor !== "function") {
    throw new Error("Terminal renderer assets failed to load.");
  }

  const terminalId = crypto.randomUUID();
  const terminalTheme = getTerminalTheme();
  const terminal = new TerminalConstructor({
    cursorBlink: true,
    convertEol: true,
    fontFamily: terminalTheme.fontFamily,
    fontSize: terminalTheme.fontSize,
    scrollback: 1200,
    theme: terminalTheme.theme
  });
  const fitAddon = new FitAddonConstructor();

  terminal.loadAddon(fitAddon);
  terminal.open(nodeRecord.terminalMount);
  terminal.attachCustomWheelEventHandler((event) => {
    return shouldTerminalHandleWheel({
      terminalNodeElement: nodeRecord.element,
      activeNodeElement: activeNodeRecord?.element ?? null
    });
  });
  fitAddon.fit();

  nodeRecord.terminalId = terminalId;
  nodeRecord.terminal = terminal;
  nodeRecord.fitAddon = fitAddon;
  terminalNodeMap.set(terminalId, nodeRecord);

  const initialCols = Math.max(terminal.cols, 20);
  const initialRows = Math.max(terminal.rows, 8);
  let resizeFrame = 0;

  try {
    const created = await window.noteCanvas.createTerminal({
      terminalId,
      cols: initialCols,
      rows: initialRows,
      cwd: nodeRecord.cwd,
      sessionKey: nodeRecord.sessionKey
    });

    if (nodeRecord.isRemoved) {
      await releaseTerminalSession(nodeRecord);
      return;
    }

    setNodeLiveState(nodeRecord, created.shellName);
    nodeRecord.cwd = typeof created.cwd === "string" && created.cwd.length > 0 ? created.cwd : nodeRecord.cwd;

    const dataDisposable = terminal.onData((data) => {
      void window.noteCanvas.writeTerminal(terminalId, data);
    });

    nodeRecord.disposeInput = () => {
      dataDisposable.dispose();
    };

    const syncSize = () => {
      if (isWindowUnloading || nodeRecord.isRemoved || nodeRecord.canvas.id !== activeCanvasId) {
        return;
      }

      if (resizeFrame !== 0) {
        cancelAnimationFrame(resizeFrame);
      }

      resizeFrame = requestAnimationFrame(() => {
        if (isWindowUnloading || nodeRecord.isRemoved || nodeRecord.terminal === null) {
          return;
        }

        fitAddon.fit();
        void window.noteCanvas.resizeTerminal(terminalId, Math.max(terminal.cols, 20), Math.max(terminal.rows, 8));
      });
    };

    const resizeObserver = new ResizeObserver(() => {
      syncSize();
    });

    resizeObserver.observe(nodeRecord.surface);

    nodeRecord.resizeObserver = resizeObserver;
    nodeRecord.syncSize = syncSize;

    syncSize();

    if (shouldFocus && nodeRecord.canvas.id === activeCanvasId && !nodeRecord.isExited) {
      terminal.focus();
    }
  } catch (error) {
    await releaseTerminalSession(nodeRecord, { shouldDestroySession: false });
    throw error;
  }
}

async function reopenTerminalNode(nodeRecord) {
  if (nodeRecord.isRemoved) {
    return;
  }

  nodeRecord.status.textContent = "Reopening";
  nodeRecord.meta.textContent = "Starting fresh shell";
  nodeRecord.overlay.hidden = true;

  try {
    await releaseTerminalSession(nodeRecord);
    await bindTerminalSession(nodeRecord);
  } catch (error) {
    setNodeExitedState(nodeRecord, null, null);
    nodeRecord.status.textContent = "Restart failed";
    nodeRecord.meta.textContent = "Could not reopen shell";
    console.error(error);
  }
}

function getUniqueCanvasName(baseName, excludedCanvasId = null) {
  const trimmedBaseName = typeof baseName === "string" && baseName.trim().length > 0
    ? baseName.trim()
    : `Canvas ${canvasCount + 1}`;
  let candidateName = trimmedBaseName;
  let suffix = 2;

  while (canvases.some((canvasRecord) => canvasRecord.id !== excludedCanvasId && canvasRecord.name === candidateName)) {
    candidateName = `${trimmedBaseName} (${suffix})`;
    suffix += 1;
  }

  return candidateName;
}

function beginCanvasRename(canvasId) {
  if (getCanvasById(canvasId) === null) {
    return;
  }

  if (activeCanvasRenameId === canvasId) {
    const activeRenameInput = canvasSwitcherMenu?.querySelector(`[data-canvas-id="${canvasId}"][data-canvas-part="rename-input"]`);

    if (activeRenameInput instanceof HTMLInputElement) {
      activeRenameInput.focus();
      activeRenameInput.select();
      return;
    }
  }

  if (activeCanvasRenameId !== null && activeCanvasRenameId !== canvasId) {
    const activeRenameInput = canvasSwitcherMenu?.querySelector(`[data-canvas-id="${activeCanvasRenameId}"][data-canvas-part="rename-input"]`);

    if (activeRenameInput instanceof HTMLInputElement) {
      commitCanvasRename(activeCanvasRenameId, activeRenameInput.value);
    } else {
      cancelCanvasRename(activeCanvasRenameId);
    }
  }

  activeCanvasRenameId = canvasId;
  isCanvasSwitcherMenuOpen = true;
  pendingCanvasListFocus = {
    canvasId,
    part: "rename-input",
    selectText: true
  };
  renderCanvasSwitcher();
}

function commitCanvasRename(canvasId, rawName, options = {}) {
  const canvasRecord = getCanvasById(canvasId);

  if (canvasRecord !== null) {
    canvasRecord.name = normalizeCanvasName(rawName, canvasRecord.name, canvasId);
  }

  if (activeCanvasRenameId === canvasId) {
    activeCanvasRenameId = null;
  }

  if (options.restoreFocus === true) {
    pendingCanvasListFocus = {
      canvasId,
      part: "switch"
    };
  }

  renderCanvasSwitcher();
  scheduleAppSessionSave();
}

function cancelCanvasRename(canvasId, options = {}) {
  if (activeCanvasRenameId === canvasId) {
    activeCanvasRenameId = null;
  }

  if (options.restoreFocus === true) {
    pendingCanvasListFocus = {
      canvasId,
      part: "switch"
    };
  }

  renderCanvasSwitcher();
}

function focusPendingCanvasListControl() {
  if (!(canvasSwitcherMenu instanceof HTMLElement) || pendingCanvasListFocus === null) {
    return;
  }

  const { canvasId, part, selectText } = pendingCanvasListFocus;
  pendingCanvasListFocus = null;
  const selector = `[data-canvas-id="${canvasId}"][data-canvas-part="${part}"]`;
  const target = canvasSwitcherMenu.querySelector(selector);

  if (!(target instanceof HTMLElement)) {
    return;
  }

  target.focus();

  if (selectText && target instanceof HTMLInputElement) {
    target.select();
  }
}

function getActiveCanvas() {
  return activeCanvasId === null ? null : getCanvasById(activeCanvasId);
}

function moveArrayItemLocal(items, fromIndex, toIndex) {
  const sourceIndex = Math.max(0, Math.min(items.length - 1, Math.trunc(fromIndex)));
  const targetIndex = Math.max(0, Math.min(items.length - 1, Math.trunc(toIndex)));
  const nextItems = [...items];
  const [movedItem] = nextItems.splice(sourceIndex, 1);
  nextItems.splice(targetIndex, 0, movedItem);
  return nextItems;
}

function clearListReorderState() {
  listReorderState.sourceElement?.classList.remove("is-dragging");
  listReorderState.targetElement?.classList.remove("is-drop-before", "is-drop-after");
  listReorderState.kind = null;
  listReorderState.itemId = null;
  listReorderState.sourceIndex = -1;
  listReorderState.targetIndex = -1;
  listReorderState.sourceElement = null;
  listReorderState.targetElement = null;
  listReorderState.isAfterTarget = false;
  listReorderState.moveItem = null;
}

function updateListReorderTarget(targetElement, targetIndex, isAfterTarget) {
  if (listReorderState.targetElement !== null && listReorderState.targetElement !== targetElement) {
    listReorderState.targetElement.classList.remove("is-drop-before", "is-drop-after");
  }

  listReorderState.targetElement = targetElement;
  listReorderState.targetIndex = targetIndex;
  listReorderState.isAfterTarget = isAfterTarget;

  if (targetElement instanceof HTMLElement) {
    targetElement.classList.toggle("is-drop-before", !isAfterTarget);
    targetElement.classList.toggle("is-drop-after", isAfterTarget);
  }
}

function attachReorderableListItem(item, handleElement, options) {
  if (!(item instanceof HTMLElement) || !(handleElement instanceof HTMLElement)) {
    return;
  }

  handleElement.draggable = true;

  handleElement.addEventListener("dragstart", (event) => {
    if (options.kind === "canvas" && activeCanvasRenameId !== null) {
      event.preventDefault();
      return;
    }

    listReorderState.kind = options.kind;
    listReorderState.itemId = options.itemId;
    listReorderState.sourceIndex = options.index;
    listReorderState.targetIndex = options.index;
    listReorderState.sourceElement = item;
    listReorderState.moveItem = options.onMove;
    item.classList.add("is-dragging");

    if (event.dataTransfer != null) {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", `${options.kind}:${options.itemId}`);
    }
  });

  handleElement.addEventListener("dragend", () => {
    clearListReorderState();
  });

  item.addEventListener("dragover", (event) => {
    if (listReorderState.kind !== options.kind || listReorderState.itemId === null) {
      return;
    }

    event.preventDefault();

    if (event.dataTransfer != null) {
      event.dataTransfer.dropEffect = "move";
    }

    const itemRect = item.getBoundingClientRect();
    const isAfterTarget = (event.clientY - itemRect.top) > (itemRect.height / 2);
    const rawTargetIndex = options.index + (isAfterTarget ? 1 : 0);
    const adjustedTargetIndex = rawTargetIndex > listReorderState.sourceIndex
      ? rawTargetIndex - 1
      : rawTargetIndex;

    updateListReorderTarget(item, adjustedTargetIndex, isAfterTarget);
  });

  item.addEventListener("drop", (event) => {
    if (listReorderState.kind !== options.kind || typeof listReorderState.moveItem !== "function") {
      return;
    }

    event.preventDefault();
    const sourceId = listReorderState.itemId;
    const sourceIndex = listReorderState.sourceIndex;
    const targetIndex = listReorderState.targetIndex;
    const moveItem = listReorderState.moveItem;
    clearListReorderState();

    if (typeof sourceId !== "string" || targetIndex < 0 || sourceIndex === targetIndex) {
      return;
    }

    void moveItem(sourceId, targetIndex).catch((error) => {
      console.error(error);
    });
  });
}

function reorderCanvasById(canvasId, targetIndex) {
  const sourceIndex = canvases.findIndex((canvasRecord) => canvasRecord.id === canvasId);

  if (sourceIndex < 0 || sourceIndex === targetIndex) {
    return;
  }

  const reorderedCanvases = moveArrayItemLocal(canvases, sourceIndex, targetIndex);
  canvases.splice(0, canvases.length, ...reorderedCanvases);
  renderCanvasSwitcher();
  scheduleAppSessionSave();
}

function getBoardPoint(event) {
  const boardRect = board.getBoundingClientRect();

  return {
    x: event.clientX - boardRect.left,
    y: event.clientY - boardRect.top
  };
}

function isBoardBackgroundTarget(target) {
  return isElement(target) && (target === board || target === nodesLayer);
}

function normalizeWheelDelta(event) {
  if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) {
    return {
      x: event.deltaX * WHEEL_LINE_DELTA_PX,
      y: event.deltaY * WHEEL_LINE_DELTA_PX
    };
  }

  if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
    return {
      x: event.deltaX * board.clientWidth,
      y: event.deltaY * board.clientHeight
    };
  }

  return {
    x: event.deltaX,
    y: event.deltaY
  };
}

function clampCanvasScale(value) {
  if (!Number.isFinite(value)) {
    return 1;
  }

  return Math.min(CANVAS_SCALE_MAX, Math.max(CANVAS_SCALE_MIN, value));
}

function roundCanvasScale(value) {
  return Math.round(clampCanvasScale(value) * CANVAS_SCALE_PRECISION) / CANVAS_SCALE_PRECISION;
}

function setActiveCanvasViewport(nextX, nextY, nextScale) {
  const activeCanvas = getActiveCanvas();

  if (activeCanvas === null) {
    return false;
  }

  const resolvedScale = roundCanvasScale(
    Number.isFinite(nextScale)
      ? nextScale
      : activeCanvas.viewportScale
  );

  if (
    activeCanvas.viewportOffset.x === nextX
    && activeCanvas.viewportOffset.y === nextY
    && activeCanvas.viewportScale === resolvedScale
  ) {
    return false;
  }

  activeCanvas.viewportOffset.x = nextX;
  activeCanvas.viewportOffset.y = nextY;
  activeCanvas.viewportScale = resolvedScale;
  requestViewportRender();
  scheduleAppSessionSave();
  return true;
}

function setActiveCanvasViewportOffset(nextX, nextY) {
  return setActiveCanvasViewport(nextX, nextY);
}

function centerViewportOnNode(nodeRecord) {
  const activeCanvas = getActiveCanvas();

  if (activeCanvas === null || nodeRecord?.canvas !== activeCanvas) {
    return false;
  }

  const nextOffset = getViewportOffsetToCenterNode({
    nodeX: nodeRecord.x,
    nodeY: nodeRecord.y,
    nodeWidth: nodeRecord.width,
    nodeHeight: nodeRecord.height,
    viewportScale: activeCanvas.viewportScale,
    viewportWidth: board.clientWidth,
    viewportHeight: board.clientHeight
  });

  return setActiveCanvasViewportOffset(nextOffset.x, nextOffset.y);
}

function panActiveCanvasBy(deltaX, deltaY) {
  const activeCanvas = getActiveCanvas();

  if (activeCanvas === null || (deltaX === 0 && deltaY === 0)) {
    return false;
  }

  return setActiveCanvasViewportOffset(activeCanvas.viewportOffset.x + deltaX, activeCanvas.viewportOffset.y + deltaY);
}

function zoomActiveCanvasAtPoint(point, wheelDelta) {
  const activeCanvas = getActiveCanvas();

  if (activeCanvas === null || !Number.isFinite(point?.x) || !Number.isFinite(point?.y) || !Number.isFinite(wheelDelta)) {
    return false;
  }

  const currentScale = activeCanvas.viewportScale;
  const nextScale = roundCanvasScale(currentScale * Math.exp(-wheelDelta * CANVAS_SCALE_STEP));

  if (nextScale === currentScale) {
    return false;
  }

  const worldX = (point.x - activeCanvas.viewportOffset.x) / currentScale;
  const worldY = (point.y - activeCanvas.viewportOffset.y) / currentScale;
  const nextOffsetX = point.x - worldX * nextScale;
  const nextOffsetY = point.y - worldY * nextScale;

  const didZoom = setActiveCanvasViewport(nextOffsetX, nextOffsetY, nextScale);

  if (didZoom) {
    showBoardZoomIndicator(nextScale);
  }

  return didZoom;
}

function isViewportZoomModifierPressed(event) {
  return event.metaKey || event.ctrlKey;
}

function updateSidebarToggleButton() {
  if (!(sidebarToggleButton instanceof HTMLButtonElement)) {
    return;
  }

  const actionLabel = isSidebarCollapsed ? "Open drawer" : "Close drawer";

  sidebarToggleButton.setAttribute("aria-label", `${actionLabel} with Command+B`);
  sidebarToggleButton.setAttribute("aria-pressed", String(!isSidebarCollapsed));
}

function persistAppSession() {
  if (isSessionHydrating) {
    return;
  }

  try {
    window.noteCanvas.saveAppSession(serializeAppSession());
  } catch (error) {
    console.error(error);
  }
}

function captureActiveCanvasWorkspaceSnapshot() {
  const activeCanvas = getActiveCanvas();

  if (activeCanvas === null) {
    return null;
  }

  return syncCanvasWorkspaceFromLiveState(activeCanvas, serializeCanvasWorkspaceSession());
}

function scheduleAppSessionSave() {
  if (isSessionHydrating) {
    return;
  }

  if (appSessionSaveTimeout !== 0) {
    window.clearTimeout(appSessionSaveTimeout);
  }

  appSessionSaveTimeout = window.setTimeout(() => {
    appSessionSaveTimeout = 0;
    persistAppSession();
  }, APP_SESSION_SAVE_DEBOUNCE_MS);
}

function flushAppSessionSave() {
  if (appSessionSaveTimeout !== 0) {
    window.clearTimeout(appSessionSaveTimeout);
    appSessionSaveTimeout = 0;
  }

  persistAppSession();
}

function setSidebarCollapsed(nextValue) {
  isSidebarCollapsed = nextValue;
  appShell?.classList.toggle("is-sidebar-collapsed", isSidebarCollapsed);

  if (isSidebarCollapsed) {
    closeCanvasSwitcherMenu();
  }

  updateSidebarToggleButton();
  scheduleAppSessionSave();
}

function toggleSidebar() {
  setSidebarCollapsed(!isSidebarCollapsed);
}

function setCanvasSwitcherMenuOpen(nextValue, options = {}) {
  isCanvasSwitcherMenuOpen = nextValue === true;
  const shouldShowMenu = isCanvasSwitcherMenuOpen || activeCanvasRenameId !== null;

  if (canvasSwitcherButton instanceof HTMLButtonElement) {
    canvasSwitcherButton.setAttribute("aria-expanded", String(shouldShowMenu));
    canvasSwitcherButton.classList.toggle("is-open", shouldShowMenu);
  }

  if (canvasSwitcherMenu instanceof HTMLElement) {
    canvasSwitcherMenu.hidden = !shouldShowMenu;
  }

  if (options.restoreFocus === true) {
    canvasSwitcherButton?.focus();
  }
}

function closeCanvasSwitcherMenu(options = {}) {
  setCanvasSwitcherMenuOpen(false, options);
}

function toggleCanvasSwitcherMenu() {
  setCanvasSwitcherMenuOpen(!isCanvasSwitcherMenuOpen);
}

function syncCanvasStripOverflowControls() {
  canvasStripOverflowSyncFrame = 0;

  if (
    !(canvasStripList instanceof HTMLElement)
    || !(canvasStripPrevButton instanceof HTMLButtonElement)
    || !(canvasStripNextButton instanceof HTMLButtonElement)
  ) {
    shouldEnsureActiveCanvasStripItemVisible = false;
    return;
  }

  if (shouldEnsureActiveCanvasStripItemVisible) {
    const activeStripItem = canvasStripList.querySelector(`[data-canvas-id="${activeCanvasId}"]`);

    if (activeStripItem instanceof HTMLElement) {
      activeStripItem.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }

  shouldEnsureActiveCanvasStripItemVisible = false;

  const overflowState = deriveCanvasStripOverflowState({
    scrollLeft: canvasStripList.scrollLeft,
    clientWidth: canvasStripList.clientWidth,
    scrollWidth: canvasStripList.scrollWidth
  });

  canvasStripPrevButton.hidden = !overflowState.hasOverflow;
  canvasStripNextButton.hidden = !overflowState.hasOverflow;
  canvasStripPrevButton.disabled = !overflowState.canScrollBackward;
  canvasStripNextButton.disabled = !overflowState.canScrollForward;
}

function scheduleCanvasStripOverflowControlsSync(options = {}) {
  if (options.ensureActiveVisible === true) {
    shouldEnsureActiveCanvasStripItemVisible = true;
  }

  if (canvasStripOverflowSyncFrame !== 0) {
    return;
  }

  canvasStripOverflowSyncFrame = requestAnimationFrame(() => {
    syncCanvasStripOverflowControls();
  });
}

function scrollCanvasStrip(direction) {
  if (!(canvasStripList instanceof HTMLElement)) {
    return;
  }

  const stripItems = Array.from(canvasStripList.querySelectorAll(".canvas-strip-item"));
  const itemOffsets = stripItems.map((item) => ({
    start: item.offsetLeft,
    end: item.offsetLeft + item.offsetWidth
  }));
  const targetIndex = getStripOverflowTargetIndex({
    itemOffsets,
    scrollLeft: canvasStripList.scrollLeft,
    clientWidth: canvasStripList.clientWidth,
    direction
  });

  if (targetIndex >= 0) {
    stripItems[targetIndex]?.scrollIntoView({
      block: "nearest",
      inline: direction === "backward" ? "start" : "end"
    });
    scheduleCanvasStripOverflowControlsSync();
    return;
  }

  const nextScrollLeft = getStripScrollTarget({
    scrollLeft: canvasStripList.scrollLeft,
    clientWidth: canvasStripList.clientWidth,
    scrollWidth: canvasStripList.scrollWidth,
    direction
  });

  canvasStripList.scrollLeft = nextScrollLeft;
  scheduleCanvasStripOverflowControlsSync();
}

function getCanvasSwitcherViewModel() {
  return deriveCanvasSwitcherViewModel({
    canvases,
    activeCanvasId,
    activeCanvasRenameId,
    isExpanded: isCanvasSwitcherMenuOpen
  });
}

function getTerminalStripViewModel() {
  return deriveTerminalStripViewModel({
    activeCanvas: getActiveCanvas(),
    activeNodeId: activeNodeRecord?.id ?? null
  });
}

function getActiveCanvasNodeById(nodeId) {
  const activeCanvas = getActiveCanvas();

  if (activeCanvas === null || typeof nodeId !== "string") {
    return null;
  }

  return activeCanvas.nodes.find((candidate) => String(candidate.id) === nodeId) ?? null;
}

function syncTerminalStripOverflowControls() {
  terminalStripOverflowSyncFrame = 0;

  if (
    !(terminalStripList instanceof HTMLElement)
    || !(terminalStripPrevButton instanceof HTMLButtonElement)
    || !(terminalStripNextButton instanceof HTMLButtonElement)
  ) {
    shouldEnsureActiveTerminalStripItemVisible = false;
    return;
  }

  if (shouldEnsureActiveTerminalStripItemVisible) {
    const activeStripItem = terminalStripList.querySelector(`[data-node-id="${activeNodeRecord?.id ?? ""}"]`);

    if (activeStripItem instanceof HTMLElement) {
      activeStripItem.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }

  shouldEnsureActiveTerminalStripItemVisible = false;

  const overflowState = deriveCanvasStripOverflowState({
    scrollLeft: terminalStripList.scrollLeft,
    clientWidth: terminalStripList.clientWidth,
    scrollWidth: terminalStripList.scrollWidth
  });

  terminalStripPrevButton.hidden = !overflowState.hasOverflow;
  terminalStripNextButton.hidden = !overflowState.hasOverflow;
  terminalStripPrevButton.disabled = !overflowState.canScrollBackward;
  terminalStripNextButton.disabled = !overflowState.canScrollForward;
}

function scheduleTerminalStripOverflowControlsSync(options = {}) {
  if (options.ensureActiveVisible === true) {
    shouldEnsureActiveTerminalStripItemVisible = true;
  }

  if (terminalStripOverflowSyncFrame !== 0) {
    return;
  }

  terminalStripOverflowSyncFrame = requestAnimationFrame(() => {
    syncTerminalStripOverflowControls();
  });
}

function scrollTerminalStrip(direction) {
  if (!(terminalStripList instanceof HTMLElement)) {
    return;
  }

  const stripItems = Array.from(terminalStripList.querySelectorAll(".terminal-strip-item:not(.is-empty-state)"));
  const itemOffsets = stripItems.map((item) => ({
    start: item.offsetLeft,
    end: item.offsetLeft + item.offsetWidth
  }));
  const targetIndex = getStripOverflowTargetIndex({
    itemOffsets,
    scrollLeft: terminalStripList.scrollLeft,
    clientWidth: terminalStripList.clientWidth,
    direction
  });

  if (targetIndex >= 0) {
    stripItems[targetIndex]?.scrollIntoView({
      block: "nearest",
      inline: direction === "backward" ? "start" : "end"
    });
    scheduleTerminalStripOverflowControlsSync();
    return;
  }

  const nextScrollLeft = getStripScrollTarget({
    scrollLeft: terminalStripList.scrollLeft,
    clientWidth: terminalStripList.clientWidth,
    scrollWidth: terminalStripList.scrollWidth,
    direction
  });

  terminalStripList.scrollLeft = nextScrollLeft;
  scheduleTerminalStripOverflowControlsSync();
}

function createTerminalStripItem(itemView) {
  const stripItem = document.createElement("button");
  stripItem.type = "button";
  stripItem.className = "terminal-strip-item";
  stripItem.textContent = itemView.label;
  stripItem.dataset.nodeId = itemView.id;

  if (itemView.isActive) {
    stripItem.classList.add("is-active");
  }

  if (itemView.isEmptyState) {
    stripItem.disabled = true;
    stripItem.classList.add("is-empty-state");
    return stripItem;
  }

  const activateNodeFromStrip = (clickCount) => {
    const nodeRecord = getActiveCanvasNodeById(itemView.id);

    if (nodeRecord === null) {
      return;
    }

    const activation = deriveTerminalStripActivation({
      isFullscreenMode: getVisibleMaximizedNode() !== null,
      clickCount
    });

    setActiveNode(nodeRecord);

    if (activation.shouldCenterViewport) {
      centerViewportOnNode(nodeRecord);
    }

    if (activation.shouldMaximize) {
      setNodeMaximized(nodeRecord, true);
    }

    if (activation.shouldFocus) {
      nodeRecord.terminal?.focus();
    }
  };

  stripItem.addEventListener("click", (event) => {
    activateNodeFromStrip(event.detail);
  });

  stripItem.addEventListener("dblclick", (event) => {
    event.preventDefault();
    event.stopPropagation();
    activateNodeFromStrip(2);
  });

  return stripItem;
}

function renderTerminalStrip() {
  if (!(terminalStripList instanceof HTMLElement)) {
    return;
  }

  const viewModel = getTerminalStripViewModel();
  terminalStripList.setAttribute("aria-label", viewModel.label);
  terminalStripList.replaceChildren(...viewModel.items.map((itemView) => createTerminalStripItem(itemView)));
  terminalStripSection?.classList.toggle("is-empty", viewModel.isEmpty);
  scheduleTerminalStripOverflowControlsSync({ ensureActiveVisible: true });
}

function openWorkspaceDrawer() {
  setSidebarCollapsed(false);
  document.getElementById("workspace-browser-section")?.scrollIntoView({ block: "nearest" });
}

function setBoardIntroDismissed(nextValue) {
  hasDismissedBoardIntro = nextValue === true;
  appShell?.classList.toggle("has-dismissed-board-intro", hasDismissedBoardIntro);
  scheduleAppSessionSave();
}

function dismissBoardIntro() {
  if (hasDismissedBoardIntro) {
    return;
  }

  setBoardIntroDismissed(true);
}

function getTerminalTheme() {
  const styles = getComputedStyle(document.documentElement);
  const readVar = (name, fallback = "") => {
    const value = styles.getPropertyValue(name).trim();
    return value.length > 0 ? value : fallback;
  };

  return {
    fontFamily: readVar("--font-mono", '"SFMono-Regular", Menlo, Monaco, Consolas, monospace'),
    fontSize: Number.parseFloat(readVar("--terminal-font-size", "13")) || 13,
    theme: {
      background: readVar("--color-terminal-surface-top", "#121212"),
      foreground: readVar("--color-terminal-ink", "#f5f5f4"),
      cursor: readVar("--color-terminal-ink", "#f5f5f4"),
      black: "#1c1917",
      red: "#f87171",
      green: "#4ade80",
      yellow: "#facc15",
      blue: "#60a5fa",
      magenta: "#c084fc",
      cyan: "#22d3ee",
      white: "#f5f5f4",
      brightBlack: "#57534e",
      brightRed: "#fca5a5",
      brightGreen: "#86efac",
      brightYellow: "#fde68a",
      brightBlue: "#93c5fd",
      brightMagenta: "#d8b4fe",
      brightCyan: "#67e8f9",
      brightWhite: "#ffffff"
    }
  };
}

function createCanvasRecord(options = {}) {
  canvasCount += 1;

  const requestedName = typeof options.name === "string" ? options.name : `Canvas ${canvasCount}`;
  const requestedId = typeof options.id === "string" && options.id.trim().length > 0 ? options.id : crypto.randomUUID();
  const viewportOffset = options.viewportOffset ?? { x: 0, y: 0 };
  const viewportScale = roundCanvasScale(options.viewportScale ?? 1);
  const safeViewportX = Number.isFinite(viewportOffset.x) ? viewportOffset.x : 0;
  const safeViewportY = Number.isFinite(viewportOffset.y) ? viewportOffset.y : 0;

  const canvasRecord = {
    id: canvasMap.has(requestedId) ? crypto.randomUUID() : requestedId,
    name: getUniqueCanvasName(requestedName),
    viewportOffset: {
      x: safeViewportX,
      y: safeViewportY
    },
    viewportScale,
    workspace: normalizeCanvasWorkspaceRecord(options.workspace),
    highestNodeLayer: 2,
    nodes: []
  };

  canvases.push(canvasRecord);
  canvasMap.set(canvasRecord.id, canvasRecord);
  scheduleAppSessionSave();
  return canvasRecord;
}

function toWorldPoint(position) {
  const activeCanvas = getActiveCanvas();

  if (activeCanvas === null) {
    return position;
  }

  return {
    x: (position.x - activeCanvas.viewportOffset.x) / activeCanvas.viewportScale,
    y: (position.y - activeCanvas.viewportOffset.y) / activeCanvas.viewportScale
  };
}

function positionNode(nodeRecord) {
  if (nodeRecord.isMaximized) {
    nodeRecord.element.style.left = "";
    nodeRecord.element.style.top = "";
    nodeRecord.element.style.width = "";
    nodeRecord.element.style.height = "";
    return;
  }

  const { viewportOffset, viewportScale } = nodeRecord.canvas;
  nodeRecord.element.style.left = `${viewportOffset.x + (nodeRecord.x * viewportScale)}px`;
  nodeRecord.element.style.top = `${viewportOffset.y + (nodeRecord.y * viewportScale)}px`;
  nodeRecord.element.style.width = `${nodeRecord.width}px`;
  nodeRecord.element.style.height = `${nodeRecord.height}px`;
}

function bringNodeToFront(nodeRecord) {
  nodeRecord.canvas.highestNodeLayer += 1;
  nodeRecord.element.style.zIndex = String(nodeRecord.canvas.highestNodeLayer);
}

function setActiveNode(nodeRecord) {
  if (nodeRecord === null) {
    activeNodeRecord?.element.classList.remove("is-active");
    activeNodeRecord = null;
    renderTerminalStrip();
    window.noteCanvas.setActiveTerminalShortcutState(false);
    syncAllTerminalInteractionOverlays();
    return;
  }

  if (activeNodeRecord === nodeRecord) {
    bringNodeToFront(nodeRecord);
    renderTerminalStrip();
    window.noteCanvas.setActiveTerminalShortcutState(true);
    syncAllTerminalInteractionOverlays();
    return;
  }

  activeNodeRecord?.element.classList.remove("is-active");
  activeNodeRecord = nodeRecord;
  activeNodeRecord.element.classList.add("is-active");
  bringNodeToFront(activeNodeRecord);
  renderTerminalStrip();
  window.noteCanvas.setActiveTerminalShortcutState(true);
  syncAllTerminalInteractionOverlays();
}

function syncTerminalInteractionOverlay(nodeRecord) {
  if (!(nodeRecord?.interactionOverlay instanceof HTMLElement)) {
    return;
  }

  nodeRecord.interactionOverlay.classList.toggle(
    "is-enabled",
    shouldEnableTerminalInteractionOverlay({
      terminalNodeElement: nodeRecord.element,
      activeNodeElement: activeNodeRecord?.element ?? null
    })
  );
}

function syncAllTerminalInteractionOverlays() {
  canvases.forEach((canvasRecord) => {
    canvasRecord.nodes.forEach((nodeRecord) => {
      syncTerminalInteractionOverlay(nodeRecord);
    });
  });
}

function updateEmptyState() {
  const activeCanvas = getActiveCanvas();
  const shouldShowEmptyCanvasOnboarding = shouldShowBoardHintsForCanvas(activeCanvas);
  emptyState.hidden = !shouldShowEmptyCanvasOnboarding;

  if (boardHints instanceof HTMLElement) {
    boardHints.hidden = !shouldShowEmptyCanvasOnboarding;
  }
}

function scheduleTerminalSizeSync(nodeRecords) {
  nodeRecords.forEach((nodeRecord) => {
    pendingTerminalSizeNodes.add(nodeRecord);
  });

  if (terminalSizeSyncFrame !== 0) {
    return;
  }

  terminalSizeSyncFrame = requestAnimationFrame(() => {
    terminalSizeSyncFrame = 0;
    const activeCanvas = getActiveCanvas();
    const nodesToSync = [...pendingTerminalSizeNodes];

    pendingTerminalSizeNodes.clear();

    nodesToSync.forEach((nodeRecord) => {
      if (activeCanvas !== null && nodeRecord.canvas.id === activeCanvas.id && !nodeRecord.element.hidden) {
        nodeRecord.syncSize();
      }
    });
  });
}

function setNodeCanvasVisibility(nodeRecord, shouldShow) {
  if (!(nodeRecord.element instanceof HTMLElement)) {
    return false;
  }

  let didChange = false;

  if (shouldShow && nodeRecord.element.parentNode !== nodesLayer) {
    nodesLayer.append(nodeRecord.element);
    didChange = true;
  }

  if (nodeRecord.element.hidden === !shouldShow) {
    return didChange;
  }

  nodeRecord.element.hidden = !shouldShow;
  return true;
}

function syncMountedCanvasNodes(activeCanvas) {
  let didChange = false;

  canvases.forEach((canvasRecord) => {
    const shouldShowCanvas = canvasRecord.id === activeCanvas?.id;

    canvasRecord.nodes.forEach((nodeRecord) => {
      didChange = setNodeCanvasVisibility(nodeRecord, shouldShowCanvas) || didChange;
    });
  });

  renderedCanvasId = activeCanvas?.id ?? null;

  return didChange;
}

function flushViewportRender() {
  if (viewportRenderFrame === 0) {
    return;
  }

  cancelAnimationFrame(viewportRenderFrame);
  viewportRenderFrame = 0;
  renderCanvas();
}

function requestViewportRender() {
  if (viewportRenderFrame !== 0) {
    return;
  }

  viewportRenderFrame = requestAnimationFrame(() => {
    viewportRenderFrame = 0;
    renderCanvas();
  });
}

function renderCanvas(options = {}) {
  const { syncTerminalSizes = false } = options;

  if (viewportRenderFrame !== 0) {
    cancelAnimationFrame(viewportRenderFrame);
    viewportRenderFrame = 0;
  }

  const activeCanvas = getActiveCanvas();

  if (activeCanvas === null) {
    board.style.setProperty("--grid-offset-x", "0px");
    board.style.setProperty("--grid-offset-y", "0px");
    board.style.setProperty("--viewport-scale", "1");
    setBoardZoomIndicatorText(1);
    syncMountedCanvasNodes(null);
    appShell?.classList.remove("has-maximized-node");
    board.classList.remove("has-maximized-node");
    updateEmptyState();
    return;
  }

  board.style.setProperty("--grid-offset-x", `${activeCanvas.viewportOffset.x}px`);
  board.style.setProperty("--grid-offset-y", `${activeCanvas.viewportOffset.y}px`);
  board.style.setProperty("--viewport-scale", String(activeCanvas.viewportScale));
  setBoardZoomIndicatorText(activeCanvas.viewportScale);

  const didChangeMountedNodes = syncMountedCanvasNodes(activeCanvas);
  activeCanvas.nodes.forEach(positionNode);
  applyCanvasFocusMode();
  updateEmptyState();

  if (syncTerminalSizes || didChangeMountedNodes) {
    scheduleTerminalSizeSync(activeCanvas.nodes);
  }
}

function createCanvasSwitcherMenuItem(itemView) {
  const canvasRecord = getCanvasById(itemView.id);

  if (canvasRecord === null) {
    return document.createElement("li");
  }

  const item = document.createElement("li");
  item.className = "canvas-list-item";
  item.classList.toggle("is-active", itemView.isActive);
  const isRenaming = itemView.isRenaming;
  const canvasIndex = canvases.findIndex((candidate) => candidate.id === canvasRecord.id);
  let reorderHandle = null;

  if (isRenaming) {
    const editor = document.createElement("div");
    editor.className = "canvas-list-editor";
    let didCommitFromKeyboard = false;
    let didCancelFromKeyboard = false;

    const nameInput = document.createElement("input");
    nameInput.className = "canvas-list-input";
    nameInput.type = "text";
    nameInput.value = canvasRecord.name;
    nameInput.maxLength = MAX_CANVAS_NAME_LENGTH;
    nameInput.spellcheck = false;
    nameInput.setAttribute("aria-label", `Rename ${canvasRecord.name}`);
    nameInput.dataset.canvasId = canvasRecord.id;
    nameInput.dataset.canvasPart = "rename-input";

    const meta = document.createElement("span");
    meta.className = "canvas-list-meta";
    meta.textContent = itemView.terminalSummary;

    nameInput.addEventListener("blur", () => {
      window.setTimeout(() => {
        if (didCommitFromKeyboard || didCancelFromKeyboard) {
          return;
        }

        if (activeCanvasRenameId !== canvasRecord.id) {
          return;
        }

        commitCanvasRename(canvasRecord.id, nameInput.value);
      }, 0);
    });

    nameInput.addEventListener("keydown", (event) => {
      event.stopPropagation();

      if (event.key === "Enter") {
        event.preventDefault();
        didCommitFromKeyboard = true;
        commitCanvasRename(canvasRecord.id, nameInput.value, { restoreFocus: true });
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        didCancelFromKeyboard = true;
        cancelCanvasRename(canvasRecord.id, { restoreFocus: true });
      }
    });

    editor.append(nameInput, meta);
    item.append(editor);
  } else {
    const switchButton = document.createElement("button");
    switchButton.className = "canvas-list-button";
    switchButton.type = "button";
    switchButton.setAttribute("aria-label", `Open ${canvasRecord.name}`);
    switchButton.dataset.canvasId = canvasRecord.id;
    switchButton.dataset.canvasPart = "switch";

    if (itemView.isActive) {
      switchButton.classList.add("is-active");
      switchButton.setAttribute("aria-current", "true");
    }

    const name = document.createElement("span");
    name.className = "canvas-list-name";
    name.textContent = canvasRecord.name;

    const meta = document.createElement("span");
    meta.className = "canvas-list-meta";
    meta.textContent = itemView.terminalSummary;

    switchButton.append(name, meta);
    switchButton.addEventListener("click", () => {
      setActiveCanvas(canvasRecord.id);
    });
    switchButton.addEventListener("keydown", (event) => {
      if (event.key === "F2") {
        event.preventDefault();
        beginCanvasRename(canvasRecord.id);
      }
    });

    reorderHandle = switchButton;
    item.append(switchButton);
  }

  const actions = document.createElement("div");
  actions.className = "canvas-list-actions";

  if (!isRenaming) {
    const renameButton = document.createElement("button");
    renameButton.className = "canvas-list-action";
    renameButton.type = "button";
    renameButton.setAttribute("aria-label", `Rename ${canvasRecord.name}`);
    renameButton.title = `Rename ${canvasRecord.name}`;
    renameButton.textContent = "✎";
    renameButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      beginCanvasRename(canvasRecord.id);
    });
    actions.append(renameButton);
  }

  if (itemView.canDelete) {
    const deleteButton = document.createElement("button");
    deleteButton.className = "canvas-list-delete";
    deleteButton.type = "button";
    deleteButton.setAttribute("aria-label", `Delete ${canvasRecord.name}`);
    deleteButton.textContent = "×";
    deleteButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      void deleteCanvas(canvasRecord.id);
    });
    actions.append(deleteButton);
  }

  if (actions.childElementCount > 0) {
    item.append(actions);
  }

  if (reorderHandle !== null) {
    attachReorderableListItem(item, reorderHandle, {
      kind: "canvas",
      itemId: canvasRecord.id,
      index: canvasIndex,
      onMove: async (canvasId, targetIndex) => {
        reorderCanvasById(canvasId, targetIndex);
      }
    });
  }

  return item;
}

function createCanvasStripItem(itemView) {
  const canvasRecord = getCanvasById(itemView.id);

  if (canvasRecord === null) {
    return document.createElement("span");
  }

  const stripItem = document.createElement("button");
  stripItem.className = "canvas-strip-item";
  stripItem.type = "button";
  stripItem.textContent = canvasRecord.name;
  stripItem.title = `${canvasRecord.name} • ${itemView.terminalSummary}`;
  stripItem.setAttribute("aria-label", `Open ${canvasRecord.name}`);
  stripItem.dataset.canvasId = canvasRecord.id;
  stripItem.dataset.canvasPart = "strip-switch";

  if (itemView.isActive) {
    stripItem.classList.add("is-active");
    stripItem.setAttribute("aria-current", "true");
  }

  stripItem.addEventListener("click", () => {
    setActiveCanvas(canvasRecord.id);
  });

  return stripItem;
}

function renderCanvasSwitcher() {
  if (
    !(canvasSwitcherButton instanceof HTMLButtonElement)
    || !(canvasSwitcherMenu instanceof HTMLElement)
    || !(canvasSwitcherMenuBody instanceof HTMLElement)
    || !(canvasStripList instanceof HTMLElement)
  ) {
    return;
  }

  const viewModel = getCanvasSwitcherViewModel();
  canvasStripList.setAttribute("aria-label", viewModel.strip.label);

  const stripItems = viewModel.strip.items.map((itemView) => {
    return createCanvasStripItem(itemView);
  });
  canvasStripList.replaceChildren(...stripItems);

  const menuList = document.createElement("ul");
  menuList.className = "canvas-switcher-menu-list canvas-list";
  menuList.id = "canvas-switcher-list";
  menuList.setAttribute("aria-label", viewModel.menu.label);

  viewModel.menu.items.forEach((itemView) => {
    menuList.append(createCanvasSwitcherMenuItem(itemView));
  });

  canvasSwitcherMenuBody.replaceChildren(menuList);
  setCanvasSwitcherMenuOpen(viewModel.menu.isExpanded);
  focusPendingCanvasListControl();
  scheduleCanvasStripOverflowControlsSync({ ensureActiveVisible: true });
  renderTerminalStrip();
}

function getWorkspaceEntryName(relativePath) {
  return relativePath.split("/").at(-1) ?? relativePath;
}

function getWorkspaceEntryParentPath(relativePath) {
  const segments = relativePath.split("/");
  segments.pop();
  return segments.join("/");
}

function compareWorkspaceEntries(leftEntry, rightEntry) {
  if (leftEntry.kind !== rightEntry.kind) {
    return leftEntry.kind === "directory" ? -1 : 1;
  }

  return leftEntry.name.localeCompare(rightEntry.name);
}

function normalizeWorkspaceEntries(entries) {
  if (!Array.isArray(entries)) {
    return [];
  }

  return entries.flatMap((entry) => {
    if (typeof entry?.relativePath !== "string" || entry.relativePath.length === 0) {
      return [];
    }

    return [{
      name: typeof entry.name === "string" ? entry.name : getWorkspaceEntryName(entry.relativePath),
      relativePath: entry.relativePath,
      kind: entry.kind === "directory" ? "directory" : "file"
    }];
  });
}

function normalizeWorkspaceFolders(folders) {
  if (!Array.isArray(folders)) {
    return [];
  }

  return folders.flatMap((folder) => {
    if (typeof folder?.id !== "string" || typeof folder?.rootPath !== "string" || folder.rootPath.length === 0) {
      return [];
    }

    return [{
      id: folder.id,
      rootPath: folder.rootPath,
      rootName: typeof folder.rootName === "string" && folder.rootName.length > 0 ? folder.rootName : folder.rootPath,
      entries: normalizeWorkspaceEntries(folder.entries),
      isTruncated: folder.isTruncated === true,
      lastError: typeof folder.lastError === "string" ? folder.lastError : ""
    }];
  });
}

function getWorkspaceFolderById(folderId) {
  return workspaceState.importedFolders.find((folder) => folder.id === folderId) ?? null;
}

function getActiveWorkspaceFolder() {
  return typeof workspaceState.activeFolderId === "string"
    ? getWorkspaceFolderById(workspaceState.activeFolderId)
    : null;
}

function hasWorkspaceDirectory() {
  return getActiveWorkspaceFolder() !== null;
}

function getWorkspaceDirectoryPaths(folderRecord) {
  if (folderRecord === null) {
    return new Set();
  }

  return new Set(
    folderRecord.entries
      .filter((entry) => entry.kind === "directory")
      .map((entry) => entry.relativePath)
  );
}

function getWorkspaceFilePaths(folderRecord) {
  if (folderRecord === null) {
    return new Set();
  }

  return new Set(
    folderRecord.entries
      .filter((entry) => entry.kind === "file")
      .map((entry) => entry.relativePath)
  );
}

function clearWorkspaceSelection() {
  workspaceSelectionState.folderId = null;
  workspaceSelectionState.relativePath = null;
  workspaceSelectionState.kind = null;
}

function setWorkspaceSelection(folderId, relativePath, kind) {
  workspaceSelectionState.folderId = typeof folderId === "string" ? folderId : null;
  workspaceSelectionState.relativePath = typeof relativePath === "string" ? relativePath : null;
  workspaceSelectionState.kind = kind === "directory" || kind === "file" ? kind : null;
}

function getWorkspaceEntryByRelativePath(folderRecord, relativePath) {
  if (folderRecord === null || typeof relativePath !== "string" || relativePath.length === 0) {
    return null;
  }

  return folderRecord.entries.find((entry) => entry.relativePath === relativePath) ?? null;
}

function syncWorkspaceSelectionWithState() {
  const activeFolder = getActiveWorkspaceFolder();

  if (activeFolder === null) {
    clearWorkspaceSelection();
    return;
  }

  if (
    workspacePreviewState.folderId === activeFolder.id
    && typeof workspacePreviewState.relativePath === "string"
    && getWorkspaceFilePaths(activeFolder).has(workspacePreviewState.relativePath)
  ) {
    setWorkspaceSelection(activeFolder.id, workspacePreviewState.relativePath, "file");
    return;
  }

  if (workspaceSelectionState.folderId !== activeFolder.id) {
    clearWorkspaceSelection();
    return;
  }

  const selectedEntry = getWorkspaceEntryByRelativePath(activeFolder, workspaceSelectionState.relativePath);

  if (selectedEntry === null) {
    clearWorkspaceSelection();
    return;
  }

  workspaceSelectionState.kind = selectedEntry.kind;
}

function getWorkspaceActionContext() {
  const activeFolder = getActiveWorkspaceFolder();
  const selectedEntry = activeFolder === null
    ? null
    : getWorkspaceEntryByRelativePath(activeFolder, workspaceSelectionState.relativePath);
  const parentRelativePath = selectedEntry === null
    ? ""
    : (selectedEntry.kind === "directory"
        ? selectedEntry.relativePath
        : getWorkspaceEntryParentPath(selectedEntry.relativePath));

  return {
    activeFolder,
    selectedEntry,
    parentRelativePath,
    canRename: selectedEntry !== null,
    canDelete: selectedEntry !== null
  };
}

function expandWorkspaceSelectionPath(relativePath, options = {}) {
  const activeCanvas = getActiveCanvas();
  const activeFolder = getActiveWorkspaceFolder();

  if (activeCanvas === null || activeFolder === null || typeof relativePath !== "string") {
    return;
  }

  const expandedDirectories = new Set(getCanvasWorkspaceExpandedDirectories(activeCanvas));
  let currentPath = options.includeSelf === true ? relativePath : getWorkspaceEntryParentPath(relativePath);

  while (currentPath.length > 0) {
    expandedDirectories.add(currentPath);
    currentPath = getWorkspaceEntryParentPath(currentPath);
  }

  syncCanvasWorkspaceFromLiveState(activeCanvas, {
    ...activeCanvas.workspace,
    rootPath: activeFolder.rootPath,
    rootName: activeFolder.rootName,
    expandedDirectoryPaths: [...expandedDirectories],
    previewRelativePath: getCanvasWorkspacePreviewRelativePath(activeCanvas)
  });

  scheduleAppSessionSave();
}

function renderWorkspaceActionDialog() {
  if (
    !(workspaceActionDialog instanceof HTMLElement)
    || !(workspaceActionDialogTitle instanceof HTMLElement)
    || !(workspaceActionDialogMessage instanceof HTMLElement)
    || !(workspaceActionDialogInput instanceof HTMLInputElement)
    || !(workspaceActionDialogCancelButton instanceof HTMLButtonElement)
    || !(workspaceActionDialogConfirmButton instanceof HTMLButtonElement)
  ) {
    return;
  }

  workspaceActionDialog.hidden = workspaceActionDialogState.isOpen !== true;
  workspaceActionDialogTitle.textContent = workspaceActionDialogState.title;
  workspaceActionDialogMessage.textContent = workspaceActionDialogState.message;
  workspaceActionDialogInput.hidden = workspaceActionDialogState.kind !== "prompt";
  workspaceActionDialogInput.value = workspaceActionDialogState.value;
  workspaceActionDialogCancelButton.hidden = workspaceActionDialogState.cancelLabel.length === 0;
  workspaceActionDialogCancelButton.textContent = workspaceActionDialogState.cancelLabel || "Cancel";
  workspaceActionDialogConfirmButton.textContent = workspaceActionDialogState.confirmLabel;
}

function resolveWorkspaceActionDialog(result) {
  const resolve = workspaceActionDialogResolve;
  workspaceActionDialogResolve = null;
  workspaceActionDialogState = closeWorkspaceActionDialog(workspaceActionDialogState);
  renderWorkspaceActionDialog();

  if (typeof resolve === "function") {
    resolve(result);
  }
}

function requestWorkspaceActionDialog(options) {
  if (typeof workspaceActionDialogResolve === "function") {
    workspaceActionDialogResolve(null);
    workspaceActionDialogResolve = null;
  }

  workspaceActionDialogState = openWorkspaceActionDialog(workspaceActionDialogState, options);
  renderWorkspaceActionDialog();

  window.requestAnimationFrame(() => {
    if (workspaceActionDialogState.kind === "prompt") {
      workspaceActionDialogInput?.focus();
      workspaceActionDialogInput?.select();
    } else {
      workspaceActionDialogConfirmButton?.focus();
    }
  });

  return new Promise((resolve) => {
    workspaceActionDialogResolve = resolve;
  });
}

async function promptForWorkspaceEntryName(message, initialValue = "", confirmLabel = "Confirm") {
  const result = await requestWorkspaceActionDialog({
    kind: "prompt",
    title: confirmLabel,
    message,
    confirmLabel,
    cancelLabel: "Cancel",
    initialValue
  });

  return typeof result === "string" ? result : null;
}

async function confirmWorkspaceAction(title, message, confirmLabel) {
  const result = await requestWorkspaceActionDialog({
    kind: "confirm",
    title,
    message,
    confirmLabel,
    cancelLabel: "Cancel"
  });

  return result === true;
}

async function showWorkspaceActionError(error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(error);

  await requestWorkspaceActionDialog({
    kind: "confirm",
    title: "Action failed",
    message,
    confirmLabel: "OK",
    cancelLabel: ""
  });
}

function getExpandedDirectoriesForFolder(folderId) {
  const folderRecord = getWorkspaceFolderById(folderId);
  const activeCanvas = getActiveCanvas();

  if (folderRecord === null || activeCanvas === null || getCanvasWorkspaceRootPath(activeCanvas) !== folderRecord.rootPath) {
    return new Set();
  }

  return new Set(getCanvasWorkspaceExpandedDirectories(activeCanvas));
}

function clearWorkspacePreview(options = {}) {
  workspacePreviewRequestId += 1;
  clearWorkspacePreviewObjectUrl();
  workspacePreviewState.folderId = null;
  workspacePreviewState.relativePath = null;
  workspacePreviewState.status = "empty";
  workspacePreviewState.data = null;
  workspacePreviewState.errorMessage = "";
  workspacePreviewState.actionErrorMessage = "";
  workspacePreviewState.viewMode = "auto";
  workspacePreviewState.isEditing = false;
  workspacePreviewState.draftText = "";
  workspacePreviewState.saveErrorMessage = "";

  if (options.skipCanvasWorkspaceSync !== true) {
    captureActiveCanvasWorkspaceSnapshot();
  }

  if (options.skipSessionSave !== true) {
    scheduleAppSessionSave();
  }
}

function closeWorkspacePreview() {
  clearWorkspacePreview();
  renderWorkspaceBrowser();
  renderFileInspector();
}

function isWorkspacePreviewOpen() {
  return typeof workspacePreviewState.folderId === "string"
    && typeof workspacePreviewState.relativePath === "string"
    && workspacePreviewState.relativePath.length > 0;
}

function clearWorkspacePreviewObjectUrl() {
  if (typeof workspacePreviewObjectUrl === "string" && workspacePreviewObjectUrl.length > 0) {
    URL.revokeObjectURL(workspacePreviewObjectUrl);
  }

  workspacePreviewObjectUrl = null;
}

function decodeBase64ToBytes(base64Value) {
  const binaryString = window.atob(base64Value);
  const bytes = new Uint8Array(binaryString.length);

  for (let index = 0; index < binaryString.length; index += 1) {
    bytes[index] = binaryString.charCodeAt(index);
  }

  return bytes;
}

function getWorkspacePreviewObjectUrl(viewModel) {
  if (viewModel.mode === "svg") {
    clearWorkspacePreviewObjectUrl();
    const blob = new Blob([viewModel.textContents], {
      type: viewModel.mimeType || "image/svg+xml"
    });
    workspacePreviewObjectUrl = URL.createObjectURL(blob);
    return workspacePreviewObjectUrl;
  }

  if ((viewModel.mode !== "image" && viewModel.mode !== "pdf") || viewModel.binaryContentsBase64.length === 0) {
    clearWorkspacePreviewObjectUrl();
    return null;
  }

  if (workspacePreviewObjectUrl !== null) {
    return workspacePreviewObjectUrl;
  }

  const bytes = decodeBase64ToBytes(viewModel.binaryContentsBase64);
  const blob = new Blob([bytes], {
    type: viewModel.mimeType || (viewModel.mode === "pdf" ? "application/pdf" : "application/octet-stream")
  });
  workspacePreviewObjectUrl = URL.createObjectURL(blob);
  return workspacePreviewObjectUrl;
}

function setWorkspacePreviewActionErrorMessage(message) {
  workspacePreviewState.actionErrorMessage = typeof message === "string" ? message : "";
  renderFileInspector();
}

function setScopedWorkspacePreviewActionErrorMessage({ folderId, relativePath, message }) {
  if (!shouldApplyWorkspacePreviewActionError({
    currentFolderId: workspacePreviewState.folderId,
    currentRelativePath: workspacePreviewState.relativePath,
    targetFolderId: folderId,
    targetRelativePath: relativePath
  })) {
    return;
  }

  setWorkspacePreviewActionErrorMessage(message);
}

function setWorkspacePreviewViewMode(viewMode) {
  workspacePreviewState.viewMode = viewMode === "source" ? "source" : "render";
  workspacePreviewState.isEditing = false;
  workspacePreviewState.saveErrorMessage = "";
  renderFileInspector();
}

function startWorkspacePreviewEdit() {
  if (!isWorkspacePreviewOpen() || typeof workspacePreviewState.data?.textContents !== "string") {
    return;
  }

  workspacePreviewState.isEditing = true;
  workspacePreviewState.viewMode = "source";
  workspacePreviewState.draftText = workspacePreviewState.data.textContents;
  workspacePreviewState.saveErrorMessage = "";
  renderFileInspector();
}

function cancelWorkspacePreviewEdit() {
  workspacePreviewState.isEditing = false;
  workspacePreviewState.draftText = typeof workspacePreviewState.data?.textContents === "string"
    ? workspacePreviewState.data.textContents
    : "";
  workspacePreviewState.saveErrorMessage = "";
  renderFileInspector();
}

async function saveWorkspacePreviewText() {
  if (!isWorkspacePreviewOpen() || workspacePreviewState.isEditing !== true) {
    return null;
  }

  const actionFolderId = workspacePreviewState.folderId;
  const actionRelativePath = workspacePreviewState.relativePath;

  try {
    const savedPreview = await window.noteCanvas.saveWorkspaceFile(
      actionFolderId,
      actionRelativePath,
      workspacePreviewState.draftText,
      workspacePreviewState.data?.lastModifiedMs ?? null
    );

    if (workspacePreviewState.folderId !== actionFolderId || workspacePreviewState.relativePath !== actionRelativePath) {
      return null;
    }

    workspacePreviewState.data = savedPreview;
    workspacePreviewState.status = "ready";
    workspacePreviewState.errorMessage = "";
    workspacePreviewState.actionErrorMessage = "";
    workspacePreviewState.isEditing = false;
    workspacePreviewState.draftText = savedPreview.textContents ?? "";
    workspacePreviewState.saveErrorMessage = "";
    renderFileInspector();
    return savedPreview;
  } catch (error) {
    workspacePreviewState.saveErrorMessage = error instanceof Error ? error.message : String(error);
    renderFileInspector();
    return null;
  }
}

function syncAppShellWorkspaceState() {
  appShell?.classList.toggle("has-file-inspector", isWorkspacePreviewOpen());
}

function buildWorkspaceTreeRows(folderRecord) {
  if (folderRecord === null) {
    return [];
  }

  const childrenByParentPath = new Map();
  const expandedDirectories = getExpandedDirectoriesForFolder(folderRecord.id);
  const selectedRelativePath = workspaceSelectionState.folderId === folderRecord.id
    ? workspaceSelectionState.relativePath
    : null;

  folderRecord.entries.forEach((entry) => {
    const parentPath = getWorkspaceEntryParentPath(entry.relativePath);
    const currentChildren = childrenByParentPath.get(parentPath) ?? [];
    currentChildren.push(entry);
    childrenByParentPath.set(parentPath, currentChildren);
  });

  childrenByParentPath.forEach((entries, parentPath) => {
    childrenByParentPath.set(parentPath, entries.sort(compareWorkspaceEntries));
  });

  const rows = [];

  function appendRows(parentPath, depth) {
    const children = childrenByParentPath.get(parentPath) ?? [];

    children.forEach((entry) => {
      const isDirectory = entry.kind === "directory";
      const isExpanded = isDirectory && expandedDirectories.has(entry.relativePath);

      rows.push({
        ...entry,
        depth,
        isExpanded,
        isSelected: selectedRelativePath === entry.relativePath
      });

      if (isExpanded) {
        appendRows(entry.relativePath, depth + 1);
      }
    });
  }

  appendRows("", 0);
  return rows;
}

function renderFileInspector() {
  if (!(fileInspector instanceof HTMLElement)) {
    return;
  }

  syncAppShellWorkspaceState();

  if (!isWorkspacePreviewOpen()) {
    fileInspector.replaceChildren();
    return;
  }

  const previewViewModel = deriveWorkspacePreviewViewModel(workspacePreviewState);

  const fragment = document.createDocumentFragment();
  const header = document.createElement("div");
  header.className = "file-inspector-header";

  const heading = document.createElement("div");
  heading.className = "file-inspector-heading";

  const title = document.createElement("div");
  title.className = "file-inspector-title";
  title.textContent = previewViewModel.fileName || getWorkspaceEntryName(workspacePreviewState.relativePath);
  title.title = title.textContent;

  const pathMeta = document.createElement("div");
  pathMeta.className = "file-inspector-path";
  pathMeta.textContent = workspacePreviewState.relativePath;
  pathMeta.title = workspacePreviewState.relativePath;

  const typeBadge = document.createElement("div");
  typeBadge.className = "file-inspector-type";
  typeBadge.textContent = previewViewModel.typeLabel;

  heading.append(title, pathMeta, typeBadge);

  const actions = document.createElement("div");
  actions.className = "file-inspector-actions";

  if (previewViewModel.canRender && workspacePreviewState.isEditing !== true) {
    const renderButton = document.createElement("button");
    renderButton.className = "canvas-secondary-button file-inspector-button";
    renderButton.type = "button";
    renderButton.textContent = "Render";
    renderButton.classList.toggle("is-active", previewViewModel.viewMode === "render");
    renderButton.disabled = previewViewModel.viewMode === "render";
    renderButton.addEventListener("click", () => {
      setWorkspacePreviewViewMode("render");
    });

    const sourceButton = document.createElement("button");
    sourceButton.className = "canvas-secondary-button file-inspector-button";
    sourceButton.type = "button";
    sourceButton.textContent = "Source";
    sourceButton.classList.toggle("is-active", previewViewModel.viewMode === "source");
    sourceButton.disabled = previewViewModel.viewMode === "source";
    sourceButton.addEventListener("click", () => {
      setWorkspacePreviewViewMode("source");
    });

    actions.append(renderButton, sourceButton);
  }

  if (previewViewModel.canEdit) {
    if (workspacePreviewState.isEditing) {
      const saveButton = document.createElement("button");
      saveButton.className = "canvas-secondary-button file-inspector-button";
      saveButton.type = "button";
      saveButton.textContent = "Save";
      saveButton.addEventListener("click", () => {
        void saveWorkspacePreviewText();
      });

      const cancelButton = document.createElement("button");
      cancelButton.className = "canvas-secondary-button file-inspector-button";
      cancelButton.type = "button";
      cancelButton.textContent = "Cancel";
      cancelButton.addEventListener("click", () => {
        cancelWorkspacePreviewEdit();
      });

      actions.append(saveButton, cancelButton);
    } else {
      const editButton = document.createElement("button");
      editButton.className = "canvas-secondary-button file-inspector-button";
      editButton.type = "button";
      editButton.textContent = "Edit";
      editButton.addEventListener("click", () => {
        startWorkspacePreviewEdit();
      });
      actions.append(editButton);
    }
  }

  const refreshButton = document.createElement("button");
  refreshButton.className = "canvas-secondary-button file-inspector-button";
  refreshButton.type = "button";
  refreshButton.dataset.fileInspectorAction = "refresh";
  refreshButton.textContent = workspacePreviewState.status === "loading" ? "Loading" : "Refresh";
  refreshButton.disabled = workspacePreviewState.status === "loading" || workspacePreviewState.isEditing === true;
  refreshButton.addEventListener("click", () => {
    void refreshSelectedWorkspaceFilePreview();
  });

  const closeButton = document.createElement("button");
  closeButton.className = "canvas-secondary-button file-inspector-button";
  closeButton.type = "button";
  closeButton.dataset.fileInspectorAction = "close";
  closeButton.setAttribute("aria-label", "Close preview with Command+L");
  closeButton.textContent = "Close";
  closeButton.addEventListener("click", () => {
    closeWorkspacePreview();
  });

  actions.append(refreshButton, closeButton);
  header.append(heading, actions);
  fragment.append(header);

  const body = document.createElement("div");
  body.className = "file-inspector-body";

  if (workspacePreviewState.isEditing) {
    const editor = document.createElement("textarea");
    editor.className = "file-inspector-editor";
    editor.value = workspacePreviewState.draftText;
    editor.spellcheck = false;
    editor.addEventListener("input", () => {
      workspacePreviewState.draftText = editor.value;
    });
    body.append(editor);

    if (workspacePreviewState.saveErrorMessage.length > 0) {
      const saveError = document.createElement("div");
      saveError.className = "file-inspector-error";
      saveError.textContent = workspacePreviewState.saveErrorMessage;
      body.append(saveError);
    }
  } else if (previewViewModel.mode === "loading") {
    const loading = document.createElement("div");
    loading.className = "file-inspector-empty";
    loading.textContent = previewViewModel.message;
    body.append(loading);
  } else if (previewViewModel.mode === "error") {
    const error = document.createElement("div");
    error.className = "file-inspector-error";
    error.textContent = previewViewModel.message;
    body.append(error);
  } else if (previewViewModel.mode === "fallback") {
    const fallback = document.createElement("div");
    fallback.className = "file-inspector-fallback";

    const fallbackMessage = document.createElement("div");
    fallbackMessage.className = "file-inspector-empty";
    fallbackMessage.textContent = previewViewModel.message;
    fallback.append(fallbackMessage);

    if (previewViewModel.actionErrorMessage.length > 0) {
      const actionError = document.createElement("div");
      actionError.className = "file-inspector-error";
      actionError.textContent = previewViewModel.actionErrorMessage;
      fallback.append(actionError);
    }

    if (previewViewModel.actions.canOpenExternally || previewViewModel.actions.canRevealInFinder) {
      const fallbackActions = document.createElement("div");
      fallbackActions.className = "file-inspector-fallback-actions";

      if (previewViewModel.actions.canOpenExternally) {
        const openButton = document.createElement("button");
        openButton.className = "canvas-secondary-button file-inspector-button";
        openButton.type = "button";
        openButton.textContent = "Open externally";
        openButton.addEventListener("click", () => {
          const actionFolderId = workspacePreviewState.folderId;
          const actionRelativePath = workspacePreviewState.relativePath;
          setWorkspacePreviewActionErrorMessage("");
          void window.noteCanvas.openWorkspaceFileExternally(actionFolderId, actionRelativePath).catch((error) => {
            setScopedWorkspacePreviewActionErrorMessage({
              folderId: actionFolderId,
              relativePath: actionRelativePath,
              message: error instanceof Error ? error.message : String(error)
            });
          });
        });
        fallbackActions.append(openButton);
      }

      if (previewViewModel.actions.canRevealInFinder) {
        const revealButton = document.createElement("button");
        revealButton.className = "canvas-secondary-button file-inspector-button";
        revealButton.type = "button";
        revealButton.textContent = "Reveal in Finder";
        revealButton.addEventListener("click", () => {
          const actionFolderId = workspacePreviewState.folderId;
          const actionRelativePath = workspacePreviewState.relativePath;
          setWorkspacePreviewActionErrorMessage("");
          void window.noteCanvas.revealWorkspaceFile(actionFolderId, actionRelativePath).catch((error) => {
            setScopedWorkspacePreviewActionErrorMessage({
              folderId: actionFolderId,
              relativePath: actionRelativePath,
              message: error instanceof Error ? error.message : String(error)
            });
          });
        });
        fallbackActions.append(revealButton);
      }

      fallback.append(fallbackActions);
    }

    body.append(fallback);
  } else if (previewViewModel.mode === "image") {
    const image = document.createElement("img");
    image.className = "file-inspector-image";
    image.alt = previewViewModel.fileName;
    image.src = getWorkspacePreviewObjectUrl(previewViewModel) ?? "";
    body.append(image);
  } else if (previewViewModel.mode === "svg") {
    const image = document.createElement("img");
    image.className = "file-inspector-image file-inspector-svg";
    image.alt = previewViewModel.fileName;
    image.src = getWorkspacePreviewObjectUrl(previewViewModel) ?? "";
    body.append(image);
  } else if (previewViewModel.mode === "markdown") {
    const article = document.createElement("article");
    article.className = "file-inspector-markdown";
    article.innerHTML = previewViewModel.renderedContentsHtml;
    body.append(article);
  } else if (previewViewModel.mode === "pdf") {
    const frame = document.createElement("iframe");
    frame.className = "file-inspector-pdf-frame";
    frame.dataset.previewLoaded = "false";
    frame.addEventListener("load", () => {
      frame.dataset.previewLoaded = "true";
    }, { once: true });
    frame.src = getWorkspacePreviewObjectUrl(previewViewModel) ?? "";
    frame.title = `${previewViewModel.fileName} preview`;
    body.append(frame);
  } else {
    const pre = document.createElement("pre");
    pre.className = "file-inspector-content";
    pre.textContent = previewViewModel.textContents;
    body.append(pre);
  }

  fragment.append(body);
  fileInspector.replaceChildren(fragment);
}

async function loadWorkspaceFilePreview(relativePath, options = {}) {
  const activeFolder = getActiveWorkspaceFolder();

  if (activeFolder === null) {
    return null;
  }

  const requestId = ++workspacePreviewRequestId;
  const previewFolderId = activeFolder.id;
  const previewRootPath = activeFolder.rootPath;
  const nextViewMode = options.preserveViewMode === true ? workspacePreviewState.viewMode : "auto";
  clearWorkspacePreviewObjectUrl();
  workspacePreviewState.folderId = previewFolderId;
  workspacePreviewState.relativePath = relativePath;
  workspacePreviewState.status = "loading";
  workspacePreviewState.data = null;
  workspacePreviewState.errorMessage = "";
  workspacePreviewState.actionErrorMessage = "";
  workspacePreviewState.viewMode = nextViewMode;
  workspacePreviewState.isEditing = false;
  workspacePreviewState.draftText = "";
  workspacePreviewState.saveErrorMessage = "";
  setWorkspaceSelection(previewFolderId, relativePath, "file");
  captureActiveCanvasWorkspaceSnapshot();
  renderWorkspaceBrowser();
  renderFileInspector();
  scheduleAppSessionSave();

  try {
    const preview = await window.noteCanvas.readWorkspaceFile(previewFolderId, relativePath);

    if (
      requestId !== workspacePreviewRequestId
      || workspacePreviewState.folderId !== previewFolderId
      || workspacePreviewState.relativePath !== relativePath
      || getWorkspaceFolderById(previewFolderId)?.rootPath !== previewRootPath
    ) {
      return null;
    }

    workspacePreviewState.data = preview;
    workspacePreviewState.status = "ready";
    workspacePreviewState.errorMessage = "";
    workspacePreviewState.actionErrorMessage = "";
    workspacePreviewState.draftText = typeof preview.textContents === "string" ? preview.textContents : "";
    workspacePreviewState.saveErrorMessage = "";
    setWorkspaceSelection(previewFolderId, relativePath, "file");
    captureActiveCanvasWorkspaceSnapshot();
    renderWorkspaceBrowser();
    renderFileInspector();
    scheduleAppSessionSave();
    return preview;
  } catch (error) {
    if (
      requestId !== workspacePreviewRequestId
      || workspacePreviewState.folderId !== previewFolderId
      || workspacePreviewState.relativePath !== relativePath
      || getWorkspaceFolderById(previewFolderId)?.rootPath !== previewRootPath
    ) {
      return null;
    }

    workspacePreviewState.status = "error";
    clearWorkspacePreviewObjectUrl();
    workspacePreviewState.data = null;
    workspacePreviewState.errorMessage = error instanceof Error ? error.message : String(error);
    workspacePreviewState.actionErrorMessage = "";
    workspacePreviewState.draftText = "";
    workspacePreviewState.saveErrorMessage = "";
    captureActiveCanvasWorkspaceSnapshot();
    renderWorkspaceBrowser();
    renderFileInspector();
    scheduleAppSessionSave();
    return null;
  }
}

async function selectWorkspaceFile(relativePath) {
  const activeFolder = getActiveWorkspaceFolder();

  if (!getWorkspaceFilePaths(activeFolder).has(relativePath)) {
    return null;
  }

  return loadWorkspaceFilePreview(relativePath);
}

async function refreshSelectedWorkspaceFilePreview() {
  if (!isWorkspacePreviewOpen()) {
    return null;
  }

  return loadWorkspaceFilePreview(workspacePreviewState.relativePath, { preserveViewMode: true });
}

async function createWorkspaceFileAtSelection() {
  const workspaceActionContext = getWorkspaceActionContext();

  if (workspaceActionContext.activeFolder === null) {
    return null;
  }

  const fileName = await promptForWorkspaceEntryName("Choose a name for the new file.", "untitled.txt", "Create file");

  if (fileName === null) {
    return null;
  }

  const response = await window.noteCanvas.createWorkspaceFile(
    workspaceActionContext.activeFolder.id,
    workspaceActionContext.parentRelativePath,
    fileName
  );

  applyWorkspaceState(response?.state ?? null);
  expandWorkspaceSelectionPath(response?.relativePath ?? "", { includeSelf: false });

  if (typeof response?.relativePath === "string") {
    return selectWorkspaceFile(response.relativePath);
  }

  return null;
}

async function createWorkspaceDirectoryAtSelection() {
  const workspaceActionContext = getWorkspaceActionContext();

  if (workspaceActionContext.activeFolder === null) {
    return null;
  }

  const directoryName = await promptForWorkspaceEntryName("Choose a name for the new folder.", "untitled-folder", "Create folder");

  if (directoryName === null) {
    return null;
  }

  const response = await window.noteCanvas.createWorkspaceDirectory(
    workspaceActionContext.activeFolder.id,
    workspaceActionContext.parentRelativePath,
    directoryName
  );

  applyWorkspaceState(response?.state ?? null);

  if (typeof response?.relativePath === "string") {
    expandWorkspaceSelectionPath(response.relativePath, { includeSelf: true });
    setWorkspaceSelection(workspaceActionContext.activeFolder.id, response.relativePath, "directory");
    renderWorkspaceBrowser();
  }

  return response ?? null;
}

async function renameSelectedWorkspaceEntry() {
  const workspaceActionContext = getWorkspaceActionContext();

  if (workspaceActionContext.activeFolder === null || workspaceActionContext.selectedEntry === null) {
    return null;
  }

  const nextName = await promptForWorkspaceEntryName(
    `Rename ${workspaceActionContext.selectedEntry.relativePath}`,
    getWorkspaceEntryName(workspaceActionContext.selectedEntry.relativePath),
    "Rename"
  );

  if (nextName === null) {
    return null;
  }

  const previousRelativePath = workspaceActionContext.selectedEntry.relativePath;
  const previousPreviewRelativePath = workspacePreviewState.folderId === workspaceActionContext.activeFolder.id
    ? workspacePreviewState.relativePath
    : null;
  const wasPreviewingSelection = workspacePreviewState.folderId === workspaceActionContext.activeFolder.id
    && workspacePreviewState.relativePath === previousRelativePath;
  const response = await window.noteCanvas.renameWorkspaceEntry(
    workspaceActionContext.activeFolder.id,
    previousRelativePath,
    nextName
  );

  applyWorkspaceState(response?.state ?? null);

  if (typeof response?.relativePath === "string") {
    if (workspaceActionContext.selectedEntry.kind === "directory") {
      const renamedPreviewRelativePath = typeof previousPreviewRelativePath === "string"
        && previousPreviewRelativePath.startsWith(`${previousRelativePath}/`)
        ? `${response.relativePath}${previousPreviewRelativePath.slice(previousRelativePath.length)}`
        : null;

      expandWorkspaceSelectionPath(response.relativePath, { includeSelf: true });
      setWorkspaceSelection(workspaceActionContext.activeFolder.id, response.relativePath, "directory");
      if (typeof renamedPreviewRelativePath === "string") {
        await selectWorkspaceFile(renamedPreviewRelativePath);
      } else {
        renderWorkspaceBrowser();
      }
    } else if (wasPreviewingSelection) {
      await selectWorkspaceFile(response.relativePath);
    } else {
      setWorkspaceSelection(workspaceActionContext.activeFolder.id, response.relativePath, "file");
      renderWorkspaceBrowser();
    }
  }

  return response ?? null;
}

async function deleteSelectedWorkspaceEntry() {
  const workspaceActionContext = getWorkspaceActionContext();

  if (workspaceActionContext.activeFolder === null || workspaceActionContext.selectedEntry === null) {
    return null;
  }

  const confirmed = await confirmWorkspaceAction(
    "Delete entry",
    `Delete ${workspaceActionContext.selectedEntry.relativePath}? This cannot be undone.`,
    "Delete"
  );

  if (!confirmed) {
    return null;
  }

  const nextSelectedRelativePath = getWorkspaceEntryParentPath(workspaceActionContext.selectedEntry.relativePath);
  const response = await window.noteCanvas.deleteWorkspaceEntry(
    workspaceActionContext.activeFolder.id,
    workspaceActionContext.selectedEntry.relativePath
  );

  applyWorkspaceState(response?.state ?? null);

  if (nextSelectedRelativePath.length > 0 && getWorkspaceDirectoryPaths(getActiveWorkspaceFolder()).has(nextSelectedRelativePath)) {
    setWorkspaceSelection(workspaceActionContext.activeFolder.id, nextSelectedRelativePath, "directory");
  } else {
    clearWorkspaceSelection();
  }

  renderWorkspaceBrowser();
  return response ?? null;
}

function toggleWorkspaceDirectory(relativePath) {
  const activeFolder = getActiveWorkspaceFolder();
  const activeCanvas = getActiveCanvas();

  if (activeFolder === null || activeCanvas === null) {
    return;
  }

  toggleCanvasWorkspaceExpandedDirectory(activeCanvas, relativePath);

  captureActiveCanvasWorkspaceSnapshot();
  renderWorkspaceBrowser();
  scheduleAppSessionSave();
}

function updateWorkspaceControls() {
  const workspaceActionContext = getWorkspaceActionContext();

  if (openWorkspaceButton instanceof HTMLButtonElement) {
    const actionLabel = hasWorkspaceDirectory() ? "Replace workspace" : "Choose workspace";
    openWorkspaceButton.setAttribute("aria-label", actionLabel);
    openWorkspaceButton.title = actionLabel;
  }

  if (refreshWorkspaceButton instanceof HTMLButtonElement) {
    refreshWorkspaceButton.disabled = !hasWorkspaceDirectory() || workspaceState.isRefreshing;
    refreshWorkspaceButton.classList.toggle("is-loading", workspaceState.isRefreshing);
    refreshWorkspaceButton.setAttribute(
      "aria-label",
      workspaceState.isRefreshing ? "Refreshing workspace" : "Refresh workspace"
    );
    refreshWorkspaceButton.title = workspaceState.isRefreshing ? "Refreshing workspace" : "Refresh workspace";
  }

  if (createWorkspaceFileButton instanceof HTMLButtonElement) {
    createWorkspaceFileButton.disabled = !hasWorkspaceDirectory();
  }

  if (createWorkspaceDirectoryButton instanceof HTMLButtonElement) {
    createWorkspaceDirectoryButton.disabled = !hasWorkspaceDirectory();
  }

  if (renameWorkspaceEntryButton instanceof HTMLButtonElement) {
    renameWorkspaceEntryButton.disabled = !workspaceActionContext.canRename;
  }

  if (deleteWorkspaceEntryButton instanceof HTMLButtonElement) {
    deleteWorkspaceEntryButton.disabled = !workspaceActionContext.canDelete;
  }
}

function createWorkspaceEntryDecoration(entry) {
  const decoration = document.createElement("span");
  decoration.className = "workspace-browser-entry-decoration";
  decoration.setAttribute("aria-hidden", "true");

  const disclosure = document.createElement("span");
  disclosure.className = "workspace-browser-entry-disclosure";

  if (entry.kind === "directory") {
    disclosure.classList.toggle("is-expanded", entry.isExpanded);
    disclosure.innerHTML = '<svg class="workspace-browser-entry-disclosure-icon" viewBox="0 0 16 16"><path d="M6 3.75 10.75 8 6 12.25"></path></svg>';
  } else {
    disclosure.classList.add("is-placeholder");
  }

  const icon = document.createElement("span");
  icon.className = `workspace-browser-entry-icon is-${entry.kind}`;

  if (entry.kind === "directory") {
    icon.innerHTML = entry.isExpanded
      ? '<svg class="workspace-browser-entry-icon-svg" viewBox="0 0 16 16"><path d="M1.75 5.25h4l1.35-1.5h6.15c.55 0 1 .45 1 1v1"></path><path d="M1.75 5.25h12.5c.55 0 1 .45 1 1v5c0 .55-.45 1-1 1H2.75c-.55 0-1-.45-1-1v-6c0-.55.45-1 1-1Z"></path></svg>'
      : '<svg class="workspace-browser-entry-icon-svg" viewBox="0 0 16 16"><path d="M1.75 4.75h4l1.35-1.5h6.15c.55 0 1 .45 1 1v1"></path><path d="M1.75 5.25h12.5c.55 0 1 .45 1 1v5c0 .55-.45 1-1 1H2.75c-.55 0-1-.45-1-1v-6c0-.55.45-1 1-1Z"></path></svg>';
  } else {
    icon.innerHTML = '<svg class="workspace-browser-entry-icon-svg" viewBox="0 0 16 16"><path d="M4 2.75h5.25L12.5 6v7.25c0 .55-.45 1-1 1H4c-.55 0-1-.45-1-1v-9.5c0-.55.45-1 1-1Z"></path><path d="M9.25 2.75V6h3.25"></path></svg>';
  }

  decoration.append(disclosure, icon);
  return decoration;
}

function renderWorkspaceBrowser() {
  if (!(workspaceBrowser instanceof HTMLElement)) {
    return;
  }

  updateWorkspaceControls();
  const existingEntryList = workspaceBrowser.querySelector(".workspace-browser-list");
  const preservedScrollTop = existingEntryList instanceof HTMLElement ? existingEntryList.scrollTop : 0;
  const preservedRootPath = existingEntryList instanceof HTMLElement ? existingEntryList.dataset.workspaceRootPath ?? null : null;
  const fragment = document.createDocumentFragment();
  const activeFolder = getActiveWorkspaceFolder();

  if (activeFolder !== null) {
    const summary = document.createElement("div");
    summary.className = "workspace-browser-summary";

    const name = document.createElement("div");
    name.className = "workspace-browser-name";
    name.textContent = activeFolder.rootName;

    const currentPath = document.createElement("div");
    currentPath.className = "workspace-browser-path";
    currentPath.textContent = activeFolder.rootPath;
    currentPath.title = activeFolder.rootPath;

    const meta = document.createElement("div");
    meta.className = "workspace-browser-meta";
    meta.textContent = `${activeFolder.entries.length} ${activeFolder.entries.length === 1 ? "entry" : "entries"}`;

    summary.append(name, currentPath, meta);
    fragment.append(summary);

    if (activeFolder.lastError.length > 0) {
      const error = document.createElement("div");
      error.className = "workspace-browser-error";
      error.textContent = activeFolder.lastError;
      fragment.append(error);
    } else if (activeFolder.entries.length > 0) {
      const entryList = document.createElement("ul");
      entryList.className = "workspace-browser-list";
      entryList.dataset.workspaceRootPath = activeFolder.rootPath;

      buildWorkspaceTreeRows(activeFolder).forEach((entry) => {
        const item = document.createElement("li");
        item.className = "workspace-browser-row";

        const button = document.createElement("button");
        button.className = `workspace-browser-entry is-${entry.kind}`;
        button.type = "button";
        button.dataset.workspacePath = entry.relativePath;
        button.dataset.workspaceKind = entry.kind;
        button.style.setProperty("--workspace-entry-depth", String(entry.depth));
        button.title = entry.relativePath;
        button.setAttribute("aria-label", entry.kind === "directory" ? `${entry.isExpanded ? "Collapse" : "Expand"} ${entry.relativePath}` : `Preview ${entry.relativePath}`);
        button.classList.toggle("is-selected", entry.isSelected);

        const decoration = createWorkspaceEntryDecoration(entry);

        const label = document.createElement("span");
        label.className = "workspace-browser-entry-label";
        label.textContent = entry.name;

        button.append(decoration, label);

        if (entry.kind === "directory") {
          button.setAttribute("aria-expanded", entry.isExpanded ? "true" : "false");
          button.addEventListener("click", () => {
            setWorkspaceSelection(activeFolder.id, entry.relativePath, "directory");
            toggleWorkspaceDirectory(entry.relativePath);
          });
        } else {
          button.addEventListener("click", () => {
            setWorkspaceSelection(activeFolder.id, entry.relativePath, "file");
            void selectWorkspaceFile(entry.relativePath);
          });
        }

        item.append(button);
        entryList.append(item);
      });

      fragment.append(entryList);
    } else {
      const empty = document.createElement("div");
      empty.className = "workspace-browser-empty";
      empty.textContent = "This folder is empty.";
      fragment.append(empty);
    }

    if (activeFolder.isTruncated) {
      const truncated = document.createElement("div");
      truncated.className = "workspace-browser-truncated";
      truncated.textContent = "Listing trimmed to keep the sidebar responsive.";
      fragment.append(truncated);
    }
  } else {
    const empty = document.createElement("div");
    empty.className = "workspace-browser-empty";
    empty.textContent = "Choose a workspace for this canvas to browse files here and make new terminals start there.";
    fragment.append(empty);
  }

  workspaceBrowser.replaceChildren(fragment);

  const nextEntryList = workspaceBrowser.querySelector(".workspace-browser-list");

  if (
    nextEntryList instanceof HTMLElement
    && preservedRootPath === (activeFolder?.rootPath ?? null)
    && preservedScrollTop > 0
  ) {
    nextEntryList.scrollTop = preservedScrollTop;
  }
}

function applyWorkspaceState(nextState, options = {}) {
  workspaceStateHydrationToken += 1;
  const previousActiveFolderId = workspaceState.activeFolderId;
  const activeCanvas = getActiveCanvas();
  workspaceState.importedFolders = normalizeWorkspaceFolders(nextState?.importedFolders);
  workspaceState.activeFolderId = typeof nextState?.activeFolderId === "string" ? nextState.activeFolderId : null;

  if (workspaceState.activeFolderId !== null && getWorkspaceFolderById(workspaceState.activeFolderId) === null) {
    workspaceState.activeFolderId = workspaceState.importedFolders[0]?.id ?? null;
  }

  if (activeCanvas !== null) {
    const activeRootPath = getCanvasWorkspaceRootPath(activeCanvas);
    const activeFolder = workspaceState.importedFolders.find((folderRecord) => folderRecord.rootPath === activeRootPath) ?? null;

    if (activeFolder !== null) {
      const validDirectoryPaths = getWorkspaceDirectoryPaths(activeFolder);
      const expandedDirectoryPaths = getCanvasWorkspaceExpandedDirectories(activeCanvas).filter((directoryPath) => {
        return validDirectoryPaths.has(directoryPath);
      });

      syncCanvasWorkspaceFromLiveState(activeCanvas, {
        ...activeCanvas.workspace,
        rootPath: activeFolder.rootPath,
        rootName: activeFolder.rootName,
        expandedDirectoryPaths,
        previewRelativePath: getCanvasWorkspacePreviewRelativePath(activeCanvas)
      });
    }
  }

  if (previousActiveFolderId !== workspaceState.activeFolderId) {
    clearWorkspacePreview({
      skipCanvasWorkspaceSync: options.skipCanvasWorkspaceSync,
      skipSessionSave: options.skipCanvasWorkspaceSync
    });
  }

  const previewFolder = workspacePreviewState.folderId === null ? null : getWorkspaceFolderById(workspacePreviewState.folderId);

  if (
    previewFolder === null
    || !getWorkspaceFilePaths(previewFolder).has(workspacePreviewState.relativePath)
  ) {
    clearWorkspacePreview({
      skipCanvasWorkspaceSync: options.skipCanvasWorkspaceSync,
      skipSessionSave: options.skipCanvasWorkspaceSync
    });
  }

  syncWorkspaceSelectionWithState();

  renderWorkspaceBrowser();
  renderFileInspector();

  if (options.skipCanvasWorkspaceSync !== true) {
    captureActiveCanvasWorkspaceSnapshot();
  }

  scheduleAppSessionSave();
}

async function refreshWorkspaceDirectory(options = {}) {
  if (!hasWorkspaceDirectory() || workspaceState.isRefreshing) {
    return null;
  }

  workspaceState.isRefreshing = true;
  updateWorkspaceControls();

  try {
    const nextState = await window.noteCanvas.refreshWorkspaceDirectory();

    if (nextState === null) {
      return null;
    }

    applyWorkspaceState(nextState);
    return nextState;
  } catch (error) {
    if (options.silent !== true) {
      console.error(error);
    }

    return null;
  } finally {
    workspaceState.isRefreshing = false;
    updateWorkspaceControls();
  }
}

async function chooseCanvasWorkspace() {
  const opened = await window.noteCanvas.chooseCanvasWorkspace();

  if (opened?.canceled) {
    return null;
  }

  if (opened?.state == null) {
    throw new Error("Workspace folder contents were unavailable.");
  }

  applyWorkspaceState(opened.state);
  openWorkspaceDrawer();
  return opened.state;
}

async function activateWorkspaceFolderById(folderId) {
  const nextState = await window.noteCanvas.activateWorkspaceFolder(folderId);
  applyWorkspaceState(nextState);
  openWorkspaceDrawer();
  return nextState;
}

async function reorderWorkspaceFolderById(folderId, targetIndex) {
  const nextState = await window.noteCanvas.reorderWorkspaceFolder(folderId, targetIndex);
  applyWorkspaceState(nextState);
  return nextState;
}

async function removeWorkspaceFolderById(folderId) {
  const nextState = await window.noteCanvas.removeWorkspaceFolder(folderId);
  applyWorkspaceState(nextState);
  return nextState;
}

function getDefaultTerminalWorkingDirectory() {
  return getCanvasWorkspaceRootPath(getActiveCanvas());
}

function sanitizeCanvasExportName(canvasName) {
  const fallbackName = "termcanvas-canvas";
  const normalizedName = typeof canvasName === "string" && canvasName.trim().length > 0 ? canvasName.trim() : fallbackName;
  const safeName = normalizedName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return safeName.length > 0 ? safeName : fallbackName;
}

function serializeCanvasRecord(canvasRecord) {
  return {
    version: CANVAS_EXPORT_VERSION,
    app: window.noteCanvas.appName,
    exportedAt: new Date().toISOString(),
    canvas: {
      name: canvasRecord.name,
      viewportOffset: {
        x: canvasRecord.viewportOffset.x,
        y: canvasRecord.viewportOffset.y
      },
      viewportScale: canvasRecord.viewportScale,
      terminalNodes: canvasRecord.nodes.map((nodeRecord) => ({
        x: nodeRecord.x,
        y: nodeRecord.y,
        width: nodeRecord.width,
        height: nodeRecord.height,
        cwd: nodeRecord.cwd,
        shellName: nodeRecord.shellName,
        title: nodeRecord.titleText,
        isMaximized: nodeRecord.isMaximized
      }))
    }
  };
}

function serializeCanvasSessionRecord(canvasRecord) {
  const exportedCanvas = serializeCanvasRecord(canvasRecord).canvas;

  return {
    id: canvasRecord.id,
    name: exportedCanvas.name,
    viewportOffset: exportedCanvas.viewportOffset,
    viewportScale: exportedCanvas.viewportScale,
    workspace: canvasRecord.workspace ?? null,
    terminalNodes: canvasRecord.nodes.map((nodeRecord, index) => ({
      ...exportedCanvas.terminalNodes[index],
      sessionKey: nodeRecord.sessionKey,
      isExited: nodeRecord.isExited,
      exitCode: nodeRecord.exitCode,
      exitSignal: nodeRecord.exitSignal
    }))
  };
}

function serializeCanvasWorkspaceSession() {
  const activeFolder = getActiveWorkspaceFolder();

  if (activeFolder === null) {
    return null;
  }

  return {
    rootPath: activeFolder.rootPath,
    rootName: activeFolder.rootName,
    expandedDirectoryPaths: getCanvasWorkspaceExpandedDirectories(getActiveCanvas()),
    previewRelativePath: isWorkspacePreviewOpen() && workspacePreviewState.folderId === activeFolder.id
      ? workspacePreviewState.relativePath
      : null
  };
}

function getWorkspaceRestorePayloadFromCanvasSnapshot(workspaceSnapshot) {
  if (workspaceSnapshot === null || typeof workspaceSnapshot?.rootPath !== "string") {
    return {
      importedRootPaths: [],
      activeRootPath: null,
      expandedDirectoriesByRootPath: [],
      preview: null
    };
  }

  return {
    importedRootPaths: [workspaceSnapshot.rootPath],
    activeRootPath: workspaceSnapshot.rootPath,
    expandedDirectoriesByRootPath: Array.isArray(workspaceSnapshot.expandedDirectoryPaths)
      && workspaceSnapshot.expandedDirectoryPaths.length > 0
      ? [{
          rootPath: workspaceSnapshot.rootPath,
          directoryPaths: workspaceSnapshot.expandedDirectoryPaths
        }]
      : [],
    preview: typeof workspaceSnapshot.previewRelativePath === "string" && workspaceSnapshot.previewRelativePath.length > 0
      ? {
          rootPath: workspaceSnapshot.rootPath,
          relativePath: workspaceSnapshot.previewRelativePath
        }
      : null
  };
}

function serializeAppSession() {
  return {
    version: APP_SESSION_VERSION,
    ui: {
      isSidebarCollapsed,
      hasDismissedBoardIntro
    },
    canvases: canvases.map(serializeCanvasSessionRecord),
    activeCanvasId
  };
}

function restoreExpandedWorkspaceDirectories(workspaceSnapshot) {
  const activeCanvas = getActiveCanvas();

  if (activeCanvas === null) {
    return;
  }

  const expandedDirectoriesByRootPath = new Map(
    Array.isArray(workspaceSnapshot?.expandedDirectoriesByRootPath)
      ? workspaceSnapshot.expandedDirectoriesByRootPath.map((entry) => [entry.rootPath, entry.directoryPaths])
      : []
  );

  const activeFolder = getActiveWorkspaceFolder();

  if (activeFolder === null) {
    syncCanvasWorkspaceFromLiveState(activeCanvas, null);
    return;
  }

  const validDirectoryPaths = getWorkspaceDirectoryPaths(activeFolder);
  const expandedDirectoryPaths = (expandedDirectoriesByRootPath.get(activeFolder.rootPath) ?? []).filter((directoryPath) => {
    return validDirectoryPaths.has(directoryPath);
  });

  syncCanvasWorkspaceFromLiveState(activeCanvas, {
    ...activeCanvas.workspace,
    rootPath: activeFolder.rootPath,
    rootName: activeFolder.rootName,
    expandedDirectoryPaths,
    previewRelativePath: getCanvasWorkspacePreviewRelativePath(activeCanvas)
  });
}

function expandWorkspacePreviewAncestors(folderRecord, relativePath) {
  let parentPath = getWorkspaceEntryParentPath(relativePath);
  const activeCanvas = getActiveCanvas();

  if (activeCanvas === null) {
    return;
  }

  const expandedDirectories = new Set(getCanvasWorkspaceExpandedDirectories(activeCanvas));

  while (parentPath.length > 0) {
    expandedDirectories.add(parentPath);
    parentPath = getWorkspaceEntryParentPath(parentPath);
  }

  syncCanvasWorkspaceFromLiveState(activeCanvas, {
    ...activeCanvas.workspace,
    rootPath: folderRecord.rootPath,
    rootName: folderRecord.rootName,
    expandedDirectoryPaths: [...expandedDirectories],
    previewRelativePath: getCanvasWorkspacePreviewRelativePath(activeCanvas)
  });
}

async function restoreWorkspacePreview(workspaceSnapshot) {
  const preview = workspaceSnapshot?.preview;
  const activeFolder = getActiveWorkspaceFolder();

  if (
    activeFolder === null
    || typeof preview?.rootPath !== "string"
    || activeFolder.rootPath !== preview.rootPath
    || typeof preview.relativePath !== "string"
    || !getWorkspaceFilePaths(activeFolder).has(preview.relativePath)
  ) {
    clearWorkspacePreview();
    renderWorkspaceBrowser();
    renderFileInspector();
    return;
  }

  expandWorkspacePreviewAncestors(activeFolder, preview.relativePath);
  renderWorkspaceBrowser();
  await loadWorkspaceFilePreview(preview.relativePath);
}

async function restoreCanvasWorkspace(canvasRecord) {
  const restoreToken = ++activeCanvasWorkspaceRestoreToken;
  const workspaceSnapshot = getWorkspaceRestorePayloadFromCanvasSnapshot(canvasRecord?.workspace ?? null);
  const nextWorkspaceState = await window.noteCanvas.restoreWorkspaceSession(workspaceSnapshot);

  if (!shouldApplyCanvasWorkspaceRestoreResult({
    restoreToken,
    activeRestoreToken: activeCanvasWorkspaceRestoreToken,
    activeCanvasId: getActiveCanvas()?.id ?? null,
    targetCanvasId: canvasRecord?.id ?? null
  })) {
    return;
  }

  applyWorkspaceState(nextWorkspaceState, { skipCanvasWorkspaceSync: true });
  syncCanvasWorkspaceFromLiveState(canvasRecord, deriveCanvasWorkspaceAfterRestore(canvasRecord, nextWorkspaceState));
  renderWorkspaceBrowser();

  if (canvasRecord.workspace?.previewRelativePath) {
    await loadWorkspaceFilePreview(canvasRecord.workspace.previewRelativePath);
  } else {
    clearWorkspacePreview({ skipCanvasWorkspaceSync: true });
    renderWorkspaceBrowser();
    renderFileInspector();
  }

  scheduleAppSessionSave();
}

async function restoreCanvasSession(sessionSnapshot) {
  const persistedCanvases = Array.isArray(sessionSnapshot?.canvases) ? sessionSnapshot.canvases : [];

  if (persistedCanvases.length === 0) {
    return;
  }

  persistedCanvases.forEach((canvasSnapshot) => {
    createCanvasRecord({
      id: canvasSnapshot.id,
      name: canvasSnapshot.name,
      viewportOffset: canvasSnapshot.viewportOffset,
      viewportScale: canvasSnapshot.viewportScale,
      workspace: canvasSnapshot.workspace ?? null
    });
  });

  for (const canvasSnapshot of persistedCanvases) {
    const restoredCanvas = getCanvasById(canvasSnapshot.id);

    if (restoredCanvas === null) {
      continue;
    }

    setActiveCanvas(restoredCanvas.id);

    for (const nodeSnapshot of canvasSnapshot.terminalNodes) {
      try {
        await createTerminalNode({
          x: nodeSnapshot.x,
          y: nodeSnapshot.y,
          width: nodeSnapshot.width,
          height: nodeSnapshot.height,
          cwd: nodeSnapshot.cwd,
          shellName: nodeSnapshot.shellName,
          title: nodeSnapshot.title,
          isMaximized: nodeSnapshot.isMaximized,
          isExited: nodeSnapshot.isExited,
          exitCode: nodeSnapshot.exitCode,
          exitSignal: nodeSnapshot.exitSignal,
          sessionKey: nodeSnapshot.sessionKey,
          shouldFocus: false
        });
      } catch (error) {
        console.error(error);
      }
    }
  }

  const restoredActiveCanvas = getCanvasById(sessionSnapshot.activeCanvasId) ?? canvases[0] ?? null;

  if (restoredActiveCanvas !== null) {
    setActiveCanvas(restoredActiveCanvas.id);
  }
}

async function initializeApp() {
  isSessionHydrating = true;

  try {
    setSidebarCollapsed(true);
    setBoardIntroDismissed(false);
    renderCanvasSwitcher();
    renderWorkspaceBrowser();
    renderFileInspector();

    const sessionSnapshot = await window.noteCanvas.loadAppSession();

    if (sessionSnapshot !== null) {
      setSidebarCollapsed(sessionSnapshot.ui.isSidebarCollapsed);
      setBoardIntroDismissed(sessionSnapshot.ui.hasDismissedBoardIntro);
      await restoreCanvasSession(sessionSnapshot);
    }

    if (canvases.length === 0) {
      createCanvas();
    }

    const activeCanvas = getActiveCanvas();

    if (activeCanvas !== null) {
      await restoreCanvasWorkspace(activeCanvas);
    } else {
      applyWorkspaceState(await window.noteCanvas.getWorkspaceDirectoryState());
    }
  } catch (error) {
    console.error(error);

    if (canvases.length === 0) {
      createCanvas();
    }
  } finally {
    isSessionHydrating = false;
    flushAppSessionSave();
  }
}

function parseImportedCanvas(rawContents) {
  const parsed = JSON.parse(rawContents);
  const canvas = parsed?.canvas;
  const viewportOffset = canvas?.viewportOffset;
  const viewportScale = canvas?.viewportScale;
  const terminalNodes = Array.isArray(canvas?.terminalNodes) ? canvas.terminalNodes : null;

  if (![LEGACY_CANVAS_EXPORT_VERSION, CANVAS_EXPORT_VERSION].includes(parsed?.version) || typeof canvas?.name !== "string" || terminalNodes === null) {
    throw new Error("Invalid canvas file format.");
  }

  return {
    name: canvas.name,
    viewportOffset: {
      x: Number.isFinite(viewportOffset?.x) ? viewportOffset.x : 0,
      y: Number.isFinite(viewportOffset?.y) ? viewportOffset.y : 0
    },
    viewportScale: roundCanvasScale(Number.isFinite(viewportScale) ? viewportScale : 1),
    terminalNodes: terminalNodes.map((nodeRecord) => ({
      x: Number.isFinite(nodeRecord?.x) ? nodeRecord.x : 0,
      y: Number.isFinite(nodeRecord?.y) ? nodeRecord.y : 0,
      width: clampNodeDimension(nodeRecord?.width, MIN_NODE_WIDTH, DEFAULT_NODE_WIDTH),
      height: clampNodeDimension(nodeRecord?.height, MIN_NODE_HEIGHT, DEFAULT_NODE_HEIGHT),
      cwd: typeof nodeRecord?.cwd === "string" ? nodeRecord.cwd : null,
      title: typeof nodeRecord?.title === "string" ? nodeRecord.title : "",
      isMaximized: nodeRecord?.isMaximized === true
    }))
  };
}

async function refreshCanvasTerminalWorkingDirectories(canvasRecord) {
  if (canvasRecord === null) {
    return;
  }

  const liveNodes = canvasRecord.nodes.filter((nodeRecord) => typeof nodeRecord.terminalId === "string" && !nodeRecord.isExited);

  if (liveNodes.length === 0) {
    return;
  }

  try {
    const cwdByTerminalId = await window.noteCanvas.resolveTrackedTerminalCwds(
      liveNodes.map((nodeRecord) => nodeRecord.terminalId)
    );

    liveNodes.forEach((nodeRecord) => {
      const resolvedCwd = cwdByTerminalId?.[nodeRecord.terminalId];

      if (typeof resolvedCwd === "string" && resolvedCwd.length > 0) {
        nodeRecord.cwd = resolvedCwd;
      }
    });
  } catch (error) {
    console.error(error);
  }
}

async function exportActiveCanvas() {
  const activeCanvas = getActiveCanvas();

  if (activeCanvas === null) {
    return;
  }

  await refreshCanvasTerminalWorkingDirectories(activeCanvas);

  const exportPayload = serializeCanvasRecord(activeCanvas);
  await window.noteCanvas.saveCanvasFile({
    suggestedName: sanitizeCanvasExportName(activeCanvas.name),
    contents: JSON.stringify(exportPayload, null, 2)
  });
}

async function exportAppSessionData() {
  for (const canvasRecord of canvases) {
    await refreshCanvasTerminalWorkingDirectories(canvasRecord);
  }

  await window.noteCanvas.saveAppSessionFile({
    suggestedName: "termcanvas-app-data",
    contents: JSON.stringify(serializeAppSession(), null, 2)
  });
}

async function importAppSessionData() {
  const opened = await window.noteCanvas.openAppSessionFile();

  if (opened?.canceled === true) {
    return;
  }

  window.noteCanvas.saveAppSession(opened?.snapshot ?? null);
  closeCanvasSwitcherMenu();
  window.alert("App data imported. Close and reopen TermCanvas to load it.");
}

async function importCanvasFromData(importedCanvas) {
  const previousActiveCanvasId = activeCanvasId;
  const importedCanvasRecord = createCanvasRecord({
    name: importedCanvas.name,
    viewportOffset: importedCanvas.viewportOffset,
    viewportScale: importedCanvas.viewportScale
  });
  const createdNodes = [];

  setActiveCanvas(importedCanvasRecord.id);

  try {
    for (const nodeRecord of importedCanvas.terminalNodes) {
      const createdNode = await createTerminalNode({
        x: nodeRecord.x,
        y: nodeRecord.y,
        width: nodeRecord.width,
        height: nodeRecord.height,
        cwd: nodeRecord.cwd,
        title: nodeRecord.title,
        isMaximized: nodeRecord.isMaximized
      });

      if (createdNode !== undefined) {
        createdNodes.push(createdNode);
      }
    }

    return importedCanvasRecord;
  } catch (error) {
    await Promise.all(createdNodes.map((nodeRecord) => destroyTerminalNode(nodeRecord)));

    if (renderedCanvasId === importedCanvasRecord.id) {
      importedCanvasRecord.nodes.forEach((nodeRecord) => {
        setNodeCanvasVisibility(nodeRecord, false);
      });
      renderedCanvasId = null;
    }

    const canvasIndex = canvases.findIndex((canvasRecord) => canvasRecord.id === importedCanvasRecord.id);

    if (canvasIndex >= 0) {
      canvases.splice(canvasIndex, 1);
    }

    canvasMap.delete(importedCanvasRecord.id);

    const fallbackCanvas = getCanvasById(previousActiveCanvasId) ?? canvases[0] ?? null;
    activeCanvasId = fallbackCanvas?.id ?? null;
    renderCanvasSwitcher();
    renderCanvas({ syncTerminalSizes: true });
    throw error;
  }
}

async function importCanvas() {
  const opened = await window.noteCanvas.openCanvasFile();

  if (opened?.canceled) {
    return null;
  }

  if (typeof opened?.contents !== "string") {
    throw new Error("Canvas file contents were unavailable.");
  }

  const importedCanvas = parseImportedCanvas(opened.contents);
  return importCanvasFromData(importedCanvas);
}

function stopPan() {
  panState.pointerId = null;
  panState.hasMoved = false;
  board.classList.remove("is-ready-to-pan", "is-panning");
}

function stopNodeDrag(event) {
  const { handleElement, nodeRecord, hasMoved, pointerId } = dragState;

  if (handleElement !== null && pointerId !== null && handleElement.hasPointerCapture(pointerId)) {
    handleElement.releasePointerCapture(pointerId);
  }

  if (nodeRecord !== null) {
    nodeRecord.element.classList.remove("is-dragging");

    if (event !== undefined && !hasMoved && nodeRecord.canvas.id === activeCanvasId && !nodeRecord.isExited) {
      nodeRecord.terminal?.focus();
    }

    if (hasMoved) {
      scheduleAppSessionSave();
    }
  }

  dragState.pointerId = null;
  dragState.nodeRecord = null;
  dragState.handleElement = null;
  dragState.hasMoved = false;
}

function stopNodeResize(event) {
  const { handleElement, nodeRecord, pointerId, hasMoved } = resizeState;

  if (handleElement !== null && pointerId !== null && handleElement.hasPointerCapture(pointerId)) {
    handleElement.releasePointerCapture(pointerId);
  }

  if (nodeRecord !== null) {
    nodeRecord.element.classList.remove("is-resizing");

    if (event !== undefined && nodeRecord.canvas.id === activeCanvasId && !nodeRecord.isExited) {
      nodeRecord.syncSize();
    }

    if (hasMoved) {
      scheduleAppSessionSave();
    }
  }

  resizeState.pointerId = null;
  resizeState.nodeRecord = null;
  resizeState.handleElement = null;
  resizeState.direction = "";
  resizeState.hasMoved = false;
}

function stopPanelResize() {
  const { handleElement, pointerId } = panelResizeState;

  if (handleElement !== null && pointerId !== null && handleElement.hasPointerCapture(pointerId)) {
    handleElement.releasePointerCapture(pointerId);
  }

  handleElement?.classList.remove("is-active");
  appShell?.classList.remove("is-resizing-panel");
  panelResizeState.pointerId = null;
  panelResizeState.handleElement = null;
  panelResizeState.panelKind = "";
  panelResizeState.hasMoved = false;
}

function resetPointerInteractions() {
  stopPanelResize();
  stopNodeResize();
  stopNodeDrag();

  if (panState.pointerId !== null && board.hasPointerCapture(panState.pointerId)) {
    board.releasePointerCapture(panState.pointerId);
  }

  stopPan();
}

function getPanelResizeBounds(panelKind) {
  const minimumWidth = panelKind === "sidebar" ? MIN_SIDEBAR_PANEL_WIDTH : MIN_FILE_INSPECTOR_WIDTH;
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth || minimumWidth;

  return {
    minimumWidth,
    maximumWidth: Math.max(minimumWidth, viewportWidth - PANEL_VIEWPORT_MARGIN)
  };
}

function setPanelWidth(panelKind, nextWidth) {
  const propertyName = panelKind === "sidebar" ? "--drawer-panel-width" : "--inspector-width";
  document.documentElement.style.setProperty(propertyName, `${Math.round(nextWidth)}px`);
}

function startPanelResize(event, handleElement, panelKind) {
  if (
    event.button !== 0
    || panState.pointerId !== null
    || dragState.pointerId !== null
    || resizeState.pointerId !== null
    || panelResizeState.pointerId !== null
  ) {
    return;
  }

  const panelElement = panelKind === "sidebar" ? sidebarPanel : fileInspector;

  if (
    !(panelElement instanceof HTMLElement)
    || (panelKind === "sidebar" && isSidebarCollapsed)
    || (panelKind === "inspector" && !isWorkspacePreviewOpen())
  ) {
    return;
  }

  panelResizeState.pointerId = event.pointerId;
  panelResizeState.handleElement = handleElement;
  panelResizeState.panelKind = panelKind;
  panelResizeState.startClientX = event.clientX;
  panelResizeState.originWidth = panelElement.getBoundingClientRect().width;
  panelResizeState.hasMoved = false;

  handleElement.classList.add("is-active");
  appShell?.classList.add("is-resizing-panel");
  handleElement.setPointerCapture(event.pointerId);
  event.preventDefault();
  event.stopPropagation();
}

function moveResizedPanel(event) {
  if (panelResizeState.pointerId !== event.pointerId) {
    return;
  }

  const deltaX = event.clientX - panelResizeState.startClientX;
  const nextWidth = panelResizeState.panelKind === "sidebar"
    ? panelResizeState.originWidth + deltaX
    : panelResizeState.originWidth - deltaX;
  const { minimumWidth, maximumWidth } = getPanelResizeBounds(panelResizeState.panelKind);
  const clampedWidth = Math.min(maximumWidth, Math.max(minimumWidth, nextWidth));

  if (!panelResizeState.hasMoved && Math.abs(deltaX) > DRAG_THRESHOLD) {
    panelResizeState.hasMoved = true;
  }

  setPanelWidth(panelResizeState.panelKind, clampedWidth);

  if (event.cancelable) {
    event.preventDefault();
  }
}

function setActiveCanvas(canvasId) {
  const nextCanvas = getCanvasById(canvasId);

  if (nextCanvas === null) {
    return;
  }

  if (activeCanvasId !== canvasId) {
    const previousCanvas = getActiveCanvas();

    if (!isSessionHydrating && previousCanvas !== null) {
      previousCanvas.workspace = serializeCanvasWorkspaceSession();
    }

    resetPointerInteractions();

    if (activeCanvasRenameId !== null) {
      activeCanvasRenameId = null;
    }

    if (activeTitleEditorRecord !== null) {
      activeTitleEditorRecord.titleInput?.blur();
      activeTitleEditorRecord = null;
    }

    setActiveNode(null);
    activeCanvasId = canvasId;

    if (!isSessionHydrating) {
      if (nextCanvas.workspace === null) {
        applyWorkspaceState({ importedFolders: [], activeFolderId: null }, { skipCanvasWorkspaceSync: true });
      }

      void restoreCanvasWorkspace(nextCanvas);
    }

    closeCanvasSwitcherMenu();

    scheduleAppSessionSave();
  }

  renderCanvasSwitcher();
  renderCanvas({ syncTerminalSizes: true });
}

function createCanvas() {
  const canvasRecord = createCanvasRecord();
  setActiveCanvas(canvasRecord.id);
}

async function deleteCanvas(canvasId) {
  if (canvases.length <= 1) {
    return;
  }

  const canvasRecord = getCanvasById(canvasId);

  if (canvasRecord === null) {
    return;
  }

  resetPointerInteractions();

  if (activeCanvasRenameId === canvasId) {
    activeCanvasRenameId = null;
  }

  if (activeNodeRecord?.canvas === canvasRecord) {
    setActiveNode(null);
  }

  const nodesToRemove = [...canvasRecord.nodes];
  const canvasIndex = canvases.findIndex((candidate) => candidate.id === canvasId);

  if (canvasIndex < 0) {
    return;
  }

  if (renderedCanvasId === canvasId) {
    canvasRecord.nodes.forEach((nodeRecord) => {
      setNodeCanvasVisibility(nodeRecord, false);
    });
    renderedCanvasId = null;
  }

  canvases.splice(canvasIndex, 1);
  canvasMap.delete(canvasId);

  if (activeCanvasId === canvasId) {
    const fallbackCanvas = canvases[Math.max(0, canvasIndex - 1)] ?? canvases[0] ?? null;
    activeCanvasId = fallbackCanvas?.id ?? null;
  }

  renderCanvasSwitcher();
  renderCanvas({ syncTerminalSizes: true });

  await Promise.all(nodesToRemove.map((nodeRecord) => destroyTerminalNode(nodeRecord)));
  scheduleAppSessionSave();
}

function startNodeDrag(event, nodeRecord, handleElement) {
  if (event.button !== 0 || panState.pointerId !== null || nodeRecord.isMaximized || getVisibleMaximizedNode() !== null) {
    return;
  }

  setActiveNode(nodeRecord);
  dragState.pointerId = event.pointerId;
  dragState.nodeRecord = nodeRecord;
  dragState.handleElement = handleElement;
  dragState.startClientX = event.clientX;
  dragState.startClientY = event.clientY;
  dragState.originX = nodeRecord.x;
  dragState.originY = nodeRecord.y;
  dragState.hasMoved = false;

  handleElement.setPointerCapture(event.pointerId);
  event.preventDefault();
  event.stopPropagation();
}

function startNodeResize(event, nodeRecord, handleElement, direction) {
  if (
    event.button !== 0
    || panState.pointerId !== null
    || dragState.pointerId !== null
    || nodeRecord.isMaximized
    || getVisibleMaximizedNode() !== null
  ) {
    return;
  }

  setActiveNode(nodeRecord);
  resizeState.pointerId = event.pointerId;
  resizeState.nodeRecord = nodeRecord;
  resizeState.handleElement = handleElement;
  resizeState.direction = direction;
  resizeState.startClientX = event.clientX;
  resizeState.startClientY = event.clientY;
  resizeState.originX = nodeRecord.x;
  resizeState.originY = nodeRecord.y;
  resizeState.originWidth = nodeRecord.width;
  resizeState.originHeight = nodeRecord.height;
  resizeState.hasMoved = false;

  nodeRecord.element.classList.add("is-resizing");
  handleElement.setPointerCapture(event.pointerId);
  event.preventDefault();
  event.stopPropagation();
}

function moveDraggedNode(event) {
  const nodeRecord = dragState.nodeRecord;
  const viewportScale = nodeRecord?.canvas.viewportScale ?? 1;

  if (nodeRecord === null) {
    return;
  }

  const deltaX = event.clientX - dragState.startClientX;
  const deltaY = event.clientY - dragState.startClientY;

  if (!dragState.hasMoved && (Math.abs(deltaX) > DRAG_THRESHOLD || Math.abs(deltaY) > DRAG_THRESHOLD)) {
    dragState.hasMoved = true;
    nodeRecord.element.classList.add("is-dragging");
  }

  nodeRecord.x = dragState.originX + (deltaX / viewportScale);
  nodeRecord.y = dragState.originY + (deltaY / viewportScale);
  positionNode(nodeRecord);
}

function moveResizedNode(event) {
  const nodeRecord = resizeState.nodeRecord;
  const viewportScale = nodeRecord?.canvas.viewportScale ?? 1;

  if (nodeRecord === null) {
    return;
  }

  const deltaX = (event.clientX - resizeState.startClientX) / viewportScale;
  const deltaY = (event.clientY - resizeState.startClientY) / viewportScale;
  const direction = resizeState.direction;
  const originWest = resizeState.originX - (resizeState.originWidth / 2);
  const originEast = resizeState.originX + (resizeState.originWidth / 2);
  const originNorth = resizeState.originY - (resizeState.originHeight / 2);
  const originSouth = resizeState.originY + (resizeState.originHeight / 2);
  let nextWest = originWest;
  let nextEast = originEast;
  let nextNorth = originNorth;
  let nextSouth = originSouth;

  if (!resizeState.hasMoved && (Math.abs(deltaX) > DRAG_THRESHOLD || Math.abs(deltaY) > DRAG_THRESHOLD)) {
    resizeState.hasMoved = true;
  }

  if (direction.includes("e")) {
    nextEast = Math.max(originEast + deltaX, originWest + MIN_NODE_WIDTH);
  }

  if (direction.includes("w")) {
    nextWest = Math.min(originWest + deltaX, originEast - MIN_NODE_WIDTH);
  }

  if (direction.includes("s")) {
    nextSouth = Math.max(originSouth + deltaY, originNorth + MIN_NODE_HEIGHT);
  }

  if (direction.includes("n")) {
    nextNorth = Math.min(originNorth + deltaY, originSouth - MIN_NODE_HEIGHT);
  }

  nodeRecord.x = (nextWest + nextEast) / 2;
  nodeRecord.y = (nextNorth + nextSouth) / 2;
  applyNodeSize(nodeRecord, nextEast - nextWest, nextSouth - nextNorth);
  positionNode(nodeRecord);
}

function createTerminalElement(nodeRecord) {
  const node = document.createElement("article");
  node.className = "terminal-node";

  const header = document.createElement("header");
  header.className = "terminal-node-header";

  const dragArea = document.createElement("div");
  dragArea.className = "terminal-node-drag";
  dragArea.title = "Drag to move";

  const grabHandle = document.createElement("span");
  grabHandle.className = "terminal-node-grab-handle";
  grabHandle.setAttribute("aria-hidden", "true");

  const titleGroup = document.createElement("div");
  titleGroup.className = "terminal-node-title-group";

  const titleInput = document.createElement("input");
  titleInput.className = "terminal-node-title-input";
  titleInput.type = "text";
  titleInput.maxLength = MAX_TERMINAL_TITLE_LENGTH;
  titleInput.spellcheck = false;
  titleInput.setAttribute("aria-label", `Rename terminal ${nodeRecord.id}`);

  const meta = document.createElement("div");
  meta.className = "terminal-node-meta";
  meta.textContent = "Starting shell";

  titleGroup.append(titleInput, meta);
  dragArea.append(grabHandle, titleGroup);

  const status = document.createElement("span");
  status.className = "terminal-node-meta terminal-node-status";
  status.textContent = "Booting";

  const actions = document.createElement("div");
  actions.className = "terminal-node-actions";

  const maximizeButton = document.createElement("button");
  maximizeButton.className = "terminal-node-control terminal-node-maximize";
  maximizeButton.type = "button";

  const closeButton = document.createElement("button");
  closeButton.className = "terminal-node-control terminal-node-close";
  closeButton.type = "button";
  closeButton.setAttribute("aria-label", `Close terminal ${nodeRecord.id}`);
  closeButton.textContent = "×";

  actions.append(status, maximizeButton, closeButton);
  header.append(dragArea, actions);

  const surface = document.createElement("div");
  surface.className = "terminal-node-surface";

  const terminalMount = document.createElement("div");
  terminalMount.className = "terminal-node-terminal";

  const interactionOverlay = document.createElement("div");
  interactionOverlay.className = "terminal-node-interaction-overlay";
  interactionOverlay.setAttribute("aria-hidden", "true");

  const overlay = document.createElement("div");
  overlay.className = "terminal-node-overlay";
  overlay.hidden = true;

  const overlayCard = document.createElement("div");
  overlayCard.className = "terminal-node-overlay-card";

  const overlayTitle = document.createElement("div");
  overlayTitle.className = "terminal-node-overlay-title";

  const overlayMeta = document.createElement("div");
  overlayMeta.className = "terminal-node-overlay-meta";

  const reopenButton = document.createElement("button");
  reopenButton.className = "terminal-node-reopen";
  reopenButton.type = "button";
  reopenButton.textContent = "Reopen shell";

  overlayCard.append(overlayTitle, overlayMeta, reopenButton);
  overlay.append(overlayCard);
  surface.append(terminalMount, interactionOverlay, overlay);

  const resizeHandles = RESIZE_HANDLE_DIRECTIONS.map((direction) => {
    const handle = document.createElement("div");
    handle.className = `terminal-node-resize-handle ${direction.length === 1 ? `edge-${direction}` : `corner-${direction}`}`;
    handle.dataset.direction = direction;
    handle.setAttribute("aria-hidden", "true");
    return handle;
  });

  node.append(header, surface, ...resizeHandles);

  return {
    node,
    surface,
    terminalMount,
    interactionOverlay,
    meta,
    status,
    titleInput,
    maximizeButton,
    closeButton,
    dragArea,
    overlay,
    overlayTitle,
    overlayMeta,
    reopenButton,
    resizeHandles
  };
}

async function createTerminalNode(options) {
  const activeCanvas = getActiveCanvas();
  const shouldFocus = options?.shouldFocus !== false;

  if (activeCanvas === null) {
    return;
  }

  dismissBoardIntro();

  terminalCount += 1;

  const nodeRecord = {
    id: terminalCount,
    terminalId: null,
    sessionKey: typeof options.sessionKey === "string" && options.sessionKey.trim().length > 0
      ? options.sessionKey
      : crypto.randomUUID(),
    canvas: activeCanvas,
    x: options.x,
    y: options.y,
    width: DEFAULT_NODE_WIDTH,
    height: DEFAULT_NODE_HEIGHT,
    cwd: typeof options.cwd === "string" && options.cwd.trim().length > 0 ? options.cwd : getDefaultTerminalWorkingDirectory(),
    isRemoved: false,
    isExited: options.isExited === true,
    isMaximized: options.isMaximized === true,
    exitCode: Number.isInteger(options.exitCode) ? options.exitCode : null,
    exitSignal: typeof options.exitSignal === "string" && options.exitSignal.length > 0 ? options.exitSignal : null,
    element: null,
    surface: null,
    terminalMount: null,
    interactionOverlay: null,
    overlay: null,
    overlayTitle: null,
    overlayMeta: null,
    terminal: null,
    fitAddon: null,
    resizeObserver: null,
    syncSize: () => {},
    disposeInput: () => {},
    meta: null,
    status: null,
    titleInput: null,
    maximizeButton: null,
    reopenButton: null,
    resizeHandles: [],
    shellName: typeof options.shellName === "string" && options.shellName.length > 0 ? options.shellName : "Shell",
    titleText: normalizeTerminalTitle(options.title, `Terminal ${terminalCount}`)
  };
  const elements = createTerminalElement(nodeRecord);
  nodeRecord.element = elements.node;
  nodeRecord.surface = elements.surface;
  nodeRecord.terminalMount = elements.terminalMount;
  nodeRecord.interactionOverlay = elements.interactionOverlay;
  nodeRecord.overlay = elements.overlay;
  nodeRecord.overlayTitle = elements.overlayTitle;
  nodeRecord.overlayMeta = elements.overlayMeta;
  nodeRecord.meta = elements.meta;
  nodeRecord.status = elements.status;
  nodeRecord.titleInput = elements.titleInput;
  nodeRecord.maximizeButton = elements.maximizeButton;
  nodeRecord.reopenButton = elements.reopenButton;
  nodeRecord.resizeHandles = elements.resizeHandles;

  applyNodeSize(nodeRecord, options.width, options.height);

  updateNodeTitleInput(nodeRecord);
  syncMaximizeButton(nodeRecord);

  elements.closeButton.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    void destroyTerminalNode(nodeRecord);
  });

  elements.maximizeButton.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    setNodeMaximized(nodeRecord, !nodeRecord.isMaximized);
  });

  elements.reopenButton.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    void reopenTerminalNode(nodeRecord);
  });

  elements.titleInput.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) {
      return;
    }

    event.stopPropagation();
    if (shouldSelectTerminal({ reason: "pointer" })) {
      setActiveNode(nodeRecord);
    }
  });

  elements.titleInput.addEventListener("focus", () => {
    activeTitleEditorRecord = nodeRecord;
    if (shouldSelectTerminal({ reason: "title-focus" })) {
      setActiveNode(nodeRecord);
    }
    elements.titleInput.select();
  });

  elements.titleInput.addEventListener("blur", () => {
    if (activeTitleEditorRecord === nodeRecord) {
      activeTitleEditorRecord = null;
    }

    commitNodeTitle(nodeRecord, elements.titleInput.value);
  });

  elements.titleInput.addEventListener("keydown", (event) => {
    event.stopPropagation();

    if (event.key === "Enter") {
      event.preventDefault();
      commitNodeTitle(nodeRecord, elements.titleInput.value);
      elements.titleInput.blur();
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      cancelNodeTitleEditing(nodeRecord);
      elements.titleInput.blur();
    }
  });

  elements.node.addEventListener("pointerdown", (event) => {
    if (event.button === 0 && shouldSelectTerminal({ reason: "pointer" })) {
      setActiveNode(nodeRecord);
    }
  });

  elements.interactionOverlay.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    if (shouldSelectTerminal({ reason: "pointer" })) {
      setActiveNode(nodeRecord);
      nodeRecord.terminal?.focus();
    }
  });

  elements.dragArea.addEventListener("pointerdown", (event) => {
    startNodeDrag(event, nodeRecord, elements.dragArea);
  });

  elements.dragArea.addEventListener("dblclick", (event) => {
    if (!isElement(event.target) || event.target.closest(".terminal-node-title-input, .terminal-node-control") !== null) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    setNodeMaximized(nodeRecord, !nodeRecord.isMaximized);
  });

  elements.resizeHandles.forEach((handle) => {
    handle.addEventListener("pointerdown", (event) => {
      startNodeResize(event, nodeRecord, handle, handle.dataset.direction || "");
    });
  });

  activeCanvas.nodes.push(nodeRecord);
  renderCanvasSwitcher();

  if (activeCanvas.id === activeCanvasId) {
    nodesLayer.append(elements.node);
  }

  positionNode(nodeRecord);
  syncTerminalInteractionOverlay(nodeRecord);
  updateEmptyState();

  try {
    if (nodeRecord.isExited) {
      setNodeExitedState(nodeRecord, nodeRecord.exitCode, nodeRecord.exitSignal);
    } else {
      await bindTerminalSession(nodeRecord, { shouldFocus });
    }

    if (nodeRecord.isMaximized) {
      setNodeMaximized(nodeRecord, true, { shouldSelect: false });
    }
  } catch (error) {
    await destroyTerminalNode(nodeRecord, { shouldDestroySession: false });
    throw error;
  }

  scheduleAppSessionSave();
  return nodeRecord;
}

async function destroyTerminalNode(nodeRecord, options = {}) {
  const shouldDestroySession = options.shouldDestroySession !== false;

  if (nodeRecord.isRemoved) {
    return;
  }

  nodeRecord.isRemoved = true;

  if (dragState.nodeRecord === nodeRecord) {
    stopNodeDrag();
  }

  if (activeNodeRecord === nodeRecord) {
    setActiveNode(null);
  }

  if (activeTitleEditorRecord === nodeRecord) {
    activeTitleEditorRecord = null;
  }

  if (nodeRecord.isMaximized) {
    setNodeMaximized(nodeRecord, false);
  }

  await releaseTerminalSession(nodeRecord, { shouldDestroySession });
  nodeRecord.element?.remove();

  const nodeIndex = nodeRecord.canvas.nodes.indexOf(nodeRecord);

  if (nodeIndex >= 0) {
    nodeRecord.canvas.nodes.splice(nodeIndex, 1);
  }

  if (nodeRecord.canvas.id === activeCanvasId) {
    updateEmptyState();
    applyCanvasFocusMode();
    renderCanvasSwitcher();
  }

  scheduleAppSessionSave();
}

async function handleBoardDoubleClick(event) {
  if (!isElement(event.target)) {
    return;
  }

  if (event.target.closest(".terminal-node") !== null) {
    return;
  }

  if (getVisibleMaximizedNode() !== null) {
    return;
  }

  try {
    await createTerminalNode(toWorldPoint(getBoardPoint(event)));
  } catch (error) {
    console.error(error);
  }
}

function startPan(event) {
  const activeCanvas = getActiveCanvas();

  if (activeCanvas === null || getVisibleMaximizedNode() !== null) {
    return;
  }

  dismissBoardIntro();

  panState.pointerId = event.pointerId;
  panState.startClientX = event.clientX;
  panState.startClientY = event.clientY;
  panState.originX = activeCanvas.viewportOffset.x;
  panState.originY = activeCanvas.viewportOffset.y;
  panState.hasMoved = false;

  board.classList.add("is-ready-to-pan");
  board.setPointerCapture(event.pointerId);
}

function handleBoardPointerDown(event) {
  if (event.button !== 0) {
    return;
  }

  if (!isBoardBackgroundTarget(event.target)) {
    return;
  }

  if (shouldClearActiveTerminalSelection({ target: event.target, board, nodesLayer })) {
    setActiveNode(null);
  }

  if (!isSidebarCollapsed) {
    setSidebarCollapsed(true);
  }

  startPan(event);
}

function handleBoardPointerMove(event) {
  if (resizeState.pointerId === event.pointerId) {
    moveResizedNode(event);
    return;
  }

  if (dragState.pointerId === event.pointerId) {
    moveDraggedNode(event);
    return;
  }

  if (panState.pointerId !== event.pointerId) {
    return;
  }

  const deltaX = event.clientX - panState.startClientX;
  const deltaY = event.clientY - panState.startClientY;

  if (!panState.hasMoved && (Math.abs(deltaX) > DRAG_THRESHOLD || Math.abs(deltaY) > DRAG_THRESHOLD)) {
    panState.hasMoved = true;
    board.classList.add("is-panning");
  }

  setActiveCanvasViewportOffset(panState.originX + deltaX, panState.originY + deltaY);
}

function handleBoardPointerUp(event) {
  if (resizeState.pointerId === event.pointerId) {
    stopNodeResize(event);
    return;
  }

  if (dragState.pointerId === event.pointerId) {
    stopNodeDrag(event);
    return;
  }

  if (panState.pointerId !== event.pointerId) {
    return;
  }

  if (board.hasPointerCapture(event.pointerId)) {
    board.releasePointerCapture(event.pointerId);
  }

  stopPan();
}

function handleBoardPointerCancel(event) {
  if (resizeState.pointerId === event.pointerId) {
    stopNodeResize();
    return;
  }

  if (dragState.pointerId === event.pointerId) {
    stopNodeDrag();
    return;
  }

  if (panState.pointerId !== event.pointerId) {
    return;
  }

  stopPan();
}

function handleBoardWheel(event) {
  if (
    getVisibleMaximizedNode() !== null
    || !shouldHandleCanvasWheel({
      target: event.target,
      board,
      nodesLayer,
      activeNodeElement: activeNodeRecord?.element ?? null
    })
  ) {
    return;
  }

  const { x, y } = normalizeWheelDelta(event);
  const didMove = isViewportZoomModifierPressed(event)
    ? zoomActiveCanvasAtPoint(getBoardPoint(event), y !== 0 ? y : x)
    : panActiveCanvasBy(-x, -y);

  if (didMove && event.cancelable) {
    event.preventDefault();
  }
}

function handleWindowPointerMove(event) {
  moveResizedPanel(event);
}

function handleWindowPointerUp(event) {
  if (panelResizeState.pointerId === event.pointerId) {
    stopPanelResize();
  }
}

function handleWindowPointerCancel(event) {
  if (panelResizeState.pointerId === event.pointerId) {
    stopPanelResize();
  }
}

function handleWindowClick(event) {
  if (!isCanvasSwitcherMenuOpen || !(canvasSwitcherSection instanceof HTMLElement)) {
    return;
  }

  if (canvasSwitcherSection.contains(event.target)) {
    return;
  }

  closeCanvasSwitcherMenu();
}

function handleWindowKeyDown(event) {
  if (event.defaultPrevented || event.repeat) {
    return;
  }

  if (workspaceActionDialogState.isOpen === true && event.key === "Escape") {
    event.preventDefault();
    resolveWorkspaceActionDialog(null);
    return;
  }

  if (workspaceActionDialogState.isOpen === true) {
    return;
  }

  if (event.key === "Escape" && activeTitleEditorRecord !== null) {
    event.preventDefault();
    cancelNodeTitleEditing(activeTitleEditorRecord);
    activeTitleEditorRecord.titleInput?.blur();
    return;
  }

  if (event.key === "Escape") {
    if (isCanvasSwitcherMenuOpen) {
      event.preventDefault();
      closeCanvasSwitcherMenu({ restoreFocus: true });
      return;
    }

    if (isWorkspacePreviewOpen()) {
      event.preventDefault();
      closeWorkspacePreview();
      return;
    }

    if (!isSidebarCollapsed) {
      event.preventDefault();
      setSidebarCollapsed(true);
      return;
    }

    const visibleMaximizedNode = getVisibleMaximizedNode();

    if (visibleMaximizedNode !== null) {
      event.preventDefault();
      setNodeMaximized(visibleMaximizedNode, false);
      return;
    }
  }

  const shortcutKey = String(event.key).toLowerCase();
  const isCommandShortcut = event.metaKey && !event.ctrlKey && !event.altKey;

  if (isCommandShortcut && shortcutKey === "l" && isWorkspacePreviewOpen()) {
    event.preventDefault();
    closeWorkspacePreview();
    return;
  }

  if (isCommandShortcut && shortcutKey === "b") {
    event.preventDefault();
    toggleSidebar();
    return;
  }
}

void initializeApp().catch((error) => {
  console.error(error);
});

window.addEventListener("beforeunload", () => {
  flushAppSessionSave();
  isWindowUnloading = true;
  window.noteCanvas.setActiveTerminalShortcutState(false);

  if (zoomIndicatorTimeout !== 0) {
    window.clearTimeout(zoomIndicatorTimeout);
    zoomIndicatorTimeout = 0;
  }

  if (viewportRenderFrame !== 0) {
    cancelAnimationFrame(viewportRenderFrame);
    viewportRenderFrame = 0;
  }

  if (terminalSizeSyncFrame !== 0) {
    cancelAnimationFrame(terminalSizeSyncFrame);
    terminalSizeSyncFrame = 0;
    pendingTerminalSizeNodes.clear();
  }

  window.removeEventListener("keydown", handleWindowKeyDown);
  window.removeEventListener("click", handleWindowClick);
  window.removeEventListener("pointermove", handleWindowPointerMove);
  window.removeEventListener("pointerup", handleWindowPointerUp);
  window.removeEventListener("pointercancel", handleWindowPointerCancel);
  removeToggleActiveTerminalMaximizeListener();
  removeTerminalDataListener();
  removeTerminalExitListener();
  removeTerminalCwdChangeListener();
  removeWorkspaceDirectoryDataListener();
  terminalNodeMap.forEach((nodeRecord) => {
    nodeRecord.resizeObserver?.disconnect();

    if (typeof nodeRecord.terminalId === "string") {
      void window.noteCanvas.destroyTerminal(nodeRecord.terminalId, {
        preserveSession: window.noteCanvas.isSmokeTest !== true
      });
    }
  });
});

if (window.noteCanvas.isSmokeTest) {
  const getCanvasSnapshot = () => {
    flushViewportRender();

    const activeCanvas = getActiveCanvas();
    const activeNodes = activeCanvas?.nodes ?? [];
    const previewViewModel = deriveWorkspacePreviewViewModel(workspacePreviewState);
    const previewImage = fileInspector?.querySelector(".file-inspector-image");
    const previewPdfFrame = fileInspector?.querySelector(".file-inspector-pdf-frame");
    const canvasWorkspaceOwnerships = canvases.map((canvasRecord) => ({
      canvasId: canvasRecord.id,
      canvasName: canvasRecord.name,
      workspaceRootPath: getCanvasWorkspaceRootPath(canvasRecord),
      workspacePreviewRelativePath: getCanvasWorkspacePreviewRelativePath(canvasRecord)
    }));
    const boardRect = board.getBoundingClientRect();
    const sidebarRect = appShell?.querySelector(".canvas-sidebar")?.getBoundingClientRect();
    const workspaceSection = workspaceBrowser?.closest(".sidebar-section");
    const workspaceSectionRect = workspaceSection instanceof HTMLElement ? workspaceSection.getBoundingClientRect() : null;
    const topCanvasStripItems = canvasStripList instanceof HTMLElement
      ? [...canvasStripList.querySelectorAll('[data-canvas-part="strip-switch"]')]
      : [];
    const topCanvasStripRect = canvasStripList instanceof HTMLElement ? canvasStripList.getBoundingClientRect() : null;
    const topCanvasStripOverflowState = canvasStripList instanceof HTMLElement
      ? deriveCanvasStripOverflowState({
        scrollLeft: canvasStripList.scrollLeft,
        clientWidth: canvasStripList.clientWidth,
        scrollWidth: canvasStripList.scrollWidth
      })
      : {
        hasOverflow: false,
        canScrollBackward: false,
        canScrollForward: false
      };
    const nodeScreenPositions = activeCanvas === null
      ? []
      : activeNodes.map((nodeRecord) => {
        if (!(nodeRecord.element instanceof HTMLElement)) {
          return null;
        }

        const nodeRect = nodeRecord.element.getBoundingClientRect();

        return {
          x: (nodeRect.left - boardRect.left) + (nodeRect.width / 2),
          y: (nodeRect.top - boardRect.top) + (nodeRect.height / 2)
        };
      });

      return {
        canvasCount: canvases.length,
        canvasNames: canvases.map((canvasRecord) => canvasRecord.name),
        canvasNodeCounts: canvases.map((canvasRecord) => canvasRecord.nodes.length),
        canvasWorkspaceOwnerships,
        activeCanvasName: activeCanvas?.name ?? null,
        activeCanvasRenameId,
        activeNodeCount: activeNodes.length,
      viewportOffset: activeCanvas === null
        ? null
        : {
          x: activeCanvas.viewportOffset.x,
          y: activeCanvas.viewportOffset.y
        },
      viewportScale: activeCanvas?.viewportScale ?? null,
      terminalIds: activeNodes.map((nodeRecord) => nodeRecord.terminalId),
      nodeTitles: activeNodes.map((nodeRecord) => nodeRecord.titleText),
      nodeSizes: activeNodes.map((nodeRecord) => ({
        width: nodeRecord.width,
        height: nodeRecord.height
      })),
      nodeWorkingDirectories: activeNodes.map((nodeRecord) => nodeRecord.cwd),
      exitedNodeTitles: activeNodes.filter((nodeRecord) => nodeRecord.isExited).map((nodeRecord) => nodeRecord.titleText),
      nodeScreenPositions,
      maximizedNodeTitle: activeNodes.find((nodeRecord) => nodeRecord.isMaximized)?.titleText ?? null,
      firstTerminalText: activeNodes[0]?.element?.textContent || "",
      visibleNodeCount: [...nodesLayer.querySelectorAll(".terminal-node")].filter((nodeElement) => {
        if (!(nodeElement instanceof HTMLElement)) {
          return false;
        }

        const nodeStyles = getComputedStyle(nodeElement);
        return nodeStyles.display !== "none" && nodeStyles.visibility !== "hidden" && Number.parseFloat(nodeStyles.opacity || "1") > 0;
      }).length,
      sidebarCollapsed: isSidebarCollapsed,
      topCanvasStripVisible: Boolean(
        topCanvasStripRect
        && topCanvasStripRect.width > 0
        && topCanvasStripRect.height > 0
        && getComputedStyle(canvasStripList).display !== "none"
        && getComputedStyle(canvasStripList).visibility !== "hidden"
      ),
      topCanvasStripNames: topCanvasStripItems
        .filter((item) => item instanceof HTMLElement)
        .map((item) => item.textContent?.trim() ?? ""),
      topCanvasStripCanScrollBackward: topCanvasStripOverflowState.canScrollBackward,
      topCanvasStripCanScrollForward: topCanvasStripOverflowState.canScrollForward,
      leftDrawerOwnsPrimaryCanvasSwitcher: canvasSwitcherSection?.closest(".canvas-sidebar") instanceof HTMLElement,
        workspaceRootPath: getActiveWorkspaceFolder()?.rootPath ?? null,
        workspaceEntryPaths: getActiveWorkspaceFolder()?.entries.map((entry) => entry.relativePath) ?? [],
        workspaceVisibleEntryPaths: [...workspaceBrowser.querySelectorAll("[data-workspace-path]")].map((entryElement) => entryElement.dataset.workspacePath).filter((entryPath) => typeof entryPath === "string"),
        workspaceIsTruncated: getActiveWorkspaceFolder()?.isTruncated === true,
        workspaceImportedFolderIds: workspaceState.importedFolders.map((folder) => folder.id),
        workspaceImportedFolderPaths: workspaceState.importedFolders.map((folder) => folder.rootPath),
        workspaceImportedFolders: workspaceState.importedFolders.map((folder) => ({ id: folder.id, rootPath: folder.rootPath })),
        workspaceActiveFolderId: workspaceState.activeFolderId,
        workspaceSelectedFilePath: workspacePreviewState.relativePath,
        workspacePreviewStatus: workspacePreviewState.status,
        workspacePreviewKind: workspacePreviewState.data?.kind ?? null,
        workspacePreviewMode: previewViewModel.mode,
        workspacePreviewContents: workspacePreviewState.data?.contents ?? "",
        workspacePreviewHasImage: previewImage instanceof HTMLImageElement,
        workspacePreviewImageLoaded: previewImage instanceof HTMLImageElement && previewImage.complete && previewImage.naturalWidth > 0,
        workspacePreviewHasPdfFrame: previewPdfFrame instanceof HTMLIFrameElement,
        workspacePreviewPdfBlobUrl: previewPdfFrame instanceof HTMLIFrameElement ? previewPdfFrame.src : "",
        workspacePreviewPdfLoaded: previewPdfFrame instanceof HTMLIFrameElement && previewPdfFrame.dataset.previewLoaded === "true",
        workspacePreviewCanOpenExternally: fileInspector?.querySelector(".file-inspector-fallback-actions button:nth-child(1)")?.textContent === "Open externally"
          || [...(fileInspector?.querySelectorAll(".file-inspector-fallback-actions .file-inspector-button") ?? [])].some((button) => button.textContent === "Open externally"),
        workspacePreviewCanRevealInFinder: [...(fileInspector?.querySelectorAll(".file-inspector-fallback-actions .file-inspector-button") ?? [])].some((button) => button.textContent === "Reveal in Finder"),
        fileInspectorVisible: appShell?.classList.contains("has-file-inspector") === true,
        workspaceSectionVisible: Boolean(
          sidebarRect
          && workspaceSectionRect
          && workspaceSectionRect.height > 0
          && workspaceSectionRect.top >= sidebarRect.top
          && workspaceSectionRect.bottom <= sidebarRect.bottom
        ),
        fullscreenExitVisible: boardFullscreenExitButton instanceof HTMLElement
          && getComputedStyle(boardFullscreenExitButton).pointerEvents !== "none"
          && Number.parseFloat(getComputedStyle(boardFullscreenExitButton).opacity) > 0.01
        ,focusedCanvasRenameId: (() => {
          const activeElement = document.activeElement;

          if (!(activeElement instanceof HTMLInputElement) || activeElement.dataset.canvasPart !== "rename-input") {
            return null;
          }

          return activeElement.dataset.canvasId ?? null;
        })()
      };
    };

  const waitForAnimationFrame = () => new Promise((resolve) => {
    requestAnimationFrame(() => {
      resolve();
    });
  });

  const waitForUiTransition = async () => {
    await waitForAnimationFrame();
    await new Promise((resolve) => {
      window.setTimeout(resolve, 220);
    });
  };

  const getCanvasStripSwitches = () => {
    if (!(canvasStripList instanceof HTMLElement)) {
      return [];
    }

    return [...canvasStripList.querySelectorAll('[data-canvas-part="strip-switch"]')]
      .filter((item) => item instanceof HTMLButtonElement);
  };

  const escapeShellPathForSingleQuotes = (targetPath) => targetPath.replace(/'/g, "'\\''");

  const dispatchPointer = (target, type, point, pointerId) => {
    target.dispatchEvent(new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      pointerId,
      pointerType: "mouse",
      isPrimary: true,
      button: 0,
      buttons: type === "pointerup" ? 0 : 1,
      clientX: point.x,
      clientY: point.y
    }));
  };

  window.__canvasLearningDebug = {
    createTerminalAt: async (x, y) => {
      await createTerminalNode(toWorldPoint({ x, y }));
      await waitForAnimationFrame();
      return getCanvasSnapshot();
    },
    createCanvas: () => {
      createCanvas();
      return getCanvasSnapshot();
    },
    switchCanvas: (index) => {
      const canvasRecord = canvases[index];

      if (canvasRecord !== undefined) {
        setActiveCanvas(canvasRecord.id);
      }

      return getCanvasSnapshot();
    },
    clickCanvasStripItem: async (index) => {
      const stripItem = getCanvasStripSwitches()[index];

      if (stripItem instanceof HTMLButtonElement) {
        stripItem.click();
        await waitForUiTransition();
      }

      return getCanvasSnapshot();
    },
    scrollCanvasStripForward: async () => {
      if (canvasStripNextButton instanceof HTMLButtonElement && !canvasStripNextButton.hidden && !canvasStripNextButton.disabled) {
        canvasStripNextButton.click();
        await waitForUiTransition();
      }

      return getCanvasSnapshot();
    },
    scrollCanvasStripBackward: async () => {
      if (canvasStripPrevButton instanceof HTMLButtonElement && !canvasStripPrevButton.hidden && !canvasStripPrevButton.disabled) {
        canvasStripPrevButton.click();
        await waitForUiTransition();
      }

      return getCanvasSnapshot();
    },
    reorderCanvas: async (fromIndex, targetIndex) => {
      const canvasRecord = canvases[fromIndex];

      if (canvasRecord !== undefined) {
        reorderCanvasById(canvasRecord.id, targetIndex);
        await waitForAnimationFrame();
      }

      return getCanvasSnapshot();
    },
    deleteActiveCanvas: async () => {
      const activeCanvas = getActiveCanvas();

      if (activeCanvas !== null) {
        await deleteCanvas(activeCanvas.id);
      }

      return getCanvasSnapshot();
    },
    getSnapshot: () => {
      const snapshot = getCanvasSnapshot();

      return {
        hasNodes: snapshot.activeNodeCount > 0,
        canvasCount: snapshot.canvasCount,
        canvasNames: snapshot.canvasNames,
        activeCanvasName: snapshot.activeCanvasName,
        activeNodeCount: snapshot.activeNodeCount,
        viewportOffset: snapshot.viewportOffset,
        viewportScale: snapshot.viewportScale,
        terminalIds: snapshot.terminalIds,
        nodeTitles: snapshot.nodeTitles,
        nodeSizes: snapshot.nodeSizes,
        nodeWorkingDirectories: snapshot.nodeWorkingDirectories,
        exitedNodeTitles: snapshot.exitedNodeTitles,
        firstNodeScreenPosition: snapshot.nodeScreenPositions[0] ?? null,
        maximizedNodeTitle: snapshot.maximizedNodeTitle,
        firstTerminalText: snapshot.firstTerminalText,
        visibleNodeCount: snapshot.visibleNodeCount,
        sidebarCollapsed: snapshot.sidebarCollapsed,
        topCanvasStripVisible: snapshot.topCanvasStripVisible,
        topCanvasStripNames: snapshot.topCanvasStripNames,
        topCanvasStripCanScrollBackward: snapshot.topCanvasStripCanScrollBackward,
        topCanvasStripCanScrollForward: snapshot.topCanvasStripCanScrollForward,
        leftDrawerOwnsPrimaryCanvasSwitcher: snapshot.leftDrawerOwnsPrimaryCanvasSwitcher,
        workspaceRootPath: snapshot.workspaceRootPath,
        workspaceEntryPaths: snapshot.workspaceEntryPaths,
        workspaceImportedFolderIds: snapshot.workspaceImportedFolderIds,
        workspaceImportedFolderPaths: snapshot.workspaceImportedFolderPaths,
        workspaceImportedFolders: snapshot.workspaceImportedFolders,
        workspaceActiveFolderId: snapshot.workspaceActiveFolderId,
        canvasWorkspaceOwnerships: snapshot.canvasWorkspaceOwnerships,
        workspaceVisibleEntryPaths: snapshot.workspaceVisibleEntryPaths,
        workspaceSelectedFilePath: snapshot.workspaceSelectedFilePath,
        workspacePreviewStatus: snapshot.workspacePreviewStatus,
        workspacePreviewKind: snapshot.workspacePreviewKind,
        workspacePreviewMode: snapshot.workspacePreviewMode,
        workspacePreviewContents: snapshot.workspacePreviewContents,
        workspacePreviewHasImage: snapshot.workspacePreviewHasImage,
        workspacePreviewImageLoaded: snapshot.workspacePreviewImageLoaded,
        workspacePreviewHasPdfFrame: snapshot.workspacePreviewHasPdfFrame,
        workspacePreviewPdfBlobUrl: snapshot.workspacePreviewPdfBlobUrl,
        workspacePreviewPdfLoaded: snapshot.workspacePreviewPdfLoaded,
        workspacePreviewCanOpenExternally: snapshot.workspacePreviewCanOpenExternally,
        workspacePreviewCanRevealInFinder: snapshot.workspacePreviewCanRevealInFinder,
        fileInspectorVisible: snapshot.fileInspectorVisible,
        fullscreenExitVisible: snapshot.fullscreenExitVisible
      };
    },
    getCanvasSnapshot,
    renameFirstTerminal: async (title) => {
      const firstNode = getActiveCanvas()?.nodes[0];

      if (firstNode === undefined) {
        return getCanvasSnapshot();
      }

      firstNode.titleInput?.focus();

      if (firstNode.titleInput instanceof HTMLInputElement) {
        firstNode.titleInput.value = title;
        firstNode.titleInput.dispatchEvent(new KeyboardEvent("keydown", {
          key: "Enter",
          bubbles: true,
          cancelable: true
        }));
      }

      await new Promise((resolve) => {
        requestAnimationFrame(() => {
          resolve();
        });
      });

      return getCanvasSnapshot();
    },
    renameCanvasAt: async (index, title) => {
      const canvasRecord = canvases[index];

      if (canvasRecord === undefined) {
        return getCanvasSnapshot();
      }

      beginCanvasRename(canvasRecord.id);
      await waitForAnimationFrame();

      const renameInput = canvasSwitcherMenu.querySelector(`[data-canvas-id="${canvasRecord.id}"][data-canvas-part="rename-input"]`);

      if (renameInput instanceof HTMLInputElement) {
        renameInput.value = title;
        renameInput.dispatchEvent(new KeyboardEvent("keydown", {
          key: "Enter",
          bubbles: true,
          cancelable: true
        }));
        await waitForAnimationFrame();
      }

      return getCanvasSnapshot();
    },
    handoffCanvasRename: async (fromIndex, toIndex, draftName = "", nextDraftName = "") => {
      const fromCanvas = canvases[fromIndex];
      const toCanvas = canvases[toIndex];

      if (fromCanvas === undefined || toCanvas === undefined) {
        return getCanvasSnapshot();
      }

      beginCanvasRename(fromCanvas.id);
      await waitForAnimationFrame();

      const fromInput = canvasSwitcherMenu.querySelector(`[data-canvas-id="${fromCanvas.id}"][data-canvas-part="rename-input"]`);

      if (fromInput instanceof HTMLInputElement) {
        fromInput.value = draftName;
      }

      beginCanvasRename(toCanvas.id);
      await waitForAnimationFrame();

      const toInput = canvasSwitcherMenu.querySelector(`[data-canvas-id="${toCanvas.id}"][data-canvas-part="rename-input"]`);

      if (toInput instanceof HTMLInputElement) {
        toInput.value = nextDraftName;
      }

      await waitForAnimationFrame();

      return getCanvasSnapshot();
    },
    toggleMaximizeFirstTerminal: async () => {
      const firstNode = getActiveCanvas()?.nodes[0];

      if (firstNode === undefined) {
        return getCanvasSnapshot();
      }

      firstNode.maximizeButton?.click();
      await waitForUiTransition();
      return getCanvasSnapshot();
    },
    reopenFirstTerminal: async () => {
      const firstNode = getActiveCanvas()?.nodes[0];

      if (firstNode === undefined) {
        return getCanvasSnapshot();
      }

      firstNode.reopenButton?.click();
      return getCanvasSnapshot();
    },
    resizeFirstTerminalTo: async (width, height, direction = "se") => {
      const firstNode = getActiveCanvas()?.nodes[0];
      const resizeHandle = firstNode?.resizeHandles?.find((handle) => handle.dataset.direction === direction);

      if (firstNode === undefined || firstNode.isMaximized || !(resizeHandle instanceof HTMLElement)) {
        return getCanvasSnapshot();
      }

      const viewportScale = firstNode.canvas.viewportScale;
      const startRect = resizeHandle.getBoundingClientRect();
      const startPoint = {
        x: startRect.left + (startRect.width / 2),
        y: startRect.top + (startRect.height / 2)
      };
      const widthDelta = width - firstNode.width;
      const heightDelta = height - firstNode.height;
      const movePoint = {
        x: startPoint.x + ((direction.includes("e") ? widthDelta : direction.includes("w") ? -widthDelta : 0) * viewportScale),
        y: startPoint.y + ((direction.includes("s") ? heightDelta : direction.includes("n") ? -heightDelta : 0) * viewportScale)
      };
      const pointerId = 41;

      dispatchPointer(resizeHandle, "pointerdown", startPoint, pointerId);
      dispatchPointer(board, "pointermove", movePoint, pointerId);
      dispatchPointer(board, "pointerup", movePoint, pointerId);
      await waitForAnimationFrame();
      return getCanvasSnapshot();
    },
    exitFullscreen: async () => {
      if (boardFullscreenExitButton instanceof HTMLButtonElement) {
        boardFullscreenExitButton.click();
        await waitForUiTransition();
      }

      return getCanvasSnapshot();
    },
    exportActiveCanvasData: async () => {
      const activeCanvas = getActiveCanvas();
      await refreshCanvasTerminalWorkingDirectories(activeCanvas);
      const exportPayload = serializeCanvasRecord(activeCanvas);
      lastExportedCanvasDebugPayload = JSON.parse(JSON.stringify(exportPayload));
      return exportPayload;
    },
    importCanvasData: async (rawContents) => {
      const importedCanvas = typeof rawContents === "string"
        ? parseImportedCanvas(rawContents)
        : Array.isArray(rawContents?.canvas?.terminalNodes)
          ? parseImportedCanvas(JSON.stringify(rawContents))
          : rawContents;
      const canvasRecord = await importCanvasFromData(importedCanvas);
      return {
        importedCanvasName: canvasRecord.name,
        snapshot: getCanvasSnapshot()
      };
    },
    importLastExportedCanvasData: async () => {
      if (lastExportedCanvasDebugPayload === null) {
        throw new Error("No exported canvas payload available.");
      }

      return window.__canvasLearningDebug.importCanvasData(lastExportedCanvasDebugPayload);
    },
    openWorkspaceDirectoryForPath: async (directoryPath) => {
      const state = await window.noteCanvas.debugOpenWorkspaceDirectory(directoryPath);
      applyWorkspaceState(state);
      openWorkspaceDrawer();
      await waitForAnimationFrame();
      return getCanvasSnapshot();
    },
    activateWorkspaceFolder: async (folderId) => {
      const state = await window.noteCanvas.activateWorkspaceFolder(folderId);
      applyWorkspaceState(state);
      await waitForAnimationFrame();
      return getCanvasSnapshot();
    },
    removeWorkspaceFolder: async (folderId) => {
      const state = await window.noteCanvas.removeWorkspaceFolder(folderId);
      applyWorkspaceState(state);
      await waitForAnimationFrame();
      return getCanvasSnapshot();
    },
    reorderWorkspaceFolder: async (folderId, targetIndex) => {
      const state = await reorderWorkspaceFolderById(folderId, targetIndex);
      await waitForAnimationFrame();
      return getCanvasSnapshot();
    },
    getDefaultTerminalWorkingDirectory: () => getDefaultTerminalWorkingDirectory(),
    toggleWorkspaceDirectory: async (relativePath) => {
      const workspaceButton = workspaceBrowser.querySelector(`[data-workspace-kind="directory"][data-workspace-path="${CSS.escape(relativePath)}"]`);

      if (workspaceButton instanceof HTMLButtonElement) {
        workspaceButton.click();
        await waitForAnimationFrame();
      }

      return getCanvasSnapshot();
    },
    selectWorkspaceFile: async (relativePath) => {
      const workspaceButton = workspaceBrowser.querySelector(`[data-workspace-kind="file"][data-workspace-path="${CSS.escape(relativePath)}"]`);

      if (workspaceButton instanceof HTMLButtonElement) {
        workspaceButton.click();
        await waitForAnimationFrame();
      }

      return getCanvasSnapshot();
    },
    refreshSelectedWorkspaceFilePreview: async () => {
      const refreshButton = fileInspector?.querySelector('[data-file-inspector-action="refresh"]');

      if (refreshButton instanceof HTMLButtonElement) {
        refreshButton.click();
        await waitForAnimationFrame();
      }

      return getCanvasSnapshot();
    },
    populateWorkspaceEntries: async (count = 120) => {
      const entryCount = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 120;
      applyWorkspaceState({
        importedFolders: [{
          id: "workspace-folder-debug",
          rootPath: "/tmp/termcanvas-workspace-debug",
          rootName: "canvas_desktop",
          isTruncated: false,
          lastError: "",
          entries: Array.from({ length: entryCount }, (_value, index) => ({
            name: `file-${index + 1}.txt`,
            relativePath: `nested/path/file-${index + 1}.txt`,
            kind: "file"
          }))
        }],
        activeFolderId: "workspace-folder-debug"
      });
      openWorkspaceDrawer();
      await waitForAnimationFrame();
      return getCanvasSnapshot();
    },
    updateLastExportedCanvasFirstCwd: (cwd) => {
      if (
        lastExportedCanvasDebugPayload === null
        || !Array.isArray(lastExportedCanvasDebugPayload.canvas?.terminalNodes)
        || lastExportedCanvasDebugPayload.canvas.terminalNodes[0] == null
      ) {
        throw new Error("No exported canvas payload available.");
      }

      lastExportedCanvasDebugPayload.canvas.terminalNodes[0].cwd = cwd;
      return lastExportedCanvasDebugPayload;
    },
    setFirstTerminalWorkingDirectory: async (cwd) => {
      const firstNode = getActiveCanvas()?.nodes[0];

      if (firstNode?.terminalId && typeof cwd === "string" && cwd.length > 0) {
        await window.noteCanvas.writeTerminal(firstNode.terminalId, `cd '${escapeShellPathForSingleQuotes(cwd)}'\r`);
      }

      return getCanvasSnapshot();
    },
    resolveFirstTerminalWorkingDirectory: async () => {
      const firstNode = getActiveCanvas()?.nodes[0];

      if (!(typeof firstNode?.terminalId === "string")) {
        return null;
      }

      const cwdByTerminalId = await window.noteCanvas.resolveTrackedTerminalCwds([firstNode.terminalId]);
      return cwdByTerminalId?.[firstNode.terminalId] ?? null;
    },
    toggleSidebar: () => {
      toggleSidebar();
      return getCanvasSnapshot();
    },
    panBoardByWheel: (deltaX = 0, deltaY = 0, target = "board") => {
      const firstNode = getActiveCanvas()?.nodes[0];
      const eventTarget = target === "nodes-layer"
        ? nodesLayer
        : target === "terminal" && firstNode?.terminalMount instanceof HTMLElement
          ? firstNode.terminalMount
          : board;
      const boardRect = board.getBoundingClientRect();
      const wheelEvent = new WheelEvent("wheel", {
        bubbles: true,
        cancelable: true,
        deltaX,
        deltaY,
        clientX: boardRect.left + (boardRect.width / 2),
        clientY: boardRect.top + (boardRect.height / 2)
      });
      eventTarget.dispatchEvent(wheelEvent);
      return window.__canvasLearningDebug.getSnapshot();
    },
    zoomBoardByWheel: (deltaY = 0, boardX = board.clientWidth / 2, boardY = board.clientHeight / 2, target = "board", modifier = "meta") => {
      const firstNode = getActiveCanvas()?.nodes[0];
      const eventTarget = target === "nodes-layer"
        ? nodesLayer
        : target === "terminal" && firstNode?.terminalMount instanceof HTMLElement
          ? firstNode.terminalMount
            : board;
      const boardRect = board.getBoundingClientRect();
      const wheelEvent = new WheelEvent("wheel", {
        bubbles: true,
        cancelable: true,
        deltaY,
        clientX: boardRect.left + boardX,
        clientY: boardRect.top + boardY,
        metaKey: modifier === "meta",
        ctrlKey: modifier === "ctrl"
      });
      eventTarget.dispatchEvent(wheelEvent);
      return window.__canvasLearningDebug.getSnapshot();
    },
    sendToFirstTerminal: async (data) => {
      const firstNode = getActiveCanvas()?.nodes[0];

      if (firstNode !== undefined) {
        await window.noteCanvas.writeTerminal(firstNode.terminalId, data);
      }
    }
  };
}

createCanvasButton.addEventListener("click", () => {
  createCanvas();
});

exportCanvasButton?.addEventListener("click", () => {
  void exportActiveCanvas().catch((error) => {
    console.error(error);
  });
});

importCanvasButton?.addEventListener("click", () => {
  void importCanvas().catch((error) => {
    console.error(error);
  });
});

exportAppSessionButton?.addEventListener("click", () => {
  void exportAppSessionData().catch((error) => {
    console.error(error);
  });
});

importAppSessionButton?.addEventListener("click", () => {
  void importAppSessionData().catch((error) => {
    console.error(error);
  });
});

canvasSwitcherButton?.addEventListener("click", (event) => {
  event.preventDefault();
  toggleCanvasSwitcherMenu();
});

canvasStripList?.addEventListener("scroll", () => {
  scheduleCanvasStripOverflowControlsSync();
});

terminalStripList?.addEventListener("scroll", () => {
  scheduleTerminalStripOverflowControlsSync();
});

canvasStripPrevButton?.addEventListener("click", () => {
  scrollCanvasStrip("backward");
});

canvasStripNextButton?.addEventListener("click", () => {
  scrollCanvasStrip("forward");
});

terminalStripPrevButton?.addEventListener("click", () => {
  scrollTerminalStrip("backward");
});

terminalStripNextButton?.addEventListener("click", () => {
  scrollTerminalStrip("forward");
});

window.addEventListener("resize", () => {
  scheduleCanvasStripOverflowControlsSync();
  scheduleTerminalStripOverflowControlsSync();
});

openWorkspaceButton?.addEventListener("click", () => {
  void chooseCanvasWorkspace().catch((error) => {
    console.error(error);
  });
});

refreshWorkspaceButton?.addEventListener("click", () => {
  void refreshWorkspaceDirectory().catch((error) => {
    console.error(error);
  });
});

createWorkspaceFileButton?.addEventListener("click", () => {
  void createWorkspaceFileAtSelection().catch((error) => {
    showWorkspaceActionError(error);
  });
});

createWorkspaceDirectoryButton?.addEventListener("click", () => {
  void createWorkspaceDirectoryAtSelection().catch((error) => {
    showWorkspaceActionError(error);
  });
});

renameWorkspaceEntryButton?.addEventListener("click", () => {
  void renameSelectedWorkspaceEntry().catch((error) => {
    showWorkspaceActionError(error);
  });
});

deleteWorkspaceEntryButton?.addEventListener("click", () => {
  void deleteSelectedWorkspaceEntry().catch((error) => {
    showWorkspaceActionError(error);
  });
});

sidebarToggleButton?.addEventListener("click", () => {
  toggleSidebar();
});

if (sidebarResizeHandle instanceof HTMLElement) {
  sidebarResizeHandle.addEventListener("pointerdown", (event) => {
    startPanelResize(event, sidebarResizeHandle, "sidebar");
  });
}

if (fileInspectorResizeHandle instanceof HTMLElement) {
  fileInspectorResizeHandle.addEventListener("pointerdown", (event) => {
    startPanelResize(event, fileInspectorResizeHandle, "inspector");
  });
}

workspaceActionDialogBackdrop?.addEventListener("click", () => {
  resolveWorkspaceActionDialog(null);
});

workspaceActionDialogInput?.addEventListener("input", () => {
  workspaceActionDialogState.value = workspaceActionDialogInput.value;
});

workspaceActionDialogCancelButton?.addEventListener("click", () => {
  resolveWorkspaceActionDialog(null);
});

workspaceActionDialogForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  const submitValue = getWorkspaceActionDialogSubmitValue(workspaceActionDialogState);

  if (workspaceActionDialogState.kind === "prompt" && submitValue === null) {
    workspaceActionDialogInput?.focus();
    return;
  }

  resolveWorkspaceActionDialog(submitValue);
});


boardFullscreenExitButton?.addEventListener("click", (event) => {
  event.preventDefault();
  const visibleMaximizedNode = getVisibleMaximizedNode();

  if (visibleMaximizedNode !== null) {
    setNodeMaximized(visibleMaximizedNode, false);
  }
});

board.addEventListener("pointerdown", handleBoardPointerDown);
board.addEventListener("pointermove", handleBoardPointerMove);
board.addEventListener("pointerup", handleBoardPointerUp);
board.addEventListener("pointercancel", handleBoardPointerCancel);
board.addEventListener("wheel", handleBoardWheel, { passive: false });
board.addEventListener("dblclick", handleBoardDoubleClick);
renderWorkspaceActionDialog();
window.addEventListener("click", handleWindowClick);
window.addEventListener("pointermove", handleWindowPointerMove);
window.addEventListener("pointerup", handleWindowPointerUp);
window.addEventListener("pointercancel", handleWindowPointerCancel);
window.addEventListener("keydown", handleWindowKeyDown);
