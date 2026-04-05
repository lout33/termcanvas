const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld(
  "noteCanvas",
  Object.freeze({
    appName: "Canvas Learning",
    isSmokeTest: process.env.CANVAS_SMOKE_TEST === "1",
    loadAppSession: () => ipcRenderer.invoke("app-session:load"),
    saveAppSession: (payload) => ipcRenderer.send("app-session:save", payload),
    restoreWorkspaceSession: (payload) => ipcRenderer.invoke("workspace-session:restore", payload),
    getWorkspaceDirectoryState: () => ipcRenderer.invoke("workspace-directory:state"),
    openWorkspaceDirectory: () => ipcRenderer.invoke("workspace-directory:open"),
    refreshWorkspaceDirectory: () => ipcRenderer.invoke("workspace-directory:refresh"),
    activateWorkspaceFolder: (folderId) => ipcRenderer.invoke("workspace-folder:activate", { folderId }),
    reorderWorkspaceFolder: (folderId, targetIndex) => ipcRenderer.invoke("workspace-folder:reorder", { folderId, targetIndex }),
    removeWorkspaceFolder: (folderId) => ipcRenderer.invoke("workspace-folder:remove", { folderId }),
    debugOpenWorkspaceDirectory: (directoryPath) => ipcRenderer.invoke("workspace-directory:debug-open", { directoryPath }),
    readWorkspaceFile: (folderId, relativePath) => ipcRenderer.invoke("workspace-file:read", { folderId, relativePath }),
    createTerminal: (payload) => ipcRenderer.invoke("terminal:create", payload),
    resolveTrackedTerminalCwds: (terminalIds) => ipcRenderer.invoke("terminal:resolve-tracked-cwds", { terminalIds }),
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
    },
    onTerminalCwdChange: (callback) => {
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on("terminal:cwd-changed", listener);

      return () => {
        ipcRenderer.removeListener("terminal:cwd-changed", listener);
      };
    },
    onWorkspaceDirectoryData: (callback) => {
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on("workspace-directory:data", listener);

      return () => {
        ipcRenderer.removeListener("workspace-directory:data", listener);
      };
    }
  })
);
