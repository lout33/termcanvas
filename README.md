# Canvas Learning

Canvas Learning is a minimal Electron app for spatial terminal workflows.

Instead of text notes, the canvas opens real shell terminals as world-space nodes. You can pan and zoom the board, open multiple canvases, browse workspace files, and reopen the app into the same working session.

## What it does

- Multi-canvas workspace with create, switch, rename, delete, and reorder
- Infinite-style canvas with drag-to-pan navigation and modifier-wheel zoom
- Double-click empty space to create a terminal node
- Real interactive shell terminals rendered with `xterm.js`
- Resize, rename, maximize, restore, and close terminal nodes
- Overlay left drawer for canvases and imported workspace folders
- Multiple imported workspace folders with reorder and active-folder switching
- Workspace file browser and file preview inspector
- App-session restore across relaunches
- tmux-backed live terminal reattach on reopen when `tmux` is available
- Canvas JSON export/import for the active canvas
- Clean Electron security boundary: Node stays out of the renderer

## Session persistence

The app now persists both UI state and terminal identity.

On a normal app run:

- canvases, node layout, viewport, workspaces, and preview state are saved automatically
- each terminal node saves a stable session identity
- if `tmux` is available, closing the app detaches from the live shell instead of killing it
- reopening the app reattaches the node to the same running shell session

Important behavior:

- closing a terminal node with `×` destroys that terminal for real
- closing the app/window preserves live tmux-backed terminals for relaunch
- if `tmux` is unavailable, the app falls back to plain PTY shells and still restores layout/state, but not the exact live shell process

## Working directory behavior

- new terminals start in the active workspace folder when one is selected
- otherwise they start in the app default terminal directory
- the renderer tracks straightforward `cd` usage and keeps each node's cwd updated
- exported canvases store each terminal node's tracked working directory
- restored terminals reopen or reattach using that saved directory when possible
- if the saved directory no longer exists, the app falls back to the default terminal directory

Current limitation: cwd tracking still follows straightforward `cd` usage rather than trying to perfectly reconstruct every shell-specific directory change pattern.

## What it does not do yet

- node connections, minimap, or collaboration
- polished multi-window shared-terminal UX
- advanced tmux/session diagnostics in the UI
- guaranteed session continuity if tmux sessions are manually killed outside the app

## Run it

```bash
npm install
npm run dev
```

`tmux` is recommended for true terminal persistence across app relaunches.

## Build check

```bash
npm run build
```

This build step is a fast syntax check for `main.js`, `preload.js`, and `renderer.js`.

## Fast smoke test

The project includes a focused Electron smoke path that checks the core runtime:

- app launches
- terminal node creation works
- terminal output flows back into the node
- canvases stay isolated
- exported/imported terminals preserve tracked working directories
- workspace preview and list behaviors still work

Run it with:

```bash
CANVAS_SMOKE_TEST=1 npm run dev
```

Smoke mode intentionally disables persisted relaunch behavior so tests do not leave tmux sessions or app-session files behind.

## How it works

The app is split into three layers:

### 1. Electron main process

File: `main.js`

- creates the `BrowserWindow`
- owns all terminal session state
- spawns PTY clients through `node-pty`
- attaches PTY clients to tmux-backed sessions when possible
- falls back to raw shell PTYs when tmux is unavailable
- validates terminal ownership by Electron window
- handles workspace registry, file preview reads, and import/export dialogs
- persists and restores the app-session snapshot under Electron `userData`

### 2. Electron preload bridge

File: `preload.js`

- exposes a small, focused API on `window.noteCanvas`
- keeps `contextIsolation: true`
- prevents the renderer from getting direct Node or raw IPC access

### 3. Renderer canvas

Files: `index.html`, `styles.css`, `renderer.js`

- maintains viewport state and world-space node positions
- stores canvases, terminal nodes, drawer state, and preview state
- mounts one `xterm.js` instance per live node
- serializes and hydrates app-session state
- serializes canvas exports and restores imported canvases as new nodes
- treats terminal nodes as UI plus layout state, not process owners

## Terminal identity model

There are two important ids in the system:

- `terminalId`: the current live renderer-to-main attachment
- `sessionKey`: the stable terminal identity saved with the node

The stable `sessionKey` is what allows a terminal node to reattach to the same tmux-backed shell after the app reopens.

## Dependencies

- `electron` for the desktop shell
- `node-pty` for PTY clients
- `tmux` for persistent terminal reattach across relaunches
- `@xterm/xterm` for terminal rendering
- `@xterm/addon-fit` for sizing terminals to node containers

## Default shell behavior

On macOS, the app uses:

1. `process.env.SHELL`
2. fallback: `/bin/zsh`

## Keyboard shortcuts

- `Cmd+B`: toggle the left drawer
- `Cmd+L`: close the file preview inspector
- `Esc`: close the current preview or exit maximize mode

## Next logical steps

If you keep growing this app, the clean next steps are:

1. stronger relaunch-specific tests for persistent tmux sessions
2. better stale-session recovery UI when a tmux session is missing
3. multi-window shared-terminal behavior
4. richer workspace actions
5. session cleanup and diagnostics tools

If you add those, read `AGENTS.md` first so you keep the process boundaries intact.
