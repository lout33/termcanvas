# TermCanvas — Competitive Landscape & State of the Art (2026-07)

> Deep competitive + state-of-the-art pass, researched 2026-07-29 via Exa web search, GitHub API, and the 2026 arXiv corpus. Supersedes (does not delete) `competitors.md`, which is now stale — it undercounts the field and misses a same-named competitor. **Purpose: answer the visitor reflex "why not just X?" with current evidence, and ground the positioning in 2026 academic research.**
>
> Researcher's bottom line up front: the "infinite canvas of terminals" mechanic is now a **commodity** (≥10 shipping entrants, 3 cross-platform OSS, 2 native-Rust). The defensible wedge is no longer the canvas or multi-agent — it is **OSS + tmux-durable persistence + an actionable delegation control plane**, grounded in the 2026 literature on context pollution, harness scaling, and the observability gap.

---

## 0. Critical findings the current `competitors.md` misses

| Finding | Evidence | Impact |
|---|---|---|
| **Name collision** — `blueberrycongee/termcanvas` (324★, cross-platform, website `termcanvas.dev`, CLI `termcanvas`/`hydra`, login + cross-device sync, session replay, usage tracking, pins, waypoints, snapshot history) is a *more mature, same-named* product | github.com/blueberrycongee/termcanvas + docs/user-guide.md | Brand/SEO collision. `lout33/termcanvas` (16★) loses every search for the name. **Urgent.** |
| **OpenCove** verified at **1,460★** (doc said 1.5k — correct), cross-platform OSS, Electron+React+TS+xterm.js+node-pty, alpha | github.com/DeadWaveWave/opencove | The "OSS + runs-anywhere canvas" slot is taken. |
| **Horizon** (`peters/horizon`, 651★) — native **Rust/egui/wgpu**, GPU 60fps infinite-canvas terminal board, workspaces, presets, minimap, quick-nav, cross-platform | github.com/peters/horizon | Out-natives Electron; out-performs on the canvas axis. No agent delegation. |
| **agent-orchestrator** (AgentWrapper, **8,608★**, Apache-2.0, Go+TS, 70 contributors) — "meta-harness agent IDE," **push-not-pull** notifications, tmux+worktrees, autonomous CI-fix/merge-conflict/review loops | github.com/AgentWrapper/agent-orchestrator + artifacts/architecture-design.md | Most sophisticated "fleet" tool; its "human never polls" philosophy is the strongest articulation of TermCanvas's steering wedge — built by someone else. |
| **Maestri** verified: native Swift/SwiftUI, macOS 15.4+ Apple-Silicon, **$18 one-time** + free tier, Ombro on-device monitor, Portals (embedded browsers), Floors (isolation), sketches. Reviews: MakerStack 7.9/10; Agent Finder: *"genuinely novel — no other tool lets you visually wire agents together for direct communication"* | themaestri.app + makerstack.co + agent-finder.co + completeaitraining.com + zenn.dev/youjinfox | Near-exact twin, more polished, same platform limit. |
| **Claude Code Agent Teams** shipped Feb 5 2026 with Opus 4.6 — native commander/worker, shared task list with dependencies, **tmux split-pane display mode**, Delegate Mode. Free + built-in | code.claude.com/docs/en/agent-teams + claudefa.st + marc0.dev + cuttlesoft + hackernoon | Platform floor: native delegation is free. Only *visualization* left open. |
| **Warp 2.0** open-sourced Apr 28 2026 (AGPL-3.0, ~60k★), "Agentic Dev Environment" + **Oz** cloud orchestration (proprietary), $20/mo + BYOK free tier — but **AI context breaks inside tmux** (toolchew) | teqvolt + aicoderscope + toolchew + docs.warp.dev | Fights tmux where TermCanvas embraces it — a real seam. |

---

## 1. Tier 1 — Canvas-of-terminals tools (direct competition)

The "infinite canvas of terminals" mechanic is commodity. At least 10 shipping entrants:

