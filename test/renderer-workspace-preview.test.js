const test = require("node:test");
const assert = require("node:assert/strict");

const {
  deriveWorkspacePreviewViewModel,
  shouldApplyWorkspacePreviewActionError
} = require("../renderer_workspace_preview.js");

test("deriveWorkspacePreviewViewModel maps json and text previews to text inspector mode", () => {
  const jsonViewModel = deriveWorkspacePreviewViewModel({
    relativePath: "config/app.json",
    status: "ready",
    data: {
      kind: "json",
      language: "json",
      mimeType: "application/json",
      fileName: "app.json",
      textContents: "{\n  \"name\": \"canvas\"\n}\n"
    },
    errorMessage: ""
  });

  assert.equal(jsonViewModel.mode, "text");
  assert.equal(jsonViewModel.fileName, "app.json");
  assert.equal(jsonViewModel.typeLabel, "JSON");
  assert.equal(jsonViewModel.textContents, "{\n  \"name\": \"canvas\"\n}\n");

  const textViewModel = deriveWorkspacePreviewViewModel({
    relativePath: "notes/todo.txt",
    status: "ready",
    data: {
      kind: "text",
      language: "text",
      mimeType: "text/plain",
      fileName: "todo.txt",
      textContents: "ship preview helper\n"
    },
    errorMessage: ""
  });

  assert.equal(textViewModel.mode, "text");
  assert.equal(textViewModel.textContents, "ship preview helper\n");
});

test("deriveWorkspacePreviewViewModel maps image and pdf previews to rendered inspector modes", () => {
  const imageViewModel = deriveWorkspacePreviewViewModel({
    relativePath: "images/diagram.png",
    status: "ready",
    data: {
      kind: "image",
      language: null,
      mimeType: "image/png",
      fileName: "diagram.png",
      binaryContentsBase64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB"
    },
    errorMessage: ""
  });

  assert.equal(imageViewModel.mode, "image");
  assert.equal(imageViewModel.mimeType, "image/png");
  assert.equal(imageViewModel.binaryContentsBase64, "iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB");

  const pdfViewModel = deriveWorkspacePreviewViewModel({
    relativePath: "docs/spec.pdf",
    status: "ready",
    data: {
      kind: "pdf",
      language: null,
      mimeType: "application/pdf",
      fileName: "spec.pdf",
      binaryContentsBase64: "JVBERi0xLjQKJcfs"
    },
    errorMessage: ""
  });

  assert.equal(pdfViewModel.mode, "pdf");
  assert.equal(pdfViewModel.mimeType, "application/pdf");
});

test("deriveWorkspacePreviewViewModel degrades empty-binary image and pdf previews to fallback mode", () => {
  const imageViewModel = deriveWorkspacePreviewViewModel({
    relativePath: "images/empty.png",
    status: "ready",
    data: {
      kind: "image",
      language: null,
      mimeType: "image/png",
      fileName: "empty.png",
      binaryContentsBase64: "",
      fallbackReason: "Inline preview is not available for this file type."
    },
    errorMessage: ""
  });

  const pdfViewModel = deriveWorkspacePreviewViewModel({
    relativePath: "docs/empty.pdf",
    status: "ready",
    data: {
      kind: "pdf",
      language: null,
      mimeType: "application/pdf",
      fileName: "empty.pdf",
      binaryContentsBase64: "",
      fallbackReason: "Inline preview is not available for this file type."
    },
    errorMessage: ""
  });

  assert.equal(imageViewModel.mode, "fallback");
  assert.equal(pdfViewModel.mode, "fallback");
  assert.equal(imageViewModel.actions.canOpenExternally, true);
  assert.equal(pdfViewModel.actions.canRevealInFinder, true);
});

test("deriveWorkspacePreviewViewModel degrades malformed image and pdf payloads to fallback mode", () => {
  const imageViewModel = deriveWorkspacePreviewViewModel({
    relativePath: "images/bad.png",
    status: "ready",
    data: {
      kind: "image",
      language: null,
      mimeType: "image/png",
      fileName: "bad.png",
      binaryContentsBase64: "not-base64***",
      fallbackReason: "Inline preview is not available for this file type."
    },
    errorMessage: ""
  });

  const pdfViewModel = deriveWorkspacePreviewViewModel({
    relativePath: "docs/bad.pdf",
    status: "ready",
    data: {
      kind: "pdf",
      language: null,
      mimeType: "application/pdf",
      fileName: "bad.pdf",
      binaryContentsBase64: "%%%%",
      fallbackReason: "Inline preview is not available for this file type."
    },
    errorMessage: ""
  });

  assert.equal(imageViewModel.mode, "fallback");
  assert.equal(pdfViewModel.mode, "fallback");
});

