const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function readRenderer() {
  const rendererPath = path.join(__dirname, "..", "renderer.js");
  return fs.readFileSync(rendererPath, "utf8");
}

test("live terminal headers show backend session subtitles", () => {
  const renderer = readRenderer();

  assert.match(
    renderer,
    /function setNodeLiveState\(nodeRecord, shellName, backend, tmuxSessionName, sessionKey\) \{[\s\S]*syncTerminalMeta\(nodeRecord\);/
  );
  assert.match(renderer, /tmux: \$\{nodeRecord\.tmuxSessionName \?\? `termcanvas-\$\{nodeRecord\.sessionKey\}`\}/);
  assert.match(renderer, /pty: \$\{nodeRecord\.sessionKey\}/);
  assert.match(renderer, /function getNodeSessionIdentifier\(nodeRecord\)/);
  assert.match(renderer, /copySessionButton\.textContent = "ID"/);
});

test("terminal title editing only starts on double click", () => {
  const renderer = readRenderer();

  assert.match(renderer, /function setNodeTitleEditing\(nodeRecord, isEditing\) \{[\s\S]*titleInput\.readOnly = !isEditing;/);
  assert.match(renderer, /function startNodeTitleEditing\(nodeRecord\) \{/);
  assert.match(renderer, /titleInput\.readOnly = true;/);
  assert.match(renderer, /titleInput\.tabIndex = -1;/);
  assert.match(renderer, /elements\.titleGroup\.addEventListener\("dblclick", \(event\) => \{[\s\S]*startNodeTitleEditing\(nodeRecord\);/);
  assert.match(renderer, /elements\.titleInput\.addEventListener\("pointerdown", \(event\) => \{[\s\S]*event\.stopPropagation\(\);[\s\S]*if \(!nodeRecord\.isTitleEditing\) \{[\s\S]*event\.preventDefault\(\);/);
});

test("terminal strip items attach reorder handling for active canvas terminals", () => {
  const renderer = readRenderer();

  assert.match(renderer, /attachReorderableListItem\(stripItem, stripItem, \{/);
  assert.match(renderer, /onMove: async \(_nodeId, targetIndex\) => reorderTerminalNodeById\(itemView\.id, targetIndex\)/);
});
