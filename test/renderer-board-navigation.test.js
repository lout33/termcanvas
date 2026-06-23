const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function readProjectFile(fileName) {
  const filePath = path.join(__dirname, "..", fileName);
  return fs.readFileSync(filePath, "utf8");
}

test("board navigation is visible only when a canvas is active", () => {
  const renderer = readProjectFile("renderer.js");

  assert.match(renderer, /if \(activeCanvas === null\) \{[\s\S]*boardNavigation\.hidden = true;/);
  assert.match(renderer, /if \(boardNavigation instanceof HTMLElement\) \{[\s\S]*boardNavigation\.hidden = false;[\s\S]*\}[\s\S]*board\.style\.setProperty\("--grid-offset-x"/);
});

