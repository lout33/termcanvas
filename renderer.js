const appShell = document.querySelector(".app-shell");
const board = document.getElementById("board");
const nodesLayer = document.getElementById("nodes-layer");
const emptyState = document.getElementById("empty-state");
const boardZoomIndicator = document.getElementById("board-zoom-indicator");
const boardFullscreenExitButton = document.getElementById("board-fullscreen-exit");
const canvasList = document.getElementById("canvas-list");
const createCanvasButton = document.getElementById("create-canvas-button");
const exportCanvasButton = document.getElementById("export-canvas-button");
const importCanvasButton = document.getElementById("import-canvas-button");
const openWorkspaceButton = document.getElementById("open-workspace-button");
const refreshWorkspaceButton = document.getElementById("refresh-workspace-button");
const workspaceBrowser = document.getElementById("workspace-browser");
const fileInspector = document.getElementById("file-inspector");
const sidebarToggleButton = document.getElementById("sidebar-toggle-button");
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
const ZOOM_INDICATOR_VISIBLE_MS = 1200;
const RESIZE_HANDLE_DIRECTIONS = ["n", "s", "e", "w", "nw", "ne", "sw", "se"];

let terminalCount = 0;
let canvasCount = 0;
const canvases = [];
const canvasMap = new Map();
const terminalNodeMap = new Map();
let activeCanvasId = null;
let activeNodeRecord = null;
let activeTitleEditorRecord = null;
let activeCanvasRenameId = null;
let isSidebarCollapsed = false;
let isWindowUnloading = false;
let renderedCanvasId = null;
let viewportRenderFrame = 0;
let terminalSizeSyncFrame = 0;
let zoomIndicatorTimeout = 0;
const pendingTerminalSizeNodes = new Set();
let pendingCanvasListFocus = null;
let lastExportedCanvasDebugPayload = null;
let workspacePreviewRequestId = 0;
const expandedWorkspaceDirectories = new Set();

const workspacePreviewState = {
  relativePath: null,
  status: "empty",
  data: null,
  errorMessage: ""
};

const workspaceState = {
  rootPath: null,
  rootName: "",
  entries: [],
  isTruncated: false,
  lastError: "",
  isRefreshing: false
};

const WORKSPACE_PREVIEW_KIND_LABELS = {
  json: "JSON",
  markdown: "Markdown",
  text: "Text",
  javascript: "JS",
  typescript: "TS",
  python: "PY",
  shell: "Shell",
  html: "HTML",
  css: "CSS",
  yaml: "YAML"
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
  renderCanvasList();
});

