# Robust Workspace Explorer Design

## Goal

Make the workspace explorer in `canvas_desktop` materially more useful and resilient without turning the app into an IDE.

The explorer should:

- keep the current canvas-owned workspace model
- preview a broader set of common file types internally
- provide explicit fallback actions for files that are not previewed internally
- stay safe under Electron's current `main -> preload -> renderer` trust boundary
- set up a clean path toward a more scalable tree for large workspaces

## Product Intent

This app remains terminal-first.

The workspace explorer exists to help the user inspect artifacts created by shells and agents, not to compete with a full editor or file manager. The explorer should feel more robust than it does today, but it should still be secondary UI around the canvas.

That means:

- no `webview` shell architecture
- no renderer-side Node or arbitrary filesystem access
- no broad preload bridge
- no heavy editor chrome by default

## User Story

As a user, I want to click files in the workspace explorer and either preview them directly in the app or get a clear fallback action, so I can inspect outputs quickly without getting stuck on unsupported file types.

## Decision Summary

We should not copy `collab-public` wholesale.

We should copy the product pattern that makes sense:

- one selected path flows into one viewer decision
- the viewer chooses a renderer based on file kind
- unsupported content gets an explicit fallback instead of a dead end

We should not copy the architecture that does not fit:

- per-workspace `webview` surfaces
- shell-style event fanout between multiple embedded windows
- a broad IPC surface that grows with each UI surface

Recommended approach:

1. keep the current single-renderer app shell
2. upgrade preview classification from extension-whitelisted text only to file-kind-based rendering
3. add explicit fallback actions for unsupported or unrendered files
4. follow up with a lazy tree model for large workspaces instead of the current eager truncated snapshot

## Scope

### Phase 1: Richer Preview And Fallback Actions

In scope:

- preserve the current canvas-owned workspace selection model
- keep the existing left explorer + right inspector layout
- broaden internal preview support beyond text-only files
- keep code/text preview read-only and simple
- add explicit inspector actions for files that are not internally rendered
- preserve session restore for the active canvas's selected file
- keep current workspace watch/refresh behavior working

Out of scope for Phase 1:

- file editing
- Monaco, CodeMirror, or another full editor surface
- a React rewrite
- `webview`-based viewer or navigator surfaces
- audio/video editing controls
- arbitrary renderer-side `file://` access
- a complete replacement of the current tree loading model

### Phase 2: Scalable Tree Loading

This design also defines a follow-up direction for large workspaces, but that follow-up should be planned and implemented separately from Phase 1.

In scope for the follow-up:

- replace the eager full snapshot model with lazy directory reads
- remove the current `400`-entry ceiling as the primary navigation bottleneck
- refresh only affected directories on filesystem change
- auto-expand ancestor directories for selected files

## UX Design

### Explorer Tree

The left workspace tree keeps the current visual role: compact, secondary, and canvas-adjacent.

Behavior in Phase 1:

- clicking a directory toggles expansion
- clicking a file selects it and opens the inspector
- the selected file remains highlighted for the active canvas
- the currently selected file still restores when the canvas is revisited if it still exists
- when a file is unsupported, selection still succeeds and the inspector switches to a fallback action state

The tree UI should not introduce IDE-style panes, tabs, or split editors.

### Right Inspector

The right inspector remains the single place where file inspection happens.

It should support these states:

- empty: no file selected
- loading: request in flight
- error: preview failed safely
- text/code preview
- image preview
- PDF preview
- fallback actions for non-rendered file kinds

The inspector header should include:

- file name
- relative path
- file type label
- last modified metadata when available
- `Refresh` button when the current kind supports refresh
- fallback actions when internal preview is not available

### Unsupported Or Non-Rendered Files

When the selected file is not rendered internally, the inspector should not stop at `Preview not available`.

Instead it should show a clear fallback panel with actions such as:

- `Open externally`
- `Reveal in Finder`

Copy should explain why the file is not being rendered, for example:

- `This file type is not previewed inside the app.`
- `This file is too large for internal preview.`

