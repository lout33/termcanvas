# Show HN draft

> Submit at `news.ycombinator.com/submit` (logged in). Put the **GitHub repo URL** in the URL field. Post the intro below as your first comment immediately after. Never solicit upvotes. Best window: Tue–Thu, ~9am–12pm ET, and stay in the thread for hours.

## Title (≤80 chars, no superlatives, no "!")
```
Show HN: TermCanvas – a tmux-backed canvas for steering AI agents (macOS)
```
*Alt:* `Show HN: TermCanvas – place your terminals and AI agents on an infinite canvas (macOS)`

## First comment (post right after submitting)
```
I'm the author. TermCanvas is an open-source desktop app that puts real terminal
sessions as draggable nodes on an infinite canvas. I built it because I kept
running several AI coding agents (Claude Code/Codex) plus shells across a pile of
tabs and lost track of which was doing what.

Two things I care about that differ from the other "canvas of agents" tools
appearing lately (Maestri, OpenCove, Agent Grid):

- It's tmux-backed. The canvas is just a view over real tmux sessions, so they
  survive crashes/reboots/SSH and you can reattach from a plain terminal.
- It draws commander→worker delegation lines between agent terminals, so you can
  see the topology of who's delegating to whom, not just a list of tabs.

Honest caveats: it's macOS, Apple Silicon only right now, it's early (v0.2.5),
Electron + xterm.js + node-pty, and I'm a solo maintainer. Cross-platform builds
are the obvious next ask — happy to talk about what that'd take.

Repo: https://github.com/lout33/termcanvas
Demo video: https://www.youtube.com/watch?v=4XN5jvk9P1U

Would love feedback on the delegation model specifically — is a spatial map
actually better than a tab list for steering many agents, or am I fooling myself?
```

## Pre-empt the guaranteed questions
- **"Why not Linux/Intel?"** — Answer honestly in-thread: solo maintainer, Apple Silicon first, cross-platform is the top request and on the roadmap.
- **"Why Electron?"** — Don't argue; redirect to the durability/orchestration value.
- **"Isn't this just Maestri/Warp/OpenCove?"** — Be ready with the OSS + tmux-durable + delegation-hierarchy answer. Do NOT claim "first" or "open territory."
