const fs = require("node:fs");
const path = require("node:path");

const MAX_TEXT_PREVIEW_BYTES = 256 * 1024;
const MAX_BINARY_PREVIEW_BYTES = 8 * 1024 * 1024;

const TEXT_TYPE_BY_EXTENSION = new Map([
  [".css", { language: "css", mimeType: "text/css" }],
  [".html", { language: "html", mimeType: "text/html" }],
  [".js", { language: "javascript", mimeType: "text/javascript" }],
  [".json", { language: "json", mimeType: "application/json" }],
  [".jsx", { language: "javascript", mimeType: "text/javascript" }],
  [".md", { language: "markdown", mimeType: "text/markdown" }],
  [".py", { language: "python", mimeType: "text/x-python" }],
  [".sh", { language: "shell", mimeType: "text/x-shellscript" }],
  [".ts", { language: "typescript", mimeType: "text/typescript" }],
  [".tsx", { language: "typescript", mimeType: "text/typescript" }],
  [".txt", { language: "text", mimeType: "text/plain" }],
  [".yaml", { language: "yaml", mimeType: "text/yaml" }],
  [".yml", { language: "yaml", mimeType: "text/yaml" }]
]);

const IMAGE_MIME_BY_EXTENSION = new Map([
  [".gif", "image/gif"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".png", "image/png"],
  [".webp", "image/webp"]
]);

const AUDIO_MIME_BY_EXTENSION = new Map([
  [".aac", "audio/aac"],
  [".flac", "audio/flac"],
  [".m4a", "audio/mp4"],
  [".mp3", "audio/mpeg"],
  [".ogg", "audio/ogg"],
  [".wav", "audio/wav"]
]);

const VIDEO_MIME_BY_EXTENSION = new Map([
  [".mov", "video/quicktime"],
  [".mp4", "video/mp4"],
  [".m4v", "video/mp4"],
  [".webm", "video/webm"],
  [".mkv", "video/x-matroska"]
]);

const BINARY_MIME_BY_EXTENSION = new Map([
  [".bin", "application/octet-stream"],
  [".dmg", "application/octet-stream"],
  [".exe", "application/octet-stream"],
  [".gz", "application/gzip"],
  [".tar", "application/x-tar"],
  [".zip", "application/zip"]
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

function getPreviewDescriptor(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  const textType = TEXT_TYPE_BY_EXTENSION.get(extension);

  if (textType) {
    return {
      kind: textType.language === "json" ? "json" : "text",
      language: textType.language,
      mimeType: textType.mimeType,
      maxBytes: MAX_TEXT_PREVIEW_BYTES,
      readMode: "text"
    };
  }

  const imageMimeType = IMAGE_MIME_BY_EXTENSION.get(extension);

  if (imageMimeType) {
    return {
      kind: "image",
      language: null,
      mimeType: imageMimeType,
      maxBytes: MAX_BINARY_PREVIEW_BYTES,
      readMode: "binary"
    };
  }

  if (extension === ".pdf") {
    return {
      kind: "pdf",
      language: null,
      mimeType: "application/pdf",
      maxBytes: MAX_BINARY_PREVIEW_BYTES,
      readMode: "binary"
    };
  }

  const audioMimeType = AUDIO_MIME_BY_EXTENSION.get(extension);

  if (audioMimeType) {
    return {
      kind: "audio",
      language: null,
      mimeType: audioMimeType,
      maxBytes: MAX_BINARY_PREVIEW_BYTES,
      readMode: "fallback"
    };
  }

  const videoMimeType = VIDEO_MIME_BY_EXTENSION.get(extension);

  if (videoMimeType) {
    return {
      kind: "video",
      language: null,
      mimeType: videoMimeType,
      maxBytes: MAX_BINARY_PREVIEW_BYTES,
      readMode: "fallback"
    };
  }

  const binaryMimeType = BINARY_MIME_BY_EXTENSION.get(extension);

  if (binaryMimeType) {
    return {
      kind: "binary",
      language: null,
      mimeType: binaryMimeType,
      maxBytes: MAX_BINARY_PREVIEW_BYTES,
      readMode: "fallback"
    };
  }

  return {
    kind: "unsupported",
    language: null,
    mimeType: null,
    maxBytes: MAX_BINARY_PREVIEW_BYTES,
    readMode: "fallback"
  };
}

function normalizeRelativePath(rootPath, filePath) {
  return path.relative(rootPath, filePath).split(path.sep).join("/");
}

function createPreviewPayload(rootPath, relativePath, filePath, stats, descriptor, fields = {}) {
  return {
    rootPath,
    relativePath,
    fileName: path.basename(filePath),
    kind: descriptor.kind,
    language: descriptor.language,
    mimeType: descriptor.mimeType,
    contents: fields.textContents ?? "",
    textContents: fields.textContents ?? "",
    binaryContentsBase64: fields.binaryContentsBase64 ?? "",
    lastModifiedMs: stats.mtimeMs,
    fallbackReason: fields.fallbackReason ?? ""
  };
}

function createTooLargeDescriptor(descriptor) {
  return {
    kind: "too-large",
    language: descriptor.language,
    mimeType: descriptor.mimeType
  };
}

function readWorkspaceFilePreview(rootPath, relativePath) {
  const resolved = resolveWorkspaceFilePath(rootPath, relativePath);
  const normalizedRelativePath = normalizeRelativePath(resolved.rootPath, resolved.filePath);
  const descriptor = getPreviewDescriptor(resolved.filePath);

  if (descriptor.readMode === "fallback") {
    return createPreviewPayload(
      resolved.rootPath,
      normalizedRelativePath,
      resolved.filePath,
      resolved.stats,
      descriptor,
      {
        fallbackReason: descriptor.kind === "unsupported"
          ? "File type is not supported for preview."
          : "Inline preview is not available for this file type."
      }
    );
  }

  if (resolved.stats.size > descriptor.maxBytes) {
    return createPreviewPayload(
      resolved.rootPath,
      normalizedRelativePath,
      resolved.filePath,
      resolved.stats,
      createTooLargeDescriptor(descriptor),
      { fallbackReason: `File is too large to preview (limit: ${descriptor.maxBytes} bytes).` }
    );
  }

  if (descriptor.readMode === "binary") {
    return createPreviewPayload(
      resolved.rootPath,
      normalizedRelativePath,
      resolved.filePath,
      resolved.stats,
      descriptor,
      { binaryContentsBase64: fs.readFileSync(resolved.filePath).toString("base64") }
    );
  }

  const rawContents = fs.readFileSync(resolved.filePath, "utf8");

  if (descriptor.kind === "json") {
    try {
      return createPreviewPayload(
        resolved.rootPath,
        normalizedRelativePath,
        resolved.filePath,
        resolved.stats,
        descriptor,
        { textContents: `${JSON.stringify(JSON.parse(rawContents), null, 2)}\n` }
      );
    } catch {
      return createPreviewPayload(
        resolved.rootPath,
        normalizedRelativePath,
        resolved.filePath,
        resolved.stats,
        {
          kind: "text",
          language: descriptor.language,
          mimeType: descriptor.mimeType
        },
        { textContents: rawContents }
      );
    }
  }

  return createPreviewPayload(
    resolved.rootPath,
    normalizedRelativePath,
    resolved.filePath,
    resolved.stats,
    descriptor,
    { textContents: rawContents }
  );
}

module.exports = {
  MAX_TEXT_PREVIEW_BYTES,
  MAX_BINARY_PREVIEW_BYTES,
  resolveWorkspaceFilePath,
  readWorkspaceFilePreview
};