| Tool | Stack / Platform | Stars | Model | Differentiator vs TermCanvas (lout33) |
|---|---|---|---|---|
| **Maestri** | Swift/SwiftUI, macOS only | closed | $18 one-time + free | Native polish, Ombro, Portals, sketches. TermCanvas: OSS + tmux-durable. |
| **OpenCove** | Electron+React+TS+xterm+node-pty, cross-plat | 1,460★ | OSS MIT | Cross-platform OSS canvas. TermCanvas: delegation hierarchy it lacks. |
| **blueberrycongee/termcanvas** | Electron+TS+xterm+node-pty, cross-plat, **same name** | 324★ | OSS MIT + hosted | Bigger, same name, sync/usage/replay. Name war TermCanvas is losing. |
| **Horizon** | Rust/egui/wgpu, cross-plat | 651★ | OSS MIT | GPU 60fps native, no Electron. Workspaces, minimap. No agent delegation. |
| **Void** | Rust/wgpu+alacritty_terminal, cross-plat | 13★ | OSS MIT | Pure native, zero web tech. Workspaces, command palette. No agents. |
| **Panescale** | Tauri+React, cross-plat | 7★ | OSS MIT | Adds SSH + browser tiles on canvas. Smaller. |
| **Cate** (0-AI-UG) | Electron, Monaco+xterm+node-pty, cross-plat | — | OSS | IDE-first canvas (dock/splits/detach windows). No delegation. |
| **Nodeterm** | Electron, macOS arm64+x64 | 26★ | BUSL-1.1 (source-available) | ADHD-positioned, node-based. Not OSS. |
| **Infinite Terminal** | VS Code extension, node-pty | 21 installs | OSS MIT | Lives inside VS Code. Worktree-aware. |
| **OpenClaw Canvas** | FastAPI+HTML, web | 1★ | OSS MIT | "Spatial dashboard for AI agent fleet" — same thesis, web not desktop. |

**Takeaway:** lead with **OSS + tmux-durable + actionable delegation**, not "infinite canvas" or "multi-agent."

---

## 2. Tier 2 — Agent fleet orchestrators (non-canvas, same job-to-be-done)

These don't draw a canvas but compete for the same "steer a fleet" budget:

| Tool | Stars | Model | Key idea | Threat |
|---|---|---|---|---|
| **agent-orchestrator** (AgentWrapper) | 8,608★ | Apache-2.0 | "Push, not pull" — human never polls, gets notified. Autonomous CI-fix/merge-conflict/review loops. tmux+worktrees. | **Highest.** Best articulation of TermCanvas's wedge, built by someone else. |
| **Armada** | — | OSS .NET 10 | `armada go "..."` dispatches fleet; MCP server turns any AI into the orchestrator. | Medium — CLI-first, no canvas. |
| **Weave Agent Fleet** | 16★ | OSS MIT, Rust+TS | Web UI fleet for OpenCode sessions, workspace isolation, completion callbacks, diff viewer. | Medium. |
| **Claw Fleet** (hoveychen) | 15★ | source-available | Keeps one long task alive across context windows/restarts/machines; mobile web. Claude Code+Codex. | Medium — durability angle overlaps TermCanvas's tmux angle. |
| **Ashlr AO** | — | OSS, Tauri v2 macOS | Glassmorphic dashboard, tmux sessions, auto-pilot, auto-restart stalled agents, auto-approve safe patterns, fleet analysis every 30s, cross-agent handoff with context. | **High** — closest to the steering/attention wedge as a product. |
| **orchestrAI** (cpoder) | 0★ | OSS Rust+TS | Remote web dashboard for Claude Code plans/agents; "like Linear/Jira for AI agents." | Low. |
| **FleetManifest** | — | commercial | Enterprise governance/audit/cost-attribution control plane. | Different buyer. |
| **Mission Control** (builderz-labs) | 5.8k★ | Next.js, Docker | Has a `SKILL.md`; large. Needs a teardown. | Unknown. |
| **dustinblack/agent-dashboard** | 11★ | Apache-2.0, FastAPI+React | **Multi-host** orchestration, live PTY streaming, OpenTelemetry token tracking, rootless Podman. | Distinctive multi-host angle. |

---

## 3. Tier 3 — The rising platform floor (existential threat)

