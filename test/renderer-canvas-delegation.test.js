const test = require("node:test");
const assert = require("node:assert/strict");

const { deriveCanvasDelegationEdges } = require("../renderer_canvas_delegation.js");

test("links each worker to its commander by parent_agent name", () => {
  const edges = deriveCanvasDelegationEdges([
    { id: "n1", agentName: "commander", isManager: true, projectTag: "proj" },
    { id: "n2", agentName: "worker-a", parentAgent: "commander", projectTag: "proj" },
    { id: "n3", agentName: "worker-b", parentAgent: "commander", projectTag: "proj" }
  ]);

  assert.deepEqual(edges, [
    { fromId: "n1", toId: "n2" },
    { fromId: "n1", toId: "n3" }
  ]);
});

test("falls back to commander_agent when parent_agent is empty", () => {
  const edges = deriveCanvasDelegationEdges([
    { id: "c", agentName: "boss", isManager: true, projectTag: "proj" },
    { id: "w", agentName: "worker", parentAgent: "", commanderAgent: "boss", projectTag: "proj" }
  ]);

  assert.deepEqual(edges, [{ fromId: "c", toId: "w" }]);
});

test("ignores the commander itself, self-links, and unknown parents", () => {
  const edges = deriveCanvasDelegationEdges([
    { id: "c", agentName: "boss", isManager: true, parentAgent: "", projectTag: "proj" },
    { id: "self", agentName: "loop", parentAgent: "loop", projectTag: "proj" },
    { id: "orphan", agentName: "ghost", parentAgent: "nobody", projectTag: "proj" }
  ]);

  assert.deepEqual(edges, []);
});

test("does not connect agents across different project tags", () => {
  const edges = deriveCanvasDelegationEdges([
    { id: "c", agentName: "boss", isManager: true, projectTag: "proj-a" },
    { id: "w", agentName: "worker", parentAgent: "boss", projectTag: "proj-b" }
  ]);

  assert.deepEqual(edges, []);
});

test("dedupes repeated parent->child pairs and tolerates junk input", () => {
  assert.deepEqual(deriveCanvasDelegationEdges(null), []);
  assert.deepEqual(deriveCanvasDelegationEdges(undefined), []);

  const edges = deriveCanvasDelegationEdges([
    { id: "c", agentName: "boss", isManager: true },
    { id: "w", agentName: "worker", parentAgent: "boss" },
    { id: "w", agentName: "worker", parentAgent: "boss" }
  ]);

  assert.deepEqual(edges, [{ fromId: "c", toId: "w" }]);
});
