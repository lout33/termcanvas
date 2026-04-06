(function (root, factory) {
  const exports = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = exports;
  }

  if (root && typeof root === "object") {
    root.noteCanvasRendererWorkspacePreview = exports;

    if (root.window && typeof root.window === "object") {
      root.window.noteCanvasRendererWorkspacePreview = exports;
    }
  }
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const PREVIEW_KIND_LABELS = {
    json: "JSON",
    markdown: "Markdown",
    text: "Text",
    javascript: "JS",
    typescript: "TS",
    python: "PY",
    shell: "Shell",
    html: "HTML",
    css: "CSS",
    yaml: "YAML",
    image: "Image",
    pdf: "PDF"
  };

  function getFileName(relativePath, explicitFileName) {
    if (typeof explicitFileName === "string" && explicitFileName.length > 0) {
      return explicitFileName;
    }

    if (typeof relativePath !== "string" || relativePath.length === 0) {
      return "File";
    }

    const segments = relativePath.split("/");
    return segments[segments.length - 1] || "File";
  }

  function getTypeLabel(data) {
    const language = typeof data?.language === "string" && data.language.length > 0 ? data.language : null;
    const kind = typeof data?.kind === "string" && data.kind.length > 0 ? data.kind : null;

    if (language !== null) {
      return PREVIEW_KIND_LABELS[language] ?? language.toUpperCase();
    }

    if (kind !== null) {
      return PREVIEW_KIND_LABELS[kind] ?? kind.toUpperCase();
    }

    return "File";
  }

  function createBaseViewModel(previewState) {
    const relativePath = typeof previewState?.relativePath === "string" ? previewState.relativePath : "";
    const data = previewState?.data ?? null;

    return {
      mode: "empty",
      fileName: getFileName(relativePath, data?.fileName),
      relativePath,
      typeLabel: getTypeLabel(data),
      message: "",
      textContents: typeof data?.textContents === "string"
        ? data.textContents
        : (typeof data?.contents === "string" ? data.contents : ""),
      binaryContentsBase64: typeof data?.binaryContentsBase64 === "string" ? data.binaryContentsBase64 : "",
      mimeType: typeof data?.mimeType === "string" ? data.mimeType : "",
      actionErrorMessage: typeof previewState?.actionErrorMessage === "string" ? previewState.actionErrorMessage : "",
      actions: {
        canOpenExternally: false,
        canRevealInFinder: false
      }
    };
  }

  function isValidBase64(value) {
    return typeof value === "string"
      && value.length > 0
      && value.length % 4 === 0
      && /^[A-Za-z0-9+/]+={0,2}$/.test(value);
  }

  function shouldApplyWorkspacePreviewActionError({
    currentFolderId,
    currentRelativePath,
    targetFolderId,
    targetRelativePath
  }) {
    return currentFolderId === targetFolderId && currentRelativePath === targetRelativePath;
  }

  function deriveWorkspacePreviewViewModel(previewState) {
    const viewModel = createBaseViewModel(previewState);
    const hasBinaryContents = isValidBase64(viewModel.binaryContentsBase64);

    if (viewModel.relativePath.length === 0) {
      return viewModel;
    }

    if (previewState?.status === "loading") {
      return {
        ...viewModel,
        mode: "loading",
        message: "Loading file preview..."
      };
    }

    if (previewState?.status === "error") {
      return {
        ...viewModel,
        mode: "error",
        message: typeof previewState?.errorMessage === "string" && previewState.errorMessage.length > 0
          ? previewState.errorMessage
          : "Unable to load file preview."
      };
    }

    const kind = typeof previewState?.data?.kind === "string" ? previewState.data.kind : null;

    if (kind === "image" && hasBinaryContents) {
      return {
        ...viewModel,
        mode: "image"
      };
    }

    if (kind === "pdf" && hasBinaryContents) {
      return {
        ...viewModel,
        mode: "pdf"
      };
    }

    if (
      kind === "unsupported"
      || kind === "too-large"
      || kind === "audio"
      || kind === "video"
      || kind === "binary"
      || kind === "image"
      || kind === "pdf"
    ) {
      return {
        ...viewModel,
        mode: "fallback",
        message: typeof previewState?.data?.fallbackReason === "string" && previewState.data.fallbackReason.length > 0
          ? previewState.data.fallbackReason
          : (kind === "too-large"
              ? "This file is too large to preview here."
              : "Preview not available for this file type."),
        actions: {
          canOpenExternally: true,
          canRevealInFinder: true
        }
      };
    }

    return {
      ...viewModel,
      mode: "text"
    };
  }

  return {
    deriveWorkspacePreviewViewModel,
    shouldApplyWorkspacePreviewActionError
  };
});
