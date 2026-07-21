function serializeCanvasSessionRecord(canvasRecord, exportedCanvas) {
  return {
    id: canvasRecord.id,
    name: exportedCanvas.name,
    viewportOffset: exportedCanvas.viewportOffset,
    viewportScale: exportedCanvas.viewportScale,
    workspace: canvasRecord.workspace ?? null,
    agentProjectTag: canvasRecord.agentProjectTag ?? null,
    activeSessionKey: canvasRecord.activeSessionKey ?? null,
    notes: Array.isArray(canvasRecord.notes)
      ? canvasRecord.notes.map((note) => ({
        id: note.id,
        x: note.x,
        y: note.y,
        width: note.width,
        height: note.height,
        text: typeof note.text === "string" ? note.text : ""
      }))
      : [],
    terminalNodes: canvasRecord.nodes.map((nodeRecord, index) => ({
      ...exportedCanvas.terminalNodes[index],
      sessionKey: nodeRecord.sessionKey,
      managedAgentName: nodeRecord.managedAgentName ?? null,
      managedAgentRole: nodeRecord.managedAgentRole ?? null,
      managedProjectTag: nodeRecord.managedProjectTag ?? null,
      managedParentAgent: nodeRecord.managedParentAgent ?? null,
      managedDepth: Number.isInteger(nodeRecord.managedDepth) ? nodeRecord.managedDepth : null,
      tmuxSessionName: nodeRecord.tmuxSessionName ?? null,
      isExited: nodeRecord.isExited,
      exitCode: nodeRecord.exitCode,
      exitSignal: nodeRecord.exitSignal
    }))
  };
}

function serializeAppSessionSnapshot({ version, ui, canvases, activeCanvasId }) {
  return {
    version,
    ui,
    canvases: canvases.map(({ canvasRecord, exportedCanvas }) => serializeCanvasSessionRecord(canvasRecord, exportedCanvas)),
    activeCanvasId
  };
}

module.exports = {
  serializeCanvasSessionRecord,
  serializeAppSessionSnapshot
};
