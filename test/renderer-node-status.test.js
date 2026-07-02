const test = require("node:test");
const assert = require("node:assert/strict");

const {
  ATTENTION_STATES,
  deriveNodeStatus,
  deriveAttentionQueue,
  extractLastMeaningfulLine,
  formatQuietDuration
} = require("../renderer_node_status.js");

test("exited node reports exited when the shell finished cleanly", () => {
  assert.deepEqual(deriveNodeStatus({ isExited: true, exitCode: 0 }), {
    state: "exited",
    label: "Exited"
  });
});

test("exited node reports error when the shell failed", () => {
  assert.deepEqual(deriveNodeStatus({ isExited: true, exitCode: 1 }), {
    state: "error",
    label: "Exited"
  });
});

test("attention waiting wins over an active agent state", () => {
  assert.deepEqual(deriveNodeStatus({ attention: "waiting", agentState: "active" }), {
    state: "needs-input",
    label: "Needs input"
  });
});

test("attention failed maps to error", () => {
  assert.equal(deriveNodeStatus({ attention: "failed" }).state, "error");
});

test("attention done maps to done", () => {
  assert.equal(deriveNodeStatus({ attention: "done" }).state, "done");
});

test("attention stale and stopped map to idle", () => {
  assert.equal(deriveNodeStatus({ attention: "stale" }).state, "idle");
  assert.equal(deriveNodeStatus({ attention: "stopped" }).state, "idle");
});

test("agent state drives status when attention is absent", () => {
  assert.equal(deriveNodeStatus({ agentState: "active" }).state, "working");
  assert.equal(deriveNodeStatus({ agentState: "finished" }).state, "done");
  assert.equal(deriveNodeStatus({ agentState: "failed" }).state, "error");
  assert.equal(deriveNodeStatus({ agentState: "idle" }).state, "idle");
  assert.equal(deriveNodeStatus({ agentState: "archived" }).state, "idle");
});

test("runtime state is the fallback when attention and agent state are absent", () => {
  assert.equal(deriveNodeStatus({ runtimeState: "waiting" }).state, "needs-input");
  assert.equal(deriveNodeStatus({ runtimeState: "running" }).state, "working");
  assert.equal(deriveNodeStatus({ runtimeState: "active" }).state, "working");
});

test("plain terminal with no agent facts is live", () => {
  assert.deepEqual(deriveNodeStatus({}), { state: "live", label: "Live" });
  assert.deepEqual(deriveNodeStatus(null), { state: "live", label: "Live" });
});

test("tokens are trimmed and case-insensitive", () => {
  assert.equal(deriveNodeStatus({ attention: "  WAITING " }).state, "needs-input");
});

test("attention queue lists needs-input before error, stable within groups", () => {
  const queue = deriveAttentionQueue([
    { id: "a", state: "error" },
    { id: "b", state: "needs-input" },
    { id: "c", state: "working" },
    { id: "d", state: "needs-input" },
    { id: "e", state: "error" }
  ]);

  assert.deepEqual(queue, ["b", "d", "a", "e"]);
});

test("attention queue ignores malformed input", () => {
  assert.deepEqual(deriveAttentionQueue(null), []);
  assert.deepEqual(deriveAttentionQueue([{ state: "needs-input" }, null]), []);
});

test("attention state list is exposed for consumers", () => {
  assert.deepEqual([...ATTENTION_STATES], ["needs-input", "error"]);
});

test("tail line picks the most recent meaningful line", () => {
  assert.equal(
    extractLastMeaningfulLine(["", "  ", "Running tests… 42/97", "older output"]),
    "Running tests… 42/97"
  );
});

test("tail line strips box drawing, block, and spinner chrome", () => {
  assert.equal(
    extractLastMeaningfulLine(["│ ⠋ Compiling module │", "previous"]),
    "Compiling module"
  );
  assert.equal(extractLastMeaningfulLine(["╭────────╮", "└──────┘", "real line here"]), "real line here");
});

test("tail line skips lines that are empty after cleaning", () => {
  assert.equal(extractLastMeaningfulLine(["▀▀▀", "⠙⠹⠸", ""]), null);
  assert.equal(extractLastMeaningfulLine([]), null);
  assert.equal(extractLastMeaningfulLine(null), null);
});

test("tail line truncates very long lines", () => {
  const long = "x".repeat(200);
  const result = extractLastMeaningfulLine([long]);
  assert.equal(result.length, 120);
  assert.ok(result.endsWith("…"));
});

test("quiet duration is null while output is fresh", () => {
  assert.equal(formatQuietDuration(0), null);
  assert.equal(formatQuietDuration(119999), null);
  assert.equal(formatQuietDuration(NaN), null);
});

test("quiet duration formats minutes, hours, and days", () => {
  assert.equal(formatQuietDuration(120000), "2m");
  assert.equal(formatQuietDuration(59 * 60000), "59m");
  assert.equal(formatQuietDuration(60 * 60000), "1h");
  assert.equal(formatQuietDuration(25 * 3600000), "1d");
});
