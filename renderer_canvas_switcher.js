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

  function deriveCanvasSwitcherViewModel({ canvases, activeCanvasId, activeCanvasRenameId, isExpanded }) {
    const normalizedCanvases = Array.isArray(canvases) ? canvases : [];
    const activeCanvas = normalizedCanvases.find((canvasRecord) => canvasRecord?.id === activeCanvasId) ?? normalizedCanvases[0] ?? null;
    const listItems = normalizedCanvases.map((canvasRecord) => {
      return normalizeCanvasForSwitcher(canvasRecord, activeCanvas?.id ?? null, activeCanvasRenameId, normalizedCanvases.length > 1);
    });
    const activeWorkspace = activeCanvas?.workspace ?? null;
    const activeTerminalCount = Array.isArray(activeCanvas?.nodes) ? activeCanvas.nodes.length : 0;
    const hasLinkedWorkspace = Boolean(activeWorkspace?.rootPath);
    const terminalSummary = getTerminalSummary(activeTerminalCount);
    const workspaceStatus = hasLinkedWorkspace ? "Workspace linked" : "No workspace linked";
    const disclosureExpanded = isExpanded === true;

    return {
      trigger: activeCanvas === null
        ? null
        : {
            name: activeCanvas.name,
            buttonLabel: "Switch canvases",
            meta: `${workspaceStatus} · ${terminalSummary}`,
            path: hasLinkedWorkspace ? activeWorkspace.rootPath : "Choose a workspace for this canvas.",
            isExpanded: disclosureExpanded,
            hasLinkedWorkspace,
            isRenaming: activeCanvas.id === activeCanvasRenameId
          },
      list: {
        label: "Available canvases",
        isExpanded: disclosureExpanded,
        items: listItems
      }
    };
  }

  return {
    deriveCanvasSwitcherViewModel
  };
});