const removeWorkspaceDirectoryDataListener = window.noteCanvas.onWorkspaceDirectoryData((snapshot) => {
  if (snapshot === null) {
    clearWorkspaceSnapshot("Workspace folder is unavailable.");
    return;
  }

  applyWorkspaceSnapshot(snapshot);
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

function setNodeMaximized(nodeRecord, shouldMaximize) {
  resetPointerInteractions();

  if (shouldMaximize) {
    nodeRecord.canvas.nodes.forEach((candidateRecord) => {
      if (candidateRecord !== nodeRecord && candidateRecord.isMaximized) {
        candidateRecord.isMaximized = false;
        candidateRecord.element?.classList.remove("is-maximized");
        syncMaximizeButton(candidateRecord);
      }
    });

    setActiveNode(nodeRecord);
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
    nodeRecord.overlayMeta.textContent = `${exitLabel} · Reopen to start a fresh shell here.`;
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
}

function setNodeLiveState(nodeRecord, shellName) {
  nodeRecord.isExited = false;
  nodeRecord.exitCode = null;
  nodeRecord.exitSignal = null;
  nodeRecord.shellName = shellName;
  nodeRecord.status.textContent = "Live";
  nodeRecord.meta.textContent = shellName;
  nodeRecord.element.classList.remove("is-exited");
  updateExitedOverlay(nodeRecord);
}

async function releaseTerminalSession(nodeRecord, options = {}) {
  const shouldDestroySession = options.shouldDestroySession !== false;
  const terminalId = nodeRecord.terminalId;

  nodeRecord.disposeInput();
  nodeRecord.disposeInput = () => {};
  nodeRecord.resizeObserver?.disconnect();
  nodeRecord.resizeObserver = null;
  nodeRecord.syncSize = () => {};

  if (shouldDestroySession && typeof terminalId === "string") {
    await window.noteCanvas.destroyTerminal(terminalId);
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
      cwd: nodeRecord.cwd
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
    const activeRenameInput = canvasList?.querySelector(`[data-canvas-id="${canvasId}"][data-canvas-part="rename-input"]`);

    if (activeRenameInput instanceof HTMLInputElement) {
      activeRenameInput.focus();
      activeRenameInput.select();
      return;
    }
  }

  if (activeCanvasRenameId !== null && activeCanvasRenameId !== canvasId) {
    const activeRenameInput = canvasList?.querySelector(`[data-canvas-id="${activeCanvasRenameId}"][data-canvas-part="rename-input"]`);

    if (activeRenameInput instanceof HTMLInputElement) {
      commitCanvasRename(activeCanvasRenameId, activeRenameInput.value);
    } else {
      cancelCanvasRename(activeCanvasRenameId);
    }
  }

  activeCanvasRenameId = canvasId;
  pendingCanvasListFocus = {
    canvasId,
    part: "rename-input",
    selectText: true
  };
  renderCanvasList();
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

  renderCanvasList();
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

  renderCanvasList();
}

function focusPendingCanvasListControl() {
  if (!(canvasList instanceof HTMLElement) || pendingCanvasListFocus === null) {
    return;
  }

  const { canvasId, part, selectText } = pendingCanvasListFocus;
  pendingCanvasListFocus = null;
  const selector = `[data-canvas-id="${canvasId}"][data-canvas-part="${part}"]`;
  const target = canvasList.querySelector(selector);

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
  return true;
}

function setActiveCanvasViewportOffset(nextX, nextY) {
  return setActiveCanvasViewport(nextX, nextY);
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

  const label = sidebarToggleButton.querySelector(".sidebar-toggle-label");
  const actionLabel = isSidebarCollapsed ? "Show panel" : "Hide panel";

  if (label !== null) {
    label.textContent = actionLabel;
  } else {
    sidebarToggleButton.textContent = actionLabel;
  }

  sidebarToggleButton.setAttribute("aria-label", `${actionLabel} with Command+B`);
  sidebarToggleButton.setAttribute("aria-pressed", String(isSidebarCollapsed));
}

function setSidebarCollapsed(nextValue) {
  isSidebarCollapsed = nextValue;
  appShell?.classList.toggle("is-sidebar-collapsed", isSidebarCollapsed);
  updateSidebarToggleButton();
}

function toggleSidebar() {
  setSidebarCollapsed(!isSidebarCollapsed);
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
  const viewportOffset = options.viewportOffset ?? { x: 0, y: 0 };
  const viewportScale = roundCanvasScale(options.viewportScale ?? 1);
  const safeViewportX = Number.isFinite(viewportOffset.x) ? viewportOffset.x : 0;
  const safeViewportY = Number.isFinite(viewportOffset.y) ? viewportOffset.y : 0;

  const canvasRecord = {
    id: crypto.randomUUID(),
    name: getUniqueCanvasName(requestedName),
    viewportOffset: {
      x: safeViewportX,
      y: safeViewportY
    },
    viewportScale,
    highestNodeLayer: 2,
    nodes: []
  };

  canvases.push(canvasRecord);
  canvasMap.set(canvasRecord.id, canvasRecord);
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
    return;
  }

  if (activeNodeRecord === nodeRecord) {
    bringNodeToFront(nodeRecord);
    return;
  }

  activeNodeRecord?.element.classList.remove("is-active");
  activeNodeRecord = nodeRecord;
  activeNodeRecord.element.classList.add("is-active");
  bringNodeToFront(activeNodeRecord);
}

function updateEmptyState() {
  const activeCanvas = getActiveCanvas();
  emptyState.hidden = activeCanvas !== null && activeCanvas.nodes.length > 0;
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
    emptyState.hidden = false;
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

function createCanvasListItem(canvasRecord) {
    const item = document.createElement("li");
  item.className = "canvas-list-item";
  item.classList.toggle("is-active", canvasRecord.id === activeCanvasId);
  const isRenaming = canvasRecord.id === activeCanvasRenameId;

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
    meta.textContent = `${canvasRecord.nodes.length} ${canvasRecord.nodes.length === 1 ? "terminal" : "terminals"}`;

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

    if (canvasRecord.id === activeCanvasId) {
      switchButton.classList.add("is-active");
      switchButton.setAttribute("aria-current", "true");
    }

    const name = document.createElement("span");
    name.className = "canvas-list-name";
    name.textContent = canvasRecord.name;

    const meta = document.createElement("span");
    meta.className = "canvas-list-meta";
    meta.textContent = `${canvasRecord.nodes.length} ${canvasRecord.nodes.length === 1 ? "terminal" : "terminals"}`;

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

  if (canvases.length > 1) {
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

  return item;
}

function renderCanvasList() {
  const fragment = document.createDocumentFragment();

  canvases.forEach((canvasRecord) => {
    fragment.append(createCanvasListItem(canvasRecord));
  });

  canvasList.replaceChildren(fragment);
  focusPendingCanvasListControl();
}

function hasWorkspaceDirectory() {
  return typeof workspaceState.rootPath === "string" && workspaceState.rootPath.length > 0;
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
      name: typeof entry.name === "string" ? entry.name : entry.relativePath.split("/").at(-1) ?? entry.relativePath,
      relativePath: entry.relativePath,
      kind: entry.kind === "directory" ? "directory" : "file"
    }];
  });
}

