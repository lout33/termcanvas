(function (root, factory) {
  const exports = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = exports;
  }

  if (root && typeof root === "object") {
    root.noteCanvasRendererCanvasDelegation = exports;

    if (root.window && typeof root.window === "object") {
      root.window.noteCanvasRendererCanvasDelegation = exports;
    }
  }
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  function normalizeName(value) {
    return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
  }

  function normalizeTag(value) {
    return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
  }

  function undirectedKey(fromId, toId) {
    const left = String(fromId);
    const right = String(toId);
    return left < right ? `${left}<->${right}` : `${right}<->${left}`;
  }

  // Given canvas node descriptors carrying agentmux awareness, derive the
  // delegation edges the canvas should draw. The topology is a graph: stored
  // agentmux edges ({ from, to, kind } by agent name) are the source of truth,
  // unioned with the legacy parent_agent derivation so agents that predate the
  // edges table keep their lines. Deduped as undirected pairs.
  //
  // Each descriptor: { id, agentName, parentAgent, projectTag }
  // Returns: [{ fromId, toId, kind }] with self-links excluded.
  function deriveCanvasDelegationEdges(nodes, storedEdges = []) {
    if (!Array.isArray(nodes)) {
      return [];
    }

    const nodeByAgentName = new Map();

    for (const node of nodes) {
      const agentName = normalizeName(node?.agentName);

      if (agentName !== null && !nodeByAgentName.has(agentName)) {
        nodeByAgentName.set(agentName, node);
      }
    }

    const edges = [];
    const seen = new Set();

    function pushEdge(fromNode, toNode, kind) {
      if (fromNode == null || toNode == null || fromNode.id == null || toNode.id == null || fromNode.id === toNode.id) {
        return;
      }

      const fromTag = normalizeTag(fromNode?.projectTag);
      const toTag = normalizeTag(toNode?.projectTag);

      if (fromTag !== null && toTag !== null && fromTag !== toTag) {
        return;
      }

      const key = undirectedKey(fromNode.id, toNode.id);

      if (seen.has(key)) {
        return;
      }

      seen.add(key);
      edges.push({ fromId: fromNode.id, toId: toNode.id, kind });
    }

    if (Array.isArray(storedEdges)) {
      for (const storedEdge of storedEdges) {
        const fromName = normalizeName(storedEdge?.from);
        const toName = normalizeName(storedEdge?.to);

        if (fromName === null || toName === null || fromName === toName) {
          continue;
        }

        const kind = normalizeName(storedEdge?.kind) ?? "link";
        pushEdge(nodeByAgentName.get(fromName), nodeByAgentName.get(toName), kind);
      }
    }

    for (const node of nodes) {
      const ownName = normalizeName(node?.agentName);
      const parentName = normalizeName(node?.parentAgent);

      if (parentName === null || parentName === ownName) {
        continue;
      }

      pushEdge(nodeByAgentName.get(parentName), node, "spawn");
    }

    return edges;
  }

  return {
    deriveCanvasDelegationEdges
  };
});
