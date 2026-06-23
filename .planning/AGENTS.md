<!-- TERMCANVAS_MANAGER_RULES_START -->
## TermCanvas Agentmux Rules

This workspace is connected to TermCanvas project `planning-c-bound`.
Managed terminals can be commanders or workers. Do not assume your role from this file alone.
Canvas id: `c-bound`
Canvas name: `Bound`
Workspace root: `/Users/pepe/Documents/vault1/projects/termcanvas/.planning`

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
"/Users/pepe/Documents/vault1/projects/termcanvas/vendor/agentmux/agentmux" worker "planning-c-bound" "<worker-name>" --workdir "/Users/pepe/Documents/vault1/projects/termcanvas/.planning" --harness shell
```

With an initial prompt:

```bash
"/Users/pepe/Documents/vault1/projects/termcanvas/vendor/agentmux/agentmux" worker "planning-c-bound" "<worker-name>" --workdir "/Users/pepe/Documents/vault1/projects/termcanvas/.planning" --harness shell --prompt "<initial prompt>"
```

Example:

```bash
"/Users/pepe/Documents/vault1/projects/termcanvas/vendor/agentmux/agentmux" worker "planning-c-bound" "test-worker" --workdir "/Users/pepe/Documents/vault1/projects/termcanvas/.planning" --harness shell
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
