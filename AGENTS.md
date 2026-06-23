# AGENTS.md

This file explains the local architecture of the `TermCanvas` app so future agents can extend it safely.

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
- own file dialog and local file read/write for canvas JSON and app-data JSON import/export

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
- `saveAppSessionFile(payload)`
- `openAppSessionFile()`
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
- `app-session:save-file`
- `app-session:open-file`
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

<!-- TERMCANVAS_MANAGER_RULES_START -->
## TermCanvas Agentmux Rules

This workspace is connected to TermCanvas project `vault1-25596a7f-6`.
Managed terminals can be commanders or workers. Do not assume your role from this file alone.
Canvas id: `25596a7f-6da5-4b55-88db-f4723a4e2c5d`
Canvas name: `Canvas 3`
Workspace root: `/Users/pepe/Documents/vault1/projects/termcanvas`

### Session Awareness

Every managed terminal receives these environment variables:

```bash
env | grep '^AGENTMUX_'
```

Important fields:

- `AGENTMUX_ROLE=commander` means you coordinate the project and may create workers.
- `AGENTMUX_ROLE=worker` means you do assigned work and should not create workers unless explicitly asked.
- `AGENTMUX_AGENT_NAME` is your durable agent name.
- `AGENTMUX_PROJECT` is the project tag shared by all agents on this canvas.
- `AGENTMUX_PARENT_AGENT` points to the commander for workers.
- `AGENTMUX_DEPTH` is `0` for commanders and `1` for workers in this version.

Before deciding whether to coordinate or execute, inspect your own record:

```bash
"/Users/pepe/Documents/vault1/projects/termcanvas/vendor/agentmux/agentmux" show "$AGENTMUX_AGENT_NAME"
```

Role behavior:

- If `AGENTMUX_ROLE=commander`, coordinate the project and create workers when useful.
- If `AGENTMUX_ROLE=worker`, complete your assigned task and report back; do not create workers unless explicitly asked.
- If `AGENTMUX_ROLE` is missing, you are not in a managed agentmux session; do not assume commander privileges.

### Worker Creation

Commanders create worker agents with:

```bash
"/Users/pepe/Documents/vault1/projects/termcanvas/vendor/agentmux/agentmux" worker "vault1-25596a7f-6" "<worker-name>" --workdir "/Users/pepe/Documents/vault1/projects/termcanvas" --harness shell
```

With an initial prompt:

```bash
"/Users/pepe/Documents/vault1/projects/termcanvas/vendor/agentmux/agentmux" worker "vault1-25596a7f-6" "<worker-name>" --workdir "/Users/pepe/Documents/vault1/projects/termcanvas" --harness shell --prompt "<initial prompt>"
```

Example:

```bash
"/Users/pepe/Documents/vault1/projects/termcanvas/vendor/agentmux/agentmux" worker "vault1-25596a7f-6" "test-worker" --workdir "/Users/pepe/Documents/vault1/projects/termcanvas" --harness shell
```

### Prompt An Existing Worker

To send a prompt to an existing worker, run:

```bash
"/Users/pepe/Documents/vault1/projects/termcanvas/vendor/agentmux/agentmux" send "<agent-or-short-id>" "<prompt>"
```

Example:

```bash
"/Users/pepe/Documents/vault1/projects/termcanvas/vendor/agentmux/agentmux" send "test-worker" "Make a joke"
```

### Inspect A Worker

Show detailed worker state:

```bash
"/Users/pepe/Documents/vault1/projects/termcanvas/vendor/agentmux/agentmux" show "<agent-or-short-id>"
```

Read recent worker output:

```bash
"/Users/pepe/Documents/vault1/projects/termcanvas/vendor/agentmux/agentmux" logs "<agent-or-short-id>"
```

### Rules

- Never create raw tmux sessions for workers.
- Never use `tmux new-session` for worker creation.
- Keep workers in the same project tag so TermCanvas can materialize them on the same canvas.
- Commanders may create and coordinate workers.
- Workers should complete their assigned task and report back; they should not create workers unless explicitly asked.
- When asked to create a worker, execute the worker command directly instead of researching first.
- When asked to prompt an existing worker, use `agentmux send` directly instead of opening help first.
- When asked to inspect an existing worker, prefer `agentmux show` and `agentmux logs`.
- Do not run `agentmux --help` or `agentmux send --help` unless the operator explicitly asks for documentation.
- After creating a worker, tell the operator the worker name you created.
<!-- TERMCANVAS_MANAGER_RULES_END -->
