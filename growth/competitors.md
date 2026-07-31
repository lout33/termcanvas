# TermCanvas — Competitor / Positioning Map

> **Research snapshot, not current launch copy.** Verified through 2026-07-29. TermCanvas uses a peer graph rather than commander/worker hierarchy and does not promise machine-reboot survival. Current positioning lives in `growth/launch-brief.md`.

> Honest landscape, researched and spot-verified through July 2026. The job of this doc is to answer the visitor's reflex: **"why not just use X?"** The "canvas of AI agent terminals" niche is established: Maestri and AgentGrid are shipping direct competitors, while OpenCove is the OSS cross-platform twin. Lead with the *addressable peer graph + tmux reattachment*, not "infinite canvas" or "multi-agent"; both are commodity claims.

## What TermCanvas is (one line)
An **open-source, tmux-durable** spatial control plane where real terminal sessions form a visible peer graph and connected agents can delegate through blocking `ask` RPC.

---

## Tier 1 — the real competition: canvas-of-agents tools (study these hardest)

### Maestri — the near-exact twin ⚠️ (`themaestri.app`) — *verified*
- **What:** "An infinite canvas where your coding agents work in concert." Terminals as nodes, agents connected and delegating via terminal connections; sketches, portals (embedded browsers), an on-device monitor ("Ombro"), isolated "Floors."
- **Platforms:** **macOS 15.4+, Apple Silicon only**. Native Swift/SwiftUI/AppKit (not Electron); Ombro specifically requires macOS 26+.
- **Model:** Commercial. Free (1 workspace); Pro **$18 one-time**.
- **Traction:** the live site carries 15 named testimonials, including night-shift swarms and an eight-agent sales department. Treat these as user claims, not independently measured outcomes.
- **TermCanvas differs by:** concept overlap is near-total. Honest differentiators are **MIT source + tmux reattachment + an edge-gated `ask` RPC graph**. Maestri wins on native performance, polish, APFS workspace cloning, and social proof. If TermCanvas's graph does not reduce steering work, this objection wins.

### AgentGrid — the shipping cross-platform twin (`agentgrid.sh`)
- **What:** A desktop infinite canvas with master-worker delegation, full worker conversations, shared notes/terminal/pane context, usage-limit handoff, and a visible plan-implement-review loop.
- **Platforms:** Shipping on macOS, Windows, and Linux, with cloud sync/agents and a mobile companion. The live changelog reached v2.7.11 on 2026-07-26.
- **Model:** Commercial. Free local tier; Pro is advertised at $16/month billed annually for unlimited canvases plus cloud features. The site claims 5,000+ builders.
- **TermCanvas differs by:** MIT + local tmux substrate and an explicit peer addressing/permission graph rather than a closed master-worker SaaS. AgentGrid wins on cross-platform reach, shared workspace context, cloud/mobile continuity, and commercial execution.

### OpenCove — the OSS twin ⚠️ (`github.com/DeadWaveWave/opencove`) — *verified, 1.5k stars*
- **What:** OSS "infinite canvas for Claude Code, Codex, terminals, tasks, and notes." **Nearly identical stack: Electron + React + TypeScript + xterm.js + node-pty + @xyflow/react canvas.** Cross-platform (macOS/Win/Linux). Alpha.
- **Model:** Open source, free.
- **TermCanvas differs by:** OpenCove has no explicit edge-gated RPC/addressing graph. But OpenCove is **OSS and cross-platform with a 1.5k-star head start**, so TermCanvas cannot claim "the open, runs-anywhere canvas." The operational graph has to be the wedge.

### 49Agents (`49agents.com`) / Cate (`github.com/0-AI-UG/cate`)
- **49Agents:** open-core, **web-based**, zoomable canvas, multiple agents with "broadcast input," peer (no hierarchy). *Differs by:* native desktop + tmux + edge-gated RPC graph.
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
Conductor (sidebar list), Emdash (worktree/container dashboard), Claude Squad (tmux TUI list), Sculptor (session list), and Paperclip (org-chart dashboard). **Vibe Kanban is sunsetting** after reaching 27.6k stars, leaving proven but orphaned category demand. **The platform floor:** Claude Code Agent Teams provides a shared task list, mailbox, direct teammate messaging, hooks, and tmux/iTerm2 views, but remains experimental and disabled by default. Codex Cloud is GA for parallel isolated cloud tasks with GitHub/Linear/Slack entry points. Native delegation is increasingly bundled; a separate cockpit must improve steering, not merely display agents.

---

## The defensible angle (narrow but real)
The moat is **not** the canvas and **not** multi-agent — both are commoditizing fast. The thin, honest wedge is the **intersection plus execution**:

1. **An addressable peer graph, not decorative edges.** AgentMux edges scope who can `ask` or `check`; `ask` blocks until the connected agent's turn ends and returns the answer to the caller. Maestri has PTY connections and AgentGrid has visible delegation, so the narrower distinction is a graph that is also the CLI permission/addressing layer.
2. **OSS + tmux reattachment.** The canvas is a view over local tmux sessions that survive app/window closure and can be reattached from a plain terminal while the tmux server survives. Do not claim machine-reboot survival.
3. **Human steering-attention as the product metric.** The attention chip and graph should help one person notice, route, and recover agents with less intervention time than tabs, lists, or kanban. This is a falsifiable thesis, not yet a moat.

**Bottom line:** lead with **open source + tmux reattachment + an addressable peer graph for human steering**. Drop "infinite canvas" and "multi-agent" as headline claims; they no longer differentiate.

## Weakest points / honest objections
1. **"Why not Maestri?"** (hardest) — near-exact twin, same Mac/Apple-Silicon limit, polished native, $18, and strong social proof. Only honest answers: MIT source, tmux reattachment, and the edge-gated RPC graph. They must be real and obvious.
2. **"Why not AgentGrid?"** — now ships cross-platform canvas delegation, shared workspace context, cloud/mobile continuity, and weekly updates. Need a sharper reason than parity.
3. **"Why not OpenCove?"** — OSS, cross-platform, 1.5k stars, near-identical stack. Answer: the operational addressing graph it lacks, if that graph measurably helps.
4. **"Why not Warp?"** — for many, parallel agents in a clean tab UI with native review is *enough*, and it's cross-platform + funded. Canvas must demonstrably reduce steering load.
5. **Apple-Silicon-only is a severe TAM cap** — every serious rival except Maestri is cross-platform; OSS-runs-anywhere is already taken by OpenCove.
6. **The platform floor is rising** — Claude Code Agent Teams is still experimental, but Codex Cloud is GA and bundled orchestration is improving; value risks collapsing to "a nicer visualization."
7. **Canvas ergonomics unproven** — "spatial beats a sorted list for 10+ noisy terminals" is asserted, not demonstrated. If it doesn't measurably help, it's decorative.
8. **Delegation lines risk being eye-candy to the human** — AgentMux already uses them for `ask`, but the UI must expose a topology-native action such as reroute/handoff and prove that it reduces steering time.

> Sources spot-verified 2026-07-29: Maestri live site, AgentGrid live site/changelog, Vibe Kanban GitHub README/history, Claude Code Agent Teams docs, Codex Cloud docs, and local AgentMux source/tests. OpenCove, Emdash, Conductor, Claude Squad, Warp/Oz, and supporting counts were checked by the fleet-platforms research worker against their live product/repository pages. Re-verify vendor claims before quoting publicly.
