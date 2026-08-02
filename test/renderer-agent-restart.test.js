const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function readSource(fileName) {
  return fs.readFileSync(path.join(__dirname, "..", fileName), "utf8");
}

test("header renders a labeled Restart agent sessions button", () => {
  const html = readSource("index.html");

  assert.match(html, /class="canvas-panel-text-button"[^>]*id="restart-agent-sessions-button"/);
  assert.match(html, /Restart agent sessions/);
  assert.match(html, /aria-label="Restart agent sessions"/);
});

test("restart button is disabled without an active canvas and enabled with one", () => {
  const renderer = readSource("renderer.js");

  assert.match(renderer, /restartAgentSessionsButton\.disabled = activeCanvas === null/);
  assert.match(renderer, /restartAgentSessionsButton\.title = activeCanvas === null[\s\S]*Restart managed agent sessions across all canvases/);
});

test("restart button triggers the managed-agent batch restart path", () => {
  const renderer = readSource("renderer.js");

  assert.match(renderer, /restartAgentSessionsButton\?\.addEventListener\("click", \(\) => \{[\s\S]*restartAllManagedAgentSessions\(\)/);
  assert.match(renderer, /async function restartAllManagedAgentSessions\(\) \{/);
  assert.match(renderer, /async function restartManagedAgentRuntime\(nodeRecord, agentSnapshot\) \{/);
});

test("restart confirms once, skips unmanaged shells, and reports failures", () => {
  const renderer = readSource("renderer.js");

  assert.match(renderer, /confirmWorkspaceAction\(\s*"Restart agent sessions"/);
  assert.match(renderer, /managed agent runtime\$\{managedNodes\.length === 1 \? "" : "s"\} across all canvases/);
  assert.match(renderer, /Active turns will be interrupted/);
  assert.match(renderer, /collectManagedAgentRestartNodes\(\)[\s\S]*managedAgentName !== null[\s\S]*unmanagedShellCount \+= 1/);
  assert.match(renderer, /unmanaged shell terminal[\s\S]*left untouched/);
  assert.match(renderer, /Failed \(\$\{failed\.length\}\)/);
  assert.match(renderer, /requestWorkspaceActionDialog\(\{\s*kind: "confirm",\s*title: "Restart agent sessions",\s*message: reportLines\.join\("\\n"\)/);
});

test("safe restart refusals keep the still-running terminal live", () => {
  const renderer = readSource("renderer.js");
  const restartSource = renderer.match(
    /async function restartManagedAgentRuntime\(nodeRecord, agentSnapshot\) \{[\s\S]*?\n\}/u
  )?.[0] ?? "";

  assert.match(restartSource, /errorMessage\.includes\("The existing runtime was left running\."\)/);
  assert.match(restartSource, /setNodeLiveState\([\s\S]*nodeRecord\.tmuxSessionName/);
});

test("restart uses the non-destructive restartCanvasAgent bridge and preserves detached identity", () => {
  const renderer = readSource("renderer.js");
  const restartSource = renderer.match(
    /async function restartManagedAgentRuntime\(nodeRecord, agentSnapshot\) \{[\s\S]*?\n\}/u
  )?.[0] ?? "";

  assert.match(restartSource, /window\.noteCanvas\.restartCanvasAgent\(\{[\s\S]*agentName: nodeRecord\.managedAgentName,[\s\S]*projectTag/);
  assert.match(restartSource, /releaseTerminalSession\(nodeRecord, \{\s*shouldDestroySession: false,\s*retainDetachedIdentity: true\s*\}/);
  assert.match(restartSource, /bindTerminalSession\(nodeRecord, \{ shouldFocus: false \}\)/);
});

test("agent sync is suspended while a batch restart is in flight", () => {
  const renderer = readSource("renderer.js");

  assert.match(renderer, /let managedAgentRestartInFlightCount = 0;/);
  assert.match(renderer, /managedAgentRestartInFlightCount \+= 1;/);
  assert.match(renderer, /managedAgentRestartInFlightCount -= 1;/);
  assert.match(renderer, /managedAgentCloseInFlightCount === 0[\s\S]*managedAgentRestartInFlightCount === 0/);
  assert.match(renderer, /isCanvasAgentSyncInFlight \|\| managedAgentCloseInFlightCount > 0 \|\| managedAgentRestartInFlightCount > 0/);
});

test("restart wiring never reaches the managed-node close/delete subtree path", () => {
  const renderer = readSource("renderer.js");
  const restartSource = renderer.match(
    /async function restartManagedAgentRuntime\(nodeRecord, agentSnapshot\) \{[\s\S]*?\n\}/u
  )?.[0] ?? "";
  const batchSource = renderer.match(
    /async function restartAllManagedAgentSessions\(\) \{[\s\S]*?\n\}/u
  )?.[0] ?? "";

  assert.doesNotMatch(restartSource, /closeManagedAgentSubtree/);
  assert.doesNotMatch(restartSource, /closeTerminalNode/);
  assert.doesNotMatch(restartSource, /deleteCanvasAgent/);
  assert.doesNotMatch(batchSource, /closeManagedAgentSubtree/);
  assert.doesNotMatch(batchSource, /closeTerminalNode/);
});
