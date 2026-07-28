# termcanvas

## see which ai coding agent needs you.

termcanvas is an open-source macos app for steering claude code, codex, opencode, and shell sessions on a tmux-backed canvas.

each node is a real terminal. the sidebar shows your live agent tree, the canvas shows how agents are connected, and the attention chip points you to sessions waiting for a decision.

[download the latest release](https://github.com/lout33/termcanvas/releases/latest) | [read the story](https://yupanqui.xyz/termcanvas-demo) | [install the agent skill](https://skills.sh/lout33/termcanvas)

requires macos on apple silicon and [`tmux`](https://github.com/tmux/tmux). the current build is unsigned.

![termcanvas showing a live tree of agent terminals and an agent waiting for attention](./assets/termcanvas-v2.png)

## why it exists

running several coding agents is easy. keeping track of them is the work.

once every task has its own terminal, you start checking the same tabs on a loop: which agent is working, which one finished, which one needs input, and which one quietly failed.

termcanvas keeps the whole fleet visible. when an agent needs you, the header turns amber. click it to move directly to the relevant terminal instead of polling every session yourself.

## install

1. install tmux:

   ```bash
   brew install tmux
   ```

2. download the `.dmg` from the [latest release](https://github.com/lout33/termcanvas/releases/latest).
3. move `TermCanvas.app` into `/Applications`.
4. right-click the app in Finder and choose `Open` the first time.

if gatekeeper still blocks the unsigned build, open `System Settings > Privacy & Security` and choose `Open Anyway`.

on first launch, choose a project folder. double-click empty canvas space to create your first terminal.

## what it does

- runs real interactive terminals on a pan-and-zoom canvas
- shows working, idle, done, stale, failed, and waiting agents in one fleet summary
- turns the attention chip amber when an agent needs input or fails
- cycles through those terminals when you click the chip
- shows agent spawn lineage and peer connections as graph edges
- lets any agent spawn a child, connect to a peer, or delegate with `ask`
- keeps terminals alive through app relaunches with tmux
- restores canvases, positions, titles, project folders, and terminal identity
- browses and previews project files beside the terminals using them
- focuses one terminal across the workspace without losing the rest of the canvas
- exports and imports canvas or full app data as json

prompt detection is best-effort. agent harnesses render prompts differently, so some requests for input may not be recognized yet.

## who it is for

termcanvas is for developers already running several coding agents, shells, services, or logs and feeling the cost of checking them manually.

if you run one agent in one terminal, your existing terminal is probably enough.

## why not just use tmux or tabs?

tmux is the durable session layer underneath termcanvas. it keeps processes alive, but it does not show the spatial layout or live agent graph.

tabs and panes work while the workload still fits in your head. termcanvas becomes useful when the question changes from "where is that terminal?" to "which terminal needs me now?"

## the agent graph

termcanvas includes [`agentmux`](./vendor/agentmux), which turns managed terminals into a graph of peer agents. there is no fixed commander or manager. any agent can spawn a child, connect to another agent, and delegate work.

every terminal created on the canvas starts with `AGENTMUX_PROJECT`, `AGENTMUX_AGENT_NAME`, `AGENTMUX_BIN`, and related environment variables. agents launched inside it inherit that context automatically.

inside a managed terminal, agents can use:

```bash
"$AGENTMUX_BIN" neighbors
"$AGENTMUX_BIN" child <parent> <name> --prompt "handle this task"
"$AGENTMUX_BIN" connect <agent-a> <agent-b> --announce
"$AGENTMUX_BIN" ask <agent> "investigate this and return the answer"
"$AGENTMUX_BIN" check <agent>
"$AGENTMUX_BIN" logs <agent> --lines 120
"$AGENTMUX_BIN" send <agent> "follow up on x"
```

`ask` waits for the target agent's turn to finish and returns its output, so agents can delegate and receive answers without using the ui as a message bus.

the canvas is not a manual graph editor. its edges reflect the graph agentmux knows about through spawn and peer connections.

## install the agent skill

termcanvas works without a skill. installing the bundled `agentmux` skill teaches claude code, codex, opencode, cursor, and other compatible agents how to inspect and operate the graph themselves.

the app offers to install it on first launch. you can also install the public copy:

```bash
npx skills add lout33/termcanvas --skill agentmux -g -a codex -a claude-code -a opencode
```

the skill teaches agents how to use the runtime; it does not install termcanvas or agentmux separately. packaged builds already include the agentmux runtime.

## session behavior

termcanvas saves layout and terminal identity automatically.

- closing the app detaches from tmux-backed terminals and preserves them for relaunch
- reopening the app reattaches to the same tmux sessions
- closing a terminal node with `x` destroys that terminal session
- killing a tmux session outside termcanvas ends continuity for that terminal
- without tmux, termcanvas restores the layout but not the live shell process

tmux sessions survive closing termcanvas. they do not survive a machine reboot unless tmux is restored separately.

## controls

- double-click empty space to create a terminal
- drag empty space to pan
- use a modified mouse wheel to zoom
- drag a terminal by its header to move it
- `Cmd+B` toggles the sidebar
- `Cmd+M` focuses or restores the selected terminal
- `Cmd+L` closes the file preview
- `Esc` closes the current preview or exits focused mode

## macos permissions

commands inside termcanvas may ask for access to protected files or apps because macos attributes terminal-command permissions to the app hosting the terminal.

for unrestricted developer workflows, install termcanvas in `/Applications`, then open `TermCanvas > Open Full Disk Access Settings...` and enable it. macos may still request separate approval for camera, automation, apple music, or other services when a command first uses them.

only approve access when you intended the terminal command to use that resource. termcanvas cannot grant these permissions automatically.

## run from source

```bash
git clone https://github.com/lout33/termcanvas.git
cd termcanvas
npm install
npm run dev
```

build and test:

```bash
npm run build
npm test
```

create local unsigned macos artifacts:

```bash
npm run dist:mac
```

## current limits

- macos on apple silicon only
- unsigned builds
- prompt and status detection is heuristic
- worker placement is manual
- no collaboration or shared multi-window workflow
- early, solo-maintained software

if termcanvas gets a status wrong or still makes you hunt through tabs, [open an issue](https://github.com/lout33/termcanvas/issues) with the agent harness and prompt that caused it.

## stack

electron, `node-pty`, tmux, `xterm.js`, and the bundled agentmux runtime. node and shell access stay in electron's main process rather than the renderer.

## development

read [`AGENTS.md`](./AGENTS.md) before changing the codebase. it documents the terminal lifecycle, persistence model, ipc boundaries, and verification expectations.

## license

[mit](./LICENSE)