## Supported File Behavior

### Text And Code

Text-like files remain read-only and lightweight.

Supported internal rendering should include the current set and expand conservatively as needed for common generated outputs. The existing plain monospace preview remains acceptable for Phase 1.

Examples:

- `.txt`
- `.md`
- `.json`
- `.js`, `.ts`, `.tsx`, `.jsx`
- `.html`, `.css`
- `.py`, `.sh`
- `.yaml`, `.yml`

### Markdown

Markdown continues to render as readable source in Phase 1, not as a full WYSIWYG or rich document surface.

Reasoning:

- preserves the app's terminal-first feel
- avoids adding a complex markdown renderer during a file-opening upgrade
- keeps the first implementation focused on robustness rather than polishing document UX

### JSON

JSON should continue to be pretty-printed when valid and shown as raw text when parsing fails.

### Images

Common image files should render internally in the inspector.

Examples:

- `.png`
- `.jpg`, `.jpeg`
- `.gif`
- `.webp`

For Phase 1, `.svg` should not be rendered internally. It should use the fallback action state.

Reasoning:

- avoids treating SVG as trusted document markup inside the inspector
- keeps the first implementation simple and predictable
- leaves room for a later explicit safe-SVG design if needed

The image view can stay simple:

- scaled-to-fit preview
- no editing tools
- no gallery mode

### PDF

PDF files should render internally in the inspector when they are within a conservative preview limit.

If a PDF exceeds the preview limit, the inspector falls back to `Open externally` and `Reveal in Finder`.

### Audio, Video, Binary, And Unknown Files

These should not be rendered internally in Phase 1.

Examples:

- audio files
- video files
- archives
- compiled binaries
- office documents that are not cheaply previewable in the current shell

These file kinds should land in the fallback action state rather than an error state.

## Preview Classification Model

The preview pipeline should change from `extension whitelist -> text read` into `file inspection -> render kind decision`.

Main process classification should produce one of these kinds:

- `text`
- `json`
- `image`
- `pdf`
- `audio`
- `video`
- `binary`
- `unsupported`
- `too-large`

The renderer then maps that kind to one of three outcomes:

1. internal text-like rendering
2. internal media rendering
3. fallback action panel

## Architecture

### Main Process — `main.js`

Main stays the filesystem owner.

Responsibilities for Phase 1:

- validate all requested workspace file actions against the active workspace root
- classify the selected file into a preview kind
- read text payloads directly when safe
- read bounded binary payloads for image and PDF preview when safe
- expose explicit IPC for fallback actions such as open externally and reveal in Finder
- continue to reject requests outside the workspace root

Important design choice:

The renderer should not build arbitrary `file://` URLs from workspace paths.

If the renderer needs image or PDF data, main should return a bounded, serializable payload such as base64 data plus MIME metadata. This keeps preview access subject to the same root validation and size limits as text previews.

### Preload — `preload.js`

Preload should stay narrow and explicit.

Phase 1 should expose targeted methods such as:

- `readWorkspaceFile(folderId, relativePath)` or a replacement with richer payloads
- `openWorkspaceFileExternally(folderId, relativePath)`
- `revealWorkspaceFile(folderId, relativePath)`

No raw `ipcRenderer`, filesystem handles, or generic shell hooks should be exposed.

### Renderer — `renderer.js`

Renderer remains responsible only for UI state and display.

Responsibilities for Phase 1:

- request the richer preview payload for the selected file
- render the correct inspector surface based on preview kind
- preserve selection and preview state per canvas
- show fallback actions for unsupported or non-rendered file kinds
- keep the rest of the app functional if preview fails

The renderer should not be responsible for trust decisions such as path traversal checks, MIME validation, or file existence checks outside the selected workspace state.

## Data Contract

The current preview payload is too narrow for richer preview types.

Phase 1 should move toward a payload shape like:

