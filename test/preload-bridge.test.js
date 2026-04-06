const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");

function loadPreloadWithMocks() {
  let exposedApi = null;
  const invokeCalls = [];
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
      send: () => {},
      on: () => {},
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

  return { exposedApi, invokeCalls, preloadPath };
}

test("preload exposes chooseCanvasWorkspace over the canvas IPC channel", () => {
  const { exposedApi, invokeCalls, preloadPath } = loadPreloadWithMocks();

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
