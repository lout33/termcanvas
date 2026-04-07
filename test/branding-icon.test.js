const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("app icon artwork uses a full-bleed background without rounded transparent corners", () => {
  const svgPath = path.join(__dirname, "..", "assets", "branding", "termcanvas-mark.svg");
  const svgSource = fs.readFileSync(svgPath, "utf8");
  const fullCanvasRectMatch = svgSource.match(/<rect\b[^>]*width="1024"[^>]*height="1024"[^>]*\/>/);

  assert.ok(fullCanvasRectMatch, "expected a full-canvas background rect in termcanvas-mark.svg");
  assert.doesNotMatch(
    fullCanvasRectMatch[0],
    /\brx\s*=\s*"/,
    "the app icon background should stay square so rasterization does not add light edges"
  );
});
