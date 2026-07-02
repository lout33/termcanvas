# AlternativeTo listing draft

> ⚠️ **Create the account TODAY** — there's a 1-week age requirement before you can submit. Flow: log in → top-right user icon → "Suggest new application." Moderator-reviewed before going live. **License field = `Free`, NOT "Open Source", until an OSI LICENSE file is added** (currently there is none — see `README-suggestions.md`). After adding MIT, change it to Open Source.

## Name
```
TermCanvas
```

## Short description
```
An open-source, tmux-backed desktop app that arranges real terminal sessions and
AI coding agents as nodes on an infinite canvas, with commander→worker delegation
lines for steering multiple agents at once.
```

## Long description
```
TermCanvas is a spatial workspace for developers who run multiple shells and AI
coding agents (Claude Code, Codex, aider) at the same time. Instead of a pile of
tabs, each terminal is a draggable, resizable node on an infinite pan/zoom canvas.

It's tmux-backed: the canvas is a view over real tmux sessions, so they survive
crashes, reboots, and SSH, and can be reattached from a plain terminal. An
"agentmux" view shows AI commander and worker agent terminals with delegation
lines drawn between them, so you can see and steer the topology of who is
delegating to whom.

Features: infinite canvas with pan/zoom, multiple project-bound canvases, a
workspace file drawer, drag/resize/maximize terminal nodes, session restore
across relaunches, and JSON export/import.

Requirements: macOS on Apple Silicon. Built with Electron, xterm.js, node-pty,
and tmux. Open source.
```

## Platforms
```
Mac (note in description: Apple Silicon required — "Apple Silicon" is not a
selectable platform on AlternativeTo)
```

## License
```
Free   (change to "Open Source" only after adding an OSI LICENSE file)
```

## Tags / categories
```
terminal · tmux · terminal-multiplexer · ai-agents · ai-coding · electron ·
developer-tools · macos · infinite-canvas · terminal-workspace
```

## Official links
```
Website/Repo: https://github.com/lout33/termcanvas
Video: https://www.youtube.com/watch?v=4XN5jvk9P1U
```

## "Alternative to" anchors (priority order — verified live in bold)
```
1. tmux      (alternativeto.net/software/tmux/)   — verified
2. iTerm2    (alternativeto.net/software/iterm2/)  — verified
3. Warp
4. Wave Terminal
5. Zellij
6. Tabby / Hyper
```
Add the verified two first; add the rest if their listings exist.

## Screenshots
- Canvas overview (the money shot — multiple terminals + delegation lines)
- Agentmux commander/worker view
- Workspace drawer
- Logo
