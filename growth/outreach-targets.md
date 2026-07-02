# TermCanvas — Authentic outreach targets (verified June 2026)

> The legitimate version of "find people who need this and share my link." Every thread below was **opened and date-verified** by a research agent (Reddit via real browser, HN via Algolia, GitHub direct). These are people asking *exactly* for what TermCanvas does. **You post these replies as yourself, disclosing you built it** — that's welcome here; drive-by promo is not.
>
> **The wedge to lead with everywhere:** the pain everyone describes is *observability / steering-attention* — **"which agent needs me right now."** Frame TermCanvas as the **cockpit** that answers that, not "another canvas." Do a Maestri differentiation line if pressed.

## The reply formula (don't skip)
1. **Answer their question first** with real value (how you actually manage N agents).
2. **Then** disclose: "I got frustrated enough that I built an open-source tool for this —" + link.
3. Invite feedback, don't pitch. One link, once. Never copy-paste the same text across threads (looks like spam + Reddit filters it).

---

## TIER 1 — Reply now (fresh, exact fit, self-promo welcome)

### 1. 🔥 r/ClaudeAI — "Is there actually a good way to orchestrate multiple agents, or is everyone just running a bunch of terminals?"
`https://old.reddit.com/r/ClaudeAI/comments/1ua3252/is_there_actually_a_good_way_to_orchestrate/`
**2026-06-19 · 36 comments · HOT · OP is tool-hunting and building their own. TOP TARGET.**
OP's words: *"isolates environments, lets you review the work, and lets you step in when you need to, without it collapsing back into six terminals."*

**Draft reply:**
```
"Without it collapsing back into six terminals" is exactly the wall I hit. What
helped me: stop treating the agents as tabs and give each one a fixed spatial
position so your eyes learn "the test agent lives top-right." The thing that
actually fixed the step-in problem for me was making the terminals persistent
(tmux-backed) so I can detach/reattach without losing a session mid-task.

I got frustrated enough that I built an open-source tool around this idea —
TermCanvas: real terminals as nodes on a canvas, tmux-backed, with commander→worker
delegation lines so you can see which agent is doing what. macOS/Apple-Silicon only
right now, very early. Repo: https://github.com/lout33/termcanvas — genuinely
curious if the spatial approach solves your "six terminals" problem or just moves it.
```

### 2. r/ClaudeAI — "How are you managing multiple coding agents in parallel without things getting messy?" (also in r/ClaudeCode)
`https://old.reddit.com/r/ClaudeAI/comments/1st21n2/how_are_you_managing_multiple_coding_agents_in/`
**2026-04-22 · bullseye: OP asks "what tools are you using? what do you wish existed?"**

**Draft reply:**
```
The handoff/ownership problem is the real killer for me, not the running itself.
Two things that helped: (1) one durable session per agent (tmux) so nothing dies
on a reattach, (2) a visual layout so "who's touching what" is spatial instead of
remembered.

On "what I wish existed" — I wanted a cockpit that shows which agent needs me right
now, so I started building one in the open: https://github.com/lout33/termcanvas
(open source, macOS for now). It puts each agent terminal as a node with
delegation lines. Still early — what would the ideal version do for your workflow?
```

### 3. r/AI_Agents — "Running multiple AI agents in parallel - how do you manage the human side?"
`https://old.reddit.com/r/AI_Agents/comments/1qq6mlv/running_multiple_ai_agents_in_parallel_how_do_you/`
**2026-01-29 · 18 comments.** OP: *"terminal tabs everywhere and no idea which agent needs my attention... the human-to-agents interface feels completely unsolved."*

