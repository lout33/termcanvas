const appShell = document.querySelector(".app-shell");
const board = document.getElementById("board");
const nodesLayer = document.getElementById("nodes-layer");
const emptyState = document.getElementById("empty-state");
const canvasList = document.getElementById("canvas-list");
const createCanvasButton = document.getElementById("create-canvas-button");
const exportCanvasButton = document.getElementById("export-canvas-button");
const importCanvasButton = document.getElementById("import-canvas-button");
const sidebarToggleButton = document.getElementById("sidebar-toggle-button");
const TerminalConstructor = window.Terminal;
const FitAddonConstructor = window.FitAddon?.FitAddon;
const DRAG_THRESHOLD = 3;
const CANVAS_EXPORT_VERSION = 1;
const MAX_TERMINAL_TITLE_LENGTH = 80;
const WHEEL_LINE_DELTA_PX = 16;

let terminalCount = 0;
let canvasCount = 0;
const canvases = [];
const canvasMap = new Map();
const terminalNodeMap = new Map();
let activeCanvasId = null;
let activeNodeRecord = null;
let activeTitleEditorRecord = null;
let isSidebarCollapsed = false;
let isWindowUnloading = false;

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
      rows: initialRows
    });

    if (nodeRecord.isRemoved) {
      await releaseTerminalSession(nodeRecord);
      return;
    }

    setNodeLiveState(nodeRecord, created.shellName);

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

