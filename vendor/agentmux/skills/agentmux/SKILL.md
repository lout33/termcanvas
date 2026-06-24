---
name: agentmux
description: Manage TermCanvas agentmux agents on a canvas. Use this whenever the user wants to inspect a TermCanvas canvas, coordinate commander and worker terminals, spawn child agents, send prompts, read logs, stop or delete agents, understand AGENTMUX_* session state, or operate TermCanvas as an agent control plane from Codex, Claude Code, OpenCode, Cursor, or another coding agent.
---

# Managing TermCanvas agentmux agents

TermCanvas managed terminals are agentmux sessions. Each canvas is one agentmux project
(for example `termcanvas-8a075ab8-e`), and each terminal node is an agent in that
project. Use this skill to operate the live agent tree from the terminal instead of
adding more UI buttons.

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

## Session model

- `depth=0` is the commander or manager terminal.
- `depth=1+` agents are workers, child workers, or deeper descendants.
- `parent_agent` names the agent that spawned a worker.
- `commander_agent` points back to the canvas commander.
- One project tag equals one canvas. Keep workers in the same project so TermCanvas
  can materialize them on that canvas.
- Roles drive behavior: commanders coordinate; workers do assigned work, report to
  their parent, and create children only when delegation is useful or requested.

Do not rely on `AGENTS.md` for live canvas state. Runtime truth comes from
`AGENTMUX_*` environment variables and `agentmux` records.

## Find your context

Inside a managed TermCanvas terminal:

```bash
env | grep '^AGENTMUX_'
"$AGENTMUX_CLI" show "$AGENTMUX_AGENT_NAME"
```

Important variables:

- `AGENTMUX_PROJECT`: canvas project tag.
- `AGENTMUX_AGENT_NAME`: current agent name.
- `AGENTMUX_ROLE`: `commander` or `worker`.
- `AGENTMUX_DEPTH`: tree depth.
- `AGENTMUX_PARENT_AGENT`: parent agent, when any.
- `AGENTMUX_COMMANDER_AGENT`: project commander.
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

When already inside a managed terminal, `tree`, `status`, `mission`, `project-sync`,
and `worker` can infer the project from `AGENTMUX_PROJECT`.

Fields worth reading in JSON output: `name`, `short_id`, `role`, `depth`,
`parent_agent`, `commander_agent`, `is_project_manager`, `project`, `agent_state`,
`runtime_state`, `attention`, `workdir`, and `tmux_session`.

## Create and delegate

Ensure a commander exists:

```bash
"$AGENTMUX_CLI" project-sync <tag> --workdir <canvas-root> --harness shell
```

Spawn a worker:

```bash
"$AGENTMUX_CLI" worker <tag> <worker-name> --workdir <canvas-root> --harness shell
```

Spawn under a specific parent:

```bash
"$AGENTMUX_CLI" worker <tag> <worker-name> --workdir <canvas-root> --harness shell --parent <parent-agent>
```

Spawn a child under an existing agent:

```bash
"$AGENTMUX_CLI" child <parent-agent> <worker-name> --prompt "Handle this subtask"
```

Give the commander a high-level mission:

```bash
"$AGENTMUX_CLI" mission <tag> "Plan and implement the next feature"
```

After creating a worker, tell the operator the worker name.

## Message and control agents

```bash
"$AGENTMUX_CLI" send <agent> "your prompt or shell input"
"$AGENTMUX_CLI" send <agent> "ls -la" --no-enter
"$AGENTMUX_CLI" stop <agent>
"$AGENTMUX_CLI" kill <agent>
"$AGENTMUX_CLI" delete <agent> --force
"$AGENTMUX_CLI" state <agent> <state>
"$AGENTMUX_CLI" attach <agent>
```

Use `stop` first for a stuck agent. Confirm before mass `kill` or `delete` operations
for agents you did not create.

## Common workflows

- "Who's on this canvas?" Use `tree`, `status`, and `ls --project <tag> --json`;
  summarize roles, state, and parent-child relationships.
- "Ask the commander to do X." Use `mission <tag> "X"`, then watch `tree` and logs.
- "Add a worker for X." Use `worker ... --prompt "X"` or `child ... --prompt "X"`;
  verify with `tree`.
- "Give worker Y subagents." Use `child Y <name> --prompt "..."` or `worker <tag>
  <name> --parent Y --prompt "..."`.
- "Tell Y to do Z." Use `send Y "Z"`.
- "Y is stuck." Use `logs` first, then `stop`, or `kill`/`delete --force` if the
  operator wants it removed.

## Safety rules

- Never create raw tmux sessions for workers. Use `agentmux worker` or `agentmux child`
  so TermCanvas can render the runtime topology.
- Keep worker trees purposeful. Avoid sprawling trees that no parent is watching.
- Do not run `agentmux --help` or `agentmux send --help` reflexively. The commands
  above are the intended operating contract; use help only when the operator asks.
- Keep project tags stable. A worker in the wrong project will appear on the wrong
  canvas or not appear where the operator expects.
