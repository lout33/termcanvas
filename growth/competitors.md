# TermCanvas — Competitor / Positioning Map

> Honest landscape, researched & spot-verified June 2026. The job of this doc is to answer the visitor's reflex: **"why not just use X?"** — and to correct a stale assumption. **The "canvas of AI agent terminals" niche is NOT empty anymore.** At least five tools occupy it; two (Maestri, Agent Grid) overlap almost completely, and one (Maestri) shares TermCanvas's exact macOS/Apple-Silicon constraint. Lead with *durability + steerability*, not "infinite canvas" or "multi-agent" — both are now commodity claims.

## What TermCanvas is (one line)
An **open-source, tmux-durable** spatial control plane that puts real terminal sessions as draggable nodes on an infinite canvas — built to *steer a fleet of AI coding agents* with visible commander→worker delegation lines.

---

## Tier 1 — the real competition: canvas-of-agents tools (study these hardest)

### Maestri — the near-exact twin ⚠️ (`themaestri.app`) — *verified_
- **What:** "An infinite canvas where your coding agents work in concert." Terminals as nodes, agents connected and delegating via terminal connections; sketches, portals (embedded browsers), an on-device monitor ("Ombro"), isolated "Floors."
- **Platforms:** **macOS 26.2+, Apple Silicon only** — *same constraint as TermCanvas.* Native Swift/SwiftUI (not Electron).
- **Model:** Commercial. Free (1 workspace); Pro **$18 one-time**.
- **TermCanvas differs by:** concept overlap is near-total — this is the sharpest comparison on the board. Honest differentiators are **execution, not idea**: TermCanvas is **open source** (Maestri is closed) and **tmux-backed** (durable/reattachable sessions). Maestri wins on native performance/polish. If the OSS + tmux edges aren't real and obvious, this objection wins.

### Agent Grid — the other twin (`agentgrid.sh`)
- **What:** Desktop infinite-canvas workspace; a coordinator Claude "spawns and orchestrates worker Claudes in parallel via MCP," with **edges connecting master to its workers on the canvas.** This is almost exactly TermCanvas's delegation thesis.
- **Platforms:** Desktop, early access (5,000+ waitlist = market validation + head start). OS not disclosed.
- **Model:** Commercial, invite-only.
- **TermCanvas differs by:** OSS and tmux/PTY-backed vs Agent Grid's closed, MCP-fan-out model. Concept overlap is near-total — needs a sharper reason than "we also do that."

### OpenCove — the OSS twin ⚠️ (`github.com/DeadWaveWave/opencove`) — *verified, 1.5k stars_
- **What:** OSS "infinite canvas for Claude Code, Codex, terminals, tasks, and notes." **Nearly identical stack: Electron + React + TypeScript + xterm.js + node-pty + @xyflow/react canvas.** Cross-platform (macOS/Win/Linux). Alpha.
- **Model:** Open source, free.
- **TermCanvas differs by:** OpenCove has **no commander/worker delegation lines / hierarchy** — that's TermCanvas's one clear edge here. But OpenCove is **OSS *and* cross-platform with a 1.5k-star head start**, so TermCanvas can't claim "the open, runs-anywhere canvas" — OpenCove already is that. The delegation control plane has to be the wedge.

### 49Agents (`49agents.com`) / Cate (`github.com/0-AI-UG/cate`)
- **49Agents:** open-core, **web-based**, zoomable canvas, multiple agents with "broadcast input," peer (no hierarchy). *Differs by:* native desktop + tmux + delegation hierarchy.
- **Cate:** OSS infinite-canvas IDE (Electron/xterm.js/Monaco) with Claude Code panels; IDE-first, no delegation. *Differs by:* orchestration-first, not IDE-first.

---

## Tier 2 — classic terminals (the "why not just use my terminal?" set)

