# Reddit post — r/ClaudeAI

- **Account:** u/GGO_Sand_wich (via Composio)
- **Subreddit:** r/ClaudeAI
- **Type:** text (self) post
- **Flair:** "Built with Claude" (id `b1f30a12-6938-11f0-aad7-6eea404d38fd`)
- **Status:** ✅ PUBLISHED 2026-06-26 — in r/ClaudeAI's standard pre-review hold (automod queues *every* post; not a flag against us). Verify it flips public in a few min.
- **Rule fit:** Rule "Showcase your project…" allows promo if disclosed + built with Claude/Claude Code. ✓ (both true)

---

## Title
i kept losing track of which claude code agent was waiting on me, so i built a canvas to see all of them at once (open source)

## Body
so ive been running a few claude code agents at the same time on one repo, like one doing the server, one on tests, one digging through logs, and honestly the agents were fine.. the problem was me. i kept alt-tabbing through a pile of terminal windows trying to figure out which one stopped and was sitting there waiting for me to say something.

so i built this thing to fix my own annoyance. its called termcanvas, a mac app that puts real tmux terminal sessions as draggable nodes on an infinite canvas, so all the agents are just *there* on screen instead of hidden in tabs.

couple things that came out of actually using it:

- you can see the whole swarm at once, you just glance instead of hunting for the one thats stuck
- theres a little manager (agentmux) that spawns a commander agent + worker agents and draws lines between them, so you can see who spawned who and which branch is blocked
- it survives restarts. the sessions are tmux backed so i can close the app, open it again and the run is still going (can even reattach from a normal terminal)

honest stuff: its mac only right now (apple silicon), its early (v0.2.5), and its a small project, not some polished product. its open source (MIT) and yeah.. i built a big chunk of it with claude code itself lol

repo: https://github.com/lout33/termcanvas
demo: https://www.youtube.com/watch?v=4XN5jvk9P1U

im the author, mostly posting cause im curious how you all keep track of multiple agents running at once? does the canvas thing match how you actually work or is the real bottleneck somewhere else for you

---

## Outcome
- Permalink: https://www.reddit.com/r/ClaudeAI/comments/1ugbabj/i_kept_losing_track_of_which_claude_code_agent/
- Post id: t3_1ugbabj
- Posted at: 2026-06-26 (via Composio REDDIT_CREATE_REDDIT_POST, success=true)
- Immediately after: `removed_by_category=automod_filtered` = the sub's standard pre-review hold (AutoMod: "ALL posts are processed like this"). Flair "Built with Claude" applied correctly.
- 24h check — upvotes / comments / approved or removed?: _pending_
