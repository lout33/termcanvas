# AGENTS.md

This file explains the local architecture of the `canvas_learning` app so future agents can extend it safely.

## Product intent

This is a minimal infinite-canvas Electron app where each node is a real interactive terminal session.

Keep the product simple. Do not add extra systems unless the user explicitly asks for them.

## Architecture overview

### Main process — `main.js`

Responsibilities:

- create the Electron window
- spawn PTY-backed shell sessions
- own the terminal session registry
- validate that a renderer only talks to its own terminal sessions
- kill sessions when nodes or windows go away
- own file dialog and local file read/write for canvas JSON import/export

Important rule:

**Real shell processes belong in main, never in the renderer.**

The current session store is:

- `Map<terminalId, session>`

Each session currently tracks:

- `ownerWebContentsId`
- `pty`
- `shellName`
- `isDisposing`

### Preload bridge — `preload.js`

Responsibilities:

- expose the smallest safe terminal API to the renderer
- translate renderer calls into IPC invocations/events
- expose narrow file import/export methods for canvas JSON

Important rule:

**Do not expose raw `ipcRenderer`, Node APIs, or arbitrary shell execution hooks.**

### Renderer — `renderer.js`

Responsibilities:

- maintain viewport offset for the infinite canvas
- create terminal nodes in world coordinates
- host `xterm.js` instances inside node containers
- route keyboard input to the correct PTY session
- react to terminal output/exit events from preload
- serialize active canvas layout to JSON and restore imported layouts as fresh terminal nodes

Important rule:

**Renderer nodes are views plus layout state. They are not the owners of shell processes.**

## Current interaction model

- drag empty paper to pan the canvas
- double-click empty paper to create a terminal node
- drag a terminal node by its header to move it
- terminal node focus should suppress canvas panning
- close button destroys the terminal session and removes the node

## IPC contract

### Request/response

- `terminal:create`
- `terminal:write`
- `terminal:resize`
- `terminal:destroy`
- `canvas:save-file`
- `canvas:open-file`

### Main-to-renderer events

- `terminal:data`
- `terminal:exit`

Payload shape should stay plain and serializable.

Examples:

- `{ terminalId, data }`
- `{ terminalId, cols, rows }`
- `{ terminalId, exitCode, signal }`

## UI structure

### `index.html`

Contains the static board shell:

- board root
- canvas sidebar actions
- moving grid layer
- intro hint
- empty state
- node layer

### `styles.css`

Contains:

- dark board styling
- moving grid offsets through CSS variables
- canvas import/export controls
- terminal node chrome
- terminal surface sizing

### `renderer.js`

Contains:

- viewport state
- pan gesture logic
- node creation/removal
- canvas import/export serialization helpers
- xterm mounting
- PTY input/output wiring

## Extension rules

If you extend this app, follow these constraints:

1. keep Node access out of the renderer
2. keep PTY lifecycle in main
3. keep preload narrow and explicit
4. prefer world coordinates for canvas entities
5. avoid persistence unless requested
6. do not add frameworks casually

## Safe next extensions

These are reasonable future upgrades:

- resize nodes and propagate terminal resize
- persist node layout
- restore terminal metadata on relaunch
- add zoom to the canvas

## Risk areas

Future agents should be careful around:

- orphan PTY sessions
- terminals receiving input after exit
- resize storms from observers
- canvas gestures fighting terminal selection/focus
- adding unsafe preload or IPC surfaces

## Verification expectations

When changing terminal behavior, verify at minimum:

1. `npm run build`
2. renderer diagnostics are clean
3. app launches in Electron
4. a node can create a live shell session
5. terminal input reaches the shell
6. terminal output returns to the node
7. destroying a node cleans up its PTY
