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

  return {
    shouldHandleCanvasWheel,
    shouldTerminalHandleWheel,
    shouldClearActiveTerminalSelection,
    shouldSelectTerminal,
    shouldEnableTerminalInteractionOverlay,
    shouldDisableTerminalAnimations
  };
});
