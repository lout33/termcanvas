const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function readRenderer() {
  const rendererPath = path.join(__dirname, "..", "renderer.js");
  return fs.readFileSync(rendererPath, "utf8");
}

test("live terminal headers show backend session subtitles", () => {
  const renderer = readRenderer();

  assert.match(
    renderer,
    /function setNodeLiveState\(nodeRecord, shellName, backend, tmuxSessionName, sessionKey\) \{[\s\S]*syncTerminalMeta\(nodeRecord\);/
  );
  assert.match(renderer, /tmux: \$\{nodeRecord\.tmuxSessionName \?\? `termcanvas-\$\{nodeRecord\.sessionKey\}`\}/);
  assert.match(renderer, /pty: \$\{nodeRecord\.sessionKey\}/);
  assert.match(renderer, /function getNodeSessionIdentifier\(nodeRecord\)/);
  assert.match(renderer, /copySessionButton\.textContent = "ID"/);
});

test("terminal title editing only starts on double click", () => {
  const renderer = readRenderer();

  assert.match(renderer, /function setNodeTitleEditing\(nodeRecord, isEditing\) \{[\s\S]*titleInput\.readOnly = !isEditing;/);
  assert.match(renderer, /function startNodeTitleEditing\(nodeRecord\) \{/);
  assert.match(renderer, /titleInput\.readOnly = true;/);
  assert.match(renderer, /titleInput\.tabIndex = -1;/);
  assert.match(renderer, /elements\.titleGroup\.addEventListener\("dblclick", \(event\) => \{[\s\S]*startNodeTitleEditing\(nodeRecord\);/);
  assert.match(renderer, /elements\.titleInput\.addEventListener\("pointerdown", \(event\) => \{[\s\S]*event\.stopPropagation\(\);[\s\S]*if \(!nodeRecord\.isTitleEditing\) \{[\s\S]*event\.preventDefault\(\);/);
});

test("terminal strip items attach reorder handling for active canvas terminals", () => {
  const renderer = readRenderer();

  assert.match(renderer, /attachReorderableListItem\(stripItem, stripItem, \{/);
  assert.match(renderer, /onMove: async \(_nodeId, targetIndex\) => reorderTerminalNodeById\(itemView\.id, targetIndex\)/);
});

test("canvas close is guarded by the header menu instead of the vertical rail", () => {
  const renderer = readRenderer();

  assert.match(renderer, /const canvasActionsMenuButton = document\.getElementById\("canvas-actions-menu-button"\);/);
  assert.match(renderer, /const closeActiveCanvasButton = document\.getElementById\("close-active-canvas-button"\);/);
  assert.match(renderer, /function toggleCanvasActionsMenu\(\) \{/);
  assert.match(renderer, /function closeActiveCanvasWithConfirmation\(\) \{/);
  assert.match(renderer, /confirmWorkspaceAction\([\s\S]*"Close canvas"[\s\S]*"Close canvas"[\s\S]*\)/);
  assert.match(renderer, /canvasActionsMenuButton\?\.addEventListener\("click", \(\) => \{[\s\S]*toggleCanvasActionsMenu\(\);[\s\S]*\}\);/);
  assert.match(renderer, /closeActiveCanvasButton\?\.addEventListener\("click", \(\) => \{[\s\S]*closeCanvasActionsMenu\(\);[\s\S]*closeActiveCanvasWithConfirmation\(\)/);
  assert.match(renderer, /closeActiveCanvasButton\?\.addEventListener\("click", \(\) => \{/);
  assert.doesNotMatch(renderer, /canvas-strip-delete/);
  assert.doesNotMatch(renderer, /void deleteCanvas\(canvasRecord\.id\);/);
});

test("managed agent snapshots reconcile managers before workers", () => {
  const renderer = readRenderer();

  assert.match(renderer, /function sortManagedAgentSnapshots\(agentSnapshots\) \{/);
  assert.match(renderer, /const leftRank = left\?\.is_project_manager === true \? 0 : 1;/);
  assert.match(renderer, /const rightRank = right\?\.is_project_manager === true \? 0 : 1;/);
  assert.match(renderer, /const sessions = sortManagedAgentSnapshots\(Array\.isArray\(snapshot\?\.sessions\) \? snapshot\.sessions : \[\]\);/);
});

test("managed agent labels use commander and worker roles", () => {
  const renderer = readRenderer();

  assert.match(renderer, /function normalizeManagedAgentRole\(value, isManager = false\) \{/);
  assert.match(renderer, /function getTerminalNodeRoleLabel\(nodeRecord\) \{/);
  assert.match(renderer, /return "commander";/);
  assert.match(renderer, /return "worker";/);
  assert.match(renderer, /return "Commander";/);
  assert.match(renderer, /return "Worker";/);
  assert.match(renderer, /roleBadge\.className = "terminal-node-role-badge";/);
  assert.match(renderer, /nodeRecord\.roleBadge\.textContent = roleLabel;/);
  assert.match(renderer, /nodeRecord\.roleBadge\.dataset\.role = roleLabel\.toLowerCase\(\);/);
  assert.match(renderer, /parent_agent: nodeRecord\.managedParentAgent,/);
  assert.match(renderer, /commander_agent: nodeRecord\.managedCommanderAgent,/);
});
