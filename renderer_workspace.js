(function (root, factory) {
  const exports = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = exports;
  }

  if (root && typeof root === "object") {
    root.noteCanvasRendererWorkspace = exports;

    if (root.window && typeof root.window === "object") {
      root.window.noteCanvasRendererWorkspace = exports;
    }
  }
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  function normalizeString(value) {
    return typeof value === "string" && value.length > 0 ? value : null;
  }

  function normalizeDirectoryPaths(directoryPaths) {
    if (!Array.isArray(directoryPaths)) {
      return [];
    }

    const seen = new Set();
    const normalizedPaths = [];

    directoryPaths.forEach((directoryPath) => {
      if (typeof directoryPath !== "string" || directoryPath.length === 0 || seen.has(directoryPath)) {
        return;
      }

      seen.add(directoryPath);
      normalizedPaths.push(directoryPath);
    });

    return normalizedPaths;
  }

  function normalizeCanvasWorkspaceRecord(workspace) {
    const rootPath = normalizeString(workspace?.rootPath);

    if (rootPath === null) {
      return null;
    }

    return {
      rootPath,
      rootName: normalizeString(workspace?.rootName) ?? rootPath,
      expandedDirectoryPaths: normalizeDirectoryPaths(workspace?.expandedDirectoryPaths),
      previewRelativePath: normalizeString(workspace?.previewRelativePath)
    };
  }

  function getWorkspaceEntryParentPath(relativePath) {
    const segments = relativePath.split("/");
    segments.pop();
    return segments.join("/");
  }

  function normalizeWorkspaceEntries(entries) {
    if (!Array.isArray(entries)) {
      return [];
    }

    return entries.flatMap((entry) => {
      if (typeof entry?.relativePath !== "string" || entry.relativePath.length === 0) {
        return [];
      }

      return [{
        relativePath: entry.relativePath,
        kind: entry.kind === "directory" ? "directory" : "file"
      }];
    });
  }

  function normalizeWorkspaceFolders(folders) {
    if (!Array.isArray(folders)) {
      return [];
    }

    return folders.flatMap((folder) => {
      const rootPath = normalizeString(folder?.rootPath);

      if (rootPath === null || typeof folder?.id !== "string") {
        return [];
      }

      return [{
        id: folder.id,
        rootPath,
        rootName: normalizeString(folder?.rootName) ?? rootPath,
        entries: normalizeWorkspaceEntries(folder.entries)
      }];
    });
  }

  function appendPreviewAncestors(expandedDirectoryPaths, previewRelativePath) {
    if (typeof previewRelativePath !== "string" || previewRelativePath.length === 0) {
      return expandedDirectoryPaths;
    }

    const nextExpandedDirectories = new Set(expandedDirectoryPaths);
    let parentPath = getWorkspaceEntryParentPath(previewRelativePath);

    while (parentPath.length > 0) {
      nextExpandedDirectories.add(parentPath);
      parentPath = getWorkspaceEntryParentPath(parentPath);
    }

    return [...nextExpandedDirectories];
  }

  function getCanvasWorkspaceRootPath(canvasRecord) {
    return normalizeCanvasWorkspaceRecord(canvasRecord?.workspace)?.rootPath ?? null;
  }

  function getCanvasWorkspaceExpandedDirectories(canvasRecord) {
    return normalizeCanvasWorkspaceRecord(canvasRecord?.workspace)?.expandedDirectoryPaths ?? [];
  }

  function getCanvasWorkspacePreviewRelativePath(canvasRecord) {
    return normalizeCanvasWorkspaceRecord(canvasRecord?.workspace)?.previewRelativePath ?? null;
  }

  function syncCanvasWorkspaceFromLiveState(canvasRecord, liveWorkspaceState) {
    const normalizedWorkspace = normalizeCanvasWorkspaceRecord(liveWorkspaceState);
    canvasRecord.workspace = normalizedWorkspace;
    return normalizedWorkspace;
  }

  function toggleCanvasWorkspaceExpandedDirectory(canvasRecord, relativePath) {
    const normalizedPath = normalizeString(relativePath);
    const currentWorkspace = normalizeCanvasWorkspaceRecord(canvasRecord?.workspace);

    if (normalizedPath === null || currentWorkspace === null) {
      return currentWorkspace;
    }

    const expandedDirectories = new Set(currentWorkspace.expandedDirectoryPaths);

    if (expandedDirectories.has(normalizedPath)) {
      expandedDirectories.delete(normalizedPath);
    } else {
      expandedDirectories.add(normalizedPath);
    }

    canvasRecord.workspace = {
      ...currentWorkspace,
      expandedDirectoryPaths: [...expandedDirectories]
    };

    return canvasRecord.workspace;
  }

  function deriveCanvasWorkspaceAfterRestore(canvasRecord, workspaceState) {
    const currentWorkspace = normalizeCanvasWorkspaceRecord(canvasRecord?.workspace);

    if (currentWorkspace === null) {
      return null;
    }

    const importedFolders = normalizeWorkspaceFolders(workspaceState?.importedFolders);
    const activeFolderId = normalizeString(workspaceState?.activeFolderId);
    const activeFolder = importedFolders.find((folderRecord) => folderRecord.id === activeFolderId)
      ?? importedFolders.find((folderRecord) => folderRecord.rootPath === currentWorkspace.rootPath)
      ?? null;

    if (activeFolder === null || activeFolder.rootPath !== currentWorkspace.rootPath) {
      return null;
    }

    const validDirectoryPaths = new Set(
      activeFolder.entries
        .filter((entry) => entry.kind === "directory")
        .map((entry) => entry.relativePath)
    );
    const validFilePaths = new Set(
      activeFolder.entries
        .filter((entry) => entry.kind === "file")
        .map((entry) => entry.relativePath)
    );
    const previewRelativePath = validFilePaths.has(currentWorkspace.previewRelativePath)
      ? currentWorkspace.previewRelativePath
      : null;

    return {
      rootPath: activeFolder.rootPath,
      rootName: activeFolder.rootName,
      expandedDirectoryPaths: appendPreviewAncestors(
        currentWorkspace.expandedDirectoryPaths.filter((directoryPath) => validDirectoryPaths.has(directoryPath)),
        previewRelativePath
      ),
      previewRelativePath
    };
  }

  function shouldApplyCanvasWorkspaceRestoreResult({ restoreToken, activeRestoreToken, activeCanvasId, targetCanvasId }) {
    return restoreToken === activeRestoreToken && activeCanvasId === targetCanvasId;
  }

  return {
    normalizeCanvasWorkspaceRecord,
    syncCanvasWorkspaceFromLiveState,
    toggleCanvasWorkspaceExpandedDirectory,
    deriveCanvasWorkspaceAfterRestore,
    shouldApplyCanvasWorkspaceRestoreResult,
    getCanvasWorkspaceExpandedDirectories,
    getCanvasWorkspacePreviewRelativePath,
    getCanvasWorkspaceRootPath
  };
});
