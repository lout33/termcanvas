const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { createDirectorySnapshot } = require("../directory_snapshot.js");

function withTempDirectory(callback) {
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "canvas-learning-directory-snapshot-"));

  try {
    return callback(tempDirectory);
  } finally {
    fs.rmSync(tempDirectory, { recursive: true, force: true });
  }
}

test("createDirectorySnapshot lists root entries before nested entries", () => withTempDirectory((rootPath) => {
  fs.mkdirSync(path.join(rootPath, "notes", "daily"), { recursive: true });
  fs.writeFileSync(path.join(rootPath, "notes", "daily", "todo.txt"), "ship it\n", "utf8");
  fs.writeFileSync(path.join(rootPath, "canvas.json"), "{}\n", "utf8");

  const snapshot = createDirectorySnapshot(rootPath, { entryLimit: 20 });

  assert.equal(snapshot.rootPath, rootPath);
  assert.equal(snapshot.rootName, path.basename(rootPath));
  assert.equal(snapshot.isTruncated, false);
  assert.deepEqual(snapshot.entries, [
    { name: "canvas.json", relativePath: "canvas.json", kind: "file", depth: 0 },
    { name: "notes", relativePath: "notes", kind: "directory", depth: 0 },
    { name: "daily", relativePath: "notes/daily", kind: "directory", depth: 1 },
    { name: "todo.txt", relativePath: "notes/daily/todo.txt", kind: "file", depth: 2 }
  ]);
}));

test("createDirectorySnapshot skips ignored heavy directories", () => withTempDirectory((rootPath) => {
  fs.mkdirSync(path.join(rootPath, ".git"), { recursive: true });
  fs.writeFileSync(path.join(rootPath, ".git", "HEAD"), "ref: refs/heads/main\n", "utf8");
  fs.mkdirSync(path.join(rootPath, "node_modules", "left-pad"), { recursive: true });
  fs.writeFileSync(path.join(rootPath, "node_modules", "left-pad", "index.js"), "module.exports = 1;\n", "utf8");
  fs.writeFileSync(path.join(rootPath, "keep.txt"), "keep\n", "utf8");

  const snapshot = createDirectorySnapshot(rootPath, { entryLimit: 20 });

  assert.deepEqual(snapshot.entries, [
    { name: "keep.txt", relativePath: "keep.txt", kind: "file", depth: 0 }
  ]);
}));

test("createDirectorySnapshot marks snapshots as truncated when the entry limit is reached", () => withTempDirectory((rootPath) => {
  fs.mkdirSync(path.join(rootPath, "a"), { recursive: true });
  fs.writeFileSync(path.join(rootPath, "a", "one.txt"), "1\n", "utf8");
  fs.writeFileSync(path.join(rootPath, "b.txt"), "2\n", "utf8");

  const snapshot = createDirectorySnapshot(rootPath, { entryLimit: 2 });

  assert.equal(snapshot.isTruncated, true);
  assert.deepEqual(snapshot.entries, [
    { name: "a", relativePath: "a", kind: "directory", depth: 0 },
    { name: "b.txt", relativePath: "b.txt", kind: "file", depth: 0 }
  ]);
}));

test("createDirectorySnapshot treats symlinked directories inside the workspace as directories", () => withTempDirectory((rootPath) => {
  const targetDirectoryPath = path.join(rootPath, "real-dir");
  fs.mkdirSync(targetDirectoryPath, { recursive: true });
  fs.writeFileSync(path.join(targetDirectoryPath, "nested.txt"), "inside\n", "utf8");
  fs.symlinkSync(targetDirectoryPath, path.join(rootPath, "linked-dir"), "dir");

  const snapshot = createDirectorySnapshot(rootPath, { entryLimit: 20 });
  const linkedEntry = snapshot.entries.find((entry) => entry.relativePath === "linked-dir");

  assert.equal(linkedEntry?.kind, "directory");
}));