### Claude Code Agent Teams (shipped Feb 5 2026, with Opus 4.6)
- Experimental, off by default: `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`.
- One **team lead** coordinates; **teammates** work independently, each own context window, message each other directly, share a task list with dependencies (pending/in-progress/completed).
- **Two display modes: in-process OR tmux split-pane.** `teammateMode` configures it. **Delegate Mode** (Shift+Tab) makes the lead stop coding and only coordinate.
- **Free, native commander/worker delegation** — TermCanvas's headline feature, built into the most popular coding agent. Only *visualization* is left open.
- Sources: code.claude.com/docs/en/agent-teams, claudefa.st (×2), marc0.dev, cuttlesoft, hackernoon (Jul 2026), zenn.dev (×2).

### Warp 2.0 (open-sourced Apr 28 2026, AGPL-3.0, ~60k★)
- "Agentic Development Environment." Rust+GPU terminal + **Oz** cloud orchestration (proprietary). $20/mo Build, 1,500 credits + BYOK; free BYOK tier.
- Runs Claude Code/Codex/Warp Agent/OpenCode/Gemini CLI in parallel via tabs + isolated worktrees + `/orchestrate`/`/plan`/Oz CLI/web/API.
- 71% SWE-bench Verified, #1 Terminal-Bench. Cross-platform.
- **Not a canvas** — tab/list UI. **Known weakness:** "AI context breaks inside tmux; most power users are tmux users" (toolchew) — Warp *fights* tmux; TermCanvas *embraces* it. A real, defensible seam.
- Sources: teqvolt, aicoderscope, toolchew, sandbase, theagentpost, docs.warp.dev.

**Trajectory:** native orchestration is on a 6–12 month path to "good enough" for most users. The wedge shrinks but isn't eliminated *today*.

---

## 4. Tier 4 — Classic terminals (substrate, not rivals)

- **tmux** — TermCanvas's *substrate*, not a rival. Canvas over it.
- **Zellij** (Rust, WASM plugins, floating panes, KDL layouts, discoverable keybindings) — the modern multiplexer; tmux still wins on maturity/scripting/ecosystem. Not a canvas. Sources: commandinline, petronellatech, fosslinux, tommeurs, cavecreekcoffee.
- **iTerm2** (Mac, split panes + saved Arrangements) — static, no agents.
- **WezTerm** (GPU emulator + Lua multiplexer) — different axis (speed).

---

## 5. State of the art — 2026 academic research validating the wedge

The literature has caught up to exactly TermCanvas's product thesis — context pollution, harness-as-product, observability gap, role separation, topology-aware orchestration. Citable corpus:

| Paper (arXiv 2026) | Core claim | Why it matters to TermCanvas |
|---|---|---|
| **DACS — Dynamic Attentional Context Scoping** (Nickson Patel, 2604.07911, Apr 2026) | N concurrent agents cause *context pollution* in the orchestrator; fix = asymmetric REGISTRY mode (≤200-token per-agent summaries) + FOCUS mode (deep dive one agent). | **Direct academic validation of the "which agent needs me" wedge.** The two-mode design maps onto a canvas: overview = REGISTRY, focus a node = FOCUS. |
| **From Model Scaling to System Scaling** (Shangding Gu, UC Berkeley, h-index 13, 2605.26112, May 2026) | Next bottleneck is *system scaling, not model scaling*: "scaling the harness" — auditable, persistent, modular, verifiable architectures around models. | **Academic framing of the entire thesis.** The harness/canvas IS the product. |
| **The Observability Gap** (Wang & Wang, 2603.26942, Mar 2026) | Output-only human feedback yields **0% full-scene success** for LLM coding agents; observability must be richer than reading terminal output. | Validates that "just reading tmux panes" isn't enough — the spatial/visibility layer has real value. |
| **CodeDelegator** (Fei et al., 2601.14914, Jan 2026) | Role separation: a persistent **Delegator** (strategic oversight, specs, monitoring) vs implementers reduces context pollution. | The academic version of the commander/worker model. |
| **When Parallelism Pays Off** (Yang et al., UT Austin + Oxford, 2606.00953, May 2026) | Multi-agent orchestration = graph partitioning; communication overhead can *offset* efficiency gains. | Formalizes *when* parallel agents help vs hurt — the canvas could surface cohesion to make this visible. |
| **Retrieval-Conditioned Topology Selection** (Talluri et al., 2605.05657, May 2026) | Optimal topology (FASTPATH/SUBAGENT/MULTIAGENT/DEEP RESEARCH) depends on task structure. | Supports the value of *showing the real graph topology* — the derived-edge approach. |
| **Sutradhara** (Biswas et al., 2601.12967, Jan 2026) | Orchestrator-Engine co-design; FTR (First Token Rendered) latency is the new bottleneck. | Performance framing for the main-process architecture. |
| **LEMON** (Chen et al., 2605.14483, May 2026) | Learning executable multi-agent orchestration via counterfactual RL; role design + capacity + dependency construction. | Forward-looking: learned orchestration may eat manual steering. |

