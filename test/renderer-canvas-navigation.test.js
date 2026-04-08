const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function runHelperInBrowserContext(relativeFilePath) {
  const source = fs.readFileSync(path.join(__dirname, "..", relativeFilePath), "utf8");
  const context = {
    window: {}
  };

  vm.createContext(context);
  vm.runInContext(source, context, { filename: relativeFilePath });
  return context.window;
}

function createNode(className = "", parent = null) {
  const classNames = new Set(String(className).split(/\s+/).filter(Boolean));
  const node = {
    parentElement: parent,
    closest(selector) {
      if (!selector.startsWith(".")) {
        return null;
      }

      const expectedClass = selector.slice(1);
      let current = this;

      while (current !== null) {
        if (current.classNames.has(expectedClass)) {
          return current;
        }

        current = current.parentElement;
      }

      return null;
    },
    classNames
  };

  return node;
}

test("shouldHandleCanvasWheel allows board targets and unselected terminals but blocks the active terminal", () => {
  const navigationWindow = runHelperInBrowserContext("renderer_canvas_navigation.js");
  const { shouldHandleCanvasWheel } = navigationWindow.noteCanvasRendererCanvasNavigation;

  const board = createNode("board");
  const nodesLayer = createNode("nodes-layer", board);
  const activeTerminal = createNode("terminal-node", nodesLayer);
  const activeTerminalSurface = createNode("xterm", activeTerminal);
  const inactiveTerminal = createNode("terminal-node", nodesLayer);
  const inactiveTerminalSurface = createNode("xterm", inactiveTerminal);

  assert.equal(shouldHandleCanvasWheel({ target: board, board, nodesLayer, activeNodeElement: activeTerminal }), true);
  assert.equal(shouldHandleCanvasWheel({ target: nodesLayer, board, nodesLayer, activeNodeElement: activeTerminal }), true);
  assert.equal(shouldHandleCanvasWheel({ target: inactiveTerminalSurface, board, nodesLayer, activeNodeElement: activeTerminal }), true);
  assert.equal(shouldHandleCanvasWheel({ target: activeTerminalSurface, board, nodesLayer, activeNodeElement: activeTerminal }), false);
});

test("shouldTerminalHandleWheel only keeps wheel events inside the active terminal", () => {
  const navigationWindow = runHelperInBrowserContext("renderer_canvas_navigation.js");
  const { shouldTerminalHandleWheel } = navigationWindow.noteCanvasRendererCanvasNavigation;

  const activeTerminal = createNode("terminal-node");
  const inactiveTerminal = createNode("terminal-node");

  assert.equal(shouldTerminalHandleWheel({ terminalNodeElement: activeTerminal, activeNodeElement: activeTerminal }), true);
  assert.equal(shouldTerminalHandleWheel({ terminalNodeElement: inactiveTerminal, activeNodeElement: activeTerminal }), false);
  assert.equal(shouldTerminalHandleWheel({ terminalNodeElement: inactiveTerminal, activeNodeElement: null }), false);
});

test("shouldClearActiveTerminalSelection clears selection on empty board clicks", () => {
  const navigationWindow = runHelperInBrowserContext("renderer_canvas_navigation.js");
  const { shouldClearActiveTerminalSelection } = navigationWindow.noteCanvasRendererCanvasNavigation;

  const board = createNode("board");
  const nodesLayer = createNode("nodes-layer", board);
  const terminal = createNode("terminal-node", nodesLayer);

  assert.equal(shouldClearActiveTerminalSelection({ target: board, board, nodesLayer }), true);
  assert.equal(shouldClearActiveTerminalSelection({ target: nodesLayer, board, nodesLayer }), true);
  assert.equal(shouldClearActiveTerminalSelection({ target: terminal, board, nodesLayer }), false);
});

test("shouldSelectTerminal only returns true for explicit selection interactions", () => {
  const navigationWindow = runHelperInBrowserContext("renderer_canvas_navigation.js");
  const { shouldSelectTerminal } = navigationWindow.noteCanvasRendererCanvasNavigation;

  assert.equal(shouldSelectTerminal({ reason: "pointer" }), true);
  assert.equal(shouldSelectTerminal({ reason: "title-focus" }), true);
  assert.equal(shouldSelectTerminal({ reason: "maximize" }), true);
  assert.equal(shouldSelectTerminal({ reason: "create" }), false);
  assert.equal(shouldSelectTerminal({ reason: "restore" }), false);
});

test("shouldEnableTerminalInteractionOverlay keeps terminal content covered until selected", () => {
  const navigationWindow = runHelperInBrowserContext("renderer_canvas_navigation.js");
  const { shouldEnableTerminalInteractionOverlay } = navigationWindow.noteCanvasRendererCanvasNavigation;

  const activeTerminal = createNode("terminal-node");
  const inactiveTerminal = createNode("terminal-node");

  assert.equal(shouldEnableTerminalInteractionOverlay({ terminalNodeElement: inactiveTerminal, activeNodeElement: activeTerminal }), true);
  assert.equal(shouldEnableTerminalInteractionOverlay({ terminalNodeElement: activeTerminal, activeNodeElement: activeTerminal }), false);
  assert.equal(shouldEnableTerminalInteractionOverlay({ terminalNodeElement: inactiveTerminal, activeNodeElement: null }), true);
});

test("shouldDisableTerminalAnimations keeps terminal hot paths in no-animation mode", () => {
  const navigationWindow = runHelperInBrowserContext("renderer_canvas_navigation.js");
  const { shouldDisableTerminalAnimations } = navigationWindow.noteCanvasRendererCanvasNavigation;

  assert.equal(shouldDisableTerminalAnimations({ interaction: "drag" }), true);
  assert.equal(shouldDisableTerminalAnimations({ interaction: "maximize" }), true);
  assert.equal(shouldDisableTerminalAnimations({ interaction: "restore" }), true);
  assert.equal(shouldDisableTerminalAnimations({ interaction: "pointer" }), false);
});

test("shouldShowBoardHintsForCanvas only shows hints on empty canvases", () => {
  const navigationWindow = runHelperInBrowserContext("renderer_canvas_navigation.js");
  const { shouldShowBoardHintsForCanvas } = navigationWindow.noteCanvasRendererCanvasNavigation;

  assert.equal(shouldShowBoardHintsForCanvas({ nodes: [] }), true);
  assert.equal(shouldShowBoardHintsForCanvas({ nodes: [{}] }), false);
  assert.equal(shouldShowBoardHintsForCanvas({ nodes: [{}, {}] }), false);
  assert.equal(shouldShowBoardHintsForCanvas(null), false);
});
