const { moveArrayItem } = require("./list_reorder");

function normalizeWorkspaceFolderSnapshot(snapshot) {
  if (typeof snapshot?.rootPath !== "string" || snapshot.rootPath.length === 0) {
    throw new Error("Workspace folder snapshot requires a root path.");
  }

  return {
    rootPath: snapshot.rootPath,
    rootName: typeof snapshot.rootName === "string" && snapshot.rootName.length > 0
      ? snapshot.rootName
      : snapshot.rootPath,
    entries: Array.isArray(snapshot.entries) ? snapshot.entries.map((entry) => ({ ...entry })) : [],
    isTruncated: snapshot.isTruncated === true,
    lastError: typeof snapshot.lastError === "string" ? snapshot.lastError : ""
  };
}

function cloneFolderRecord(folderRecord) {
  return {
    ...folderRecord,
    entries: folderRecord.entries.map((entry) => ({ ...entry }))
  };
}

function serializeWorkspaceRegistry(registry) {
  return {
    importedFolders: [...registry.importedFolders.values()].map(cloneFolderRecord),
    activeFolderId: registry.activeFolderId
  };
}

function createWorkspaceRegistry() {
  return {
    importedFolders: new Map(),
    activeFolderId: null,
    nextFolderNumber: 0
  };
}

function getWorkspaceFolder(registry, folderId) {
  return registry.importedFolders.get(folderId) ?? null;
}

function createWorkspaceFolderRecord(registry, snapshot) {
  registry.nextFolderNumber += 1;
  return {
    id: `workspace-folder-${registry.nextFolderNumber}`,
    ...normalizeWorkspaceFolderSnapshot(snapshot)
  };
}

function importWorkspaceFolder(registry, snapshot) {
  const normalizedSnapshot = normalizeWorkspaceFolderSnapshot(snapshot);

  for (const folderRecord of registry.importedFolders.values()) {
    if (folderRecord.rootPath === normalizedSnapshot.rootPath) {
      registry.activeFolderId = folderRecord.id;
      return {
        folderId: folderRecord.id,
        deduplicated: true,
        state: serializeWorkspaceRegistry(registry)
      };
    }
  }

  const folderRecord = createWorkspaceFolderRecord(registry, normalizedSnapshot);
  registry.importedFolders.set(folderRecord.id, folderRecord);
  registry.activeFolderId = folderRecord.id;

  return {
    folderId: folderRecord.id,
    deduplicated: false,
    state: serializeWorkspaceRegistry(registry)
  };
}

function activateWorkspaceFolder(registry, folderId) {
  if (!registry.importedFolders.has(folderId)) {
    throw new Error("Workspace folder not found.");
  }

  registry.activeFolderId = folderId;
  return {
    folderId,
    state: serializeWorkspaceRegistry(registry)
  };
}

function getNextActiveFolderIdAfterRemoval(registry, folderId) {
  const folderIds = [...registry.importedFolders.keys()];
  const currentIndex = folderIds.indexOf(folderId);

  if (currentIndex === -1) {
    return registry.activeFolderId;
  }

  return folderIds[currentIndex + 1] ?? folderIds[currentIndex - 1] ?? null;
}

function removeWorkspaceFolder(registry, folderId) {
  if (!registry.importedFolders.has(folderId)) {
    throw new Error("Workspace folder not found.");
  }

  const nextActiveFolderId = registry.activeFolderId === folderId
    ? getNextActiveFolderIdAfterRemoval(registry, folderId)
    : registry.activeFolderId;

  registry.importedFolders.delete(folderId);
  registry.activeFolderId = nextActiveFolderId;

  return {
    removedFolderId: folderId,
    state: serializeWorkspaceRegistry(registry)
  };
}

function updateWorkspaceFolderSnapshot(registry, folderId, snapshot) {
  const currentFolder = registry.importedFolders.get(folderId);

  if (currentFolder == null) {
    throw new Error("Workspace folder not found.");
  }

  const normalizedSnapshot = normalizeWorkspaceFolderSnapshot(snapshot);
  registry.importedFolders.set(folderId, {
    ...currentFolder,
    ...normalizedSnapshot,
    id: folderId
  });

  return {
    folderId,
    state: serializeWorkspaceRegistry(registry)
  };
}

function reorderWorkspaceFolder(registry, folderId, targetIndex) {
  const folderEntries = [...registry.importedFolders.entries()];
  const sourceIndex = folderEntries.findIndex(([currentFolderId]) => currentFolderId === folderId);

  if (sourceIndex < 0) {
    throw new Error("Workspace folder not found.");
  }

  const reorderedEntries = moveArrayItem(folderEntries, sourceIndex, targetIndex);
  registry.importedFolders = new Map(reorderedEntries);

  return {
    folderId,
    state: serializeWorkspaceRegistry(registry)
  };
}

function setWorkspaceFolderError(registry, folderId, errorMessage) {
  const currentFolder = registry.importedFolders.get(folderId);

  if (currentFolder == null) {
    throw new Error("Workspace folder not found.");
  }

  registry.importedFolders.set(folderId, {
    ...currentFolder,
    lastError: typeof errorMessage === "string" ? errorMessage : ""
  });

  return {
    folderId,
    state: serializeWorkspaceRegistry(registry)
  };
}

module.exports = {
  activateWorkspaceFolder,
  createWorkspaceRegistry,
  getWorkspaceFolder,
  importWorkspaceFolder,
  reorderWorkspaceFolder,
  removeWorkspaceFolder,
  serializeWorkspaceRegistry,
  setWorkspaceFolderError,
  updateWorkspaceFolderSnapshot
};