```js
{
  rootPath,
  relativePath,
  fileName,
  kind: "text" | "json" | "image" | "pdf" | "audio" | "video" | "binary" | "unsupported" | "too-large",
  language: "markdown" | "json" | "text" | "javascript" | null,
  mimeType: "text/plain" | "image/png" | "application/pdf" | null,
  textContents: string | "",
  binaryContentsBase64: string | "",
  lastModifiedMs,
  fallbackReason: string | ""
}
```

Important notes:

- only one of `textContents` or `binaryContentsBase64` should be populated for a given successful preview
- `audio`, `video`, `binary`, `unsupported`, and `too-large` may legitimately return no preview body and only fallback metadata
- payloads remain plain JSON and serializable through IPC

## Size Limits

Preview size limits should stay conservative and explicit.

Recommended defaults:

- text/code/JSON preview: keep the current `256 KB` cap
- image/PDF preview: use an `8 MB` cap for bounded internal preview payloads

If a selected file exceeds its category limit, it should become `too-large` and fall back to external actions rather than attempting partial or streaming preview in Phase 1.

## Security Constraints

These rules are mandatory:

- all preview actions must resolve relative paths against the selected workspace root in main
- the resolved real path must stay inside the real workspace root
- directory targets must be rejected by file preview actions
- unsupported or oversized files must fail safely into a non-crashing inspector state
- renderer code must not derive arbitrary `file://` URLs from workspace paths for preview
- external open and reveal actions must go through explicit main-process IPC

## Error Handling

Cases to handle explicitly:

- selected file deleted before or after preview load
- file changes type between refreshes
- file becomes too large for preview
- workspace root becomes unavailable
- image or PDF payload cannot be decoded in renderer
- external open or reveal action fails

Expected behavior:

- inspector shows a clear state instead of crashing
- rest of the workspace tree remains usable
- terminal workflows remain unaffected
- selection can be cleared or refreshed cleanly

## Phase 2 Direction: Scalable Tree Model

The current directory model in `directory_snapshot.js` is eager, flat, and capped. That is fine for small workspaces but becomes the next real robustness bottleneck once file opening improves.

The follow-up design direction should be:

- lazy-load directory contents on expansion
- cache loaded directories in renderer state
- refresh only affected directories on filesystem events
- preserve expanded directories per canvas workspace
- auto-expand ancestor directories when restoring a selected preview file

This direction borrows the useful idea from `collab-public`'s tree model without copying its `webview` composition.

## Testing And Verification

### Unit / Node-Level

Add or extend tests for:

- preview kind classification for text, image, PDF, and fallback kinds
- JSON pretty-print and malformed JSON fallback
- size-limit handling per preview kind
- path traversal rejection
- symlink escape rejection
- external-open and reveal IPC path validation

### Renderer / UI-Level

Add or extend tests for:

- file kind maps to the correct inspector branch
- unsupported files show fallback actions instead of a dead-end message
- selected file persistence per canvas still works
- switching canvases restores the correct preview state

### Smoke / Electron

Extend smoke coverage to verify at minimum:

- selecting a text file still previews correctly
- selecting an image opens an internal preview
- selecting a PDF opens an internal preview or a clean fallback if over limit
- selecting an unsupported file shows `Open externally` and `Reveal in Finder`
- switching canvases preserves each canvas's selected file state
- fallback actions do not break terminal creation or workspace switching

## Acceptance Criteria

- clicking a common text/code file opens a read-only internal preview
- clicking an image opens a simple internal image preview
- clicking a PDF opens an internal preview when within limits
- clicking an unsupported, binary, audio, or video file shows a clear fallback action panel
- `Open externally` and `Reveal in Finder` are explicit and safe
- preview state remains owned by the active canvas
- no new unsafe renderer filesystem access is introduced
- the current app shell remains simple and terminal-first

## Implementation Recommendation

The first implementation plan should target Phase 1 only.

Reasoning:

- it delivers the main user-visible robustness win quickly
- it avoids bundling file-rendering changes together with a risky tree rewrite
- it preserves a clean follow-up path for large-workspace navigation once preview behavior is in better shape
