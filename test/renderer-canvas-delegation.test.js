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
    { fromId: "n1", toId: "n2", kind: "spawn" },
    { fromId: "n1", toId: "n3", kind: "spawn" }
  ]);
});

test("links grandchildren to worker parents in deeper delegation trees", () => {
  const edges = deriveCanvasDelegationEdges([
    { id: "c", agentName: "commander", isManager: true, projectTag: "proj" },
    { id: "w", agentName: "worker", parentAgent: "commander", projectTag: "proj" },
    { id: "g", agentName: "grandchild", parentAgent: "worker", projectTag: "proj" }
  ]);

  assert.deepEqual(edges, [
    { fromId: "c", toId: "w", kind: "spawn" },
    { fromId: "w", toId: "g", kind: "spawn" }
  ]);
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

  assert.deepEqual(edges, [{ fromId: "c", toId: "w", kind: "spawn" }]);
});

test("draws stored graph edges between arbitrary peers", () => {
  const edges = deriveCanvasDelegationEdges(
    [
      { id: "a", agentName: "worker-a", parentAgent: "boss", projectTag: "proj" },
      { id: "b", agentName: "worker-b", parentAgent: "boss", projectTag: "proj" },
      { id: "c", agentName: "boss", isManager: true, projectTag: "proj" }
    ],
    [
      { from: "worker-a", to: "worker-b", kind: "link" },
      { from: "boss", to: "worker-a", kind: "spawn" }
    ]
  );

  assert.deepEqual(edges, [
    { fromId: "a", toId: "b", kind: "link" },
    { fromId: "c", toId: "a", kind: "spawn" },
    { fromId: "c", toId: "b", kind: "spawn" }
  ]);
});

test("dedupes stored edges against derived parent edges as undirected pairs", () => {
  const edges = deriveCanvasDelegationEdges(
    [
      { id: "c", agentName: "boss", isManager: true, projectTag: "proj" },
      { id: "w", agentName: "worker", parentAgent: "boss", projectTag: "proj" }
    ],
    [
      { from: "boss", to: "worker", kind: "spawn" },
      { from: "worker", to: "boss", kind: "link" }
    ]
  );

  assert.deepEqual(edges, [{ fromId: "c", toId: "w", kind: "spawn" }]);
});

test("ignores stored edges naming unknown agents, self-links, or cross-project nodes", () => {
  const edges = deriveCanvasDelegationEdges(
    [
      { id: "a", agentName: "worker-a", projectTag: "proj-a" },
      { id: "b", agentName: "worker-b", projectTag: "proj-b" }
    ],
    [
      { from: "worker-a", to: "ghost", kind: "link" },
      { from: "worker-a", to: "worker-a", kind: "link" },
      { from: "worker-a", to: "worker-b", kind: "link" }
    ]
  );

  assert.deepEqual(edges, []);
});
