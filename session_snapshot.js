const path = require("node:path");

const APP_SESSION_VERSION = 2;
const DEFAULT_NODE_WIDTH = 636;
const DEFAULT_NODE_HEIGHT = 414;
const PREVIOUS_DEFAULT_NODE_WIDTH = 848;
const PREVIOUS_DEFAULT_NODE_HEIGHT = 552;
const DEFAULT_NOTE_WIDTH = 260;
const DEFAULT_NOTE_HEIGHT = 180;
const MIN_NOTE_WIDTH = 140;
const MIN_NOTE_HEIGHT = 100;
const MAX_NOTE_TEXT_LENGTH = 20000;

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

function normalizeTerminalNodeSnapshot(nodeSnapshot, options = {}) {
  let width = normalizeNumber(nodeSnapshot?.width, DEFAULT_NODE_WIDTH);
  let height = normalizeNumber(nodeSnapshot?.height, DEFAULT_NODE_HEIGHT);

  if (
    options.migratePreviousDefaultSize === true
    && width === PREVIOUS_DEFAULT_NODE_WIDTH
    && height === PREVIOUS_DEFAULT_NODE_HEIGHT
  ) {
    width = DEFAULT_NODE_WIDTH;
    height = DEFAULT_NODE_HEIGHT;
  }

  return {
    sessionKey: normalizeSessionKey(nodeSnapshot?.sessionKey),
    managedAgentName: normalizeString(nodeSnapshot?.managedAgentName),
    managedAgentRole: normalizeString(nodeSnapshot?.managedAgentRole),
    managedProjectTag: normalizeString(nodeSnapshot?.managedProjectTag),
    tmuxSessionName: normalizeString(nodeSnapshot?.tmuxSessionName),
    x: normalizeNumber(nodeSnapshot?.x, 0),
    y: normalizeNumber(nodeSnapshot?.y, 0),
    width,
    height,
    cwd: normalizeString(nodeSnapshot?.cwd),
    shellName: normalizeString(nodeSnapshot?.shellName) ?? "Shell",
    title: normalizeString(nodeSnapshot?.title) ?? "",
    isMaximized: normalizeBoolean(nodeSnapshot?.isMaximized),
    isExited: normalizeBoolean(nodeSnapshot?.isExited),
    exitCode: Number.isInteger(nodeSnapshot?.exitCode) ? nodeSnapshot.exitCode : null,
    exitSignal: normalizeString(nodeSnapshot?.exitSignal)
  };
}

function normalizeCanvasNoteSnapshot(noteSnapshot) {
  if (noteSnapshot == null || typeof noteSnapshot !== "object") {
    return null;
  }

  const id = normalizeString(noteSnapshot?.id);

  if (id === null) {
    return null;
  }

  const rawText = typeof noteSnapshot?.text === "string" ? noteSnapshot.text : "";
  const text = rawText.length > MAX_NOTE_TEXT_LENGTH ? rawText.slice(0, MAX_NOTE_TEXT_LENGTH) : rawText;

  return {
    id,
    x: normalizeNumber(noteSnapshot?.x, 0),
    y: normalizeNumber(noteSnapshot?.y, 0),
    width: Math.max(MIN_NOTE_WIDTH, normalizeNumber(noteSnapshot?.width, DEFAULT_NOTE_WIDTH)),
    height: Math.max(MIN_NOTE_HEIGHT, normalizeNumber(noteSnapshot?.height, DEFAULT_NOTE_HEIGHT)),
    text
  };
}

function getTerminalNodeIdentityKeys(canvasSnapshot, nodeSnapshot) {
  const identityKeys = [];

  if (nodeSnapshot.tmuxSessionName !== null) {
    identityKeys.push(`tmux:${nodeSnapshot.tmuxSessionName}`);
  }

  if (nodeSnapshot.sessionKey !== null) {
    identityKeys.push(`session:${nodeSnapshot.sessionKey}`);
  }

  if (nodeSnapshot.managedAgentName !== null) {
    const projectTag = nodeSnapshot.managedProjectTag ?? canvasSnapshot.agentProjectTag;

    if (projectTag !== null) {
      identityKeys.push(`agent:${projectTag}:${nodeSnapshot.managedAgentName}`);
    }
  }

  return identityKeys;
}

