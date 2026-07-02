# Maestri teardown → TermCanvas port backlog

> Purpose: steal the best of Maestri (`themaestri.app`, v0.30.7, closed-source native macOS/Swift) for TermCanvas without breaking TermCanvas's stated design line.
> Competitive positioning already lives in [`../../growth/competitors.md`](../../growth/competitors.md) ("the near-exact twin"). This doc is **engineering**, not marketing: what to build.
> Verified against the real `vendor/agentmux/agentmux` binary, not just the skill doc — 2026-07-01.

---

## TL;DR — the decision

1. **P0 — blocking `ask` + `--batch`.** Verified real gap: agentmux `send` is fire-and-forget, no response capture. Maestri's killer primitive is a synchronous "delegate and get the output back." This is the single highest-leverage import and it fits TermCanvas's "terminal is the control surface" philosophy exactly. **Build this first.**
2. **P1 — agent-writable notes** (shared canvas memory) and **role presets + hot-reassign.** Cheap, high-value, philosophy-aligned.
3. **Decide-first bucket — manual `connect` and Portal.** Both are genuinely useful, but both **fight TermCanvas's stated direction** ("not a manual graph editor", "terminal as control surface, no heavy dashboard"). Not obvious wins — Luis's call, flagged below, not slotted in silently.

---

## Verified facts (don't build on the skill doc alone)

Ran the binary:

```
agentmux {new,import,resume,ls,show,send,attach,stop,kill,logs,discover,state,
          delete,project-sync,tree,status,mission,worker,child,adapters,install,
          install-skill,events,watch,web,console}
```

- **No `ask`, no `--wait`.** `send agent text [--no-enter]` injects input; `logs agent [--lines N]` reads output. They are two separate one-way calls. There is no built-in "send and return the reply."
- **But the substrate for `ask` already exists:** `events` (event stream, filterable by `--session`/`--project`), `state` (manual agent state), `watch`/`console` (live dashboards), and `agent_state`/`runtime_state`/`attention` fields in JSON. So `ask` is buildable *on top of* what's there — see "How to build `ask`" below.

---

## Feature map — Maestri vs TermCanvas(agentmux)

| Capability | Maestri | TermCanvas today | Gap |
|---|---|---|---|
| Real terminals on infinite canvas | ✅ SwiftTerm | ✅ xterm.js | — |
| Commander/worker tree | ✅ recruit/dismiss | ✅ mission/worker/child | ~par |
| Durable sessions | ⚠️ native | ✅ **tmux reattach** | *we win* |
| **Blocking delegate + get reply** | ✅ `ask` | ❌ send is one-way | **P0** |
| **Parallel fan-out** | ✅ `ask --batch` (JSON, waits all) | ❌ | **P0** |
| Non-blocking peek | ✅ `check` | ~ `logs` | small |
| **Shared notes (agent-writable, chainable, md)** | ✅ `note *` | ❌ (has file preview only) | **P1** |
| **Reusable role presets + hot swap** | ✅ `role create/assign` (topology-preserving restart) | ~ role=commander/worker only | **P1** |
| Agent-type presets | ✅ `preset list` (Claude/Codex/Shell) | ~ `--harness` | small |
| **Scheduler / cron** | ✅ `routine *` (+ `--pre-run {{output}}` piping) | ❌ | **P1/P2** |
| Manual node wiring | ✅ `connect` (= permission layer) | ❌ *by design* | **decide** |
| Browser node | ✅ Portal (snapshot/refs/UA/resize) | ❌ | **decide** |
| Permission tier | ✅ Maestro Mode | ❌ | low (single-user) |

---

## Port backlog

### Bucket A — fits TermCanvas philosophy (build these)

**P0 · `agentmux ask <agent> "<prompt>" [--timeout N]`** — send a prompt, block until the agent goes idle, return its new output. This is the whole game: it turns `send`+manual-`logs` into a real RPC, which is what makes commander→worker delegation *usable* instead of "fire and go read the tmux pane yourself." Maps 1:1 onto Luis's steered-fleet model.

