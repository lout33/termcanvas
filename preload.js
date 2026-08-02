const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld(
  "noteCanvas",
  Object.freeze({
    appName: "TermCanvas",
    isSmokeTest: process.env.CANVAS_SMOKE_TEST === "1",
    loadAppSession: () => ipcRenderer.invoke("app-session:load"),
    saveAppSession: (payload) => ipcRenderer.send("app-session:save", payload),
    saveAppSessionFile: (payload) => ipcRenderer.invoke("app-session:save-file", payload),
    openAppSessionFile: () => ipcRenderer.invoke("app-session:open-file"),
    restoreWorkspaceSession: (payload) => ipcRenderer.invoke("workspace-session:restore", payload),
    getWorkspaceDirectoryState: () => ipcRenderer.invoke("workspace-directory:state"),
    openWorkspaceDirectory: () => ipcRenderer.invoke("workspace-directory:open"),
    chooseCanvasWorkspace: () => ipcRenderer.invoke("workspace-directory:choose-canvas"),
    refreshWorkspaceDirectory: (options = {}) => ipcRenderer.invoke("workspace-directory:refresh", {
      expandedDirectoryPaths: Array.isArray(options?.expandedDirectoryPaths)
        ? options.expandedDirectoryPaths.filter((directoryPath) => typeof directoryPath === "string")
        : []
    }),
    activateWorkspaceFolder: (folderId) => ipcRenderer.invoke("workspace-folder:activate", { folderId }),
    reorderWorkspaceFolder: (folderId, targetIndex) => ipcRenderer.invoke("workspace-folder:reorder", { folderId, targetIndex }),
    removeWorkspaceFolder: (folderId) => ipcRenderer.invoke("workspace-folder:remove", { folderId }),
    debugOpenWorkspaceDirectory: (directoryPath) => ipcRenderer.invoke("workspace-directory:debug-open", { directoryPath }),
    readWorkspaceFile: (folderId, relativePath) => ipcRenderer.invoke("workspace-file:read", { folderId, relativePath }),
    saveWorkspaceFile: (folderId, relativePath, textContents, expectedLastModifiedMs) => ipcRenderer.invoke("workspace-file:write", {
      folderId,
      relativePath,
      textContents,
      expectedLastModifiedMs
    }),
    revealWorkspaceEntry: (folderId, relativePath) => ipcRenderer.invoke("workspace-entry:reveal", { folderId, relativePath }),
    openWorkspaceFileExternally: (folderId, relativePath) => ipcRenderer.invoke("workspace-file:open-external", { folderId, relativePath }),
    revealWorkspaceFile: (folderId, relativePath) => ipcRenderer.invoke("workspace-file:reveal", { folderId, relativePath }),
    createWorkspaceFile: (folderId, parentRelativePath, name) => ipcRenderer.invoke("workspace-entry:create-file", {
      folderId,
      parentRelativePath,
      name
    }),
    createWorkspaceDirectory: (folderId, parentRelativePath, name) => ipcRenderer.invoke("workspace-entry:create-directory", {
      folderId,
      parentRelativePath,
      name
    }),
    renameWorkspaceEntry: (folderId, relativePath, nextName) => ipcRenderer.invoke("workspace-entry:rename", {
      folderId,
      relativePath,
      nextName
    }),
    deleteWorkspaceEntry: (folderId, relativePath) => ipcRenderer.invoke("workspace-entry:delete", {
      folderId,
      relativePath
    }),
    setActiveTerminalShortcutState: (hasActiveTerminal) => ipcRenderer.send("terminal:active-state", {
      hasActiveTerminal: hasActiveTerminal === true
    }),
    updateAttentionState: (payload) => ipcRenderer.send("attention:update", {
      count: Number.isInteger(payload?.count) && payload.count >= 0 ? payload.count : 0,
      newlyFlagged: Array.isArray(payload?.newlyFlagged)
        ? payload.newlyFlagged
            .filter((item) => typeof item?.title === "string")
            .map((item) => ({ title: item.title, state: typeof item.state === "string" ? item.state : "needs-input" }))
        : []
    }),
    createTerminal: (payload) => ipcRenderer.invoke("terminal:create", payload),
    resolveTrackedTerminalCwds: (terminalIds) => ipcRenderer.invoke("terminal:resolve-tracked-cwds", { terminalIds }),
    writeTerminal: (terminalId, data) => ipcRenderer.invoke("terminal:write", { terminalId, data }),
    resizeTerminal: (terminalId, cols, rows) => ipcRenderer.invoke("terminal:resize", { terminalId, cols, rows }),
    redrawTerminal: (terminalId) => ipcRenderer.invoke("terminal:redraw", { terminalId }),
    destroyTerminal: (terminalId, options = {}) => ipcRenderer.invoke("terminal:destroy", {
      terminalId,
      sessionKey: typeof options?.sessionKey === "string" ? options.sessionKey : null,
      tmuxSessionName: typeof options?.tmuxSessionName === "string" ? options.tmuxSessionName : null,
      preserveSession: options?.preserveSession === true,
      retainDetachedIdentity: options?.retainDetachedIdentity === true
    }),
    syncCanvasAgentProject: (payload) => ipcRenderer.invoke("canvas-agent:sync", payload),
    subscribeCanvasAgentChanges: (payload) => ipcRenderer.invoke("canvas-agent:subscribe", payload),
    unsubscribeCanvasAgentChanges: (payload) => ipcRenderer.invoke("canvas-agent:unsubscribe", payload),
    deleteCanvasAgent: (agentName) => ipcRenderer.invoke("canvas-agent:delete", { agentName }),
    reparentCanvasAgent: (agentName, parentAgentName, projectTag) => ipcRenderer.invoke("canvas-agent:reparent", {
      agentName,
      parentAgentName,
      projectTag
    }),
    sendCanvasAgentPrompt: (agentName, message) => ipcRenderer.invoke("canvas-agent:send", { agentName, message }),
    connectCanvasAgents: (agentA, agentB) => ipcRenderer.invoke("canvas-agent:connect", { agentA, agentB }),
    adoptCanvasAgent: (payload) => ipcRenderer.invoke("canvas-agent:adopt", payload),
    resumeCanvasAgent: (payload) => ipcRenderer.invoke("canvas-agent:resume", payload),
    restartCanvasAgent: (payload) => ipcRenderer.invoke("canvas-agent:restart", payload),
    updateCanvasSnapshot: (payload) => ipcRenderer.invoke("canvas-snapshot:update", payload),
    getAgentSkillStatus: () => ipcRenderer.invoke("agent-skill:status"),
    installAgentSkill: () => ipcRenderer.invoke("agent-skill:install"),
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
    },
    onCanvasAgentChanged: (callback) => {
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on("canvas-agent:changed", listener);

      return () => {
        ipcRenderer.removeListener("canvas-agent:changed", listener);
      };
    },
    onToggleActiveTerminalMaximize: (callback) => {
      const listener = () => callback();
      ipcRenderer.on("terminal:toggle-maximize-active", listener);

      return () => {
        ipcRenderer.removeListener("terminal:toggle-maximize-active", listener);
      };
    },
    onAgentSkillInstallRequested: (callback) => {
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on("agent-skill:install-requested", listener);

      return () => {
        ipcRenderer.removeListener("agent-skill:install-requested", listener);
      };
    }
  })
);
