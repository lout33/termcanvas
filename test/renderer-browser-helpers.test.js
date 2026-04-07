const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function runHelperInBrowserContext(relativeFilePath) {
  const source = fs.readFileSync(path.join(__dirname, "..", relativeFilePath), "utf8");
  const context = {
    window: {}
  };

  vm.createContext(context);
  vm.runInContext(source, context, { filename: relativeFilePath });
  return context.window;
}

test("renderer helper modules expose browser-safe globals without require", () => {
  const workspaceWindow = runHelperInBrowserContext("renderer_workspace.js");
  const actionDialogWindow = runHelperInBrowserContext("renderer_action_dialog.js");
  const switcherWindow = runHelperInBrowserContext("renderer_canvas_switcher.js");
  const previewWindow = runHelperInBrowserContext("renderer_workspace_preview.js");

  assert.equal(typeof workspaceWindow.noteCanvasRendererWorkspace?.normalizeCanvasWorkspaceRecord, "function");
  assert.equal(typeof workspaceWindow.noteCanvasRendererWorkspace?.deriveCanvasWorkspaceAfterRestore, "function");
  assert.equal(typeof actionDialogWindow.noteCanvasRendererActionDialog?.openWorkspaceActionDialog, "function");
  assert.equal(typeof switcherWindow.noteCanvasRendererCanvasSwitcher?.deriveCanvasSwitcherViewModel, "function");
  assert.equal(typeof previewWindow.noteCanvasRendererWorkspacePreview?.deriveWorkspacePreviewViewModel, "function");
});