**P0 · `agentmux ask --batch '{"A":"...","B":"..."}'`** — fan out prompts in parallel, return a JSON array once all finish. This *is* "parallelize the fleet" as one command. Trivial once single `ask` exists.

**P1 · Notes** — `agentmux note create/read/write/edit` — agent-writable sticky nodes on the canvas as a shared-context channel. Cheap; markdown; render live. TermCanvas already renders markdown preview, so the canvas half is largely there — needs the CLI + a writable node type + persistence in the agentmux store. High coordination value (shared spec / scratchpad the whole tree reads).

**P1 · Role presets + `role assign`** — a reusable persona library (`role create "Reviewer" "<prompt>"`) and hot-reassign that restarts the agent process but **preserves name, position, and connections**. TermCanvas has commander/worker as behavior but no reusable prompt-preset library. Low build, high repeat-use.

### Bucket B — changes TermCanvas's stated direction (Luis decides, don't slot in silently)

**Manual `connect`.** Maestri's connections are manual *and* act as the addressing/permission layer (an agent can only `ask` what it's wired to). TermCanvas's README explicitly says *"This is not a manual graph editor"* — topology is derived from runtime `parent_agent`/`commander_agent`. Importing manual `connect` means **reversing a documented product decision.** The upside is real (note-sharing, arbitrary peer messaging need *some* wiring), so the honest framing is: *add manual edges as an optional layer on top of the derived tree*, not replace it. Trade-off call, not a free win.

**Portal (browser node).** A whole new node type + automation surface. Strong differentiator (canvas-native browser automation with a11y-ref selectors, UA/viewport emulation for responsive QA), and it fits the "everything in one visible place" pitch. But it collides with *"keep the terminal as the control surface instead of adding a heavy dashboard"* and it's the largest build here. Park it as a deliberate roadmap bet, not a quick port.

### P2 · Routines (scheduler)
`agentmux routine` with `--every/--daily/--weekly/--once`, target = own terminal / another / desktop reminder, and the sharp bit: `--pre-run "script"` whose stdout is piped into the prompt via a `{{output}}` token (e.g. nightly `git log` → "summarize today's commits"). Aligns with the "looping agents" model. Medium build (needs a scheduler daemon in the app); lands after `ask`.

---

## How to build `ask` on agentmux (the hard part)

`ask = send + wait-for-done + diff-output`. Three viable "done" signals, in order of robustness:

1. **State/event-driven (preferred).** agentmux already has `events` and `state` and tracks `agent_state`/`runtime_state`/`attention`. Implement: mark agent busy on `send`, watch the event stream / poll state until it returns idle (or `attention` flips), then return the output captured since the send. Reuses existing machinery; no protocol invented.
2. **Idle-detection on the pane.** Poll `tmux capture-pane`; consider "done" when output stops changing for N ms *and* a shell/agent prompt is present. Simpler, less reliable across harnesses (Claude vs Codex vs shell print differently).
3. **Sentinel.** Append a unique marker command after the prompt; return everything up to the marker echo. Cleanest boundary but assumes the target is a shell, not an interactive agent mid-turn — fragile for agent harnesses.

**Recommendation:** (1). It's the only one that respects that the target is often an *agent taking a multi-step turn*, not a shell running one command — which is exactly where naive idle/sentinel detection breaks. Ship `ask` returning `{agent, output}` (and `{agent, error}` on timeout, mirroring Maestri's batch shape) so `--batch` is a thin wrapper.

---

## What NOT to copy

- **Maestro Mode permission tier** — Maestri needs it for a multi-terminal untrusted setup; single-user TermCanvas doesn't. Skip.
- **Closed/native everything** — TermCanvas's edge per `competitors.md` is **OSS + tmux-durable**. Keep the terminal as the control surface; every import above should be a CLI verb first, canvas-render second — the same way Maestri's own power is in its CLI, not UI buttons. Don't out-native the native app; out-*durable* and out-*open* it.
