const test = require("node:test");
const assert = require("node:assert/strict");

const { APP_SESSION_VERSION, normalizeAppSessionSnapshot } = require("../session_snapshot.js");

test("normalizeAppSessionSnapshot returns a safe empty session for invalid input", () => {
  const snapshot = normalizeAppSessionSnapshot(null);

  assert.equal(snapshot.version, APP_SESSION_VERSION);
  assert.equal(snapshot.ui.isSidebarCollapsed, true);
  assert.equal(snapshot.ui.hasDismissedBoardIntro, false);
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
    activeSessionKey: null,
    terminalNodes: [{
      sessionKey: null,
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
    x: 0,
    y: 0,
    width: 544,
    height: 352,
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
