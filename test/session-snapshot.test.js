const test = require("node:test");
const assert = require("node:assert/strict");

const { APP_SESSION_VERSION, normalizeAppSessionSnapshot } = require("../session_snapshot.js");

test("normalizeAppSessionSnapshot returns a safe empty session for invalid input", () => {
  const snapshot = normalizeAppSessionSnapshot(null);

  assert.equal(snapshot.version, APP_SESSION_VERSION);
  assert.equal(snapshot.ui.isSidebarCollapsed, true);
  assert.equal(snapshot.ui.hasDismissedBoardIntro, false);
  assert.deepEqual(snapshot.workspace, {
    importedRootPaths: [],
    activeRootPath: null,
    expandedDirectoriesByRootPath: [],
    preview: null
  });
  assert.deepEqual(snapshot.canvases, []);
  assert.equal(snapshot.activeCanvasId, null);
});

test("normalizeAppSessionSnapshot keeps valid workspace session details and drops invalid entries", () => {
  const snapshot = normalizeAppSessionSnapshot({
    workspace: {
      importedRootPaths: ["/tmp/a", "", "/tmp/b", "/tmp/a"],
      activeRootPath: "/tmp/b",
      expandedDirectoriesByRootPath: [
        {
          rootPath: "/tmp/a",
          directoryPaths: ["src", "src", "", "src/components"]
        },
        {
          rootPath: "/tmp/missing",
          directoryPaths: ["ghost"]
        }
      ],
      preview: {
        rootPath: "/tmp/b",
        relativePath: "README.md"
      }
    }
  });

  assert.deepEqual(snapshot.workspace, {
    importedRootPaths: ["/tmp/a", "/tmp/b"],
    activeRootPath: "/tmp/b",
    expandedDirectoriesByRootPath: [{
      rootPath: "/tmp/a",
      directoryPaths: ["src", "src/components"]
    }],
    preview: {
      rootPath: "/tmp/b",
      relativePath: "README.md"
    }
  });
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
  });
  assert.deepEqual(snapshot.canvases[1].terminalNodes[0], {
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
});
