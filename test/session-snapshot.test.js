const test = require("node:test");
const assert = require("node:assert/strict");

const { APP_SESSION_VERSION, normalizeAppSessionSnapshot } = require("../session_snapshot.js");

test("normalizeAppSessionSnapshot returns a safe empty session for invalid input", () => {
  const snapshot = normalizeAppSessionSnapshot(null);

  assert.equal(snapshot.version, APP_SESSION_VERSION);
  assert.equal(snapshot.ui.isRailCollapsed, false);
  assert.equal(snapshot.ui.isSidebarCollapsed, true);
  assert.equal(snapshot.ui.hasDismissedBoardIntro, false);
  assert.equal(snapshot.ui.activeSidebarView, "explorer");
  assert.deepEqual(snapshot.ui.collapsedAgentNamesByCanvasId, []);
  assert.deepEqual(snapshot.canvases, []);
  assert.equal(snapshot.activeCanvasId, null);
});

test("normalizeAppSessionSnapshot keeps null canvas workspaces", () => {
  const snapshot = normalizeAppSessionSnapshot({
    canvases: [{
      id: "canvas-1",
      workspace: null
    }]
  });

  assert.equal(snapshot.canvases[0].workspace, null);
});

test("normalizeAppSessionSnapshot normalizes canvases and active canvas selection", () => {
  const snapshot = normalizeAppSessionSnapshot({
    ui: {
      isRailCollapsed: true
    },
    activeCanvasId: "canvas-2",
    canvases: [
      {
        id: "canvas-1",
        name: "First",
        viewportOffset: { x: 120, y: -40 },
        viewportScale: 1.25,
        workspace: {
          rootPath: "/tmp/project",
          rootName: "project",
          expandedDirectoryPaths: ["src", "src", "", "src/components"],
          previewRelativePath: "README.md"
        },
        terminalNodes: [{
          x: 10,
          y: 20,
          width: 600,
          height: 420,
          cwd: "/tmp/project",
          shellName: "zsh",
          title: "API",
          isMaximized: true,
          isExited: true,
          exitCode: 1,
          exitSignal: "SIGTERM"
        }]
      },
      {
        id: "canvas-2",
        name: "Second",
        terminalNodes: [{}]
      },
      {
        id: "canvas-1",
        name: "Duplicate"
      }
    ]
  });

  assert.equal(snapshot.activeCanvasId, "canvas-2");
  assert.equal(snapshot.ui.isRailCollapsed, true);
  assert.equal(snapshot.canvases.length, 2);
  assert.deepEqual(snapshot.canvases[0], {
    id: "canvas-1",
    name: "First",
    viewportOffset: { x: 120, y: -40 },
    viewportScale: 1.25,
    workspace: {
      rootPath: "/tmp/project",
      rootName: "project",
      expandedDirectoryPaths: ["src", "src/components"],
      previewRelativePath: "README.md"
    },
    agentProjectTag: null,
    activeSessionKey: null,
    notes: [],
    terminalNodes: [{
      sessionKey: null,
      managedAgentName: null,
      managedAgentRole: null,
      managedProjectTag: null,
      managedParentAgent: null,
      managedDepth: null,
      tmuxSessionName: null,
      x: 10,
      y: 20,
      width: 600,
      height: 420,
      cwd: "/tmp/project",
      shellName: "zsh",
      title: "API",
      isMaximized: true,
      isExited: true,
      exitCode: 1,
      exitSignal: "SIGTERM"
    }]
  });
  assert.equal(snapshot.canvases[1].workspace, null);
  assert.deepEqual(snapshot.canvases[1].terminalNodes[0], {
    sessionKey: null,
    managedAgentName: null,
    managedAgentRole: null,
    managedProjectTag: null,
    managedParentAgent: null,
    managedDepth: null,
    tmuxSessionName: null,
    x: 0,
    y: 0,
    width: 636,
    height: 414,
    cwd: null,
    shellName: "Shell",
    title: "",
    isMaximized: false,
    isExited: false,
    exitCode: null,
    exitSignal: null
  });
  assert.equal(snapshot.canvases[1].activeSessionKey, null);
});

test("normalizeAppSessionSnapshot migrates the previous large terminal default once", () => {
  const migratedSnapshot = normalizeAppSessionSnapshot({
    version: 1,
    canvases: [{
      id: "canvas-1",
      terminalNodes: [{ width: 848, height: 552 }]
    }]
  });
  const currentSnapshot = normalizeAppSessionSnapshot({
    version: APP_SESSION_VERSION,
    canvases: [{
      id: "canvas-1",
      terminalNodes: [{ width: 848, height: 552 }]
    }]
  });

  assert.deepEqual(
    {
      width: migratedSnapshot.canvases[0].terminalNodes[0].width,
      height: migratedSnapshot.canvases[0].terminalNodes[0].height
    },
    { width: 636, height: 414 }
  );
  assert.deepEqual(
    {
      width: currentSnapshot.canvases[0].terminalNodes[0].width,
      height: currentSnapshot.canvases[0].terminalNodes[0].height
    },
    { width: 848, height: 552 }
  );
});

