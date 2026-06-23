# Panels research — fork an editor vs. build the tree (2026-06-18)

**Question (Luis):** the left/right panels are weak. Building a robust file navigator is real
work, so — can I fork VS Code / Zed / a similar OSS editor and bolt my infinite-canvas-of-
terminals on top, so I keep developing the *main idea* instead of building a file explorer?

**Short answer:** No — don't fork an editor for this. It's a category error that *inverts
ownership* of the project. Build (or drop in) a file tree instead. It's days, not the
VS-Code-scale commitment it feels like.

---

## The thing that decides everything

**You can't extract VS Code's (or Zed's) file explorer.** There is no liftable "file-tree
package." VS Code's explorer is welded to the workbench — `ExplorerService`, `ExplorerItem`,
the tree renderer, clipboard/search/undo-redo services. Confirmed: the only path to "use VS
Code's panel" is to **ship inside VS Code**, not to borrow a piece of it.

So "borrow the panel" collapses into two genuinely different projects:

### Option A — Fork the whole editor (Code-OSS/VSCodium, Theia, void, Cursor-style)
This **inverts ownership**: the infinite canvas stops being *the app* and becomes a **webview
panel inside someone else's editor**. You become a VS Code-extension / Theia developer, not a
TermCanvas developer. The file tree comes free — but everything you've built (the canvas shell,
agentmux integration, delegation edges) gets rebuilt against their architecture.
- **Stack mismatch is fatal here:** TermCanvas is a **vanilla-JS Electron renderer** (one
  7k-line `renderer.js`, no framework). Code-OSS/Theia bring the entire TypeScript workbench;
  **Zed is Rust + GPUI (not even JS)** — forking Zed means leaving your stack entirely.
- **When this is actually right:** only if you decide the *editor* is the product and the canvas
  is a feature of it. That's a different north star than CANVAS-ROADMAP.md.

### Option B — Get / build a file-tree component (recommended)
Keep the canvas as the shell. Fill the one genuine gap: a robust **left** file tree.

---

## The two panels are NOT equally weak — separate them

- **Right panel (doc nav):** mostly *already solved*. You're on CodeMirror 6, and roadmap **M6**
  is literally "tabs + warm CM6 pool + path footer." That's a finish-it task, not a fork target.
- **Left panel (file tree):** the *only* real gap. Robust = rename, drag-drop, context menu,
  git-status decorations, fs-watch, virtualization for big dirs. That's days of focused work —
  and the disproportion is stark: **forking a million-line editor to avoid building one tree.**

## Vanilla-JS file-tree candidates (survive the no-framework filter)

Most "best file tree" libraries are React and don't drop into your renderer. These don't need a
framework:

| Library | Notes | Fit |
|---|---|---|
| **cubiclesoft/js-fileexplorer** | Zero-dep, pure JS. Navigate/manage/upload/download, full keyboard+mouse+touch, shortcuts. Closest to a "file manager" out of the box. | Strong |
| **sortable-tree** (marcantondahmen) | Dependency-free TS, native DOM/events, drag-drop + foldable. Clean "drop a script in" model. | Strong for the tree itself |
| **yy-tree** (davidfig) | Vanilla drag-drop tree, built *because* others need Vue/React. | Good base, less file-specific |
| **vanillatree** | Collapsible tree + context menu, vanilla. | Lightweight base |

**Realistic plan:** start from `js-fileexplorer` or `sortable-tree` for the tree mechanics +
drag-drop + context menu, and wire your own fs access (you already have `directory_snapshot.js`,
`main_workspace_service.js`, `workspace_registry.js`) and git-status decorations. You own the
data layer already — the borrowed part is just the tree widget.

---

## Recommendation

**Build the left file tree on a vanilla widget; finish the right panel as M6 with CM6.** Keep
TermCanvas as the shell. Forking an editor would trade your core idea for someone else's
architecture to save work you can do in days.

Pick is yours. If you *want* the editor-as-product path (Option A), that's a legitimate but
different bet — worth deciding deliberately, not drifting into via "I just wanted a file panel."

## Open item — "set"
You named three repos you like: zed, vs code, and **"set"** — that one's garbled (voice). It's
your strongest taste signal and I won't guess it into the research. Did you mean **Lapce**,
**Pulsar**, **Theia**, **void**, or something else? Tell me and I'll fold it in.

## Sources
- https://blog.logrocket.com/native-alternatives-vscode/
- https://opensource.com/article/20/6/open-source-alternatives-vs-code
- https://deepwiki.com/microsoft/vscode (File Explorer architecture)
- https://github.com/cubiclesoft/js-fileexplorer
- https://dev.to/marcantondahmen/building-sortable-tree-a-lightweight-drag-drop-tree-in-vanilla-typescript-f7l
- https://github.com/davidfig/tree
- https://www.cssscript.com/interactive-tree-view-vanilla-javascript-vanillatree/
</content>
</invoke>
