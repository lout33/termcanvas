const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");

function loadPreloadWithMocks() {
  let exposedApi = null;
  const invokeCalls = [];
  const sendCalls = [];
  const onCalls = [];
  const electronStub = {
    contextBridge: {
      exposeInMainWorld: (_key, value) => {
        exposedApi = value;
      }
    },
    ipcRenderer: {
      invoke: (...args) => {
        invokeCalls.push(args);
      },
      send: (...args) => {
        sendCalls.push(args);
      },
      on: (channel, listener) => {
        onCalls.push([channel]);
        return listener;
      },
      removeListener: () => {}
    }
  };
  const originalLoad = Module._load;
  const preloadPath = require.resolve("../preload.js");

  Module._load = function mockLoad(request, parent, isMain) {
    if (request === "electron") {
      return electronStub;
    }

    return originalLoad.call(this, request, parent, isMain);
  };

  delete require.cache[preloadPath];

  try {
    require(preloadPath);
  } finally {
    Module._load = originalLoad;
  }

  return { exposedApi, invokeCalls, sendCalls, onCalls, preloadPath };
}

test("preload exposes chooseCanvasWorkspace over the canvas IPC channel", () => {
  const { exposedApi, invokeCalls, preloadPath } = loadPreloadWithMocks();

  assert.equal(exposedApi.appName, "TermCanvas");
  assert.equal(typeof exposedApi.chooseCanvasWorkspace, "function");

  exposedApi.chooseCanvasWorkspace();

  assert.deepEqual(invokeCalls, [["workspace-directory:choose-canvas"]]);
  delete require.cache[preloadPath];
});

test("preload exposes workspace file external open and reveal methods", () => {
  const { exposedApi, invokeCalls, preloadPath } = loadPreloadWithMocks();

  assert.equal(typeof exposedApi.openWorkspaceFileExternally, "function");
  assert.equal(typeof exposedApi.revealWorkspaceFile, "function");

  exposedApi.openWorkspaceFileExternally("folder-1", "docs/readme.md");
  exposedApi.revealWorkspaceFile("folder-2", "notes/todo.txt");

  assert.deepEqual(invokeCalls, [
    ["workspace-file:open-external", { folderId: "folder-1", relativePath: "docs/readme.md" }],
    ["workspace-file:reveal", { folderId: "folder-2", relativePath: "notes/todo.txt" }]
  ]);
  delete require.cache[preloadPath];
});

test("preload exposes workspace create, rename, delete, and save methods", () => {
  const { exposedApi, invokeCalls, preloadPath } = loadPreloadWithMocks();

  assert.equal(typeof exposedApi.createWorkspaceFile, "function");
  assert.equal(typeof exposedApi.createWorkspaceDirectory, "function");
  assert.equal(typeof exposedApi.renameWorkspaceEntry, "function");
  assert.equal(typeof exposedApi.deleteWorkspaceEntry, "function");
  assert.equal(typeof exposedApi.saveWorkspaceFile, "function");

  exposedApi.createWorkspaceFile("folder-1", "docs", "draft.md");
  exposedApi.createWorkspaceDirectory("folder-1", "", "assets");
  exposedApi.renameWorkspaceEntry("folder-1", "docs/draft.md", "final.md");
  exposedApi.deleteWorkspaceEntry("folder-1", "assets");
  exposedApi.saveWorkspaceFile("folder-1", "docs/final.md", "updated\n", 1234);

  assert.deepEqual(invokeCalls, [
    ["workspace-entry:create-file", { folderId: "folder-1", parentRelativePath: "docs", name: "draft.md" }],
    ["workspace-entry:create-directory", { folderId: "folder-1", parentRelativePath: "", name: "assets" }],
    ["workspace-entry:rename", { folderId: "folder-1", relativePath: "docs/draft.md", nextName: "final.md" }],
    ["workspace-entry:delete", { folderId: "folder-1", relativePath: "assets" }],
    ["workspace-file:write", { folderId: "folder-1", relativePath: "docs/final.md", textContents: "updated\n", expectedLastModifiedMs: 1234 }]
  ]);
  delete require.cache[preloadPath];
});

test("preload exposes active terminal shortcut sync and maximize toggle listener", () => {
  const { exposedApi, sendCalls, onCalls, preloadPath } = loadPreloadWithMocks();

  assert.equal(typeof exposedApi.setActiveTerminalShortcutState, "function");
  assert.equal(typeof exposedApi.onToggleActiveTerminalMaximize, "function");

  const removeListener = exposedApi.onToggleActiveTerminalMaximize(() => {});
  exposedApi.setActiveTerminalShortcutState(true);

  assert.equal(typeof removeListener, "function");
  assert.deepEqual(sendCalls, [["terminal:active-state", { hasActiveTerminal: true }]]);
  assert.deepEqual(onCalls, [["terminal:toggle-maximize-active"]]);
  delete require.cache[preloadPath];
});

test("preload exposes app session file import and export methods", () => {
  const { exposedApi, invokeCalls, preloadPath } = loadPreloadWithMocks();

  assert.equal(typeof exposedApi.saveAppSessionFile, "function");
  assert.equal(typeof exposedApi.openAppSessionFile, "function");

  exposedApi.saveAppSessionFile({ suggestedName: "termcanvas-app-data", contents: "{}" });
  exposedApi.openAppSessionFile();

  assert.deepEqual(invokeCalls, [
    ["app-session:save-file", { suggestedName: "termcanvas-app-data", contents: "{}" }],
    ["app-session:open-file"]
  ]);
  delete require.cache[preloadPath];
});