test("normalizeAppSessionSnapshot keeps only safe terminal session keys", () => {
  const snapshot = normalizeAppSessionSnapshot({
    canvases: [{
      id: "canvas-1",
      terminalNodes: [
        { sessionKey: "terminal_session-1" },
        { sessionKey: "../../bad" }
      ]
    }]
  });

  assert.equal(snapshot.canvases[0].terminalNodes[0].sessionKey, "terminal_session-1");
  assert.equal(snapshot.canvases[0].terminalNodes[1].sessionKey, null);
});

test("normalizeAppSessionSnapshot preserves managed terminal tree identity", () => {
  const snapshot = normalizeAppSessionSnapshot({
    canvases: [{
      id: "canvas-1",
      terminalNodes: [{
        managedAgentName: "child-agent",
        managedParentAgent: "parent-agent",
        managedDepth: 2
      }]
    }]
  });

  assert.equal(snapshot.canvases[0].terminalNodes[0].managedParentAgent, "parent-agent");
  assert.equal(snapshot.canvases[0].terminalNodes[0].managedDepth, 2);
});

test("normalizeAppSessionSnapshot keeps a canvas active session key only when it matches a saved terminal", () => {
  const snapshot = normalizeAppSessionSnapshot({
    canvases: [
      {
        id: "canvas-1",
        activeSessionKey: "terminal_session-1",
        terminalNodes: [
          { sessionKey: "terminal_session-1" },
          { sessionKey: "terminal_session-2" }
        ]
      },
      {
        id: "canvas-2",
        activeSessionKey: "../../bad",
        terminalNodes: [
          { sessionKey: "terminal_session-3" }
        ]
      },
      {
        id: "canvas-3",
        activeSessionKey: "terminal_session-missing",
        terminalNodes: [
          { sessionKey: "terminal_session-4" }
        ]
      }
    ]
  });

  assert.equal(snapshot.canvases[0].activeSessionKey, "terminal_session-1");
  assert.equal(snapshot.canvases[1].activeSessionKey, null);
  assert.equal(snapshot.canvases[2].activeSessionKey, null);
});

test("normalizeAppSessionSnapshot heals duplicate terminal identities across canvases", () => {
  const snapshot = normalizeAppSessionSnapshot({
    activeCanvasId: "canvas-life5",
    canvases: [
      {
        id: "canvas-life5",
        agentProjectTag: "life5-project",
        activeSessionKey: "terminal-agent-a",
        terminalNodes: [
          {
            title: "My saved terminal",
            sessionKey: "stable-session-a",
            tmuxSessionName: "termcanvas-stable-session-a",
            managedAgentName: "terminal-agent-a",
            managedProjectTag: "life5-project"
          },
          {
            title: "terminal-agent-a (Agent)",
            sessionKey: "terminal-agent-a",
            tmuxSessionName: "termcanvas-stable-session-a",
            managedAgentName: "terminal-agent-a",
            managedProjectTag: "life5-project"
          }
        ]
      },
      {
        id: "canvas-other",
        agentProjectTag: "other-project",
        terminalNodes: [{
          title: "terminal-agent-a (Agent)",
          sessionKey: "terminal-agent-a",
          tmuxSessionName: "termcanvas-stable-session-a",
          managedAgentName: "terminal-agent-a",
          managedProjectTag: "life5-project"
        }]
      }
    ]
  });

  assert.deepEqual(snapshot.canvases[0].terminalNodes.map((node) => node.title), ["My saved terminal"]);
  assert.equal(snapshot.canvases[0].terminalNodes[0].sessionKey, "stable-session-a");
  assert.equal(snapshot.canvases[0].activeSessionKey, null);
  assert.deepEqual(snapshot.canvases[1].terminalNodes, []);
});

