(function (root, factory) {
  const exports = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = exports;
  }

  if (root && typeof root === "object") {
    root.noteCanvasRendererFocusedMode = exports;

    if (root.window && typeof root.window === "object") {
      root.window.noteCanvasRendererFocusedMode = exports;
    }
  }
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  // Product experiment (see EXPERIMENT.md): the Terminals tree is the primary
  // fleet overview and only the selected terminal fills the workspace. This
  // module holds the pure predicates that decide per-node visibility and the
  // initial sidebar view, so the behavior is testable without a DOM.

  function shouldShowNodeInFocusedMode({ nodeRecord, activeNodeRecord }) {
    if (nodeRecord == null) {
      return false;
    }

    if (nodeRecord.isRemoved === true) {
      return false;
    }

    if (activeNodeRecord == null) {
      return false;
    }

    return nodeRecord === activeNodeRecord;
  }

  function pickInitialSidebarViewForFocusedMode(canvasRecord) {
    // Terminals tree is the fleet overview in focused mode. Always land there
    // when a canvas exists; Explorer is one tab click away.
    if (canvasRecord == null) {
      return "explorer";
    }

    return "terminals";
  }

  function pickFocusedNode(nodes, preferredSessionKey = null) {
    const availableNodes = Array.isArray(nodes)
      ? nodes.filter((nodeRecord) => nodeRecord?.isRemoved !== true)
      : [];

    return availableNodes.find((nodeRecord) => nodeRecord?.sessionKey === preferredSessionKey)
      ?? availableNodes.find((nodeRecord) => nodeRecord?.isExited !== true)
      ?? availableNodes[0]
      ?? null;
  }

  return {
    shouldShowNodeInFocusedMode,
    pickInitialSidebarViewForFocusedMode,
    pickFocusedNode
  };
});
