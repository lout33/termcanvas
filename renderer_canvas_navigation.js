(function (root, factory) {
  const exports = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = exports;
  }

  if (root && typeof root === "object") {
    root.noteCanvasRendererCanvasNavigation = exports;

    if (root.window && typeof root.window === "object") {
      root.window.noteCanvasRendererCanvasNavigation = exports;
    }
  }
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  function isNodeElement(target, expectedElement) {
    return expectedElement !== null && target === expectedElement;
  }

  function findClosestTerminalNode(target) {
    if (!target || typeof target.closest !== "function") {
      return null;
    }

    return target.closest(".terminal-node");
  }

  function shouldHandleCanvasWheel({ target, board, nodesLayer, activeNodeElement }) {
    if (isNodeElement(target, board) || isNodeElement(target, nodesLayer)) {
      return true;
    }

    const terminalNode = findClosestTerminalNode(target);

    if (terminalNode === null) {
      return false;
    }

    return terminalNode !== activeNodeElement;
  }

  function shouldTerminalHandleWheel({ terminalNodeElement, activeNodeElement }) {
    return terminalNodeElement !== null && terminalNodeElement === activeNodeElement;
  }

  function shouldClearActiveTerminalSelection({ target, board, nodesLayer }) {
    return isNodeElement(target, board) || isNodeElement(target, nodesLayer);
  }

  function shouldSelectTerminal({ reason }) {
    return ["pointer", "title-focus", "drag", "resize", "maximize"].includes(reason);
  }

  function shouldEnableTerminalInteractionOverlay({ terminalNodeElement, activeNodeElement }) {
    return terminalNodeElement !== activeNodeElement;
  }

  function shouldDisableTerminalAnimations({ interaction }) {
    return interaction === "drag"
      || interaction === "maximize"
      || interaction === "restore";
  }

  function shouldShowBoardHintsForCanvas(canvasRecord) {
    return Array.isArray(canvasRecord?.nodes) && canvasRecord.nodes.length === 0;
  }

  function deriveTerminalStripActivation({ isFullscreenMode, clickCount }) {
    const isDoubleClick = Number.isFinite(clickCount) && clickCount >= 2;

    if (isDoubleClick) {
      return {
        shouldFocus: true,
        shouldCenterViewport: false,
        shouldMaximize: true
      };
    }

    return {
      shouldFocus: true,
      shouldCenterViewport: isFullscreenMode !== true,
      shouldMaximize: isFullscreenMode === true
    };
  }

  function getViewportOffsetToCenterNode({
    nodeX,
    nodeY,
    nodeWidth,
    nodeHeight,
    viewportScale,
    viewportWidth,
    viewportHeight
  }) {
    const safeScale = Number.isFinite(viewportScale) && viewportScale > 0 ? viewportScale : 1;
    const safeViewportWidth = Number.isFinite(viewportWidth) ? viewportWidth : 0;
    const safeViewportHeight = Number.isFinite(viewportHeight) ? viewportHeight : 0;
    const safeNodeX = Number.isFinite(nodeX) ? nodeX : 0;
    const safeNodeY = Number.isFinite(nodeY) ? nodeY : 0;
    const safeNodeWidth = Number.isFinite(nodeWidth) ? nodeWidth : 0;
    const safeNodeHeight = Number.isFinite(nodeHeight) ? nodeHeight : 0;

    return {
      x: (safeViewportWidth / 2) - ((safeNodeX + (safeNodeWidth / 2)) * safeScale),
      y: (safeViewportHeight / 2) - ((safeNodeY + (safeNodeHeight / 2)) * safeScale)
    };
  }

  return {
    shouldHandleCanvasWheel,
    shouldTerminalHandleWheel,
    shouldClearActiveTerminalSelection,
    shouldSelectTerminal,
    shouldEnableTerminalInteractionOverlay,
    shouldDisableTerminalAnimations,
    shouldShowBoardHintsForCanvas,
    deriveTerminalStripActivation,
    getViewportOffsetToCenterNode
  };
});