function getTerminalNodePreferenceScore(canvasSnapshot, nodeSnapshot) {
  let score = 0;

  if (
    nodeSnapshot.managedProjectTag !== null
    && nodeSnapshot.managedProjectTag === canvasSnapshot.agentProjectTag
  ) {
    score += 100;
  }

  if (
    nodeSnapshot.sessionKey !== null
    && nodeSnapshot.tmuxSessionName === `termcanvas-${nodeSnapshot.sessionKey}`
  ) {
    score += 20;
  }

  if (
    nodeSnapshot.title.length > 0
    && nodeSnapshot.title !== nodeSnapshot.managedAgentName
    && nodeSnapshot.title !== `${nodeSnapshot.managedAgentName} (Agent)`
  ) {
    score += 1;
  }

  return score;
}

function deduplicateTerminalNodeSnapshots(canvases) {
  const candidates = [];

  canvases.forEach((canvasSnapshot, canvasIndex) => {
    canvasSnapshot.terminalNodes.forEach((nodeSnapshot, nodeIndex) => {
      candidates.push({
        canvasSnapshot,
        canvasIndex,
        nodeSnapshot,
        nodeIndex,
        identityKeys: getTerminalNodeIdentityKeys(canvasSnapshot, nodeSnapshot)
      });
    });
  });

  const parents = candidates.map((_candidate, index) => index);

  function findRoot(index) {
    let rootIndex = index;

    while (parents[rootIndex] !== rootIndex) {
      rootIndex = parents[rootIndex];
    }

    while (parents[index] !== index) {
      const parentIndex = parents[index];
      parents[index] = rootIndex;
      index = parentIndex;
    }

    return rootIndex;
  }

  function union(leftIndex, rightIndex) {
    const leftRoot = findRoot(leftIndex);
    const rightRoot = findRoot(rightIndex);

    if (leftRoot !== rightRoot) {
      parents[rightRoot] = leftRoot;
    }
  }

  const candidateIndexByIdentity = new Map();

  candidates.forEach((candidate, candidateIndex) => {
    candidate.identityKeys.forEach((identityKey) => {
      const existingIndex = candidateIndexByIdentity.get(identityKey);

      if (existingIndex === undefined) {
        candidateIndexByIdentity.set(identityKey, candidateIndex);
      } else {
        union(existingIndex, candidateIndex);
      }
    });
  });

  const winnerIndexByRoot = new Map();

  candidates.forEach((candidate, candidateIndex) => {
    const rootIndex = findRoot(candidateIndex);
    const currentWinnerIndex = winnerIndexByRoot.get(rootIndex);

    if (currentWinnerIndex === undefined) {
      winnerIndexByRoot.set(rootIndex, candidateIndex);
      return;
    }

    const currentWinner = candidates[currentWinnerIndex];
    const candidateScore = getTerminalNodePreferenceScore(candidate.canvasSnapshot, candidate.nodeSnapshot);
    const currentWinnerScore = getTerminalNodePreferenceScore(currentWinner.canvasSnapshot, currentWinner.nodeSnapshot);

    if (candidateScore > currentWinnerScore) {
      winnerIndexByRoot.set(rootIndex, candidateIndex);
    }
  });

  const winnerIndexes = new Set(winnerIndexByRoot.values());

  canvases.forEach((canvasSnapshot, canvasIndex) => {
    canvasSnapshot.terminalNodes = candidates
      .map((candidate, candidateIndex) => ({ candidate, candidateIndex }))
      .filter(({ candidate, candidateIndex }) => (
        candidate.canvasIndex === canvasIndex && winnerIndexes.has(candidateIndex)
      ))
      .sort((left, right) => left.candidate.nodeIndex - right.candidate.nodeIndex)
      .map(({ candidate }) => candidate.nodeSnapshot);

    const remainingSessionKeys = new Set(
      canvasSnapshot.terminalNodes
        .map((nodeSnapshot) => nodeSnapshot.sessionKey)
        .filter((sessionKey) => sessionKey !== null)
    );

    if (!remainingSessionKeys.has(canvasSnapshot.activeSessionKey)) {
      canvasSnapshot.activeSessionKey = null;
    }
  });

  return canvases;
}

