(function (root, factory) {
  const exports = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = exports;
  }

  if (root && typeof root === "object") {
    root.noteCanvasRendererNodeStatus = exports;

    if (root.window && typeof root.window === "object") {
      root.window.noteCanvasRendererNodeStatus = exports;
    }
  }
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const ATTENTION_STATES = Object.freeze(["needs-input", "error"]);

  function normalizeToken(value) {
    return typeof value === "string" && value.trim().length > 0 ? value.trim().toLowerCase() : null;
  }

  // Derive the display status for a canvas node from agentmux runtime facts.
  //
  // Descriptor: { isExited, exitCode, attention, agentState, runtimeState }
  // agentmux attention domain: failed | waiting | stopped | stale | done | null
  // agentmux agent_state domain: active | idle | finished | failed | archived
  //
  // Declared agent state is the user's control surface and therefore owns the
  // primary color. Runtime and attention remain fallbacks and queue signals.
  // Returns { state, label } where state is one of:
  //   exited | error | needs-input | done | idle | working | archived | live
  function deriveNodeStatus(descriptor) {
    if (descriptor?.isExited === true) {
      const exitCode = descriptor.exitCode;
      return {
        state: typeof exitCode === "number" && exitCode !== 0 ? "error" : "exited",
        label: "Exited"
      };
    }

    const agentState = normalizeToken(descriptor?.agentState);

    if (agentState === "failed") {
      return { state: "error", label: "Failed" };
    }

    if (agentState === "active") {
      return { state: "working", label: "Active" };
    }

    if (agentState === "idle") {
      return { state: "idle", label: "Idle" };
    }

    if (agentState === "finished") {
      return { state: "done", label: "Finished" };
    }

    if (agentState === "archived") {
      return { state: "archived", label: "Archived" };
    }

    const attention = normalizeToken(descriptor?.attention);

    if (attention === "failed") {
      return { state: "error", label: "Failed" };
    }

    if (attention === "waiting") {
      return { state: "needs-input", label: "Needs input" };
    }

    if (attention === "done") {
      return { state: "done", label: "Done" };
    }

    if (attention === "stale") {
      return { state: "idle", label: "Stale" };
    }

    if (attention === "stopped") {
      return { state: "idle", label: "Stopped" };
    }

    const runtimeState = normalizeToken(descriptor?.runtimeState);

    if (runtimeState === "waiting") {
      return { state: "needs-input", label: "Needs input" };
    }

    if (runtimeState === "running" || runtimeState === "active") {
      return { state: "working", label: "Working" };
    }

    return { state: "live", label: "Live" };
  }

  function isHandoffAttention(descriptor) {
    return normalizeToken(descriptor?.attention) === "waiting"
      && normalizeToken(descriptor?.agentState) === "finished";
  }

  // Given node descriptors ({ id, state }), return the ids that need a human,
  // most urgent first: needs-input before error, stable within each group.
  function deriveAttentionQueue(nodes) {
    if (!Array.isArray(nodes)) {
      return [];
    }

    const queue = [];
    const queuedIds = new Set();

    for (const node of nodes) {
      if (node?.id != null && isHandoffAttention(node)) {
        queue.push(node.id);
        queuedIds.add(node.id);
      }
    }

    for (const node of nodes) {
      const needsInput = normalizeToken(node?.attention) === "waiting" || node?.state === "needs-input";
      if (node?.id != null && needsInput && !queuedIds.has(node.id)) {
        queue.push(node.id);
        queuedIds.add(node.id);
      }
    }

    for (const node of nodes) {
      const hasError = normalizeToken(node?.attention) === "failed" || node?.state === "error";
      if (node?.id != null && hasError && !queuedIds.has(node.id)) {
        queue.push(node.id);
        queuedIds.add(node.id);
      }
    }

    return queue;
  }

  // Terminal chrome that carries no meaning for a "what is it doing" tail line:
  // box drawing, block elements, and braille spinner glyphs.
  const TAIL_NOISE_PATTERN = /[─-╿▀-▟⠀-⣿]/gu;
  const TAIL_MAX_LENGTH = 120;

  function cleanTailLine(value) {
    if (typeof value !== "string") {
      return "";
    }
    return value.replace(TAIL_NOISE_PATTERN, " ").replace(/\s+/gu, " ").trim();
  }

  // Given terminal lines ordered bottom-up, return the most recent line that
  // still says something after stripping chrome, or null when nothing does.
  function extractLastMeaningfulLine(linesBottomUp) {
    if (!Array.isArray(linesBottomUp)) {
      return null;
    }

    for (const line of linesBottomUp) {
      const cleaned = cleanTailLine(line);

      if (cleaned.length >= 2) {
        return cleaned.length > TAIL_MAX_LENGTH ? `${cleaned.slice(0, TAIL_MAX_LENGTH - 1)}…` : cleaned;
      }
    }

    return null;
  }

  // Human quiet-time suffix: null while output is fresh (< 2 minutes old).
  function formatQuietDuration(milliseconds) {
    if (!Number.isFinite(milliseconds) || milliseconds < 120000) {
      return null;
    }

    const minutes = Math.floor(milliseconds / 60000);

    if (minutes < 60) {
      return `${minutes}m`;
    }

    const hours = Math.floor(minutes / 60);

    if (hours < 24) {
      return `${hours}h`;
    }

    return `${Math.floor(hours / 24)}d`;
  }

  return {
    ATTENTION_STATES,
    deriveNodeStatus,
    deriveAttentionQueue,
    isHandoffAttention,
    extractLastMeaningfulLine,
    formatQuietDuration
  };
});
