# dev.to launch article (canonical writeup)

> Publish on dev.to with tags `#claudecode #buildinpublic #ai #opensource`. This is your **canonical** content piece — link to it from Reddit/X/HN/PH. Make it the post you point everyone to. First-person, build-in-public voice. Swap in real screenshots/GIF where marked.

---

**Title:** I run a fleet of AI coding agents on an infinite canvas — here's the open-source tool I built to steer them

**Cover image:** the canvas with multiple terminals + delegation lines (use `docs/termcanvas-demo.gif`)

---

A few months ago my dev setup quietly turned into chaos.

I wasn't writing most of the code anymore — I was *steering* it. Claude Code in one terminal, Codex in another, a shell running tests, one tailing logs, another agent I'd spun up for a side task and half-forgotten. Six, seven, eight terminal tabs. And the real problem wasn't running them. It was this question, on a loop, all day:

**"Which one needs me right now?"**

That's the thing nobody tells you about working with multiple agents. The bottleneck stops being compute and starts being *you* — your attention, spread across a pile of identical-looking tabs, trying to remember which agent was doing what and which one just got stuck waiting for input.

I looked for a tool that fixed this. There are good ones appearing now (I'll be honest about them below). But I wanted something specific: open source, local, built on durable terminal sessions, and organized around *seeing* my agents, not listing them. So I started building it in the open.

It's called **TermCanvas**.

## The idea: terminals as nodes on a canvas

[SCREENSHOT: canvas overview]

Instead of tabs, every terminal — every shell, every AI agent — is a **node on an infinite canvas**. You drag them where they make sense and your spatial memory does the rest: the test agent lives top-right, the commander lives center, the logs go bottom-left. After a day you stop reading labels; you just *know* where things are.

Three things I cared about:

**1. It's tmux-backed.** The canvas is just a view over real tmux sessions. They survive crashes, reboots, and SSH, and you can reattach from a plain terminal. Your fleet doesn't evaporate because Electron hiccuped.

**2. Delegation is visible.** When a commander agent spins up worker agents, TermCanvas draws **commander→worker delegation lines** between the terminals. The hierarchy of who's-doing-what-for-whom is on screen, not in your head or buried in a chat log.

[SCREENSHOT: delegation lines between agent terminals]

**3. It's open source and local.** No account, no credits, no cloud. Your tmux, your agents, your machine.

## Being honest about the competition

This space is moving fast and I'd be lying if I said TermCanvas was first. If you want a canvas of agents, you should also look at:

- **Maestri** — a polished native macOS app with the same "infinite canvas of connected agents" idea. If you want native and don't care about open source, it's great.
- **OpenCove** — open source and cross-platform, very similar stack to mine.
- **Warp** — runs agents in parallel with a clean tab UI and native code review.

What's actually different about TermCanvas: it's **open source + tmux-durable + organized around a commander→worker control plane**. If that combination matters to you, it might be your thing. If you want native polish or Linux today, one of the others is a better call. I'd rather tell you that than waste your install.

## Where it's at (no hype)

It's **early — v0.2.5**, **macOS / Apple Silicon only**, and it's just me. Cross-platform is the #1 ask and it's on my list. I'm building it on a livestream, in public, and the roadmap bends toward whatever feedback I get.

If "a cockpit for steering a fleet of agents" is a thing you've wanted too:

⭐ **Repo:** https://github.com/lout33/termcanvas
🎥 **Demo:** https://www.youtube.com/watch?v=4XN5jvk9P1U

Tell me where the delegation model breaks for your workflow — that's the feedback I actually need right now.

---

*Building this in the open. Follow along if multi-agent dev is your world too.*