function normalizeCanvasSnapshots(canvases, options = {}) {
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
    const terminalNodes = Array.isArray(canvasSnapshot?.terminalNodes)
      ? canvasSnapshot.terminalNodes.map((nodeSnapshot) => normalizeTerminalNodeSnapshot(nodeSnapshot, options))
      : [];
    const notes = Array.isArray(canvasSnapshot?.notes)
      ? canvasSnapshot.notes
        .map((noteSnapshot) => normalizeCanvasNoteSnapshot(noteSnapshot))
        .filter((note) => note !== null)
      : [];
    const terminalSessionKeys = new Set(
      terminalNodes
        .map((nodeSnapshot) => nodeSnapshot.sessionKey)
        .filter((sessionKey) => sessionKey !== null)
    );
    const activeSessionKey = (() => {
      const normalizedSessionKey = normalizeSessionKey(canvasSnapshot?.activeSessionKey);
      return normalizedSessionKey !== null && terminalSessionKeys.has(normalizedSessionKey)
        ? normalizedSessionKey
        : null;
    })();

    normalizedCanvases.push({
      id: canvasId,
      name: normalizeString(canvasSnapshot?.name) ?? `Canvas ${index + 1}`,
      viewportOffset: {
        x: normalizeNumber(canvasSnapshot?.viewportOffset?.x, 0),
        y: normalizeNumber(canvasSnapshot?.viewportOffset?.y, 0)
      },
      viewportScale: normalizeNumber(canvasSnapshot?.viewportScale, 1),
      workspace: normalizeCanvasWorkspaceSnapshot(canvasSnapshot?.workspace),
      agentProjectTag: normalizeString(canvasSnapshot?.agentProjectTag),
      activeSessionKey,
      terminalNodes,
      notes
    });
  });

  return deduplicateTerminalNodeSnapshots(normalizedCanvases);
}

function normalizeAppSessionSnapshot(snapshot) {
  const snapshotVersion = Number.isInteger(snapshot?.version) ? snapshot.version : 0;
  const canvases = normalizeCanvasSnapshots(snapshot?.canvases, {
    migratePreviousDefaultSize: snapshotVersion < APP_SESSION_VERSION
  });
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

  const normalizedSidebarView = snapshot?.ui?.activeSidebarView === "terminals"
    ? "terminals"
    : "explorer";

  const normalizedCollapsedAgentNames = (() => {
    if (!Array.isArray(snapshot?.ui?.collapsedAgentNamesByCanvasId)) {
      return [];
    }
    return snapshot.ui.collapsedAgentNamesByCanvasId.flatMap((entry) => {
      if (typeof entry?.canvasId !== "string" || entry.canvasId.length === 0) {
        return [];
      }
      const agentNames = Array.isArray(entry.agentNames)
        ? entry.agentNames.filter((name) => typeof name === "string" && name.length > 0)
        : [];
      if (agentNames.length === 0) {
        return [];
      }
      return [{ canvasId: entry.canvasId, agentNames }];
    });
  })();

  return {
    version: APP_SESSION_VERSION,
    ui: {
      isRailCollapsed: normalizeBoolean(snapshot?.ui?.isRailCollapsed),
      isSidebarCollapsed: snapshot?.ui?.isSidebarCollapsed !== false,
      hasDismissedBoardIntro: normalizeBoolean(snapshot?.ui?.hasDismissedBoardIntro),
      activeSidebarView: normalizedSidebarView,
      collapsedAgentNamesByCanvasId: normalizedCollapsedAgentNames
    },
    canvases,
    activeCanvasId
  };
}

module.exports = {
  APP_SESSION_VERSION,
  normalizeAppSessionSnapshot
};
