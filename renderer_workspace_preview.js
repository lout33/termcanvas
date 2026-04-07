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
    svg: "SVG",
    html: "HTML",
    css: "CSS",
    yaml: "YAML",
    image: "Image",
    pdf: "PDF"
  };

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function escapeHtmlAttribute(value) {
    return escapeHtml(value).replace(/`/g, "&#96;");
  }

  function renderInlineMarkdown(markdown) {
    let html = escapeHtml(markdown);

    html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
    html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");
    html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (_match, label, href) => {
      return `<a href="${escapeHtmlAttribute(href)}" target="_blank" rel="noreferrer">${label}</a>`;
    });

    return html;
  }

  function renderMarkdownToHtml(markdown) {
    const lines = typeof markdown === "string" ? markdown.split(/\r?\n/u) : [];
    const blocks = [];
    let paragraphLines = [];
    let listItems = [];
    let codeLines = [];
    let isInCodeBlock = false;

    function flushParagraph() {
      if (paragraphLines.length === 0) {
        return;
      }

      blocks.push(`<p>${renderInlineMarkdown(paragraphLines.join(" "))}</p>`);
      paragraphLines = [];
    }

    function flushList() {
      if (listItems.length === 0) {
        return;
      }

      blocks.push(`<ul>${listItems.map((item) => `<li>${renderInlineMarkdown(item)}</li>`).join("")}</ul>`);
      listItems = [];
    }

    function flushCodeBlock() {
      if (codeLines.length === 0) {
        return;
      }

      blocks.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
      codeLines = [];
    }

    lines.forEach((line) => {
      if (/^```/u.test(line)) {
        flushParagraph();
        flushList();

        if (isInCodeBlock) {
          flushCodeBlock();
        }

        isInCodeBlock = !isInCodeBlock;
        return;
      }

      if (isInCodeBlock) {
        codeLines.push(line);
        return;
      }

      if (/^\s*$/u.test(line)) {
        flushParagraph();
        flushList();
        return;
      }

      const headingMatch = line.match(/^(#{1,6})\s+(.*)$/u);

      if (headingMatch) {
        flushParagraph();
        flushList();
        const level = headingMatch[1].length;
        blocks.push(`<h${level}>${renderInlineMarkdown(headingMatch[2])}</h${level}>`);
        return;
      }

      const listMatch = line.match(/^\s*[-*]\s+(.*)$/u);

      if (listMatch) {
        flushParagraph();
        listItems.push(listMatch[1]);
        return;
      }

      flushList();
      paragraphLines.push(line.trim());
    });

    flushParagraph();
    flushList();
    flushCodeBlock();

    return blocks.join("");
  }

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

  function canRenderPreview(data) {
    return data?.kind === "svg" || data?.language === "markdown";
  }

  function canEditPreview(data) {
    const kind = typeof data?.kind === "string" ? data.kind : null;
    return kind === "text" || kind === "json" || kind === "svg";
  }

  function resolveWorkspacePreviewViewMode(previewState) {
    if (previewState?.viewMode === "source") {
      return "source";
    }

    if (previewState?.viewMode === "render") {
      return "render";
    }

    return canRenderPreview(previewState?.data) ? "render" : "source";
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
      renderedContentsHtml: "",
      binaryContentsBase64: typeof data?.binaryContentsBase64 === "string" ? data.binaryContentsBase64 : "",
      mimeType: typeof data?.mimeType === "string" ? data.mimeType : "",
      viewMode: resolveWorkspacePreviewViewMode(previewState),
      canEdit: canEditPreview(data),
      canRender: canRenderPreview(data),
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

    if (viewModel.viewMode === "render" && previewState?.data?.language === "markdown") {
      return {
        ...viewModel,
        mode: "markdown",
        renderedContentsHtml: renderMarkdownToHtml(viewModel.textContents)
      };
    }

    if (viewModel.viewMode === "render" && kind === "svg") {
      return {
        ...viewModel,
        mode: "svg"
      };
    }

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
    renderMarkdownToHtml,
    shouldApplyWorkspacePreviewActionError
  };
});