test("deriveWorkspacePreviewViewModel maps unsupported and too-large previews to fallback inspector mode", () => {
  const unsupportedViewModel = deriveWorkspacePreviewViewModel({
    relativePath: "artifacts/blob.bin",
    status: "ready",
    data: {
      kind: "unsupported",
      language: null,
      mimeType: null,
      fileName: "blob.bin",
      fallbackReason: "File type is not supported for preview."
    },
    errorMessage: ""
  });

  assert.equal(unsupportedViewModel.mode, "fallback");
  assert.equal(unsupportedViewModel.message, "File type is not supported for preview.");
  assert.equal(unsupportedViewModel.actions.canOpenExternally, true);
  assert.equal(unsupportedViewModel.actions.canRevealInFinder, true);

  const tooLargeViewModel = deriveWorkspacePreviewViewModel({
    relativePath: "logs/huge.log",
    status: "ready",
    data: {
      kind: "too-large",
      language: "text",
      mimeType: "text/plain",
      fileName: "huge.log",
      fallbackReason: "File is too large to preview (limit: 524288 bytes)."
    },
    errorMessage: ""
  });

  assert.equal(tooLargeViewModel.mode, "fallback");
  assert.equal(tooLargeViewModel.message, "File is too large to preview (limit: 524288 bytes).");
});

test("deriveWorkspacePreviewViewModel maps audio, video, and binary previews to fallback inspector mode", () => {
  const audioViewModel = deriveWorkspacePreviewViewModel({
    relativePath: "audio/clip.mp3",
    status: "ready",
    data: {
      kind: "audio",
      language: null,
      mimeType: "audio/mpeg",
      fileName: "clip.mp3",
      fallbackReason: "Inline preview is not available for this file type."
    },
    errorMessage: ""
  });

  const videoViewModel = deriveWorkspacePreviewViewModel({
    relativePath: "video/demo.mp4",
    status: "ready",
    data: {
      kind: "video",
      language: null,
      mimeType: "video/mp4",
      fileName: "demo.mp4",
      fallbackReason: "Inline preview is not available for this file type."
    },
    errorMessage: ""
  });

  const binaryViewModel = deriveWorkspacePreviewViewModel({
    relativePath: "artifacts/archive.bin",
    status: "ready",
    data: {
      kind: "binary",
      language: null,
      mimeType: "application/octet-stream",
      fileName: "archive.bin",
      fallbackReason: "Inline preview is not available for this file type."
    },
    errorMessage: ""
  });

  assert.equal(audioViewModel.mode, "fallback");
  assert.equal(videoViewModel.mode, "fallback");
  assert.equal(binaryViewModel.mode, "fallback");
  assert.equal(binaryViewModel.actions.canOpenExternally, true);
  assert.equal(binaryViewModel.actions.canRevealInFinder, true);
});

test("deriveWorkspacePreviewViewModel surfaces fallback action errors", () => {
  const viewModel = deriveWorkspacePreviewViewModel({
    relativePath: "artifacts/archive.bin",
    status: "ready",
    data: {
      kind: "binary",
      language: null,
      mimeType: "application/octet-stream",
      fileName: "archive.bin",
      fallbackReason: "Inline preview is not available for this file type."
    },
    actionErrorMessage: "Failed to reveal file in Finder.",
    errorMessage: ""
  });

  assert.equal(viewModel.mode, "fallback");
  assert.equal(viewModel.actionErrorMessage, "Failed to reveal file in Finder.");
});

test("shouldApplyWorkspacePreviewActionError ignores stale async action failures after file selection changes", () => {
  assert.equal(shouldApplyWorkspacePreviewActionError({
    currentFolderId: "folder-a",
    currentRelativePath: "docs/b.md",
    targetFolderId: "folder-a",
    targetRelativePath: "docs/a.md"
  }), false);

  assert.equal(shouldApplyWorkspacePreviewActionError({
    currentFolderId: "folder-b",
    currentRelativePath: "docs/a.md",
    targetFolderId: "folder-a",
    targetRelativePath: "docs/a.md"
  }), false);

  assert.equal(shouldApplyWorkspacePreviewActionError({
    currentFolderId: "folder-a",
    currentRelativePath: "docs/a.md",
    targetFolderId: "folder-a",
    targetRelativePath: "docs/a.md"
  }), true);
});
