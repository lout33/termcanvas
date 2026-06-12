const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { buildPackagedRuntimePath, createAgentmuxService, deriveCanvasProjectTag } = require("../main_agentmux_service.js");

test("deriveCanvasProjectTag keeps canvas projects stable and scoped", () => {
  assert.equal(
    deriveCanvasProjectTag("/tmp/My Project", "canvas-Alpha_123"),
    "my-project-canvas-alp"
  );
});

test("packaged agentmux service prefers bundled runtime and writable app data", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "termcanvas-agentmux-"));
  const bundledRoot = path.join(tempRoot, "agentmux");
  const userDataPath = path.join(tempRoot, "user-data");
  const originalResourcesPath = process.resourcesPath;

  fs.mkdirSync(bundledRoot, { recursive: true });
  fs.mkdirSync(userDataPath, { recursive: true });
  fs.writeFileSync(path.join(bundledRoot, "agentmux"), "#!/usr/bin/env bash\n", "utf8");
  fs.writeFileSync(path.join(bundledRoot, "agentmux.py"), "#!/usr/bin/env python3\n", "utf8");
  process.resourcesPath = tempRoot;

  try {
    const service = createAgentmuxService({
      envPath: "/custom/bin:/usr/bin",
      app: {
        isPackaged: true,
        getPath: (name) => {
          assert.equal(name, "userData");
          return userDataPath;
        }
      }
    });
    const invocation = service.getAgentmuxInvocation();

    assert.equal(service.rootPath, bundledRoot);
    assert.equal(service.agentmuxHomePath, path.join(userDataPath, "agentmux"));
    assert.equal(invocation.command, path.join(bundledRoot, "agentmux"));
    assert.deepEqual(invocation.argsPrefix, []);
    assert.equal(invocation.envOverrides.AGENTMUX_HOME, path.join(userDataPath, "agentmux"));
    assert.equal(invocation.envOverrides.PATH, buildPackagedRuntimePath("/custom/bin:/usr/bin"));
    assert.match(invocation.displayText, /AGENTMUX_HOME=/);
    assert.match(invocation.displayText, /PATH=/);
    assert.match(invocation.displayText, /agentmux"?$/);
  } finally {
    process.resourcesPath = originalResourcesPath;
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("packaged runtime path includes common mac cli install locations first", () => {
  const homeDirectory = os.homedir();

  assert.equal(
    buildPackagedRuntimePath("/custom/bin:/opt/homebrew/bin:/usr/bin"),
    [
      path.join(homeDirectory, ".local/bin"),
      path.join(homeDirectory, ".bun/bin"),
      path.join(homeDirectory, ".npm-global/bin"),
      "/opt/homebrew/bin",
      "/usr/local/bin",
      "/usr/bin",
      "/bin",
      "/usr/sbin",
      "/sbin",
      "/custom/bin"
    ].join(path.delimiter)
  );
});
