(function (root, factory) {
  const exports = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = exports;
  }

  if (root && typeof root === "object") {
    root.noteCanvasRendererCanvasSnapshot = exports;

    if (root.window && typeof root.window === "object") {
      root.window.noteCanvasRendererCanvasSnapshot = exports;
    }
  }
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  function normalizeString(value) {
    return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
  }

  // Read-only canvas snapshot for agents (roadmap M3): who is on this canvas,
  // what state they are in, and what they last said. Written to disk by the
  // main process so any terminal-based agent can read real swarm state.
  //
  // Node descriptor: { id, title, agentName, role, parentAgent,
  //   state, attention, tailLine, quiet, tmuxSession, cwd, isExited }
  function deriveCanvasSnapshot(canvasMeta, nodes, generatedAtIso) {
    const terminals = (Array.isArray(nodes) ? nodes : [])
      .filter((node) => node != null)
      .map((node) => ({
        title: normalizeString(node.title),
        agent_name: normalizeString(node.agentName),
        role: normalizeString(node.role),
        parent_agent: normalizeString(node.parentAgent),
        state: normalizeString(node.state) ?? "unknown",
        attention: normalizeString(node.attention),
        last_output: normalizeString(node.tailLine),
        quiet: normalizeString(node.quiet),
        tmux_session: normalizeString(node.tmuxSession),
        cwd: normalizeString(node.cwd),
        is_exited: node.isExited === true
      }));

    return {
      version: 1,
      generated_at: typeof generatedAtIso === "string" ? generatedAtIso : null,
      canvas: {
        name: normalizeString(canvasMeta?.canvasName),
        project: normalizeString(canvasMeta?.projectTag),
        workspace_root: normalizeString(canvasMeta?.workspaceRootPath)
      },
      terminals
    };
  }

  return {
    deriveCanvasSnapshot
  };
});
