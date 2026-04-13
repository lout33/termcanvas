const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function readRenderer() {
  const rendererPath = path.join(__dirname, "..", "renderer.js");
  return fs.readFileSync(rendererPath, "utf8");
}

test("live terminal headers clear shell subtitles", () => {
  const renderer = readRenderer();

  assert.match(
    renderer,
    /function setNodeLiveState\(nodeRecord, shellName\) \{[\s\S]*nodeRecord\.meta\.textContent = "";/
  );
});

test("terminal strip items attach reorder handling for active canvas terminals", () => {
  const renderer = readRenderer();

  assert.match(renderer, /attachReorderableListItem\(stripItem, stripItem, \{/);
  assert.match(renderer, /onMove: async \(_nodeId, targetIndex\) => reorderTerminalNodeById\(itemView\.id, targetIndex\)/);
});
