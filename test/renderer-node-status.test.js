const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  ATTENTION_STATES,
  deriveNodeStatus,
  deriveAttentionQueue,
  deriveFleetSummary,
  formatFleetSummary,
  isHandoffAttention,
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

test("waiting attention overrides declared lifecycle state", () => {
  assert.deepEqual(deriveNodeStatus({ attention: "waiting", agentState: "active" }), {
    state: "needs-input",
    label: "Needs input"
  });
  assert.deepEqual(deriveNodeStatus({ attention: "waiting", agentState: "idle", runtimeState: "waiting" }), {
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

test("stale and stopped remain distinct fleet states", () => {
  assert.equal(deriveNodeStatus({ attention: "stale", agentState: "active" }).state, "stale");
  assert.equal(deriveNodeStatus({ attention: "stopped", agentState: "active" }).state, "stopped");
});

test("agent state drives the primary status", () => {
  assert.equal(deriveNodeStatus({ agentState: "active" }).state, "working");
  assert.equal(deriveNodeStatus({ agentState: "finished" }).state, "done");
  assert.equal(deriveNodeStatus({ agentState: "failed" }).state, "error");
  assert.equal(deriveNodeStatus({ agentState: "idle" }).state, "idle");
  assert.equal(deriveNodeStatus({ agentState: "archived" }).state, "archived");
});

test("archived agents stay hidden even when stale runtime facts request attention", () => {
  const archivedWaiting = { id: "waiting", agentState: "archived", attention: "waiting" };
  const archivedFailed = { id: "failed", agentState: "archived", attention: "failed" };

  assert.equal(deriveNodeStatus(archivedWaiting).state, "archived");
  assert.equal(deriveNodeStatus(archivedFailed).state, "archived");
  assert.deepEqual(deriveAttentionQueue([archivedWaiting, archivedFailed]), []);
  assert.equal(deriveFleetSummary([archivedWaiting, archivedFailed]).total, 0);
});

test("canonical derived state drives terminal and navigator colors", () => {
  const styles = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");
  const renderer = fs.readFileSync(path.join(__dirname, "..", "renderer.js"), "utf8");

  assert.match(styles, /\[data-state="working"\] \.terminal-navigator-icon\s*\{[\s\S]*?var\(--color-status-pending\)/);
  assert.match(styles, /\.terminal-node\[data-state="working"\] \.terminal-node-lead-dot\s*\{[\s\S]*?var\(--color-status-pending\)/);
  assert.match(styles, /\.terminal-navigator-row\[data-agent-state="archived"\]\s*\{[\s\S]*?display:\s*none/);
  assert.match(styles, /\[data-state="needs-input"\] \.terminal-navigator-icon/);
  assert.match(renderer, /nodeRecord\.element\.dataset\.agentState = nodeRecord\.managedAgentState/);
  assert.match(renderer, /button\.dataset\.agentState = row\.agentState/);
});

test("fleet summary uses the canonical state and excludes archived agents", () => {
  const summary = deriveFleetSummary([
    { agentState: "active", runtimeState: "running" },
    { agentState: "active", attention: "stale" },
    { agentState: "idle", attention: "waiting" },
    { agentState: "failed" },
    { agentState: "finished" },
    { agentState: "idle" },
    { agentState: "archived" }
  ]);

  assert.deepEqual(summary, {
    total: 6,
    working: 1,
    needsInput: 1,
    errors: 1,
    idle: 1,
    done: 1,
    stale: 1,
    stopped: 0,
    exited: 0,
    live: 0
  });
  assert.equal(formatFleetSummary(summary), "1 working · 1 needs input · 1 failed · 1 idle · 1 done · 1 stale");
  assert.equal(formatFleetSummary(deriveFleetSummary([])), "No active agents");
});

test("fleet summary represents every counted terminal state", () => {
  const summary = deriveFleetSummary([
    { isExited: true, exitCode: 0 },
    {}
  ]);

  assert.equal(summary.total, 2);
  assert.equal(summary.exited, 1);
  assert.equal(summary.live, 1);
  assert.equal(formatFleetSummary(summary), "1 exited · 1 live");
  assert.equal(
    summary.working + summary.needsInput + summary.errors + summary.idle + summary.done
      + summary.stale + summary.stopped + summary.exited + summary.live,
    summary.total
  );
});

test("selecting a terminal does not change navigator row geometry", () => {
  const styles = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");

  assert.match(styles, /\.terminal-navigator-label\s*\{[\s\S]*?text-overflow:\s*ellipsis;[\s\S]*?white-space:\s*nowrap;/);
  assert.doesNotMatch(styles, /\.terminal-navigator-entry\.is-active \.terminal-navigator-label/);
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

test("attention queue puts finished waiting handoffs first", () => {
  const queue = deriveAttentionQueue([
    { id: "blocked", state: "needs-input", attention: "waiting", agentState: "idle" },
    { id: "handoff", state: "done", attention: "waiting", agentState: "finished" },
    { id: "error", state: "error", attention: "failed", agentState: "failed" }
  ]);

  assert.deepEqual(queue, ["handoff", "blocked", "error"]);
  assert.equal(isHandoffAttention({ attention: " WAITING ", agentState: "FINISHED" }), true);
  assert.equal(isHandoffAttention({ attention: "waiting", agentState: "idle" }), false);
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
