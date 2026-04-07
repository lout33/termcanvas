const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { readWorkspaceFilePreview } = require("../workspace_file_preview.js");

const EXPECTED_MAX_TEXT_PREVIEW_BYTES = 256 * 1024;
const EXPECTED_MAX_BINARY_PREVIEW_BYTES = 8 * 1024 * 1024;

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

  assert.equal(preview.rootPath, fs.realpathSync(rootPath));
  assert.equal(preview.relativePath, "report.json");
  assert.equal(preview.kind, "json");
  assert.equal(preview.language, "json");
  assert.equal(preview.mimeType, "application/json");
  assert.equal(preview.fileName, "report.json");
  assert.match(preview.textContents, /\n  "status": "ok",\n/u);
  assert.equal(preview.binaryContentsBase64, "");
  assert.equal(preview.fallbackReason, "");
}));

test("readWorkspaceFilePreview keeps invalid json readable as raw text", () => withTempDirectory((rootPath) => {
  fs.writeFileSync(path.join(rootPath, "broken.json"), "{ bad json\n", "utf8");

  const preview = readWorkspaceFilePreview(rootPath, "broken.json");

  assert.equal(preview.kind, "text");
  assert.equal(preview.language, "json");
  assert.equal(preview.mimeType, "application/json");
  assert.equal(preview.textContents, "{ bad json\n");
  assert.equal(preview.binaryContentsBase64, "");
  assert.equal(preview.fallbackReason, "");
}));

test("readWorkspaceFilePreview returns bounded base64 previews for image files", () => withTempDirectory((rootPath) => {
  const imageBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01, 0x02, 0x03]);
  fs.writeFileSync(path.join(rootPath, "preview.png"), imageBytes);

  const preview = readWorkspaceFilePreview(rootPath, "preview.png");

  assert.equal(preview.kind, "image");
  assert.equal(preview.language, null);
  assert.equal(preview.mimeType, "image/png");
  assert.equal(preview.textContents, "");
  assert.equal(preview.binaryContentsBase64, imageBytes.toString("base64"));
  assert.equal(preview.fallbackReason, "");
}));

test("readWorkspaceFilePreview keeps svg files readable for render and source modes", () => withTempDirectory((rootPath) => {
  fs.writeFileSync(path.join(rootPath, "diagram.svg"), "<svg viewBox=\"0 0 1 1\"></svg>\n", "utf8");

  const preview = readWorkspaceFilePreview(rootPath, "diagram.svg");

  assert.equal(preview.kind, "svg");
  assert.equal(preview.language, "svg");
  assert.equal(preview.mimeType, "image/svg+xml");
  assert.equal(preview.textContents, "<svg viewBox=\"0 0 1 1\"></svg>\n");
  assert.equal(preview.binaryContentsBase64, "");
  assert.equal(preview.fallbackReason, "");
}));

test("readWorkspaceFilePreview returns bounded base64 previews for pdf files", () => withTempDirectory((rootPath) => {
  const pdfBytes = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n", "utf8");
  fs.writeFileSync(path.join(rootPath, "manual.pdf"), pdfBytes);

  const preview = readWorkspaceFilePreview(rootPath, "manual.pdf");

  assert.equal(preview.kind, "pdf");
  assert.equal(preview.language, null);
  assert.equal(preview.mimeType, "application/pdf");
  assert.equal(preview.textContents, "");
  assert.equal(preview.binaryContentsBase64, pdfBytes.toString("base64"));
  assert.equal(preview.fallbackReason, "");
}));

test("readWorkspaceFilePreview returns fallback metadata for audio files", () => withTempDirectory((rootPath) => {
  fs.writeFileSync(path.join(rootPath, "clip.mp3"), Buffer.from([0x49, 0x44, 0x33, 0x04, 0x00, 0x00]));

  const preview = readWorkspaceFilePreview(rootPath, "clip.mp3");

  assert.equal(preview.kind, "audio");
  assert.equal(preview.language, null);
  assert.equal(preview.mimeType, "audio/mpeg");
  assert.equal(preview.textContents, "");
  assert.equal(preview.binaryContentsBase64, "");
  assert.match(preview.fallbackReason, /preview is not available/u);
}));