**Draft reply:** lead hard on the "which agent needs my attention" framing (it's verbatim your pitch); same disclosure + link.

### 4. ⭐ GitHub — anthropics/claude-code #24537: "Agent Hierarchy Dashboard — unified real-time visualization for multi-agent workflows"
`https://github.com/anthropics/claude-code/issues/24537`
**Opened 2026-02-09 · still OPEN · official repo · high visibility. Best single GitHub target.**
Issue says verbatim: *"Claude Code was never meant to be a control plane for 7 concurrent subagents."*

**Draft comment:**
```
Strongly agree the chat-transcript model breaks down past a few subagents. I've been
building an open-source take on exactly this — a spatial control plane where each
agent terminal is a node with commander→worker delegation lines drawn between them,
so the hierarchy is visible instead of interleaved in one log. It's tmux-backed for
durable sessions. macOS/Apple-Silicon, early: https://github.com/lout33/termcanvas
(disclosure: I'm the author). Sharing as a concrete prior art / reference for what a
hierarchy dashboard could feel like.
```

---

## TIER 2 — Good fit, slightly older or lower traffic
- **r/ClaudeAI — "Anyone else running multiple Claude Code instances at once?"** `…/comments/1qpb90n/` — 2026-01-28, 46 comments. *"Terminal tabs everywhere, no idea which one needs my input."*
- **r/AI_Agents — "Is multi-agent supervision becoming the real bottleneck?"** `…/comments/1s8zhjp/` — 2026-03-31, 39 comments.
- **r/ClaudeCode — "How do you setup and handle 4-8 Claude agents in parallel?"** `…/comments/1rj0whl/` — 2026-03-02. OP asks "Any power apps for it?"
- **GitHub Aider-AI/aider #302** — `github.com/Aider-AI/aider/issues/302` — still open; note "external tools solve this now (disclosure: I built one)."

## TIER 3 — Engage as a peer, do NOT drop a link (build credibility / mine language)
- HN "Testing with 100+ Claude agents in parallel" `news.ycombinator.com/item?id=47629485`
- HN "Parallel agents in Zed" `id=47866750`
- HN "Claude Code subagents to parallelize development" `id=45181577` — best pain quote: *"How do you not get lost mentally in what is exactly happening at each point in time?"*
- Simon Willison "Embracing the parallel coding agent lifestyle" `simonwillison.net/2025/Oct/5/parallel-coding-agents/` — influencer; cite, don't reply-spam.

## Competitor launches — STUDY, don't hijack
Amux, Superset (HN 46109015 — read the skeptic objections to pre-empt), Harness, Hive, **claude-squad** (github.com/smtg-ai/claude-squad, 7.9k★), and **Maestri (themaestri.app)** — the closest positioning twin. Do a differentiation line before launching.

## ❌ Avoid (verified unwelcome)
- **r/ExperiencedDevs** "How do you cope with multi agent workflows?" — skeptical/anti-hype, strict self-promo rules. Sentiment context only.
- **r/AI_Agents** "I measured why I can't run more than 3 parallel agents" — OP is launching their own tool; engage on insight, don't plug.

## Standing / repeatable venues
- **dev.to** tags `#claudecode` (active, June 2026) + `#buildinpublic` `#ai` `#agents` — best recurring owned-content channel; pairs with your livestream habit.
- **r/SideProject** / **r/coolgithubprojects** — purpose-built for sharing; post the build story + specific feedback ask.
- **Show HN** — one strong post per *substantial* release (not point upgrades). No reliable recurring "what are you working on" HN thread (myth).
- **X** hashtags `#buildinpublic` (primary), `#ClaudeCode`, `#AIagents`.
- **r/macapps** — check in-app whether it runs a self-promo megathread before posting.

## Honest gaps
- Reddit subreddit *rule text* couldn't be crawled (login-walled); thread content + dates were browser-verified. Check each sub's self-promo rules in-app before posting.
- No individual X tweet was opened; hashtag communities confirmed active, specific tweets not verified.

> ⚠️ Cadence guardrail: space these out (a few per day, not all at once), vary every reply, and actually participate in the threads (answer others too). Reddit/X anti-spam filters and human mods both punish burst-posting identical links. Slow and genuine beats fast and flagged.
