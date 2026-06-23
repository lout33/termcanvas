const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function readProjectFile(fileName) {
  const filePath = path.join(__dirname, "..", fileName);
  return fs.readFileSync(filePath, "utf8");
}

test("explorer header exposes a persistent workspace search button", () => {
  const html = readProjectFile("index.html");

  assert.match(html, /id="focus-workspace-search-button"/);
  assert.match(html, /class="canvas-list-action sidebar-section-action sidebar-section-search-action"/);
  assert.match(html, /aria-label="Search workspace files"/);
  assert.match(html, /aria-keyshortcuts="Meta\+F Control\+F"/);
  assert.match(html, /<circle cx="7" cy="7" r="3\.75"><\/circle>/);
});

test("workspace search button focuses the existing explorer filter", () => {
  const renderer = readProjectFile("renderer.js");

  assert.match(renderer, /const focusWorkspaceSearchButton = document\.getElementById\("focus-workspace-search-button"\);/);
  assert.match(renderer, /function focusWorkspaceSearch\(options = \{\}\) \{/);
  assert.match(renderer, /openWorkspaceDrawer\(\);[\s\S]*renderWorkspaceBrowser\(\);[\s\S]*workspaceBrowser\.querySelector\("\.workspace-browser-search-input"\)/);
  assert.match(renderer, /focusWorkspaceSearchButton\?\.addEventListener\("click", \(\) => \{[\s\S]*focusWorkspaceSearch\(\{ select: true \}\);/);
});

test("workspace file search has keyboard affordances and active state", () => {
  const renderer = readProjectFile("renderer.js");

  assert.match(renderer, /focusWorkspaceSearchButton\.classList\.toggle\("is-active", workspaceFilterQuery\.trim\(\)\.length > 0\);/);
  assert.match(renderer, /focusWorkspaceSearchButton\.setAttribute\("aria-pressed", workspaceFilterQuery\.trim\(\)\.length > 0 \? "true" : "false"\);/);
  assert.match(renderer, /const isFileSearchShortcut = shortcutKey === "f"[\s\S]*event\.metaKey[\s\S]*event\.ctrlKey/);
  assert.match(renderer, /if \(isFileSearchShortcut\) \{[\s\S]*focusWorkspaceSearch\(\{ select: true \}\);/);
  assert.match(renderer, /searchInput\.addEventListener\("keydown", \(event\) => \{[\s\S]*if \(event\.key !== "Escape"\)/);
  assert.match(renderer, /workspaceFilterQuery = "";[\s\S]*renderWorkspaceBrowser\(\);[\s\S]*focusWorkspaceSearch\(\);/);
});
