const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  createFocusedTerminalLifecycle,
  shouldShowNodeInFocusedMode,
  pickInitialSidebarViewForFocusedMode,
  pickFocusedNode
} = require("../renderer_focused_mode");

test("focused terminal lifecycle releases the old view before mounting the next", async () => {
  const first = { id: "first", mounted: true, isExited: false, isRemoved: false };
  const second = { id: "second", mounted: false, isExited: false, isRemoved: false };
  const events = [];
  const mountedNodes = () => [first, second].filter((nodeRecord) => nodeRecord.mounted);
  let maximumMountedCount = mountedNodes().length;
  const lifecycle = createFocusedTerminalLifecycle({
    getNodes: () => [first, second],
    isMounted: (nodeRecord) => nodeRecord.mounted,
    canAttach: (nodeRecord) => !nodeRecord.isExited && !nodeRecord.isRemoved,
    detach: async (nodeRecord) => {
      events.push(`detach:${nodeRecord.id}`);
      nodeRecord.mounted = false;
    },
    attach: async (nodeRecord) => {
      events.push(`attach:${nodeRecord.id}`);
      nodeRecord.mounted = true;
      maximumMountedCount = Math.max(maximumMountedCount, mountedNodes().length);
    },
    focus: (nodeRecord) => {
      events.push(`focus:${nodeRecord.id}`);
    }
  });

  await lifecycle.request(second);

  assert.deepEqual(events, ["detach:first", "attach:second", "focus:second"]);
  assert.equal(maximumMountedCount, 1);
  assert.deepEqual(mountedNodes(), [second]);
});

test("focused terminal lifecycle coalesces rapid focus changes to the latest node", async () => {
  const first = { id: "first", mounted: true, isExited: false, isRemoved: false };
  const second = { id: "second", mounted: false, isExited: false, isRemoved: false };
  const third = { id: "third", mounted: false, isExited: false, isRemoved: false };
  const events = [];
  const lifecycle = createFocusedTerminalLifecycle({
    getNodes: () => [first, second, third],
    isMounted: (nodeRecord) => nodeRecord.mounted,
    canAttach: (nodeRecord) => !nodeRecord.isExited && !nodeRecord.isRemoved,
    detach: async (nodeRecord) => {
      events.push(`detach:${nodeRecord.id}`);
      nodeRecord.mounted = false;
    },
    attach: async (nodeRecord) => {
      events.push(`attach:${nodeRecord.id}`);
      nodeRecord.mounted = true;
    },
    focus: (nodeRecord) => {
      events.push(`focus:${nodeRecord.id}`);
    }
  });

  const secondRequest = lifecycle.request(second);
  const thirdRequest = lifecycle.request(third);
  await Promise.all([secondRequest, thirdRequest]);

  assert.deepEqual(events, ["detach:first", "attach:third", "focus:third", "focus:third"]);
  assert.equal(second.mounted, false);
  assert.equal(third.mounted, true);
});

test("focused terminal lifecycle leaves exited nodes detached", async () => {
  const live = { id: "live", mounted: true, isExited: false, isRemoved: false };
  const exited = { id: "exited", mounted: false, isExited: true, isRemoved: false };
  let attachCount = 0;
  const lifecycle = createFocusedTerminalLifecycle({
    getNodes: () => [live, exited],
    isMounted: (nodeRecord) => nodeRecord.mounted,
    canAttach: (nodeRecord) => !nodeRecord.isExited && !nodeRecord.isRemoved,
    detach: async (nodeRecord) => {
      nodeRecord.mounted = false;
    },
    attach: async () => {
      attachCount += 1;
    }
  });

  await lifecycle.request(exited);

  assert.equal(live.mounted, false);
  assert.equal(attachCount, 0);
});

