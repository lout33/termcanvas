const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  flattenTmuxCommands,
  tmuxTerminalFeaturesInclude
} = require("../main_tmux_backend");

function readRenderer() {
  return fs.readFileSync(path.join(__dirname, "..", "renderer.js"), "utf8");
}

function readHtml() {
  return fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
}

test("tmux feature detection and command batching preserve color and clipboard capabilities", () => {
  const features = [
    "terminal-features[0] xterm-256color:RGB:clipboard",
    "terminal-features[1] screen*:title"
  ].join("\n");
  const batched = flattenTmuxCommands([
    ["set-environment", "-g", "COLORTERM", "truecolor"],
    ["set-option", "-t", "termcanvas-test", "set-clipboard", "external"]
  ]);

  assert.equal(tmuxTerminalFeaturesInclude(features, "RGB"), true);
  assert.equal(tmuxTerminalFeaturesInclude(features, "clipboard"), true);
  assert.equal(tmuxTerminalFeaturesInclude(features, "focus"), false);
  assert.deepEqual(batched, [
    "set-environment", "-g", "COLORTERM", "truecolor",
    ";",
    "set-option", "-t", "termcanvas-test", "set-clipboard", "external"
  ]);
});

test("xterm renderer uses a vivid ANSI palette", () => {
  const renderer = readRenderer();

  assert.match(renderer, /drawBoldTextInBrightColors:\s*true/);
  assert.match(renderer, /selectionBackground:\s*"rgba\(87, 199, 255, 0\.24\)"/);
  assert.match(renderer, /red:\s*"#ff5c57"/);
  assert.match(renderer, /green:\s*"#5af78e"/);
  assert.match(renderer, /blue:\s*"#57c7ff"/);
  assert.match(renderer, /magenta:\s*"#ff6ac1"/);
  assert.match(renderer, /brightYellow:\s*"#ffffa5"/);
  assert.match(renderer, /brightMagenta:\s*"#ff92d0"/);
});

test("xterm layout stays compatible with interactive TUI output", () => {
  const html = readHtml();
  const renderer = readRenderer();

  assert.match(html, /@xterm\/addon-unicode11\/lib\/addon-unicode11\.js/);
  assert.match(renderer, /const Unicode11AddonConstructor = window\.Unicode11Addon\?\.Unicode11Addon;/);
  assert.match(renderer, /allowProposedApi:\s*true/);
  assert.match(renderer, /terminal\.unicode\.activeVersion = "11";/);
  assert.match(renderer, /convertEol:\s*false/);
  assert.match(renderer, /customGlyphs:\s*false/);
  assert.match(renderer, /macOptionClickForcesSelection:\s*true/);
  assert.match(renderer, /rescaleOverlappingGlyphs:\s*true/);
  assert.match(renderer, /termName:\s*"xterm-256color"/);
  assert.match(renderer, /const TERMINAL_LAYOUT_SETTLE_DELAYS_MS = \[80, 240\];/);
  assert.match(renderer, /nodeRecord\.terminal\.clearTextureAtlas\?\.\(\);/);
  assert.match(renderer, /resizeObserver\.observe\(nodeRecord\.terminalMount\);/);
  assert.match(renderer, /fittedSize\.cols === lastSyncedCols && fittedSize\.rows === lastSyncedRows/);
});
