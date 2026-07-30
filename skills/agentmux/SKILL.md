---
name: agentmux
description: Manage TermCanvas agentmux agents on a canvas. Use this whenever the user wants to inspect a TermCanvas canvas, operate the agent graph, spawn child agents, connect agents, delegate with ask, send prompts, read logs, stop or delete agents, understand AGENTMUX_* session state, or operate TermCanvas as an agent control plane from Codex, Claude Code, OpenCode, Cursor, or another coding agent.
---

# Managing TermCanvas agentmux agents

TermCanvas managed terminals are agentmux sessions. Each canvas is one agentmux project
(for example `termcanvas-8a075ab8-e`), and each terminal node is an agent in that
project. The canvas is a **graph of peer agents** — there is no commander, no manager,
no fixed hierarchy. Use this skill to operate the live agent graph from the terminal.

## Resolve the CLI first

Before running commands, resolve the agentmux executable in this order:

```bash
if [ -n "${AGENTMUX_BIN:-}" ] && [ -x "$AGENTMUX_BIN" ]; then
  AGENTMUX_CLI="$AGENTMUX_BIN"
elif [ -x "vendor/agentmux/agentmux" ]; then
  AGENTMUX_CLI="vendor/agentmux/agentmux"
elif command -v agentmux >/dev/null 2>&1; then
  AGENTMUX_CLI="$(command -v agentmux)"
else
  echo "agentmux runtime not found"
fi
```

Then run commands as `"$AGENTMUX_CLI" ...`.

The skill is only the operating manual. The runtime comes from TermCanvas:
packaged apps bundle it, development checkouts use `vendor/agentmux`, and advanced
users may install `agentmux` on PATH.

Inside a TermCanvas-managed terminal, keep `AGENTMUX_HOME` unchanged. It points
the CLI at the app's live agent database; without it, the CLI may read a stale
default store and fail to see the current canvas.

## Graph model

- Every agent is a peer. Any agent can spawn children, connect to any other
  agent in the same project, and delegate work.
- Spawning (`worker`, `child`) records a `spawn` edge between spawner and child.
  Agents created without a parent are roots (`depth 0`, no `parent_agent`).
- `connect` wires any two agents with a `link` edge. Edges are the addressing
  layer: `ask`/`check` work on agents you are connected to.
- One project tag equals one canvas. Keep agents in the same project so
  TermCanvas can materialize them on that canvas.
- TermCanvas registers every fresh canvas terminal as a root agent at creation
  (the shell carries `AGENTMUX_*` env, so harnesses started inside inherit it).
  Other plain terminals can be adopted into the graph with `import`
  (TermCanvas also does this automatically when you use its Connect UI).

Do not rely on `AGENTS.md` for live canvas state. Runtime truth comes from
`AGENTMUX_*` environment variables and `agentmux` records.

## Find your context

Inside a managed TermCanvas terminal:

```bash
env | grep '^AGENTMUX_'
"$AGENTMUX_CLI" show "$AGENTMUX_AGENT_NAME"
"$AGENTMUX_CLI" neighbors
```

Important variables:

- `AGENTMUX_PROJECT`: canvas project tag.
- `AGENTMUX_AGENT_NAME`: current agent name.
- `AGENTMUX_DEPTH`: spawn-lineage depth (`0` for roots).
- `AGENTMUX_PARENT_AGENT`: the agent that spawned this one, when any.
- `AGENTMUX_HOME`: app-scoped live agent database directory.
- `AGENTMUX_BIN`: executable path supplied by TermCanvas.

From an unmanaged host shell, list projects and agents:

```bash
"$AGENTMUX_CLI" ls --json
```

## Inspect the canvas

```bash
"$AGENTMUX_CLI" ls
"$AGENTMUX_CLI" ls --project <tag> --json
"$AGENTMUX_CLI" tree <tag>
"$AGENTMUX_CLI" status <tag>
"$AGENTMUX_CLI" show <agent>
"$AGENTMUX_CLI" logs <agent> --lines 120
```

When already inside a managed terminal, `tree`, `status`, and `worker` can infer
the project from `AGENTMUX_PROJECT`.

Fields worth reading in JSON output: `name`, `short_id`, `depth`, `parent_agent`,
`project`, `agent_state`, `runtime_state`, `attention`, `workdir`, and
`tmux_session`. Project payloads also carry `edges` as `{from, to, kind}` where
`kind` is `spawn` (lineage) or `link` (manual connection).

## Spawn agents

Spawn a root agent in a project:

