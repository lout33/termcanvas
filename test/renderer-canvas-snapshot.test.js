const test = require("node:test");
const assert = require("node:assert/strict");

const { deriveCanvasSnapshot } = require("../renderer_canvas_snapshot.js");

test("snapshot carries canvas identity and terminal facts", () => {
  const snapshot = deriveCanvasSnapshot(
    { canvasName: "life4", projectTag: "life4-tag", workspaceRootPath: "/tmp/life4" },
    [
      {
        title: "commander",
        agentName: "commander",
        role: "manager",
          parentAgent: null,
        state: "working",
        attention: null,
        tailLine: "Delegating tasks",
        quiet: null,
        tmuxSession: "agentmux-commander",
        cwd: "/tmp/life4",
        isExited: false
      },
      {
        title: "worker-auth",
        agentName: "worker-auth",
        role: "worker",
          parentAgent: "commander",
        state: "needs-input",
        attention: "waiting",
        tailLine: "Continue? (y/n)",
        quiet: "4m",
        tmuxSession: "agentmux-worker-auth",
        cwd: "/tmp/life4",
        isExited: false
      }
    ],
    "2026-07-01T12:00:00.000Z"
  );

  assert.equal(snapshot.version, 1);
  assert.equal(snapshot.generated_at, "2026-07-01T12:00:00.000Z");
  assert.deepEqual(snapshot.canvas, { name: "life4", project: "life4-tag", workspace_root: "/tmp/life4" });
  assert.equal(snapshot.terminals.length, 2);
  assert.equal(snapshot.terminals[1].parent_agent, "commander");
  assert.equal(snapshot.terminals[1].last_output, "Continue? (y/n)");
  assert.equal(snapshot.terminals[1].quiet, "4m");
});

test("snapshot normalizes empty and missing fields to null", () => {
  const snapshot = deriveCanvasSnapshot({}, [{ title: "  ", state: "" }], null);

  assert.deepEqual(snapshot.canvas, { name: null, project: null, workspace_root: null });
  assert.equal(snapshot.generated_at, null);
  assert.equal(snapshot.terminals[0].title, null);
  assert.equal(snapshot.terminals[0].state, "unknown");
  assert.equal(snapshot.terminals[0].agent_name, null);
});

test("snapshot tolerates malformed node lists", () => {
  assert.deepEqual(deriveCanvasSnapshot(null, null, null).terminals, []);
  assert.deepEqual(deriveCanvasSnapshot(null, [null, undefined], null).terminals, []);
});
