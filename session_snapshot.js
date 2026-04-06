const path = require("node:path");

const APP_SESSION_VERSION = 1;

function normalizeBoolean(value) {
  return value === true;
}

function normalizeString(value) {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function normalizeSessionKey(value) {
  const normalizedValue = normalizeString(value);

  return normalizedValue !== null && /^[A-Za-z0-9_-]+$/u.test(normalizedValue)
    ? normalizedValue
    : null;
}

function normalizeNumber(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function normalizeWorkspaceSnapshot(workspace) {
  const importedRootPaths = [];
  const seenRootPaths = new Set();

  if (Array.isArray(workspace?.importedRootPaths)) {
    workspace.importedRootPaths.forEach((rootPath) => {
      const normalizedRootPath = normalizeString(rootPath);

      if (normalizedRootPath !== null && !seenRootPaths.has(normalizedRootPath)) {
        seenRootPaths.add(normalizedRootPath);
        importedRootPaths.push(normalizedRootPath);
      }
    });
  }

  const expandedDirectoriesByRootPath = [];

  if (Array.isArray(workspace?.expandedDirectoriesByRootPath)) {
    workspace.expandedDirectoriesByRootPath.forEach((entry) => {
      const rootPath = normalizeString(entry?.rootPath);

      if (rootPath === null || !seenRootPaths.has(rootPath)) {
        return;
      }

      const directoryPaths = [];
      const seenDirectoryPaths = new Set();

      if (Array.isArray(entry?.directoryPaths)) {
        entry.directoryPaths.forEach((directoryPath) => {
          const normalizedDirectoryPath = normalizeString(directoryPath);

          if (normalizedDirectoryPath !== null && !seenDirectoryPaths.has(normalizedDirectoryPath)) {
            seenDirectoryPaths.add(normalizedDirectoryPath);
            directoryPaths.push(normalizedDirectoryPath);
          }
        });
      }

      if (directoryPaths.length > 0) {
        expandedDirectoriesByRootPath.push({
          rootPath,
          directoryPaths
        });
      }
    });
  }

  const activeRootPath = (() => {
    const normalizedRootPath = normalizeString(workspace?.activeRootPath);
    return normalizedRootPath !== null && seenRootPaths.has(normalizedRootPath)
      ? normalizedRootPath
      : null;
  })();

  const previewRootPath = normalizeString(workspace?.preview?.rootPath);
  const previewRelativePath = normalizeString(workspace?.preview?.relativePath);
  const preview = previewRootPath !== null && previewRelativePath !== null && seenRootPaths.has(previewRootPath)
    ? {
        rootPath: previewRootPath,
        relativePath: previewRelativePath
      }
    : null;

  return {
    importedRootPaths,
    activeRootPath,
    expandedDirectoriesByRootPath,
    preview
  };
}

function normalizeCanvasWorkspaceSnapshot(workspace) {
  const rootPath = normalizeString(workspace?.rootPath);

  if (rootPath === null) {
    return null;
  }

  const expandedDirectoryPaths = [];
  const seenDirectoryPaths = new Set();

  if (Array.isArray(workspace?.expandedDirectoryPaths)) {
    workspace.expandedDirectoryPaths.forEach((directoryPath) => {
      const normalizedDirectoryPath = normalizeString(directoryPath);

      if (normalizedDirectoryPath !== null && !seenDirectoryPaths.has(normalizedDirectoryPath)) {
        seenDirectoryPaths.add(normalizedDirectoryPath);
        expandedDirectoryPaths.push(normalizedDirectoryPath);
      }
    });
  }

  return {
    rootPath,
    rootName: normalizeString(workspace?.rootName) ?? (path.basename(rootPath) || rootPath),
    expandedDirectoryPaths,
    previewRelativePath: normalizeString(workspace?.previewRelativePath)
  };
}

function migrateLegacyWorkspaceToCanvas(workspace) {
  const normalizedWorkspace = normalizeWorkspaceSnapshot(workspace);
  const rootPath = normalizedWorkspace.activeRootPath;

  if (rootPath === null) {
    return null;
  }

  const expandedDirectoryPaths = normalizedWorkspace.expandedDirectoriesByRootPath.find(
    (entry) => entry.rootPath === rootPath
  )?.directoryPaths ?? [];

  return {
    rootPath,
    rootName: path.basename(rootPath) || rootPath,
    expandedDirectoryPaths,
    previewRelativePath: normalizedWorkspace.preview?.rootPath === rootPath
      ? normalizedWorkspace.preview.relativePath
      : null
  };
}

function normalizeTerminalNodeSnapshot(nodeSnapshot) {
  return {
    sessionKey: normalizeSessionKey(nodeSnapshot?.sessionKey),
    x: normalizeNumber(nodeSnapshot?.x, 0),
    y: normalizeNumber(nodeSnapshot?.y, 0),
    width: normalizeNumber(nodeSnapshot?.width, 544),
    height: normalizeNumber(nodeSnapshot?.height, 352),
    cwd: normalizeString(nodeSnapshot?.cwd),
    shellName: normalizeString(nodeSnapshot?.shellName) ?? "Shell",
    title: normalizeString(nodeSnapshot?.title) ?? "",
    isMaximized: normalizeBoolean(nodeSnapshot?.isMaximized),
    isExited: normalizeBoolean(nodeSnapshot?.isExited),
    exitCode: Number.isInteger(nodeSnapshot?.exitCode) ? nodeSnapshot.exitCode : null,
    exitSignal: normalizeString(nodeSnapshot?.exitSignal)
  };
}

function normalizeCanvasSnapshots(canvases) {
  const normalizedCanvases = [];
  const seenCanvasIds = new Set();

  if (!Array.isArray(canvases)) {
    return normalizedCanvases;
  }

  canvases.forEach((canvasSnapshot, index) => {
    const canvasId = normalizeString(canvasSnapshot?.id) ?? `canvas-${index + 1}`;

    if (seenCanvasIds.has(canvasId)) {
      return;
    }

    seenCanvasIds.add(canvasId);
    normalizedCanvases.push({
      id: canvasId,
      name: normalizeString(canvasSnapshot?.name) ?? `Canvas ${index + 1}`,
      viewportOffset: {
        x: normalizeNumber(canvasSnapshot?.viewportOffset?.x, 0),
        y: normalizeNumber(canvasSnapshot?.viewportOffset?.y, 0)
      },
      viewportScale: normalizeNumber(canvasSnapshot?.viewportScale, 1),
      workspace: normalizeCanvasWorkspaceSnapshot(canvasSnapshot?.workspace),
      terminalNodes: Array.isArray(canvasSnapshot?.terminalNodes)
        ? canvasSnapshot.terminalNodes.map(normalizeTerminalNodeSnapshot)
        : []
    });
  });

  return normalizedCanvases;
}

function normalizeAppSessionSnapshot(snapshot) {
  const canvases = normalizeCanvasSnapshots(snapshot?.canvases);
  const canvasIds = new Set(canvases.map((canvasSnapshot) => canvasSnapshot.id));
  const activeCanvasId = (() => {
    const normalizedCanvasId = normalizeString(snapshot?.activeCanvasId);
    return normalizedCanvasId !== null && canvasIds.has(normalizedCanvasId)
      ? normalizedCanvasId
      : (canvases[0]?.id ?? null);
  })();
  const migratedWorkspace = migrateLegacyWorkspaceToCanvas(snapshot?.workspace);

  if (migratedWorkspace !== null) {
    const activeCanvas = canvases.find((canvasSnapshot) => canvasSnapshot.id === activeCanvasId);

    if (activeCanvas !== undefined && activeCanvas.workspace === null) {
      activeCanvas.workspace = migratedWorkspace;
    }
  }

  return {
    version: APP_SESSION_VERSION,
    ui: {
      isSidebarCollapsed: snapshot?.ui?.isSidebarCollapsed !== false,
      hasDismissedBoardIntro: normalizeBoolean(snapshot?.ui?.hasDismissedBoardIntro)
    },
    canvases,
    activeCanvasId
  };
}

module.exports = {
  APP_SESSION_VERSION,
  normalizeAppSessionSnapshot
};
