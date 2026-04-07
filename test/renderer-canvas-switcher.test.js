const test = require("node:test");
const assert = require("node:assert/strict");

const {
  deriveCanvasSwitcherViewModel,
  deriveCanvasStripOverflowState
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
