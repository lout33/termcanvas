const test = require("node:test");
const assert = require("node:assert/strict");

const {
  deriveCanvasSwitcherViewModel,
  deriveCanvasStripOverflowState,
  deriveTerminalStripViewModel,
  deriveTerminalStripDropTarget,
  deriveTerminalTreeRows,
  deriveTerminalTreeDropAction
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
    {
      id: "t-1", label: "server", agentName: null, branchKey: null, depth: 0,
      hasChildren: false, isCollapsed: false, isActive: false, isUserArranged: false,
      sessionKey: null, parentSessionKey: null, runtimeState: null, agentState: null, attention: null
    },
    {
      id: "t-2", label: "database", agentName: null, branchKey: null, depth: 0,
      hasChildren: false, isCollapsed: false, isActive: true, isUserArranged: false,
      sessionKey: null, parentSessionKey: null, runtimeState: null, agentState: null, attention: null
    }
  ]);
});

test("deriveTerminalTreeRows nests children under their managed parent agent", () => {
  const { rows } = deriveTerminalTreeRows({
    activeCanvas: {
      nodes: [
        { id: "root", titleText: "router", managedAgentName: "router", managedParentAgent: null, managedAgentState: "idle" },
        { id: "child-1", titleText: "worker", managedAgentName: "worker-1", managedParentAgent: "router", managedRuntimeState: "running", managedAgentState: "active" },
        { id: "child-2", titleText: "tail", managedAgentName: "worker-2", managedParentAgent: "router", managedAttention: "waiting" }
      ]
    },
    activeNodeId: "child-1"
  });

  assert.deepEqual(rows, [
    {
      id: "root", label: "router", agentName: "router", branchKey: "router", depth: 0,
      hasChildren: true, isCollapsed: false, isActive: false, isUserArranged: false,
      sessionKey: null, parentSessionKey: null, runtimeState: null, agentState: "idle", attention: null
    },
    {
      id: "child-1", label: "worker", agentName: "worker-1", branchKey: "worker-1", depth: 1,
      hasChildren: false, isCollapsed: false, isActive: true, isUserArranged: false,
      sessionKey: null, parentSessionKey: null, runtimeState: "running", agentState: "active", attention: null
    },
    {
      id: "child-2", label: "tail", agentName: "worker-2", branchKey: "worker-2", depth: 1,
      hasChildren: false, isCollapsed: false, isActive: false, isUserArranged: false,
      sessionKey: null, parentSessionKey: null, runtimeState: null, agentState: null, attention: "waiting"
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

test("deriveTerminalTreeRows keeps a child reachable when its parent is missing", () => {
  const { rows } = deriveTerminalTreeRows({
    activeCanvas: {
      nodes: [
        { id: "orphan", titleText: "Orphan", managedAgentName: "orphan", managedParentAgent: "deleted-parent" }
      ]
    },
    activeNodeId: "orphan"
  });

  assert.deepEqual(rows.map(({ id, depth }) => ({ id, depth })), [{ id: "orphan", depth: 0 }]);
});

test("deriveTerminalTreeRows emits every node once when parent metadata contains a cycle", () => {
  const { rows } = deriveTerminalTreeRows({
    activeCanvas: {
      nodes: [
        { id: "a", titleText: "A", managedAgentName: "a", managedParentAgent: "b" },
        { id: "b", titleText: "B", managedAgentName: "b", managedParentAgent: "a" }
      ]
    },
    activeNodeId: null
  });

  assert.deepEqual(rows.map((row) => row.id).sort(), ["a", "b"]);
});

test("deriveTerminalTreeRows parents plain terminals through user arrangement overrides", () => {
  const { rows } = deriveTerminalTreeRows({
    activeCanvas: {
      nodes: [
        { id: "parent", titleText: "main", sessionKey: "sk-parent" },
        { id: "child", titleText: "logs", sessionKey: "sk-child", userParentSessionKey: "sk-parent" },
        { id: "grandchild", titleText: "grep", sessionKey: "sk-grand", userParentSessionKey: "sk-child" }
      ]
    },
    activeNodeId: null
  });

  assert.deepEqual(
    rows.map(({ id, depth, parentSessionKey, isUserArranged }) => ({ id, depth, parentSessionKey, isUserArranged })),
    [
      { id: "parent", depth: 0, parentSessionKey: null, isUserArranged: false },
      { id: "child", depth: 1, parentSessionKey: "sk-parent", isUserArranged: true },
      { id: "grandchild", depth: 2, parentSessionKey: "sk-child", isUserArranged: true }
    ]
  );
});

test("deriveTerminalTreeRows lets an override beat the managed parent and force a root", () => {
  const { rows } = deriveTerminalTreeRows({
    activeCanvas: {
      nodes: [
        { id: "root", titleText: "router", sessionKey: "sk-root", managedAgentName: "router" },
        // Agentmux says this worker belongs to router, but the user dragged it out.
        { id: "worker", titleText: "worker", sessionKey: "sk-worker", managedAgentName: "worker", managedParentAgent: "router", userParentSessionKey: null }
      ]
    },
    activeNodeId: null
  });

  assert.deepEqual(
    rows.map(({ id, depth }) => ({ id, depth })),
    [
      { id: "root", depth: 0 },
      { id: "worker", depth: 0 }
    ]
  );
});

test("deriveTerminalTreeRows cuts override cycles back to roots", () => {
  const { rows } = deriveTerminalTreeRows({
    activeCanvas: {
      nodes: [
        { id: "a", titleText: "A", sessionKey: "sk-a", userParentSessionKey: "sk-b" },
        { id: "b", titleText: "B", sessionKey: "sk-b", userParentSessionKey: "sk-a" }
      ]
    },
    activeNodeId: null
  });

  assert.deepEqual(rows.map((row) => row.id).sort(), ["a", "b"]);
  rows.forEach((row) => {
    assert.equal(row.depth, 0);
  });
});

test("deriveTerminalTreeDropAction re-parents when dropping onto a row", () => {
  const action = deriveTerminalTreeDropAction({
    nodes: [
      { id: "parent", sessionKey: "sk-parent" },
      { id: "dragged", sessionKey: "sk-dragged" }
    ],
    sourceNodeId: "dragged",
    targetNodeId: "parent",
    zone: "onto"
  });

  assert.deepEqual(action, {
    type: "reparent",
    parentSessionKey: "sk-parent",
    targetSessionKey: "sk-parent"
  });
});

test("deriveTerminalTreeDropAction reorders into the target's parent bucket", () => {
  const action = deriveTerminalTreeDropAction({
    nodes: [
      { id: "root", sessionKey: "sk-root", managedAgentName: "root" },
      { id: "sibling", sessionKey: "sk-sibling", managedAgentName: "sibling", managedParentAgent: "root" },
      { id: "dragged", sessionKey: "sk-dragged" }
    ],
    sourceNodeId: "dragged",
    targetNodeId: "sibling",
    zone: "after"
  });

  assert.deepEqual(action, {
    type: "reorder",
    position: "after",
    parentSessionKey: "sk-root",
    targetSessionKey: "sk-sibling"
  });
});

test("deriveTerminalTreeDropAction reorders to root when the target is a root", () => {
  const action = deriveTerminalTreeDropAction({
    nodes: [
      { id: "root-a", sessionKey: "sk-a" },
      { id: "dragged", sessionKey: "sk-dragged", userParentSessionKey: "sk-a" }
    ],
    sourceNodeId: "dragged",
    targetNodeId: "root-a",
    zone: "before"
  });

  assert.deepEqual(action, {
    type: "reorder",
    position: "before",
    parentSessionKey: null,
    targetSessionKey: "sk-a"
  });
});

test("deriveTerminalTreeDropAction refuses to drop a node onto its own descendant", () => {
  const nodes = [
    { id: "grandparent", sessionKey: "sk-gp" },
    { id: "parent", sessionKey: "sk-p", userParentSessionKey: "sk-gp" },
    { id: "child", sessionKey: "sk-c", userParentSessionKey: "sk-p" }
  ];

  assert.deepEqual(deriveTerminalTreeDropAction({
    nodes,
    sourceNodeId: "grandparent",
    targetNodeId: "child",
    zone: "onto"
  }), { type: "noop", reason: "cycle" });

  assert.deepEqual(deriveTerminalTreeDropAction({
    nodes,
    sourceNodeId: "grandparent",
    targetNodeId: "child",
    zone: "before"
  }), { type: "noop", reason: "cycle" });
});

test("deriveTerminalTreeDropAction rejects self-drops, bad zones, and keyless parents", () => {
  const nodes = [
    { id: "a", sessionKey: "sk-a" },
    { id: "no-key" }
  ];

  assert.deepEqual(
    deriveTerminalTreeDropAction({ nodes, sourceNodeId: "a", targetNodeId: "a", zone: "onto" }),
    { type: "noop", reason: "invalid-target" }
  );
  assert.deepEqual(
    deriveTerminalTreeDropAction({ nodes, sourceNodeId: "a", targetNodeId: "no-key", zone: "sideways" }),
    { type: "noop", reason: "invalid-zone" }
  );
  assert.deepEqual(
    deriveTerminalTreeDropAction({ nodes, sourceNodeId: "a", targetNodeId: "no-key", zone: "onto" }),
    { type: "noop", reason: "target-missing-key" }
  );
});
