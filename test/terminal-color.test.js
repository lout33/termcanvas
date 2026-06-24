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

test("terminal sessions advertise truecolor capability", () => {
  const main = readMain();

  assert.match(main, /TERM:\s*"xterm-256color"/);
  assert.match(main, /COLORTERM:\s*"truecolor"/);
  assert.match(main, /TERM_PROGRAM:\s*"TermCanvas"/);
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
