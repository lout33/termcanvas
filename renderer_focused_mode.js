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

  function createFocusedTerminalLifecycle(options = {}) {
    const getNodes = typeof options.getNodes === "function" ? options.getNodes : () => [];
    const isMounted = typeof options.isMounted === "function" ? options.isMounted : () => false;
    const canAttach = typeof options.canAttach === "function" ? options.canAttach : () => true;
    const attach = typeof options.attach === "function" ? options.attach : async () => {};
    const detach = typeof options.detach === "function" ? options.detach : async () => {};
    const focus = typeof options.focus === "function" ? options.focus : () => {};
    const onError = typeof options.onError === "function" ? options.onError : () => {};
    let requestedNode = null;
    let shouldFocusRequestedNode = true;
    let operationChain = Promise.resolve();

    async function reconcile() {
      const targetNode = requestedNode;
      const nodes = Array.isArray(getNodes()) ? getNodes() : [];

      for (const nodeRecord of nodes) {
        if (nodeRecord !== targetNode && isMounted(nodeRecord)) {
          await detach(nodeRecord);
        }
      }

      if (targetNode === null || targetNode !== requestedNode || !canAttach(targetNode)) {
        return;
      }

      if (!isMounted(targetNode)) {
        await attach(targetNode);
      }

      // A newer request may arrive while attachment is in flight. Tear down
      // the obsolete view before the next queued reconciliation mounts it.
      if (targetNode !== requestedNode) {
        if (isMounted(targetNode)) {
          await detach(targetNode);
        }
        return;
      }

      if (shouldFocusRequestedNode) {
        focus(targetNode);
      }
    }

    function request(nodeRecord, requestOptions = {}) {
      requestedNode = nodeRecord ?? null;
      shouldFocusRequestedNode = requestOptions.shouldFocus !== false;
      operationChain = operationChain
        .then(reconcile)
        .catch((error) => {
          onError(requestedNode, error);
        });
      return operationChain;
    }

    return Object.freeze({
      request,
      whenIdle: () => operationChain
    });
  }

  function shouldShowNodeInFocusedMode({ nodeRecord, activeNodeRecord }) {
    if (nodeRecord == null) {
      return false;
    }

    if (nodeRecord.isRemoved === true) {
      return false;
    }

    if (nodeRecord.managedAgentState === "archived") {
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
      ? nodes.filter((nodeRecord) => (
        nodeRecord?.isRemoved !== true && nodeRecord?.managedAgentState !== "archived"
      ))
      : [];

    return availableNodes.find((nodeRecord) => nodeRecord?.sessionKey === preferredSessionKey)
      ?? availableNodes.find((nodeRecord) => nodeRecord?.isExited !== true)
      ?? availableNodes[0]
      ?? null;
  }

  function shouldInvokeTerminalDestroy({ terminalId, tmuxSessionName, retainDetachedIdentity }) {
    return typeof terminalId === "string"
      || (
        retainDetachedIdentity !== true
        && typeof tmuxSessionName === "string"
        && tmuxSessionName.length > 0
      );
  }

  return {
    createFocusedTerminalLifecycle,
    shouldShowNodeInFocusedMode,
    pickInitialSidebarViewForFocusedMode,
    pickFocusedNode,
    shouldInvokeTerminalDestroy
  };
});
