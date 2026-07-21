const test = require("node:test");
const assert = require("node:assert/strict");

const {
  deriveCanvasSwitcherViewModel,
  deriveCanvasStripOverflowState,
  deriveTerminalStripViewModel,
  deriveTerminalStripDropTarget,
  deriveTerminalTreeRows
} = require("../renderer_canvas_switcher.js");

test("deriveCanvasSwitcherViewModel preserves canvas order for the strip model", () => {
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
  assert.equal(viewModel.menu, undefined);
});

test("deriveCanvasSwitcherViewModel keeps active and renaming flags in the strip model", () => {
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
      canDelete: true
    }]
  });
  assert.equal(viewModel.menu, undefined);
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
      { id: "node-1", label: "server", fullLabel: "server", isActive: false, isEmptyState: false },
      { id: "node-2", label: "database", fullLabel: "database", isActive: true, isEmptyState: false }
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
      { id: "1", label: "server", fullLabel: "server", isActive: false, isEmptyState: false },
      { id: "2", label: "database", fullLabel: "database", isActive: true, isEmptyState: false }
    ]
  });
});

test("deriveTerminalStripViewModel caps visible terminal labels at ten characters", () => {
  const viewModel = deriveTerminalStripViewModel({
    activeCanvas: {
      id: "canvas-a",
      nodes: [
        { id: "node-1", titleText: "life4-2340e804-5-general" }
      ]
    },
    activeNodeId: null
  });

  assert.deepEqual(viewModel.items, [
    {
      id: "node-1",
      label: "life4-2340",
      fullLabel: "life4-2340e804-5-general",
      isActive: false,
      isEmptyState: false
    }
  ]);
});

test("deriveTerminalStripViewModel falls back to readable terminal labels", () => {
  const viewModel = deriveTerminalStripViewModel({
    activeCanvas: {
      id: "canvas-a",
      nodes: [
        { id: "node-1", titleText: "   " },
        { id: "node-2" }
      ]
    },
    activeNodeId: null
  });

  assert.deepEqual(viewModel.items, [
    { id: "node-1", label: "Terminal", fullLabel: "Terminal", isActive: false, isEmptyState: false },
    { id: "node-2", label: "Terminal", fullLabel: "Terminal", isActive: false, isEmptyState: false }
  ]);
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

test("deriveTerminalTreeRows returns an empty view when the canvas has no nodes", () => {
  assert.deepEqual(deriveTerminalTreeRows({ activeCanvas: { nodes: [] }, activeNodeId: null }), {
    isEmpty: true,
    rows: []
  });
  assert.deepEqual(deriveTerminalTreeRows({ activeCanvas: null, activeNodeId: null }), {
    isEmpty: true,
    rows: []
  });
});

test("deriveTerminalTreeRows lays out flat roots when no parent agents are set", () => {
  const { isEmpty, rows } = deriveTerminalTreeRows({
    activeCanvas: {
      nodes: [
        { id: "t-1", titleText: "server" },
        { id: "t-2", titleText: "database" }
      ]
    },
    activeNodeId: "t-2"
  });

  assert.equal(isEmpty, false);
  assert.deepEqual(rows, [
    { id: "t-1", label: "server", agentName: null, depth: 0, hasChildren: false, isCollapsed: false, isActive: false, runtimeState: null, attention: null },
    { id: "t-2", label: "database", agentName: null, depth: 0, hasChildren: false, isCollapsed: false, isActive: true, runtimeState: null, attention: null }
  ]);
});

test("deriveTerminalTreeRows nests children under their managed parent agent", () => {
  const { rows } = deriveTerminalTreeRows({
    activeCanvas: {
      nodes: [
        { id: "root", titleText: "router", managedAgentName: "router", managedParentAgent: null },
        { id: "child-1", titleText: "worker", managedAgentName: "worker-1", managedParentAgent: "router", managedRuntimeState: "running" },
        { id: "child-2", titleText: "tail", managedAgentName: "worker-2", managedParentAgent: "router", managedAttention: "waiting" }
      ]
    },
    activeNodeId: "child-1"
  });

  assert.deepEqual(rows, [
    {
      id: "root", label: "router", agentName: "router", depth: 0,
      hasChildren: true, isCollapsed: false, isActive: false,
      runtimeState: null, attention: null
    },
    {
      id: "child-1", label: "worker", agentName: "worker-1", depth: 1,
      hasChildren: false, isCollapsed: false, isActive: true,
      runtimeState: "running", attention: null
    },
    {
      id: "child-2", label: "tail", agentName: "worker-2", depth: 1,
      hasChildren: false, isCollapsed: false, isActive: false,
      runtimeState: null, attention: "waiting"
    }
  ]);
});

test("deriveTerminalTreeRows prunes children of collapsed branches", () => {
  const { rows } = deriveTerminalTreeRows({
    activeCanvas: {
      nodes: [
        { id: "root", titleText: "router", managedAgentName: "router", managedParentAgent: null },
        { id: "child-1", titleText: "worker", managedAgentName: "worker-1", managedParentAgent: "router" },
        { id: "grandchild-1", titleText: "leaf", managedAgentName: "leaf-1", managedParentAgent: "worker-1" }
      ]
    },
    activeNodeId: null,
    collapsedAgentNames: new Set(["router"])
  });

  // The router row is marked collapsed; its descendants are not present.
  assert.deepEqual(rows.map((row) => row.id), ["root"]);
  assert.equal(rows[0].isCollapsed, true);
});

test("deriveTerminalTreeRows keeps canvas order within each parent bucket", () => {
  const { rows } = deriveTerminalTreeRows({
    activeCanvas: {
      nodes: [
        { id: "root", managedAgentName: "router", managedParentAgent: null },
        { id: "c2", managedAgentName: "c2", managedParentAgent: "router" },
        { id: "c1", managedAgentName: "c1", managedParentAgent: "router" },
        { id: "c3", managedAgentName: "c3", managedParentAgent: "router" }
      ]
    },
    activeNodeId: null
  });

  assert.deepEqual(rows.map((row) => row.id), ["root", "c2", "c1", "c3"]);
});
