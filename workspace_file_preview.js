const fs = require("node:fs");
const path = require("node:path");

const MAX_WORKSPACE_FILE_PREVIEW_BYTES = 256 * 1024;

const LANGUAGE_BY_EXTENSION = new Map([
  [".css", "css"],
  [".html", "html"],
  [".js", "javascript"],
  [".json", "json"],
  [".jsx", "javascript"],
  [".md", "markdown"],
  [".py", "python"],
  [".sh", "shell"],
  [".ts", "typescript"],
  [".tsx", "typescript"],
  [".txt", "text"],
  [".yaml", "yaml"],
  [".yml", "yaml"]
]);

function isPathWithinDirectory(rootPath, targetPath) {
  const relativePath = path.relative(rootPath, targetPath);
  return relativePath !== ".." && !relativePath.startsWith(`..${path.sep}`) && !path.isAbsolute(relativePath);
}

function resolveWorkspaceFilePath(rootPath, relativePath) {
  if (typeof rootPath !== "string" || rootPath.trim().length === 0) {
    throw new Error("A workspace root directory is required.");
  }

  if (typeof relativePath !== "string" || relativePath.trim().length === 0) {
    throw new Error("A workspace file path is required.");
  }

  const resolvedRootPath = path.resolve(rootPath);
  const resolvedCandidatePath = path.resolve(resolvedRootPath, relativePath);

  if (!isPathWithinDirectory(resolvedRootPath, resolvedCandidatePath)) {
    throw new Error("Workspace file preview must stay inside the workspace root.");
  }

  const rootStats = fs.statSync(resolvedRootPath);

  if (!rootStats.isDirectory()) {
    throw new Error("Workspace root must be a directory.");
  }

  const candidateStats = fs.statSync(resolvedCandidatePath);

  if (!candidateStats.isFile()) {
    throw new Error("Workspace preview target must be a file.");
  }

  const realRootPath = fs.realpathSync(resolvedRootPath);
  const realCandidatePath = fs.realpathSync(resolvedCandidatePath);

  if (!isPathWithinDirectory(realRootPath, realCandidatePath)) {
    throw new Error("Workspace file preview must stay inside the workspace root.");
  }

  return {
    rootPath: realRootPath,
    filePath: realCandidatePath,
    stats: candidateStats
  };
}

function getPreviewLanguage(filePath) {
  return LANGUAGE_BY_EXTENSION.get(path.extname(filePath).toLowerCase()) ?? null;
}

function normalizeRelativePath(rootPath, filePath) {
  return path.relative(rootPath, filePath).split(path.sep).join("/");
}

function createPreviewPayload(rootPath, relativePath, filePath, stats, kind, language, contents) {
  return {
    rootPath,
    relativePath,
    fileName: path.basename(filePath),
    kind,
    language,
    contents,
    lastModifiedMs: stats.mtimeMs
  };
}

function readWorkspaceFilePreview(rootPath, relativePath, options = {}) {
  const maxBytes = Number.isFinite(options.maxBytes)
    ? Math.max(1, Math.floor(options.maxBytes))
    : MAX_WORKSPACE_FILE_PREVIEW_BYTES;
  const resolved = resolveWorkspaceFilePath(rootPath, relativePath);
  const normalizedRelativePath = normalizeRelativePath(resolved.rootPath, resolved.filePath);
  const language = getPreviewLanguage(resolved.filePath);

  if (language === null) {
    return createPreviewPayload(
      resolved.rootPath,
      normalizedRelativePath,
      resolved.filePath,
      resolved.stats,
      "unsupported",
      null,
      ""
    );
  }

  if (resolved.stats.size > maxBytes) {
    return createPreviewPayload(
      resolved.rootPath,
      normalizedRelativePath,
      resolved.filePath,
      resolved.stats,
      "too-large",
      language,
      ""
    );
  }

  const rawContents = fs.readFileSync(resolved.filePath, "utf8");

  if (language === "json") {
    try {
      return createPreviewPayload(
        resolved.rootPath,
        normalizedRelativePath,
        resolved.filePath,
        resolved.stats,
        "json",
        language,
        `${JSON.stringify(JSON.parse(rawContents), null, 2)}\n`
      );
    } catch {
      return createPreviewPayload(
        resolved.rootPath,
        normalizedRelativePath,
        resolved.filePath,
        resolved.stats,
        "text",
        language,
        rawContents
      );
    }
  }

  return createPreviewPayload(
    resolved.rootPath,
    normalizedRelativePath,
    resolved.filePath,
    resolved.stats,
    "text",
    language,
    rawContents
  );
}

module.exports = {
  MAX_WORKSPACE_FILE_PREVIEW_BYTES,
  readWorkspaceFilePreview
};