test("focused mode shows only the selected live node", () => {
  const selected = { id: "selected", isRemoved: false };
  const other = { id: "other", isRemoved: false };

  assert.equal(shouldShowNodeInFocusedMode({ nodeRecord: selected, activeNodeRecord: selected }), true);
  assert.equal(shouldShowNodeInFocusedMode({ nodeRecord: other, activeNodeRecord: selected }), false);
  assert.equal(shouldShowNodeInFocusedMode({ nodeRecord: selected, activeNodeRecord: null }), false);
});

test("focused mode never reveals a removed node", () => {
  const removed = { id: "removed", isRemoved: true };

  assert.equal(shouldShowNodeInFocusedMode({ nodeRecord: removed, activeNodeRecord: removed }), false);
});

test("focused mode hides archived agents and never restores focus to them", () => {
  const archived = { sessionKey: "archived", isRemoved: false, isExited: false, managedAgentState: "archived" };
  const active = { sessionKey: "active", isRemoved: false, isExited: false, managedAgentState: "active" };

  assert.equal(shouldShowNodeInFocusedMode({ nodeRecord: archived, activeNodeRecord: archived }), false);
  assert.equal(pickFocusedNode([archived, active], "archived"), active);
});

test("focused mode uses the terminal tree whenever a canvas exists", () => {
  assert.equal(pickInitialSidebarViewForFocusedMode(null), "explorer");
  assert.equal(pickInitialSidebarViewForFocusedMode({ nodes: [] }), "terminals");
  assert.equal(pickInitialSidebarViewForFocusedMode({ nodes: [{ id: 1 }] }), "terminals");
});

test("focused mode restores the preferred terminal and falls back to a live one", () => {
  const exited = { sessionKey: "exited", isExited: true, isRemoved: false };
  const live = { sessionKey: "live", isExited: false, isRemoved: false };
  const removed = { sessionKey: "removed", isExited: false, isRemoved: true };

  assert.equal(pickFocusedNode([exited, live, removed], "exited"), exited);
  assert.equal(pickFocusedNode([exited, live, removed], "missing"), live);
  assert.equal(pickFocusedNode([removed], "removed"), null);
});

test("focused mode uses the main workspace for readable file previews", () => {
  const styles = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");

  assert.match(styles, /body\.is-focused-terminal-mode \.app-shell\.has-file-inspector\s*\{[\s\S]*?--inspector-track-width:\s*0rem;/);
  assert.match(styles, /body\.is-focused-terminal-mode \.file-inspector\s*\{[\s\S]*?grid-column:\s*3;/);
  assert.match(styles, /body\.is-focused-terminal-mode \.app-shell\.has-file-inspector \.workspace-shell\s*\{[\s\S]*?visibility:\s*hidden;/);
  assert.match(styles, /body\.is-focused-terminal-mode \.inspector-resize-handle\s*\{[\s\S]*?display:\s*none;/);
  assert.match(styles, /body\.is-focused-terminal-mode \.file-inspector-markdown\s*\{[\s\S]*?max-width:\s*72ch;[\s\S]*?font-size:\s*clamp\(/);
  assert.match(styles, /body\.is-focused-terminal-mode \.file-inspector-code-editor \.cm-editor,[\s\S]*?font-size:\s*0\.95rem !important;/);
});

test("focused file reading uses a constrained, overflow-safe document measure", () => {
  const styles = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");

  assert.match(styles, /body\.is-focused-terminal-mode \.file-inspector-markdown\s*\{[\s\S]*?max-width:\s*72ch;[\s\S]*?background:\s*transparent;[\s\S]*?overflow-wrap:\s*anywhere;/);
  assert.match(styles, /body\.is-focused-terminal-mode \.file-inspector-markdown-editor,[\s\S]*?width:\s*min\(100%, 78ch\);/);
  assert.match(styles, /body\.is-focused-terminal-mode \.file-inspector-code-editor\.is-prose \.cm-gutters\s*\{[\s\S]*?display:\s*none;/);
  assert.match(styles, /body\.is-focused-terminal-mode \.file-inspector-markdown pre\s*\{[\s\S]*?overflow-wrap:\s*normal;/);
});
