import { Compartment, EditorState } from "@codemirror/state";
import { EditorView, Decoration, ViewPlugin, keymap } from "@codemirror/view";
import { basicSetup } from "codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { oneDark } from "@codemirror/theme-one-dark";
import { tags } from "@lezer/highlight";
import MarkdownIt from "markdown-it";
import DOMPurify from "dompurify";

const markdownParser = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: false
});

const markdownEditorTheme = EditorView.theme({
  "&": {
    height: "100%",
    border: "1px solid rgba(180, 207, 217, 0.12)",
    borderRadius: "0.625rem",
    backgroundColor: "rgba(7, 8, 10, 0.92)",
    color: "#f1f5f2",
    fontFamily: 'var(--font-body, "Avenir Next", "Helvetica Neue", sans-serif)',
    fontSize: "0.98rem"
  },
  ".cm-scroller": {
    fontFamily: 'var(--font-body, "Avenir Next", "Helvetica Neue", sans-serif)',
    lineHeight: "1.7"
  },
  ".cm-content": {
    padding: "1.25rem 0",
    caretColor: "#f1f5f2"
  },
  ".cm-line": {
    padding: "0 1.15rem"
  },
  ".cm-gutters": {
    borderTopLeftRadius: "0.625rem",
    borderBottomLeftRadius: "0.625rem",
    backgroundColor: "rgba(10, 12, 16, 0.92)",
    borderRight: "1px solid rgba(180, 207, 217, 0.08)",
    color: "rgba(147, 162, 170, 0.78)"
  },
  ".cm-activeLineGutter, .cm-activeLine": {
    backgroundColor: "rgba(111, 232, 255, 0.07)"
  },
  "&.cm-focused": {
    outline: "none",
    borderColor: "rgba(111, 232, 255, 0.28)",
    boxShadow: "0 0 0 1px rgba(111, 232, 255, 0.24)"
  },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection": {
    backgroundColor: "rgba(111, 232, 255, 0.18)"
  },
  ".cm-md-heading-1": {
    fontFamily: 'var(--font-display, "Iowan Old Style", "Baskerville", serif)',
    fontSize: "1.85rem",
    fontWeight: "700",
    lineHeight: "1.18",
    paddingTop: "0.55rem",
    paddingBottom: "0.25rem",
    letterSpacing: "-0.02em"
  },
  ".cm-md-heading-2": {
    fontFamily: 'var(--font-display, "Iowan Old Style", "Baskerville", serif)',
    fontSize: "1.5rem",
    fontWeight: "650",
    lineHeight: "1.22",
    paddingTop: "0.45rem",
    paddingBottom: "0.15rem"
  },
  ".cm-md-heading-3": {
    fontFamily: 'var(--font-display, "Iowan Old Style", "Baskerville", serif)',
    fontSize: "1.18rem",
    fontWeight: "650",
    lineHeight: "1.28",
    paddingTop: "0.3rem"
  },
  ".cm-md-quote": {
    marginLeft: "0.2rem",
    paddingLeft: "0.9rem",
    borderLeft: "2px solid rgba(111, 232, 255, 0.22)",
    color: "rgba(220, 230, 235, 0.86)",
    fontStyle: "italic"
  },
  ".cm-md-list": {
    paddingLeft: "0.45rem"
  },
  ".cm-md-code-fence": {
    fontFamily: 'var(--font-mono, "SFMono-Regular", Menlo, Monaco, Consolas, monospace)',
    fontSize: "0.86rem",
    backgroundColor: "rgba(255, 255, 255, 0.03)"
  },
  ".cm-md-rule": {
    color: "rgba(147, 162, 170, 0.54)"
  },
  ".cm-md-markup": {
    color: "rgba(147, 162, 170, 0.46)"
  },
  ".cm-md-code": {
    fontFamily: 'var(--font-mono, "SFMono-Regular", Menlo, Monaco, Consolas, monospace)',
    fontSize: "0.9em",
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderRadius: "0.25rem"
  }
});

const markdownHighlightStyle = HighlightStyle.define([
  { tag: [tags.processingInstruction, tags.meta, tags.contentSeparator], class: "cm-md-markup" },
  { tag: tags.heading, color: "#f8fbff", fontWeight: "700" },
  { tag: tags.link, color: "#b7c9ff", textDecoration: "underline" },
  { tag: [tags.url, tags.escape], color: "rgba(183, 201, 255, 0.76)" },
  { tag: tags.monospace, class: "cm-md-code" },
  { tag: tags.strong, fontWeight: "700", color: "#f7fbff" },
  { tag: tags.emphasis, fontStyle: "italic", color: "#f2f5ff" },
  { tag: tags.quote, color: "rgba(225, 234, 239, 0.84)", fontStyle: "italic" },
  { tag: tags.list, color: "#e8f5f6" }
]);

