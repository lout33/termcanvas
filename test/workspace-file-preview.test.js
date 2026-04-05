const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { MAX_WORKSPACE_FILE_PREVIEW_BYTES, readWorkspaceFilePreview } = require("../workspace_file_preview.js");

function withTempDirectory(callback) {
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "canvas-learning-workspace-preview-"));

  try {
    return callback(tempDirectory);
  } finally {
    fs.rmSync(tempDirectory, { recursive: true, force: true });
  }
}

test("readWorkspaceFilePreview rejects path traversal outside the workspace root", () => withTempDirectory((rootPath) => {
  fs.writeFileSync(path.join(rootPath, "inside.txt"), "safe\n", "utf8");

  assert.throws(() => {
    readWorkspaceFilePreview(rootPath, "../outside.txt");
  }, /workspace root/u);
}));

test("readWorkspaceFilePreview pretty prints valid json files", () => withTempDirectory((rootPath) => {
  fs.writeFileSync(path.join(rootPath, "report.json"), JSON.stringify({ status: "ok", count: 2 }), "utf8");

  const preview = readWorkspaceFilePreview(rootPath, "report.json");

  assert.equal(preview.kind, "json");
  assert.equal(preview.language, "json");
  assert.equal(preview.fileName, "report.json");
  assert.match(preview.contents, /\n  "status": "ok",\n/u);
}));

test("readWorkspaceFilePreview keeps invalid json readable as raw text", () => withTempDirectory((rootPath) => {
  fs.writeFileSync(path.join(rootPath, "broken.json"), "{ bad json\n", "utf8");

  const preview = readWorkspaceFilePreview(rootPath, "broken.json");

  assert.equal(preview.kind, "text");
  assert.equal(preview.language, "json");
  assert.equal(preview.contents, "{ bad json\n");
}));

test("readWorkspaceFilePreview marks unsupported file types without reading text content", () => withTempDirectory((rootPath) => {
  fs.writeFileSync(path.join(rootPath, "archive.bin"), Buffer.from([0xde, 0xad, 0xbe, 0xef]));

  const preview = readWorkspaceFilePreview(rootPath, "archive.bin");

  assert.equal(preview.kind, "unsupported");
  assert.equal(preview.language, null);
  assert.equal(preview.contents, "");
}));

test("readWorkspaceFilePreview rejects files larger than the preview limit", () => withTempDirectory((rootPath) => {
  fs.writeFileSync(path.join(rootPath, "large.md"), "a".repeat(MAX_WORKSPACE_FILE_PREVIEW_BYTES + 1), "utf8");

  const preview = readWorkspaceFilePreview(rootPath, "large.md");

  assert.equal(preview.kind, "too-large");
  assert.equal(preview.contents, "");
}));

test("readWorkspaceFilePreview returns markdown as readable text preview", () => withTempDirectory((rootPath) => {
  fs.writeFileSync(path.join(rootPath, "notes.md"), "# Hello\n\n- item\n", "utf8");

  const preview = readWorkspaceFilePreview(rootPath, "notes.md");

  assert.equal(preview.kind, "text");
  assert.equal(preview.language, "markdown");
  assert.equal(preview.contents, "# Hello\n\n- item\n");
}));
