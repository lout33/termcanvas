(function (root, factory) {
  const exports = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = exports;
  }

  if (root && typeof root === "object") {
    root.noteCanvasRendererActionDialog = exports;

    if (root.window && typeof root.window === "object") {
      root.window.noteCanvasRendererActionDialog = exports;
    }
  }
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  function createWorkspaceActionDialogState() {
    return {
      isOpen: false,
      kind: "prompt",
      title: "",
      message: "",
      confirmLabel: "Confirm",
      cancelLabel: "Cancel",
      value: ""
    };
  }

  function openWorkspaceActionDialog(_currentState, options = {}) {
    return {
      isOpen: true,
      kind: options.kind === "confirm" ? "confirm" : "prompt",
      title: typeof options.title === "string" ? options.title : "",
      message: typeof options.message === "string" ? options.message : "",
      confirmLabel: typeof options.confirmLabel === "string" && options.confirmLabel.length > 0 ? options.confirmLabel : "Confirm",
      cancelLabel: typeof options.cancelLabel === "string" ? options.cancelLabel : "Cancel",
      value: typeof options.initialValue === "string" ? options.initialValue : ""
    };
  }

  function closeWorkspaceActionDialog(_currentState) {
    return createWorkspaceActionDialogState();
  }

  function getWorkspaceActionDialogSubmitValue(state) {
    if (state?.kind === "confirm") {
      return true;
    }

    const trimmedValue = typeof state?.value === "string" ? state.value.trim() : "";
    return trimmedValue.length > 0 ? trimmedValue : null;
  }

  return {
    createWorkspaceActionDialogState,
    openWorkspaceActionDialog,
    closeWorkspaceActionDialog,
    getWorkspaceActionDialogSubmitValue
  };
});
