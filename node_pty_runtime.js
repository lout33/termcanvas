const path = require("node:path");

function getNodePtyHelperPaths({ isPackaged, appDirectory, resourcesPath }) {
  const baseDirectory = isPackaged === true
    ? path.join(resourcesPath, "app.asar.unpacked")
    : appDirectory;

  return [
    path.join(baseDirectory, "node_modules", "node-pty", "prebuilds", "darwin-arm64", "spawn-helper"),
    path.join(baseDirectory, "node_modules", "node-pty", "prebuilds", "darwin-x64", "spawn-helper")
  ];
}

module.exports = {
  getNodePtyHelperPaths
};
