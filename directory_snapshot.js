const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_ENTRY_LIMIT = 400;
const DEFAULT_IGNORED_DIRECTORY_NAMES = new Set([
  ".git",
  "node_modules"
]);

function compareDirectoryEntries(leftEntry, rightEntry) {
  return leftEntry.name.localeCompare(rightEntry.name);
}

function normalizeEntryLimit(entryLimit) {
  if (!Number.isFinite(entryLimit)) {
    return DEFAULT_ENTRY_LIMIT;
  }

  return Math.max(1, Math.floor(entryLimit));
}

function isPathWithinDirectory(rootPath, targetPath) {
  const relativePath = path.relative(rootPath, targetPath);
  return relativePath !== ".." && !relativePath.startsWith(`..${path.sep}`) && !path.isAbsolute(relativePath);
}

function resolveDirectoryEntry(currentDirectoryPath, childEntry, rootRealPath) {
  const entryPath = path.join(currentDirectoryPath, childEntry.name);

  if (childEntry.isDirectory()) {
    return {
      kind: "directory",
      directoryPath: entryPath
    };
  }

  if (!childEntry.isSymbolicLink()) {
    return {
      kind: "file",
      directoryPath: null
    };
  }

  try {
    const resolvedStats = fs.statSync(entryPath);

    if (!resolvedStats.isDirectory()) {
      return {
        kind: "file",
        directoryPath: null
      };
    }

    const realEntryPath = fs.realpathSync(entryPath);

    if (!isPathWithinDirectory(rootRealPath, realEntryPath)) {
      return {
        kind: "file",
        directoryPath: null
      };
    }

    return {
      kind: "directory",
      directoryPath: entryPath
    };
  } catch {
    return {
      kind: "file",
      directoryPath: null
    };
  }
}

function createDirectorySnapshot(rootPath, options = {}) {
  if (typeof rootPath !== "string" || rootPath.trim().length === 0) {
    throw new Error("A root directory path is required.");
  }

  const resolvedRootPath = path.resolve(rootPath);
  const rootStats = fs.statSync(resolvedRootPath);
  const rootRealPath = fs.realpathSync(resolvedRootPath);

  if (!rootStats.isDirectory()) {
    throw new Error("The selected path must be a directory.");
  }

  const entryLimit = normalizeEntryLimit(options.entryLimit);
  const ignoredDirectoryNames = new Set(options.ignoredDirectoryNames ?? DEFAULT_IGNORED_DIRECTORY_NAMES);
  const entries = [];
  const pendingDirectories = [{
    directoryPath: resolvedRootPath,
    parentRelativePath: "",
    depth: 0
  }];
  let isTruncated = false;

  while (pendingDirectories.length > 0 && !isTruncated) {
    const currentDirectory = pendingDirectories.shift();

    if (currentDirectory == null) {
      break;
    }

    let childEntries = null;

    try {
      childEntries = fs.readdirSync(currentDirectory.directoryPath, { withFileTypes: true }).sort(compareDirectoryEntries);
    } catch (error) {
      if (currentDirectory.parentRelativePath.length === 0) {
        throw error;
      }

      continue;
    }

    const childDirectories = [];

    for (const childEntry of childEntries) {
      const resolvedEntry = resolveDirectoryEntry(currentDirectory.directoryPath, childEntry, rootRealPath);
      const isDirectory = resolvedEntry.kind === "directory";

      if (isDirectory && ignoredDirectoryNames.has(childEntry.name)) {
        continue;
      }

      const relativePath = currentDirectory.parentRelativePath.length > 0
        ? path.posix.join(currentDirectory.parentRelativePath, childEntry.name)
        : childEntry.name;

      entries.push({
        name: childEntry.name,
        relativePath,
        kind: resolvedEntry.kind,
        depth: currentDirectory.depth
      });

      if (entries.length >= entryLimit) {
        isTruncated = true;
        break;
      }

      if (isDirectory) {
        childDirectories.push({
          directoryPath: resolvedEntry.directoryPath,
          parentRelativePath: relativePath,
          depth: currentDirectory.depth + 1
        });
      }
    }

    pendingDirectories.push(...childDirectories);
  }

  return {
    rootPath: resolvedRootPath,
    rootName: path.basename(resolvedRootPath) || resolvedRootPath,
    entries,
    isTruncated
  };
}

module.exports = {
  DEFAULT_ENTRY_LIMIT,
  DEFAULT_IGNORED_DIRECTORY_NAMES,
  createDirectorySnapshot
};
