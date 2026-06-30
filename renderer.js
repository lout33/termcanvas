const {
  normalizeCanvasWorkspaceRecord,
  syncCanvasWorkspaceFromLiveState,
  toggleCanvasWorkspaceExpandedDirectory,
  deriveCanvasWorkspaceAfterRestore,
  deriveWorkspaceEntryActionState,
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
  deriveTerminalStripViewModel,
  deriveTerminalStripDropTarget
} = window.noteCanvasRendererCanvasSwitcher;
const {
  shouldHandleCanvasWheel,
  shouldTerminalHandleWheel,
  shouldClearActiveTerminalSelection,
  shouldSelectTerminal,
  shouldEnableTerminalInteractionOverlay,
  shouldShowBoardHintsForCanvas,
  deriveTerminalStripActivation,
  getViewportOffsetForScaleAtPoint,
  getViewportOffsetToCenterBounds,
  getViewportOffsetToCenterNode,
  getStripScrollTarget,
  getStripOverflowTargetIndex
} = window.noteCanvasRendererCanvasNavigation;
const {
  deriveWorkspacePreviewViewModel,
  shouldApplyWorkspacePreviewActionError
} = window.noteCanvasRendererWorkspacePreview;
const {
  deriveCanvasDelegationEdges
} = window.noteCanvasRendererCanvasDelegation;
const {
  createMarkdownEditor,
  createCodeEditor
} = window.noteCanvasRendererWorkspaceMarkdown ?? {};

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
const canvasEdgeLayer = document.getElementById("canvas-edge-layer");
const emptyState = document.getElementById("empty-state");
const boardHints = document.getElementById("board-hints");
const boardNavigation = document.getElementById("board-navigation");
const boardZoomIndicator = document.getElementById("board-zoom-indicator");
const boardZoomOutButton = document.getElementById("board-zoom-out-button");
const boardZoomInButton = document.getElementById("board-zoom-in-button");
const boardCenterViewButton = document.getElementById("board-center-view-button");
const boardFullscreenExitButton = document.getElementById("board-fullscreen-exit");
const boardWelcome = document.getElementById("board-welcome");
const boardWelcomeOpenButton = document.getElementById("board-welcome-open-button");
const boardMinimap = document.getElementById("board-minimap");
const boardMinimapCanvas = document.getElementById("board-minimap-canvas");
const boardMinimapViewport = document.getElementById("board-minimap-viewport");
const canvasBreadcrumb = document.getElementById("canvas-breadcrumb");
const canvasPanelTitle = document.getElementById("canvas-panel-title");
const canvasPanelPills = document.getElementById("canvas-panel-pills");
const canvasActionsMenuRoot = document.getElementById("canvas-actions-menu-root");
const canvasActionsMenuButton = document.getElementById("canvas-actions-menu-button");
const canvasActionsMenu = document.getElementById("canvas-actions-menu");
const closeActiveCanvasButton = document.getElementById("close-active-canvas-button");
const canvasSwitcherSection = document.getElementById("canvas-switcher-section");
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
const installAgentSkillButton = document.getElementById("install-agent-skill-button");
const focusWorkspaceSearchButton = document.getElementById("focus-workspace-search-button");
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
const railToggleButton = document.getElementById("rail-toggle-button");
const sidebarToggleButton = document.getElementById("sidebar-toggle-button");
const sidebarResizeHandle = document.getElementById("sidebar-resize-handle");
const sidebarPanel = document.querySelector(".canvas-sidebar-panel");
const TerminalConstructor = window.Terminal;
const FitAddonConstructor = window.FitAddon?.FitAddon;
const Unicode11AddonConstructor = window.Unicode11Addon?.Unicode11Addon;
const DRAG_THRESHOLD = 3;
const CANVAS_EXPORT_VERSION = 3;
const LEGACY_CANVAS_EXPORT_VERSION = 1;
const SUPPORTED_CANVAS_EXPORT_VERSIONS = [LEGACY_CANVAS_EXPORT_VERSION, 2, CANVAS_EXPORT_VERSION];
const MAX_CANVAS_NAME_LENGTH = 80;
const MAX_TERMINAL_TITLE_LENGTH = 80;
const WHEEL_LINE_DELTA_PX = 16;
const CANVAS_SCALE_MIN = 0.25;
const CANVAS_SCALE_MAX = 1.8;
const CANVAS_SCALE_STEP = 0.0022;
const CANVAS_SCALE_STEP_FACTOR = 1.22;
const CANVAS_SCALE_PRECISION = 1000;
const CANVAS_ZOOM_WHEEL_DELTA_LIMIT = 140;
const DEFAULT_NODE_WIDTH = 424;
const DEFAULT_NODE_HEIGHT = 276;
const MIN_NODE_WIDTH = 288;
const MIN_NODE_HEIGHT = 184;
const MIN_SIDEBAR_PANEL_WIDTH = 224;
const MIN_FILE_INSPECTOR_WIDTH = 240;
const PANEL_VIEWPORT_MARGIN = 24;
const MIN_CANVAS_COLUMN_WIDTH = 360;
const ZOOM_INDICATOR_VISIBLE_MS = 1200;
const RESIZE_HANDLE_DIRECTIONS = ["n", "s", "e", "w", "nw", "ne", "sw", "se"];
const APP_SESSION_VERSION = 1;
const APP_SESSION_SAVE_DEBOUNCE_MS = 180;
const CANVAS_AGENT_SYNC_INTERVAL_MS = 6000;
const MAX_WORKSPACE_PREVIEW_TABS = 5;
const TERMINAL_MIN_COLS = 20;
const TERMINAL_MIN_ROWS = 8;
const TERMINAL_FALLBACK_COLS = 80;
const TERMINAL_FALLBACK_ROWS = 24;
const TERMINAL_LAYOUT_SETTLE_DELAYS_MS = [80, 240];
const OSC52_CLIPBOARD_MAX_BYTES = 1024 * 1024;
const AGENT_SKILL_INSTALL_PROMPT_DISMISSED_KEY = "termcanvas.agentSkillInstallPromptDismissed";

let terminalCount = 0;
let canvasCount = 0;
const canvases = [];
const canvasMap = new Map();
const terminalNodeMap = new Map();
let activeCanvasId = null;
let activeNodeRecord = null;
let activeTitleEditorRecord = null;
let activeTerminalNodeMenuRecord = null;
let activeCanvasRenameId = null;
let isRailCollapsed = false;
let isSidebarCollapsed = true;
let hasDismissedBoardIntro = false;
let isWindowUnloading = false;
let renderedCanvasId = null;
let viewportRenderFrame = 0;
let terminalSizeSyncFrame = 0;
let terminalRefreshFrame = 0;
let shouldRefreshTerminalsAfterViewportRender = false;
let zoomIndicatorTimeout = 0;
let canvasStripOverflowSyncFrame = 0;
let terminalStripOverflowSyncFrame = 0;
let shouldEnsureActiveCanvasStripItemVisible = false;
let shouldEnsureActiveTerminalStripItemVisible = false;
const pendingTerminalSizeNodes = new Set();
const pendingTerminalRefreshNodes = new Set();
let pendingCanvasListFocus = null;
let isCanvasActionsMenuOpen = false;
let isCanvasSwitcherMenuOpen = false;
let lastExportedCanvasDebugPayload = null;
let workspacePreviewRequestId = 0;
let workspacePreviewObjectUrl = null;
let workspacePreviewTabs = [];
let workspaceStateHydrationToken = 0;
let activeCanvasWorkspaceRestoreToken = 0;
let pendingWorkspaceDirectoryRefresh = false;
let appSessionSaveTimeout = 0;
let isSessionHydrating = false;
let workspaceFilterQuery = "";
let canvasAgentSyncTimeout = 0;
let isCanvasAgentSyncInFlight = false;
let workspaceActionDialogResolve = null;
let isAgentSkillInstallDialogOpen = false;
let workspaceMarkdownEditor = null;
let pendingWorkspacePreviewOwnSave = null;
let pendingWorkspacePreviewSaveAfterCurrent = false;

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
  saveErrorMessage: "",
  isDirty: false,
  isSaving: false
};

const workspaceSelectionState = {
  folderId: null,
  relativePath: null,
  kind: null
};

