# TermCanvas — UX improvement plan (brainstorm synthesis, 2026-07-01)

Inputs: competitor feature research (Maestri, OpenCove, Agent Grid, 49Agents, Cate, Warp,
Conductor, Sculptor, Vibe Kanban, Claude Squad, cmux ×2, Omnara, Claude Code Agent Teams,
Wave, tldraw, Figma), DESIGN.md, CANVAS-ROADMAP.md, UI-PLAN.md, PANELS-RESEARCH.md.

**Organizing principle:** the product's job is *"see which agent needs you, steer it fast."*
Every UX improvement is judged against that. The defensible combo stays
**OSS + real tmux (sessions outlive the app) + delegation-line topology**.

---

## Tier A — the wedge-makers (do these first)

### A1. Attention layer ⭐ #1 recurring feature in the entire space
(Maestri, Warp, cmux, Omnara, 49Agents all ship a version.)
- Detect "agent needs input": Claude Code hooks, OSC 9/99/777 sequences, output-idle heuristics over tmux scrollback.
- Node halo states: working (subtle pulse) / **needs-input (amber)** / done (green) / error (rose) / exited (desaturate). Wired to `runtime_state` + `agent_state` (absorbs roadmap M4).
- **Attention queue HUD**: "2 agents need input" chip; click/hotkey jumps camera to next needy node.
- Native macOS notification + dock badge when unfocused.
- Minimap blips inherit status colors → minimap becomes fleet overview.

### A2. Zoom-semantic rendering (the "spatial beats tabs" proof)
- Zoomed out: nodes collapse to large status chips — name, state, one-line "what is this agent doing" summary. Zoomed in: full terminal.
- One-line summaries via cheap heuristic/LLM pass over recent scrollback ("Ombro-lite", Maestri/Omnara/Warp converge here). Plus "what happened while you were away" digest.
- tldraw-style **"z" eagle-eye**: hold to see whole canvas + viewport brush, release to land.

### A3. Delegation lines → control plane (kills "eye-candy" objection)
- Click node/edge → quick actions: **send prompt · pause · logs · stop · spawn child** (fronts existing `agentmux send/stop/child/logs`).
- Edge state styling: animated dash = worker active, dim = idle, red = dead.
- M2 auto tree layout + one-key **"tidy"**.
- **Follow-an-agent camera** (Figma follow/spotlight adapted): camera tracks the node that fired attention; hotkey cycles queue. No competitor ships this — open space.

## Tier B — daily-friction killers

### B1. Navigation table stakes
- `Cmd+0` fit-to-content · double-click header / `Cmd+1..9` zoom-to-node · keyboard node cycling with camera follow.
- **Cmd+P command palette**: fuzzy jump to terminal / canvas / file (biggest "feels like Zed" win; UI-PLAN phase 2).
- Minimap click-to-jump.

### B2. Broadcast input (49Agents)
- Select N nodes → type once → tmux `send-keys` to all. Near-trivial with tmux; great fleet-steering demo.

### B3. Node groups / regions
- Named draggable group headers (Agent Grid "title panes", tldraw frames): commander + workers move/collapse as one department.

### B4. Card & chrome polish
- Role badges (commander/worker/shell), project tag, branch badge.
- Kill permanent hint-chip overlay → one-time onboarding / `?` popover (violates DESIGN.md "quiet chrome").
- Exited terminal → "reattach / respawn" affordance, not a dead card.
- ideas.md: free reorder of terminal tabs/titles.

## Tier C — close-the-loop features (bigger, validated everywhere)

### C1. Git worktree per node (table stakes across 7 tools)
- Spawn worker into auto-created worktree/branch; badge shows branch + dirty state. tmux+worktree = proven combo (Claude Squad).

### C2. Diff/review node + comments-back-to-agent
- Worker's worktree diff as canvas node; inline comments route back into its tmux session as a prompt. Closes delegate → work → review → feedback. (Warp, Vibe Kanban, Maestri, Conductor all ship a version.)

### C3. Claude Code Agent Teams integration — **open space, best strategic fit**
- Read `~/.claude/teams/*/config.json` + tasks dir; render lead→teammates as canvas nodes with delegation lines; shared task list as node.
- Official Agent Teams gaps TermCanvas fills: no visualization, no cross-team overview, orphaned tmux panes, no notification aggregation. cmux's tmux-shim proves the interception approach.

### C4. Snapshots / archives
- Named canvas-state snapshots (OpenCove space archives). Cheap durability win.

## Tier D — later / infra-heavy
- Scheduled routines (cron prompts into terminals; Maestri Routines).
- Task-board node that is also an MCP server (Vibe Kanban "board as API").
- Embedded browser portal node (Maestri portals, cmux scriptable browser) — v1 = plain localhost preview.
- Remote/mobile attention relay (Omnara/Warp) — highest effort, rank last.
- Left tree rebuild on vanilla widget + virtualization + context menu (PANELS-RESEARCH), right-panel multi-file tabs w/ warm CM6 pool (M6).
- First-run demo canvas: "spawn commander + 2 workers on this repo" — wow-moment in minute 1.

---

## Suggested build order (thin, visibly-different slices)
1. **A1 status halos + attention queue + notifications** — makes the core claim true; screenshot/demo gold.
2. **A3 node/edge quick-actions + M2 auto-layout** — delegation becomes a control plane.
3. **B1 Cmd+P + fit-to-content + zoom-to-node** — daily feel.
4. **A2 zoom-semantic chips + away-digest** — the spatial thesis, demonstrated.
5. **C3 Agent Teams rendering** — unique, rides the platform wave instead of fighting it.
6. C1/C2 worktrees + review loop.

## Honest flags (from research)
- Agent Grid details from marketing site (closed beta, unverified hands-on).
- Sculptor agent-forking listed as upcoming, not shipped.
- All "no competitor ships X" claims = absence of evidence in this pass, not proof.
