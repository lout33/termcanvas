# Canvas Learning

Canvas Learning is a minimal Electron app for spatial terminal workflows.

Instead of text notes, the canvas opens real shell terminals as world-space nodes. You can pan across the canvas, double-click empty space to create a terminal node, and interact with each shell directly inside the board.

## What it does

- Infinite-style canvas with drag-to-pan navigation
- Double-click empty space to create a terminal node
- Real interactive shell sessions backed by the local machine
- One shell session per node
- Inline terminal node renaming and canvas-level maximize/restore
- Clear exited-state recovery with reopen-in-place for a fresh shell
- Export the active canvas to a JSON file
- Import a canvas JSON file as a new canvas
- Clean Electron security boundary: Node stays out of the renderer

## What it does not do yet

- Full app persistence or automatic session restore across launches
- Resizing nodes
- Node connections, zoom, minimap, or collaboration
- Multi-window shared terminal sessions

Imported canvas files restore terminal layout and node UI metadata such as custom titles and maximized state, not live PTY process history. Each imported terminal node starts a fresh shell.

## Run it

```bash
npm install
npm run dev
```

## Build check

```bash
npm run build
```

This build step is a fast syntax check for the main, preload, and renderer scripts.

## How it works

The app is split into three layers:

### 1. Electron main process

File: `main.js`

- Creates the BrowserWindow
- Owns all shell-backed PTY sessions through `node-pty`
- Validates terminal ownership by Electron window
- Relays terminal output and exit events back to the renderer
- Cleans up terminal sessions when a window closes

### 2. Electron preload bridge

File: `preload.js`

- Exposes a tiny, focused API into `window.noteCanvas`
- Keeps `contextIsolation: true`
- Prevents the renderer from getting direct Node or raw IPC access

Current exposed API:

- `createTerminal(payload)`
- `writeTerminal(terminalId, data)`
- `resizeTerminal(terminalId, cols, rows)`
- `destroyTerminal(terminalId)`
- `saveCanvasFile(payload)`
- `openCanvasFile()`
- `onTerminalData(callback)`
- `onTerminalExit(callback)`

### 3. Renderer canvas

Files: `index.html`, `styles.css`, `renderer.js`

- Maintains infinite-canvas viewport state
- Stores terminal nodes in world coordinates
- Serializes the active canvas to a versioned JSON shape
- Restores imported canvas files as new canvases with fresh shell sessions
- Renders one `xterm.js` instance per node
- Converts viewport movement into screen-space positioning
- Prevents canvas panning when the pointer is inside a terminal node

## Dependencies

- `electron` for the desktop shell
- `node-pty` for local shell processes
- `@xterm/xterm` for terminal rendering
- `@xterm/addon-fit` for sizing the terminal to its node container

## Default shell behavior

On macOS, the app uses:

1. `process.env.SHELL`
2. fallback: `/bin/zsh`

## Next logical steps

If you keep growing this app, the clean next steps are:

1. node persistence
2. node resizing
3. reconnectable sessions
4. canvas zoom
5. terminal session restore

If you add those, read `AGENTS.md` first so you keep the process boundaries intact.