const workspaceDirectoryLoadState = {
  folderId: null,
  relativePath: null
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

function normalizeManagedAgentName(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function normalizeManagedAgentRole(value, isManager = false) {
  if (value === "commander" || value === "project_manager") {
    return "commander";
  }

  if (value === "worker" || value === "project_worker") {
    return "worker";
  }

  return isManager ? "commander" : "agent";
}

function normalizeOptionalString(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function normalizeImportedSessionKey(value) {
  return typeof value === "string" && /^[A-Za-z0-9_-]+$/u.test(value)
    ? value
    : null;
}

function getManagedAgentRoleLabel(role) {
  if (role === "commander") {
    return "Commander";
  }

  if (role === "worker") {
    return "Worker";
  }

  return "Agent";
}

function getTerminalNodeRoleLabel(nodeRecord) {
  if (nodeRecord?.managedAgentName !== null && nodeRecord?.managedAgentName !== undefined) {
    return getManagedAgentRoleLabel(normalizeManagedAgentRole(nodeRecord.managedAgentRole, nodeRecord.isManager));
  }

  return "Terminal";
}

function getManagedAgentNodeTitle(options = {}) {
  const agentName = normalizeManagedAgentName(options.agentName);

  if (agentName === null) {
    return typeof options.title === "string" ? options.title : "";
  }

  const role = normalizeManagedAgentRole(options.role, options.isManager === true);
  return `${agentName} (${getManagedAgentRoleLabel(role)})`;
}

function getNodeSessionIdentifier(nodeRecord) {
  return nodeRecord.backend === "tmux"
    ? (nodeRecord.tmuxSessionName ?? `termcanvas-${nodeRecord.sessionKey}`)
    : nodeRecord.sessionKey;
}

async function copyTextToClipboard(text) {
  if (typeof text !== "string" || text.length === 0) {
    return false;
  }

  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall back to a temporary selection-based copy when clipboard API is unavailable.
  }

  const fallbackTextArea = document.createElement("textarea");
  fallbackTextArea.value = text;
  fallbackTextArea.setAttribute("readonly", "readonly");
  fallbackTextArea.style.position = "fixed";
  fallbackTextArea.style.opacity = "0";
  fallbackTextArea.style.pointerEvents = "none";
  document.body.append(fallbackTextArea);
  fallbackTextArea.select();
  fallbackTextArea.setSelectionRange(0, fallbackTextArea.value.length);

  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    fallbackTextArea.remove();
  }
}

function decodeOsc52ClipboardPayload(payload) {
  if (typeof payload !== "string" || payload.length === 0) {
    return null;
  }

  const estimatedBytes = Math.floor((payload.length * 3) / 4);

  if (estimatedBytes > OSC52_CLIPBOARD_MAX_BYTES) {
    return null;
  }

  try {
    const binaryText = window.atob(payload);
    const bytes = Uint8Array.from(binaryText, (character) => character.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

function handleOsc52ClipboardData(data, nodeRecord) {
  if (nodeRecord?.backend !== "tmux" || typeof data !== "string") {
    return false;
  }

  const separatorIndex = data.indexOf(";");

  if (separatorIndex < 0) {
    return true;
  }

  const payload = data.slice(separatorIndex + 1);
  const text = decodeOsc52ClipboardPayload(payload);

  if (text === null || text.length === 0) {
    return true;
  }

  void copyTextToClipboard(text);
  return true;
}

function registerTerminalClipboardBridge(terminal, nodeRecord) {
  if (typeof terminal?.parser?.registerOscHandler !== "function") {
    return;
  }

  terminal.parser.registerOscHandler(52, (data) => handleOsc52ClipboardData(data, nodeRecord));
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
  nodeRecord.menuButton?.setAttribute("aria-label", `Terminal actions for ${nodeRecord.titleText}`);
  nodeRecord.closeButton?.setAttribute("aria-label", `Close terminal ${nodeRecord.titleText}`);
  nodeRecord.renameButton?.setAttribute("aria-label", `Rename terminal ${nodeRecord.titleText}`);
}

function setNodeTitleEditing(nodeRecord, isEditing) {
  if (!(nodeRecord.titleInput instanceof HTMLInputElement)) {
    return;
  }

  nodeRecord.isTitleEditing = isEditing;
  nodeRecord.titleInput.readOnly = !isEditing;
  nodeRecord.titleInput.tabIndex = isEditing ? 0 : -1;
  nodeRecord.titleInput.classList.toggle("is-editing", isEditing);
  nodeRecord.renameButton?.setAttribute("aria-pressed", String(isEditing));
}

function startNodeTitleEditing(nodeRecord) {
  if (!(nodeRecord.titleInput instanceof HTMLInputElement)) {
    return;
  }

  if (activeTitleEditorRecord !== null && activeTitleEditorRecord !== nodeRecord) {
    activeTitleEditorRecord.titleInput?.blur();
  }

  setNodeTitleEditing(nodeRecord, true);
  nodeRecord.titleInput.focus();
}

function commitNodeTitle(nodeRecord, rawTitle) {
  const nextTitle = normalizeTerminalTitle(rawTitle, getDefaultTerminalTitle(nodeRecord));
  nodeRecord.titleText = nextTitle;
  updateNodeTitleInput(nodeRecord);
  setNodeTitleEditing(nodeRecord, false);
  syncMaximizeButton(nodeRecord);
  renderTerminalStrip();
  scheduleAppSessionSave();
}

function cancelNodeTitleEditing(nodeRecord) {
  if (activeTitleEditorRecord === nodeRecord) {
    activeTitleEditorRecord = null;
  }

  updateNodeTitleInput(nodeRecord);
  setNodeTitleEditing(nodeRecord, false);
}

function syncMaximizeButton(nodeRecord) {
  if (!(nodeRecord.maximizeButton instanceof HTMLButtonElement)) {
    return;
  }

  const isMaximized = nodeRecord.isMaximized;
  nodeRecord.maximizeButton.innerHTML = isMaximized
    ? '<svg class="terminal-node-control-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M5.25 3.75h7v7"></path><path d="M10.75 12.25h-7v-7"></path><path d="M12.25 3.75 8.75 7.25"></path><path d="M3.75 12.25 7.25 8.75"></path></svg><span class="terminal-node-maximize-label">Exit fullscreen</span>'
    : '<svg class="terminal-node-control-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.75 6.25v-2.5h2.5"></path><path d="M12.25 9.75v2.5h-2.5"></path><path d="M3.75 3.75 7.25 7.25"></path><path d="M12.25 12.25 8.75 8.75"></path></svg>';
  nodeRecord.maximizeButton.title = isMaximized ? "Exit fullscreen" : "Maximize terminal";
  nodeRecord.maximizeButton.setAttribute(
    "aria-label",
    isMaximized ? `Exit fullscreen for ${nodeRecord.titleText}` : `Maximize ${nodeRecord.titleText}`
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
        positionNode(candidateRecord);
        syncMaximizeButton(candidateRecord);
        scheduleTerminalSizeSync([candidateRecord], { settle: true });
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
  scheduleTerminalSizeSync([nodeRecord], { settle: true });
  requestAnimationFrame(() => {
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

function classifyNodeStatusState(text) {
  const value = String(text ?? "").toLowerCase();
  if (value.includes("exit") || value.includes("fail") || value.includes("ended")) {
    return "exited";
  }
  if (value.includes("live") || value.includes("running") || value.includes("active") || value.includes("ready")) {
    return "live";
  }
  return "pending";
}

function setTerminalNodeStatus(nodeRecord, text) {
  const label = typeof text === "string" && text.length > 0 ? text : "—";
  if (nodeRecord.statusLabel) {
    nodeRecord.statusLabel.textContent = label;
  } else if (nodeRecord.status) {
    nodeRecord.status.textContent = label;
  }
  const state = classifyNodeStatusState(label);
  if (nodeRecord.status) {
    nodeRecord.status.dataset.state = state;
    nodeRecord.status.title = label;
  }
  if (nodeRecord.element) {
    nodeRecord.element.dataset.state = state;
  }
}

function getTerminalNodeStatusText(nodeRecord) {
  if (nodeRecord.statusLabel) {
    return nodeRecord.statusLabel.textContent;
  }
  return nodeRecord.status ? nodeRecord.status.textContent : "";
}

function setNodeExitedState(nodeRecord, exitCode, signal) {
  nodeRecord.isExited = true;
  nodeRecord.exitCode = typeof exitCode === "number" ? exitCode : null;
  nodeRecord.exitSignal = typeof signal === "string" ? signal : null;
  nodeRecord.resizeObserver?.disconnect();
  nodeRecord.resizeObserver = null;
  nodeRecord.syncSize = () => {};
  setTerminalNodeStatus(nodeRecord, "Exited");
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

function formatTerminalMeta(nodeRecord) {
  const backendLabel = nodeRecord.backend === "tmux"
    ? `tmux: ${nodeRecord.tmuxSessionName ?? `termcanvas-${nodeRecord.sessionKey}`}`
    : `pty: ${nodeRecord.sessionKey}`;
  const managedLabel = nodeRecord.managedAgentName === null
    ? null
    : `${getManagedAgentRoleLabel(normalizeManagedAgentRole(nodeRecord.managedAgentRole, nodeRecord.isManager))}: ${nodeRecord.managedAgentName}`;

  return [managedLabel, nodeRecord.shellName, backendLabel].filter((value) => value !== null).join(" · ");
}

function syncTerminalMeta(nodeRecord) {
  const metaText = formatTerminalMeta(nodeRecord);
  nodeRecord.meta.textContent = metaText;
  nodeRecord.meta.title = metaText;
  if (nodeRecord.roleBadge !== null) {
    const roleLabel = getTerminalNodeRoleLabel(nodeRecord);
    nodeRecord.roleBadge.textContent = roleLabel;
    nodeRecord.roleBadge.dataset.role = roleLabel.toLowerCase();
  }
  const sessionIdentifier = getNodeSessionIdentifier(nodeRecord);
  if (nodeRecord.copySessionButton !== null) {
    nodeRecord.copySessionButton.title = `Copy session id: ${sessionIdentifier}`;
    nodeRecord.copySessionButton.setAttribute("aria-label", `Copy session id ${sessionIdentifier}`);
  }
  setTerminalNodeStatus(
    nodeRecord,
    nodeRecord.isExited
      ? getTerminalNodeStatusText(nodeRecord)
      : (nodeRecord.managedRuntimeState ?? "Live")
  );
}

function setNodeLiveState(nodeRecord, shellName, backend, tmuxSessionName, sessionKey) {
  nodeRecord.isExited = false;
  nodeRecord.exitCode = null;
  nodeRecord.exitSignal = null;
  nodeRecord.shellName = shellName;
  nodeRecord.backend = backend;
  nodeRecord.tmuxSessionName = tmuxSessionName;
  nodeRecord.sessionKey = sessionKey;
  setTerminalNodeStatus(nodeRecord, "Live");
  syncTerminalMeta(nodeRecord);
  nodeRecord.element.classList.remove("is-exited");
  updateExitedOverlay(nodeRecord);
  scheduleAppSessionSave();
}

function syncManagedNodeState(nodeRecord, agentSnapshot) {
  nodeRecord.managedAgentName = normalizeManagedAgentName(agentSnapshot?.name);
  nodeRecord.isManager = agentSnapshot?.is_project_manager === true;
  nodeRecord.managedAgentRole = nodeRecord.managedAgentName === null
    ? null
    : normalizeManagedAgentRole(agentSnapshot?.role, nodeRecord.isManager);
  nodeRecord.managedProjectTag = typeof agentSnapshot?.project === "string" && agentSnapshot.project.length > 0
    ? agentSnapshot.project
    : null;
  nodeRecord.managedParentAgent = normalizeManagedAgentName(agentSnapshot?.parent_agent);
  nodeRecord.managedCommanderAgent = normalizeManagedAgentName(agentSnapshot?.commander_agent);
  nodeRecord.managedDepth = Number.isInteger(agentSnapshot?.depth) ? agentSnapshot.depth : null;
  nodeRecord.managedRuntimeState = typeof agentSnapshot?.runtime_state === "string" && agentSnapshot.runtime_state.length > 0
    ? agentSnapshot.runtime_state
    : null;
  nodeRecord.managedAgentState = typeof agentSnapshot?.agent_state === "string" && agentSnapshot.agent_state.length > 0
    ? agentSnapshot.agent_state
    : null;
  nodeRecord.tmuxSessionName = typeof agentSnapshot?.tmux_session === "string" && agentSnapshot.tmux_session.length > 0
    ? agentSnapshot.tmux_session
    : nodeRecord.tmuxSessionName;
  nodeRecord.cwd = typeof agentSnapshot?.workdir === "string" && agentSnapshot.workdir.length > 0
    ? agentSnapshot.workdir
    : nodeRecord.cwd;
  nodeRecord.titleText = getManagedAgentNodeTitle({
    agentName: nodeRecord.managedAgentName,
    role: nodeRecord.managedAgentRole,
    isManager: nodeRecord.isManager,
    title: nodeRecord.titleText
  });
  updateNodeTitleInput(nodeRecord);
  if (nodeRecord.isManager) {
    nodeRecord.closeButton?.setAttribute("disabled", "disabled");
    nodeRecord.closeButton.title = "The canvas manager stays attached to this project.";
  } else if (nodeRecord.closeButton !== null) {
    nodeRecord.closeButton.removeAttribute("disabled");
    nodeRecord.closeButton.title = "";
  }
  syncTerminalMeta(nodeRecord);
  scheduleCanvasEdgeRender();
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
    allowProposedApi: true,
    cursorBlink: true,
    convertEol: false,
    allowTransparency: false,
    customGlyphs: false,
    drawBoldTextInBrightColors: true,
    fontFamily: terminalTheme.fontFamily,
    fontSize: terminalTheme.fontSize,
    fontWeight: 400,
    fontWeightBold: 700,
    letterSpacing: 0,
    lineHeight: terminalTheme.lineHeight,
    macOptionClickForcesSelection: true,
    minimumContrastRatio: 1,
    rescaleOverlappingGlyphs: true,
    termName: "xterm-256color",
    scrollback: 1200,
    theme: terminalTheme.theme
  });
  const fitAddon = new FitAddonConstructor();

  terminal.loadAddon(fitAddon);
  enableTerminalUnicodeWidthSupport(terminal);
  registerTerminalClipboardBridge(terminal, nodeRecord);
  terminal.open(nodeRecord.terminalMount);
  terminal.attachCustomWheelEventHandler((event) => {
    return shouldTerminalHandleWheel({
      terminalNodeElement: nodeRecord.element,
      activeNodeElement: activeNodeRecord?.element ?? null
    });
  });
  nodeRecord.terminalId = terminalId;
  nodeRecord.terminal = terminal;
  nodeRecord.fitAddon = fitAddon;
  terminalNodeMap.set(terminalId, nodeRecord);

  const initialSize = fitTerminalNode(nodeRecord) ?? {
    cols: TERMINAL_FALLBACK_COLS,
    rows: TERMINAL_FALLBACK_ROWS
  };
  scheduleTerminalRefresh([nodeRecord]);

  let resizeFrame = 0;
  let lastSyncedCols = initialSize.cols;
  let lastSyncedRows = initialSize.rows;

  try {
    const created = await window.noteCanvas.createTerminal({
      terminalId,
      cols: initialSize.cols,
      rows: initialSize.rows,
      cwd: nodeRecord.cwd,
      sessionKey: nodeRecord.sessionKey,
      tmuxSessionName: nodeRecord.tmuxSessionName
    });

    if (nodeRecord.isRemoved) {
      await releaseTerminalSession(nodeRecord);
      return;
    }

    setNodeLiveState(
      nodeRecord,
      created.shellName,
      created.backend,
      typeof created.tmuxSessionName === "string" ? created.tmuxSessionName : null,
      typeof created.sessionKey === "string" ? created.sessionKey : nodeRecord.sessionKey
    );
    syncManagedNodeState(nodeRecord, {
      name: nodeRecord.managedAgentName,
      role: nodeRecord.managedAgentRole,
      project: nodeRecord.managedProjectTag,
      runtime_state: nodeRecord.managedRuntimeState,
      agent_state: nodeRecord.managedAgentState,
      tmux_session: nodeRecord.tmuxSessionName,
      workdir: nodeRecord.cwd,
      is_project_manager: nodeRecord.isManager
    });
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
        resizeFrame = 0;

        if (isWindowUnloading || nodeRecord.isRemoved || nodeRecord.terminal === null) {
          return;
        }

        const fittedSize = fitTerminalNode(nodeRecord);

        if (fittedSize === null) {
          return;
        }

        scheduleTerminalRefresh([nodeRecord]);

        if (fittedSize.cols === lastSyncedCols && fittedSize.rows === lastSyncedRows) {
          return;
        }

        lastSyncedCols = fittedSize.cols;
        lastSyncedRows = fittedSize.rows;
        void window.noteCanvas.resizeTerminal(terminalId, fittedSize.cols, fittedSize.rows);
      });
    };

    const resizeObserver = new ResizeObserver(() => {
      syncSize();
    });

    resizeObserver.observe(nodeRecord.terminalMount);

    nodeRecord.resizeObserver = resizeObserver;
    nodeRecord.syncSize = syncSize;

    scheduleTerminalSizeSync([nodeRecord], { settle: true });

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

  setTerminalNodeStatus(nodeRecord, "Reopening");
  nodeRecord.meta.textContent = "Starting fresh shell";
  nodeRecord.overlay.hidden = true;

  try {
    await releaseTerminalSession(nodeRecord);
    await bindTerminalSession(nodeRecord);
  } catch (error) {
    setNodeExitedState(nodeRecord, null, null);
    setTerminalNodeStatus(nodeRecord, "Restart failed");
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
    const activeRenameInput = canvasStripList?.querySelector(`[data-canvas-id="${canvasId}"][data-canvas-part="rename-input"]`);

    if (activeRenameInput instanceof HTMLInputElement) {
      activeRenameInput.focus();
      activeRenameInput.select();
      return;
    }
  }

  if (activeCanvasRenameId !== null && activeCanvasRenameId !== canvasId) {
    const activeRenameInput = canvasStripList?.querySelector(`[data-canvas-id="${activeCanvasRenameId}"][data-canvas-part="rename-input"]`);

    if (activeRenameInput instanceof HTMLInputElement) {
      commitCanvasRename(activeCanvasRenameId, activeRenameInput.value);
    } else {
      cancelCanvasRename(activeCanvasRenameId);
    }
  }

  activeCanvasRenameId = canvasId;
  isCanvasSwitcherMenuOpen = false;
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
      part: "strip-switch"
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
      part: "strip-switch"
    };
  }

  renderCanvasSwitcher();
}

function focusPendingCanvasListControl() {
  if (!(canvasStripList instanceof HTMLElement) || pendingCanvasListFocus === null) {
    return;
  }

  const { canvasId, part, selectText } = pendingCanvasListFocus;
  pendingCanvasListFocus = null;
  const selector = `[data-canvas-id="${canvasId}"][data-canvas-part="${part}"]`;
  const target = canvasStripList.querySelector(selector);

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

    const nextDropTarget = typeof options.getDropTarget === "function"
      ? options.getDropTarget({
        event,
        item,
        index: options.index,
        sourceIndex: listReorderState.sourceIndex
      })
      : (() => {
          const itemRect = item.getBoundingClientRect();
          const isAfterTarget = (event.clientY - itemRect.top) > (itemRect.height / 2);
          const rawTargetIndex = options.index + (isAfterTarget ? 1 : 0);
          return {
            targetIndex: rawTargetIndex > listReorderState.sourceIndex
              ? rawTargetIndex - 1
              : rawTargetIndex,
            isAfterTarget
          };
        })();

    updateListReorderTarget(item, nextDropTarget.targetIndex, nextDropTarget.isAfterTarget);
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

function reorderTerminalNodeById(nodeId, targetIndex) {
  const activeCanvas = getActiveCanvas();
  const sourceIndex = activeCanvas?.nodes.findIndex((nodeRecord) => String(nodeRecord.id) === String(nodeId)) ?? -1;

  if (activeCanvas === null || sourceIndex < 0 || sourceIndex === targetIndex) {
    return;
  }

  activeCanvas.nodes = moveArrayItemLocal(activeCanvas.nodes, sourceIndex, targetIndex);
  renderTerminalStrip();
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

  const didScaleChange = activeCanvas.viewportScale !== resolvedScale;

  activeCanvas.viewportOffset.x = nextX;
  activeCanvas.viewportOffset.y = nextY;
  activeCanvas.viewportScale = resolvedScale;

  if (didScaleChange) {
    shouldRefreshTerminalsAfterViewportRender = true;
  }

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
  const normalizedWheelDelta = Math.max(
    -CANVAS_ZOOM_WHEEL_DELTA_LIMIT,
    Math.min(CANVAS_ZOOM_WHEEL_DELTA_LIMIT, wheelDelta)
  );
  const nextScale = roundCanvasScale(currentScale * Math.exp(-normalizedWheelDelta * CANVAS_SCALE_STEP));

  return zoomActiveCanvasToScaleAtPoint(point, nextScale);
}

function getBoardViewportCenterPoint() {
  return {
    x: board.clientWidth / 2,
    y: board.clientHeight / 2
  };
}

function zoomActiveCanvasToScaleAtPoint(point, nextScale) {
  const activeCanvas = getActiveCanvas();

  if (activeCanvas === null || !Number.isFinite(point?.x) || !Number.isFinite(point?.y)) {
    return false;
  }

  const currentScale = activeCanvas.viewportScale;
  const resolvedScale = roundCanvasScale(nextScale);

  if (resolvedScale === currentScale) {
    return false;
  }

  const nextOffset = getViewportOffsetForScaleAtPoint({
    pointX: point.x,
    pointY: point.y,
    viewportOffsetX: activeCanvas.viewportOffset.x,
    viewportOffsetY: activeCanvas.viewportOffset.y,
    currentScale,
    nextScale: resolvedScale
  });

  const didZoom = setActiveCanvasViewport(nextOffset.x, nextOffset.y, resolvedScale);

  if (didZoom) {
    showBoardZoomIndicator(resolvedScale);
  }

  return didZoom;
}

function zoomActiveCanvasByStep(direction, point = getBoardViewportCenterPoint()) {
  const activeCanvas = getActiveCanvas();

  if (activeCanvas === null) {
    return false;
  }

  const nextScale = direction === "out"
    ? activeCanvas.viewportScale / CANVAS_SCALE_STEP_FACTOR
    : activeCanvas.viewportScale * CANVAS_SCALE_STEP_FACTOR;

  return zoomActiveCanvasToScaleAtPoint(point, nextScale);
}

function resetActiveCanvasZoom(point = getBoardViewportCenterPoint()) {
  return zoomActiveCanvasToScaleAtPoint(point, 1);
}

function centerActiveCanvasContent() {
  const activeCanvas = getActiveCanvas();

  if (activeCanvas === null) {
    return false;
  }

  if (activeNodeRecord?.canvas === activeCanvas && activeNodeRecord.isRemoved !== true) {
    return centerViewportOnNode(activeNodeRecord);
  }

  if (!Array.isArray(activeCanvas.nodes) || activeCanvas.nodes.length === 0) {
    return setActiveCanvasViewport(0, 0, 1);
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  activeCanvas.nodes.forEach((nodeRecord) => {
    minX = Math.min(minX, nodeRecord.x);
    minY = Math.min(minY, nodeRecord.y);
    maxX = Math.max(maxX, nodeRecord.x + nodeRecord.width);
    maxY = Math.max(maxY, nodeRecord.y + nodeRecord.height);
  });

  const nextOffset = getViewportOffsetToCenterBounds({
    boundsX: minX,
    boundsY: minY,
    boundsWidth: maxX - minX,
    boundsHeight: maxY - minY,
    viewportScale: activeCanvas.viewportScale,
    viewportWidth: board.clientWidth,
    viewportHeight: board.clientHeight
  });

  return setActiveCanvasViewportOffset(nextOffset.x, nextOffset.y);
}

function isViewportZoomModifierPressed(event) {
  return event.metaKey || event.ctrlKey;
}

function isTypingTarget(target) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || target instanceof HTMLSelectElement
    || target.isContentEditable;
}

function updateSidebarToggleButton() {
  if (!(sidebarToggleButton instanceof HTMLButtonElement)) {
    return;
  }

  const actionLabel = isSidebarCollapsed ? "Show file navigator" : "Hide file navigator";

  sidebarToggleButton.setAttribute("aria-label", `${actionLabel} with Command+B`);
  sidebarToggleButton.setAttribute("aria-pressed", String(!isSidebarCollapsed));
  sidebarToggleButton.title = actionLabel;
}

function updateRailToggleButton() {
  if (!(railToggleButton instanceof HTMLButtonElement)) {
    return;
  }

  const actionLabel = isRailCollapsed ? "Show project rail" : "Hide project rail";

  railToggleButton.setAttribute("aria-label", actionLabel);
  railToggleButton.setAttribute("aria-pressed", String(!isRailCollapsed));
  railToggleButton.title = actionLabel;
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

function setRailCollapsed(nextValue) {
  isRailCollapsed = nextValue === true;
  appShell?.classList.toggle("is-rail-collapsed", isRailCollapsed);
  updateRailToggleButton();
  scheduleCanvasStripOverflowControlsSync({ ensureActiveVisible: true });

  const activeCanvas = getActiveCanvas();

  if (activeCanvas !== null) {
    scheduleTerminalSizeSync(activeCanvas.nodes, { settle: true });
  }

  scheduleAppSessionSave();
}

function toggleRail() {
  setRailCollapsed(!isRailCollapsed);
}

function setCanvasActionsMenuOpen(nextValue, options = {}) {
  isCanvasActionsMenuOpen = nextValue === true;

  if (canvasActionsMenu instanceof HTMLElement) {
    canvasActionsMenu.hidden = !isCanvasActionsMenuOpen;
  }

  if (canvasActionsMenuButton instanceof HTMLButtonElement) {
    canvasActionsMenuButton.setAttribute("aria-expanded", isCanvasActionsMenuOpen ? "true" : "false");
    canvasActionsMenuButton.classList.toggle("is-active", isCanvasActionsMenuOpen);

    if (options.restoreFocus === true) {
      canvasActionsMenuButton.focus();
    }
  }
}

function closeCanvasActionsMenu(options = {}) {
  setCanvasActionsMenuOpen(false, options);
}

function toggleCanvasActionsMenu() {
  setCanvasActionsMenuOpen(!isCanvasActionsMenuOpen);
}

function setTerminalNodeMenuOpen(nodeRecord, nextValue, options = {}) {
  if (nextValue === true && activeTerminalNodeMenuRecord !== null && activeTerminalNodeMenuRecord !== nodeRecord) {
    setTerminalNodeMenuOpen(activeTerminalNodeMenuRecord, false);
  }

  const isOpen = nextValue === true && nodeRecord !== null && !nodeRecord.isRemoved;

  if (nodeRecord?.menuPopover instanceof HTMLElement) {
    nodeRecord.menuPopover.hidden = !isOpen;
  }

  if (nodeRecord?.menuButton instanceof HTMLButtonElement) {
    nodeRecord.menuButton.setAttribute("aria-expanded", isOpen ? "true" : "false");
    nodeRecord.menuButton.classList.toggle("is-active", isOpen);

    if (!isOpen && options.restoreFocus === true) {
      nodeRecord.menuButton.focus();
    }
  }

  activeTerminalNodeMenuRecord = isOpen
    ? nodeRecord
    : activeTerminalNodeMenuRecord === nodeRecord
      ? null
      : activeTerminalNodeMenuRecord;
}

function closeTerminalNodeMenu(options = {}) {
  if (activeTerminalNodeMenuRecord !== null) {
    setTerminalNodeMenuOpen(activeTerminalNodeMenuRecord, false, options);
  }
}

function toggleTerminalNodeMenu(nodeRecord) {
  setTerminalNodeMenuOpen(nodeRecord, activeTerminalNodeMenuRecord !== nodeRecord);
}

function setCanvasSwitcherMenuOpen(nextValue, options = {}) {
  isCanvasSwitcherMenuOpen = nextValue === true;

  if (options.restoreFocus === true) {
    const activeCanvas = getActiveCanvas();
    const activeCanvasButton = activeCanvas === null
      ? null
      : canvasStripList?.querySelector(`[data-canvas-id="${activeCanvas.id}"][data-canvas-part="strip-switch"]`);
    activeCanvasButton?.focus();
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
  const activeCanvas = getActiveCanvas();
  const terminalNodes = getVisibleCanvasNodes(activeCanvas);
  const activeIndex = activeNodeRecord?.canvas === activeCanvas
    ? terminalNodes.findIndex((nodeRecord) => nodeRecord === activeNodeRecord)
    : -1;

  terminalStripPrevButton.hidden = !overflowState.hasOverflow || terminalNodes.length <= 1;
  terminalStripNextButton.hidden = !overflowState.hasOverflow || terminalNodes.length <= 1;
  terminalStripPrevButton.disabled = activeIndex <= 0;
  terminalStripNextButton.disabled = activeIndex >= terminalNodes.length - 1 && activeIndex >= 0;
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

function activateTerminalStripNode(nodeRecord, options = {}) {
  if (nodeRecord === null) {
    return;
  }

  const activation = deriveTerminalStripActivation({
    isFullscreenMode: getVisibleMaximizedNode() !== null,
    clickCount: options.clickCount
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
}

function activateAdjacentTerminalFromStrip(direction) {
  const activeCanvas = getActiveCanvas();
  const terminalNodes = getVisibleCanvasNodes(activeCanvas);

  if (terminalNodes.length === 0) {
    return;
  }

  const activeIndex = activeNodeRecord?.canvas === activeCanvas
    ? terminalNodes.findIndex((nodeRecord) => nodeRecord === activeNodeRecord)
    : -1;
  const nextIndex = direction === "backward"
    ? Math.max(0, activeIndex < 0 ? 0 : activeIndex - 1)
    : Math.min(terminalNodes.length - 1, activeIndex < 0 ? 0 : activeIndex + 1);

  if (activeIndex === nextIndex && activeIndex >= 0) {
    scheduleTerminalStripOverflowControlsSync({ ensureActiveVisible: true });
    return;
  }

  activateTerminalStripNode(terminalNodes[nextIndex], { clickCount: 1 });
  scheduleTerminalStripOverflowControlsSync({ ensureActiveVisible: true });
}

function createTerminalStripItem(itemView) {
  const stripItem = document.createElement("button");
  stripItem.type = "button";
  stripItem.className = "terminal-strip-item";
  stripItem.textContent = itemView.label;
  stripItem.dataset.nodeId = itemView.id;
  stripItem.setAttribute("role", "tab");
  stripItem.setAttribute("aria-label", `Focus ${itemView.fullLabel ?? itemView.label}`);
  stripItem.title = itemView.fullLabel ?? itemView.label;

  if (itemView.isActive) {
    stripItem.classList.add("is-active");
    stripItem.setAttribute("aria-current", "true");
    stripItem.setAttribute("aria-selected", "true");
  } else {
    stripItem.setAttribute("aria-selected", "false");
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

    activateTerminalStripNode(nodeRecord, { clickCount });
  };

  stripItem.addEventListener("click", (event) => {
    activateNodeFromStrip(event.detail);
  });

  stripItem.addEventListener("dblclick", (event) => {
    event.preventDefault();
    event.stopPropagation();
    activateNodeFromStrip(2);
  });

  const itemIndex = getActiveCanvas()?.nodes.findIndex((nodeRecord) => String(nodeRecord.id) === itemView.id) ?? -1;

  if (itemIndex >= 0) {
    attachReorderableListItem(stripItem, stripItem, {
      kind: "terminal-strip",
      itemId: itemView.id,
      index: itemIndex,
      onMove: async (_nodeId, targetIndex) => reorderTerminalNodeById(itemView.id, targetIndex),
      getDropTarget: ({ event, item, index, sourceIndex }) => {
        const itemRect = item.getBoundingClientRect();

        return deriveTerminalStripDropTarget({
          itemOffset: itemRect.left,
          itemSize: itemRect.width,
          pointerOffset: event.clientX,
          itemIndex: index,
          sourceIndex
        });
      }
    });
  }

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

function getActiveProjectDisplayName() {
  const activeFolder = getActiveWorkspaceFolder();

  if (typeof activeFolder?.rootName === "string" && activeFolder.rootName.length > 0) {
    return activeFolder.rootName;
  }

  const activeCanvas = getActiveCanvas();
  const canvasWorkspace = normalizeCanvasWorkspaceRecord(activeCanvas?.workspace);

  if (typeof canvasWorkspace?.rootName === "string" && canvasWorkspace.rootName.length > 0) {
    return canvasWorkspace.rootName;
  }

  if (typeof canvasWorkspace?.rootPath === "string" && canvasWorkspace.rootPath.length > 0) {
    return canvasWorkspace.rootPath.split(/[\\/]/u).filter(Boolean).at(-1) ?? canvasWorkspace.rootPath;
  }

  return "project";
}

function getCanvasRailDisplayName(canvasRecord) {
  const canvasWorkspace = normalizeCanvasWorkspaceRecord(canvasRecord?.workspace);

  if (typeof canvasWorkspace?.rootName === "string" && canvasWorkspace.rootName.length > 0) {
    return canvasWorkspace.rootName;
  }

  if (typeof canvasWorkspace?.rootPath === "string" && canvasWorkspace.rootPath.length > 0) {
    return canvasWorkspace.rootPath.split(/[\\/]/u).filter(Boolean).at(-1) ?? canvasWorkspace.rootPath;
  }

  return typeof canvasRecord?.name === "string" && canvasRecord.name.length > 0 ? canvasRecord.name : "Canvas";
}

function getVisibleCanvasNodes(canvasRecord) {
  return Array.isArray(canvasRecord?.nodes)
    ? canvasRecord.nodes.filter((nodeRecord) => nodeRecord?.isRemoved !== true)
    : [];
}

function createCanvasPanelPill(label, modifier = "") {
  const pill = document.createElement("span");
  pill.className = modifier.length > 0 ? `canvas-panel-pill ${modifier}` : "canvas-panel-pill";
  pill.textContent = label;
  return pill;
}

function renderCanvasOverviewHeader() {
  const activeCanvas = getActiveCanvas();
  const projectName = getActiveProjectDisplayName();

  if (canvasBreadcrumb instanceof HTMLElement) {
    const product = document.createElement("span");
    product.className = "canvas-breadcrumb-project";
    product.textContent = "TermCanvas";

    canvasBreadcrumb.replaceChildren(product);
  }

  if (canvasPanelTitle instanceof HTMLElement) {
    canvasPanelTitle.textContent = activeCanvas === null
      ? "No project open"
      : activeCanvas.name;
    canvasPanelTitle.title = activeCanvas === null
      ? "No project open"
      : `${projectName} / ${activeCanvas.name}`;
  }

  if (canvasActionsMenuButton instanceof HTMLButtonElement) {
    canvasActionsMenuButton.disabled = false;
    canvasActionsMenuButton.setAttribute(
      "aria-label",
      activeCanvas === null ? "Canvas actions" : `Canvas actions for ${activeCanvas.name}`
    );
    canvasActionsMenuButton.title = activeCanvas === null ? "Canvas actions" : `${activeCanvas.name} actions`;
  }

  if (exportCanvasButton instanceof HTMLButtonElement) {
    exportCanvasButton.disabled = activeCanvas === null;
    exportCanvasButton.setAttribute(
      "aria-label",
      activeCanvas === null ? "Export canvas" : `Export ${activeCanvas.name}`
    );
    exportCanvasButton.title = activeCanvas === null ? "Export canvas" : `Export ${activeCanvas.name}`;
  }

  if (closeActiveCanvasButton instanceof HTMLButtonElement) {
    closeActiveCanvasButton.disabled = activeCanvas === null;
    closeActiveCanvasButton.setAttribute(
      "aria-label",
      activeCanvas === null ? "Close current canvas" : `Close ${activeCanvas.name}`
    );
    closeActiveCanvasButton.title = activeCanvas === null ? "Close current canvas" : `Close ${activeCanvas.name}`;
  }

  if (canvasPanelPills instanceof HTMLElement) {
    if (activeCanvas === null) {
      canvasPanelPills.replaceChildren(
        createCanvasPanelPill("open project", "is-muted")
      );
      return;
    }

    const visibleNodes = getVisibleCanvasNodes(activeCanvas);
    const managedAgentCount = visibleNodes.filter((nodeRecord) => nodeRecord.managedAgentName !== null).length;
    const count = managedAgentCount > 0 ? managedAgentCount : visibleNodes.length;
    const countNoun = managedAgentCount > 0
      ? (managedAgentCount === 1 ? "agent" : "agents")
      : (visibleNodes.length === 1 ? "terminal" : "terminals");

    canvasPanelPills.replaceChildren(createCanvasPanelPill(`${count} ${countNoun}`, count > 0 ? "is-active" : "is-muted"));
  }
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
    lineHeight: Number.parseFloat(readVar("--terminal-line-height", "1.22")) || 1.22,
    theme: {
      background: readVar("--color-terminal-surface-top", "#121212"),
      foreground: readVar("--color-terminal-text", "#f5f5f4"),
      cursor: readVar("--color-terminal-text", "#f5f5f4"),
      selectionBackground: "rgba(87, 199, 255, 0.24)",
      black: "#0b0f14",
      red: "#ff5c57",
      green: "#5af78e",
      yellow: "#f3f99d",
      blue: "#57c7ff",
      magenta: "#ff6ac1",
      cyan: "#9aedfe",
      white: "#f8f8f2",
      brightBlack: "#686868",
      brightRed: "#ff6e67",
      brightGreen: "#8aff80",
      brightYellow: "#ffffa5",
      brightBlue: "#82d7ff",
      brightMagenta: "#ff92d0",
      brightCyan: "#a4ffff",
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
    agentProjectTag: typeof options.agentProjectTag === "string" && options.agentProjectTag.trim().length > 0
      ? options.agentProjectTag.trim()
      : null,
    managerAgentName: normalizeManagedAgentName(options.managerAgentName),
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

function snapWorldCoordinateToDevicePixel(worldValue, viewportOffset, viewportScale) {
  if (!Number.isFinite(worldValue) || !Number.isFinite(viewportOffset) || !Number.isFinite(viewportScale) || viewportScale <= 0) {
    return worldValue;
  }

  const devicePixelRatio = Number.isFinite(window.devicePixelRatio) && window.devicePixelRatio > 0
    ? window.devicePixelRatio
    : 1;
  const screenValue = viewportOffset + (worldValue * viewportScale);
  const snappedScreenValue = Math.round(screenValue * devicePixelRatio) / devicePixelRatio;

  return (snappedScreenValue - viewportOffset) / viewportScale;
}

function positionNode(nodeRecord) {
  if (nodeRecord.isMaximized) {
    nodeRecord.element.style.left = "";
    nodeRecord.element.style.top = "";
    nodeRecord.element.style.width = "";
    nodeRecord.element.style.height = "";
    return;
  }

  const snappedX = snapWorldCoordinateToDevicePixel(
    nodeRecord.x,
    nodeRecord.canvas.viewportOffset.x,
    nodeRecord.canvas.viewportScale
  );
  const snappedY = snapWorldCoordinateToDevicePixel(
    nodeRecord.y,
    nodeRecord.canvas.viewportOffset.y,
    nodeRecord.canvas.viewportScale
  );
  const nextLeft = `${snappedX}px`;
  const nextTop = `${snappedY}px`;

  if (nodeRecord.element.style.left !== nextLeft) {
    nodeRecord.element.style.left = nextLeft;
  }

  if (nodeRecord.element.style.top !== nextTop) {
    nodeRecord.element.style.top = nextTop;
  }

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
  const hasNoCanvas = canvases.length === 0;
  const shouldShowEmptyCanvasOnboarding = !hasNoCanvas && shouldShowBoardHintsForCanvas(activeCanvas);
  emptyState.hidden = !shouldShowEmptyCanvasOnboarding;

  if (boardHints instanceof HTMLElement) {
    boardHints.hidden = !shouldShowEmptyCanvasOnboarding;
  }

  updateBoardWelcome();
}

// The board welcome ("No project open — pick a folder") shows only when there is
// no canvas at all, so a fresh start prompts for a folder instead of auto-creating one.
function updateBoardWelcome() {
  if (boardWelcome instanceof HTMLElement) {
    boardWelcome.hidden = canvases.length > 0;
  }
}

function scheduleTerminalSizeSync(nodeRecords, options = {}) {
  const nodes = Array.isArray(nodeRecords) ? nodeRecords : [];

  if (options.settle === true) {
    TERMINAL_LAYOUT_SETTLE_DELAYS_MS.forEach((delay) => {
      window.setTimeout(() => {
        scheduleTerminalSizeSync(nodes);
      }, delay);
    });
  }

  nodes.forEach((nodeRecord) => {
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

function enableTerminalUnicodeWidthSupport(terminal) {
  if (typeof Unicode11AddonConstructor !== "function") {
    return;
  }

  try {
    terminal.loadAddon(new Unicode11AddonConstructor());
    if (terminal.unicode != null) {
      terminal.unicode.activeVersion = "11";
    }
  } catch (error) {
    console.warn("Terminal Unicode width support failed to load.", error);
  }
}

function getTerminalMountRect(nodeRecord) {
  if (
    !(nodeRecord?.terminalMount instanceof HTMLElement)
    || !(nodeRecord?.element instanceof HTMLElement)
    || nodeRecord.element.hidden
    || !nodeRecord.element.isConnected
  ) {
    return null;
  }

  const rect = nodeRecord.terminalMount.getBoundingClientRect();

  if (rect.width <= 0 || rect.height <= 0) {
    return null;
  }

  return rect;
}

function fitTerminalNode(nodeRecord) {
  const terminal = nodeRecord?.terminal;
  const fitAddon = nodeRecord?.fitAddon;

  if (terminal == null || fitAddon == null || getTerminalMountRect(nodeRecord) === null) {
    return null;
  }

  try {
    fitAddon.fit();
  } catch (error) {
    console.warn("Terminal fit failed.", error);
    return null;
  }

  return {
    cols: Math.max(terminal.cols, TERMINAL_MIN_COLS),
    rows: Math.max(terminal.rows, TERMINAL_MIN_ROWS)
  };
}

function scheduleTerminalRefresh(nodeRecords) {
  nodeRecords.forEach((nodeRecord) => {
    pendingTerminalRefreshNodes.add(nodeRecord);
  });

  if (terminalRefreshFrame !== 0) {
    return;
  }

  terminalRefreshFrame = requestAnimationFrame(() => {
    terminalRefreshFrame = 0;
    const activeCanvas = getActiveCanvas();
    const nodesToRefresh = [...pendingTerminalRefreshNodes];

    pendingTerminalRefreshNodes.clear();

    nodesToRefresh.forEach((nodeRecord) => {
      if (
        activeCanvas !== null
        && nodeRecord.canvas.id === activeCanvas.id
        && nodeRecord.element instanceof HTMLElement
        && !nodeRecord.element.hidden
        && nodeRecord.terminal !== null
        && nodeRecord.terminal.rows > 0
      ) {
        nodeRecord.terminal.clearTextureAtlas?.();
        nodeRecord.terminal.refresh(0, nodeRecord.terminal.rows - 1);
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
  const activeCanvas = getActiveCanvas();
  if (activeCanvas !== null && shouldRefreshTerminalsAfterViewportRender) {
    shouldRefreshTerminalsAfterViewportRender = false;
    scheduleTerminalRefresh(activeCanvas.nodes);
  }
}

function requestViewportRender() {
  if (viewportRenderFrame !== 0) {
    return;
  }

  viewportRenderFrame = requestAnimationFrame(() => {
    viewportRenderFrame = 0;
    renderCanvas();
    const activeCanvas = getActiveCanvas();
    if (activeCanvas !== null && shouldRefreshTerminalsAfterViewportRender) {
      shouldRefreshTerminalsAfterViewportRender = false;
      scheduleTerminalRefresh(activeCanvas.nodes);
    }
  });
}

let minimapRenderFrame = 0;
const isBoardMinimapEnabled = false;

function scheduleMinimapRender() {
  if (minimapRenderFrame !== 0) {
    return;
  }
  minimapRenderFrame = requestAnimationFrame(() => {
    minimapRenderFrame = 0;
    renderMinimap();
  });
}

function renderMinimap() {
  if (boardMinimap === null || boardMinimapCanvas === null || boardMinimapViewport === null) {
    return;
  }

  if (!isBoardMinimapEnabled) {
    boardMinimap.hidden = true;
    boardMinimapCanvas.querySelectorAll(".board-minimap-node").forEach((element) => element.remove());
    return;
  }

  const activeCanvas = getActiveCanvas();
  const nodes = activeCanvas === null
    ? []
    : activeCanvas.nodes.filter((nodeRecord) => nodeRecord.isRemoved !== true && nodeRecord.isMaximized !== true);

  if (activeCanvas === null || nodes.length === 0) {
    boardMinimap.hidden = true;
    boardMinimapCanvas.querySelectorAll(".board-minimap-node").forEach((element) => element.remove());
    return;
  }

  boardMinimap.hidden = false;

  const scale = Number.isFinite(activeCanvas.viewportScale) && activeCanvas.viewportScale > 0
    ? activeCanvas.viewportScale
    : 1;
  const offsetX = Number.isFinite(activeCanvas.viewportOffset.x) ? activeCanvas.viewportOffset.x : 0;
  const offsetY = Number.isFinite(activeCanvas.viewportOffset.y) ? activeCanvas.viewportOffset.y : 0;

  // Visible canvas region (in canvas coordinates).
  const viewLeft = -offsetX / scale;
  const viewTop = -offsetY / scale;
  const viewWidth = board.clientWidth / scale;
  const viewHeight = board.clientHeight / scale;

  let minX = viewLeft;
  let minY = viewTop;
  let maxX = viewLeft + viewWidth;
  let maxY = viewTop + viewHeight;

  for (const nodeRecord of nodes) {
    minX = Math.min(minX, nodeRecord.x);
    minY = Math.min(minY, nodeRecord.y);
    maxX = Math.max(maxX, nodeRecord.x + nodeRecord.width);
    maxY = Math.max(maxY, nodeRecord.y + nodeRecord.height);
  }

  const contentWidth = Math.max(1, maxX - minX);
  const contentHeight = Math.max(1, maxY - minY);
  const pad = 0.06;
  const paddedWidth = contentWidth * (1 + pad * 2);
  const paddedHeight = contentHeight * (1 + pad * 2);
  const originX = minX - contentWidth * pad;
  const originY = minY - contentHeight * pad;

  const boxWidth = boardMinimapCanvas.clientWidth || 168;
  const boxHeight = boardMinimapCanvas.clientHeight || 112;
  const k = Math.min(boxWidth / paddedWidth, boxHeight / paddedHeight);
  const renderedWidth = paddedWidth * k;
  const renderedHeight = paddedHeight * k;
  const centerX = (boxWidth - renderedWidth) / 2;
  const centerY = (boxHeight - renderedHeight) / 2;

  const project = (x, y) => ({
    left: (x - originX) * k + centerX,
    top: (y - originY) * k + centerY
  });

  const existingNodes = Array.from(boardMinimapCanvas.querySelectorAll(".board-minimap-node"));
  while (existingNodes.length > nodes.length) {
    existingNodes.pop().remove();
  }

  nodes.forEach((nodeRecord, index) => {
    let dot = existingNodes[index];
    if (!dot) {
      dot = document.createElement("div");
      dot.className = "board-minimap-node";
      boardMinimapCanvas.insertBefore(dot, boardMinimapViewport);
    }
    const topLeft = project(nodeRecord.x, nodeRecord.y);
    dot.style.left = `${topLeft.left}px`;
    dot.style.top = `${topLeft.top}px`;
    dot.style.width = `${Math.max(2, nodeRecord.width * k)}px`;
    dot.style.height = `${Math.max(2, nodeRecord.height * k)}px`;
    dot.classList.toggle("is-exited", nodeRecord.isExited === true);
    dot.classList.toggle("is-active", nodeRecord === activeNodeRecord);
  });

  const viewTopLeft = project(viewLeft, viewTop);
  boardMinimapViewport.style.left = `${viewTopLeft.left}px`;
  boardMinimapViewport.style.top = `${viewTopLeft.top}px`;
  boardMinimapViewport.style.width = `${Math.max(4, viewWidth * k)}px`;
  boardMinimapViewport.style.height = `${Math.max(4, viewHeight * k)}px`;
}

const CANVAS_EDGE_SVG_NS = "http://www.w3.org/2000/svg";
let canvasEdgeRenderFrame = 0;

function scheduleCanvasEdgeRender() {
  if (canvasEdgeLayer === null || canvasEdgeRenderFrame !== 0) {
    return;
  }

  canvasEdgeRenderFrame = requestAnimationFrame(() => {
    canvasEdgeRenderFrame = 0;
    renderCanvasDelegationEdges();
  });
}

function clearCanvasDelegationEdges() {
  if (canvasEdgeLayer !== null && canvasEdgeLayer.childNodes.length > 0) {
    canvasEdgeLayer.replaceChildren();
  }
}

function getNodeBounds(nodeRecord) {
  return {
    left: nodeRecord.x - (nodeRecord.width / 2),
    top: nodeRecord.y - (nodeRecord.height / 2),
    right: nodeRecord.x + (nodeRecord.width / 2),
    bottom: nodeRecord.y + (nodeRecord.height / 2),
    centerX: nodeRecord.x,
    centerY: nodeRecord.y
  };
}

function getDelegationEdgePath(fromNode, toNode) {
  const from = getNodeBounds(fromNode);
  const to = getNodeBounds(toNode);
  const verticalGap = to.top - from.bottom;
  const childIsBelow = verticalGap >= -24;

  if (childIsBelow) {
    const startX = from.centerX;
    const startY = from.bottom;
    const endX = to.centerX;
    const endY = to.top;
    const midY = startY + Math.max(42, verticalGap * 0.52);

    return `M ${startX} ${startY} C ${startX} ${midY}, ${endX} ${midY}, ${endX} ${endY}`;
  }

  const childIsRight = to.centerX >= from.centerX;
  const startX = childIsRight ? from.right : from.left;
  const endX = childIsRight ? to.left : to.right;
  const startY = from.centerY;
  const endY = to.centerY;
  const horizontalGap = Math.abs(endX - startX);
  const midX = startX + (childIsRight ? 1 : -1) * Math.max(48, horizontalGap * 0.5);

  return `M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}`;
}

function createCanvasEdgeMarker() {
  const defs = document.createElementNS(CANVAS_EDGE_SVG_NS, "defs");
  const marker = document.createElementNS(CANVAS_EDGE_SVG_NS, "marker");
  marker.setAttribute("id", "canvas-edge-arrow");
  marker.setAttribute("viewBox", "0 0 10 10");
  marker.setAttribute("refX", "8");
  marker.setAttribute("refY", "5");
  marker.setAttribute("markerWidth", "5");
  marker.setAttribute("markerHeight", "5");
  marker.setAttribute("orient", "auto-start-reverse");

  const arrow = document.createElementNS(CANVAS_EDGE_SVG_NS, "path");
  arrow.setAttribute("class", "canvas-edge-arrow");
  arrow.setAttribute("d", "M 0 0 L 10 5 L 0 10 z");
  marker.append(arrow);
  defs.append(marker);

  return defs;
}

// Draw the agentmux delegation graph (commander -> worker) as branch paths
// anchored to node edges. The SVG layer shares the viewport transform, so pan
// and zoom come for free.
function renderCanvasDelegationEdges() {
  if (canvasEdgeLayer === null || typeof deriveCanvasDelegationEdges !== "function") {
    return;
  }

  const activeCanvas = getActiveCanvas();
  const nodes = activeCanvas?.nodes ?? [];

  if (activeCanvas === null || nodes.length === 0 || nodes.some((nodeRecord) => nodeRecord.isMaximized)) {
    clearCanvasDelegationEdges();
    return;
  }

  const edges = deriveCanvasDelegationEdges(nodes.map((nodeRecord, index) => ({
    id: index,
    agentName: nodeRecord.managedAgentName,
    parentAgent: nodeRecord.managedParentAgent,
    commanderAgent: nodeRecord.managedCommanderAgent,
    isManager: nodeRecord.isManager,
    projectTag: nodeRecord.managedProjectTag
  })));

  if (edges.length === 0) {
    clearCanvasDelegationEdges();
    return;
  }

  const fragment = document.createDocumentFragment();
  fragment.append(createCanvasEdgeMarker());

  for (const edge of edges) {
    const fromNode = nodes[edge.fromId];
    const toNode = nodes[edge.toId];

    if (fromNode == null || toNode == null) {
      continue;
    }

    const path = document.createElementNS(CANVAS_EDGE_SVG_NS, "path");
    path.setAttribute("class", "canvas-edge-path");
    path.setAttribute("d", getDelegationEdgePath(fromNode, toNode));
    path.setAttribute("marker-end", "url(#canvas-edge-arrow)");
    fragment.append(path);
  }

  canvasEdgeLayer.replaceChildren(fragment);
}

function renderCanvas(options = {}) {
  const { syncTerminalSizes = false, syncNodePositions = true } = options;

  if (viewportRenderFrame !== 0) {
    cancelAnimationFrame(viewportRenderFrame);
    viewportRenderFrame = 0;
  }

  const activeCanvas = getActiveCanvas();
  renderCanvasOverviewHeader();

  if (activeCanvas === null) {
    if (boardNavigation instanceof HTMLElement) {
      boardNavigation.hidden = true;
    }
    board.style.setProperty("--grid-offset-x", "0px");
    board.style.setProperty("--grid-offset-y", "0px");
    board.style.setProperty("--viewport-scale", "1");
    setBoardZoomIndicatorText(1);
    syncMountedCanvasNodes(null);
    appShell?.classList.remove("has-maximized-node");
    board.classList.remove("has-maximized-node");
    updateEmptyState();
    scheduleMinimapRender();
    scheduleCanvasEdgeRender();
    return;
  }

  if (boardNavigation instanceof HTMLElement) {
    boardNavigation.hidden = false;
  }

  board.style.setProperty("--grid-offset-x", `${activeCanvas.viewportOffset.x}px`);
  board.style.setProperty("--grid-offset-y", `${activeCanvas.viewportOffset.y}px`);
  board.style.setProperty("--viewport-scale", String(activeCanvas.viewportScale));
  setBoardZoomIndicatorText(activeCanvas.viewportScale);

  const didChangeMountedNodes = syncMountedCanvasNodes(activeCanvas);

  if (syncNodePositions || didChangeMountedNodes) {
    activeCanvas.nodes.forEach(positionNode);
  }

  applyCanvasFocusMode();
  updateEmptyState();

  if (syncTerminalSizes || didChangeMountedNodes) {
    scheduleTerminalSizeSync(activeCanvas.nodes, { settle: didChangeMountedNodes || syncTerminalSizes });
  }

  scheduleMinimapRender();
  scheduleCanvasEdgeRender();
}

function createCanvasStripItem(itemView) {
  const canvasRecord = getCanvasById(itemView.id);

  if (canvasRecord === null) {
    return document.createElement("span");
  }

  const stripItem = document.createElement("div");
  const displayName = getCanvasRailDisplayName(canvasRecord);
  stripItem.className = "canvas-strip-item";
  stripItem.title = `${displayName} • ${itemView.terminalSummary}`;
  stripItem.dataset.canvasId = canvasRecord.id;

  if (itemView.isActive) {
    stripItem.classList.add("is-active");
  }

  if (itemView.isRenaming) {
    let didCommitFromKeyboard = false;
    let didCancelFromKeyboard = false;
    const nameInput = document.createElement("input");
    nameInput.className = "canvas-strip-input";
    nameInput.type = "text";
    nameInput.value = canvasRecord.name;
    nameInput.maxLength = MAX_CANVAS_NAME_LENGTH;
    nameInput.spellcheck = false;
    nameInput.setAttribute("aria-label", `Rename ${canvasRecord.name}`);
    nameInput.dataset.canvasId = canvasRecord.id;
    nameInput.dataset.canvasPart = "rename-input";

    nameInput.addEventListener("blur", () => {
      window.setTimeout(() => {
        if (didCommitFromKeyboard || didCancelFromKeyboard) {
          return;
        }

        if (activeCanvasRenameId === canvasRecord.id) {
          commitCanvasRename(canvasRecord.id, nameInput.value);
        }
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

    stripItem.append(nameInput);
    return stripItem;
  }

  const switchButton = document.createElement("button");
  switchButton.className = "canvas-strip-main";
  switchButton.type = "button";
  switchButton.textContent = displayName;
  switchButton.setAttribute("aria-label", `Open ${displayName}`);
  switchButton.dataset.canvasId = canvasRecord.id;
  switchButton.dataset.canvasPart = "strip-switch";
  switchButton.dataset.railLabel = displayName.trim().charAt(0).toUpperCase() || "C";

  if (itemView.isActive) {
    switchButton.setAttribute("aria-current", "true");
  }

  switchButton.addEventListener("click", () => {
    setActiveCanvas(canvasRecord.id);
  });

  switchButton.addEventListener("dblclick", (event) => {
    event.preventDefault();
    event.stopPropagation();
    beginCanvasRename(canvasRecord.id);
  });

  switchButton.addEventListener("keydown", (event) => {
    if (event.key === "F2") {
      event.preventDefault();
      beginCanvasRename(canvasRecord.id);
    }
  });

  stripItem.append(switchButton);

  const itemIndex = canvases.findIndex((candidate) => candidate.id === canvasRecord.id);

  if (itemIndex >= 0) {
    attachReorderableListItem(stripItem, switchButton, {
      kind: "canvas",
      itemId: canvasRecord.id,
      index: itemIndex,
      onMove: async (canvasId, targetIndex) => {
        reorderCanvasById(canvasId, targetIndex);
      },
      getDropTarget: ({ event, item, index, sourceIndex }) => {
        const itemRect = item.getBoundingClientRect();

        return deriveTerminalStripDropTarget({
          itemOffset: itemRect.left,
          itemSize: itemRect.width,
          pointerOffset: event.clientX,
          itemIndex: index,
          sourceIndex
        });
      }
    });
  }

  return stripItem;
}

function renderCanvasSwitcher() {
  if (
    !(canvasStripList instanceof HTMLElement)
  ) {
    return;
  }

  const viewModel = getCanvasSwitcherViewModel();
  canvasStripList.setAttribute("aria-label", viewModel.strip.label);

  const stripItems = viewModel.strip.items.map((itemView) => {
    return createCanvasStripItem(itemView);
  });
  canvasStripList.replaceChildren(...stripItems);
  focusPendingCanvasListControl();
  scheduleCanvasStripOverflowControlsSync({ ensureActiveVisible: true });
  renderCanvasOverviewHeader();
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
      loadedDirectoryPaths: Array.isArray(folder.loadedDirectoryPaths)
        ? folder.loadedDirectoryPaths.filter((directoryPath) => typeof directoryPath === "string")
        : [""],
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

function getWorkspaceLoadedDirectoryPaths(folderRecord) {
  if (folderRecord === null) {
    return new Set();
  }

  const loadedDirectoryPaths = Array.isArray(folderRecord.loadedDirectoryPaths)
    ? folderRecord.loadedDirectoryPaths
    : [""];

  return new Set(loadedDirectoryPaths.filter((directoryPath) => typeof directoryPath === "string"));
}

function hasWorkspaceDirectoryLoaded(folderRecord, relativePath) {
  return getWorkspaceLoadedDirectoryPaths(folderRecord).has(relativePath);
}

function getActiveWorkspaceExpandedDirectoryPaths() {
  const activeCanvas = getActiveCanvas();
  return activeCanvas === null ? [] : getCanvasWorkspaceExpandedDirectories(activeCanvas);
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
  const entryActionState = deriveWorkspaceEntryActionState(activeFolder, selectedEntry);
  const parentRelativePath = selectedEntry === null
    ? ""
    : (selectedEntry.kind === "directory"
        ? selectedEntry.relativePath
        : getWorkspaceEntryParentPath(selectedEntry.relativePath));

  return {
    activeFolder,
    selectedEntry,
    parentRelativePath,
    ...entryActionState,
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

function hasDismissedAgentSkillInstallPrompt() {
  try {
    return window.localStorage?.getItem(AGENT_SKILL_INSTALL_PROMPT_DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

function setAgentSkillInstallPromptDismissed() {
  try {
    window.localStorage?.setItem(AGENT_SKILL_INSTALL_PROMPT_DISMISSED_KEY, "1");
  } catch {
    // Ignore storage failures; the menu action remains available.
  }
}

function getAgentSkillInstallMessage(status, options = {}) {
  const targetPath = typeof status?.targetPath === "string" && status.targetPath.length > 0
    ? status.targetPath
    : "~/.agents/skills/agentmux/SKILL.md";

  if (status?.installed === true && status?.current === true) {
    return `The TermCanvas agent skill is already installed at ${targetPath}. Reinstall it if you want to refresh the local copy.`;
  }

  if (status?.installed === true) {
    return `TermCanvas can update the installed agent skill at ${targetPath}. This helps Codex, Claude Code, OpenCode, and other coding agents operate the TermCanvas agent tree from the terminal.`;
  }

  if (options.firstRun === true) {
    return `Install the TermCanvas agent skill at ${targetPath}? This helps coding agents understand AGENTMUX_* sessions, spawn workers safely, read logs, and control the canvas from the terminal.`;
  }

  return `Install the TermCanvas agent skill at ${targetPath}. This helps coding agents understand AGENTMUX_* sessions, spawn workers safely, read logs, and control the canvas from the terminal.`;
}

async function requestAgentSkillInstall(options = {}) {
  if (isAgentSkillInstallDialogOpen) {
    return;
  }

  if (
    window.noteCanvas == null
    || typeof window.noteCanvas.getAgentSkillStatus !== "function"
    || typeof window.noteCanvas.installAgentSkill !== "function"
  ) {
    return;
  }

  isAgentSkillInstallDialogOpen = true;

  try {
    const status = options.status?.available === true
      ? options.status
      : await window.noteCanvas.getAgentSkillStatus();

    if (status?.available !== true) {
      await requestWorkspaceActionDialog({
        kind: "confirm",
        title: "Agent skill unavailable",
        message: "This TermCanvas build does not include the bundled agent skill.",
        confirmLabel: "OK",
        cancelLabel: ""
      });
      return;
    }

    const confirmLabel = status.installed === true && status.current === true
      ? "Reinstall skill"
      : status.installed === true
        ? "Update skill"
        : "Install skill";
    const shouldInstall = await requestWorkspaceActionDialog({
      kind: "confirm",
      title: "Install Agent Skill",
      message: getAgentSkillInstallMessage(status, { firstRun: options.firstRun === true }),
      confirmLabel,
      cancelLabel: "Cancel"
    });

    if (shouldInstall !== true) {
      if (options.firstRun === true) {
        setAgentSkillInstallPromptDismissed();
      }
      return;
    }

    const result = await window.noteCanvas.installAgentSkill();
    setAgentSkillInstallPromptDismissed();

    await requestWorkspaceActionDialog({
      kind: "confirm",
      title: "Agent skill installed",
      message: `Installed at ${result.targetPath}. Restart or reload your coding agent so it can see the TermCanvas agent skill.`,
      confirmLabel: "OK",
      cancelLabel: ""
    });
  } catch (error) {
    await showWorkspaceActionError(error);
  } finally {
    isAgentSkillInstallDialogOpen = false;
  }
}

async function maybePromptForAgentSkillInstall() {
  if (window.noteCanvas?.isSmokeTest === true || hasDismissedAgentSkillInstallPrompt()) {
    return;
  }

  if (typeof window.noteCanvas?.getAgentSkillStatus !== "function") {
    return;
  }

  try {
    const status = await window.noteCanvas.getAgentSkillStatus();

    if (status?.available === true && status.installed !== true) {
      await requestAgentSkillInstall({ status, firstRun: true });
    }
  } catch (error) {
    console.error(error);
  }
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
  destroyWorkspaceMarkdownEditor();
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
  workspacePreviewState.isDirty = false;
  workspacePreviewState.isSaving = false;

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

function getWorkspacePreviewTabKey(folderId, relativePath) {
  return `${folderId}::${relativePath}`;
}

function isWorkspacePreviewTabMatch(tab, folderId, relativePath) {
  return tab?.folderId === folderId && tab?.relativePath === relativePath;
}

function createWorkspacePreviewTab(folderRecord, relativePath) {
  if (
    folderRecord === null
    || typeof folderRecord?.id !== "string"
    || typeof relativePath !== "string"
    || relativePath.length === 0
  ) {
    return null;
  }

  return {
    folderId: folderRecord.id,
    rootPath: folderRecord.rootPath,
    rootName: folderRecord.rootName,
    relativePath,
    fileName: getWorkspaceEntryName(relativePath)
  };
}

function trimWorkspacePreviewTabs(activeTabKey = null) {
  while (workspacePreviewTabs.length > MAX_WORKSPACE_PREVIEW_TABS) {
    const removableIndex = workspacePreviewTabs.findIndex((tab) => {
      return getWorkspacePreviewTabKey(tab.folderId, tab.relativePath) !== activeTabKey;
    });

    workspacePreviewTabs.splice(removableIndex === -1 ? 0 : removableIndex, 1);
  }
}

function pruneWorkspacePreviewTabs() {
  const filePathsByFolderId = new Map();

  workspacePreviewTabs = workspacePreviewTabs.flatMap((tab) => {
    const folderRecord = getWorkspaceFolderById(tab.folderId);

    if (folderRecord === null) {
      return [];
    }

    if (!filePathsByFolderId.has(folderRecord.id)) {
      filePathsByFolderId.set(folderRecord.id, getWorkspaceFilePaths(folderRecord));
    }

    if (!filePathsByFolderId.get(folderRecord.id).has(tab.relativePath)) {
      return [];
    }

    const normalizedTab = createWorkspacePreviewTab(folderRecord, tab.relativePath);
    return normalizedTab === null ? [] : [normalizedTab];
  });
}

function rememberWorkspacePreviewTab(folderRecord, relativePath) {
  const tab = createWorkspacePreviewTab(folderRecord, relativePath);

  if (tab === null) {
    return;
  }

  const activeTabKey = getWorkspacePreviewTabKey(tab.folderId, tab.relativePath);
  workspacePreviewTabs = workspacePreviewTabs.filter((existingTab) => {
    return getWorkspacePreviewTabKey(existingTab.folderId, existingTab.relativePath) !== activeTabKey;
  });
  workspacePreviewTabs.push(tab);
  trimWorkspacePreviewTabs(activeTabKey);
}

function ensureActiveWorkspacePreviewTab() {
  if (!isWorkspacePreviewOpen()) {
    return;
  }

  const folderRecord = getWorkspaceFolderById(workspacePreviewState.folderId);
  const activeTabKey = getWorkspacePreviewTabKey(workspacePreviewState.folderId, workspacePreviewState.relativePath);

  if (
    folderRecord === null
    || workspacePreviewTabs.some((tab) => getWorkspacePreviewTabKey(tab.folderId, tab.relativePath) === activeTabKey)
  ) {
    return;
  }

  const tab = createWorkspacePreviewTab(folderRecord, workspacePreviewState.relativePath);

  if (tab !== null) {
    workspacePreviewTabs.push(tab);
    trimWorkspacePreviewTabs(activeTabKey);
  }
}

function getWorkspacePreviewTabs() {
  ensureActiveWorkspacePreviewTab();
  pruneWorkspacePreviewTabs();
  return workspacePreviewTabs.slice();
}

function getWorkspacePreviewTabTitle(tab) {
  const rootLabel = typeof tab.rootName === "string" && tab.rootName.length > 0
    ? tab.rootName
    : tab.rootPath;
  return rootLabel ? `${rootLabel} / ${tab.relativePath}` : tab.relativePath;
}

function renderWorkspacePreviewTabs() {
  const tabs = getWorkspacePreviewTabs();

  if (tabs.length === 0) {
    return null;
  }

  const tabbar = document.createElement("div");
  tabbar.className = "file-inspector-tabbar";
  tabbar.setAttribute("role", "tablist");
  tabbar.setAttribute("aria-label", "Open file previews");

  tabs.forEach((tab) => {
    const isActive = isWorkspacePreviewTabMatch(tab, workspacePreviewState.folderId, workspacePreviewState.relativePath);
    const tabItem = document.createElement("div");
    tabItem.className = isActive ? "file-inspector-tab is-active" : "file-inspector-tab";
    tabItem.dataset.workspacePreviewTab = "true";

    const tabButton = document.createElement("button");
    tabButton.className = "file-inspector-tab-main";
    tabButton.type = "button";
    tabButton.setAttribute("role", "tab");
    tabButton.setAttribute("aria-selected", isActive ? "true" : "false");
    tabButton.title = getWorkspacePreviewTabTitle(tab);
    tabButton.addEventListener("click", () => {
      void switchWorkspacePreviewTab(tab);
    });

    const label = document.createElement("span");
    label.className = "file-inspector-tab-label";
    label.textContent = tab.fileName;
    tabButton.append(label);

    const closeButton = document.createElement("button");
    closeButton.className = "file-inspector-tab-close";
    closeButton.type = "button";
    closeButton.innerHTML = `
      <svg class="file-inspector-tab-close-icon" viewBox="0 0 16 16" aria-hidden="true">
        <path d="M4.75 4.75 11.25 11.25"></path>
        <path d="M11.25 4.75 4.75 11.25"></path>
      </svg>
    `;
    closeButton.setAttribute("aria-label", `Close ${tab.fileName}`);
    closeButton.addEventListener("click", (event) => {
      event.stopPropagation();
      void closeWorkspacePreviewTab(tab);
    });

    tabItem.append(tabButton, closeButton);
    tabbar.append(tabItem);
  });

  return tabbar;
}

async function switchWorkspacePreviewTab(tab) {
  if (tab === null || typeof tab !== "object") {
    return null;
  }

  if (isWorkspacePreviewTabMatch(tab, workspacePreviewState.folderId, workspacePreviewState.relativePath)) {
    return workspacePreviewState.data;
  }

  const folderRecord = getWorkspaceFolderById(tab.folderId);

  if (folderRecord === null || !getWorkspaceFilePaths(folderRecord).has(tab.relativePath)) {
    workspacePreviewTabs = workspacePreviewTabs.filter((existingTab) => {
      return !isWorkspacePreviewTabMatch(existingTab, tab.folderId, tab.relativePath);
    });
    renderFileInspector();
    return null;
  }

  if (workspaceState.activeFolderId !== tab.folderId) {
    await activateWorkspaceFolderById(tab.folderId);
  }

  return loadWorkspaceFilePreview(tab.relativePath, { preserveViewMode: true });
}

async function closeWorkspacePreviewTab(tab) {
  if (tab === null || typeof tab !== "object") {
    return;
  }

  const wasActive = isWorkspacePreviewTabMatch(tab, workspacePreviewState.folderId, workspacePreviewState.relativePath);
  workspacePreviewTabs = workspacePreviewTabs.filter((existingTab) => {
    return !isWorkspacePreviewTabMatch(existingTab, tab.folderId, tab.relativePath);
  });

  if (!wasActive) {
    renderFileInspector();
    return;
  }

  const nextTab = workspacePreviewTabs.slice().reverse().find((candidate) => {
    const folderRecord = getWorkspaceFolderById(candidate.folderId);
    return folderRecord !== null && getWorkspaceFilePaths(folderRecord).has(candidate.relativePath);
  }) ?? null;

  if (nextTab !== null) {
    await switchWorkspacePreviewTab(nextTab);
    return;
  }

  closeWorkspacePreview();
}

function isMarkdownWorkspacePreview() {
  return workspacePreviewState.data?.language === "markdown";
}

function isRenderableWorkspacePreview() {
  return isMarkdownWorkspacePreview() || workspacePreviewState.data?.kind === "svg";
}

function isEditableWorkspacePreviewData(previewData) {
  const kind = typeof previewData?.kind === "string" ? previewData.kind : null;
  return kind === "text" || kind === "json" || kind === "svg" || previewData?.language === "markdown";
}

function destroyWorkspaceMarkdownEditor() {
  if (workspaceMarkdownEditor === null) {
    return;
  }

  workspaceMarkdownEditor.destroy();
  workspaceMarkdownEditor = null;
}

function syncWorkspacePreviewDirtyState() {
  workspacePreviewState.isDirty = workspacePreviewState.draftText !== (workspacePreviewState.data?.textContents ?? "");
}

function updateWorkspacePreviewDraftText(nextText) {
  workspacePreviewState.draftText = typeof nextText === "string" ? nextText : "";
  workspacePreviewState.saveErrorMessage = "";
  syncWorkspacePreviewDirtyState();

  if (workspacePreviewState.isSaving && workspacePreviewState.isDirty) {
    pendingWorkspacePreviewSaveAfterCurrent = true;
  }
}

function updateWorkspacePreviewInlineSaveState() {
  if (!(fileInspector instanceof HTMLElement)) {
    return;
  }

  const liveStatus = fileInspector.querySelector(".file-inspector-status");

  if (liveStatus instanceof HTMLElement) {
    if (workspacePreviewState.saveErrorMessage.length > 0) {
      liveStatus.dataset.status = "error";
      liveStatus.textContent = "Error";
    } else if (workspacePreviewState.isSaving) {
      liveStatus.dataset.status = "saving";
      liveStatus.textContent = "Saving";
    } else if (workspacePreviewState.isDirty) {
      liveStatus.dataset.status = "dirty";
      liveStatus.textContent = "Unsaved";
    } else {
      liveStatus.dataset.status = "ready";
      liveStatus.textContent = "Ready";
    }
  }

  const saveBanner = fileInspector.querySelector("[data-file-inspector-save-banner]");

  if (saveBanner instanceof HTMLElement) {
    if (workspacePreviewState.saveErrorMessage.length > 0) {
      saveBanner.className = "file-inspector-error file-inspector-banner";
      saveBanner.textContent = workspacePreviewState.saveErrorMessage;
    } else if (workspacePreviewState.isSaving) {
      saveBanner.className = "file-inspector-empty file-inspector-banner";
      saveBanner.textContent = "Saving changes...";
    } else if (workspacePreviewState.isDirty) {
      saveBanner.className = "file-inspector-empty file-inspector-banner";
      saveBanner.textContent = "Unsaved changes. Changes save when you leave the editor or press Cmd+S.";
    } else {
      saveBanner.remove();
    }
  }
}

function setPendingWorkspacePreviewOwnSave(folderId, relativePath) {
  pendingWorkspacePreviewOwnSave = {
    folderId,
    relativePath,
    expiresAt: Date.now() + 5000
  };
}

function clearPendingWorkspacePreviewOwnSave(folderId, relativePath) {
  if (
    pendingWorkspacePreviewOwnSave?.folderId === folderId
    && pendingWorkspacePreviewOwnSave?.relativePath === relativePath
  ) {
    pendingWorkspacePreviewOwnSave = null;
  }
}

function shouldSuppressWorkspacePreviewOwnSaveRefresh(folderId, relativePath) {
  if (pendingWorkspacePreviewOwnSave === null) {
    return false;
  }

  if (Date.now() > pendingWorkspacePreviewOwnSave.expiresAt) {
    pendingWorkspacePreviewOwnSave = null;
    return false;
  }

  return pendingWorkspacePreviewOwnSave.folderId === folderId
    && pendingWorkspacePreviewOwnSave.relativePath === relativePath;
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
  workspacePreviewState.isEditing = workspacePreviewState.viewMode === "source"
    && isEditableWorkspacePreviewData(workspacePreviewState.data)
    && isRenderableWorkspacePreview();
  workspacePreviewState.saveErrorMessage = "";
  renderFileInspector();
}

function startWorkspacePreviewEdit() {
  if (!isWorkspacePreviewOpen() || typeof workspacePreviewState.data?.textContents !== "string") {
    return;
  }

  workspacePreviewState.isEditing = true;
  workspacePreviewState.viewMode = "source";
  updateWorkspacePreviewDraftText(workspacePreviewState.data.textContents);
  workspacePreviewState.saveErrorMessage = "";
  renderFileInspector();
}

function cancelWorkspacePreviewEdit() {
  workspacePreviewState.isEditing = false;
  workspacePreviewState.viewMode = isRenderableWorkspacePreview() ? "render" : workspacePreviewState.viewMode;
  updateWorkspacePreviewDraftText(
    typeof workspacePreviewState.data?.textContents === "string"
      ? workspacePreviewState.data.textContents
      : ""
  );
  workspacePreviewState.saveErrorMessage = "";
  renderFileInspector();
}

async function saveWorkspacePreviewText() {
  if (!isWorkspacePreviewOpen() || (!workspacePreviewState.isEditing && !isMarkdownWorkspacePreview())) {
    return null;
  }

  if (!workspacePreviewState.isDirty || workspacePreviewState.isSaving) {
    if (workspacePreviewState.isSaving && workspacePreviewState.isDirty) {
      pendingWorkspacePreviewSaveAfterCurrent = true;
    }

    return workspacePreviewState.data;
  }

  const actionFolderId = workspacePreviewState.folderId;
  const actionRelativePath = workspacePreviewState.relativePath;
  const shouldRemainEditing = workspacePreviewState.viewMode === "source";
  const savedText = workspacePreviewState.draftText;

  pendingWorkspacePreviewSaveAfterCurrent = false;
  workspacePreviewState.isSaving = true;
  workspacePreviewState.saveErrorMessage = "";
  setPendingWorkspacePreviewOwnSave(actionFolderId, actionRelativePath);
  updateWorkspacePreviewInlineSaveState();

  try {
    const savedPreview = await window.noteCanvas.saveWorkspaceFile(
      actionFolderId,
      actionRelativePath,
      savedText,
      workspacePreviewState.data?.lastModifiedMs ?? null
    );

    if (workspacePreviewState.folderId !== actionFolderId || workspacePreviewState.relativePath !== actionRelativePath) {
      return null;
    }

    workspacePreviewState.data = {
      ...savedPreview,
      textContents: savedText
    };
    workspacePreviewState.status = "ready";
    workspacePreviewState.errorMessage = "";
    workspacePreviewState.actionErrorMessage = "";
    workspacePreviewState.isEditing = shouldRemainEditing;
    workspacePreviewState.saveErrorMessage = "";
    if (workspacePreviewState.draftText === savedText) {
      workspacePreviewState.draftText = savedText;
      workspacePreviewState.isDirty = false;
    } else {
      workspacePreviewState.isDirty = workspacePreviewState.draftText !== savedText;
    }
    workspacePreviewState.isSaving = false;
    updateWorkspacePreviewInlineSaveState();

    if (pendingWorkspacePreviewSaveAfterCurrent && workspacePreviewState.isDirty) {
      window.setTimeout(() => {
        void saveWorkspacePreviewText();
      }, 0);
    }

    return savedPreview;
  } catch (error) {
    clearPendingWorkspacePreviewOwnSave(actionFolderId, actionRelativePath);
    pendingWorkspacePreviewSaveAfterCurrent = false;
    workspacePreviewState.saveErrorMessage = error instanceof Error ? error.message : String(error);
    workspacePreviewState.isSaving = false;
    renderFileInspector();
    return null;
  }
}

async function closeWorkspacePreviewSafely() {
  if (workspacePreviewState.isSaving) {
    return;
  }

  if (workspacePreviewState.isDirty) {
    await saveWorkspacePreviewText();

    if (workspacePreviewState.isDirty || workspacePreviewState.saveErrorMessage.length > 0) {
      return;
    }
  }

  closeWorkspacePreview();
}

function syncAppShellWorkspaceState() {
  appShell?.classList.toggle("has-file-inspector", isWorkspacePreviewOpen());
}

function createFileInspectorIconButton({ className = "", label, title = label, iconMarkup, onClick, disabled = false }) {
  const button = document.createElement("button");
  button.className = className.length > 0
    ? `file-inspector-icon-button ${className}`
    : "file-inspector-icon-button";
  button.type = "button";
  button.setAttribute("aria-label", label);
  button.title = title;
  button.disabled = disabled;
  button.innerHTML = `<svg class="file-inspector-action-icon" viewBox="0 0 16 16" aria-hidden="true">${iconMarkup}</svg>`;
  button.addEventListener("click", () => {
    onClick();
  });
  return button;
}

function createFileInspectorModeButton({ label, viewMode, isActive, disabled = false, onClick }) {
  const button = document.createElement("button");
  button.className = isActive
    ? "file-inspector-mode-button is-active"
    : "file-inspector-mode-button";
  button.type = "button";
  button.textContent = label;
  button.setAttribute("aria-pressed", isActive ? "true" : "false");
  button.disabled = disabled;
  button.dataset.viewMode = viewMode;
  button.addEventListener("click", () => {
    onClick();
  });
  return button;
}

function renderFileInspectorActions(previewViewModel) {
  const actions = document.createElement("div");
  actions.className = "file-inspector-actions";

  if (previewViewModel.canRender) {
    const modeGroup = document.createElement("div");
    modeGroup.className = "file-inspector-action-group";

    modeGroup.append(
      createFileInspectorModeButton({
        label: "Preview",
        viewMode: "render",
        isActive: previewViewModel.viewMode === "render" && !workspacePreviewState.isEditing,
        disabled: workspacePreviewState.isDirty || workspacePreviewState.isSaving,
        onClick: () => {
          setWorkspacePreviewViewMode("render");
        }
      }),
      createFileInspectorModeButton({
        label: "Source",
        viewMode: "source",
        isActive: previewViewModel.viewMode === "source" || workspacePreviewState.isEditing,
        disabled: workspacePreviewState.isSaving,
        onClick: () => {
          startWorkspacePreviewEdit();
        }
      })
    );

    actions.append(modeGroup);
  }

  const editGroup = document.createElement("div");
  editGroup.className = "file-inspector-action-group";

  if (workspacePreviewState.isEditing) {
    editGroup.append(
      createFileInspectorIconButton({
        className: "is-save",
        label: "Save file",
        title: "Save file",
        disabled: !workspacePreviewState.isDirty || workspacePreviewState.isSaving,
        iconMarkup: '<path d="M3.25 2.75h7.5l2 2v8.5h-9.5v-10.5Z"></path><path d="M5.25 2.75v3.5h4.25v-3.5"></path><path d="M5.25 13.25v-4h5.5v4"></path>',
        onClick: () => {
          void saveWorkspacePreviewText();
        }
      }),
      createFileInspectorIconButton({
        className: "is-cancel",
        label: "Cancel editing",
        title: "Cancel editing",
        disabled: workspacePreviewState.isSaving,
        iconMarkup: '<path d="M4.75 4.75 11.25 11.25"></path><path d="M11.25 4.75 4.75 11.25"></path>',
        onClick: () => {
          cancelWorkspacePreviewEdit();
        }
      })
    );
  } else if (previewViewModel.canEdit) {
    editGroup.append(createFileInspectorIconButton({
      className: "is-edit",
      label: "Edit source",
      title: "Edit source",
      disabled: workspacePreviewState.isSaving,
      iconMarkup: '<path d="M3.25 12.75h2.5l6-6-2.5-2.5-6 6v2.5Z"></path><path d="M8.75 4.25 11.25 6.75"></path>',
      onClick: () => {
        startWorkspacePreviewEdit();
      }
    }));
  }

  if (editGroup.childElementCount > 0) {
    actions.append(editGroup);
  }

  actions.append(createFileInspectorIconButton({
    className: "is-close",
    label: "Close preview",
    title: "Close preview",
    disabled: workspacePreviewState.isSaving,
    iconMarkup: '<path d="M4.25 4.25 11.75 11.75"></path><path d="M11.75 4.25 4.25 11.75"></path>',
    onClick: () => {
      void closeWorkspacePreviewSafely();
    }
  }));

  return actions;
}

function buildWorkspaceTreeRows(folderRecord, options = {}) {
  if (folderRecord === null) {
    return [];
  }

  const childrenByParentPath = new Map();
  const expandedDirectories = getExpandedDirectoriesForFolder(folderRecord.id);
  const selectedRelativePath = workspaceSelectionState.folderId === folderRecord.id
    ? workspaceSelectionState.relativePath
    : null;

  const filterQuery = typeof options.filterQuery === "string" ? options.filterQuery.trim().toLowerCase() : "";
  const isFiltering = filterQuery.length > 0;
  let includedPaths = null;

  if (isFiltering) {
    includedPaths = new Set();
    folderRecord.entries.forEach((entry) => {
      const matchesName = entry.name.toLowerCase().includes(filterQuery);
      const matchesPath = entry.relativePath.toLowerCase().includes(filterQuery);

      if (!matchesName && !matchesPath) {
        return;
      }

      includedPaths.add(entry.relativePath);
      const parts = entry.relativePath.split("/");
      let ancestor = "";
      for (let index = 0; index < parts.length - 1; index += 1) {
        ancestor = ancestor.length === 0 ? parts[index] : `${ancestor}/${parts[index]}`;
        includedPaths.add(ancestor);
      }
    });
  }

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
      if (isFiltering && !includedPaths.has(entry.relativePath)) {
        return;
      }

      const isDirectory = entry.kind === "directory";
      const isExpanded = isFiltering
        ? isDirectory
        : (isDirectory && expandedDirectories.has(entry.relativePath));

      rows.push({
        ...entry,
        depth,
        isExpanded,
        isLoading: workspaceDirectoryLoadState.folderId === folderRecord.id
          && workspaceDirectoryLoadState.relativePath === entry.relativePath,
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

  destroyWorkspaceMarkdownEditor();
  const previewViewModel = deriveWorkspacePreviewViewModel(workspacePreviewState);
  const isMarkdownFile = isMarkdownWorkspacePreview();
  const relativePath = workspacePreviewState.relativePath ?? "";
  const statusLabel = (() => {
    if (workspacePreviewState.status === "loading") {
      return "Loading";
    }

    if (workspacePreviewState.status === "error") {
      return "Error";
    }

    if (workspacePreviewState.isSaving) {
      return "Saving";
    }

    if (workspacePreviewState.isDirty) {
      return "Unsaved";
    }

    return previewViewModel.mode === "fallback" ? "Limited preview" : "Ready";
  })();

  const fragment = document.createDocumentFragment();
  const tabbar = renderWorkspacePreviewTabs();

  if (tabbar !== null) {
    fragment.append(tabbar);
  }

  const header = document.createElement("div");
  header.className = "file-inspector-header";

  const heading = document.createElement("div");
  heading.className = "file-inspector-heading";

  const title = document.createElement("div");
  title.className = "file-inspector-title";
  title.textContent = previewViewModel.fileName || getWorkspaceEntryName(workspacePreviewState.relativePath);
  title.title = title.textContent;

  const pathMeta = document.createElement("nav");
  pathMeta.className = "file-inspector-path";
  pathMeta.setAttribute("aria-label", "Preview file path");
  pathMeta.title = relativePath;

  relativePath.split("/").filter(Boolean).forEach((pathPart, index, pathParts) => {
    const crumb = document.createElement("span");
    crumb.className = "file-inspector-path-crumb";
    crumb.textContent = pathPart;
    pathMeta.append(crumb);

    if (index < pathParts.length - 1) {
      const separator = document.createElement("span");
      separator.className = "file-inspector-path-separator";
      separator.textContent = "/";
      pathMeta.append(separator);
    }
  });

  const metaRow = document.createElement("div");
  metaRow.className = "file-inspector-meta-row";

  const typeBadge = document.createElement("span");
  typeBadge.className = "file-inspector-type";
  typeBadge.textContent = previewViewModel.typeLabel;

  const statusBadge = document.createElement("span");
  statusBadge.className = "file-inspector-status";
  statusBadge.dataset.status = workspacePreviewState.status === "error"
    ? "error"
    : (workspacePreviewState.isSaving ? "saving" : (workspacePreviewState.isDirty ? "dirty" : "ready"));
  statusBadge.textContent = statusLabel;

  metaRow.append(typeBadge, statusBadge);
  heading.append(title, pathMeta, metaRow);

  header.append(heading, renderFileInspectorActions(previewViewModel));
  fragment.append(header);

  const body = document.createElement("div");
  body.className = "file-inspector-body";
  let markdownEditorMount = null;
  let codeEditorMount = null;
  let codeEditorReadOnly = false;
  let codeEditorInitialText = "";

  if (isMarkdownFile) {
    if (workspacePreviewState.isDirty || workspacePreviewState.saveErrorMessage.length > 0) {
      const banner = document.createElement("div");
      banner.dataset.fileInspectorSaveBanner = "true";
      banner.className = workspacePreviewState.saveErrorMessage.length > 0
        ? "file-inspector-error file-inspector-banner"
        : "file-inspector-empty file-inspector-banner";
      banner.textContent = workspacePreviewState.saveErrorMessage.length > 0
        ? workspacePreviewState.saveErrorMessage
        : (workspacePreviewState.isSaving ? "Saving changes..." : "Unsaved changes. Changes save when you leave the editor or press Cmd+S.");
      body.append(banner);
    }
  }

  if (workspacePreviewState.isEditing) {
    if (isMarkdownFile && typeof createMarkdownEditor === "function") {
      markdownEditorMount = document.createElement("div");
      markdownEditorMount.className = "file-inspector-markdown-editor";
      body.append(markdownEditorMount);
    } else if (typeof createCodeEditor === "function") {
      codeEditorMount = document.createElement("div");
      codeEditorMount.className = "file-inspector-code-editor";
      codeEditorReadOnly = false;
      codeEditorInitialText = workspacePreviewState.draftText;
      body.append(codeEditorMount);

      if (workspacePreviewState.saveErrorMessage.length > 0) {
        const saveError = document.createElement("div");
        saveError.className = "file-inspector-error";
        saveError.dataset.fileInspectorSaveBanner = "true";
        saveError.textContent = workspacePreviewState.saveErrorMessage;
        body.append(saveError);
      }
    } else {
      const editor = document.createElement("textarea");
      editor.className = "file-inspector-editor";
      editor.value = workspacePreviewState.draftText;
      editor.spellcheck = false;
      editor.addEventListener("input", () => {
        updateWorkspacePreviewDraftText(editor.value);
        updateWorkspacePreviewInlineSaveState();
      });
      editor.addEventListener("blur", () => {
        if (workspacePreviewState.isDirty && workspacePreviewState.isSaving !== true) {
          void saveWorkspacePreviewText();
        }
      });
      editor.addEventListener("keydown", (event) => {
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
          event.preventDefault();
          void saveWorkspacePreviewText();
        }
      });
      body.append(editor);

      if (workspacePreviewState.saveErrorMessage.length > 0) {
        const saveError = document.createElement("div");
        saveError.className = "file-inspector-error";
        saveError.dataset.fileInspectorSaveBanner = "true";
        saveError.textContent = workspacePreviewState.saveErrorMessage;
        body.append(saveError);
      }
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
  } else if (typeof createCodeEditor === "function") {
    codeEditorMount = document.createElement("div");
    codeEditorMount.className = "file-inspector-code-editor is-readonly";
    codeEditorReadOnly = true;
    codeEditorInitialText = previewViewModel.textContents;
    body.append(codeEditorMount);
  } else {
    const pre = document.createElement("pre");
    pre.className = "file-inspector-content";
    pre.textContent = previewViewModel.textContents;
    body.append(pre);
  }

  fragment.append(body);
  fileInspector.replaceChildren(fragment);

  if (markdownEditorMount !== null && typeof createMarkdownEditor === "function") {
    workspaceMarkdownEditor = createMarkdownEditor({
      parentElement: markdownEditorMount,
      initialText: workspacePreviewState.draftText,
      readOnly: workspacePreviewState.isSaving,
      onBlur: () => {
        if (workspacePreviewState.isDirty && workspacePreviewState.isSaving !== true) {
          void saveWorkspacePreviewText();
        }
      },
      onChange: (nextText) => {
        updateWorkspacePreviewDraftText(nextText);
        updateWorkspacePreviewInlineSaveState();
      },
      onSaveShortcut: () => {
        void saveWorkspacePreviewText();
      }
    });
    window.requestAnimationFrame(() => {
      workspaceMarkdownEditor?.focus();
    });
  } else if (codeEditorMount !== null && typeof createCodeEditor === "function") {
    workspaceMarkdownEditor = createCodeEditor({
      parentElement: codeEditorMount,
      fileName: previewViewModel.fileName,
      initialText: codeEditorInitialText,
      readOnly: codeEditorReadOnly || workspacePreviewState.isSaving,
      onBlur: () => {
        if (!codeEditorReadOnly && workspacePreviewState.isDirty && workspacePreviewState.isSaving !== true) {
          void saveWorkspacePreviewText();
        }
      },
      onChange: (nextText) => {
        if (codeEditorReadOnly) {
          return;
        }
        updateWorkspacePreviewDraftText(nextText);
        updateWorkspacePreviewInlineSaveState();
      },
      onSaveShortcut: () => {
        if (!codeEditorReadOnly) {
          void saveWorkspacePreviewText();
        }
      }
    });
    if (!codeEditorReadOnly) {
      window.requestAnimationFrame(() => {
        workspaceMarkdownEditor?.focus();
      });
    }
  }
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
  rememberWorkspacePreviewTab(activeFolder, relativePath);
  destroyWorkspaceMarkdownEditor();
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
  workspacePreviewState.isDirty = false;
  workspacePreviewState.isSaving = false;
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
    workspacePreviewState.isDirty = false;
    workspacePreviewState.isSaving = false;

    if (isEditableWorkspacePreviewData(preview)) {
      workspacePreviewState.viewMode = "source";
      workspacePreviewState.isEditing = true;
    }

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
    workspacePreviewState.isDirty = false;
    workspacePreviewState.isSaving = false;
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

  if (workspacePreviewState.isDirty) {
    const shouldDiscardChanges = await confirmWorkspaceAction(
      "Discard changes",
      "Refreshing this file will discard your unsaved markdown changes.",
      "Refresh file"
    );

    if (!shouldDiscardChanges) {
      return null;
    }
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

async function toggleWorkspaceDirectory(relativePath) {
  const activeFolder = getActiveWorkspaceFolder();
  const activeCanvas = getActiveCanvas();

  if (activeFolder === null || activeCanvas === null) {
    return;
  }

  const wasExpanded = getCanvasWorkspaceExpandedDirectories(activeCanvas).includes(relativePath);
  const needsDirectoryRefresh = !wasExpanded && !hasWorkspaceDirectoryLoaded(activeFolder, relativePath);

  toggleCanvasWorkspaceExpandedDirectory(activeCanvas, relativePath);

  captureActiveCanvasWorkspaceSnapshot();
  renderWorkspaceBrowser();
  scheduleAppSessionSave();

  if (!needsDirectoryRefresh) {
    return;
  }

  workspaceDirectoryLoadState.folderId = activeFolder.id;
  workspaceDirectoryLoadState.relativePath = relativePath;
  renderWorkspaceBrowser();

  try {
    await refreshWorkspaceDirectory({ silent: true });
  } finally {
    if (
      workspaceDirectoryLoadState.folderId === activeFolder.id
      && workspaceDirectoryLoadState.relativePath === relativePath
    ) {
      workspaceDirectoryLoadState.folderId = null;
      workspaceDirectoryLoadState.relativePath = null;
      renderWorkspaceBrowser();
    }
  }
}

function updateWorkspaceControls() {
  const workspaceActionContext = getWorkspaceActionContext();
  const canSearchWorkspace = hasWorkspaceDirectory() && (getActiveWorkspaceFolder()?.entries.length ?? 0) > 0;

  if (focusWorkspaceSearchButton instanceof HTMLButtonElement) {
    focusWorkspaceSearchButton.disabled = !canSearchWorkspace;
    focusWorkspaceSearchButton.classList.toggle("is-active", workspaceFilterQuery.trim().length > 0);
    focusWorkspaceSearchButton.setAttribute("aria-pressed", workspaceFilterQuery.trim().length > 0 ? "true" : "false");
    focusWorkspaceSearchButton.title = canSearchWorkspace ? "Search workspace files" : "Open a workspace to search files";
  }

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

function focusWorkspaceSearch(options = {}) {
  if (!hasWorkspaceDirectory()) {
    openWorkspaceDrawer();
    return false;
  }

  openWorkspaceDrawer();
  renderWorkspaceBrowser();

  window.requestAnimationFrame(() => {
    const searchInput = workspaceBrowser.querySelector(".workspace-browser-search-input");

    if (searchInput instanceof HTMLInputElement) {
      searchInput.focus();

      if (options.select === true) {
        searchInput.select();
      }
    }
  });

  return true;
}

function createWorkspaceEntryDecoration(entry) {
  const decoration = document.createElement("span");
  decoration.className = "workspace-browser-entry-decoration";
  decoration.setAttribute("aria-hidden", "true");

  const disclosure = document.createElement("span");
  disclosure.className = "workspace-browser-entry-disclosure";

  if (entry.kind === "directory") {
    disclosure.classList.toggle("is-expanded", entry.isExpanded);
    disclosure.classList.toggle("is-loading", entry.isLoading === true);
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

function createWorkspaceBrowserActionButton({ iconMarkup, label, title, onClick }) {
  const button = document.createElement("button");
  button.className = "canvas-list-action workspace-browser-summary-action";
  button.type = "button";
  button.setAttribute("aria-label", label);
  button.title = title;
  button.innerHTML = `<svg class="sidebar-section-icon" viewBox="0 0 16 16" aria-hidden="true">${iconMarkup}</svg>`;
  button.addEventListener("click", () => {
    void onClick().catch((error) => {
      void showWorkspaceActionError(error);
    });
  });
  return button;
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
  const workspaceActionContext = getWorkspaceActionContext();

  if (activeFolder !== null) {
    const summary = document.createElement("div");
    summary.className = "workspace-browser-summary";

    const summaryHeader = document.createElement("div");
    summaryHeader.className = "workspace-browser-summary-header";

    const name = document.createElement("div");
    name.className = "workspace-browser-name";
    name.textContent = activeFolder.rootName;

    const summaryActions = document.createElement("div");
    summaryActions.className = "workspace-browser-summary-actions";

    if (workspaceActionContext.canReveal) {
      summaryActions.append(createWorkspaceBrowserActionButton({
        iconMarkup: '<circle cx="8" cy="8" r="2.25"></circle><path d="M8 3.75v1.25"></path><path d="M8 11v1.25"></path><path d="M3.75 8H5"></path><path d="M11 8h1.25"></path>',
        label: workspaceActionContext.revealLabel,
        title: `${workspaceActionContext.revealLabel}: ${workspaceActionContext.targetLabel}`,
        onClick: () => window.noteCanvas.revealWorkspaceEntry(activeFolder.id, workspaceActionContext.targetRelativePath)
      }));
    }

    summaryHeader.append(name, summaryActions);

    const currentPath = document.createElement("div");
    currentPath.className = "workspace-browser-path";
    currentPath.textContent = activeFolder.rootPath;
    currentPath.title = activeFolder.rootPath;

    const meta = document.createElement("div");
    meta.className = "workspace-browser-meta";
    meta.textContent = `${activeFolder.entries.length} ${activeFolder.entries.length === 1 ? "entry" : "entries"}`;

    summary.append(summaryHeader, currentPath, meta);

    if (activeFolder.entries.length > 0) {
      const search = document.createElement("div");
      search.className = "workspace-browser-search";

      const searchInput = document.createElement("input");
      searchInput.className = "workspace-browser-search-input";
      searchInput.type = "search";
      searchInput.placeholder = "Filter files…";
      searchInput.spellcheck = false;
      searchInput.setAttribute("aria-label", "Filter workspace files");
      searchInput.value = workspaceFilterQuery;
      searchInput.addEventListener("input", () => {
        workspaceFilterQuery = searchInput.value;
        renderWorkspaceBrowser();
        updateWorkspaceControls();
        const refreshedInput = workspaceBrowser.querySelector(".workspace-browser-search-input");
        if (refreshedInput instanceof HTMLInputElement) {
          refreshedInput.focus();
          const caret = refreshedInput.value.length;
          refreshedInput.setSelectionRange(caret, caret);
        }
      });
      searchInput.addEventListener("keydown", (event) => {
        if (event.key !== "Escape") {
          return;
        }

        if (workspaceFilterQuery.length === 0) {
          searchInput.blur();
          return;
        }

        event.preventDefault();
        workspaceFilterQuery = "";
        renderWorkspaceBrowser();
        updateWorkspaceControls();
        focusWorkspaceSearch();
      });

      search.append(searchInput);
      summary.append(search);
    }

    fragment.append(summary);

    if (activeFolder.lastError.length > 0) {
      const error = document.createElement("div");
      error.className = "workspace-browser-error";
      error.textContent = activeFolder.lastError;
      fragment.append(error);
    } else if (activeFolder.entries.length > 0) {
      const treeRows = buildWorkspaceTreeRows(activeFolder, { filterQuery: workspaceFilterQuery });

      if (treeRows.length === 0) {
        const empty = document.createElement("div");
        empty.className = "workspace-browser-empty";
        empty.textContent = "No files match your filter.";
        fragment.append(empty);
      } else {
      const entryList = document.createElement("ul");
      entryList.className = "workspace-browser-list";
      entryList.dataset.workspaceRootPath = activeFolder.rootPath;

      treeRows.forEach((entry) => {
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
        button.classList.toggle("is-loading", entry.isLoading === true);

        if (entry.isLoading === true) {
          button.setAttribute("aria-busy", "true");
        }

        const decoration = createWorkspaceEntryDecoration(entry);

        const label = document.createElement("span");
        label.className = "workspace-browser-entry-label";
        label.textContent = entry.name;

        button.append(decoration, label);

        if (entry.kind === "directory") {
          button.setAttribute("aria-expanded", entry.isExpanded ? "true" : "false");
          button.addEventListener("click", () => {
            setWorkspaceSelection(activeFolder.id, entry.relativePath, "directory");
            void toggleWorkspaceDirectory(entry.relativePath).catch((error) => {
              console.error(error);
            });
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
      }
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

  pruneWorkspacePreviewTabs();

  if (
    workspaceDirectoryLoadState.folderId !== null
    && getWorkspaceFolderById(workspaceDirectoryLoadState.folderId) === null
  ) {
    workspaceDirectoryLoadState.folderId = null;
    workspaceDirectoryLoadState.relativePath = null;
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
    workspaceFilterQuery = "";
    clearWorkspacePreview({
      skipCanvasWorkspaceSync: options.skipCanvasWorkspaceSync,
      skipSessionSave: options.skipCanvasWorkspaceSync
    });
  }

  renderCanvasOverviewHeader();

  const previewFolder = workspacePreviewState.folderId === null ? null : getWorkspaceFolderById(workspacePreviewState.folderId);
  const previewFileStillExists = previewFolder !== null
    && getWorkspaceFilePaths(previewFolder).has(workspacePreviewState.relativePath);
  const shouldSuppressOpenPreviewRefresh = previewFileStillExists
    && shouldSuppressWorkspacePreviewOwnSaveRefresh(
      workspacePreviewState.folderId,
      workspacePreviewState.relativePath
    );
  const shouldAutoRefreshOpenPreview = options.skipCanvasWorkspaceSync !== true
    && shouldSuppressOpenPreviewRefresh !== true
    && previewFolder !== null
    && isWorkspacePreviewOpen()
    && previewFileStillExists
    && workspacePreviewState.isDirty !== true
    && workspacePreviewState.isSaving !== true
    && workspacePreviewState.status !== "loading"
    && typeof workspacePreviewState.relativePath === "string";
  const autoRefreshRelativePath = shouldAutoRefreshOpenPreview ? workspacePreviewState.relativePath : null;

  if (
    previewFolder === null
    || !previewFileStillExists
  ) {
    clearWorkspacePreview({
      skipCanvasWorkspaceSync: options.skipCanvasWorkspaceSync,
      skipSessionSave: options.skipCanvasWorkspaceSync
    });
  }

  syncWorkspaceSelectionWithState();

  renderWorkspaceBrowser();

  if (shouldSuppressOpenPreviewRefresh) {
    if (workspacePreviewState.isSaving !== true) {
      clearPendingWorkspacePreviewOwnSave(
        workspacePreviewState.folderId,
        workspacePreviewState.relativePath
      );
    }

    updateWorkspacePreviewInlineSaveState();
  } else {
    renderFileInspector();
  }

  if (options.skipCanvasWorkspaceSync !== true) {
    captureActiveCanvasWorkspaceSnapshot();
  }

  scheduleAppSessionSave();

  if (typeof autoRefreshRelativePath === "string" && getWorkspaceFilePaths(getActiveWorkspaceFolder()).has(autoRefreshRelativePath)) {
    window.setTimeout(() => {
      if (
        workspacePreviewState.relativePath === autoRefreshRelativePath
        && workspacePreviewState.isDirty !== true
        && workspacePreviewState.isSaving !== true
      ) {
        void loadWorkspaceFilePreview(autoRefreshRelativePath, { preserveViewMode: true });
      }
    }, 0);
  }
}

async function refreshWorkspaceDirectory(options = {}) {
  if (!hasWorkspaceDirectory()) {
    return null;
  }

  if (workspaceState.isRefreshing) {
    pendingWorkspaceDirectoryRefresh = true;
    return null;
  }

  workspaceState.isRefreshing = true;
  updateWorkspaceControls();

  try {
    const nextState = await window.noteCanvas.refreshWorkspaceDirectory({
      expandedDirectoryPaths: getActiveWorkspaceExpandedDirectoryPaths()
    });

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

    if (pendingWorkspaceDirectoryRefresh) {
      pendingWorkspaceDirectoryRefresh = false;
      void refreshWorkspaceDirectory({ silent: true }).catch((error) => {
        console.error(error);
      });
    }
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
  scheduleCanvasAgentSync();
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

function getCanvasActiveSessionKey(canvasRecord) {
  return activeNodeRecord?.canvas?.id === canvasRecord.id
    ? activeNodeRecord.sessionKey
    : null;
}

function serializeTerminalNodeRecord(nodeRecord) {
  return {
    x: nodeRecord.x,
    y: nodeRecord.y,
    width: nodeRecord.width,
    height: nodeRecord.height,
    cwd: nodeRecord.cwd,
    shellName: nodeRecord.shellName,
    title: nodeRecord.titleText,
    isMaximized: nodeRecord.isMaximized,
    sessionKey: nodeRecord.sessionKey,
    tmuxSessionName: nodeRecord.tmuxSessionName,
    managedAgentName: nodeRecord.managedAgentName,
    managedAgentRole: nodeRecord.managedAgentRole,
    managedProjectTag: nodeRecord.managedProjectTag,
    managedParentAgent: nodeRecord.managedParentAgent,
    managedCommanderAgent: nodeRecord.managedCommanderAgent,
    managedDepth: nodeRecord.managedDepth,
    isManager: nodeRecord.isManager,
    isExited: nodeRecord.isExited,
    exitCode: nodeRecord.exitCode,
    exitSignal: nodeRecord.exitSignal
  };
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
      workspace: canvasRecord.workspace ?? null,
      agentProjectTag: canvasRecord.agentProjectTag,
      managerAgentName: canvasRecord.managerAgentName,
      activeSessionKey: getCanvasActiveSessionKey(canvasRecord),
      terminalNodes: canvasRecord.nodes.map(serializeTerminalNodeRecord)
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
    agentProjectTag: canvasRecord.agentProjectTag,
    managerAgentName: canvasRecord.managerAgentName,
    activeSessionKey: getCanvasActiveSessionKey(canvasRecord),
    terminalNodes: exportedCanvas.terminalNodes
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
      isRailCollapsed,
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

  if (canvasRecord.id === activeCanvasId) {
    scheduleCanvasAgentSync();
  }
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
      workspace: canvasSnapshot.workspace ?? null,
      agentProjectTag: canvasSnapshot.agentProjectTag ?? null,
      managerAgentName: canvasSnapshot.managerAgentName ?? null
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
          managedAgentName: nodeSnapshot.managedAgentName,
          managedAgentRole: nodeSnapshot.managedAgentRole,
          managedProjectTag: nodeSnapshot.managedProjectTag,
          managedParentAgent: nodeSnapshot.managedParentAgent,
          managedCommanderAgent: nodeSnapshot.managedCommanderAgent,
          managedDepth: nodeSnapshot.managedDepth,
          tmuxSessionName: nodeSnapshot.tmuxSessionName,
          isManager: nodeSnapshot.isManager,
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

    const restoredActiveCanvasSnapshot = persistedCanvases.find(
      (canvasSnapshot) => canvasSnapshot.id === restoredActiveCanvas.id
    ) ?? null;
    const restoredActiveNode = (() => {
      if (restoredActiveCanvasSnapshot === null) {
        return restoredActiveCanvas.nodes.find((nodeRecord) => !nodeRecord.isExited) ?? null;
      }

      if (typeof restoredActiveCanvasSnapshot.activeSessionKey === "string") {
        return restoredActiveCanvas.nodes.find(
          (nodeRecord) => nodeRecord.sessionKey === restoredActiveCanvasSnapshot.activeSessionKey
        ) ?? null;
      }

      return restoredActiveCanvas.nodes.find((nodeRecord) => nodeRecord.isMaximized)
        ?? restoredActiveCanvas.nodes.find((nodeRecord) => !nodeRecord.isExited)
        ?? restoredActiveCanvas.nodes[0]
        ?? null;
    })();

    if (restoredActiveNode !== null) {
      setActiveNode(restoredActiveNode);
    }
  }
}

async function initializeApp() {
  isSessionHydrating = true;

  try {
    setRailCollapsed(false);
    setSidebarCollapsed(true);
    setBoardIntroDismissed(false);
    renderCanvasSwitcher();
    renderWorkspaceBrowser();
    renderFileInspector();

    const sessionSnapshot = await window.noteCanvas.loadAppSession();

    if (sessionSnapshot !== null) {
      setRailCollapsed(sessionSnapshot.ui.isRailCollapsed);
      setSidebarCollapsed(sessionSnapshot.ui.isSidebarCollapsed);
      setBoardIntroDismissed(sessionSnapshot.ui.hasDismissedBoardIntro);
      await restoreCanvasSession(sessionSnapshot);
    }

    // No canvas yet (fresh start / empty session): don't auto-create a phantom
    // folderless canvas. Show the welcome prompt so the user opens a folder first.
    const activeCanvas = getActiveCanvas();

    if (activeCanvas !== null) {
      await restoreCanvasWorkspace(activeCanvas);
    } else {
      applyWorkspaceState(await window.noteCanvas.getWorkspaceDirectoryState());
    }

    scheduleCanvasAgentSync();
  } catch (error) {
    console.error(error);
  } finally {
    isSessionHydrating = false;
    // Render once more so the board reflects the final state — in particular the
    // no-canvas welcome prompt, which otherwise never renders without an active canvas.
    renderCanvas();
    flushAppSessionSave();
    void maybePromptForAgentSkillInstall();
  }
}

function parseImportedCanvasWorkspace(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const rootPath = normalizeOptionalString(value?.rootPath);

  if (rootPath === null) {
    return null;
  }

  return {
    rootPath,
    rootName: normalizeOptionalString(value?.rootName) ?? rootPath.split(/[\\/]/u).filter(Boolean).at(-1) ?? rootPath,
    expandedDirectoryPaths: Array.isArray(value?.expandedDirectoryPaths)
      ? value.expandedDirectoryPaths.filter((directoryPath) => typeof directoryPath === "string" && directoryPath.length > 0)
      : [],
    previewRelativePath: normalizeOptionalString(value?.previewRelativePath)
  };
}

function parseImportedTerminalNode(nodeRecord) {
  const sessionKey = normalizeImportedSessionKey(nodeRecord?.sessionKey);
  const managedAgentName = normalizeManagedAgentName(nodeRecord?.managedAgentName);
  const isManager = nodeRecord?.isManager === true;

  return {
    x: Number.isFinite(nodeRecord?.x) ? nodeRecord.x : 0,
    y: Number.isFinite(nodeRecord?.y) ? nodeRecord.y : 0,
    width: clampNodeDimension(nodeRecord?.width, MIN_NODE_WIDTH, DEFAULT_NODE_WIDTH),
    height: clampNodeDimension(nodeRecord?.height, MIN_NODE_HEIGHT, DEFAULT_NODE_HEIGHT),
    cwd: typeof nodeRecord?.cwd === "string" ? nodeRecord.cwd : null,
    shellName: normalizeOptionalString(nodeRecord?.shellName),
    title: typeof nodeRecord?.title === "string" ? nodeRecord.title : "",
    isMaximized: nodeRecord?.isMaximized === true,
    sessionKey,
    tmuxSessionName: normalizeOptionalString(nodeRecord?.tmuxSessionName),
    managedAgentName,
    managedAgentRole: managedAgentName === null
      ? null
      : normalizeManagedAgentRole(nodeRecord?.managedAgentRole, isManager),
    managedProjectTag: normalizeOptionalString(nodeRecord?.managedProjectTag),
    managedParentAgent: normalizeManagedAgentName(nodeRecord?.managedParentAgent),
    managedCommanderAgent: normalizeManagedAgentName(nodeRecord?.managedCommanderAgent),
    managedDepth: Number.isInteger(nodeRecord?.managedDepth) ? nodeRecord.managedDepth : null,
    isManager,
    isExited: nodeRecord?.isExited === true,
    exitCode: Number.isInteger(nodeRecord?.exitCode) ? nodeRecord.exitCode : null,
    exitSignal: normalizeOptionalString(nodeRecord?.exitSignal)
  };
}

function parseImportedCanvas(rawContents) {
  const parsed = JSON.parse(rawContents);
  const canvas = parsed?.canvas;
  const viewportOffset = canvas?.viewportOffset;
  const viewportScale = canvas?.viewportScale;
  const terminalNodes = Array.isArray(canvas?.terminalNodes) ? canvas.terminalNodes : null;

  if (!SUPPORTED_CANVAS_EXPORT_VERSIONS.includes(parsed?.version) || typeof canvas?.name !== "string" || terminalNodes === null) {
    throw new Error("Invalid canvas file format.");
  }

  return {
    name: canvas.name,
    viewportOffset: {
      x: Number.isFinite(viewportOffset?.x) ? viewportOffset.x : 0,
      y: Number.isFinite(viewportOffset?.y) ? viewportOffset.y : 0
    },
    viewportScale: roundCanvasScale(Number.isFinite(viewportScale) ? viewportScale : 1),
    workspace: parseImportedCanvasWorkspace(canvas.workspace),
    agentProjectTag: normalizeOptionalString(canvas.agentProjectTag),
    managerAgentName: normalizeManagedAgentName(canvas.managerAgentName),
    activeSessionKey: normalizeImportedSessionKey(canvas.activeSessionKey),
    terminalNodes: terminalNodes.map(parseImportedTerminalNode)
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
    viewportScale: importedCanvas.viewportScale,
    workspace: importedCanvas.workspace ?? null,
    agentProjectTag: importedCanvas.agentProjectTag ?? null,
    managerAgentName: importedCanvas.managerAgentName ?? null
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
        shellName: nodeRecord.shellName,
        title: nodeRecord.title,
        isMaximized: nodeRecord.isMaximized,
        isExited: nodeRecord.isExited,
        exitCode: nodeRecord.exitCode,
        exitSignal: nodeRecord.exitSignal,
        sessionKey: nodeRecord.sessionKey,
        tmuxSessionName: nodeRecord.tmuxSessionName,
        managedAgentName: nodeRecord.managedAgentName,
        managedAgentRole: nodeRecord.managedAgentRole,
        managedProjectTag: nodeRecord.managedProjectTag,
        managedParentAgent: nodeRecord.managedParentAgent,
        managedCommanderAgent: nodeRecord.managedCommanderAgent,
        managedDepth: nodeRecord.managedDepth,
        isManager: nodeRecord.isManager,
        shouldFocus: false
      });

      if (createdNode !== undefined) {
        createdNodes.push(createdNode);
      }
    }

    const activeImportedNode = importedCanvas.activeSessionKey !== null
      ? createdNodes.find((nodeRecord) => nodeRecord.sessionKey === importedCanvas.activeSessionKey) ?? null
      : null;
    const fallbackImportedNode = activeImportedNode
      ?? createdNodes.find((nodeRecord) => nodeRecord.isMaximized)
      ?? createdNodes.find((nodeRecord) => !nodeRecord.isExited)
      ?? createdNodes[0]
      ?? null;

    if (fallbackImportedNode !== null) {
      setActiveNode(fallbackImportedNode);
    }

    scheduleCanvasAgentSync();
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
  const railWidth = appShell?.querySelector(".app-rail")?.getBoundingClientRect().width ?? 0;
  const otherPanelWidth = panelKind === "sidebar"
    ? (isWorkspacePreviewOpen() ? fileInspector?.getBoundingClientRect().width ?? 0 : 0)
    : (!isSidebarCollapsed ? sidebarPanel?.getBoundingClientRect().width ?? 0 : 0);
  const maximumWidth = viewportWidth - railWidth - otherPanelWidth - MIN_CANVAS_COLUMN_WIDTH - PANEL_VIEWPORT_MARGIN;

  return {
    minimumWidth,
    maximumWidth: Math.max(minimumWidth, maximumWidth)
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

    closeTerminalNodeMenu();

    setActiveNode(null);
    activeCanvasId = canvasId;

    if (!isSessionHydrating) {
      if (nextCanvas.workspace === null) {
        applyWorkspaceState({ importedFolders: [], activeFolderId: null }, { skipCanvasWorkspaceSync: true });
      }

      void restoreCanvasWorkspace(nextCanvas);
    }

    closeCanvasSwitcherMenu();
    scheduleCanvasAgentSync();

    scheduleAppSessionSave();
  }

  renderCanvasSwitcher();
  renderCanvas({ syncTerminalSizes: true });
}

function createCanvas() {
  const canvasRecord = createCanvasRecord();
  setActiveCanvas(canvasRecord.id);
}

// "New canvas" / "Open a folder": pick the workspace folder FIRST (VS Code / Zed
// "new project" flow), then create the canvas bound to it only on success. Cancel
// creates nothing, so we never leave a phantom folderless canvas behind. Used by
// both the "+" button and the no-canvas welcome prompt.
async function createCanvasWithWorkspace() {
  let opened = null;

  try {
    opened = await window.noteCanvas.chooseCanvasWorkspace();
  } catch (error) {
    console.error(error);
    return null;
  }

  if (opened == null || opened.canceled === true || opened.state == null) {
    return null;
  }

  // Resolve the folder that was just opened so the new canvas is created already
  // bound to it. This is essential: setActiveCanvas() restores a folderless canvas
  // with an empty workspace, which would otherwise race-overwrite the picked folder
  // and leave the Explorer blank. Binding up front routes through the normal restore.
  const importedFolders = Array.isArray(opened.state.importedFolders) ? opened.state.importedFolders : [];
  const openedFolder = importedFolders.find((folder) => folder?.id === opened.state.activeFolderId)
    ?? importedFolders[0]
    ?? null;

  if (openedFolder == null || typeof openedFolder.rootPath !== "string") {
    return null;
  }

  const workspaceRootName = typeof openedFolder.rootName === "string" && openedFolder.rootName.trim().length > 0
    ? openedFolder.rootName.trim()
    : openedFolder.rootPath.split(/[\\/]/u).filter(Boolean).at(-1) ?? openedFolder.rootPath;

  const canvasRecord = createCanvasRecord({
    name: workspaceRootName,
    workspace: {
      rootPath: openedFolder.rootPath,
      rootName: workspaceRootName,
      expandedDirectoryPaths: [],
      previewRelativePath: null
    }
  });

  setActiveCanvas(canvasRecord.id);
  openWorkspaceDrawer();
  return canvasRecord;
}

async function deleteCanvas(canvasId) {
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

    if (fallbackCanvas !== null) {
      setActiveCanvas(fallbackCanvas.id);
    } else {
      activeCanvasId = null;
      applyWorkspaceState({ importedFolders: [], activeFolderId: null }, { skipCanvasWorkspaceSync: true });
      clearWorkspacePreview({ skipCanvasWorkspaceSync: true });
      closeCanvasSwitcherMenu();
      scheduleCanvasAgentSync();
    }
  }

  renderCanvasSwitcher();
  renderCanvas({ syncTerminalSizes: true });

  await Promise.all(nodesToRemove.map((nodeRecord) => destroyTerminalNode(nodeRecord)));
  scheduleAppSessionSave();
}

async function closeActiveCanvasWithConfirmation() {
  const activeCanvas = getActiveCanvas();

  if (activeCanvas === null) {
    return;
  }

  const visibleNodes = getVisibleCanvasNodes(activeCanvas);
  const terminalWarning = visibleNodes.length > 0
    ? ` This also closes ${visibleNodes.length} ${visibleNodes.length === 1 ? "terminal" : "terminals"}.`
    : "";
  const confirmed = await confirmWorkspaceAction(
    "Close canvas",
    `Close ${activeCanvas.name}? This removes it from TermCanvas.${terminalWarning}`,
    "Close canvas"
  );

  if (!confirmed) {
    return;
  }

  await deleteCanvas(activeCanvas.id);
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
  scheduleMinimapRender();
  scheduleCanvasEdgeRender();
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
  scheduleMinimapRender();
  scheduleCanvasEdgeRender();
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

  const leadDot = document.createElement("span");
  leadDot.className = "terminal-node-lead-dot";
  leadDot.setAttribute("aria-hidden", "true");

  const titleGroup = document.createElement("div");
  titleGroup.className = "terminal-node-title-group";

  const titleInput = document.createElement("input");
  titleInput.className = "terminal-node-title-input";
  titleInput.type = "text";
  titleInput.maxLength = MAX_TERMINAL_TITLE_LENGTH;
  titleInput.spellcheck = false;
  titleInput.setAttribute("aria-label", `Rename terminal ${nodeRecord.id}`);
  titleInput.readOnly = true;
  titleInput.tabIndex = -1;

  const meta = document.createElement("div");
  meta.className = "terminal-node-meta";
  meta.textContent = "Starting shell";
  meta.hidden = true;

  const roleBadge = document.createElement("span");
  roleBadge.className = "terminal-node-role-badge";
  roleBadge.textContent = getTerminalNodeRoleLabel(nodeRecord);
  roleBadge.dataset.role = roleBadge.textContent.toLowerCase();

  const copySessionButton = document.createElement("button");
  copySessionButton.className = "terminal-node-menu-item terminal-node-copy-session";
  copySessionButton.type = "button";
  copySessionButton.setAttribute("role", "menuitem");
  copySessionButton.textContent = "Copy session ID";

  titleGroup.append(titleInput);
  dragArea.append(grabHandle, leadDot, titleGroup);

  const status = leadDot;
  const statusLabel = document.createElement("span");
  statusLabel.className = "terminal-node-status-label";
  statusLabel.textContent = "Booting";
  status.dataset.state = "pending";

  const actions = document.createElement("div");
  actions.className = "terminal-node-actions";

  const renameButton = document.createElement("button");
  renameButton.className = "terminal-node-control terminal-node-rename";
  renameButton.type = "button";
  renameButton.innerHTML = '<svg class="terminal-node-control-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.25 12.75h2.5l6-6-2.5-2.5-6 6v2.5Z"></path><path d="M8.75 4.25 11.25 6.75"></path></svg>';
  renameButton.setAttribute("aria-label", `Rename terminal ${nodeRecord.id}`);
  renameButton.setAttribute("aria-pressed", "false");
  renameButton.title = "Rename terminal";

  const maximizeButton = document.createElement("button");
  maximizeButton.className = "terminal-node-control terminal-node-maximize";
  maximizeButton.type = "button";

  const menuRoot = document.createElement("div");
  menuRoot.className = "terminal-node-menu";

  const menuButton = document.createElement("button");
  menuButton.className = "terminal-node-control terminal-node-menu-button";
  menuButton.type = "button";
  menuButton.innerHTML = '<svg class="terminal-node-control-icon" viewBox="0 0 16 16" aria-hidden="true"><circle cx="4" cy="8" r="1"></circle><circle cx="8" cy="8" r="1"></circle><circle cx="12" cy="8" r="1"></circle></svg>';
  menuButton.setAttribute("aria-label", `Terminal actions for ${nodeRecord.titleText}`);
  menuButton.setAttribute("aria-haspopup", "menu");
  menuButton.setAttribute("aria-expanded", "false");
  menuButton.title = "Terminal actions";

  const menuPopover = document.createElement("div");
  menuPopover.className = "terminal-node-menu-popover";
  menuPopover.setAttribute("role", "menu");
  menuPopover.hidden = true;

  const closeButton = document.createElement("button");
  closeButton.className = "terminal-node-menu-item terminal-node-close";
  closeButton.type = "button";
  closeButton.setAttribute("role", "menuitem");
  closeButton.setAttribute("aria-label", `Close terminal ${nodeRecord.id}`);
  closeButton.textContent = "Close terminal";

  menuPopover.append(copySessionButton, closeButton);
  menuRoot.append(menuButton, menuPopover);
  actions.append(renameButton, maximizeButton, menuRoot);
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
    roleBadge,
    copySessionButton,
    status,
    statusLabel,
    titleInput,
    titleGroup,
    renameButton,
    maximizeButton,
    menuRoot,
    menuButton,
    menuPopover,
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
    roleBadge: null,
    copySessionButton: null,
    status: null,
    statusLabel: null,
    titleInput: null,
    titleGroup: null,
    renameButton: null,
    maximizeButton: null,
    menuRoot: null,
    menuButton: null,
    menuPopover: null,
    closeButton: null,
    reopenButton: null,
    resizeHandles: [],
    isTitleEditing: false,
    shellName: typeof options.shellName === "string" && options.shellName.length > 0 ? options.shellName : "Shell",
    backend: "unknown",
    tmuxSessionName: normalizeOptionalString(options.tmuxSessionName),
    managedAgentName: normalizeManagedAgentName(options.managedAgentName),
    managedAgentRole: normalizeManagedAgentName(options.managedAgentName) === null
      ? null
      : normalizeManagedAgentRole(options.managedAgentRole, options.isManager === true),
    managedProjectTag: typeof options.managedProjectTag === "string" && options.managedProjectTag.length > 0 ? options.managedProjectTag : null,
    managedParentAgent: normalizeManagedAgentName(options.managedParentAgent),
    managedCommanderAgent: normalizeManagedAgentName(options.managedCommanderAgent),
    managedDepth: Number.isInteger(options.managedDepth) ? options.managedDepth : null,
    managedRuntimeState: typeof options.managedRuntimeState === "string" && options.managedRuntimeState.length > 0 ? options.managedRuntimeState : null,
    managedAgentState: typeof options.managedAgentState === "string" && options.managedAgentState.length > 0 ? options.managedAgentState : null,
    isManager: options.isManager === true,
    titleText: normalizeTerminalTitle(
      getManagedAgentNodeTitle({
        agentName: options.managedAgentName,
        role: options.managedAgentRole,
        isManager: options.isManager,
        title: options.title
      }),
      `Terminal ${terminalCount}`
    )
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
  nodeRecord.roleBadge = elements.roleBadge;
  nodeRecord.copySessionButton = elements.copySessionButton;
  nodeRecord.status = elements.status;
  nodeRecord.statusLabel = elements.statusLabel;
  nodeRecord.titleInput = elements.titleInput;
  nodeRecord.titleGroup = elements.titleGroup;
  nodeRecord.renameButton = elements.renameButton;
  nodeRecord.maximizeButton = elements.maximizeButton;
  nodeRecord.menuRoot = elements.menuRoot;
  nodeRecord.menuButton = elements.menuButton;
  nodeRecord.menuPopover = elements.menuPopover;
  nodeRecord.closeButton = elements.closeButton;
  nodeRecord.reopenButton = elements.reopenButton;
  nodeRecord.resizeHandles = elements.resizeHandles;

  applyNodeSize(nodeRecord, options.width, options.height);

  updateNodeTitleInput(nodeRecord);
  setNodeTitleEditing(nodeRecord, false);
  syncMaximizeButton(nodeRecord);

  elements.closeButton.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    closeTerminalNodeMenu({ restoreFocus: true });
    if (nodeRecord.isManager) {
      return;
    }

    if (nodeRecord.managedAgentName !== null) {
      void deleteManagedAgentNode(nodeRecord);
      return;
    }

    void destroyTerminalNode(nodeRecord);
  });

  elements.maximizeButton.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    closeTerminalNodeMenu();
    setNodeMaximized(nodeRecord, !nodeRecord.isMaximized);
  });

  elements.renameButton.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    closeTerminalNodeMenu();
    startNodeTitleEditing(nodeRecord);
  });

  elements.menuButton.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    toggleTerminalNodeMenu(nodeRecord);
  });

  elements.copySessionButton.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    closeTerminalNodeMenu({ restoreFocus: true });

    const sessionIdentifier = getNodeSessionIdentifier(nodeRecord);
    const button = elements.copySessionButton;
    const originalLabel = "Copy session ID";

    void copyTextToClipboard(sessionIdentifier).then((copied) => {
      button.textContent = copied ? "Copied" : "Failed";
      window.setTimeout(() => {
        button.textContent = originalLabel;
      }, 1200);
    });
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

    if (shouldSelectTerminal({ reason: "pointer" })) {
      setActiveNode(nodeRecord);
    }

    if (!nodeRecord.isTitleEditing) {
      event.preventDefault();
      return;
    }

    event.stopPropagation();
  });

  elements.titleInput.addEventListener("focus", () => {
    if (!nodeRecord.isTitleEditing) {
      elements.titleInput.blur();
      return;
    }

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
    closeTerminalNodeMenu();
    startNodeDrag(event, nodeRecord, elements.dragArea);
  });

  elements.dragArea.addEventListener("dblclick", (event) => {
    if (
      !isElement(event.target)
      || event.target.closest(".terminal-node-control, .terminal-node-menu") !== null
      || (nodeRecord.isTitleEditing && event.target.closest(".terminal-node-title-input") !== null)
    ) {
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
  syncManagedNodeState(nodeRecord, {
    name: nodeRecord.managedAgentName,
    role: nodeRecord.managedAgentRole,
    project: nodeRecord.managedProjectTag,
    runtime_state: nodeRecord.managedRuntimeState,
    agent_state: nodeRecord.managedAgentState,
    tmux_session: nodeRecord.tmuxSessionName,
    parent_agent: nodeRecord.managedParentAgent,
    commander_agent: nodeRecord.managedCommanderAgent,
    depth: nodeRecord.managedDepth,
    workdir: nodeRecord.cwd,
    is_project_manager: nodeRecord.isManager
  });
  updateEmptyState();

  if (shouldFocus && activeCanvas.id === activeCanvasId) {
    setActiveNode(nodeRecord);
  }

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

function getManagedCanvasNodes(canvasRecord) {
  return canvasRecord.nodes.filter((nodeRecord) => nodeRecord.managedAgentName !== null && !nodeRecord.isRemoved);
}

function getManagedAgentParentName(agentSnapshot) {
  return normalizeManagedAgentName(agentSnapshot?.parent_agent) ?? normalizeManagedAgentName(agentSnapshot?.commander_agent);
}

function sortManagedAgentSnapshots(agentSnapshots) {
  return [...agentSnapshots].sort((left, right) => {
    const leftRank = left?.is_project_manager === true ? 0 : 1;
    const rightRank = right?.is_project_manager === true ? 0 : 1;

    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }

    const leftName = normalizeManagedAgentName(left?.name) ?? "";
    const rightName = normalizeManagedAgentName(right?.name) ?? "";
    return leftName.localeCompare(rightName);
  });
}

function getManagedNodePlacement(canvasRecord, agentSnapshot) {
  const managerNode = canvasRecord.nodes.find((nodeRecord) => nodeRecord.isManager && !nodeRecord.isRemoved) ?? null;

  if (agentSnapshot?.is_project_manager === true || managerNode === null) {
    return toWorldPoint(getBoardViewportCenterPoint());
  }

  const parentName = getManagedAgentParentName(agentSnapshot);
  const parentNode = canvasRecord.nodes.find((nodeRecord) => (
    !nodeRecord.isRemoved
    && nodeRecord.managedAgentName !== null
    && nodeRecord.managedAgentName === parentName
  )) ?? managerNode;
  const siblingCount = canvasRecord.nodes.filter((nodeRecord) => {
    if (nodeRecord.isRemoved || nodeRecord.managedAgentName === null || nodeRecord === parentNode) {
      return false;
    }

    const nodeParentName = nodeRecord.managedParentAgent ?? nodeRecord.managedCommanderAgent;
    return nodeParentName === parentNode.managedAgentName;
  }).length;
  const branchOffsets = [0, -1, 1];
  const branchIndex = siblingCount % branchOffsets.length;
  const row = Math.floor(siblingCount / branchOffsets.length);
  const branchGap = DEFAULT_NODE_WIDTH + 72;
  const rowGap = DEFAULT_NODE_HEIGHT + 108;

  return {
    x: parentNode.x + (branchOffsets[branchIndex] * branchGap),
    y: parentNode.y + ((row + 1) * rowGap)
  };
}

async function deleteManagedAgentNode(nodeRecord) {
  const agentName = nodeRecord.managedAgentName;

  await destroyTerminalNode(nodeRecord, { shouldDestroySession: false });

  if (agentName !== null) {
    try {
      await window.noteCanvas.deleteCanvasAgent(agentName);
    } catch (error) {
      console.error(error);
    }
  }

  scheduleCanvasAgentSync();
}

async function rebindManagedNodeToAgentSession(nodeRecord, agentSnapshot) {
  const nextTmuxSessionName = typeof agentSnapshot?.tmux_session === "string" && agentSnapshot.tmux_session.length > 0
    ? agentSnapshot.tmux_session
    : null;

  if (nextTmuxSessionName === null || nodeRecord.isRemoved) {
    return;
  }

  const previousTmuxSessionName = nodeRecord.tmuxSessionName;

  if (previousTmuxSessionName === nextTmuxSessionName) {
    return;
  }

  nodeRecord.tmuxSessionName = nextTmuxSessionName;
  nodeRecord.backend = "tmux";

  try {
    await releaseTerminalSession(nodeRecord);
    await bindTerminalSession(nodeRecord, { shouldFocus: false });
  } catch (error) {
    console.error(error);
    setNodeExitedState(nodeRecord, null, null);
    setTerminalNodeStatus(nodeRecord, "Attach failed");
    nodeRecord.meta.textContent = `Could not attach to ${nextTmuxSessionName}`;
  }
}

async function reconcileCanvasAgentProject(canvasRecord, snapshot) {
  if (canvasRecord.id !== activeCanvasId) {
    return;
  }

  const sessions = sortManagedAgentSnapshots(Array.isArray(snapshot?.sessions) ? snapshot.sessions : []);
  const seenAgentNames = new Set();

  canvasRecord.agentProjectTag = typeof snapshot?.project === "string" && snapshot.project.length > 0
    ? snapshot.project
    : canvasRecord.agentProjectTag;
  canvasRecord.managerAgentName = normalizeManagedAgentName(snapshot?.manager?.name);

  for (const agentSnapshot of sessions) {
    const agentName = normalizeManagedAgentName(agentSnapshot?.name);

    if (agentName === null) {
      continue;
    }

    seenAgentNames.add(agentName);
    const existingNode = canvasRecord.nodes.find((nodeRecord) => nodeRecord.managedAgentName === agentName && !nodeRecord.isRemoved) ?? null;

    if (existingNode !== null) {
      await rebindManagedNodeToAgentSession(existingNode, agentSnapshot);
      syncManagedNodeState(existingNode, agentSnapshot);
      continue;
    }

    const nextPosition = getManagedNodePlacement(canvasRecord, agentSnapshot);

    try {
      await createTerminalNode({
        x: nextPosition.x,
        y: nextPosition.y,
        width: DEFAULT_NODE_WIDTH,
        height: DEFAULT_NODE_HEIGHT,
        cwd: agentSnapshot.workdir,
        title: agentSnapshot.name,
        sessionKey: agentName,
        tmuxSessionName: agentSnapshot.tmux_session,
        managedAgentName: agentName,
        managedAgentRole: agentSnapshot.role,
        managedProjectTag: snapshot.project,
        managedRuntimeState: agentSnapshot.runtime_state,
        managedAgentState: agentSnapshot.agent_state,
        isManager: agentSnapshot.is_project_manager === true,
        shouldFocus: false
      });
    } catch (error) {
      console.error(error);
    }
  }

  const staleNodes = getManagedCanvasNodes(canvasRecord).filter((nodeRecord) => !seenAgentNames.has(nodeRecord.managedAgentName));

  for (const staleNode of staleNodes) {
    await destroyTerminalNode(staleNode, { shouldDestroySession: false });
  }

  scheduleAppSessionSave();
}

async function syncActiveCanvasAgentProject() {
  if (isCanvasAgentSyncInFlight) {
    return;
  }

  const canvasRecord = getActiveCanvas();

  if (canvasRecord === null || typeof canvasRecord.workspace?.rootPath !== "string") {
    return;
  }

  isCanvasAgentSyncInFlight = true;

  try {
    const snapshot = await window.noteCanvas.syncCanvasAgentProject({
      canvasId: canvasRecord.id,
      canvasName: canvasRecord.name,
      workspaceRootPath: canvasRecord.workspace.rootPath,
      projectTag: canvasRecord.agentProjectTag
    });

    if (canvasRecord.id !== activeCanvasId) {
      return;
    }

    if (snapshot?.unavailable === true) {
      return;
    }

    await reconcileCanvasAgentProject(canvasRecord, snapshot);
  } catch (error) {
    console.error(error);
  } finally {
    isCanvasAgentSyncInFlight = false;
    scheduleCanvasAgentSync(CANVAS_AGENT_SYNC_INTERVAL_MS);
  }
}

function scheduleCanvasAgentSync(delay = 0) {
  if (canvasAgentSyncTimeout !== 0) {
    clearTimeout(canvasAgentSyncTimeout);
  }

  canvasAgentSyncTimeout = window.setTimeout(() => {
    canvasAgentSyncTimeout = 0;
    void syncActiveCanvasAgentProject();
  }, Math.max(0, delay));
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

  if (activeTerminalNodeMenuRecord === nodeRecord) {
    closeTerminalNodeMenu();
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

  if (
    event.target.closest(".terminal-node") !== null
    || event.target.closest(".file-inspector") !== null
    || event.target.closest(".canvas-sidebar") !== null
    || event.target.closest(".panel-resize-handle") !== null
  ) {
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
  if (!(event.target instanceof Node)) {
    return;
  }

  if (
    isCanvasActionsMenuOpen
    && canvasActionsMenuRoot instanceof HTMLElement
    && !canvasActionsMenuRoot.contains(event.target)
  ) {
    closeCanvasActionsMenu();
  }

  if (
    activeTerminalNodeMenuRecord !== null
    && activeTerminalNodeMenuRecord.menuRoot instanceof HTMLElement
    && !activeTerminalNodeMenuRecord.menuRoot.contains(event.target)
  ) {
    closeTerminalNodeMenu();
  }

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
    const titleEditorRecord = activeTitleEditorRecord;
    event.preventDefault();
    cancelNodeTitleEditing(titleEditorRecord);
    titleEditorRecord.titleInput?.blur();
    return;
  }

  if (event.key === "Escape") {
    if (isCanvasSwitcherMenuOpen) {
      event.preventDefault();
      closeCanvasSwitcherMenu({ restoreFocus: true });
      return;
    }

    if (isCanvasActionsMenuOpen) {
      event.preventDefault();
      closeCanvasActionsMenu({ restoreFocus: true });
      return;
    }

    if (activeTerminalNodeMenuRecord !== null) {
      event.preventDefault();
      closeTerminalNodeMenu({ restoreFocus: true });
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
  const isFileSearchShortcut = shortcutKey === "f"
    && !event.altKey
    && (
      (event.metaKey && !event.ctrlKey)
      || (event.ctrlKey && !event.metaKey && !isTypingTarget(event.target))
    );

  if (isFileSearchShortcut) {
    event.preventDefault();
    focusWorkspaceSearch({ select: true });
    return;
  }

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
      firstTerminalText: activeNodes[0]?.terminalMount?.textContent || "",
      visibleNodeCount: [...nodesLayer.querySelectorAll(".terminal-node")].filter((nodeElement) => {
        if (!(nodeElement instanceof HTMLElement)) {
          return false;
        }

        const nodeStyles = getComputedStyle(nodeElement);
        return nodeStyles.display !== "none" && nodeStyles.visibility !== "hidden" && Number.parseFloat(nodeStyles.opacity || "1") > 0;
      }).length,
      sidebarCollapsed: isSidebarCollapsed,
      railCollapsed: isRailCollapsed,
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
        workspacePreviewTabLabels: [...(fileInspector?.querySelectorAll(".file-inspector-tab-label") ?? [])].map((label) => label.textContent ?? ""),
        workspacePreviewTabCount: fileInspector?.querySelectorAll("[data-workspace-preview-tab]").length ?? 0,
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
      if (getActiveCanvas() === null) {
        createCanvas();
        await waitForAnimationFrame();
      }

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

      const renameInput = canvasStripList.querySelector(`[data-canvas-id="${canvasRecord.id}"][data-canvas-part="rename-input"]`);

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

      const fromInput = canvasStripList.querySelector(`[data-canvas-id="${fromCanvas.id}"][data-canvas-part="rename-input"]`);

      if (fromInput instanceof HTMLInputElement) {
        fromInput.value = draftName;
      }

      beginCanvasRename(toCanvas.id);
      await waitForAnimationFrame();

      const toInput = canvasStripList.querySelector(`[data-canvas-id="${toCanvas.id}"][data-canvas-part="rename-input"]`);

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
      await toggleWorkspaceDirectory(relativePath);
      await waitForAnimationFrame();

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
      await refreshSelectedWorkspaceFilePreview();
      await waitForAnimationFrame();
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
    toggleRail: () => {
      toggleRail();
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
  void createCanvasWithWorkspace().catch((error) => {
    console.error(error);
  });
});

boardWelcomeOpenButton?.addEventListener("click", () => {
  void createCanvasWithWorkspace().catch((error) => {
    console.error(error);
  });
});

exportCanvasButton?.addEventListener("click", () => {
  closeCanvasActionsMenu({ restoreFocus: true });
  void exportActiveCanvas().catch((error) => {
    console.error(error);
  });
});

importCanvasButton?.addEventListener("click", () => {
  closeCanvasActionsMenu({ restoreFocus: true });
  void importCanvas().catch((error) => {
    console.error(error);
  });
});

installAgentSkillButton?.addEventListener("click", () => {
  closeCanvasActionsMenu({ restoreFocus: true });
  void requestAgentSkillInstall().catch((error) => {
    console.error(error);
  });
});

canvasActionsMenuButton?.addEventListener("click", () => {
  toggleCanvasActionsMenu();
});

closeActiveCanvasButton?.addEventListener("click", () => {
  closeCanvasActionsMenu();
  void closeActiveCanvasWithConfirmation().catch((error) => {
    void showWorkspaceActionError(error);
  });
});

window.noteCanvas?.onAgentSkillInstallRequested?.((status) => {
  void requestAgentSkillInstall({ status }).catch((error) => {
    console.error(error);
  });
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
  activateAdjacentTerminalFromStrip("backward");
});

terminalStripNextButton?.addEventListener("click", () => {
  activateAdjacentTerminalFromStrip("forward");
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

focusWorkspaceSearchButton?.addEventListener("click", () => {
  focusWorkspaceSearch({ select: true });
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

railToggleButton?.addEventListener("click", () => {
  toggleRail();
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

boardZoomOutButton?.addEventListener("click", () => {
  zoomActiveCanvasByStep("out");
});

boardZoomIndicator?.addEventListener("click", () => {
  resetActiveCanvasZoom();
});

boardZoomInButton?.addEventListener("click", () => {
  zoomActiveCanvasByStep("in");
});

boardCenterViewButton?.addEventListener("click", () => {
  centerActiveCanvasContent();
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
