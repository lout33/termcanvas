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

  // Given canvas node descriptors carrying agentmux awareness, derive the
  // delegation edges (parent -> child) that the canvas should draw.
  //
  // Each descriptor: { id, agentName, parentAgent, commanderAgent, isManager, projectTag }
  // Returns: [{ fromId, toId }] with parent first, deduped, self-links excluded.
  //
  // agentmux reports each worker's parent by name, so commander -> worker ->
  // grandchild trees use the same edge derivation as the original 2-level case.
  function deriveCanvasDelegationEdges(nodes) {
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

    for (const node of nodes) {
      if (node?.isManager === true) {
        continue;
      }

      const ownName = normalizeName(node?.agentName);
      const parentName = normalizeName(node?.parentAgent) ?? normalizeName(node?.commanderAgent);

      if (parentName === null || parentName === ownName) {
        continue;
      }

      const parentNode = nodeByAgentName.get(parentName);

      if (parentNode == null || parentNode.id == null || node.id == null || parentNode.id === node.id) {
        continue;
      }

      const childTag = normalizeTag(node?.projectTag);
      const parentTag = normalizeTag(parentNode?.projectTag);

      if (childTag !== null && parentTag !== null && childTag !== parentTag) {
        continue;
      }

      const key = `${parentNode.id}->${node.id}`;

      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      edges.push({ fromId: parentNode.id, toId: node.id });
    }

    return edges;
  }

  return {
    deriveCanvasDelegationEdges
  };
});
