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

  function getTerminalNodeLabel(nodeRecord) {
    if (typeof nodeRecord?.titleText === "string" && nodeRecord.titleText.trim().length > 0) {
      return nodeRecord.titleText.trim();
    }
    return "Terminal";
  }

  function deriveTerminalTreeRows({ activeCanvas, activeNodeId, collapsedAgentNames }) {
    const nodes = Array.isArray(activeCanvas?.nodes) ? activeCanvas.nodes : [];

    if (nodes.length === 0) {
      return { isEmpty: true, rows: [] };
    }

    const collapsedSet = collapsedAgentNames instanceof Set ? collapsedAgentNames : new Set(collapsedAgentNames ?? []);

    // Group children by parent agent name. Roots (parent == null) go under
    // the sentinel key `null`.
    const childrenByParent = new Map();
    const nodeByAgentName = new Map();

    nodes.forEach((nodeRecord) => {
      const agentName = normalizeAgentName(nodeRecord?.managedAgentName);
      if (agentName !== null) {
        nodeByAgentName.set(agentName, nodeRecord);
      }
      const parentKey = normalizeAgentName(nodeRecord?.managedParentAgent);
      const bucket = childrenByParent.get(parentKey) ?? [];
      bucket.push(nodeRecord);
      childrenByParent.set(parentKey, bucket);
    });

    const rows = [];

    // Stable iteration: keep canvas order within each parent bucket so the
    // tree matches the top strip's order users already know.
    const appendChildren = (parentKey, depth) => {
      const bucket = childrenByParent.get(parentKey) ?? [];
      bucket.forEach((nodeRecord) => {
        const agentName = normalizeAgentName(nodeRecord?.managedAgentName);
        const hasChildren = agentName !== null && childrenByParent.has(agentName) && (childrenByParent.get(agentName) ?? []).length > 0;
        const isCollapsed = agentName !== null && collapsedSet.has(agentName);
        const nodeId = typeof nodeRecord?.id === "string" || typeof nodeRecord?.id === "number"
          ? String(nodeRecord.id)
          : "";

        rows.push({
          id: nodeId,
          label: getTerminalNodeLabel(nodeRecord),
          agentName,
          depth,
          hasChildren,
          isCollapsed,
          isActive: nodeId.length > 0 && nodeId === String(activeNodeId),
          runtimeState: typeof nodeRecord?.managedRuntimeState === "string" ? nodeRecord.managedRuntimeState : null,
          attention: typeof nodeRecord?.managedAttention === "string" ? nodeRecord.managedAttention : null
        });

        if (hasChildren && !isCollapsed) {
          appendChildren(agentName, depth + 1);
        }
      });
    };

    appendChildren(null, 0);

    return { isEmpty: false, rows };
  }

  return {
    deriveCanvasSwitcherViewModel,
    deriveCanvasStripOverflowState,
    deriveTerminalStripViewModel,
    deriveTerminalStripDropTarget,
    deriveTerminalTreeRows
  };
});
