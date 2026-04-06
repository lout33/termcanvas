const test = require("node:test");
const assert = require("node:assert/strict");

const { deriveCanvasSwitcherViewModel } = require("../renderer_canvas_switcher.js");

test("deriveCanvasSwitcherViewModel surfaces active canvas workspace ownership for the switcher header", () => {
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

  assert.deepEqual(viewModel.trigger, {
    buttonLabel: "Switch canvases",
    name: "Alpha",
    meta: "Workspace linked · 2 terminals",
    path: "/tmp/project-alpha",
    isExpanded: true,
    hasLinkedWorkspace: true,
    isRenaming: false
  });
  assert.deepEqual(viewModel.list, {
    label: "Available canvases",
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

test("deriveCanvasSwitcherViewModel keeps disclosure copy honest when no workspace is linked", () => {
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

  assert.deepEqual(viewModel.trigger, {
    buttonLabel: "Switch canvases",
    name: "Beta",
    meta: "No workspace linked · 1 terminal",
    path: "Choose a workspace for this canvas.",
    isExpanded: false,
    hasLinkedWorkspace: false,
    isRenaming: true
  });
  assert.deepEqual(viewModel.list, {
    label: "Available canvases",
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
