(function (root, factory) {
  const exports = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = exports;
  }

  if (root && typeof root === "object") {
    root.noteCanvasRendererCanvasSwitcher = exports;

    if (root.window && typeof root.window === "object") {
      root.window.noteCanvasRendererCanvasSwitcher = exports;
    }
  }
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  function getTerminalSummary(count) {
    const terminalCount = Number.isFinite(count) ? Math.max(0, Math.trunc(count)) : 0;
    return `${terminalCount} ${terminalCount === 1 ? "terminal" : "terminals"}`;
  }

  function normalizeCanvasForSwitcher(canvasRecord, activeCanvasId, activeCanvasRenameId, canDelete) {
    const nodeCount = Array.isArray(canvasRecord?.nodes) ? canvasRecord.nodes.length : 0;

    return {
      id: typeof canvasRecord?.id === "string" ? canvasRecord.id : "",
      name: typeof canvasRecord?.name === "string" && canvasRecord.name.length > 0 ? canvasRecord.name : "Untitled canvas",
      terminalSummary: getTerminalSummary(nodeCount),
      isActive: canvasRecord?.id === activeCanvasId,
      isRenaming: canvasRecord?.id === activeCanvasRenameId,
      canDelete
    };
  }

  function deriveCanvasStripOverflowState({ scrollLeft, clientWidth, scrollWidth }) {
    const safeScrollLeft = Number.isFinite(scrollLeft) ? Math.max(0, scrollLeft) : 0;
    const safeClientWidth = Number.isFinite(clientWidth) ? Math.max(0, clientWidth) : 0;
    const safeScrollWidth = Number.isFinite(scrollWidth) ? Math.max(0, scrollWidth) : 0;
    const hasOverflow = safeScrollWidth > safeClientWidth;
    const maxScrollLeft = Math.max(0, safeScrollWidth - safeClientWidth);

    return {
      hasOverflow,
      canScrollBackward: hasOverflow && safeScrollLeft > 0,
      canScrollForward: hasOverflow && safeScrollLeft < maxScrollLeft
    };
  }

  function deriveCanvasSwitcherViewModel({ canvases, activeCanvasId, activeCanvasRenameId }) {
    const normalizedCanvases = Array.isArray(canvases) ? canvases : [];
    const activeCanvas = normalizedCanvases.find((canvasRecord) => canvasRecord?.id === activeCanvasId) ?? normalizedCanvases[0] ?? null;
    const items = normalizedCanvases.map((canvasRecord) => {
      // Any canvas can be deleted — removing the last one returns to the
      // no-project welcome state.
      return normalizeCanvasForSwitcher(canvasRecord, activeCanvas?.id ?? null, activeCanvasRenameId, true);
    });

    return {
      strip: {
        label: "Canvas navigator",
        items
      }
    };
  }

  const TERMINAL_STRIP_LABEL_MAX_LENGTH = 10;

  function getCompactTerminalLabel(titleText) {
    const compactLabel = Array.from(titleText).slice(0, TERMINAL_STRIP_LABEL_MAX_LENGTH).join("");
    return compactLabel.length > 0 ? compactLabel : "Terminal";
  }

  function normalizeTerminalStripItem(nodeRecord, activeNodeId) {
    const normalizedId = typeof nodeRecord?.id === "string" || typeof nodeRecord?.id === "number"
      ? String(nodeRecord.id)
      : "";
    const titleText = typeof nodeRecord?.titleText === "string" && nodeRecord.titleText.trim().length > 0
      ? nodeRecord.titleText.trim()
      : "Terminal";

    return {
      id: normalizedId,
      label: getCompactTerminalLabel(titleText),
      fullLabel: titleText,
      isActive: normalizedId.length > 0 && normalizedId === String(activeNodeId),
      isEmptyState: false
    };
  }

  function deriveTerminalStripViewModel({ activeCanvas, activeNodeId }) {
    const terminalNodes = Array.isArray(activeCanvas?.nodes) ? activeCanvas.nodes : [];

    if (terminalNodes.length === 0) {
      return {
        label: "Terminal navigator",
        isEmpty: true,
        items: [{
          id: "terminal-strip-empty",
          label: "No terminals in this canvas",
          isActive: false,
          isEmptyState: true
        }]
      };
    }

    return {
      label: "Terminal navigator",
      isEmpty: false,
      items: terminalNodes.map((nodeRecord) => normalizeTerminalStripItem(nodeRecord, activeNodeId))
    };
  }

  function deriveTerminalStripDropTarget({ itemOffset, itemSize, pointerOffset, itemIndex, sourceIndex }) {
    const safeItemOffset = Number.isFinite(itemOffset) ? itemOffset : 0;
    const safeItemSize = Number.isFinite(itemSize) ? Math.max(0, itemSize) : 0;
    const safePointerOffset = Number.isFinite(pointerOffset) ? pointerOffset : safeItemOffset;
    const safeItemIndex = Number.isFinite(itemIndex) ? Math.max(0, Math.trunc(itemIndex)) : 0;
    const safeSourceIndex = Number.isFinite(sourceIndex) ? Math.max(0, Math.trunc(sourceIndex)) : 0;
    const isAfterTarget = (safePointerOffset - safeItemOffset) > (safeItemSize / 2);
    const rawTargetIndex = safeItemIndex + (isAfterTarget ? 1 : 0);

    return {
      targetIndex: rawTargetIndex > safeSourceIndex ? rawTargetIndex - 1 : rawTargetIndex,
      isAfterTarget
    };
  }

  // --- Terminal tree (sidebar navigator) -------------------------------
  //
  // The sidebar tree mirrors the agent spawn graph: roots are nodes with no
  // `managedParentAgent`, children are nodes whose parent matches a root's
  // `managedAgentName`. We return a flat list of rows with `depth` so the
  // renderer can indent them with the same CSS variable the file explorer
  // uses (`--workspace-entry-depth`). Collapsed branches are pruned here so
  // the renderer just paints rows.

  function normalizeAgentName(value) {
    return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
  }

  function normalizeSessionKeyValue(value) {
    return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
  }

  function getTerminalNodeLabel(nodeRecord) {
    if (typeof nodeRecord?.titleText === "string" && nodeRecord.titleText.trim().length > 0) {
      return nodeRecord.titleText.trim();
    }
    return "Terminal";
  }

  // Branch identity for collapse state: agent name when the node is a
  // managed agent, otherwise its session key so plain terminals can also
  // parent arranged children.
  function getTerminalBranchKey(nodeRecord) {
    const agentName = normalizeAgentName(nodeRecord?.managedAgentName);

    if (agentName !== null) {
      return agentName;
    }

    const sessionKey = normalizeSessionKeyValue(nodeRecord?.sessionKey);
    return sessionKey === null ? null : `key:${sessionKey}`;
  }

  // Resolve each node's parent *node*. A user arrangement override
  // (`userParentSessionKey`, present as an own property) wins over the
  // agentmux-managed parent name; `null` forces the node to be a root so
  // agentmux sync updates can't clobber a deliberate arrangement. Cycles
  // (including self-parenting) are cut back to root.
  function resolveTerminalParentMap(nodes) {
    const safeNodes = Array.isArray(nodes) ? nodes : [];
    const nodesBySessionKey = new Map();
    const nodesByAgentName = new Map();

    safeNodes.forEach((nodeRecord) => {
      const sessionKey = normalizeSessionKeyValue(nodeRecord?.sessionKey);

      if (sessionKey !== null && !nodesBySessionKey.has(sessionKey)) {
        nodesBySessionKey.set(sessionKey, nodeRecord);
      }

      const agentName = normalizeAgentName(nodeRecord?.managedAgentName);

      if (agentName !== null && !nodesByAgentName.has(agentName)) {
        nodesByAgentName.set(agentName, nodeRecord);
      }
    });

    const rawParentByNode = new Map();

    safeNodes.forEach((nodeRecord) => {
      let parent = null;

      if (nodeRecord != null && Object.prototype.hasOwnProperty.call(nodeRecord, "userParentSessionKey")) {
        const overrideKey = normalizeSessionKeyValue(nodeRecord.userParentSessionKey);
        parent = overrideKey === null ? null : nodesBySessionKey.get(overrideKey) ?? null;
      } else {
        const agentName = normalizeAgentName(nodeRecord?.managedAgentName);
        const requestedParentKey = normalizeAgentName(nodeRecord?.managedParentAgent);

        if (requestedParentKey !== null && requestedParentKey !== agentName) {
          parent = nodesByAgentName.get(requestedParentKey) ?? null;
        }
      }

      if (parent === nodeRecord) {
        parent = null;
      }

      rawParentByNode.set(nodeRecord, parent);
    });

    const parentByNode = new Map();

    safeNodes.forEach((nodeRecord) => {
      const visited = new Set([nodeRecord]);
      let ancestor = rawParentByNode.get(nodeRecord) ?? null;
      let isValid = true;

      while (ancestor !== null) {
        if (visited.has(ancestor)) {
          isValid = false;
          break;
        }

        visited.add(ancestor);
        ancestor = rawParentByNode.get(ancestor) ?? null;
      }

      parentByNode.set(nodeRecord, isValid ? (rawParentByNode.get(nodeRecord) ?? null) : null);
    });

    return parentByNode;
  }

  function deriveTerminalTreeRows({ activeCanvas, activeNodeId, collapsedAgentNames }) {
    const nodes = Array.isArray(activeCanvas?.nodes)
      ? activeCanvas.nodes.filter((nodeRecord) => nodeRecord?.isRemoved !== true)
      : [];

    if (nodes.length === 0) {
      return { isEmpty: true, rows: [] };
    }

    const collapsedSet = collapsedAgentNames instanceof Set ? collapsedAgentNames : new Set(collapsedAgentNames ?? []);
    const parentByNode = resolveTerminalParentMap(nodes);

    // Group children by their resolved parent node. Roots go under `null`.
    const childrenByParent = new Map();

    nodes.forEach((nodeRecord) => {
      const parent = parentByNode.get(nodeRecord) ?? null;
      const bucket = childrenByParent.get(parent) ?? [];
      bucket.push(nodeRecord);
      childrenByParent.set(parent, bucket);
    });

    const rows = [];
    const visitedNodes = new Set();
    const coveredNodes = new Set();

    const markDescendantsCovered = (parentNode) => {
      const bucket = childrenByParent.get(parentNode) ?? [];
      bucket.forEach((nodeRecord) => {
        if (coveredNodes.has(nodeRecord)) {
          return;
        }
        coveredNodes.add(nodeRecord);
        markDescendantsCovered(nodeRecord);
      });
    };

    // Stable iteration: keep canvas order within each parent bucket so the
    // tree matches the order users already know.
    const appendChildren = (parentNode, depth) => {
      const bucket = childrenByParent.get(parentNode) ?? [];
      bucket.forEach((nodeRecord) => {
        if (visitedNodes.has(nodeRecord)) {
          return;
        }

        visitedNodes.add(nodeRecord);
        coveredNodes.add(nodeRecord);
        const agentName = normalizeAgentName(nodeRecord?.managedAgentName);
        const branchKey = getTerminalBranchKey(nodeRecord);
        const hasChildren = (childrenByParent.get(nodeRecord) ?? [])
          .some((childRecord) => !visitedNodes.has(childRecord));
        const isCollapsed = branchKey !== null && collapsedSet.has(branchKey);
        const nodeId = typeof nodeRecord?.id === "string" || typeof nodeRecord?.id === "number"
          ? String(nodeRecord.id)
          : "";
        const parentNode = parentByNode.get(nodeRecord) ?? null;

        rows.push({
          id: nodeId,
          label: getTerminalNodeLabel(nodeRecord),
          agentName,
          branchKey,
          depth,
          hasChildren,
          isCollapsed,
          isActive: nodeId.length > 0 && nodeId === String(activeNodeId),
          isUserArranged: nodeRecord != null && Object.prototype.hasOwnProperty.call(nodeRecord, "userParentSessionKey"),
          sessionKey: normalizeSessionKeyValue(nodeRecord?.sessionKey),
          parentSessionKey: parentNode === null ? null : normalizeSessionKeyValue(parentNode.sessionKey),
          runtimeState: typeof nodeRecord?.managedRuntimeState === "string" ? nodeRecord.managedRuntimeState : null,
          agentState: typeof nodeRecord?.managedAgentState === "string" ? nodeRecord.managedAgentState : null,
          attention: typeof nodeRecord?.managedAttention === "string" ? nodeRecord.managedAttention : null
        });

        if (hasChildren && !isCollapsed) {
          appendChildren(nodeRecord, depth + 1);
        } else if (hasChildren) {
          markDescendantsCovered(nodeRecord);
        }
      });
    };

    appendChildren(null, 0);
    nodes.forEach((nodeRecord) => {
      if (!coveredNodes.has(nodeRecord)) {
        const fallbackBucket = childrenByParent.get(null) ?? [];
        fallbackBucket.push(nodeRecord);
        childrenByParent.set(null, fallbackBucket);
        appendChildren(null, 0);
      }
    });

    return { isEmpty: false, rows };
  }

  // Decide what a drag-and-drop in the terminal tree means. Zones:
  // - "before"/"after": reorder siblings; the dragged node adopts the
  //   target's parent (which may be root).
  // - "onto": make the dragged node a child of the target.
  // Dropping a node onto itself or one of its own descendants is a noop so
  // the arrangement graph can never cycle.
  function deriveTerminalTreeDropAction({ nodes, sourceNodeId, targetNodeId, zone }) {
    const safeNodes = (Array.isArray(nodes) ? nodes : [])
      .filter((nodeRecord) => nodeRecord?.isRemoved !== true);
    const sourceNode = safeNodes.find((nodeRecord) => String(nodeRecord?.id) === String(sourceNodeId));
    const targetNode = safeNodes.find((nodeRecord) => String(nodeRecord?.id) === String(targetNodeId));

    if (sourceNode == null || targetNode == null || sourceNode === targetNode) {
      return { type: "noop", reason: "invalid-target" };
    }

    if (zone !== "before" && zone !== "after" && zone !== "onto") {
      return { type: "noop", reason: "invalid-zone" };
    }

    const parentByNode = resolveTerminalParentMap(safeNodes);

    let ancestor = targetNode;

    while (ancestor != null) {
      if (ancestor === sourceNode) {
        return { type: "noop", reason: "cycle" };
      }

      ancestor = parentByNode.get(ancestor) ?? null;
    }

    if (zone === "onto") {
      const parentSessionKey = normalizeSessionKeyValue(targetNode.sessionKey);

      if (parentSessionKey === null) {
        return { type: "noop", reason: "target-missing-key" };
      }

      return {
        type: "reparent",
        parentSessionKey,
        targetSessionKey: parentSessionKey
      };
    }

    const targetParent = parentByNode.get(targetNode) ?? null;

    return {
      type: "reorder",
      position: zone,
      parentSessionKey: targetParent === null ? null : normalizeSessionKeyValue(targetParent.sessionKey),
      targetSessionKey: normalizeSessionKeyValue(targetNode.sessionKey)
    };
  }

  return {
    deriveCanvasSwitcherViewModel,
    deriveCanvasStripOverflowState,
    deriveTerminalStripViewModel,
    deriveTerminalStripDropTarget,
    deriveTerminalTreeRows,
    deriveTerminalTreeDropAction,
    resolveTerminalParentMap
  };
});