function getMarkdownLineClass(text) {
  const trimmed = typeof text === "string" ? text.trimStart() : "";

  if (/^```/u.test(trimmed)) {
    return "cm-md-code-fence";
  }

  if (/^###\s/u.test(trimmed)) {
    return "cm-md-heading-3";
  }

  if (/^##\s/u.test(trimmed)) {
    return "cm-md-heading-2";
  }

  if (/^#\s/u.test(trimmed)) {
    return "cm-md-heading-1";
  }

  if (/^>\s?/u.test(trimmed)) {
    return "cm-md-quote";
  }

  if (/^(?:[-*+]\s|\d+[.)]\s)/u.test(trimmed)) {
    return "cm-md-list";
  }

  if (/^(?:---|\*\*\*|___)$/u.test(trimmed)) {
    return "cm-md-rule";
  }

  return "";
}

const markdownLineDecorations = ViewPlugin.fromClass(class {
  constructor(view) {
    this.decorations = this.buildDecorations(view);
  }

  update(update) {
    if (update.docChanged || update.viewportChanged) {
      this.decorations = this.buildDecorations(update.view);
    }
  }

  buildDecorations(view) {
    const decorationRanges = [];

    for (const { from, to } of view.visibleRanges) {
      let position = from;

      while (position <= to) {
        const line = view.state.doc.lineAt(position);
        const className = getMarkdownLineClass(line.text);

        if (className.length > 0) {
          decorationRanges.push(Decoration.line({ attributes: { class: className } }).range(line.from));
        }

        if (line.to >= to) {
          break;
        }

        position = line.to + 1;
      }
    }

    return Decoration.set(decorationRanges, true);
  }
}, {
  decorations: (plugin) => plugin.decorations
});

function renderMarkdownToHtml(markdownText) {
  return DOMPurify.sanitize(markdownParser.render(typeof markdownText === "string" ? markdownText : ""));
}

function createMarkdownEditor({ parentElement, initialText = "", readOnly = false, onChange, onBlur, onSaveShortcut }) {
  if (!(parentElement instanceof HTMLElement)) {
    throw new Error("A parent element is required to create the markdown editor.");
  }

  const editableCompartment = new Compartment();
  let isApplyingExternalText = false;

  const view = new EditorView({
    parent: parentElement,
    state: EditorState.create({
      doc: typeof initialText === "string" ? initialText : "",
      extensions: [
        basicSetup,
        markdown(),
        oneDark,
        markdownEditorTheme,
        syntaxHighlighting(markdownHighlightStyle),
        markdownLineDecorations,
        EditorView.lineWrapping,
        editableCompartment.of(EditorView.editable.of(readOnly !== true)),
        EditorView.contentAttributes.of({
          spellcheck: "false",
          autocorrect: "off",
          autocapitalize: "off"
        }),
        keymap.of([{
          key: "Mod-s",
          run: () => {
            if (typeof onSaveShortcut === "function") {
              onSaveShortcut();
            }

            return true;
          }
        }]),
        EditorView.updateListener.of((update) => {
          if (!update.docChanged || isApplyingExternalText || typeof onChange !== "function") {
            return;
          }

          onChange(update.state.doc.toString());
        }),
        EditorView.domEventHandlers({
          blur: () => {
            if (typeof onBlur === "function") {
              onBlur();
            }

            return false;
          }
        })
      ]
    })
  });

  return {
    destroy() {
      view.destroy();
    },
    focus() {
      view.focus();
    },
    getText() {
      return view.state.doc.toString();
    },
    setReadOnly(isReadOnly) {
      view.dispatch({
        effects: editableCompartment.reconfigure(EditorView.editable.of(isReadOnly !== true))
      });
    },
    setText(nextText) {
      const normalizedText = typeof nextText === "string" ? nextText : "";

      if (view.state.doc.toString() === normalizedText) {
        return;
      }

      isApplyingExternalText = true;
      view.dispatch({
        changes: {
          from: 0,
          to: view.state.doc.length,
          insert: normalizedText
        }
      });
      isApplyingExternalText = false;
    }
  };
}

export {
  createMarkdownEditor,
  renderMarkdownToHtml
};
