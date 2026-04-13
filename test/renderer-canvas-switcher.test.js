const test = require("node:test");
const assert = require("node:assert/strict");

const {
  deriveCanvasSwitcherViewModel,
  deriveCanvasStripOverflowState,
  deriveTerminalStripViewModel,
  deriveTerminalStripDropTarget
} = require("../renderer_canvas_switcher.js");

test("deriveCanvasSwitcherViewModel preserves canvas order for the strip and menu models", () => {
  const viewModel = deriveCanvasSwitcherViewModel({
    canvases: [
      {
        id: "canvas-a",
        name: "Alpha",
        nodes: [{ id: "terminal-1" }, { id: "terminal-2" }],
        workspace: {
          rootName: "project-alpha",
          rootPath: "/tmp/project-alpha"
        }
      },
      {
        id: "canvas-b",
        name: "Beta",
        nodes: [],
        workspace: null
      }
    ],
    activeCanvasId: "canvas-a",
    activeCanvasRenameId: null,
    isExpanded: true
  });

  assert.deepEqual(viewModel.strip, {
    label: "Canvas navigator",
    items: [{
      id: "canvas-a",
      name: "Alpha",
      terminalSummary: "2 terminals",
      isActive: true,
      isRenaming: false,
      canDelete: true
    }, {
      id: "canvas-b",
      name: "Beta",
      terminalSummary: "0 terminals",
      isActive: false,
      isRenaming: false,
      canDelete: true
    }]
  });
  assert.deepEqual(viewModel.menu, {
    label: "Manage canvases",
    isExpanded: true,
    items: [{
      id: "canvas-a",
      name: "Alpha",
      terminalSummary: "2 terminals",
      isActive: true,
      isRenaming: false,
      canDelete: true
    }, {
      id: "canvas-b",
      name: "Beta",
      terminalSummary: "0 terminals",
      isActive: false,
      isRenaming: false,
      canDelete: true
    }]
  });
});

test("deriveCanvasSwitcherViewModel keeps active and renaming flags in both strip and menu models", () => {
  const viewModel = deriveCanvasSwitcherViewModel({
    canvases: [{
      id: "canvas-b",
      name: "Beta",
      nodes: [{ id: "terminal-1" }],
      workspace: null
    }],
    activeCanvasId: "canvas-b",
    activeCanvasRenameId: "canvas-b",
    isExpanded: false
  });

  assert.deepEqual(viewModel.strip, {
    label: "Canvas navigator",
    items: [{
      id: "canvas-b",
      name: "Beta",
      terminalSummary: "1 terminal",
      isActive: true,
      isRenaming: true,
      canDelete: false
    }]
  });
  assert.deepEqual(viewModel.menu, {
    label: "Manage canvases",
    isExpanded: false,
    items: [{
      id: "canvas-b",
      name: "Beta",
      terminalSummary: "1 terminal",
      isActive: true,
      isRenaming: true,
      canDelete: false
    }]
  });
});

test("deriveCanvasStripOverflowState reports when a strip can scroll in either direction", () => {
  assert.deepEqual(deriveCanvasStripOverflowState({
    scrollLeft: 24,
    clientWidth: 240,
    scrollWidth: 480
  }), {
    hasOverflow: true,
    canScrollBackward: true,
    canScrollForward: true
  });
});

test("deriveCanvasStripOverflowState handles non-overflowing and fully scrolled strips", () => {
  assert.deepEqual(deriveCanvasStripOverflowState({
    scrollLeft: 0,
    clientWidth: 320,
    scrollWidth: 320
  }), {
    hasOverflow: false,
    canScrollBackward: false,
    canScrollForward: false
  });

  assert.deepEqual(deriveCanvasStripOverflowState({
    scrollLeft: 160,
    clientWidth: 320,
    scrollWidth: 480
  }), {
    hasOverflow: true,
    canScrollBackward: true,
    canScrollForward: false
  });
});

test("deriveTerminalStripViewModel lists only active canvas terminals and marks the active terminal", () => {
  const viewModel = deriveTerminalStripViewModel({
    activeCanvas: {
      id: "canvas-a",
      nodes: [
        { id: "node-1", titleText: "server" },
        { id: "node-2", titleText: "database" }
      ]
    },
    activeNodeId: "node-2"
  });

  assert.deepEqual(viewModel, {
    label: "Terminal navigator",
    isEmpty: false,
    items: [
      { id: "node-1", label: "server", isActive: false, isEmptyState: false },
      { id: "node-2", label: "database", isActive: true, isEmptyState: false }
    ]
  });
});

test("deriveTerminalStripViewModel returns a passive empty item when the active canvas has no terminals", () => {
  const viewModel = deriveTerminalStripViewModel({
    activeCanvas: {
      id: "canvas-a",
      nodes: []
    },
    activeNodeId: null
  });

  assert.deepEqual(viewModel, {
    label: "Terminal navigator",
    isEmpty: true,
    items: [{
      id: "terminal-strip-empty",
      label: "No terminals in this canvas",
      isActive: false,
      isEmptyState: true
    }]
  });
});

test("deriveTerminalStripViewModel preserves numeric node ids as clickable string ids", () => {
  const viewModel = deriveTerminalStripViewModel({
    activeCanvas: {
      id: "canvas-a",
      nodes: [
        { id: 1, titleText: "server" },
        { id: 2, titleText: "database" }
      ]
    },
    activeNodeId: 2
  });

  assert.deepEqual(viewModel, {
    label: "Terminal navigator",
    isEmpty: false,
    items: [
      { id: "1", label: "server", isActive: false, isEmptyState: false },
      { id: "2", label: "database", isActive: true, isEmptyState: false }
    ]
  });
});

test("deriveTerminalStripDropTarget returns a before-target insertion for pointers on the left half", () => {
  const target = deriveTerminalStripDropTarget({
    itemOffset: 100,
    itemSize: 80,
    pointerOffset: 110,
    itemIndex: 2,
    sourceIndex: 0
  });

  assert.deepEqual(target, {
    targetIndex: 1,
    isAfterTarget: false
  });
});

test("deriveTerminalStripDropTarget returns an after-target insertion for pointers on the right half", () => {
  const target = deriveTerminalStripDropTarget({
    itemOffset: 100,
    itemSize: 80,
    pointerOffset: 170,
    itemIndex: 1,
    sourceIndex: 3
  });

  assert.deepEqual(target, {
    targetIndex: 2,
    isAfterTarget: true
  });
});
