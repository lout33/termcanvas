const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function readRenderer() {
  const rendererPath = path.join(__dirname, "..", "renderer.js");
  return fs.readFileSync(rendererPath, "utf8");
}

test("workspace preview tabs keep a small renderer-side working set", () => {
  const renderer = readRenderer();

  assert.match(renderer, /const MAX_WORKSPACE_PREVIEW_TABS = 5;/);
  assert.match(renderer, /let workspacePreviewTabs = \[\];/);
  assert.match(renderer, /function rememberWorkspacePreviewTab\(folderRecord, relativePath\) \{/);
  assert.match(renderer, /trimWorkspacePreviewTabs\(activeTabKey\);/);
  assert.match(renderer, /function pruneWorkspacePreviewTabs\(\) \{/);
  assert.match(renderer, /rememberWorkspacePreviewTab\(activeFolder, relativePath\);/);
});

test("workspace preview tabs render switch and close controls in the inspector", () => {
  const renderer = readRenderer();

  assert.match(renderer, /function renderWorkspacePreviewTabs\(\) \{/);
  assert.match(renderer, /tabbar\.className = "file-inspector-tabbar";/);
  assert.match(renderer, /tabbar\.setAttribute\("role", "tablist"\);/);
  assert.match(renderer, /tabItem\.dataset\.workspacePreviewTab = "true";/);
  assert.match(renderer, /tabButton\.className = "file-inspector-tab-main";/);
  assert.match(renderer, /closeButton\.className = "file-inspector-tab-close";/);
  assert.match(renderer, /file-inspector-tab-close-icon/);
  assert.match(renderer, /void switchWorkspacePreviewTab\(tab\);/);
  assert.match(renderer, /void closeWorkspacePreviewTab\(tab\);/);
});

test("workspace preview tab switching reuses the existing preview loader", () => {
  const renderer = readRenderer();

  assert.match(renderer, /async function switchWorkspacePreviewTab\(tab\) \{/);
  assert.match(renderer, /await activateWorkspaceFolderById\(tab\.folderId\);/);
  assert.match(renderer, /return loadWorkspaceFilePreview\(tab\.relativePath, \{ preserveViewMode: true \}\);/);
  assert.match(renderer, /async function closeWorkspacePreviewTab\(tab\) \{/);
  assert.match(renderer, /closeWorkspacePreview\(\);/);
});

test("workspace preview header exposes compact editor actions", () => {
  const renderer = readRenderer();

  assert.match(renderer, /function renderFileInspectorActions\(previewViewModel\) \{/);
  assert.match(renderer, /function createFileInspectorIconButton\(\{ className = "", label, title = label, iconMarkup, onClick, disabled = false \}\) \{/);
  assert.match(renderer, /button\.className = className\.length > 0[\s\S]*file-inspector-icon-button/);
  assert.match(renderer, /function createFileInspectorModeButton\(\{ label, viewMode, isActive, disabled = false, onClick \}\) \{/);
  assert.match(renderer, /file-inspector-mode-button is-active/);
  assert.match(renderer, /renderFileInspectorActions\(previewViewModel\)/);
  assert.match(renderer, /void saveWorkspacePreviewText\(\);/);
  assert.match(renderer, /cancelWorkspacePreviewEdit\(\);/);
  assert.match(renderer, /startWorkspacePreviewEdit\(\);/);
  assert.match(renderer, /void closeWorkspacePreviewSafely\(\);/);
});

test("renderable preview source editing returns to preview mode on cancel", () => {
  const renderer = readRenderer();

  assert.match(renderer, /function isRenderableWorkspacePreview\(\) \{/);
  assert.match(renderer, /return isMarkdownWorkspacePreview\(\) \|\| workspacePreviewState\.data\?\.kind === "svg";/);
  assert.match(renderer, /workspacePreviewState\.viewMode = isRenderableWorkspacePreview\(\) \? "render" : workspacePreviewState\.viewMode;/);
  assert.match(renderer, /workspacePreviewState\.viewMode = viewMode === "source" \? "source" : "render";/);
});
