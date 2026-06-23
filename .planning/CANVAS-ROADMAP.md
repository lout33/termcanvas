# TermCanvas — Canvas Roadmap (agent-orchestration canvas)

**North star:** the best version of TermCanvas — *seamless, dead-simple, fast*, matching the
`.planning` mockup. The canvas IS for **seeing and steering an agentmux agent swarm**: who
spawned whom, who's working, who's stuck. Decisions locked with Luis:

- **Direction:** agent-orchestration canvas (not a generic terminal multiplexer).
- **Connections:** auto-derived from agentmux (`parent_agent` / `depth`), no manual wiring.
- **Layout:** a **tree** (commander at the root, workers below). Simple beats clever.
- **Theme:** dark (mockup's layout/IA, not its light palette).
- **Cadence:** Luis reviews the app/code at milestone boundaries. Each milestone is a thin,
  visibly-different, testable slice.

## Reality check on the delegation model (important)

agentmux today is **2-level**: `depth` 0 = commander, 1 = worker; every worker's `parent_agent`
is the single project commander. So "the tree" right now = **commander → workers** (a star).
The mockup's deeper nesting (terminal4→terminal5) is aspirational — we render what the runtime
actually emits, and design the edge layer so deeper trees "just work" if agentmux gains depth.

---

## Milestones

### ✅ M0 — New-canvas = pick-a-folder (shipped 2026-06-16)
"+" now prompts for a workspace folder immediately (VS Code / Zed "new project" flow); cancel
rolls back so nothing is created. Startup/import/debug paths unchanged.

### ▶ M1 — Delegation lines (the signature) — BUILT, pending live review
See *who spawned whom*. Done:
- `syncManagedNodeState` now maps `parent_agent` / `commander_agent` / `depth` onto nodes.
- `renderer_canvas_delegation.js`: pure `deriveCanvasDelegationEdges(nodes)` (commander → worker,
  by name, project-scoped, self/dup/cross-project safe). 5 unit tests.
- SVG `#canvas-edge-layer` behind the nodes, sharing the viewport transform (pan/zoom free);
  lines connect node centers; re-rendered on canvas render, drag, resize, and agent sync.
- **Render path verified** (2026-06-16) via an isolated harness loading the real
  `renderer_canvas_delegation.js` + edge CSS: commander → 2 workers drew a clean tree
  (`/tmp/edge-harness.png`, edgeCount=2). Lines run center-to-center behind the cards.
- **Needs Luis:** look at it in the running app with a real commander + worker, confirm it
  reads well, and call the aesthetics (stroke is a soft phosphor line at 50% — easy to tune;
  possible polish = anchor lines to card edges instead of centers).

### M2 — Auto tree layout
When a worker materializes, place it under its commander automatically (fanned row beneath),
no manual dragging. Tidy, deterministic, animated-but-cheap. "Make it very easy to see."
- **Review:** spawn 3 workers → they auto-arrange into a clean tree under the commander.

### M3 — Canvas awareness for agents  ← Luis's core idea
Every terminal is aware of (a) **who it is** (role/name — partly done via AGENTS.md + env) and
(b) **the canvas around it**: which other terminals exist, their roles, who spawned whom.
Delivered as a live, queryable canvas snapshot agents can read (`agentmux canvas` / a
generated context file), so the commander and workers can reason about the swarm. No injection
of secrets; read-only canvas facts.
- **Review:** ask the commander "who else is on this canvas?" → it answers from real state.

### M4 — Node cards, mockup-aligned
Role badges (root / auth / debug-style), status dots wired to `runtime_state` + `agent_state` +
attention, compact header, agent name. Quiet, legible, dark.
- **Review:** node cards read like the mockup at a glance.

### M5 — Canvas feel & performance
Buttery pan/zoom/drag, fit-to-content, no jank with 20+ nodes, no reflow when a file opens.
The "fast, simple, seamless" promise made literal.
- **Review:** it feels like Zed/VS Code — nothing lags.

### M6 — Right-panel doc nav
Multi-file tabs (`planner.ts · router.ts`), path footer, instant switching (warm CM6 pool).
The "stable document navigation" Luis called the key part.
- **Review:** open several files → tabs, instant switching, no rebuild flicker.

---

## Principles (apply to every milestone)
- **Fast & simple first.** If a feature adds a knob, justify it or cut it.
- **Verify visually.** Done = matches the reference / behaves in the real app, not "CSS compiles."
- **Thin slices.** Ship something Luis can look at; don't batch invisible plumbing for weeks.
- **Honest status.** If a step needs live agents to see, say so.