function getUniqueCanvasName(baseName) {
  const trimmedBaseName = typeof baseName === "string" && baseName.trim().length > 0
    ? baseName.trim()
    : `Canvas ${canvasCount + 1}`;
  let candidateName = trimmedBaseName;
  let suffix = 2;

  while (canvases.some((canvasRecord) => canvasRecord.name === candidateName)) {
    candidateName = `${trimmedBaseName} (${suffix})`;
    suffix += 1;
  }

  return candidateName;
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

function setActiveCanvasViewportOffset(nextX, nextY) {
  const activeCanvas = getActiveCanvas();

  if (activeCanvas === null) {
    return false;
  }

  if (activeCanvas.viewportOffset.x === nextX && activeCanvas.viewportOffset.y === nextY) {
    return false;
  }

  activeCanvas.viewportOffset.x = nextX;
  activeCanvas.viewportOffset.y = nextY;
  renderCanvas();
  return true;
}

function panActiveCanvasBy(deltaX, deltaY) {
  const activeCanvas = getActiveCanvas();

  if (activeCanvas === null || (deltaX === 0 && deltaY === 0)) {
    return false;
  }

  return setActiveCanvasViewportOffset(activeCanvas.viewportOffset.x + deltaX, activeCanvas.viewportOffset.y + deltaY);
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
  const safeViewportX = Number.isFinite(viewportOffset.x) ? viewportOffset.x : 0;
  const safeViewportY = Number.isFinite(viewportOffset.y) ? viewportOffset.y : 0;

  const canvasRecord = {
    id: crypto.randomUUID(),
    name: getUniqueCanvasName(requestedName),
    viewportOffset: {
      x: safeViewportX,
      y: safeViewportY
    },
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
    x: position.x - activeCanvas.viewportOffset.x,
    y: position.y - activeCanvas.viewportOffset.y
  };
}

function positionNode(nodeRecord) {
  if (nodeRecord.isMaximized) {
    nodeRecord.element.style.left = "";
    nodeRecord.element.style.top = "";
    return;
  }

  nodeRecord.element.style.left = `${nodeRecord.x + nodeRecord.canvas.viewportOffset.x}px`;
  nodeRecord.element.style.top = `${nodeRecord.y + nodeRecord.canvas.viewportOffset.y}px`;
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

function syncVisibleTerminalSizes() {
  const activeCanvas = getActiveCanvas();

  if (activeCanvas === null) {
    return;
  }

  requestAnimationFrame(() => {
    if (getActiveCanvas()?.id !== activeCanvas.id) {
      return;
    }

    activeCanvas.nodes.forEach((nodeRecord) => {
      nodeRecord.syncSize();
    });
  });
}

function renderCanvas() {
  const activeCanvas = getActiveCanvas();

  if (activeCanvas === null) {
    board.style.setProperty("--grid-offset-x", "0px");
    board.style.setProperty("--grid-offset-y", "0px");
    nodesLayer.replaceChildren();
    appShell?.classList.remove("has-maximized-node");
    board.classList.remove("has-maximized-node");
    emptyState.hidden = false;
    return;
  }

  board.style.setProperty("--grid-offset-x", `${activeCanvas.viewportOffset.x}px`);
  board.style.setProperty("--grid-offset-y", `${activeCanvas.viewportOffset.y}px`);

  activeCanvas.nodes.forEach(positionNode);
  nodesLayer.replaceChildren(...activeCanvas.nodes.map((nodeRecord) => nodeRecord.element));
  applyCanvasFocusMode();
  updateEmptyState();
  syncVisibleTerminalSizes();
}

function createCanvasListItem(canvasRecord) {
  const item = document.createElement("li");
  item.className = "canvas-list-item";

  const switchButton = document.createElement("button");
  switchButton.className = "canvas-list-button";
  switchButton.type = "button";
  switchButton.setAttribute("aria-label", `Open ${canvasRecord.name}`);

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

  item.append(switchButton);

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
    item.append(deleteButton);
  }

  return item;
}

function renderCanvasList() {
  const fragment = document.createDocumentFragment();

  canvases.forEach((canvasRecord) => {
    fragment.append(createCanvasListItem(canvasRecord));
  });

  canvasList.replaceChildren(fragment);
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
      terminalNodes: canvasRecord.nodes.map((nodeRecord) => ({
        x: nodeRecord.x,
        y: nodeRecord.y,
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
  const terminalNodes = Array.isArray(canvas?.terminalNodes) ? canvas.terminalNodes : null;

  if (parsed?.version !== CANVAS_EXPORT_VERSION || typeof canvas?.name !== "string" || terminalNodes === null) {
    throw new Error("Invalid canvas file format.");
  }

  return {
    name: canvas.name,
    viewportOffset: {
      x: Number.isFinite(viewportOffset?.x) ? viewportOffset.x : 0,
      y: Number.isFinite(viewportOffset?.y) ? viewportOffset.y : 0
    },
    terminalNodes: terminalNodes.map((nodeRecord) => ({
      x: Number.isFinite(nodeRecord?.x) ? nodeRecord.x : 0,
      y: Number.isFinite(nodeRecord?.y) ? nodeRecord.y : 0,
      title: typeof nodeRecord?.title === "string" ? nodeRecord.title : "",
      isMaximized: nodeRecord?.isMaximized === true
    }))
  };
}

async function exportActiveCanvas() {
  const activeCanvas = getActiveCanvas();

  if (activeCanvas === null) {
    return;
  }

  const exportPayload = serializeCanvasRecord(activeCanvas);
  await window.noteCanvas.saveCanvasFile({
    suggestedName: sanitizeCanvasExportName(activeCanvas.name),
    contents: JSON.stringify(exportPayload, null, 2)
  });
}

async function importCanvasFromData(importedCanvas) {
  const importedCanvasRecord = createCanvasRecord({
    name: importedCanvas.name,
    viewportOffset: importedCanvas.viewportOffset
  });

  setActiveCanvas(importedCanvasRecord.id);

  for (const nodeRecord of importedCanvas.terminalNodes) {
    await createTerminalNode({
      x: nodeRecord.x,
      y: nodeRecord.y,
      title: nodeRecord.title,
      isMaximized: nodeRecord.isMaximized
    });
  }

  return importedCanvasRecord;
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

function resetPointerInteractions() {
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

    if (activeTitleEditorRecord !== null) {
      activeTitleEditorRecord.titleInput?.blur();
      activeTitleEditorRecord = null;
    }

    setActiveNode(null);
    activeCanvasId = canvasId;
  }

  renderCanvasList();
  renderCanvas();
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

  if (activeNodeRecord?.canvas === canvasRecord) {
    setActiveNode(null);
  }

  const nodesToRemove = [...canvasRecord.nodes];
  const canvasIndex = canvases.findIndex((candidate) => candidate.id === canvasId);

  if (canvasIndex < 0) {
    return;
  }

  canvases.splice(canvasIndex, 1);
  canvasMap.delete(canvasId);

  if (activeCanvasId === canvasId) {
    const fallbackCanvas = canvases[Math.max(0, canvasIndex - 1)] ?? canvases[0] ?? null;
    activeCanvasId = fallbackCanvas?.id ?? null;
  }

  renderCanvasList();
  renderCanvas();

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

function moveDraggedNode(event) {
  const nodeRecord = dragState.nodeRecord;

  if (nodeRecord === null) {
    return;
  }

  const deltaX = event.clientX - dragState.startClientX;
  const deltaY = event.clientY - dragState.startClientY;

  if (!dragState.hasMoved && (Math.abs(deltaX) > DRAG_THRESHOLD || Math.abs(deltaY) > DRAG_THRESHOLD)) {
    dragState.hasMoved = true;
    nodeRecord.element.classList.add("is-dragging");
  }

  nodeRecord.x = dragState.originX + deltaX;
  nodeRecord.y = dragState.originY + deltaY;
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

  node.append(header, surface);

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
    reopenButton
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
  if (event.ctrlKey || getVisibleMaximizedNode() !== null || !isBoardBackgroundTarget(event.target)) {
    return;
  }

  const { x, y } = normalizeWheelDelta(event);
  const didPan = panActiveCanvasBy(-x, -y);

  if (didPan && event.cancelable) {
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

window.addEventListener("beforeunload", () => {
  isWindowUnloading = true;
  window.removeEventListener("keydown", handleWindowKeyDown);
  removeTerminalDataListener();
  removeTerminalExitListener();
  terminalNodeMap.forEach((nodeRecord) => {
    nodeRecord.resizeObserver?.disconnect();
    void window.noteCanvas.destroyTerminal(nodeRecord.terminalId);
  });
});

if (window.noteCanvas.isSmokeTest) {
  const getCanvasSnapshot = () => {
    const activeCanvas = getActiveCanvas();
    const activeNodes = activeCanvas?.nodes ?? [];

    return {
      canvasCount: canvases.length,
      canvasNames: canvases.map((canvasRecord) => canvasRecord.name),
      canvasNodeCounts: canvases.map((canvasRecord) => canvasRecord.nodes.length),
      activeCanvasName: activeCanvas?.name ?? null,
      activeNodeCount: activeNodes.length,
      viewportOffset: activeCanvas === null
        ? null
        : {
          x: activeCanvas.viewportOffset.x,
          y: activeCanvas.viewportOffset.y
        },
      terminalIds: activeNodes.map((nodeRecord) => nodeRecord.terminalId),
      nodeTitles: activeNodes.map((nodeRecord) => nodeRecord.titleText),
      exitedNodeTitles: activeNodes.filter((nodeRecord) => nodeRecord.isExited).map((nodeRecord) => nodeRecord.titleText),
      maximizedNodeTitle: activeNodes.find((nodeRecord) => nodeRecord.isMaximized)?.titleText ?? null,
      firstTerminalText: activeNodes[0]?.element?.textContent || "",
      sidebarCollapsed: isSidebarCollapsed
    };
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
        terminalIds: snapshot.terminalIds,
        nodeTitles: snapshot.nodeTitles,
        exitedNodeTitles: snapshot.exitedNodeTitles,
        maximizedNodeTitle: snapshot.maximizedNodeTitle,
        firstTerminalText: snapshot.firstTerminalText,
        sidebarCollapsed: snapshot.sidebarCollapsed
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
        firstNode.titleInput.blur();
      }

      await new Promise((resolve) => {
        requestAnimationFrame(() => {
          resolve();
        });
      });

      return getCanvasSnapshot();
    },
    toggleMaximizeFirstTerminal: () => {
      const firstNode = getActiveCanvas()?.nodes[0];

      if (firstNode === undefined) {
        return getCanvasSnapshot();
      }

      firstNode.maximizeButton?.click();
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
    exportActiveCanvasData: () => serializeCanvasRecord(getActiveCanvas()),
    importCanvasData: async (rawContents) => {
      const importedCanvas = typeof rawContents === "string" ? parseImportedCanvas(rawContents) : rawContents;
      const canvasRecord = await importCanvasFromData(importedCanvas);
      return {
        importedCanvasName: canvasRecord.name,
        snapshot: getCanvasSnapshot()
      };
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
      const wheelEvent = new WheelEvent("wheel", {
        bubbles: true,
        cancelable: true,
        deltaX,
        deltaY
      });
      eventTarget.dispatchEvent(wheelEvent);
      return getCanvasSnapshot();
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

sidebarToggleButton?.addEventListener("click", () => {
  toggleSidebar();
});

board.addEventListener("pointerdown", handleBoardPointerDown);
board.addEventListener("pointermove", handleBoardPointerMove);
board.addEventListener("pointerup", handleBoardPointerUp);
board.addEventListener("pointercancel", handleBoardPointerCancel);
board.addEventListener("wheel", handleBoardWheel, { passive: false });
board.addEventListener("dblclick", handleBoardDoubleClick);
window.addEventListener("keydown", handleWindowKeyDown);
