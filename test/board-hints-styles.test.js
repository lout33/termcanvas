const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function readStyles() {
  const stylesPath = path.join(__dirname, "..", "styles.css");
  return fs.readFileSync(stylesPath, "utf8");
}

test("board hints honor the hidden attribute", () => {
  const styles = readStyles();

  assert.match(styles, /\.board-hints\[hidden\]\s*\{\s*display:\s*none;/);
});