**Net:** the steering-attention wedge is no longer a product hunch — it is a named, studied problem with a research vocabulary (context pollution, harness scaling, observability gap). Use it to ground positioning credibly.

---

## 6. Where TermCanvas wins, where it's behind

### Genuinely defensible (only TermCanvas has all of these together)
1. **OSS + tmux-durable persistence.** "Your canvas is a view over tmux sessions that survive crashes, reboots, SSH, and reattach from any plain terminal." Every native rival (Maestri, Horizon, Void) and every worktree/MCP rival (Agent Grid, agent-orchestrator, Armada) lacks this exact combination. Warp actively fights tmux.
2. **Derived delegation topology rendered as a real control plane.** OpenCove has no hierarchy; Cate is IDE-first; Maestri frames peers. The agentmux `ask`/`worker`/`child`/`connect` edges, drawn live, are the closest thing to a *usable* graph — **but `ask` is still unbuilt (P0 per `research/maestri-teardown/README.md`).**
3. **The steering-attention thesis is now academically grounded** (DACS, System Scaling, Observability Gap). Lead with a *thesis*, not a feature.

### Where TermCanvas is behind (honest)
1. **Name collision** — `blueberrycongee/termcanvas` (324★, website, sync, CLI) is burying `lout33/termcanvas` in search. Either rename, or out-ship them on the delegation wedge fast.
2. **Platform cap** — Apple-Silicon-only. Every serious rival except Maestri is cross-platform. OpenCove already owns "OSS runs-anywhere."
3. **Performance/rendering** — `GOAL.md` Milestone 4 (virtualize offscreen terminals, coalesce resizes, cap accelerated renderers) is largely unchecked, while Horizon/Void ship native GPU canvases. At 30+ nodes there is jank they don't have.
4. **The platform floor** — Claude Code Agent Teams ships native commander/worker free, visualized as tmux split panes. Value risks collapsing to "a nicer visualization" unless delegation lines *do* something (re-route/pause/redirect), not just draw.
5. **`ask` is not built** — the single highest-leverage feature (own teardown marks it P0). Maestri has it; TermCanvas doesn't yet.
6. **The strongest articulation of the wedge ("push, not pull") is owned by agent-orchestrator** (8.6k★), not TermCanvas.

---

## 7. The narrow, honest wedge to lead with

Drop "infinite canvas" and "multi-agent" as headline claims — both are commodity. Lead with:

> **Open-source, tmux-durable control plane for steering a fleet of AI coding agents — the canvas shows the real delegation graph and the terminal is the control surface. Sessions survive crashes, reboots, and SSH; reattach from any plain terminal.**

Then execute on the three things only TermCanvas can credibly combine:
1. **Ship `ask` + `--batch`** (own P0) — turns delegation from "fire and go read the tmux pane" into a real RPC.
2. **Make delegation lines *actionable* not decorative** — re-route, pause, redirect. A diagram is not a control plane.
3. **Prove the spatial map measurably reduces steering load** vs a tab list — the one assertion in the whole thesis that is still asserted, not demonstrated.

---

## 8. Honest objections to have answers for

