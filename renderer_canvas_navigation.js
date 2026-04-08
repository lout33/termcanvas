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

  function getStripScrollTarget({ scrollLeft, clientWidth, scrollWidth, direction }) {
    const safeScrollLeft = Number.isFinite(scrollLeft) ? Math.max(0, scrollLeft) : 0;
    const safeClientWidth = Number.isFinite(clientWidth) ? Math.max(0, clientWidth) : 0;
    const safeScrollWidth = Number.isFinite(scrollWidth) ? Math.max(0, scrollWidth) : 0;
    const maxScrollLeft = Math.max(0, safeScrollWidth - safeClientWidth);
    const scrollAmount = Math.max(safeClientWidth * 0.72, 160);
    const delta = direction === "backward" ? -scrollAmount : scrollAmount;
    const nextScrollLeft = safeScrollLeft + delta;

    return Math.min(maxScrollLeft, Math.max(0, nextScrollLeft));
  }

  function getStripOverflowTargetIndex({ itemOffsets, scrollLeft, clientWidth, direction }) {
    const offsets = Array.isArray(itemOffsets) ? itemOffsets : [];
    const viewportStart = Number.isFinite(scrollLeft) ? Math.max(0, scrollLeft) : 0;
    const viewportWidth = Number.isFinite(clientWidth) ? Math.max(0, clientWidth) : 0;
    const viewportEnd = viewportStart + viewportWidth;

    if (direction === "backward") {
      for (let index = offsets.length - 1; index >= 0; index -= 1) {
        const itemStart = Number.isFinite(offsets[index]?.start) ? offsets[index].start : 0;

        if (itemStart < viewportStart - 1) {
          return index;
        }
      }

      return -1;
    }

    for (let index = 0; index < offsets.length; index += 1) {
      const itemEnd = Number.isFinite(offsets[index]?.end) ? offsets[index].end : 0;

      if (itemEnd > viewportEnd + 1) {
        return index;
      }
    }

    return -1;
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
    getViewportOffsetToCenterNode,
    getStripScrollTarget,
    getStripOverflowTargetIndex
  };
});
