# Graph Model — Tree → Graph (Maestri parity)

> **Status (2026-07-01):** Phase 1 + Phase 2 implemented (edges table, connect/disconnect/neighbors,
> commander-less roots, spawn auto-wiring, renderer graph edges, skill docs).
> Phase 3 v1 implemented: `ask` (blocking, edge-gated, stability-based turn-end detection) and
> `check` (non-blocking peek). Manual wiring UI implemented: "Connect to terminal…" node menu
> action → click target → `connect --announce` (briefing injected into both terminals naming the
> peer + ask/check/neighbors commands); unmanaged terminals are auto-adopted via `import`.
> Phase 4 done: commander/worker system fully removed (no `project-sync`, no `mission`, no
> manager in payloads, no `AGENTMUX_COMMANDER_AGENT`, all agents are peers labeled Agent/Solo),
> skill rewritten to the graph contract. Spawn briefing implemented: AI-harness agents
> (`claude`/`codex`/`pi`/`opencode`) get an automatic `[TermCanvas]` context injection at
> spawn (identity, project, spawner, `$AGENTMUX_BIN` + neighbors/ask/check/child commands;
> `--prompt` appended after it, `--no-briefing` opts out; shell harnesses excluded).
> Managed-from-birth terminals implemented: TermCanvas creates every fresh canvas terminal
> with `AGENTMUX_*` session env (tmux `-e`) and registers it as a root agent via `import`
> (restored terminals reattach without re-adopting; reconcile also matches nodes by tmux
> session to prevent duplicates). Global `~/.claude/CLAUDE.md` carries the env-gated
> backstop pointing harnesses at the agentmux skill.
> Still pending: `ask --batch` fan-out, `--report-to`
> push callbacks (needs idle-queueing on the parent), smarter answer extraction (markers instead
> of prompt-echo search), briefing queueing when target is mid-turn.

**Goal:** kill the single-commander tree. Any terminal can spawn children, any terminal can be wired to any other. Topology = explicit editable graph, like Maestri.

## Where we are (current tree)

Backend (`vendor/agentmux/agentmux.py`) owns topology in SQLite; renderer is a projection.

- One scalar `parent_agent` per agent → at most one incoming edge (`agentmux.py:619-625`).
- One hard-coded commander per project: `<project>-general`, `role: project_manager`, `depth 0` (`agentmux.py:510-511`, `1220-1250`).
- Edges never stored — derived per node from `parentAgent ?? commanderAgent` in `renderer_canvas_delegation.js:32-86`. Forest only, no many-to-many.
- Tree layout: `getManagedNodePlacement` (`renderer.js:7077-7108`) places each node relative to its one parent.
- Session persistence (`renderer_session.js:1-27`) saves per-node parent/commander/depth fields, no edges array.

**Already graph-ish:** `agentmux worker --parent X` and `agentmux child X` let ANY agent spawn under any other (`agentmux.py:537-589` auto-parents to caller via `AGENTMUX_AGENT_NAME`). Spawning is not the blocker — the blockers are (a) mandatory commander root, (b) single scalar parent instead of edge set, (c) no peer messaging.

## Reference: how Maestri does it (from skills + `research/maestri-teardown/README.md`)

- **Edges are explicit, stored, editable.** `maestri connect "A" "B"` — agent↔agent, agent↔note, note↔note.
- **Edge = addressing + permission layer.** An agent can only `ask`/`check`/read-notes what it's wired to. Graph stays meaningful; context stays small.
- **No commander.** Any agent `recruit`s; new agent auto-connects to its spawner. Spawner is just "first neighbor", not a role.
- **`maestri ask "B" "prompt"`** — blocking RPC: inject prompt, wait for turn end, return output as stdout. Teardown calls this the single highest-leverage primitive (`agentmux send` is fire-and-forget by contrast).
- **`ask --batch '{"A":"...","B":"..."}'`** — parallel fan-out, returns JSON array when all finish.
- **`check "B"`** — non-blocking peek at neighbor's terminal.
- **`list`** — enumerate your neighborhood (agents/notes you're wired to).

## Design

### Phase 1 — Edges + no commander (backend)

New SQLite table in agentmux:

```
edges(project TEXT, a TEXT, b TEXT, kind TEXT DEFAULT 'link', created_at, UNIQUE(project, a, b))
```

Undirected (store normalized pair). `kind` reserved for later (note links, etc.).

New/changed CLI:

- `agentmux connect <A> <B>` / `disconnect <A> <B>` / `neighbors [<agent>]` (defaults to `AGENTMUX_AGENT_NAME`).
- `worker` / `child` auto-insert edge spawner↔child on spawn. `parent_agent` kept as lineage metadata + back-compat, no longer the topology source of truth.
- Commander becomes optional: `project-sync` no longer required before `worker`; a project with zero agents accepts a first `worker` directly. `role` collapses to informational (`agent`), or keep `commander` as a label with zero special powers. `mission <tag>` → alias for `send` to a named agent (or first agent).
- Drop cross-checks that assume one root: `is_project_manager` gates in status/sorting (`agentmux.py:1296-1298`, `1340`), depth stays as spawn-lineage depth (fine for display, no longer structural).

### Phase 2 — Renderer follows the graph

- Poll edges alongside agents (extend `ls --json` / snapshot payload with `edges` array).
- `deriveCanvasDelegationEdges` → replace with pass-through of stored edges (keep parent-derived edge as fallback for old DBs).
- `getManagedNodePlacement`: place new node near its spawner (first edge). Extra edges only draw lines, never move nodes. No force-layout needed.
- Edge draw: existing SVG path layer (`renderer.js:2912-2919`) already fine; just feed it N edges instead of one-per-node.
- Later (UI agent's turf): drag-to-connect between nodes writes `connect` through IPC.

### Phase 3 — `ask` blocking RPC (the killer primitive)

- `agentmux ask <B> "prompt"`: send prompt, poll B's `runtime_state`/`attention` until idle, capture pane output since send marker, print to stdout. Timeout flag (`--timeout 300`).
- `agentmux ask --batch '{"A":"...","B":"..."}'` — spawn all, wait all, JSON out.
- `agentmux check <B>` — last N lines of pane, no injection (thin wrapper over `logs`).
- **Permission rule:** `ask`/`check` only allowed toward neighbors (edge exists) — same as Maestri. Enforced in CLI, overridable with `--force` for the human operator.

### Phase 4 — Skill rewrite

`skills/agentmux/SKILL.md`: delete commander/worker framing. New contract: "you are node on graph; `neighbors` to see peers; `child` to spawn (auto-wires); `connect` to wire peers; `ask` to delegate and get answer back; `send` for fire-and-forget." Role prompts should name neighbors (Maestri lesson: wiring alone doesn't create collaboration — the prompt must say who to ask).

## Order + why

1 → 3 → 2 → 4 is tempting (ask is highest value) but `ask` without edges has no permission scope, and renderer breaks visually if edges land without rendering. Recommended: **Phase 1 + minimal Phase 2 together (one PR), then Phase 3, then Phase 4.** Each phase shippable and testable via existing test files (`agentmux-hierarchy.test.js`, `renderer-canvas-delegation.test.js`).

## Open questions

- Directed vs undirected edges? Maestri: undirected. Recommend undirected — simpler, matches "can talk to".
- Cross-project (cross-canvas) edges? Currently rejected (`agentmux.py:576-578`). Keep rejected for v1.
- Does `depth` die? Keep as cosmetic spawn-lineage; stop using it for anything structural.
