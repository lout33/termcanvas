const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function readIndexHtml() {
  const indexPath = path.join(__dirname, "..", "index.html");
  return fs.readFileSync(indexPath, "utf8");
}

function getElementOpenTagById(html, id) {
  const escapedId = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = html.match(new RegExp(`<([a-z]+)\\b[^>]*\\bid="${escapedId}"[^>]*>`, "i"));
  assert.ok(match, `Expected element with id ${id}`);
  return match[0];
}

function getClassList(openTag) {
  const classMatch = openTag.match(/\bclass="([^"]+)"/i);
  assert.ok(classMatch, `Expected class attribute in ${openTag}`);
  return classMatch[1].trim().split(/\s+/);
}

function assertHasClasses(openTag, expectedClasses) {
  const classes = new Set(getClassList(openTag));

  for (const expectedClass of expectedClasses) {
    assert.ok(classes.has(expectedClass), `Expected class ${expectedClass} in ${openTag}`);
  }
}

function assertLacksClasses(openTag, forbiddenClasses) {
  const classes = new Set(getClassList(openTag));

  for (const forbiddenClass of forbiddenClasses) {
    assert.ok(!classes.has(forbiddenClass), `Did not expect class ${forbiddenClass} in ${openTag}`);
  }
}

test("panel edge controls keep toggle and resize handles separate", () => {
  const html = readIndexHtml();

  assert.match(
    html,
    /<div class="canvas-topbar-leading">[\s\S]*?<button class="sidebar-edge-handle" id="sidebar-toggle-button"[\s\S]*?<div class="canvas-brand"/i
  );

  const toggleTag = getElementOpenTagById(html, "sidebar-toggle-button");
  assert.match(toggleTag, /^<button\b/i);
  assertHasClasses(toggleTag, ["sidebar-edge-handle"]);
  assertLacksClasses(toggleTag, ["panel-resize-handle"]);

  const leftResizeTag = getElementOpenTagById(html, "sidebar-resize-handle");
  assertHasClasses(leftResizeTag, ["panel-resize-handle", "sidebar-resize-handle"]);
  assertLacksClasses(leftResizeTag, ["sidebar-edge-handle"]);

  const rightResizeTag = getElementOpenTagById(html, "file-inspector-resize-handle");
  assertHasClasses(rightResizeTag, ["panel-resize-handle", "inspector-resize-handle"]);
  assertLacksClasses(rightResizeTag, ["sidebar-edge-handle"]);
});
