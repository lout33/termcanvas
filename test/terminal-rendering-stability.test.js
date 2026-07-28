const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function readSource(fileName) {
  return fs.readFileSync(path.join(__dirname, "..", fileName), "utf8");
}

test("terminal WebGL renderers stay within a conservative context budget", () => {
  const renderer = readSource("renderer.js");

  assert.match(renderer, /const MAX_TERMINAL_WEBGL_RENDERERS = 8;/);
  assert.match(renderer, /function getAttachedTerminalWebglRendererCount\(\) \{/);
  assert.match(
    renderer,
    /getAttachedTerminalWebglRendererCount\(\) >= MAX_TERMINAL_WEBGL_RENDERERS/
  );
  assert.match(renderer, /isWebglRendererDisabled: false,/);
});

test("a lost or failed WebGL context falls back without an attach loop", () => {
  const renderer = readSource("renderer.js");

  assert.match(
    renderer,
    /webglAddon\.onContextLoss\(\(\) => \{[\s\S]*nodeRecord\.isWebglRendererDisabled = true;[\s\S]*detachTerminalWebglRenderer\(nodeRecord\);[\s\S]*scheduleTerminalRefresh\(\[nodeRecord\]\);/
  );
  assert.match(
    renderer,
    /catch \(error\) \{[\s\S]*nodeRecord\.isWebglRendererDisabled = true;[\s\S]*webglAddon\?\.dispose\?\.\(\);[\s\S]*using DOM renderer/
  );
  assert.match(
    renderer,
    /nodeRecord\.fitAddon = fitAddon;[\s\S]*nodeRecord\.isWebglRendererDisabled = false;[\s\S]*terminalNodeMap\.set\(terminalId, nodeRecord\);/
  );
});

test("periodic tail updates do not resize terminals or rewrite quiet labels", () => {
  const renderer = readSource("renderer.js");
  const styles = readSource("styles.css");

  assert.match(
    styles,
    /\.terminal-node-tail\s*\{[\s\S]*flex:\s*0 0 1\.35rem;[\s\S]*height:\s*1\.35rem;/
  );
  assert.match(
    styles,
    /\.terminal-node-tail\[hidden\]\s*\{[\s\S]*display:\s*block;[\s\S]*visibility:\s*hidden;/
  );
  assert.match(
    renderer,
    /function updateNodeTailLine\(nodeRecord\) \{[\s\S]*nodeRecord\.tail\.textContent !== lastLine[\s\S]*nodeRecord\.tail\.textContent = lastLine;/
  );
  const updateTailSource = renderer.match(/function updateNodeTailLine\(nodeRecord\) \{[\s\S]*?\n\}/u)?.[0] ?? "";
  assert.doesNotMatch(updateTailSource, /formatQuietDuration/);
});

test("unchanged agent syncs skip graph redraw and session persistence", () => {
  const renderer = readSource("renderer.js");

  assert.match(renderer, /const didChangeCanvasGraph = canvasRecord\.agentProjectTag !== nextProjectTag/);
  assert.match(renderer, /if \(didChangeNodeSet \|\| didChangeCanvasGraph\) \{[\s\S]*scheduleCanvasEdgeRender\(\);/);
  assert.match(
    renderer,
    /if \(didChangeNodeSet \|\| didChangeCanvasGraph \|\| didChangeManagedState\) \{[\s\S]*scheduleAppSessionSave\(\);/
  );
});

test("Electron smoke checks read xterm buffers instead of renderer DOM", () => {
  const renderer = readSource("renderer.js");

  assert.match(renderer, /const getTerminalBufferText = \(nodeRecord\) => \{/);
  assert.match(renderer, /lines\.push\(line\.translateToString\(true\)\);/);
  assert.match(renderer, /firstTerminalText: getTerminalBufferText\(activeNodeRecord\),/);
  assert.doesNotMatch(renderer, /firstTerminalText: activeNodes\[0\]\?\.terminalMount\?\.textContent/);
});

test("Electron smoke uses focused-mode layout and resize checks before legacy canvas assertions", () => {
  const main = readSource("main.js");
  const renderer = readSource("renderer.js");
  const focusedCheckIndex = main.indexOf("if (snapshot.focusedTerminalMode === true)");
  const legacyMaximizeIndex = main.indexOf('logStep("toggle selected terminal maximize with Command+M")');

  assert.match(renderer, /focusedTerminalMode: FOCUSED_TERMINAL_MODE,/);
  assert.notEqual(focusedCheckIndex, -1);
  assert.ok(focusedCheckIndex < legacyMaximizeIndex);
  assert.match(main, /window\.dispatchEvent\(new Event\("resize"\)\);/);
  assert.match(main, /focusedSnapshot\?\.visibleNodeCount !== 1/);
});

test("agent reconciliation never resumes stopped runtimes", () => {
  const renderer = readSource("renderer.js");
  const rebindSource = renderer.match(
    /async function rebindManagedNodeToAgentSession\(nodeRecord, agentSnapshot\) \{[\s\S]*?\n\}\n\nasync function resumeManagedAgentRuntime/u
  )?.[0] ?? "";

  assert.match(renderer, /isAgentResumeInFlight: false,/);
  assert.match(rebindSource, /stopped agent remains stopped until the user presses Resume/);
  assert.doesNotMatch(rebindSource, /resumeManagedAgentRuntime\(/);
  assert.match(renderer, /async function reopenTerminalNode\(nodeRecord\) \{[\s\S]*await resumeManagedAgentRuntime\(/);
});
