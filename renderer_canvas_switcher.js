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

  function deriveCanvasSwitcherViewModel({ canvases, activeCanvasId, activeCanvasRenameId, isExpanded }) {
    const normalizedCanvases = Array.isArray(canvases) ? canvases : [];
    const activeCanvas = normalizedCanvases.find((canvasRecord) => canvasRecord?.id === activeCanvasId) ?? normalizedCanvases[0] ?? null;
    const items = normalizedCanvases.map((canvasRecord) => {
      return normalizeCanvasForSwitcher(canvasRecord, activeCanvas?.id ?? null, activeCanvasRenameId, normalizedCanvases.length > 1);
    });
    const disclosureExpanded = isExpanded === true;

    return {
      strip: {
        label: "Canvas navigator",
        items
      },
      menu: {
        label: "Manage canvases",
        isExpanded: disclosureExpanded,
        items
      }
    };
  }

  function normalizeTerminalStripItem(nodeRecord, activeNodeId) {
    const normalizedId = typeof nodeRecord?.id === "string" || typeof nodeRecord?.id === "number"
      ? String(nodeRecord.id)
      : "";

    return {
      id: normalizedId,
      label: typeof nodeRecord?.titleText === "string" ? nodeRecord.titleText : "",
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

  return {
    deriveCanvasSwitcherViewModel,
    deriveCanvasStripOverflowState,
    deriveTerminalStripViewModel
  };
});
