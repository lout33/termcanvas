const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld(
  "noteCanvas",
  Object.freeze({
    appName: "Canvas Learning",
    isSmokeTest: process.env.CANVAS_SMOKE_TEST === "1",
    createTerminal: (payload) => ipcRenderer.invoke("terminal:create", payload),
    writeTerminal: (terminalId, data) => ipcRenderer.invoke("terminal:write", { terminalId, data }),
    resizeTerminal: (terminalId, cols, rows) => ipcRenderer.invoke("terminal:resize", { terminalId, cols, rows }),
    destroyTerminal: (terminalId) => ipcRenderer.invoke("terminal:destroy", { terminalId }),
    saveCanvasFile: (payload) => ipcRenderer.invoke("canvas:save-file", payload),
    openCanvasFile: () => ipcRenderer.invoke("canvas:open-file"),
    onTerminalData: (callback) => {
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on("terminal:data", listener);

      return () => {
        ipcRenderer.removeListener("terminal:data", listener);
      };
    },
    onTerminalExit: (callback) => {
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on("terminal:exit", listener);

      return () => {
        ipcRenderer.removeListener("terminal:exit", listener);
      };
    }
  })
);