1. **"Why not Maestri?"** (hardest) — near-exact twin, same Mac/Apple-Silicon limit, polished native, $18. Only honest answers: OSS + tmux-durability. They must be real and obvious.
2. **"Why not OpenCove?"** — OSS, cross-platform, 1,460★, near-identical stack. Answer: delegation hierarchy it lacks (so that feature must be strong).
3. **"Why not agent-orchestrator?"** — 8.6k★, push-not-pull, autonomous CI/merge loops. Answer: tmux-durability + spatial topology + OSS canvas (AO is an IDE/dashboard, not durable sessions on a canvas).
4. **"Why not Claude Code Agent Teams?"** — free, native, tmux split-pane. Answer: cross-harness (Claude + Codex + OpenCode + Gemini), durable across crashes, and a visible graph instead of split panes you have to scroll.
5. **"Why not Warp?"** — for many, parallel agents in a clean tab UI with native review is *enough*, and it's cross-platform + funded. Answer: canvas + tmux-embrace (Warp's AI breaks in tmux) + OSS.
6. **Apple-Silicon-only is a severe TAM cap** — every serious rival except Maestri is cross-platform; OSS-runs-anywhere is already taken by OpenCove.
7. **The platform floor is rising** — native delegation free; value risks collapsing to "a nicer visualization."
8. **Canvas ergonomics unproven** — "spatial beats a sorted list for 10+ noisy terminals" is asserted, not demonstrated.
9. **Delegation lines risk being eye-candy** — they must *do* something, or they're a diagram, not a control plane.

---

## 9. Open questions / next teardowns

- **Maestri deep teardown** — already partially done in `research/maestri-teardown/README.md`; could refresh against v0.30.7+ and verify `ask --batch` shape, Ombro, Portals.
- **agent-orchestrator teardown** — the highest-threat non-canvas rival; 8.6k★, "push not pull." Worth reading its `architecture-design.md` and `SKILL.md` in full.
- **blueberrycongee/termcanvas teardown** — the name war. Read its `docs/user-guide.md` to see exactly where it's ahead (sync, usage, replay, pins, waypoints) and whether the delegation wedge is genuinely open there.
- **Claude Code Agent Teams live test** — confirm the tmux split-pane mode, Delegate Mode, and teammate-messaging behavior firsthand; this is the platform-floor signal that most directly erodes the wedge.
- **Mission Control (builderz-labs, 5.8k★)** — large, undocumented here; needs a teardown to place it correctly in Tier 2.

---

## Appendix — primary sources (spot-verified 2026-07-29)

**Tier 1 (canvas tools):** github.com/190km/void · github.com/peters/horizon · github.com/DeadWaveWave/opencove · github.com/blueberrycongee/termcanvas · github.com/lossless1/panescale · github.com/0-AI-UG/cate · github.com/eneskirca/nodeterm · github.com/louisyeaaah/Infinite-Terminal (marketplace: LouisYeah.infinite-terminal) · github.com/sephirxth/openclaw-canvas · github.com/icodecedd/cortex-space · themaestri.app

**Tier 2 (fleet orchestrators):** github.com/AgentWrapper/agent-orchestrator · armadago.ai · tryweave.io/fleet + github.com/pgermishuys/weave-agent-fleet · github.com/hoveychen/claude-fleet · ashlrao.com · github.com/cpoder/orchestrAI · fleetmanifest.ai · github.com/builderz-labs/mission-control · github.com/dustinblack/agent-dashboard

**Tier 3 (platform floor):** code.claude.com/docs/en/agent-teams · claudefa.st/blog/guide/agents/agent-teams + .../agent-teams-controls · marc0.dev · cuttlesoft.com · hackernoon.com/navigating-claude-code-agent-teams-in-practice · zenn.dev (×2) · teqvolt.com · aicoderscope.com · toolchew.com · sandbase.ai · theagentpost.co · docs.warp.dev

**Tier 4 (classics):** commandinline.com · petronellatech.com · fosslinux.com · tommeurs.nl · cavecreekcoffee.com

**State of the art (arXiv 2026):** 2604.07911 (DACS) · 2605.26112 (System Scaling) · 2603.26942 (Observability Gap) · 2601.14914 (CodeDelegator) · 2606.00953 (When Parallelism Pays Off) · 2605.05657 (Topology Selection) · 2601.12967 (Sutradhara) · 2605.14483 (LEMON)

**Maestri reviews:** makerstack.co/reviews/maestri-review · agent-finder.co/reviews/maestri · completeaitraining.com/ai-tools/maestri · zenn.dev/youjinfox/articles/bb3facc650adb1 · chatableapps.com/tools/maestri

**Local cross-references:** growth/competitors.md (stale, superseded) · growth/agent-team-market-discovery.md (pain signals + interview plan) · research/maestri-teardown/README.md (port backlog, `ask` = P0) · GOAL.md (Milestone 4 rendering gaps) · DESIGN.md (visual line)