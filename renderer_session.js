function serializeCanvasSessionRecord(canvasRecord, exportedCanvas) {
  return {
    id: canvasRecord.id,
    name: exportedCanvas.name,
    viewportOffset: exportedCanvas.viewportOffset,
    viewportScale: exportedCanvas.viewportScale,
    workspace: canvasRecord.workspace ?? null,
    agentProjectTag: canvasRecord.agentProjectTag ?? null,
    managerAgentName: canvasRecord.managerAgentName ?? null,
    activeSessionKey: canvasRecord.activeSessionKey ?? null,
    terminalNodes: canvasRecord.nodes.map((nodeRecord, index) => ({
      ...exportedCanvas.terminalNodes[index],
      sessionKey: nodeRecord.sessionKey,
      managedAgentName: nodeRecord.managedAgentName ?? null,
      managedAgentRole: nodeRecord.managedAgentRole ?? null,
      managedProjectTag: nodeRecord.managedProjectTag ?? null,
      tmuxSessionName: nodeRecord.tmuxSessionName ?? null,
      isManager: nodeRecord.isManager === true,
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
