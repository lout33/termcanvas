const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function readStyles() {
  const stylesPath = path.join(__dirname, "..", "styles.css");
  return fs.readFileSync(stylesPath, "utf8");
}

test("dark workbench theme defines charcoal surfaces and amber accent tokens", () => {
  const styles = readStyles();

  assert.match(styles, /--color-board:\s*#111318;/);
  assert.match(styles, /--color-board-deep:\s*#07090d;/);
  assert.match(styles, /--color-ink:\s*#f1eadb;/);
  assert.match(styles, /--color-phosphor-accent:/);
  assert.match(styles, /--color-phosphor-accent-strong:\s*rgba\(247, 204, 116, 0\.48\);/);
  assert.match(styles, /--color-topbar-shell:/);
});

test("active navigation and focused terminals use dark amber emphasis", () => {
  const styles = readStyles();

  assert.match(styles, /\.canvas-strip-item\.is-active\s*\{[\s\S]*background:\s*rgba\(230, 165, 39, 0\.22\);/);
  assert.match(styles, /\.canvas-strip-item\.is-active\s*\{[\s\S]*border-color:\s*rgba\(247, 204, 116, 0\.46\);/);
  assert.match(styles, /\.canvas-panel-pill\.is-active\s*\{[\s\S]*background:\s*rgba\(230, 165, 39, 0\.22\);/);
  assert.match(styles, /\.canvas-panel-pill\.is-active\s*\{[\s\S]*color:\s*rgba\(255, 232, 166, 0\.94\);/);
  assert.match(styles, /\.terminal-node\.is-active,\s*\.terminal-node:focus-within\s*\{[\s\S]*border-color:\s*var\(--color-phosphor-accent-strong\);/);
});

test("canvas header, board hints, and terminal cards adopt dark workbench surfaces", () => {
  const styles = readStyles();

  assert.match(styles, /\.canvas-panel-header\s*\{[\s\S]*background:\s*var\(--color-topbar-shell\);/);
  assert.match(styles, /\.board\s*\{[\s\S]*linear-gradient\(180deg, var\(--color-board\) 0%, #07090d 100%\);/);
  assert.match(styles, /\.board-hint-chip\s*\{[\s\S]*background:\s*var\(--color-chip-surface\);/);
  assert.match(styles, /\.terminal-node\s*\{[\s\S]*background:\s*var\(--color-terminal-card\);/);
});

test("terminal surfaces keep xterm glyph rendering crisp", () => {
  const styles = readStyles();

  assert.match(styles, /--color-terminal-text:\s*#f3ead7;/);
  assert.match(styles, /--terminal-font-size:\s*12;/);
  assert.match(styles, /--terminal-line-height:\s*1\.22;/);
  assert.match(styles, /\.terminal-node-terminal \.xterm\s*\{[\s\S]*font-variant-ligatures:\s*none;/);
  assert.match(styles, /\.terminal-node-terminal \.xterm\s*\{[\s\S]*-webkit-font-smoothing:\s*antialiased;/);
  assert.match(styles, /\.terminal-node-terminal \.xterm\s*\{[\s\S]*text-rendering:\s*auto;/);
  assert.match(styles, /\.terminal-node-terminal \.xterm\s*\{[\s\S]*color:\s*var\(--color-terminal-text\);/);
  assert.match(styles, /\.terminal-node-terminal\s*\{[\s\S]*overflow:\s*hidden;/);
  assert.match(styles, /\.terminal-node-terminal \.xterm-rows\s*\{[\s\S]*letter-spacing:\s*0;/);
});

test("drawer, inspector, and HUD surfaces share the dark chrome language", () => {
  const styles = readStyles();

  assert.match(styles, /\.canvas-sidebar-panel\s*\{[\s\S]*border-right:\s*1px solid var\(--color-sidebar-rule\);/);
  assert.match(styles, /\.canvas-sidebar-panel\s*\{[\s\S]*background:\s*linear-gradient\(180deg, #151820, #0b0d12\);/);
  assert.match(styles, /\.file-inspector\s*\{[\s\S]*border-left:\s*1px solid var\(--color-sidebar-rule\);/);
  assert.match(styles, /\.file-inspector\s*\{[\s\S]*background:\s*linear-gradient\(180deg, #151820, #090b0f\);/);
  assert.match(styles, /\.board-navigation\s*\{[\s\S]*background:\s*var\(--color-board-hud\);/);
  assert.match(styles, /\.board-nav-icon\s*\{[\s\S]*stroke:\s*currentColor;/);
  assert.match(styles, /\.board-nav-separator\s*\{[\s\S]*background:\s*rgba\(236, 220, 170, 0\.16\);/);
  assert.match(styles, /\.board-minimap\s*\{[\s\S]*display:\s*none;/);
  assert.match(styles, /\.board-minimap\s*\{[\s\S]*pointer-events:\s*none;/);
  assert.match(styles, /\.board\.has-maximized-node \.board-navigation,\s*\.board\.has-maximized-node \.board-minimap,[\s\S]*pointer-events:\s*none;/);
  assert.match(styles, /\.board-fullscreen-exit\s*\{[\s\S]*display:\s*none;/);
  assert.match(styles, /\.board\.has-maximized-node \.board-fullscreen-exit\s*\{[\s\S]*pointer-events:\s*none;/);
});

test("file inspector tabs use compact dark open-file chrome", () => {
  const styles = readStyles();

  assert.match(styles, /\.file-inspector-tabbar\s*\{[\s\S]*background:\s*linear-gradient\(180deg, #171a22, #111319\);/);
  assert.match(styles, /\.file-inspector-tabbar\s*\{[\s\S]*overflow-x:\s*auto;/);
  assert.match(styles, /\.file-inspector-tab\s*\{[\s\S]*border-radius:\s*var\(--radius-sm\) var\(--radius-sm\) 0 0;/);
  assert.match(styles, /\.file-inspector-tab\s*\{[\s\S]*max-width:\s*12\.5rem;/);
  assert.match(styles, /\.file-inspector-tab\.is-active\s*\{[\s\S]*border-color:\s*rgba\(247, 204, 116, 0\.46\);/);
  assert.match(styles, /\.file-inspector-tab\.is-active\s*\{[\s\S]*box-shadow:\s*inset 0 -2px 0 var\(--color-phosphor-accent-strong\);/);
  assert.match(styles, /\.file-inspector-tab-main::before\s*\{[\s\S]*width:\s*0\.62rem;/);
  assert.match(styles, /\.file-inspector-tab-label\s*\{[\s\S]*text-overflow:\s*ellipsis;/);
  assert.match(styles, /\.file-inspector-tab-close-icon\s*\{[\s\S]*stroke:\s*currentColor;/);
});

test("file inspector header exposes compact editor controls", () => {
  const styles = readStyles();

  assert.match(styles, /\.file-inspector-header\s*\{[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\) auto;/);
  assert.match(styles, /\.file-inspector-header\s*\{[\s\S]*padding:\s*0\.68rem 0\.72rem;/);
  assert.match(styles, /\.file-inspector-title\s*\{[\s\S]*font-size:\s*0\.92rem;/);
  assert.match(styles, /\.file-inspector-title\s*\{[\s\S]*text-overflow:\s*ellipsis;/);
  assert.match(styles, /\.file-inspector-path,[\s\S]*letter-spacing:\s*0;/);
  assert.match(styles, /\.file-inspector-actions\s*\{[\s\S]*flex-wrap:\s*nowrap;/);
  assert.match(styles, /\.file-inspector-action-group\s*\{[\s\S]*border-radius:\s*var\(--radius-sm\);/);
  assert.match(styles, /\.file-inspector-icon-button,[\s\S]*\.file-inspector-mode-button,[\s\S]*\.file-inspector-button\s*\{[\s\S]*min-height:\s*1\.62rem;/);
  assert.match(styles, /\.file-inspector-action-icon\s*\{[\s\S]*stroke:\s*currentColor;/);
  assert.match(styles, /\.file-inspector-mode-button\.is-active,[\s\S]*\.file-inspector-icon-button\.is-save:not\(:disabled\)\s*\{[\s\S]*background:\s*rgba\(230, 165, 39, 0\.18\);/);
  assert.match(styles, /\.file-inspector-icon-button\.is-close:hover:not\(:disabled\),[\s\S]*\.file-inspector-icon-button\.is-cancel:hover:not\(:disabled\)\s*\{[\s\S]*background:\s*var\(--color-sidebar-delete-hover\);/);
  assert.match(styles, /\.file-inspector-body\s*\{[\s\S]*padding:\s*0\.75rem;/);
  assert.match(styles, /\.file-inspector-markdown h1,[\s\S]*\.file-inspector-markdown h6\s*\{[\s\S]*letter-spacing:\s*0;/);
});

test("app shell docks explorer canvas and inspector as real grid columns", () => {
  const styles = readStyles();

  assert.match(styles, /\.app-shell\s*\{[\s\S]*display:\s*grid;/);
  assert.match(styles, /\.app-shell\s*\{[\s\S]*grid-template-columns:\s*var\(--rail-width\) var\(--sidebar-track-width\) minmax\(0, 1fr\) var\(--inspector-track-width\);/);
  assert.match(styles, /\.app-shell:not\(\.is-sidebar-collapsed\)\s*\{[\s\S]*--sidebar-track-width:\s*var\(--drawer-panel-rendered-width\);/);
  assert.match(styles, /\.app-shell\.has-file-inspector\s*\{[\s\S]*--inspector-track-width:\s*var\(--inspector-rendered-width\);/);
  assert.match(styles, /\.canvas-sidebar\s*\{[\s\S]*grid-column:\s*2;/);
  assert.match(styles, /\.workspace-shell\s*\{[\s\S]*grid-column:\s*3;/);
  assert.match(styles, /\.file-inspector\s*\{[\s\S]*grid-column:\s*4;/);
});

test("workspace selection and chrome controls use restrained amber focus cues", () => {
  const styles = readStyles();

  assert.match(styles, /\.workspace-browser-entry\.is-selected\s*\{[\s\S]*background:\s*rgba\(230, 165, 39, 0\.22\);/);
  assert.match(styles, /\.workspace-browser-entry\.is-selected\s*\{[\s\S]*border-color:\s*rgba\(247, 204, 116, 0\.34\);/);
  assert.match(styles, /\.sidebar-section-header-controls\s*\{[\s\S]*display:\s*inline-flex;/);
  assert.match(styles, /\.sidebar-section-search-action\.is-active\s*\{[\s\S]*background:\s*var\(--color-sidebar-panel-active\);/);
  assert.match(styles, /\.panel-resize-handle\s*\{[\s\S]*width:\s*0\.75rem;/);
  assert.match(styles, /\.panel-resize-handle\s*\{[\s\S]*background:\s*transparent;/);
  assert.match(styles, /\.panel-resize-handle::before\s*\{[\s\S]*width:\s*1px;/);
  assert.match(styles, /\.panel-resize-handle::before\s*\{[\s\S]*opacity:\s*0;/);
  assert.match(styles, /\.panel-resize-handle:hover::before,\s*\.panel-resize-handle:focus-visible::before,\s*\.panel-resize-handle\.is-active::before\s*\{[\s\S]*opacity:\s*1;/);
  assert.match(styles, /\.panel-resize-handle:hover::before,\s*\.panel-resize-handle:focus-visible::before,\s*\.panel-resize-handle\.is-active::before\s*\{[\s\S]*background:\s*var\(--color-phosphor-accent-strong\);/);
  assert.match(styles, /\.canvas-panel-icon-button:hover\s*\{[\s\S]*border-color:\s*var\(--color-sidebar-accent-strong\);/);
});

test("collapsed sidebar toggle lives in the merged header as a compact control", () => {
  const styles = readStyles();

  assert.match(styles, /\.sidebar-edge-handle\s*\{[\s\S]*position:\s*relative;/);
  assert.match(styles, /\.sidebar-edge-handle\s*\{[\s\S]*width:\s*2\.1rem;/);
  assert.match(styles, /\.sidebar-edge-handle\s*\{[\s\S]*height:\s*2\.1rem;/);
  assert.match(styles, /\.sidebar-edge-handle-lines\s*\{[\s\S]*width:\s*0\.875rem;/);
  assert.match(styles, /\.sidebar-edge-handle-lines\s*\{[\s\S]*height:\s*2px;/);
  assert.match(styles, /\.sidebar-edge-handle-lines::before,\s*\.sidebar-edge-handle-lines::after\s*\{[\s\S]*height:\s*2px;/);
  assert.match(styles, /\.sidebar-edge-handle\[aria-pressed="true"\] \.sidebar-edge-handle-lines\s*\{[^}]*background:\s*transparent;/);
  assert.match(styles, /\.sidebar-edge-handle\[aria-pressed="true"\] \.sidebar-edge-handle-lines::before\s*\{[^}]*rotate\(45deg\);/);
  assert.match(styles, /\.sidebar-edge-handle\[aria-pressed="true"\] \.sidebar-edge-handle-lines::after\s*\{[^}]*rotate\(-45deg\);/);
  assert.match(styles, /\.canvas-panel-header\s*\{[^}]*z-index:\s*11;/);
  assert.match(styles, /\.app-shell:not\(\.is-sidebar-collapsed\) \.sidebar-edge-handle\s*\{[^}]*border-color:\s*var\(--color-phosphor-accent-strong\);/);
  assert.doesNotMatch(styles, /\.app-shell:not\(\.is-sidebar-collapsed\) \.sidebar-edge-handle\s*\{[^}]*visibility:\s*hidden;/);
  assert.doesNotMatch(styles, /\.app-shell:not\(\.is-sidebar-collapsed\) \.sidebar-edge-handle\s*\{[^}]*pointer-events:\s*none;/);
});

test("header and terminal typography gain a calmer hierarchy and tighter spacing", () => {
  const styles = readStyles();

  assert.match(styles, /\.canvas-brand-name\s*\{[\s\S]*font-size:\s*1rem;/);
  assert.match(styles, /\.canvas-brand-tagline\s*\{[\s\S]*letter-spacing:\s*0\.12em;/);
  assert.match(styles, /\.canvas-strip-item\s*\{[\s\S]*font-size:\s*0\.8rem;/);
  assert.match(styles, /\.terminal-node-header\s*\{[\s\S]*min-height:\s*2\.05rem;/);
  assert.match(styles, /\.terminal-node-header\s*\{[\s\S]*padding:\s*0\.28rem 0\.46rem;/);
  assert.match(styles, /\.terminal-node-title-input\s*\{[\s\S]*font-size:\s*0\.82rem;/);
  assert.match(styles, /\.terminal-node-title-input\s*\{[\s\S]*cursor:\s*inherit;/);
  assert.match(styles, /\.terminal-node-title-input\s*\{[\s\S]*pointer-events:\s*none;/);
  assert.match(styles, /\.terminal-node-title-group\s*\{[\s\S]*gap:\s*0;/);
  assert.match(styles, /\.terminal-node-title-group\s*\{[\s\S]*flex:\s*1 1 9rem;/);
  assert.match(styles, /\.terminal-node-role-badge\s*\{[\s\S]*text-transform:\s*uppercase;/);
  assert.match(styles, /\.terminal-node-title-input\.is-editing\s*\{[\s\S]*cursor:\s*text;/);
  assert.match(styles, /\.terminal-node-title-input\.is-editing\s*\{[\s\S]*pointer-events:\s*auto;/);
  assert.match(styles, /\.terminal-node-menu-popover\s*\{[\s\S]*background:\s*rgba\(13, 15, 19, 0\.98\);/);
  assert.match(styles, /\.terminal-node-menu-item\s*\{[\s\S]*font-size:\s*0\.68rem;/);
  assert.match(styles, /\.terminal-node\.is-maximized \.terminal-node-maximize\s*\{[\s\S]*min-width:\s*7\.65rem;/);
  assert.match(styles, /\.terminal-node\.is-maximized \.terminal-node-maximize-label\s*\{[\s\S]*display:\s*inline;/);
});

test("vertical rail and merged canvas header keep navigation out of extra topbar rows", () => {
  const styles = readStyles();

  // Far-left vertical project rail owns the canvas switcher + file actions.
  assert.match(styles, /\.app-rail\s*\{[\s\S]*flex-direction:\s*column;/);
  assert.match(styles, /\.canvas-switcher-rail-section\s*\{[\s\S]*flex-direction:\s*column;/);
  assert.match(styles, /\.canvas-switcher-rail-section \.canvas-strip-main::before\s*\{[\s\S]*content:\s*attr\(data-rail-label\);/);
  assert.match(styles, /\.app-rail-file-actions\s*\{[\s\S]*flex-direction:\s*column;/);
  // One merged header row owns the drawer toggle, canvas identity, status, and menu.
  assert.doesNotMatch(styles, /\.canvas-topbar\s*\{/);
  assert.doesNotMatch(styles, /\.canvas-topbar-shell\s*\{/);
  assert.doesNotMatch(styles, /\.canvas-topbar-primary-row\s*\{/);
  assert.match(styles, /\.workspace-shell\s*\{[\s\S]*grid-template-rows:\s*auto minmax\(0, 1fr\);/);
  assert.match(styles, /\.canvas-panel-header\s*\{[\s\S]*justify-content:\s*space-between;/);
  assert.match(styles, /\.canvas-panel-context\s*\{[\s\S]*display:\s*flex;/);
  assert.match(styles, /\.canvas-breadcrumb\s*\{[\s\S]*text-transform:\s*uppercase;/);
  assert.match(styles, /\.canvas-panel-title\s*\{[\s\S]*font-family:\s*var\(--font-body\);/);
  assert.match(styles, /\.canvas-panel-pills\s*\{[\s\S]*display:\s*inline-flex;/);
  assert.match(styles, /\.canvas-panel-actions\s*\{[\s\S]*border-left:\s*1px solid rgba\(236, 220, 170, 0\.12\);/);
  assert.match(styles, /\.canvas-panel-menu\s*\{[\s\S]*position:\s*relative;/);
  assert.match(styles, /\.canvas-panel-menu-popover\s*\{[\s\S]*right:\s*0;/);
  assert.match(styles, /\.canvas-panel-menu-item\.canvas-panel-danger-action:hover:not\(:disabled\)\s*\{[\s\S]*background:\s*var\(--color-sidebar-delete-hover\);/);
  assert.doesNotMatch(styles, /\.canvas-strip-delete/u);
  assert.doesNotMatch(styles, /\.canvas-list-delete/u);
});

test("inactive app rail controls use dark app-frame surfaces", () => {
  const styles = readStyles();

  assert.match(styles, /\.app-rail-action,[\s\S]*background:\s*rgba\(24, 27, 34, 0\.82\);/);
  assert.match(styles, /\.canvas-strip-item\s*\{[\s\S]*background:\s*rgba\(24, 27, 34, 0\.72\);/);
  assert.match(styles, /\.canvas-panel-pill\s*\{[\s\S]*background:\s*rgba\(24, 27, 34, 0\.78\);/);
});

test("board hints and sidebar utility text use more disciplined spacing", () => {
  const styles = readStyles();

  assert.match(styles, /\.board-hints\s*\{[\s\S]*gap:\s*0\.625rem;/);
  assert.match(styles, /\.board-hint-chip,\s*\.empty-state-copy\s*\{[\s\S]*letter-spacing:\s*0\.1em;/);
  assert.match(styles, /\.sidebar-section-header\s*\{[\s\S]*letter-spacing:\s*0;/);
  assert.match(styles, /\.canvas-secondary-button\s*\{[\s\S]*font-size:\s*0\.66rem;/);
});

test("delegation edges are drawn as edge-anchored tree paths", () => {
  const styles = readStyles();

  assert.match(styles, /\.canvas-edge-path\s*\{[\s\S]*stroke:\s*rgba\(247, 204, 116, 0\.46\);/);
  assert.match(styles, /\.canvas-edge-path\s*\{[\s\S]*stroke-width:\s*1\.75;/);
  assert.match(styles, /\.canvas-edge-path\s*\{[\s\S]*stroke-linejoin:\s*round;/);
  assert.match(styles, /\.canvas-edge-arrow\s*\{[\s\S]*fill:\s*rgba\(247, 204, 116, 0\.46\);/);
});
