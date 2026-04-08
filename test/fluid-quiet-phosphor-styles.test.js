const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function readStyles() {
  const stylesPath = path.join(__dirname, "..", "styles.css");
  return fs.readFileSync(stylesPath, "utf8");
}

test("quiet phosphor theme defines dedicated accent tokens", () => {
  const styles = readStyles();

  assert.match(styles, /--color-phosphor-accent:/);
  assert.match(styles, /--color-phosphor-accent-strong:/);
  assert.match(styles, /--color-topbar-shell:/);
});

test("active navigation and focused terminals use quiet phosphor accents", () => {
  const styles = readStyles();

  assert.match(styles, /\.canvas-strip-item\.is-active\s*\{[\s\S]*background:\s*var\(--color-phosphor-accent\);/);
  assert.match(styles, /\.canvas-strip-item\.is-active\s*\{[\s\S]*border-color:\s*var\(--color-phosphor-accent-strong\);/);
  assert.match(styles, /\.terminal-node\.is-active,\s*\.terminal-node:focus-within\s*\{[\s\S]*border-color:\s*var\(--color-phosphor-accent-strong\);/);
});

test("topbar, board hints, and terminal cards adopt fluid dark-ink surfaces", () => {
  const styles = readStyles();

  assert.match(styles, /\.canvas-topbar\s*\{[\s\S]*background:\s*var\(--color-topbar-shell\);/);
  assert.match(styles, /\.board-hint-chip\s*\{[\s\S]*background:\s*var\(--color-chip-surface\);/);
  assert.match(styles, /\.terminal-node\s*\{[\s\S]*background:\s*var\(--color-terminal-card\);/);
});

test("drawer, inspector, and HUD surfaces share the quiet phosphor chrome language", () => {
  const styles = readStyles();

  assert.match(styles, /\.canvas-sidebar-panel\s*\{[\s\S]*border:\s*1px solid rgba\(186, 213, 221, 0\.08\);/);
  assert.match(styles, /\.file-inspector\s*\{[\s\S]*border:\s*1px solid rgba\(186, 213, 221, 0\.08\);/);
  assert.match(styles, /\.board-zoom-indicator\s*\{[\s\S]*background:\s*var\(--color-board-hud\);/);
  assert.match(styles, /\.board-fullscreen-exit\s*\{[\s\S]*border:\s*1px solid rgba\(186, 213, 221, 0\.1\);/);
});

test("workspace selection and chrome controls use restrained phosphor focus cues", () => {
  const styles = readStyles();

  assert.match(styles, /\.workspace-browser-entry\.is-selected\s*\{[\s\S]*background:\s*var\(--color-phosphor-accent\);/);
  assert.match(styles, /\.workspace-browser-entry\.is-selected\s*\{[\s\S]*border-color:\s*var\(--color-phosphor-accent-strong\);/);
  assert.match(styles, /\.panel-resize-handle:hover,\s*\.panel-resize-handle\.is-active\s*\{[\s\S]*border-color:\s*var\(--color-phosphor-accent-strong\);/);
  assert.match(styles, /\.canvas-switcher-trigger:hover,\s*\.canvas-switcher-trigger\.is-open\s*\{[\s\S]*border-color:\s*var\(--color-phosphor-accent-strong\);/);
});

test("topbar and terminal typography gain a calmer hierarchy and tighter spacing", () => {
  const styles = readStyles();

  assert.match(styles, /\.canvas-brand-name\s*\{[\s\S]*font-size:\s*1rem;/);
  assert.match(styles, /\.canvas-brand-tagline\s*\{[\s\S]*letter-spacing:\s*0\.12em;/);
  assert.match(styles, /\.canvas-strip-item\s*\{[\s\S]*font-size:\s*0\.8rem;/);
  assert.match(styles, /\.terminal-node-header\s*\{[\s\S]*padding:\s*0\.5rem 0\.6875rem;/);
  assert.match(styles, /\.terminal-node-title-input\s*\{[\s\S]*font-size:\s*0\.9rem;/);
  assert.match(styles, /\.terminal-node-title-group\s*\{[\s\S]*gap:\s*0;/);
});

test("board hints and sidebar utility text use more disciplined spacing", () => {
  const styles = readStyles();

  assert.match(styles, /\.board-hints\s*\{[\s\S]*gap:\s*0\.625rem;/);
  assert.match(styles, /\.board-hint-chip,\s*\.empty-state-copy\s*\{[\s\S]*letter-spacing:\s*0\.1em;/);
  assert.match(styles, /\.sidebar-section-header\s*\{[\s\S]*letter-spacing:\s*0\.14em;/);
  assert.match(styles, /\.canvas-secondary-button\s*\{[\s\S]*font-size:\s*0\.66rem;/);
});
