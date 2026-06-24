const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function readRenderer() {
  return fs.readFileSync(path.join(__dirname, "..", "renderer.js"), "utf8");
}

function readMain() {
  return fs.readFileSync(path.join(__dirname, "..", "main.js"), "utf8");
}

function readHtml() {
  return fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
}

test("terminal sessions advertise truecolor capability", () => {
  const main = readMain();

  assert.match(main, /TERM:\s*"xterm-256color"/);
  assert.match(main, /COLORTERM:\s*"truecolor"/);
  assert.match(main, /TERM_PROGRAM:\s*"TermCanvas"/);
  assert.match(main, /CLICOLOR:\s*"1"/);
  assert.match(main, /CLICOLOR_FORCE:\s*"1"/);
  assert.match(main, /FORCE_COLOR:\s*"3"/);
  assert.match(main, /delete environment\.NO_COLOR/);
  assert.match(main, /set-environment",\s*\.\.\.targetArgs,\s*"-u",\s*"NO_COLOR"/);
  assert.match(main, /set-environment",\s*\.\.\.targetArgs,\s*name,\s*value/);
  assert.match(main, /terminal-features",\s*",xterm-256color:RGB"/);
  assert.match(main, /terminal-overrides",\s*",xterm-256color:Tc"/);
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
  assert.match(renderer, /termName:\s*"xterm-256color"/);
  assert.match(renderer, /const TERMINAL_LAYOUT_SETTLE_DELAYS_MS = \[80, 240\];/);
  assert.match(renderer, /resizeObserver\.observe\(nodeRecord\.terminalMount\);/);
  assert.match(renderer, /fittedSize\.cols === lastSyncedCols && fittedSize\.rows === lastSyncedRows/);
});
