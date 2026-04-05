const test = require("node:test");
const assert = require("node:assert/strict");

const {
  activateWorkspaceFolder,
  createWorkspaceRegistry,
  importWorkspaceFolder,
  removeWorkspaceFolder,
  updateWorkspaceFolderSnapshot
} = require("../workspace_registry.js");

function createSnapshot(rootPath, rootName, entries = []) {
  return {
    rootPath,
    rootName,
    entries,
    isTruncated: false,
    lastError: ""
  };
}

test("importWorkspaceFolder re-selects an existing folder instead of duplicating it", () => {
  const registry = createWorkspaceRegistry();
  const firstResult = importWorkspaceFolder(registry, createSnapshot("/tmp/a", "a"));
  const secondResult = importWorkspaceFolder(registry, createSnapshot("/tmp/a", "a"));

  assert.equal(firstResult.state.importedFolders.length, 1);
  assert.equal(secondResult.state.importedFolders.length, 1);
  assert.equal(secondResult.state.activeFolderId, firstResult.state.activeFolderId);
  assert.equal(secondResult.folderId, firstResult.folderId);
});

test("removeWorkspaceFolder falls back to the next folder when removing the active folder", () => {
  const registry = createWorkspaceRegistry();
  const firstFolder = importWorkspaceFolder(registry, createSnapshot("/tmp/a", "a"));
  const secondFolder = importWorkspaceFolder(registry, createSnapshot("/tmp/b", "b"));
  const thirdFolder = importWorkspaceFolder(registry, createSnapshot("/tmp/c", "c"));

  activateWorkspaceFolder(registry, secondFolder.folderId);
  const removal = removeWorkspaceFolder(registry, secondFolder.folderId);

  assert.equal(removal.removedFolderId, secondFolder.folderId);
  assert.equal(removal.state.activeFolderId, thirdFolder.folderId);
  assert.deepEqual(removal.state.importedFolders.map((folder) => folder.rootPath), ["/tmp/a", "/tmp/c"]);
  assert.notEqual(removal.state.activeFolderId, firstFolder.folderId);
});

test("updateWorkspaceFolderSnapshot refreshes the targeted folder without replacing other folders", () => {
  const registry = createWorkspaceRegistry();
  const firstFolder = importWorkspaceFolder(registry, createSnapshot("/tmp/a", "a", [{ relativePath: "old.txt", kind: "file", name: "old.txt" }]));
  const secondFolder = importWorkspaceFolder(registry, createSnapshot("/tmp/b", "b", [{ relativePath: "stay.txt", kind: "file", name: "stay.txt" }]));

  const updated = updateWorkspaceFolderSnapshot(
    registry,
    firstFolder.folderId,
    createSnapshot("/tmp/a", "a", [{ relativePath: "new.txt", kind: "file", name: "new.txt" }])
  );

  const updatedFirst = updated.state.importedFolders.find((folder) => folder.id === firstFolder.folderId);
  const untouchedSecond = updated.state.importedFolders.find((folder) => folder.id === secondFolder.folderId);

  assert.deepEqual(updatedFirst.entries, [{ relativePath: "new.txt", kind: "file", name: "new.txt" }]);
  assert.deepEqual(untouchedSecond.entries, [{ relativePath: "stay.txt", kind: "file", name: "stay.txt" }]);
});
