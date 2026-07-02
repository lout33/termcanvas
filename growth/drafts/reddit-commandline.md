# Reddit drafts (hand-written — never paste AI-detectable copy)

> Primary targets (safe now): **r/coolgithubprojects**, **r/SideProject**. Niche-relevant: **r/tmux**, **r/electronjs**. Gated: **r/macapps** (likely Megathread for a first-timer). **Skip r/commandline** — its rules ban GUI-only apps + AI-angle projects; a self-post will likely be removed. (This file is named for the original target; the real plan is the subs below.)

---

## r/coolgithubprojects  — `reddit.com/r/coolgithubprojects`
Title format `[Desc] - Title`, GitHub-hosted only.

**Title:**
```
[A tmux-backed canvas for steering multiple AI coding agents (macOS)] - TermCanvas
```
**Body:**
```
Open-source desktop app that puts your terminals + AI agents as nodes on an
infinite canvas, with commander→worker delegation lines between agent terminals.
It's tmux-backed, so sessions are durable and reattach from a plain terminal.

macOS / Apple Silicon only for now, early (v0.2.5), solo-maintained.
Electron + xterm.js + node-pty.

Repo: https://github.com/lout33/termcanvas
Demo: https://www.youtube.com/watch?v=4XN5jvk9P1U

Feedback welcome — especially whether the delegation map beats a tab list.
```

---

## r/SideProject — `reddit.com/r/SideProject`
Format `[Name] - [desc]`. Audience likes the build-in-public story.

**Title:**
```
TermCanvas - an open-source canvas for steering a fleet of AI coding agents
```
**Body:**
```
I build in public, and this is the tool I needed: I run several AI agents
(Claude Code/Codex) plus shells and kept losing track across tabs. TermCanvas
puts each one as a node on an infinite canvas and draws commander→worker
delegation lines so I can see the whole fleet.

What makes it different from the other agent-canvas tools showing up lately:
it's open source and tmux-backed (sessions survive crashes/reboots/SSH).

Honest status: macOS Apple Silicon only, v0.2.5, just me. Cross-platform is the
top ask. Would love feedback.

https://github.com/lout33/termcanvas
```

---

## r/tmux — `reddit.com/r/tmux`
Keep it tmux-centric (that's the on-topic hook).

**Title:**
```
Built a spatial canvas on top of tmux — sessions as draggable nodes, reattachable from a plain terminal
```
**Body:**
```
TermCanvas is an open-source desktop app that renders real terminal sessions as
nodes on an infinite canvas. The part relevant here: it's tmux-backed, so the
canvas is just a view over your tmux sessions — they persist and you can reattach
outside the app. I also draw delegation lines between AI agent terminals.

macOS / Apple Silicon only right now. Curious what the tmux crowd thinks of
treating tmux as the durable substrate under a GUI.

https://github.com/lout33/termcanvas
```

---

## r/electronjs — `reddit.com/r/electronjs`
Lead with the technical/Electron angle.

**Title:**
```
TermCanvas: infinite-canvas terminal workspace in Electron (xterm.js + node-pty + tmux)
```
**Body:**
```
Sharing an open-source Electron app I built: an infinite canvas of real terminal
sessions (xterm.js + node-pty), tmux-backed for durability, with a Node-out-of-
renderer security boundary. It's aimed at steering multiple AI coding agents
spatially. macOS Apple Silicon only so far. Happy to talk architecture.

https://github.com/lout33/termcanvas
```

---

## r/macapps — `reddit.com/r/macapps` (gated)
Needs 10 local karma + `[OS]` prefix (after LICENSE added) + 1×/30d, else monthly Megathread. Use the coolgithubprojects body, prefix title with `[OS]` once it's genuinely open source.
