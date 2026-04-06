function serializeCanvasSessionRecord(canvasRecord, exportedCanvas) {
  return {
    id: canvasRecord.id,
    name: exportedCanvas.name,
    viewportOffset: exportedCanvas.viewportOffset,
    viewportScale: exportedCanvas.viewportScale,
    workspace: canvasRecord.workspace ?? null,
    terminalNodes: canvasRecord.nodes.map((nodeRecord, index) => ({
      ...exportedCanvas.terminalNodes[index],
      sessionKey: nodeRecord.sessionKey,
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