```bash
"$AGENTMUX_CLI" worker <tag> <agent-name> --workdir <canvas-root> --harness shell
```

Spawn an AI child under a specific agent (from inside a managed terminal, `worker`
without `--parent` auto-parents to you):

```bash
"$AGENTMUX_CLI" child <parent-agent> <agent-name> --harness <ai-harness> --prompt "Handle this subtask"
"$AGENTMUX_CLI" worker <tag> <agent-name> --workdir <canvas-root> --harness shell --parent <parent-agent>
```

When `--harness` is omitted, `child` inherits an AI parent's harness. A shell
parent with `--prompt` must choose an AI harness explicitly, so a natural-language
task cannot silently execute in a shell. Use `--harness shell` only for literal
shell input, for example `--harness shell --prompt "git status"`.

Adopt an existing plain terminal into the graph:

```bash
"$AGENTMUX_CLI" import --agent <name> --tmux-session <tmux-name> --harness shell --project <tag>
```

Agents spawned on AI harnesses (`claude`, `codex`, `pi`, `opencode`) automatically
receive a spawn briefing as their first message: their agent name, project, spawner,
and how to use `neighbors`/`ask`/`check`/`child` via `$AGENTMUX_BIN`. Any `--prompt`
is appended after the briefing. Pass `--no-briefing` to `worker`, `child`, or `new`
to skip it. Shell terminals never receive a briefing.

After creating an agent, tell the operator the agent name.

## Connect agents

```bash
"$AGENTMUX_CLI" connect <agent-a> <agent-b>
"$AGENTMUX_CLI" connect <agent-a> <agent-b> --announce
"$AGENTMUX_CLI" disconnect <agent-a> <agent-b>
"$AGENTMUX_CLI" neighbors
"$AGENTMUX_CLI" neighbors <agent> --json
```

`--announce` injects a short briefing into both terminals telling each agent
who its new peer is and how to reach it (`ask`, `check`, `neighbors`). The
TermCanvas "Connect to terminal" UI action uses this flag.

## Delegate and control

Delegate and wait for the answer (blocking RPC — the answer is the command's
stdout, so `result=$("$AGENTMUX_CLI" ask <agent> "...")` works):

```bash
"$AGENTMUX_CLI" ask <agent> "your prompt" --timeout 300
"$AGENTMUX_CLI" check <agent>
```

`ask` requires a graph connection to the target (connect first, or pass
`--force`). It finishes when the target's output has been stable for a couple
of seconds; on timeout it exits nonzero and you should `check` later instead of
re-asking. `check` peeks at the target's terminal without sending anything.

Fire-and-forget input and lifecycle control:

```bash
"$AGENTMUX_CLI" send <agent> "your prompt or shell input"
"$AGENTMUX_CLI" send <agent> "ls -la" --no-enter
"$AGENTMUX_CLI" stop <agent>
"$AGENTMUX_CLI" kill <agent>
"$AGENTMUX_CLI" delete <agent> --force
"$AGENTMUX_CLI" state <agent> <state>
"$AGENTMUX_CLI" attach <agent>
```

Use `stop` first for a stuck agent. Confirm before mass `kill` or `delete`
operations for agents you did not create.

## Common workflows

- "Who's on this canvas?" Use `tree`, `status`, and `ls --project <tag> --json`;
  summarize agents, state, and edges.
- "Delegate X and get the result." Use `ask <agent> "X"`; on timeout, `check`.
- "Add an agent for X." Use `worker ... --harness <ai-harness> --prompt "X"` or `child ... --harness <ai-harness> --prompt "X"`;
  verify with `tree`.
- "Give agent Y subagents." Use `child Y <name> --harness <ai-harness> --prompt "..."`.
- "Let Y and Z collaborate directly." Use `connect Y Z --announce`.
- "Tell Y to do Z." Use `send Y "Z"` (fire-and-forget) or `ask Y "Z"` (blocking).
- "Y is stuck." Use `logs` first, then `stop`, or `kill`/`delete --force` if the
  operator wants it removed.

## Safety rules

- Never create raw tmux sessions for agents. Use `agentmux worker`, `agentmux child`,
  or `agentmux import` so TermCanvas can render the graph.
- Keep the graph purposeful. Avoid sprawling webs of agents no one is watching.
- Do not run `agentmux --help` or `agentmux send --help` reflexively. The commands
  above are the intended operating contract; use help only when the operator asks.
- Keep project tags stable. An agent in the wrong project will appear on the wrong
  canvas or not appear where the operator expects.