test("readWorkspaceFilePreview returns fallback metadata for generic binary files", () => withTempDirectory((rootPath) => {
  fs.writeFileSync(path.join(rootPath, "archive.bin"), Buffer.from([0xde, 0xad, 0xbe, 0xef]));

  const preview = readWorkspaceFilePreview(rootPath, "archive.bin");

  assert.equal(preview.kind, "binary");
  assert.equal(preview.language, null);
  assert.equal(preview.mimeType, "application/octet-stream");
  assert.equal(preview.textContents, "");
  assert.equal(preview.binaryContentsBase64, "");
  assert.match(preview.fallbackReason, /preview is not available/u);
}));

test("readWorkspaceFilePreview does not convert large audio files into too-large previews", () => withTempDirectory((rootPath) => {
  fs.writeFileSync(path.join(rootPath, "long.mp3"), Buffer.alloc(EXPECTED_MAX_BINARY_PREVIEW_BYTES + 1, 0x00));

  const preview = readWorkspaceFilePreview(rootPath, "long.mp3");

  assert.equal(preview.kind, "audio");
  assert.equal(preview.language, null);
  assert.equal(preview.mimeType, "audio/mpeg");
  assert.equal(preview.textContents, "");
  assert.equal(preview.binaryContentsBase64, "");
  assert.match(preview.fallbackReason, /preview is not available/u);
}));

test("readWorkspaceFilePreview preserves too-large behavior for text files", () => withTempDirectory((rootPath) => {
  fs.writeFileSync(path.join(rootPath, "large.md"), "a".repeat(EXPECTED_MAX_TEXT_PREVIEW_BYTES + 1), "utf8");

  const preview = readWorkspaceFilePreview(rootPath, "large.md");

  assert.equal(preview.kind, "too-large");
  assert.equal(preview.language, "markdown");
  assert.equal(preview.mimeType, "text/markdown");
  assert.equal(preview.textContents, "");
  assert.equal(preview.binaryContentsBase64, "");
  assert.match(preview.fallbackReason, /too large/u);
}));

test("readWorkspaceFilePreview preserves too-large behavior for oversized pdf files", () => withTempDirectory((rootPath) => {
  fs.writeFileSync(path.join(rootPath, "large.pdf"), Buffer.alloc(EXPECTED_MAX_BINARY_PREVIEW_BYTES + 1, 0x20));

  const preview = readWorkspaceFilePreview(rootPath, "large.pdf");

  assert.equal(preview.kind, "too-large");
  assert.equal(preview.language, null);
  assert.equal(preview.mimeType, "application/pdf");
  assert.equal(preview.textContents, "");
  assert.equal(preview.binaryContentsBase64, "");
  assert.match(preview.fallbackReason, /too large/u);
}));

test("readWorkspaceFilePreview returns markdown as readable text preview", () => withTempDirectory((rootPath) => {
  fs.writeFileSync(path.join(rootPath, "notes.md"), "# Hello\n\n- item\n", "utf8");

  const preview = readWorkspaceFilePreview(rootPath, "notes.md");

  assert.equal(preview.kind, "text");
  assert.equal(preview.language, "markdown");
  assert.equal(preview.mimeType, "text/markdown");
  assert.equal(preview.textContents, "# Hello\n\n- item\n");
  assert.equal(preview.binaryContentsBase64, "");
  assert.equal(preview.fallbackReason, "");
}));

test("readWorkspaceFilePreview preserves legacy contents for current text preview consumers", () => withTempDirectory((rootPath) => {
  fs.writeFileSync(path.join(rootPath, "legacy.txt"), "hello from preview\n", "utf8");

  const preview = readWorkspaceFilePreview(rootPath, "legacy.txt");

  assert.equal(preview.kind, "text");
  assert.equal(preview.textContents, "hello from preview\n");
  assert.equal(preview.contents, "hello from preview\n");
}));