test("normalizeAppSessionSnapshot migrates legacy top-level workspace onto the active canvas only", () => {
  const snapshot = normalizeAppSessionSnapshot({
    activeCanvasId: "canvas-2",
    workspace: {
      importedRootPaths: ["/tmp/a", "/tmp/b", "/tmp/b"],
      activeRootPath: "/tmp/b",
      expandedDirectoriesByRootPath: [
        {
          rootPath: "/tmp/a",
          directoryPaths: ["ignored"]
        },
        {
          rootPath: "/tmp/b",
          directoryPaths: ["src", "", "src", "src/components"]
        }
      ],
      preview: {
        rootPath: "/tmp/b",
        relativePath: "README.md"
      }
    },
    canvases: [
      {
        id: "canvas-1",
        workspace: {
          rootPath: "/existing",
          rootName: "existing",
          expandedDirectoryPaths: ["keep-me"],
          previewRelativePath: "notes.md"
        }
      },
      {
        id: "canvas-2"
      },
      {
        id: "canvas-3"
      }
    ]
  });

  assert.deepEqual(snapshot.canvases[0].workspace, {
    rootPath: "/existing",
    rootName: "existing",
    expandedDirectoryPaths: ["keep-me"],
    previewRelativePath: "notes.md"
  });
  assert.deepEqual(snapshot.canvases[1].workspace, {
    rootPath: "/tmp/b",
    rootName: "b",
    expandedDirectoryPaths: ["src", "src/components"],
    previewRelativePath: "README.md"
  });
  assert.equal(snapshot.canvases[2].workspace, null);
  assert.equal(Object.hasOwn(snapshot, "workspace"), false);
});

test("normalizeAppSessionSnapshot preserves canvas notes across restart", () => {
  const snapshot = normalizeAppSessionSnapshot({
    canvases: [{
      id: "canvas-notes",
      name: "Notes canvas",
      notes: [
        { id: "note-1", x: 100, y: 200, width: 300, height: 240, text: "remember this" },
        { id: "note-2", x: -50, y: 60, width: 260, height: 180, text: "second note" }
      ]
    }]
  });

  assert.equal(snapshot.canvases.length, 1);
  assert.equal(snapshot.canvases[0].notes.length, 2);
  assert.deepEqual(snapshot.canvases[0].notes, [
    { id: "note-1", x: 100, y: 200, width: 300, height: 240, text: "remember this" },
    { id: "note-2", x: -50, y: 60, width: 260, height: 180, text: "second note" }
  ]);
});

test("normalizeAppSessionSnapshot normalizes note snapshots and drops invalid ones", () => {
  const snapshot = normalizeAppSessionSnapshot({
    canvases: [{
      id: "canvas-mixed",
      notes: [
        { id: "good", x: 10, y: 20, width: 5, height: 5, text: "tiny" },
        null,
        { text: "no id" },
        { id: "  ", text: "blank id" },
        { id: "empty-text", x: 0, y: 0 }
      ]
    }]
  });

  assert.equal(snapshot.canvases[0].notes.length, 2);
  assert.deepEqual(snapshot.canvases[0].notes[0], {
    id: "good",
    x: 10,
    y: 20,
    width: 140,
    height: 100,
    text: "tiny"
  });
  assert.deepEqual(snapshot.canvases[0].notes[1], {
    id: "empty-text",
    x: 0,
    y: 0,
    width: 260,
    height: 180,
    text: ""
  });
});

test("normalizeAppSessionSnapshot defaults notes to empty array when missing", () => {
  const snapshot = normalizeAppSessionSnapshot({
    canvases: [{ id: "canvas-no-notes" }]
  });

  assert.deepEqual(snapshot.canvases[0].notes, []);
});

test("normalizeAppSessionSnapshot preserves sidebar view and per-canvas collapsed agent names", () => {
  const snapshot = normalizeAppSessionSnapshot({
    ui: {
      activeSidebarView: "terminals",
      collapsedAgentNamesByCanvasId: [
        { canvasId: "canvas-1", agentNames: ["worker-1", "worker-2"] },
        { canvasId: "canvas-2", agentNames: ["router"] }
      ]
    },
    canvases: [{ id: "canvas-1" }, { id: "canvas-2" }]
  });

  assert.equal(snapshot.ui.activeSidebarView, "terminals");
  assert.deepEqual(snapshot.ui.collapsedAgentNamesByCanvasId, [
    { canvasId: "canvas-1", agentNames: ["worker-1", "worker-2"] },
    { canvasId: "canvas-2", agentNames: ["router"] }
  ]);
});

test("normalizeAppSessionSnapshot drops empty and invalid collapsed agent name entries", () => {
  const snapshot = normalizeAppSessionSnapshot({
    ui: {
      activeSidebarView: "invalid-value",
      collapsedAgentNamesByCanvasId: [
        { canvasId: "canvas-1", agentNames: ["ok", "", 7, null] },
        { canvasId: "", agentNames: ["x"] },
        { agentNames: ["y"] },
        { canvasId: "canvas-2", agentNames: [] },
        { canvasId: "canvas-2", agentNames: ["valid"] }
      ]
    },
    canvases: [{ id: "canvas-1" }, { id: "canvas-2" }]
  });

  assert.equal(snapshot.ui.activeSidebarView, "explorer");
  assert.deepEqual(snapshot.ui.collapsedAgentNamesByCanvasId, [
    { canvasId: "canvas-1", agentNames: ["ok"] },
    { canvasId: "canvas-2", agentNames: ["valid"] }
  ]);
});
