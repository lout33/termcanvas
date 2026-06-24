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
    /<header class="canvas-panel-header" id="canvas-panel-header"[\s\S]*?<button class="sidebar-edge-handle" id="sidebar-toggle-button"[\s\S]*?<div class="canvas-panel-context">[\s\S]*?<div class="canvas-breadcrumb"/i
  );

  // The brand mark lives in the far-left project rail, not the merged header.
  assert.match(
    html,
    /<aside class="app-rail"[\s\S]*?<div class="canvas-brand app-rail-brand"/i
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

test("side panels are docked outside the board so they never cover the canvas", () => {
  const html = readIndexHtml();
  const sidebarIndex = html.indexOf('<aside class="canvas-sidebar"');
  const workspaceIndex = html.indexOf('<main class="workspace-shell">');
  const boardOpenIndex = html.indexOf('<section class="board" id="board">');
  const mainCloseIndex = html.indexOf("</main>", boardOpenIndex);
  const boardCloseIndex = html.lastIndexOf("</section>", mainCloseIndex);
  const inspectorResizeIndex = html.indexOf('id="file-inspector-resize-handle"');
  const inspectorIndex = html.indexOf('<aside class="file-inspector"');

  assert.notEqual(sidebarIndex, -1, "Expected docked sidebar");
  assert.notEqual(workspaceIndex, -1, "Expected workspace shell");
  assert.notEqual(boardOpenIndex, -1, "Expected board section");
  assert.notEqual(mainCloseIndex, -1, "Expected main closing tag");
  assert.notEqual(boardCloseIndex, -1, "Expected board closing tag");
  assert.notEqual(inspectorResizeIndex, -1, "Expected docked inspector resize handle");
  assert.notEqual(inspectorIndex, -1, "Expected docked inspector");
  assert.ok(sidebarIndex < workspaceIndex, "Expected Explorer before the canvas column");
  assert.ok(boardCloseIndex > boardOpenIndex, "Expected board closing tag after board open tag");
  assert.ok(inspectorResizeIndex > mainCloseIndex, "Expected inspector resize handle outside the board");
  assert.ok(inspectorIndex > mainCloseIndex, "Expected inspector outside the board");

  const boardHtml = html.slice(boardOpenIndex, boardCloseIndex);

  assert.doesNotMatch(boardHtml, /class="canvas-sidebar"/i);
  assert.doesNotMatch(boardHtml, /id="file-inspector-resize-handle"/i);
  assert.doesNotMatch(boardHtml, /id="file-inspector"/i);
});

test("canvas header merges global context and canvas status into one row", () => {
  const html = readIndexHtml();

  assert.match(
    html,
    /<header class="canvas-panel-header" id="canvas-panel-header"[\s\S]*?<button class="sidebar-edge-handle" id="sidebar-toggle-button"[\s\S]*?<div class="canvas-panel-context">[\s\S]*?<div class="canvas-breadcrumb" id="canvas-breadcrumb">[\s\S]*?<div class="canvas-panel-title" id="canvas-panel-title"[\s\S]*?<div class="canvas-panel-pills" id="canvas-panel-pills"[\s\S]*?<button class="canvas-panel-icon-button" id="canvas-actions-menu-button"[\s\S]*?<div class="canvas-panel-menu-popover" id="canvas-actions-menu"[\s\S]*?<button class="canvas-panel-menu-item" id="export-canvas-button"[\s\S]*?<button class="canvas-panel-menu-item" id="import-canvas-button"[\s\S]*?<button class="canvas-panel-menu-item canvas-panel-danger-action" id="close-active-canvas-button"/i
  );

  assert.doesNotMatch(html, /class="app-rail-file-actions"/i);
  assert.doesNotMatch(html, /id="canvas-topbar"/i);
  assert.doesNotMatch(html, /canvas-topbar-shell/i);
  assert.doesNotMatch(html, /canvas-topbar-primary-row/i);
  assert.doesNotMatch(html, /terminal-strip-topbar-section/i);
  assert.doesNotMatch(html, /id="terminal-strip-section"/i);
  assert.doesNotMatch(html, /terminal-strip-heading/i);
});

test("board navigation exposes visible icon controls and keeps the minimap shell disabled", () => {
  const html = readIndexHtml();

  assert.match(
    html,
    /<div class="board-navigation" id="board-navigation"[\s\S]*?<button class="board-nav-button" id="board-zoom-out-button"[\s\S]*?<svg class="board-nav-icon"[\s\S]*?<button class="board-nav-button board-zoom-indicator" id="board-zoom-indicator"[\s\S]*?<button class="board-nav-button" id="board-zoom-in-button"[\s\S]*?<span class="board-nav-separator"[\s\S]*?<button class="board-nav-button" id="board-center-view-button"/i
  );
  assert.match(
    html,
    /<div class="board-minimap" id="board-minimap" aria-hidden="true" hidden>[\s\S]*?<div class="board-minimap-canvas" id="board-minimap-canvas"/i
  );
  assert.doesNotMatch(html, /board-nav-label-button/i);
});
