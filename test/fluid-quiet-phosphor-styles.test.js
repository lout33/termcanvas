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

test("active navigation and focused terminals use the premium topbar emphasis", () => {
  const styles = readStyles();

  assert.match(styles, /\.canvas-strip-item\.is-active\s*\{[\s\S]*background:\s*rgba\(22, 29, 36, 0\.96\);/);
  assert.match(styles, /\.canvas-strip-item\.is-active\s*\{[\s\S]*border-color:\s*rgba\(143, 220, 255, 0\.34\);/);
  assert.match(styles, /\.terminal-strip-item\.is-active\s*\{[\s\S]*background:\s*rgba\(18, 26, 32, 0\.98\);/);
  assert.match(styles, /\.terminal-strip-item\.is-active\s*\{[\s\S]*color:\s*#dff4ff;/);
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
  assert.match(styles, /\.panel-resize-handle\s*\{[\s\S]*width:\s*0\.75rem;/);
  assert.match(styles, /\.panel-resize-handle\s*\{[\s\S]*background:\s*transparent;/);
  assert.match(styles, /\.panel-resize-handle::before\s*\{[\s\S]*width:\s*1px;/);
  assert.match(styles, /\.panel-resize-handle::before\s*\{[\s\S]*opacity:\s*0;/);
  assert.match(styles, /\.panel-resize-handle:hover::before,\s*\.panel-resize-handle:focus-visible::before,\s*\.panel-resize-handle\.is-active::before\s*\{[\s\S]*opacity:\s*1;/);
  assert.match(styles, /\.panel-resize-handle:hover::before,\s*\.panel-resize-handle:focus-visible::before,\s*\.panel-resize-handle\.is-active::before\s*\{[\s\S]*background:\s*var\(--color-phosphor-accent-strong\);/);
  assert.match(styles, /\.canvas-switcher-trigger:hover,\s*\.canvas-switcher-trigger\.is-open\s*\{[\s\S]*border-color:\s*var\(--color-phosphor-accent-strong\);/);
});

test("collapsed sidebar toggle lives in the topbar as a compact control", () => {
  const styles = readStyles();

  assert.match(styles, /\.sidebar-edge-handle\s*\{[\s\S]*position:\s*relative;/);
  assert.match(styles, /\.sidebar-edge-handle\s*\{[\s\S]*width:\s*2\.35rem;/);
  assert.match(styles, /\.sidebar-edge-handle\s*\{[\s\S]*height:\s*2\.35rem;/);
  assert.match(styles, /\.sidebar-edge-handle-lines\s*\{[\s\S]*width:\s*0\.875rem;/);
  assert.match(styles, /\.sidebar-edge-handle-lines\s*\{[\s\S]*height:\s*2px;/);
  assert.match(styles, /\.sidebar-edge-handle-lines::before,\s*\.sidebar-edge-handle-lines::after\s*\{[\s\S]*height:\s*2px;/);
  assert.match(styles, /\.sidebar-edge-handle\[aria-pressed="true"\] \.sidebar-edge-handle-lines\s*\{[^}]*background:\s*transparent;/);
  assert.match(styles, /\.sidebar-edge-handle\[aria-pressed="true"\] \.sidebar-edge-handle-lines::before\s*\{[^}]*rotate\(45deg\);/);
  assert.match(styles, /\.sidebar-edge-handle\[aria-pressed="true"\] \.sidebar-edge-handle-lines::after\s*\{[^}]*rotate\(-45deg\);/);
  assert.match(styles, /\.canvas-topbar\s*\{[^}]*z-index:\s*11;/);
  assert.match(styles, /\.app-shell:not\(\.is-sidebar-collapsed\) \.sidebar-edge-handle\s*\{[^}]*border-color:\s*var\(--color-phosphor-accent-strong\);/);
  assert.doesNotMatch(styles, /\.app-shell:not\(\.is-sidebar-collapsed\) \.sidebar-edge-handle\s*\{[^}]*visibility:\s*hidden;/);
  assert.doesNotMatch(styles, /\.app-shell:not\(\.is-sidebar-collapsed\) \.sidebar-edge-handle\s*\{[^}]*pointer-events:\s*none;/);
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

test("topbar rows use a clearer premium hierarchy with an unlabeled terminal strip", () => {
  const styles = readStyles();

  assert.match(styles, /\.canvas-topbar-shell\s*\{[\s\S]*grid-column:\s*1\s*\/\s*-1;/);
  assert.match(styles, /\.canvas-topbar-shell\s*\{[\s\S]*width:\s*100%;/);
  assert.match(styles, /\.canvas-topbar-shell\s*\{[\s\S]*border-radius:\s*1\.05rem;/);
  assert.match(styles, /\.canvas-topbar-primary-row\s*\{[\s\S]*min-height:\s*3\.2rem;/);
  assert.match(styles, /\.canvas-switcher-topbar-section\s*\{[\s\S]*border-radius:\s*0\.85rem;/);
  assert.match(styles, /\.terminal-strip-topbar-section\s*\{[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\);/);
  assert.match(styles, /\.terminal-strip-shell\s*\{[\s\S]*background:\s*rgba\(8, 11, 15, 0\.34\);/);
  assert.match(styles, /\.terminal-strip-item\.is-active\s*\{[\s\S]*background:\s*rgba\(18, 26, 32, 0\.98\);/);
});

test("inactive topbar controls use darker charcoal surfaces", () => {
  const styles = readStyles();

  assert.match(styles, /\.canvas-topbar-action,[\s\S]*rgba\(7, 9, 12, 0\.78\);/);
  assert.match(styles, /\.canvas-strip-item,[\s\S]*background:\s*rgba\(11, 14, 18, 0\.72\);/);
  assert.match(styles, /\.terminal-strip-item\s*\{[\s\S]*background:\s*rgba\(10, 13, 17, 0\.76\);/);
});

test("board hints and sidebar utility text use more disciplined spacing", () => {
  const styles = readStyles();

  assert.match(styles, /\.board-hints\s*\{[\s\S]*gap:\s*0\.625rem;/);
  assert.match(styles, /\.board-hint-chip,\s*\.empty-state-copy\s*\{[\s\S]*letter-spacing:\s*0\.1em;/);
  assert.match(styles, /\.sidebar-section-header\s*\{[\s\S]*letter-spacing:\s*0\.14em;/);
  assert.match(styles, /\.canvas-secondary-button\s*\{[\s\S]*font-size:\s*0\.66rem;/);
});