| Tool | What / paradigm | Platforms | OSS? | TermCanvas differs by |
|---|---|---|---|---|
| **tmux** (ISC) | Multiplexer; tiled pane grid, detach/reattach | Linux/macOS/BSD | ✅ | Spatial canvas on top of tmux (it's the *substrate*, not a rival); tmux is keyboard+grid, this is mouse+canvas+agent delegation |
| **tmux managers** (tmuxinator/smug/sesh) | Config-driven session launchers | cross-plat | ✅ MIT | Visual drag-to-arrange + persistence vs YAML/CLI configs |
| **Zellij** | Friendly multiplexer; floating/tiled panes | Linux/macOS/BSD/Win | ✅ MIT | True zoomable canvas (not floats in one viewport) + agent orchestration |
| **Warp** ⭐ | "Agentic dev env" — runs/monitors many agents in a **tab/list UI**, native code review | macOS/Linux/Win | hybrid (client OSS, commercial product, $20+/mo) | Spatial delegation *topology* vs Warp's tab list; OSS+local vs commercial+credit-metered. The most important *terminal* rival |
| **Wave Terminal** | GUI terminal: blocks/widgets dashboards, single BYOK AI assistant | macOS/Linux/Win | ✅ | Continuous canvas + multi-agent delegation vs fixed widget dashboards + single assistant |
| **WezTerm** | GPU terminal emulator + multiplexer, Lua config | macOS/Linux/Win | ✅ MIT | Different axis: spatial/orchestration vs emulator speed |
| **iTerm2** | Mac terminal; split panes + saved "Arrangements" | macOS | ✅ GPLv2 | Live pan/zoom canvas vs static arrangements; no agent concept in iTerm2 |

---

## Tier 3 — non-spatial agent orchestrators (validate demand; contrast set)
Conductor (sidebar list), Vibe Kanban (board), Claude Squad (tmux TUI list), Sculptor (session list), Paperclip (CEO→worker org-chart dashboard, ~53k stars). **And the platform floor:** **Claude Code native Agent Teams** (shipped Feb 2026) — a lead agent delegates to 2–16 teammates, visualized as **tmux/iTerm2 split panes**. Native commander/worker delegation is now **free and built-in**; only its *visualization* is left open. *(Dead: Crystal→Nimbalyst, Terragon shut down.)*

---

## The defensible angle (narrow but real)
The moat is **not** the canvas and **not** multi-agent — both are commoditizing fast. The thin, honest wedge is the **intersection plus execution**:

1. **OSS + tmux-durable persistence.** "Your canvas is just a view over durable tmux sessions you never lose — survives crashes, reboots, SSH, and reattaches from a plain terminal." Most rivals are native (Maestri), worktree/container, or MCP-based. This is a credible, differentiated promise *if* leaned into.
2. **An actually-interactive commander→worker delegation control plane.** Not drawn lines — a graph you can use to redirect, pause, or re-route delegation. OpenCove lacks hierarchy entirely; Maestri frames peers, not a commander hierarchy.
3. **"Steering a fleet" framing (the CEO model).** The bet: the binding constraint on multi-agent work is *human steering-attention*, and a spatial map where agents have positions + visible delegation lines lets one person hold more agents in their head than a tab list, kanban, or org-chart. A defensible *thesis*, even though the canvas mechanism is now shared.

**Bottom line:** lead with **open-source + tmux-durable + opinionated, interactive commander/worker steering**. Drop "infinite canvas" and "multi-agent" as headline claims — they no longer differentiate.

## Weakest points / honest objections
1. **"Why not Maestri?"** (hardest) — near-exact twin, same Mac/Apple-Silicon limit, polished native, $18. Only honest answers: OSS + tmux-durability. They must be real and obvious.
2. **"Why not OpenCove?"** — OSS, cross-platform, 1.5k stars, near-identical stack. Answer: delegation hierarchy it lacks (so that feature must be strong).
3. **"Why not Agent Grid?"** — already ships canvas + master→worker edges with a 5k waitlist. Need a sharper reason than parity.
4. **"Why not Warp?"** — for many, parallel agents in a clean tab UI with native review is *enough*, and it's cross-platform + funded. Canvas must demonstrably reduce steering load.
5. **Apple-Silicon-only is a severe TAM cap** — every serious rival except Maestri is cross-platform; OSS-runs-anywhere is already taken by OpenCove.
6. **The platform floor is rising** — Claude Code Agent Teams ships native delegation free; value risks collapsing to "a nicer visualization."
7. **Canvas ergonomics unproven** — "spatial beats a sorted list for 10+ noisy terminals" is asserted, not demonstrated. If it doesn't measurably help, it's decorative.
8. **Delegation lines risk being eye-candy** — they must *do* something (re-route/pause/redirect), or they're a diagram, not a control plane.

> Sources spot-verified: Maestri (themaestri.app — confirmed Mac/Apple-Silicon-only, $18, canvas of connected agent terminals), OpenCove (github.com/DeadWaveWave/opencove — confirmed OSS, cross-platform, 1.5k stars, Electron+xterm.js+node-pty, no delegation). Others (Agent Grid, 49Agents, Cate, Warp specifics) from agent web research with cited URLs — verify before quoting publicly.
