const test = require("node:test");
const assert = require("node:assert/strict");

const { serializeAppSessionSnapshot } = require("../renderer_session.js");

test("serializeAppSessionSnapshot keeps each canvas workspace isolated when the active canvas changes", () => {
  const firstWorkspace = {
    rootPath: "/tmp/a",
    rootName: "a",
    expandedDirectoryPaths: ["src"],
    previewRelativePath: "README.md"
  };
  const secondWorkspace = {
    rootPath: "/tmp/b",
    rootName: "b",
    expandedDirectoryPaths: ["app"],
    previewRelativePath: null
  };

  const snapshot = serializeAppSessionSnapshot({
    version: 1,
    ui: {
      isSidebarCollapsed: false,
      hasDismissedBoardIntro: true
    },
    activeCanvasId: "canvas-2",
    canvases: [
      {
        canvasRecord: {
          id: "canvas-1",
          workspace: firstWorkspace,
          nodes: [{
            sessionKey: "terminal-1",
            isExited: false,
            exitCode: null,
            exitSignal: null
          }]
        },
        exportedCanvas: {
          name: "Canvas 1",
          viewportOffset: { x: 0, y: 0 },
          viewportScale: 1,
          terminalNodes: [{
            x: 10,
            y: 20,
            width: 500,
            height: 300,
            cwd: "/tmp/a",
            shellName: "zsh",
            title: "One",
            isMaximized: false
          }]
        }
      },
      {
        canvasRecord: {
          id: "canvas-2",
          workspace: secondWorkspace,
          nodes: [{
            sessionKey: "terminal-2",
            isExited: true,
            exitCode: 1,
            exitSignal: "SIGTERM"
          }]
        },
        exportedCanvas: {
          name: "Canvas 2",
          viewportOffset: { x: 30, y: 40 },
          viewportScale: 1.25,
          terminalNodes: [{
            x: 30,
            y: 40,
            width: 600,
            height: 350,
            cwd: "/tmp/b",
            shellName: "bash",
            title: "Two",
            isMaximized: true
          }]
        }
      }
    ]
  });

  assert.deepEqual(snapshot.canvases.map((canvas) => canvas.workspace), [firstWorkspace, secondWorkspace]);
  assert.deepEqual(snapshot.canvases[0].terminalNodes[0].sessionKey, "terminal-1");
  assert.deepEqual(snapshot.canvases[1].terminalNodes[0], {
    x: 30,
    y: 40,
    width: 600,
    height: 350,
    cwd: "/tmp/b",
    shellName: "bash",
    title: "Two",
    isMaximized: true,
    sessionKey: "terminal-2",
    isExited: true,
    exitCode: 1,
    exitSignal: "SIGTERM"
  });
});
