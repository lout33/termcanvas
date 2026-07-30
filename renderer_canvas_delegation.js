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

  function sortCanvasAgentSnapshotsForPlacement(agentSnapshots) {
    if (!Array.isArray(agentSnapshots)) {
      return [];
    }

    const snapshots = [...agentSnapshots].sort((left, right) => {
      const leftName = normalizeName(left?.name) ?? "";
      const rightName = normalizeName(right?.name) ?? "";
      return leftName.localeCompare(rightName);
    });
    const snapshotByName = new Map();

    for (const snapshot of snapshots) {
      const name = normalizeName(snapshot?.name);

      if (name !== null && !snapshotByName.has(name)) {
        snapshotByName.set(name, snapshot);
      }
    }

    const orderedSnapshots = [];
    const visited = new Set();
    const visiting = new Set();

    function visit(snapshot) {
      if (visited.has(snapshot)) {
        return;
      }

      if (visiting.has(snapshot)) {
        return;
      }

      visiting.add(snapshot);
      const parentName = normalizeName(snapshot?.parent_agent);
      const parentSnapshot = parentName === null ? null : snapshotByName.get(parentName) ?? null;

      if (parentSnapshot !== null && parentSnapshot !== snapshot) {
        visit(parentSnapshot);
      }

      visiting.delete(snapshot);
      visited.add(snapshot);
      orderedSnapshots.push(snapshot);
    }

    snapshots.forEach(visit);
    return orderedSnapshots;
  }

  function getManagedAgentName(nodeRecord) {
    return normalizeName(nodeRecord?.managedAgentName ?? nodeRecord?.agentName);
  }

  function getManagedParentAgentName(nodeRecord) {
    return normalizeName(nodeRecord?.managedParentAgent ?? nodeRecord?.parentAgent);
  }

  function deriveManagedAgentCloseOrder(nodes, rootAgentName) {
    const rootName = normalizeName(rootAgentName);

    if (!Array.isArray(nodes) || rootName === null) {
      return [];
    }

    const nodeByAgentName = new Map();
    const nodeBySessionKey = new Map();

    for (const nodeRecord of nodes) {
      const agentName = getManagedAgentName(nodeRecord);

      if (agentName !== null && nodeRecord?.isRemoved !== true && !nodeByAgentName.has(agentName)) {
        nodeByAgentName.set(agentName, nodeRecord);
      }
      if (typeof nodeRecord?.sessionKey === "string" && nodeRecord.sessionKey.length > 0) {
        nodeBySessionKey.set(nodeRecord.sessionKey, nodeRecord);
      }
    }

    if (!nodeByAgentName.has(rootName)) {
      return [];
    }

    const childrenByParentName = new Map();

    for (const [agentName, nodeRecord] of nodeByAgentName) {
      const hasUserParent = Object.prototype.hasOwnProperty.call(nodeRecord, "userParentSessionKey");
      const arrangedParent = hasUserParent ? nodeBySessionKey.get(nodeRecord.userParentSessionKey) : null;
      const parentName = hasUserParent ? getManagedAgentName(arrangedParent) : getManagedParentAgentName(nodeRecord);

      if (parentName === null || parentName === agentName) {
        continue;
      }

      const children = childrenByParentName.get(parentName) ?? [];
      children.push(agentName);
      childrenByParentName.set(parentName, children);
    }

    const closeOrder = [];
    const visited = new Set();
    const visiting = new Set();

    function visit(agentName) {
      if (visited.has(agentName) || visiting.has(agentName)) {
        return;
      }

      const nodeRecord = nodeByAgentName.get(agentName);

      if (nodeRecord === undefined) {
        return;
      }

      visiting.add(agentName);
      (childrenByParentName.get(agentName) ?? []).forEach(visit);
      visiting.delete(agentName);
      visited.add(agentName);
      closeOrder.push(nodeRecord);
    }

    visit(rootName);
    return closeOrder;
  }

  async function closeManagedAgentSubtree(options = {}) {
    const closeOrder = deriveManagedAgentCloseOrder(options.nodes, options.rootAgentName);
    const descendantCount = Math.max(0, closeOrder.length - 1);
    const confirmDescendantClose = typeof options.confirmDescendantClose === "function"
      ? options.confirmDescendantClose
      : async () => false;
    const onCloseConfirmed = typeof options.onCloseConfirmed === "function" ? options.onCloseConfirmed : null;
    const deleteAgent = typeof options.deleteAgent === "function" ? options.deleteAgent : null;
    const destroyNode = typeof options.destroyNode === "function" ? options.destroyNode : null;

    if (closeOrder.length === 0 || deleteAgent === null || destroyNode === null) {
      return { didClose: false, descendantCount, closeOrder };
    }

    if (descendantCount > 0 && await confirmDescendantClose(descendantCount, closeOrder) !== true) {
      return { didClose: false, descendantCount, closeOrder };
    }

    if (onCloseConfirmed !== null) {
      await onCloseConfirmed(closeOrder);
    }

    for (const nodeRecord of closeOrder) {
      await deleteAgent(nodeRecord);
      await destroyNode(nodeRecord);
    }

    return { didClose: true, descendantCount, closeOrder };
  }

  function findHorizontalCanvasNodePlacement(preferredRect, occupiedRects, gap = 72) {
    const width = Number.isFinite(preferredRect?.width) && preferredRect.width > 0 ? preferredRect.width : 1;
    const height = Number.isFinite(preferredRect?.height) && preferredRect.height > 0 ? preferredRect.height : 1;
    const y = Number.isFinite(preferredRect?.y) ? preferredRect.y : 0;
    const preferredX = Number.isFinite(preferredRect?.x) ? preferredRect.x : 0;
    const safeGap = Number.isFinite(gap) && gap >= 0 ? gap : 0;
    const rectangles = Array.isArray(occupiedRects)
      ? occupiedRects.filter((rect) => (
        Number.isFinite(rect?.x)
        && Number.isFinite(rect?.y)
        && Number.isFinite(rect?.width)
        && rect.width > 0
        && Number.isFinite(rect?.height)
        && rect.height > 0
      ))
      : [];
    const candidateTop = y - (height / 2);
    const candidateBottom = y + (height / 2);
    const rowRectangles = rectangles.filter((rect) => {
      const rectTop = rect.y - (rect.height / 2);
      const rectBottom = rect.y + (rect.height / 2);
      return candidateTop < rectBottom + safeGap && candidateBottom + safeGap > rectTop;
    });
    const candidateXs = new Set([preferredX]);

    // Candidate slots sit immediately beside the occupied cards in this row.
    // Sorting them by distance makes sibling rows grow from the parent's center
    // outward, instead of pushing every new child farther to the right.
    for (const rect of rowRectangles) {
      candidateXs.add(rect.x + (rect.width / 2) + safeGap + (width / 2));
      candidateXs.add(rect.x - (rect.width / 2) - safeGap - (width / 2));
    }

    const orderedXs = [...candidateXs].sort((left, right) => {
      const distanceDelta = Math.abs(left - preferredX) - Math.abs(right - preferredX);

      if (distanceDelta !== 0) {
        return distanceDelta;
      }

      return right - left;
    });
    const x = orderedXs.find((candidateX) => {
      const candidateLeft = candidateX - (width / 2);
      const candidateRight = candidateX + (width / 2);

      return !rowRectangles.some((rect) => {
        const rectLeft = rect.x - (rect.width / 2);
        const rectRight = rect.x + (rect.width / 2);
        return candidateLeft < rectRight + safeGap && candidateRight + safeGap > rectLeft;
      });
    }) ?? preferredX;

    return { x, y };
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
    closeManagedAgentSubtree,
    deriveCanvasDelegationEdges,
    deriveManagedAgentCloseOrder,
    sortCanvasAgentSnapshotsForPlacement,
    findHorizontalCanvasNodePlacement
  };
});
