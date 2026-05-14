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

test("terminal strip items attach reorder handling for active canvas terminals", () => {
  const renderer = readRenderer();

  assert.match(renderer, /attachReorderableListItem\(stripItem, stripItem, \{/);
  assert.match(renderer, /onMove: async \(_nodeId, targetIndex\) => reorderTerminalNodeById\(itemView\.id, targetIndex\)/);
});