function getWorkspaceDirectoryPaths() {
  return new Set(
    workspaceState.entries
      .filter((entry) => entry.kind === "directory")
      .map((entry) => entry.relativePath)
  );
}

function getWorkspaceFilePaths() {
  return new Set(
    workspaceState.entries
      .filter((entry) => entry.kind === "file")
      .map((entry) => entry.relativePath)
  );
}

function clearWorkspacePreview() {
  workspacePreviewRequestId += 1;
  workspacePreviewState.relativePath = null;
  workspacePreviewState.status = "empty";
  workspacePreviewState.data = null;
  workspacePreviewState.errorMessage = "";
}

function isWorkspacePreviewOpen() {
  return typeof workspacePreviewState.relativePath === "string" && workspacePreviewState.relativePath.length > 0;
}

function getWorkspacePreviewTypeLabel() {
  const language = workspacePreviewState.data?.language;
  return typeof language === "string" && language.length > 0
    ? (WORKSPACE_PREVIEW_KIND_LABELS[language] ?? language.toUpperCase())
    : "File";
}

function syncAppShellWorkspaceState() {
  appShell?.classList.toggle("has-file-inspector", isWorkspacePreviewOpen());
}

function buildWorkspaceTreeRows() {
  const childrenByParentPath = new Map();

  workspaceState.entries.forEach((entry) => {
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
      const isExpanded = isDirectory && expandedWorkspaceDirectories.has(entry.relativePath);

      rows.push({
        ...entry,
        depth,
        isExpanded,
        isSelected: workspacePreviewState.relativePath === entry.relativePath
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

  const fragment = document.createDocumentFragment();
  const header = document.createElement("div");
  header.className = "file-inspector-header";

  const heading = document.createElement("div");
  heading.className = "file-inspector-heading";

  const title = document.createElement("div");
  title.className = "file-inspector-title";
  title.textContent = workspacePreviewState.data?.fileName ?? getWorkspaceEntryName(workspacePreviewState.relativePath);

  const pathMeta = document.createElement("div");
  pathMeta.className = "file-inspector-path";
  pathMeta.textContent = workspacePreviewState.relativePath;
  pathMeta.title = workspacePreviewState.relativePath;

  const typeBadge = document.createElement("div");
  typeBadge.className = "file-inspector-type";
  typeBadge.textContent = getWorkspacePreviewTypeLabel();

  heading.append(title, pathMeta, typeBadge);

  const actions = document.createElement("div");
  actions.className = "file-inspector-actions";

  const refreshButton = document.createElement("button");
  refreshButton.className = "canvas-secondary-button file-inspector-button";
  refreshButton.type = "button";
  refreshButton.dataset.fileInspectorAction = "refresh";
  refreshButton.textContent = workspacePreviewState.status === "loading" ? "Loading" : "Refresh";
  refreshButton.disabled = workspacePreviewState.status === "loading";
  refreshButton.addEventListener("click", () => {
    void refreshSelectedWorkspaceFilePreview();
  });

  const closeButton = document.createElement("button");
  closeButton.className = "canvas-secondary-button file-inspector-button";
  closeButton.type = "button";
  closeButton.dataset.fileInspectorAction = "close";
  closeButton.textContent = "Close";
  closeButton.addEventListener("click", () => {
    clearWorkspacePreview();
    renderWorkspaceBrowser();
    renderFileInspector();
  });

  actions.append(refreshButton, closeButton);
  header.append(heading, actions);
  fragment.append(header);

  const body = document.createElement("div");
  body.className = "file-inspector-body";

  if (workspacePreviewState.status === "loading") {
    const loading = document.createElement("div");
    loading.className = "file-inspector-empty";
    loading.textContent = "Loading file preview...";
    body.append(loading);
  } else if (workspacePreviewState.status === "error") {
    const error = document.createElement("div");
    error.className = "file-inspector-error";
    error.textContent = workspacePreviewState.errorMessage;
    body.append(error);
  } else if (workspacePreviewState.data?.kind === "unsupported") {
    const unsupported = document.createElement("div");
    unsupported.className = "file-inspector-empty";
    unsupported.textContent = "Preview not available for this file type.";
    body.append(unsupported);
  } else if (workspacePreviewState.data?.kind === "too-large") {
    const tooLarge = document.createElement("div");
    tooLarge.className = "file-inspector-empty";
    tooLarge.textContent = "This file is too large to preview here.";
    body.append(tooLarge);
  } else {
    const pre = document.createElement("pre");
    pre.className = "file-inspector-content";
    pre.textContent = workspacePreviewState.data?.contents ?? "";
    body.append(pre);
  }

  fragment.append(body);
  fileInspector.replaceChildren(fragment);
}

async function loadWorkspaceFilePreview(relativePath) {
  const requestId = ++workspacePreviewRequestId;
  const previewRootPath = workspaceState.rootPath;
  workspacePreviewState.relativePath = relativePath;
  workspacePreviewState.status = "loading";
  workspacePreviewState.data = null;
  workspacePreviewState.errorMessage = "";
  renderWorkspaceBrowser();
  renderFileInspector();

  try {
    const preview = await window.noteCanvas.readWorkspaceFile(relativePath);

    if (
      requestId !== workspacePreviewRequestId
      || workspacePreviewState.relativePath !== relativePath
      || workspaceState.rootPath !== previewRootPath
    ) {
      return null;
    }

    workspacePreviewState.data = preview;
    workspacePreviewState.status = "ready";
    workspacePreviewState.errorMessage = "";
    renderWorkspaceBrowser();
    renderFileInspector();
    return preview;
  } catch (error) {
    if (
      requestId !== workspacePreviewRequestId
      || workspacePreviewState.relativePath !== relativePath
      || workspaceState.rootPath !== previewRootPath
    ) {
      return null;
    }

    workspacePreviewState.status = "error";
    workspacePreviewState.data = null;
    workspacePreviewState.errorMessage = error instanceof Error ? error.message : String(error);
    renderWorkspaceBrowser();
    renderFileInspector();
    return null;
  }
}

async function selectWorkspaceFile(relativePath) {
  if (!getWorkspaceFilePaths().has(relativePath)) {
    return null;
  }

  return loadWorkspaceFilePreview(relativePath);
}

async function refreshSelectedWorkspaceFilePreview() {
  if (!isWorkspacePreviewOpen()) {
    return null;
  }

  return loadWorkspaceFilePreview(workspacePreviewState.relativePath);
}

function toggleWorkspaceDirectory(relativePath) {
  if (expandedWorkspaceDirectories.has(relativePath)) {
    expandedWorkspaceDirectories.delete(relativePath);
  } else {
    expandedWorkspaceDirectories.add(relativePath);
  }

  renderWorkspaceBrowser();
}

function updateWorkspaceControls() {
  if (refreshWorkspaceButton instanceof HTMLButtonElement) {
    refreshWorkspaceButton.disabled = !hasWorkspaceDirectory() || workspaceState.isRefreshing;
    refreshWorkspaceButton.textContent = workspaceState.isRefreshing ? "Refreshing" : "Refresh";
  }
}

function renderWorkspaceBrowser() {
  if (!(workspaceBrowser instanceof HTMLElement)) {
    return;
  }

  updateWorkspaceControls();
  const fragment = document.createDocumentFragment();

  if (hasWorkspaceDirectory()) {
    const summary = document.createElement("div");
    summary.className = "workspace-browser-summary";

    const name = document.createElement("div");
    name.className = "workspace-browser-name";
    name.textContent = workspaceState.rootName;

    const currentPath = document.createElement("div");
    currentPath.className = "workspace-browser-path";
    currentPath.textContent = workspaceState.rootPath;
    currentPath.title = workspaceState.rootPath;

    const meta = document.createElement("div");
    meta.className = "workspace-browser-meta";
    meta.textContent = `${workspaceState.entries.length} ${workspaceState.entries.length === 1 ? "entry" : "entries"}`;

    summary.append(name, currentPath, meta);
    fragment.append(summary);

    if (workspaceState.entries.length > 0) {
      const entryList = document.createElement("ul");
      entryList.className = "workspace-browser-list";

      buildWorkspaceTreeRows().forEach((entry) => {
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

        const kind = document.createElement("span");
        kind.className = "workspace-browser-entry-kind";
        kind.textContent = entry.kind === "directory" ? (entry.isExpanded ? "open" : "dir") : "file";

        const label = document.createElement("span");
        label.className = "workspace-browser-entry-label";
        label.textContent = entry.name;

        button.append(kind, label);

        if (entry.kind === "directory") {
          button.setAttribute("aria-expanded", entry.isExpanded ? "true" : "false");
          button.addEventListener("click", () => {
            toggleWorkspaceDirectory(entry.relativePath);
          });
        } else {
          button.addEventListener("click", () => {
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

    if (workspaceState.isTruncated) {
      const truncated = document.createElement("div");
      truncated.className = "workspace-browser-truncated";
      truncated.textContent = "Listing trimmed to keep the sidebar responsive.";
      fragment.append(truncated);
    }
  } else {
    const empty = document.createElement("div");
    empty.className = workspaceState.lastError.length > 0 ? "workspace-browser-error" : "workspace-browser-empty";
    empty.textContent = workspaceState.lastError.length > 0
      ? workspaceState.lastError
      : "Open a folder to browse files here and make new terminals start there.";
    fragment.append(empty);
  }

  workspaceBrowser.replaceChildren(fragment);
}

function applyWorkspaceSnapshot(snapshot) {
  const previousRootPath = workspaceState.rootPath;
  workspaceState.rootPath = typeof snapshot?.rootPath === "string" ? snapshot.rootPath : null;
  workspaceState.rootName = typeof snapshot?.rootName === "string" ? snapshot.rootName : "";
  workspaceState.entries = normalizeWorkspaceEntries(snapshot?.entries);
  workspaceState.isTruncated = snapshot?.isTruncated === true;
  workspaceState.lastError = "";
  const validDirectoryPaths = getWorkspaceDirectoryPaths();
  const validFilePaths = getWorkspaceFilePaths();

  [...expandedWorkspaceDirectories].forEach((directoryPath) => {
    if (!validDirectoryPaths.has(directoryPath)) {
      expandedWorkspaceDirectories.delete(directoryPath);
    }
  });

  if (previousRootPath !== null && previousRootPath !== workspaceState.rootPath) {
    expandedWorkspaceDirectories.clear();
    clearWorkspacePreview();
  }

  if (workspacePreviewState.relativePath !== null && !validFilePaths.has(workspacePreviewState.relativePath)) {
    clearWorkspacePreview();
  }

  renderWorkspaceBrowser();
  renderFileInspector();
}

function clearWorkspaceSnapshot(errorMessage = "") {
  workspaceState.rootPath = null;
  workspaceState.rootName = "";
  workspaceState.entries = [];
  workspaceState.isTruncated = false;
  workspaceState.lastError = typeof errorMessage === "string" ? errorMessage : "";
  expandedWorkspaceDirectories.clear();
  clearWorkspacePreview();
  renderWorkspaceBrowser();
  renderFileInspector();
}

async function refreshWorkspaceDirectory(options = {}) {
  if (!hasWorkspaceDirectory() || workspaceState.isRefreshing) {
    return null;
  }

  workspaceState.isRefreshing = true;
  updateWorkspaceControls();

  try {
    const snapshot = await window.noteCanvas.refreshWorkspaceDirectory();

    if (snapshot === null) {
      clearWorkspaceSnapshot();
      return null;
    }

    applyWorkspaceSnapshot(snapshot);
    return snapshot;
  } catch (error) {
    clearWorkspaceSnapshot(error instanceof Error ? error.message : String(error));

    if (options.silent !== true) {
      console.error(error);
    }

    return null;
  } finally {
    workspaceState.isRefreshing = false;
    updateWorkspaceControls();
  }
}

async function openWorkspaceDirectory() {
  const opened = await window.noteCanvas.openWorkspaceDirectory();

  if (opened?.canceled) {
    return null;
  }

  if (opened?.snapshot == null) {
    throw new Error("Workspace folder contents were unavailable.");
  }

  applyWorkspaceSnapshot(opened.snapshot);
  return opened.snapshot;
}

function getDefaultTerminalWorkingDirectory() {
  return hasWorkspaceDirectory() ? workspaceState.rootPath : null;
}

function sanitizeCanvasExportName(canvasName) {
  const fallbackName = "canvas-learning-canvas";
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
    renderCanvasList();
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
  }

  dragState.pointerId = null;
  dragState.nodeRecord = null;
  dragState.handleElement = null;
  dragState.hasMoved = false;
}

function stopNodeResize(event) {
  const { handleElement, nodeRecord, pointerId } = resizeState;

  if (handleElement !== null && pointerId !== null && handleElement.hasPointerCapture(pointerId)) {
    handleElement.releasePointerCapture(pointerId);
  }

  if (nodeRecord !== null) {
    nodeRecord.element.classList.remove("is-resizing");

    if (event !== undefined && nodeRecord.canvas.id === activeCanvasId && !nodeRecord.isExited) {
      nodeRecord.syncSize();
    }
  }

  resizeState.pointerId = null;
  resizeState.nodeRecord = null;
  resizeState.handleElement = null;
  resizeState.direction = "";
  resizeState.hasMoved = false;
}

function resetPointerInteractions() {
  stopNodeResize();
  stopNodeDrag();

  if (panState.pointerId !== null && board.hasPointerCapture(panState.pointerId)) {
    board.releasePointerCapture(panState.pointerId);
  }

  stopPan();
}

function setActiveCanvas(canvasId) {
  const nextCanvas = getCanvasById(canvasId);

  if (nextCanvas === null) {
    return;
  }

  if (activeCanvasId !== canvasId) {
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
  }

  renderCanvasList();
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

  renderCanvasList();
  renderCanvas({ syncTerminalSizes: true });

  await Promise.all(nodesToRemove.map((nodeRecord) => destroyTerminalNode(nodeRecord)));
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
  surface.append(terminalMount, overlay);

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

  if (activeCanvas === null) {
    return;
  }

  terminalCount += 1;

  const nodeRecord = {
    id: terminalCount,
    terminalId: null,
    canvas: activeCanvas,
    x: options.x,
    y: options.y,
    width: DEFAULT_NODE_WIDTH,
    height: DEFAULT_NODE_HEIGHT,
    cwd: typeof options.cwd === "string" && options.cwd.trim().length > 0 ? options.cwd : getDefaultTerminalWorkingDirectory(),
    isRemoved: false,
    isExited: false,
    isMaximized: options.isMaximized === true,
    exitCode: null,
    exitSignal: null,
    element: null,
    surface: null,
    terminalMount: null,
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
    shellName: "Shell",
    titleText: normalizeTerminalTitle(options.title, `Terminal ${terminalCount}`)
  };
  const elements = createTerminalElement(nodeRecord);
  nodeRecord.element = elements.node;
  nodeRecord.surface = elements.surface;
  nodeRecord.terminalMount = elements.terminalMount;
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
    setActiveNode(nodeRecord);
  });

  elements.titleInput.addEventListener("focus", () => {
    activeTitleEditorRecord = nodeRecord;
    setActiveNode(nodeRecord);
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
    if (event.button === 0) {
      setActiveNode(nodeRecord);
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
  renderCanvasList();

  if (activeCanvas.id === activeCanvasId) {
    nodesLayer.append(elements.node);
  }

  setActiveNode(nodeRecord);
  positionNode(nodeRecord);
  updateEmptyState();

  try {
    await bindTerminalSession(nodeRecord);

    if (nodeRecord.isMaximized) {
      setNodeMaximized(nodeRecord, true);
    }
  } catch (error) {
    await destroyTerminalNode(nodeRecord, { shouldDestroySession: false });
    throw error;
  }

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
    renderCanvasList();
  }
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
  if (getVisibleMaximizedNode() !== null || !isBoardBackgroundTarget(event.target)) {
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

function handleWindowKeyDown(event) {
  if (event.defaultPrevented || event.repeat) {
    return;
  }

  if (event.key === "Escape" && activeTitleEditorRecord !== null) {
    event.preventDefault();
    cancelNodeTitleEditing(activeTitleEditorRecord);
    activeTitleEditorRecord.titleInput?.blur();
    return;
  }

  if (event.key === "Escape") {
    const visibleMaximizedNode = getVisibleMaximizedNode();

    if (visibleMaximizedNode !== null) {
      event.preventDefault();
      setNodeMaximized(visibleMaximizedNode, false);
      return;
    }
  }

  if (event.metaKey && !event.ctrlKey && !event.altKey && String(event.key).toLowerCase() === "b") {
    event.preventDefault();
    toggleSidebar();
  }
}

createCanvas();
setSidebarCollapsed(false);
renderWorkspaceBrowser();
renderFileInspector();

window.addEventListener("beforeunload", () => {
  isWindowUnloading = true;

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
  removeTerminalDataListener();
  removeTerminalExitListener();
  removeWorkspaceDirectoryDataListener();
  terminalNodeMap.forEach((nodeRecord) => {
    nodeRecord.resizeObserver?.disconnect();
    void window.noteCanvas.destroyTerminal(nodeRecord.terminalId);
  });
});

if (window.noteCanvas.isSmokeTest) {
  const getCanvasSnapshot = () => {
    flushViewportRender();

    const activeCanvas = getActiveCanvas();
    const activeNodes = activeCanvas?.nodes ?? [];
    const boardRect = board.getBoundingClientRect();
    const sidebarRect = appShell?.querySelector(".canvas-sidebar")?.getBoundingClientRect();
    const workspaceSection = workspaceBrowser?.closest(".sidebar-section");
    const workspaceSectionRect = workspaceSection instanceof HTMLElement ? workspaceSection.getBoundingClientRect() : null;
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
        workspaceRootPath: workspaceState.rootPath,
        workspaceEntryPaths: workspaceState.entries.map((entry) => entry.relativePath),
        workspaceVisibleEntryPaths: [...workspaceBrowser.querySelectorAll("[data-workspace-path]")].map((entryElement) => entryElement.dataset.workspacePath).filter((entryPath) => typeof entryPath === "string"),
        workspaceIsTruncated: workspaceState.isTruncated,
        workspaceSelectedFilePath: workspacePreviewState.relativePath,
        workspacePreviewStatus: workspacePreviewState.status,
        workspacePreviewKind: workspacePreviewState.data?.kind ?? null,
        workspacePreviewContents: workspacePreviewState.data?.contents ?? "",
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
        workspaceRootPath: snapshot.workspaceRootPath,
        workspaceEntryPaths: snapshot.workspaceEntryPaths,
        workspaceVisibleEntryPaths: snapshot.workspaceVisibleEntryPaths,
        workspaceSelectedFilePath: snapshot.workspaceSelectedFilePath,
        workspacePreviewStatus: snapshot.workspacePreviewStatus,
        workspacePreviewKind: snapshot.workspacePreviewKind,
        workspacePreviewContents: snapshot.workspacePreviewContents,
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

      const renameInput = canvasList.querySelector(`[data-canvas-id="${canvasRecord.id}"][data-canvas-part="rename-input"]`);

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

      const fromInput = canvasList.querySelector(`[data-canvas-id="${fromCanvas.id}"][data-canvas-part="rename-input"]`);

      if (fromInput instanceof HTMLInputElement) {
        fromInput.value = draftName;
      }

      beginCanvasRename(toCanvas.id);
      await waitForAnimationFrame();

      const toInput = canvasList.querySelector(`[data-canvas-id="${toCanvas.id}"][data-canvas-part="rename-input"]`);

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
      const snapshot = await window.noteCanvas.debugOpenWorkspaceDirectory(directoryPath);
      applyWorkspaceSnapshot(snapshot);
      await waitForAnimationFrame();
      return getCanvasSnapshot();
    },
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
      applyWorkspaceSnapshot({
        rootPath: "/tmp/canvas-learning-workspace-debug",
        rootName: "canvas_desktop",
        isTruncated: false,
        entries: Array.from({ length: entryCount }, (_value, index) => ({
          name: `file-${index + 1}.txt`,
          relativePath: `nested/path/file-${index + 1}.txt`,
          kind: "file",
          depth: 2
        }))
      });
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

openWorkspaceButton?.addEventListener("click", () => {
  void openWorkspaceDirectory().catch((error) => {
    console.error(error);
  });
});

refreshWorkspaceButton?.addEventListener("click", () => {
  void refreshWorkspaceDirectory().catch((error) => {
    console.error(error);
  });
});

sidebarToggleButton?.addEventListener("click", () => {
  toggleSidebar();
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
window.addEventListener("keydown", handleWindowKeyDown);
