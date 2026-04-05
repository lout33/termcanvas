# AGENTS.md

This file explains the local architecture of the `canvas_learning` app so future agents can extend it safely.

## Product intent

This is a minimal infinite-canvas Electron app for spatial terminal workflows.

Each node is a real interactive terminal, not a text note. The product should stay simple and terminal-first.

## Architecture overview

### Main process — `main.js`

Responsibilities:

- create the Electron window
- own the terminal session registry
- spawn PTY clients through `node-pty`
- attach PTY clients to long-lived `tmux` sessions when `tmux` is available
- fall back to plain shell PTYs when `tmux` is unavailable
- validate that a renderer only talks to its own terminal sessions
- detach live tmux-backed sessions when a window closes
- permanently destroy a terminal session when the user closes a node
- own workspace folder import, refresh, watch, and preview access
- own app-session file persistence in Electron `userData`
- own file dialog and local file read/write for canvas JSON import/export

Important rule:

**Real shell processes belong in main, never in the renderer.**

### Terminal identity model

The current session store is:

- `Map<terminalId, session>`

Important distinction:

- `terminalId` is the current renderer-to-main attachment id
- `sessionKey` is the stable terminal identity saved in app-session snapshots
- tmux session names are derived from `sessionKey`

Each session currently tracks:

- `ownerWebContentsId`
- `pty`
- `shellName`
- `cwd`
- `backend` (`"tmux"` or `"pty"`)
- `sessionKey`
- `tmuxSessionName`
- `isDisposing`

Detach semantics matter:

- closing the app/window should detach from tmux-backed sessions in normal runs
- clicking a node close button should kill the underlying session permanently
- smoke-test mode disables persistent relaunch behavior so tests do not leak sessions

### App-session persistence

The app now persists a normalized JSON snapshot under Electron `userData`.

That snapshot includes:

- canvases and active canvas
- viewport position and zoom
- terminal node layout, titles, cwd, maximize state, and stable `sessionKey`
- workspace folders, active folder, expanded directories, and file preview state
- sidebar and onboarding UI state

Normalization lives in `session_snapshot.js`.

### Preload bridge — `preload.js`

Responsibilities:

- expose the smallest safe API to the renderer
- translate renderer calls into IPC invocations/events
- expose narrow app-session, workspace, terminal, and import/export methods

Important rule:

**Do not expose raw `ipcRenderer`, Node APIs, or arbitrary shell execution hooks.**

Current exposed API includes:

- `loadAppSession()`
- `saveAppSession(payload)`
- `restoreWorkspaceSession(payload)`
- `getWorkspaceDirectoryState()`
- `openWorkspaceDirectory()`
- `refreshWorkspaceDirectory()`
- `activateWorkspaceFolder(folderId)`
- `reorderWorkspaceFolder(folderId, targetIndex)`
- `removeWorkspaceFolder(folderId)`
- `readWorkspaceFile(folderId, relativePath)`
- `createTerminal(payload)`
- `resolveTrackedTerminalCwds(terminalIds)`
- `writeTerminal(terminalId, data)`
- `resizeTerminal(terminalId, cols, rows)`
- `destroyTerminal(terminalId, options)`
- `saveCanvasFile(payload)`
- `openCanvasFile()`
- `onTerminalData(callback)`
- `onTerminalExit(callback)`
- `onTerminalCwdChange(callback)`
- `onWorkspaceDirectoryData(callback)`

### Renderer — `renderer.js`

Responsibilities:

- maintain viewport offset and zoom for the infinite canvas
- create terminal nodes in world coordinates
- host `xterm.js` instances inside node containers
- route keyboard input to the correct PTY client
- react to terminal output, exit, and cwd events from preload
- manage canvases, workspace drawer state, and file inspector state
- serialize and hydrate app-session state
- serialize canvas exports and restore imported canvases as new terminal nodes

Important rule:

**Renderer nodes are views plus layout state. They are not the owners of shell processes.**

Renderer node records now carry both:

- `terminalId`: current live attachment, nullable while detached or exited
- `sessionKey`: stable persisted identity for reconnecting to the same tmux-backed shell

## Current interaction model

- drag empty paper to pan the canvas
- modifier-wheel on empty paper zooms the canvas
- double-click empty paper to create a terminal node
- drag a terminal node by its header to move it
- resize nodes from edge and corner handles
- maximize a node into the board and restore it in place
- `Cmd+B` toggles the left drawer
- `Cmd+L` closes the file preview
- closing the app should preserve live tmux-backed terminals for reattach on relaunch
- clicking a terminal node close button should remove the node and kill that terminal session

## IPC contract

### Request/response

- `app-session:load`
- `app-session:save`
- `workspace-session:restore`
- `workspace-directory:state`
- `workspace-directory:open`
- `workspace-directory:refresh`
- `workspace-directory:debug-open`
- `workspace-folder:activate`
- `workspace-folder:reorder`
- `workspace-folder:remove`
- `workspace-file:read`
- `terminal:create`
- `terminal:resolve-tracked-cwds`
- `terminal:write`
- `terminal:resize`
- `terminal:destroy`
- `canvas:save-file`
- `canvas:open-file`

### Main-to-renderer events

- `terminal:data`
- `terminal:exit`
- `terminal:cwd-changed`
- `workspace-directory:data`

Payload shape should stay plain and serializable.

Examples:

- `{ terminalId, data }`
- `{ terminalId, exitCode, signal }`
- `{ terminalId, cwd }`
- `{ terminalId, preserveSession }`

## UI structure

### `index.html`

Contains the static app shell:

- board root
- overlay left drawer
- file preview inspector
- intro hint chips
- empty state
- node layer

### `styles.css`

Contains:

- board styling and viewport-scaled grid offsets
- overlay drawer and file inspector chrome
- canvas and workspace list styles
- terminal node chrome and maximize states
- terminal surface sizing

### `renderer.js`

Contains:

- viewport state and gestures
- drawer and preview state
- node creation, removal, move, resize, maximize, and restore
- app-session serialization and hydration helpers
- canvas import/export serialization helpers
- xterm mounting and PTY input/output wiring

## Extension rules

If you extend this app, follow these constraints:

1. keep Node access out of the renderer
2. keep PTY and tmux lifecycle in main
3. keep preload narrow and explicit
4. prefer world coordinates for canvas entities
5. keep saved session data normalized and plain JSON
6. do not add frameworks casually

## Safe next extensions

These are reasonable future upgrades:

- stronger real relaunch tests for tmux-backed session reattach
- better UI for stale or missing tmux sessions on reopen
- session cleanup or naming diagnostics for advanced users
- richer workspace browsing and file actions
- multi-window behavior for shared tmux-backed terminals

## Risk areas

Future agents should be careful around:

- orphan tmux sessions
- confusing detach-on-close with destroy-on-close
- changing `sessionKey` semantics and breaking reconnectability
- terminals receiving input after exit or detach
- resize storms from observers
- canvas gestures fighting terminal selection/focus
- adding unsafe preload or IPC surfaces
- changing smoke-test behavior and leaking persistent sessions in CI-style runs

## Verification expectations

When changing terminal behavior, verify at minimum:

1. `npm run build`
2. `npm test`
3. app launches in Electron
4. a node can create a live shell session
5. terminal input reaches the shell
6. terminal output returns to the node
7. destroying a node cleans up its terminal session
8. closing and reopening the app reattaches live tmux-backed terminals in normal runs
