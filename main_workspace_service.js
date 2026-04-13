const fs = require("node:fs");
const path = require("node:path");

const {
  activateWorkspaceFolder,
  createWorkspaceRegistry,
  getWorkspaceFolder,
  importWorkspaceFolder,
  reorderWorkspaceFolder,
  removeWorkspaceFolder,
  serializeWorkspaceRegistry,
  setWorkspaceFolderError,
  updateWorkspaceFolderSnapshot
} = require("./workspace_registry");

function createWorkspaceService({
  app,
  shell,
  sendToOwner,
  createDirectorySnapshotAsync,
  readWorkspaceFilePreviewAsync,
  resolveWorkspaceFilePath,
  resolveExistingDirectoryPath,
  workspaceWatchDebounceMs
}) {
  const fsp = fs.promises;
  const workspaceRegistries = new Map();
  const workspaceWatchers = new Map();

  function getExistingOwnerWorkspaceRegistry(ownerWebContentsId) {
    return workspaceRegistries.get(ownerWebContentsId) ?? null;
  }

  function getOwnerWorkspaceRegistry(ownerWebContentsId) {
    let workspaceRegistry = getExistingOwnerWorkspaceRegistry(ownerWebContentsId);

    if (workspaceRegistry == null) {
      workspaceRegistry = createWorkspaceRegistry();
      workspaceRegistries.set(ownerWebContentsId, workspaceRegistry);
    }

    return workspaceRegistry;
  }

  function getActiveWorkspaceFolderForOwner(ownerWebContentsId) {
    const workspaceRegistry = getExistingOwnerWorkspaceRegistry(ownerWebContentsId);

    if (workspaceRegistry == null || workspaceRegistry.activeFolderId === null) {
      return null;
    }

    return getWorkspaceFolder(workspaceRegistry, workspaceRegistry.activeFolderId);
  }

  function isPathWithinDirectory(rootPath, targetPath) {
    const relativePath = path.relative(rootPath, targetPath);
    return relativePath !== ".." && !relativePath.startsWith(`..${path.sep}`) && !path.isAbsolute(relativePath);
  }

  function normalizeWorkspaceEntryName(value) {
    if (typeof value !== "string") {
      throw new Error("A workspace entry name is required.");
    }

    const trimmedValue = value.trim();

    if (trimmedValue.length === 0) {
      throw new Error("A workspace entry name is required.");
    }

    if (trimmedValue === "." || trimmedValue === ".." || /[\\/]/u.test(trimmedValue)) {
      throw new Error("Workspace entry names cannot contain path separators.");
    }

    return trimmedValue;
  }

  function getOwnedWorkspaceFolderRecord(ownerWebContentsId, folderId, missingFolderMessage) {
    const workspaceRegistry = getExistingOwnerWorkspaceRegistry(ownerWebContentsId);

    if (workspaceRegistry === null) {
      throw new Error(missingFolderMessage);
    }

    const workspaceFolder = getWorkspaceFolder(workspaceRegistry, folderId);

    if (workspaceFolder === null) {
      throw new Error(missingFolderMessage);
    }

    const resolvedRootPath = resolveExistingDirectoryPath(workspaceFolder.rootPath);

    if (resolvedRootPath === null) {
      throw new Error("Workspace folder is unavailable.");
    }

    return {
      workspaceFolder,
      rootPath: fs.realpathSync(resolvedRootPath)
    };
  }

  function resolveOwnedWorkspaceTarget(ownerWebContentsId, folderId, relativePath, missingFolderMessage) {
    const { workspaceFolder, rootPath } = getOwnedWorkspaceFolderRecord(ownerWebContentsId, folderId, missingFolderMessage);
    const normalizedRelativePath = typeof relativePath === "string" ? relativePath : "";
    const candidatePath = path.resolve(rootPath, normalizedRelativePath);

    if (!isPathWithinDirectory(rootPath, candidatePath)) {
      throw new Error("Workspace file preview must stay inside the workspace root.");
    }

    if (fs.existsSync(candidatePath)) {
      const realCandidatePath = fs.realpathSync(candidatePath);

      if (!isPathWithinDirectory(rootPath, realCandidatePath)) {
        throw new Error("Workspace file preview must stay inside the workspace root.");
      }

      return {
        workspaceFolder,
        rootPath,
        filePath: realCandidatePath,
        relativePath: path.relative(rootPath, realCandidatePath).split(path.sep).join("/")
      };
    }

    return {
      workspaceFolder,
      rootPath,
      filePath: candidatePath,
      relativePath: path.relative(rootPath, candidatePath).split(path.sep).join("/")
    };
  }

  function getOwnedWorkspaceFileTarget(ownerWebContentsId, folderId, relativePath, missingFolderMessage) {
    return resolveWorkspaceFilePath(
      getOwnedWorkspaceFolderRecord(ownerWebContentsId, folderId, missingFolderMessage).rootPath,
      relativePath
    );
  }

  function getOwnedWorkspaceDirectoryTarget(ownerWebContentsId, folderId, relativePath, missingFolderMessage) {
    const resolvedTarget = resolveOwnedWorkspaceTarget(ownerWebContentsId, folderId, relativePath, missingFolderMessage);
    const targetStats = fs.statSync(resolvedTarget.filePath);

    if (!targetStats.isDirectory()) {
      throw new Error("Workspace target must be a directory.");
    }

    return resolvedTarget;
  }

  function getExistingOwnedWorkspaceEntryTarget(ownerWebContentsId, folderId, relativePath, missingFolderMessage) {
    const resolvedTarget = resolveOwnedWorkspaceTarget(ownerWebContentsId, folderId, relativePath, missingFolderMessage);

    if (!fs.existsSync(resolvedTarget.filePath)) {
      throw new Error("Workspace entry was not found.");
    }

    return resolvedTarget;
  }

  function createOwnedWorkspaceEntry(ownerWebContentsId, folderId, parentRelativePath, name, kind) {
    const parentTarget = getOwnedWorkspaceDirectoryTarget(
      ownerWebContentsId,
      folderId,
      parentRelativePath,
      "Open a workspace folder before managing files."
    );
    const entryName = normalizeWorkspaceEntryName(name);
    const nextPath = path.resolve(parentTarget.filePath, entryName);

    if (!isPathWithinDirectory(parentTarget.rootPath, nextPath)) {
      throw new Error("Workspace file preview must stay inside the workspace root.");
    }

    if (fs.existsSync(nextPath)) {
      throw new Error("A file or folder with that name already exists.");
    }

    if (kind === "directory") {
      fs.mkdirSync(nextPath, { recursive: false });
    } else {
      fs.writeFileSync(nextPath, "", "utf8");
    }

    return {
      filePath: nextPath,
      relativePath: path.relative(parentTarget.rootPath, nextPath).split(path.sep).join("/")
    };
  }

  function renameOwnedWorkspaceEntry(ownerWebContentsId, folderId, relativePath, nextName) {
    const currentTarget = resolveOwnedWorkspaceTarget(
      ownerWebContentsId,
      folderId,
      relativePath,
      "Open a workspace folder before managing files."
    );
    const resolvedNextName = normalizeWorkspaceEntryName(nextName);
    const renamedPath = path.resolve(path.dirname(currentTarget.filePath), resolvedNextName);

    if (!fs.existsSync(currentTarget.filePath)) {
      throw new Error("Workspace entry was not found.");
    }

    if (!isPathWithinDirectory(currentTarget.rootPath, renamedPath)) {
      throw new Error("Workspace file preview must stay inside the workspace root.");
    }

    if (renamedPath !== currentTarget.filePath && fs.existsSync(renamedPath)) {
      throw new Error("A file or folder with that name already exists.");
    }

    fs.renameSync(currentTarget.filePath, renamedPath);

    return {
      filePath: renamedPath,
      relativePath: path.relative(currentTarget.rootPath, renamedPath).split(path.sep).join("/")
    };
  }

  function deleteOwnedWorkspaceEntry(ownerWebContentsId, folderId, relativePath) {
    const currentTarget = resolveOwnedWorkspaceTarget(
      ownerWebContentsId,
      folderId,
      relativePath,
      "Open a workspace folder before managing files."
    );

    if (!fs.existsSync(currentTarget.filePath)) {
      throw new Error("Workspace entry was not found.");
    }

    if (currentTarget.relativePath.length === 0) {
      throw new Error("The workspace root cannot be deleted.");
    }

    fs.rmSync(currentTarget.filePath, { recursive: true, force: false });
    return currentTarget.relativePath;
  }

  function destroyWorkspaceWatcher(ownerWebContentsId, folderId) {
    const ownerWatchers = workspaceWatchers.get(ownerWebContentsId);

    if (ownerWatchers == null) {
      return;
    }

    const workspaceWatcher = ownerWatchers.get(folderId);

    if (workspaceWatcher === undefined) {
      return;
    }

    if (workspaceWatcher.refreshTimeout !== 0) {
      clearTimeout(workspaceWatcher.refreshTimeout);
    }

    workspaceWatcher.watcher?.close();
    ownerWatchers.delete(folderId);

    if (ownerWatchers.size === 0) {
      workspaceWatchers.delete(ownerWebContentsId);
    }
  }

  function destroyOwnedWorkspaceWatchers(ownerWebContentsId) {
    const ownerWatchers = workspaceWatchers.get(ownerWebContentsId);

    if (ownerWatchers == null) {
      return;
    }

    ownerWatchers.forEach((workspaceWatcher) => {
      if (workspaceWatcher.refreshTimeout !== 0) {
        clearTimeout(workspaceWatcher.refreshTimeout);
      }

      workspaceWatcher.watcher?.close();
    });

    workspaceWatchers.delete(ownerWebContentsId);
  }

  function pushWorkspaceRegistryToOwner(ownerWebContentsId) {
    const workspaceRegistry = getExistingOwnerWorkspaceRegistry(ownerWebContentsId);

    if (workspaceRegistry === null) {
      sendToOwner(ownerWebContentsId, "workspace-directory:data", {
        importedFolders: [],
        activeFolderId: null
      });
      return;
    }

    sendToOwner(ownerWebContentsId, "workspace-directory:data", serializeWorkspaceRegistry(workspaceRegistry));
  }

  async function refreshWorkspaceFolderForOwner(ownerWebContentsId, folderId) {
    const workspaceRegistry = getExistingOwnerWorkspaceRegistry(ownerWebContentsId);

    if (workspaceRegistry === null) {
      return {
        importedFolders: [],
        activeFolderId: null
      };
    }

    const workspaceFolder = getWorkspaceFolder(workspaceRegistry, folderId);

    if (workspaceFolder === null) {
      destroyWorkspaceWatcher(ownerWebContentsId, folderId);
      return serializeWorkspaceRegistry(workspaceRegistry);
    }

    const resolvedDirectoryPath = resolveExistingDirectoryPath(workspaceFolder.rootPath);

    if (resolvedDirectoryPath === null) {
      setWorkspaceFolderError(workspaceRegistry, folderId, "Workspace folder is unavailable.");
      return serializeWorkspaceRegistry(workspaceRegistry);
    }

    try {
      updateWorkspaceFolderSnapshot(workspaceRegistry, folderId, {
        ...await createDirectorySnapshotAsync(resolvedDirectoryPath),
        lastError: ""
      });
    } catch {
      setWorkspaceFolderError(workspaceRegistry, folderId, "Workspace folder is unavailable.");
    }

    return serializeWorkspaceRegistry(workspaceRegistry);
  }

  async function requestWorkspaceFolderRefresh(ownerWebContentsId, folderId, options = {}) {
    const ownerWatchers = workspaceWatchers.get(ownerWebContentsId);
    const workspaceWatcher = ownerWatchers?.get(folderId);

    if (workspaceWatcher === undefined) {
      const nextState = await refreshWorkspaceFolderForOwner(ownerWebContentsId, folderId);

      if (options.pushToOwner === true) {
        pushWorkspaceRegistryToOwner(ownerWebContentsId);
      }

      return nextState;
    }

    workspaceWatcher.shouldPushSnapshot = workspaceWatcher.shouldPushSnapshot || options.pushToOwner === true;

    if (workspaceWatcher.refreshPromise != null) {
      workspaceWatcher.hasPendingRefresh = true;
      return workspaceWatcher.refreshPromise;
    }

    workspaceWatcher.refreshPromise = (async () => {
      let nextState = null;

      do {
        workspaceWatcher.hasPendingRefresh = false;
        const shouldPushSnapshot = workspaceWatcher.shouldPushSnapshot === true;
        workspaceWatcher.shouldPushSnapshot = false;
        nextState = await refreshWorkspaceFolderForOwner(ownerWebContentsId, folderId);

        if (shouldPushSnapshot) {
          pushWorkspaceRegistryToOwner(ownerWebContentsId);
        }
      } while (workspaceWatcher.hasPendingRefresh === true);

      return nextState;
    })();

    workspaceWatcher.refreshPromise.finally(() => {
      const shouldRestartRefresh = workspaceWatcher.hasPendingRefresh === true || workspaceWatcher.shouldPushSnapshot === true;
      workspaceWatcher.refreshPromise = null;

      if (shouldRestartRefresh) {
        void requestWorkspaceFolderRefresh(ownerWebContentsId, folderId);
      }
    });

    return workspaceWatcher.refreshPromise;
  }

  function scheduleWorkspaceSnapshotPush(ownerWebContentsId, folderId) {
    const ownerWatchers = workspaceWatchers.get(ownerWebContentsId);

    if (ownerWatchers == null) {
      return;
    }

    const workspaceWatcher = ownerWatchers.get(folderId);

    if (workspaceWatcher === undefined) {
      return;
    }

    if (workspaceWatcher.refreshTimeout !== 0) {
      clearTimeout(workspaceWatcher.refreshTimeout);
    }

    workspaceWatcher.refreshTimeout = setTimeout(() => {
      workspaceWatcher.refreshTimeout = 0;
      void requestWorkspaceFolderRefresh(ownerWebContentsId, folderId, { pushToOwner: true }).catch(() => {
        // Best effort refresh from watcher events.
      });
    }, workspaceWatchDebounceMs);
  }

  function watchWorkspaceDirectory(ownerWebContentsId, folderId, directoryPath) {
    destroyWorkspaceWatcher(ownerWebContentsId, folderId);

    try {
      const watcher = fs.watch(directoryPath, { recursive: true }, () => {
        scheduleWorkspaceSnapshotPush(ownerWebContentsId, folderId);
      });

      watcher.on("error", () => {
        scheduleWorkspaceSnapshotPush(ownerWebContentsId, folderId);
      });

      let ownerWatchers = workspaceWatchers.get(ownerWebContentsId);

      if (ownerWatchers == null) {
        ownerWatchers = new Map();
        workspaceWatchers.set(ownerWebContentsId, ownerWatchers);
      }

      ownerWatchers.set(folderId, {
        watcher,
        refreshTimeout: 0,
        refreshPromise: null,
        hasPendingRefresh: false,
        shouldPushSnapshot: false
      });
    } catch {
      const workspaceRegistry = getExistingOwnerWorkspaceRegistry(ownerWebContentsId);

      if (workspaceRegistry !== null) {
        setWorkspaceFolderError(workspaceRegistry, folderId, "Workspace folder watch is unavailable.");
        pushWorkspaceRegistryToOwner(ownerWebContentsId);
      }
    }
  }

  async function openWorkspaceDirectoryForOwner(ownerWebContentsId, directoryPath) {
    const resolvedDirectoryPath = resolveExistingDirectoryPath(directoryPath);

    if (resolvedDirectoryPath === null) {
      throw new Error("Selected workspace folder is unavailable.");
    }

    const canonicalDirectoryPath = fs.realpathSync(resolvedDirectoryPath);
    const workspaceRegistry = getOwnerWorkspaceRegistry(ownerWebContentsId);
    const snapshot = {
      ...await createDirectorySnapshotAsync(canonicalDirectoryPath),
      lastError: ""
    };
    const importResult = importWorkspaceFolder(workspaceRegistry, snapshot);

    if (importResult.deduplicated) {
      updateWorkspaceFolderSnapshot(workspaceRegistry, importResult.folderId, snapshot);
    }

    watchWorkspaceDirectory(ownerWebContentsId, importResult.folderId, canonicalDirectoryPath);
    return serializeWorkspaceRegistry(workspaceRegistry);
  }

  async function chooseCanvasWorkspaceForOwner(ownerWebContentsId, directoryPath) {
    const resolvedDirectoryPath = resolveExistingDirectoryPath(directoryPath);

    if (resolvedDirectoryPath === null) {
      throw new Error("Selected workspace folder is unavailable.");
    }

    const canonicalDirectoryPath = fs.realpathSync(resolvedDirectoryPath);
    const workspaceRegistry = createWorkspaceRegistry();
    const snapshot = {
      ...await createDirectorySnapshotAsync(canonicalDirectoryPath),
      lastError: ""
    };
    const importResult = importWorkspaceFolder(workspaceRegistry, snapshot);

    destroyOwnedWorkspaceWatchers(ownerWebContentsId);
    workspaceRegistries.set(ownerWebContentsId, workspaceRegistry);
    watchWorkspaceDirectory(ownerWebContentsId, importResult.folderId, canonicalDirectoryPath);
    return serializeWorkspaceRegistry(workspaceRegistry);
  }

  async function restoreWorkspaceSessionForOwner(ownerWebContentsId, snapshot) {
    destroyOwnedWorkspaceWatchers(ownerWebContentsId);
    workspaceRegistries.delete(ownerWebContentsId);

    const importedRootPaths = Array.isArray(snapshot?.importedRootPaths)
      ? snapshot.importedRootPaths.filter((rootPath) => typeof rootPath === "string")
      : [];
    const activeRootPath = typeof snapshot?.activeRootPath === "string" ? snapshot.activeRootPath : null;
    let lastState = {
      importedFolders: [],
      activeFolderId: null
    };

    for (const rootPath of importedRootPaths) {
      try {
        lastState = await openWorkspaceDirectoryForOwner(ownerWebContentsId, rootPath);
      } catch {
        // Skip missing or inaccessible workspace folders during session restore.
      }
    }

    const workspaceRegistry = getExistingOwnerWorkspaceRegistry(ownerWebContentsId);

    if (workspaceRegistry === null) {
      return lastState;
    }

    if (activeRootPath !== null) {
      const normalizedActiveRootPath = resolveExistingDirectoryPath(activeRootPath);
      let canonicalActiveRootPath = null;

      if (normalizedActiveRootPath !== null) {
        try {
          canonicalActiveRootPath = fs.realpathSync(normalizedActiveRootPath);
        } catch {
          canonicalActiveRootPath = null;
        }
      }

      const matchingFolder = canonicalActiveRootPath === null
        ? null
        : [...workspaceRegistry.importedFolders.values()].find((folderRecord) => folderRecord.rootPath === canonicalActiveRootPath) ?? null;

      if (matchingFolder !== null) {
        activateWorkspaceFolder(workspaceRegistry, matchingFolder.id);
        return requestWorkspaceFolderRefresh(ownerWebContentsId, matchingFolder.id);
      }
    }

    return workspaceRegistry.activeFolderId === null
      ? serializeWorkspaceRegistry(workspaceRegistry)
      : requestWorkspaceFolderRefresh(ownerWebContentsId, workspaceRegistry.activeFolderId);
  }

  async function refreshWorkspaceRegistryAfterMutation(ownerWebContentsId, folderId) {
    return requestWorkspaceFolderRefresh(ownerWebContentsId, folderId, { pushToOwner: true });
  }

  async function openFileExternally(ownerWebContentsId, folderId, relativePath) {
    return openOwnedWorkspaceEntry(
      ownerWebContentsId,
      folderId,
      relativePath,
      "Open a workspace folder before opening files externally."
    );
  }

  async function openOwnedWorkspaceEntry(ownerWebContentsId, folderId, relativePath, missingFolderMessage) {
    const resolvedTarget = getExistingOwnedWorkspaceEntryTarget(
      ownerWebContentsId,
      folderId,
      relativePath,
      missingFolderMessage
    );
    const openError = await shell.openPath(resolvedTarget.filePath);

    if (typeof openError === "string" && openError.length > 0) {
      throw new Error(openError);
    }

    return null;
  }

  function revealEntry(ownerWebContentsId, folderId, relativePath) {
    return revealOwnedWorkspaceEntry(
      ownerWebContentsId,
      folderId,
      relativePath,
      "Open a workspace folder before revealing entries."
    );
  }

  function revealFile(ownerWebContentsId, folderId, relativePath) {
    return revealOwnedWorkspaceEntry(
      ownerWebContentsId,
      folderId,
      relativePath,
      "Open a workspace folder before revealing files."
    );
  }

  function revealOwnedWorkspaceEntry(ownerWebContentsId, folderId, relativePath, missingFolderMessage) {
    const resolvedTarget = getExistingOwnedWorkspaceEntryTarget(
      ownerWebContentsId,
      folderId,
      relativePath,
      missingFolderMessage
    );

    shell.showItemInFolder(resolvedTarget.filePath);
    return null;
  }

  function getState(ownerWebContentsId) {
    const workspaceRegistry = getExistingOwnerWorkspaceRegistry(ownerWebContentsId);

    return workspaceRegistry === null
      ? { importedFolders: [], activeFolderId: null }
      : serializeWorkspaceRegistry(workspaceRegistry);
  }

  function getActiveFolderRootPath(ownerWebContentsId) {
    return resolveExistingDirectoryPath(getActiveWorkspaceFolderForOwner(ownerWebContentsId)?.rootPath) ?? null;
  }

  function pushState(ownerWebContentsId) {
    pushWorkspaceRegistryToOwner(ownerWebContentsId);
  }

  function destroyOwner(ownerWebContentsId) {
    destroyOwnedWorkspaceWatchers(ownerWebContentsId);
    workspaceRegistries.delete(ownerWebContentsId);
  }

  function activateFolder(ownerWebContentsId, folderId) {
    const workspaceRegistry = getExistingOwnerWorkspaceRegistry(ownerWebContentsId);

    if (workspaceRegistry === null) {
      return { importedFolders: [], activeFolderId: null };
    }

    activateWorkspaceFolder(workspaceRegistry, folderId);
    return requestWorkspaceFolderRefresh(ownerWebContentsId, folderId);
  }

  function removeFolder(ownerWebContentsId, folderId) {
    const workspaceRegistry = getExistingOwnerWorkspaceRegistry(ownerWebContentsId);

    if (workspaceRegistry === null) {
      return { importedFolders: [], activeFolderId: null };
    }

    destroyWorkspaceWatcher(ownerWebContentsId, folderId);
    removeWorkspaceFolder(workspaceRegistry, folderId);

    if (workspaceRegistry.importedFolders.size === 0) {
      workspaceRegistries.delete(ownerWebContentsId);
      return { importedFolders: [], activeFolderId: null };
    }

    return workspaceRegistry.activeFolderId === null
      ? serializeWorkspaceRegistry(workspaceRegistry)
      : requestWorkspaceFolderRefresh(ownerWebContentsId, workspaceRegistry.activeFolderId);
  }

  function reorderFolder(ownerWebContentsId, folderId, targetIndex) {
    const workspaceRegistry = getExistingOwnerWorkspaceRegistry(ownerWebContentsId);

    if (workspaceRegistry === null) {
      return { importedFolders: [], activeFolderId: null };
    }

    return reorderWorkspaceFolder(workspaceRegistry, folderId, targetIndex).state;
  }

  function refreshActiveFolder(ownerWebContentsId) {
    const workspaceFolder = getActiveWorkspaceFolderForOwner(ownerWebContentsId);

    if (workspaceFolder === null) {
      return null;
    }

    return requestWorkspaceFolderRefresh(ownerWebContentsId, workspaceFolder.id);
  }

  async function readFile(ownerWebContentsId, folderId, relativePath) {
    return readWorkspaceFilePreviewAsync(
      getOwnedWorkspaceFileTarget(
        ownerWebContentsId,
        folderId,
        relativePath,
        "Open a workspace folder before previewing files."
      ).rootPath,
      relativePath
    );
  }

  async function writeFile(ownerWebContentsId, folderId, relativePath, textContents, expectedLastModifiedMs) {
    const resolvedTarget = getOwnedWorkspaceFileTarget(
      ownerWebContentsId,
      folderId,
      relativePath,
      "Open a workspace folder before saving files."
    );
    const currentPreview = await readWorkspaceFilePreviewAsync(resolvedTarget.rootPath, relativePath);

    if (!(currentPreview?.kind === "text" || currentPreview?.kind === "json" || currentPreview?.kind === "svg")) {
      throw new Error("Only text-like workspace files can be edited.");
    }

    const currentStats = await fsp.stat(resolvedTarget.filePath);
    const normalizedExpectedLastModifiedMs = Number.isFinite(expectedLastModifiedMs)
      ? Math.trunc(expectedLastModifiedMs)
      : null;

    if (normalizedExpectedLastModifiedMs !== null && Math.trunc(currentStats.mtimeMs) !== normalizedExpectedLastModifiedMs) {
      throw new Error("File changed on disk. Refresh and try again.");
    }

    await fsp.writeFile(resolvedTarget.filePath, typeof textContents === "string" ? textContents : "", "utf8");
    return readWorkspaceFilePreviewAsync(resolvedTarget.rootPath, relativePath);
  }

  async function createFileWithRefresh(ownerWebContentsId, folderId, parentRelativePath, name) {
    const createdEntry = createOwnedWorkspaceEntry(ownerWebContentsId, folderId, parentRelativePath, name, "file");

    return {
      state: await refreshWorkspaceRegistryAfterMutation(ownerWebContentsId, folderId),
      relativePath: createdEntry.relativePath
    };
  }

  async function createDirectoryWithRefresh(ownerWebContentsId, folderId, parentRelativePath, name) {
    const createdEntry = createOwnedWorkspaceEntry(ownerWebContentsId, folderId, parentRelativePath, name, "directory");

    return {
      state: await refreshWorkspaceRegistryAfterMutation(ownerWebContentsId, folderId),
      relativePath: createdEntry.relativePath
    };
  }

  async function renameEntryWithRefresh(ownerWebContentsId, folderId, relativePath, nextName) {
    const renamedEntry = renameOwnedWorkspaceEntry(ownerWebContentsId, folderId, relativePath, nextName);

    return {
      state: await refreshWorkspaceRegistryAfterMutation(ownerWebContentsId, folderId),
      relativePath: renamedEntry.relativePath
    };
  }

  async function deleteEntry(ownerWebContentsId, folderId, relativePath) {
    const deletedRelativePath = deleteOwnedWorkspaceEntry(ownerWebContentsId, folderId, relativePath);

    return {
      state: await refreshWorkspaceRegistryAfterMutation(ownerWebContentsId, folderId),
      deletedRelativePath
    };
  }

  return {
    activateFolder,
    chooseCanvasWorkspace: chooseCanvasWorkspaceForOwner,
    createDirectoryWithRefresh,
    createFileWithRefresh,
    deleteEntry,
    destroyOwner,
    getActiveFolderRootPath,
    getState,
    openDirectory: openWorkspaceDirectoryForOwner,
    openFileExternally,
    pushState,
    readFile,
    refreshActiveFolder,
    removeFolder,
    reorderFolder,
    renameEntryWithRefresh,
    restoreSession: restoreWorkspaceSessionForOwner,
    revealEntry,
    revealFile,
    writeFile
  };
}

module.exports = {
  createWorkspaceService
};
