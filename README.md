# TermCanvas

TermCanvas is a desktop app that lets you arrange real terminal sessions on an infinite canvas.

It is built for developers who juggle multiple repos, shells, AI agents, and long-running tasks and want something more spatial than tabs or split panes.

## Demo

![TermCanvas demo GIF showing live terminal nodes being arranged on the canvas](./docs/termcanvas-demo.gif)

Demo video: https://www.youtube.com/watch?v=4XN5jvk9P1U

## What It Is

- a spatial terminal workspace
- an infinite canvas for real shell sessions
- a desktop app for managing multiple terminals side by side
- a better fit for task-based terminal work than a pile of tabs

## Why People Use It

Normal terminal tabs get crowded fast.

TermCanvas gives each task its own terminal node, so you can keep one shell per repo, feature, agent, or service and place them where they make sense.

Examples:

- one terminal for the app server, one for tests, one for logs
- one terminal per client repo or microservice
- one terminal per AI coding agent
- one canvas per project, sprint, or research thread

## Key Features

- Real interactive shell terminals rendered with `xterm.js`
- Infinite canvas with pan and zoom
- Multiple canvases for separate work contexts
- Drag, resize, rename, maximize, restore, and close terminal nodes
- Workspace drawer for browsing imported folders and previewing files
- App-session restore across relaunches
- `tmux`-backed terminal reattach when available
- Canvas JSON export and import
- Full app-data JSON export and import for moving setups between installs
- Electron security boundary with Node kept out of the renderer

## Good Fit For

- developers who live in the terminal
- people managing several repos at once
- AI-assisted coding workflows
- research, debugging, and parallel task execution
- anyone who wants terminal layout memory across app relaunches

## Quick Start

```bash
npm install
npm run dev
```

`tmux` is recommended if you want live terminal sessions to survive app relaunches.

## How It Works

- Double-click empty space to create a terminal
- Drag the canvas to move around
- Use modified mouse wheel to zoom
- Switch between canvases from the top bar
- Open folders in the left drawer to browse files next to your terminals
- Close the app and reopen it to restore layout and session state

## Keyboard Shortcuts

- `Cmd+B`: toggle the left drawer
- `Cmd+M`: maximize or restore the selected terminal node
- `Cmd+L`: close the file preview inspector
- `Esc`: close the current preview or exit maximize mode

## Session Restore

TermCanvas saves both layout state and terminal identity.

On a normal run:

- canvases, node positions, viewport, workspaces, and preview state are saved automatically
- each terminal node keeps a stable session identity
- if `tmux` is available, closing the app detaches from the live shell instead of killing it
- reopening the app reattaches to that same shell session

Important behavior:

- closing a terminal node with `x` destroys that terminal session
- closing the app preserves live `tmux`-backed terminals for relaunch
- without `tmux`, the app still restores the UI layout, but not the exact live shell process

## Move Data Between Installs

Use the canvas menu to export and import full app data as JSON.

- `Export app data` writes the saved app session to a `.json` file
- `Import app data` replaces the saved app session for the next launch
- after import, close and reopen `TermCanvas` to load the new state cleanly

## Build Checks

```bash
npm run build
```

This runs a fast syntax check for the main Electron files.

## Local macOS Build

```bash
npm run dist:mac
```

This builds local unsigned macOS release artifacts in:

```text
release/
```

Current outputs include:

- `.dmg`
- `.zip`
- packaged `.app`

## Opening The Downloaded App On macOS

Current macOS builds are unsigned, so macOS may block the app the first time you open it.

After downloading:

1. Open the downloaded `.dmg` or `.zip`.
2. Move `TermCanvas.app` into your `Applications` folder.
3. In Finder, right-click `TermCanvas.app` and choose `Open`.
4. When macOS shows the warning dialog, click `Open` again.

If macOS still blocks the app:

1. Open `System Settings`.
2. Go to `Privacy & Security`.
3. Scroll to the security section and click `Open Anyway` for `TermCanvas`.
4. Open the app again and confirm the final prompt.

After the first successful launch, you can open `TermCanvas` normally like any other app.

## GitHub Releases

TermCanvas uses a tag-driven GitHub release flow for macOS builds.

Release steps:

```bash
npm version patch --no-git-tag-version
git add package.json package-lock.json
git commit -m "chore: release v0.1.1"
git push origin main
git tag v0.1.1
git push origin v0.1.1
```

When the `v0.1.1` style tag is pushed, GitHub Actions:

- verifies the tag matches `package.json`
- runs the macOS build pipeline
- creates a GitHub Release for that tag
- uploads the `.dmg` and `.zip` artifacts

## Current Limits

- no node connections or graph linking yet
- no collaboration yet
- no polished multi-window shared-terminal flow yet
- no guaranteed session continuity if `tmux` sessions are killed outside the app

## Tech Stack

- Electron
- `node-pty`
- `tmux`
- `xterm.js`

## Search Tags

`terminal workspace`, `spatial terminal`, `infinite canvas terminal`, `tmux desktop app`, `developer productivity`, `ai agent workspace`, `electron terminal app`, `visual terminal manager`, `multi terminal workspace`

## Development

If you want to work on the codebase, read `AGENTS.md` first.
