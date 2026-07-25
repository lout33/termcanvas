const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { getNodePtyHelperPaths } = require("../node_pty_runtime");

test("getNodePtyHelperPaths uses the local node_modules path in development", () => {
  const appDirectory = "/tmp/canvas_desktop";

  assert.deepEqual(getNodePtyHelperPaths({
    isPackaged: false,
    appDirectory,
    resourcesPath: "/ignored"
  }), [
    path.join(appDirectory, "node_modules", "node-pty", "prebuilds", "darwin-arm64", "spawn-helper"),
    path.join(appDirectory, "node_modules", "node-pty", "prebuilds", "darwin-x64", "spawn-helper")
  ]);
});

test("getNodePtyHelperPaths uses app.asar.unpacked in packaged builds", () => {
  const resourcesPath = "/Applications/TermCanvas.app/Contents/Resources";

  assert.deepEqual(getNodePtyHelperPaths({
    isPackaged: true,
    appDirectory: "/ignored",
    resourcesPath
  }), [
    path.join(resourcesPath, "app.asar.unpacked", "node_modules", "node-pty", "prebuilds", "darwin-arm64", "spawn-helper"),
    path.join(resourcesPath, "app.asar.unpacked", "node_modules", "node-pty", "prebuilds", "darwin-x64", "spawn-helper")
  ]);
});

test("packaged startup does not chmod an already executable PTY helper", () => {
  const main = fs.readFileSync(path.join(__dirname, "..", "main.js"), "utf8");

  assert.match(main, /if \(\(currentMode & 0o111\) === 0\) \{\s*fs\.chmodSync\(helperPath, currentMode \| 0o111\);/u);
});
