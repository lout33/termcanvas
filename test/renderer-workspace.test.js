const test = require("node:test");
const assert = require("node:assert/strict");

const {
  normalizeCanvasWorkspaceRecord,
  syncCanvasWorkspaceFromLiveState,
  toggleCanvasWorkspaceExpandedDirectory,
  deriveCanvasWorkspaceAfterRestore,
  deriveWorkspaceEntryActionState,
  shouldApplyCanvasWorkspaceRestoreResult,
  getCanvasWorkspaceExpandedDirectories,
  getCanvasWorkspacePreviewRelativePath,
  getCanvasWorkspaceRootPath
} = require("../renderer_workspace.js");

test("normalizeCanvasWorkspaceRecord keeps new and imported canvases workspace-empty by default", () => {
  assert.equal(normalizeCanvasWorkspaceRecord(), null);
  assert.equal(normalizeCanvasWorkspaceRecord(null), null);
  assert.equal(normalizeCanvasWorkspaceRecord({}), null);
});

test("syncCanvasWorkspaceFromLiveState stores active-canvas workspace ownership", () => {
  const canvasRecord = { workspace: null };

  const nextWorkspace = syncCanvasWorkspaceFromLiveState(canvasRecord, {
    rootPath: "/tmp/project",
    rootName: "project",
    expandedDirectoryPaths: ["src", "src", "test"],
    previewRelativePath: "src/index.js"
  });

  assert.deepEqual(nextWorkspace, {
    rootPath: "/tmp/project",
    rootName: "project",
    expandedDirectoryPaths: ["src", "test"],
    previewRelativePath: "src/index.js"
  });
  assert.equal(canvasRecord.workspace, nextWorkspace);
  assert.equal(getCanvasWorkspaceRootPath(canvasRecord), "/tmp/project");
  assert.deepEqual(getCanvasWorkspaceExpandedDirectories(canvasRecord), ["src", "test"]);
  assert.equal(getCanvasWorkspacePreviewRelativePath(canvasRecord), "src/index.js");
});

test("toggleCanvasWorkspaceExpandedDirectory updates the active canvas workspace record instead of folder-id keyed state", () => {
  const canvasRecord = {
    workspace: {
      rootPath: "/tmp/project",
      rootName: "project",
      expandedDirectoryPaths: ["src"],
      previewRelativePath: null
    }
  };

  toggleCanvasWorkspaceExpandedDirectory(canvasRecord, "test");
  assert.deepEqual(getCanvasWorkspaceExpandedDirectories(canvasRecord), ["src", "test"]);

  toggleCanvasWorkspaceExpandedDirectory(canvasRecord, "src");
  assert.deepEqual(getCanvasWorkspaceExpandedDirectories(canvasRecord), ["test"]);
});

test("syncCanvasWorkspaceFromLiveState clears workspace preview and expansion when the active root disappears", () => {
  const canvasRecord = {
    workspace: {
      rootPath: "/tmp/project",
      rootName: "project",
      expandedDirectoryPaths: ["src"],
      previewRelativePath: "src/index.js"
    }
  };

  const nextWorkspace = syncCanvasWorkspaceFromLiveState(canvasRecord, null);

  assert.equal(nextWorkspace, null);
  assert.equal(canvasRecord.workspace, null);
  assert.equal(getCanvasWorkspaceRootPath(canvasRecord), null);
  assert.deepEqual(getCanvasWorkspaceExpandedDirectories(canvasRecord), []);
  assert.equal(getCanvasWorkspacePreviewRelativePath(canvasRecord), null);
});

test("deriveCanvasWorkspaceAfterRestore restores the switched canvas workspace root, expanded directories, preview identity, and default cwd source", () => {
  const canvasA = {
    workspace: {
      rootPath: "/tmp/a",
      rootName: "a",
      expandedDirectoryPaths: ["src"],
      previewRelativePath: "src/a.js"
    }
  };
  const canvasB = {
    workspace: {
      rootPath: "/tmp/b",
      rootName: "b",
      expandedDirectoryPaths: ["src/components", "missing"],
      previewRelativePath: "src/components/app.js"
    }
  };

  const restoredWorkspace = deriveCanvasWorkspaceAfterRestore(canvasB, {
    importedFolders: [{
      id: "folder-b",
      rootPath: "/tmp/b",
      rootName: "project-b",
      entries: [
        { relativePath: "src", kind: "directory" },
        { relativePath: "src/components", kind: "directory" },
        { relativePath: "src/components/app.js", kind: "file" },
        { relativePath: "README.md", kind: "file" }
      ]
    }],
    activeFolderId: "folder-b"
  });

  assert.deepEqual(restoredWorkspace, {
    rootPath: "/tmp/b",
    rootName: "project-b",
    expandedDirectoryPaths: ["src/components", "src"],
    previewRelativePath: "src/components/app.js"
  });
  assert.equal(getCanvasWorkspaceRootPath(canvasA), "/tmp/a");
  assert.equal(restoredWorkspace.rootPath, "/tmp/b");
});

test("shouldApplyCanvasWorkspaceRestoreResult rejects stale async restore results after a canvas switch", () => {
  assert.equal(shouldApplyCanvasWorkspaceRestoreResult({
    restoreToken: 1,
    activeRestoreToken: 2,
    activeCanvasId: "canvas-b",
    targetCanvasId: "canvas-a"
  }), false);

  assert.equal(shouldApplyCanvasWorkspaceRestoreResult({
    restoreToken: 2,
    activeRestoreToken: 2,
    activeCanvasId: "canvas-b",
    targetCanvasId: "canvas-b"
  }), true);
});

test("deriveWorkspaceEntryActionState falls back to workspace-root actions when nothing is selected", () => {
  assert.deepEqual(deriveWorkspaceEntryActionState(null, null), {
    targetRelativePath: null,
    targetLabel: "",
    canReveal: false,
    revealLabel: "Reveal in Finder"
  });

  assert.deepEqual(deriveWorkspaceEntryActionState({ rootPath: "/tmp/project", rootName: "project" }, null), {
    targetRelativePath: "",
    targetLabel: "/tmp/project",
    canReveal: true,
    revealLabel: "Reveal in Finder"
  });
});

test("deriveWorkspaceEntryActionState maps selected files and folders to revealable targets", () => {
  const activeFolder = { rootPath: "/tmp/project", rootName: "project" };

  assert.deepEqual(deriveWorkspaceEntryActionState(activeFolder, {
    relativePath: "docs/readme.md",
    kind: "file"
  }), {
    targetRelativePath: "docs/readme.md",
    targetLabel: "docs/readme.md",
    canReveal: true,
    revealLabel: "Reveal in Finder"
  });

  assert.deepEqual(deriveWorkspaceEntryActionState(activeFolder, {
    relativePath: "docs",
    kind: "directory"
  }), {
    targetRelativePath: "docs",
    targetLabel: "docs",
    canReveal: true,
    revealLabel: "Reveal in Finder"
  });
});
