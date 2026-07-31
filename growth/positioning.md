# TermCanvas — Positioning

> **Superseded on 2026-07-28.** This file preserves the June positioning step, but its v0.2.5, commander/worker, and reboot-persistence claims are stale. Use `growth/launch-brief.md`.

> Derived from `competitors.md`. The landscape forced a correction: "infinite canvas" and "multi-agent" are no longer differentiators (Maestri, Agent Grid, OpenCove, 49Agents, Cate all occupy them; Claude Code ships native Agent Teams). Position on what's actually defensible: **open-source + tmux-durable + an interactive commander/worker control plane.**

## Headline pitch (the 5-second hook)

**TermCanvas is an open-source, tmux-durable canvas for steering a fleet of AI coding agents — every shell and agent is a node you place, wire into commander→worker delegation, and never lose.**

*Shorter (tagline, ≤60 chars for Product Hunt):*
**Open-source canvas for steering a fleet of AI agents.**

*One-liner for awesome-lists / repo description:*
**Spatial, tmux-backed canvas to run and steer multiple AI agent terminals with visible commander→worker delegation.**

## The 3 differentiators (lead with these, in order)

1. **Open-source & local-first.** No account, no credits, your tmux + your agents on your machine. (vs Maestri/Agent Grid/Warp, which are closed or commercial.)
2. **tmux-durable sessions.** The canvas is a *view* over real tmux sessions — they survive crashes, reboots, and SSH, and reattach from a plain terminal. (vs native/worktree/MCP rivals that don't give you durable, reattachable sessions.)
3. **A commander→worker delegation control plane.** Not decorative lines — a spatial map of who's delegating to whom, built so one human can hold more agents in their head than a tab list or kanban. (OpenCove, the OSS twin, has no hierarchy at all.)

## What NOT to say (these no longer differentiate)
- ❌ "The infinite canvas terminal" — commoditized (Maestri, OpenCove, 49Agents, Cate).
- ❌ "Run multiple AI agents at once" — Warp, Conductor, Claude Code Agent Teams all do this.
- ❌ "Open territory / first of its kind" — false as of mid-2026; will get corrected in comments and cost credibility.

## Honest caveats to keep in every public message
- **macOS, Apple Silicon only** — state it up front. (Note: closest twin Maestri shares this exact limit, so among Mac users it's not a relative disadvantage; vs OpenCove/Warp it is.)
- **Early (v0.2.5), solo-maintained** — lean into build-in-public as the story, don't overclaim maturity.
- **Add an OSI LICENSE first** — "open-source" is the lead differentiator and currently isn't legally true (no LICENSE file). Fix before any launch.

## Target user (who to talk to first)
Mac-based developers already running **multiple AI coding agents** (Claude Code / Codex / aider) who feel the pain of steering them across a pile of terminal tabs — and who value an OSS, hackable, local tool over a closed commercial one. That's the wedge audience; broaden only after it resonates.
