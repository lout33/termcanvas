# TermCanvas — Agent-Team Market Discovery

> Bounded market-discovery scout artifact. Purpose: test whether **agent steering, visibility, coordination, and handoff** are painful enough for budget-holding founders and engineering teams — already running multiple AI coding agents in parallel — to pay to solve. **This is a problem validation document, not a product spec.** TermCanvas is mentioned only once, at the end of the interview script, as required by the operator.
>
> Evidence standard: every signal below is a public primary source with date, URL, actor/team context, and a direct quote or clearly-labeled observation. "Budget authority: evidenced" means the person publicly holds a purchasing decision; "unknown" means we could not confirm it from public information. **Vendor marketing, tool popularity, and star counts are treated as demand signals, not proof of pain or willingness-to-pay.**
>
> Research window: late Sep 2025 – Jul 21 2026. All URLs fetched 2026-07-21.

---

## 1. Target segment and disqualifiers

### In-scope segment

**Primary:** Solo technical founders and small (1–10 eng) teams who **already run ≥3 AI coding agents (Claude Code, Codex, OpenCode, Gemini CLI, aider) in parallel on the same product**, on macOS or Linux, and who **hold their own tooling budget** (founder/CTO/head-of-eng).

**Secondary (lower confidence):** Staff+ engineers at larger companies running parallel agent experiments on internal projects with discretionary tool budget.

### Disqualifiers (out of scope for this round)

- **Single-agent users.** People running one Claude Code/Cursor session at a time. The pain is real but different (review fatigue, not coordination).
- **No budget authority.** IC engineers at companies where tool spend goes through procurement and the person can't authorize a $20–$100/mo line item themselves.
- **Vibe-coding hobbyists / "make me a demo in 10 minutes" crowd.** High churn, no repeatable workflow, no willingness to pay.
- **Pure orchestration-framework users** (LangGraph/CrewAI/AG2 fans who write Python orchestration code). They've already chosen a framework abstraction; their pain is framework-shaped, not cockpit-shaped.
- **Non-coding agent users** (research agents, browser agents, content-gen agents). Different problem space.
- **Windows-only or strictly cloud-only shops.** TermCanvas is macOS Apple-Silicon only today; this disqualifier is about product fit, not about whether they have the pain.
- **People who have never run parallel agents and are "curious."** They don't have the pain yet — interviewing them produces hypotheticals.

### Why this segment

The pain only crystallizes past ~3 concurrent agents on the same codebase (signals §2 consistently describe the breakdown at 4–10 agents). Below that, terminal tabs suffice. The segment above is the one where the pain is *demonstrably present today* (people are publicly building and paying for workarounds) and where the buyer is reachable.

---

## 2. Public pain signals (13 independent, deduplicated)

Each signal is a separate primary source. I did **not** count reposts, summaries, or derivative blog posts of the same event. Quoted text is verbatim from the source (HTML entities decoded; `<p>` rendered as paragraph breaks).

### S1 — Ask HN: "How to think in terms of parallel Claude agents"
- **Date:** 2026-04-25
- **Source:** https://news.ycombinator.com/item?id=47903093 (5 comments, 4 points)
- **Actor:** `gndp`, HN user (no company disclosed; appears to be an indie/solo dev from post history). **Budget authority: unknown.**
- **Quote (OP):** *"Now I can't imagine how are people using like 20 parallel Claude instances, I can't think of 2 on the same project. What am I missing? Do I need to take a step back and relearn how I think about projects."*
- **Quote (top reply, `stefanhoelzl`, who then built [codehydra](https://github.com/stefanhoelzl/codehydra)):** *"Just launching multiple AI instances does not scale because you loose the overview an context of each task. Also you need git worktrees to isolate the agent from each others work. My solution was a tool around VSCode, handling worktree creation and notifications for idle agents… I regularly work with ~5 parallel task (sometimes up to 10)."*
- **Why it matters:** The OP names the core cognitive problem ("can't think of 2 on the same project") and a user who hit the wall hard enough to build a workaround. Workaround-building is the strongest form of pain evidence short of paying.

### S2 — HN case study: "A case study in testing with 100+ Claude agents in parallel"
- **Date:** 2026-04-03
- **Source:** https://news.ycombinator.com/item?id=47629485 (68 points, 54 comments); blog post https://imbue.com/product/mngr_part_2/
- **Actor:** **Imbue** (well-funded AI agent company; `kanjun` = Kanjun Qiu, co-founder, replies in thread). **Budget authority: evidenced** (Imbue has raised ~$200M+ and runs large agent fleets internally).
- **Quote (`maxbeech`, commenter):** *"the harder problem is observability. with one agent you can read logs and understand what went wrong. with 100 agents you need aggregation, pattern detection, alerting on the common failure modes. if 3 agents fail silently but identically, was that a real issue or just rate limiting?… at scale you're debugging distributions, not individual runs."*
- **Quote (`laalshaitaan`, commenter):** *"behavioral drift between parallel agent instances is nearly invisible without something aggregating what they are actually doing across runs. We hit this ourselves: two agents completing the same task successfully via completely different paths, one of which quietly broke edge cases in prod."*
- **Quote (`khazhoux`, commenter, skeptical):** *"Me: has to babysit every feature for hours in Claude Code… Bloggers: Here's how we use 3,000 parallel agents… I'm doing something wrong, or other people are doing something wrong?"*
- **Why it matters:** A funded agent company publicly built `mngr` (open-source tmux-based orchestrator) for *their own* internal pain — workaround-at-scale. The threaded comments split into "observability is the real bottleneck" and "this is marketing for a product." Both readings confirm the pain cluster exists.

### S3 — Show HN: FleetCode – Open-source UI for running multiple coding agents
- **Date:** 2025-10-08
- **Source:** https://news.ycombinator.com/item?id=45518861 (103 points, 52 comments); repo https://github.com/built-by-as/FleetCode (420★)
- **Actor:** **Amrit Subramanian** (`asdev` / `built-by-as` on GitHub). **Budget authority: unknown** (solo builder).
- **Quote (OP):** *"After having to do a ton of git stashing and branch fumbling, I decided I needed to something to more ergonomically run these agents in their own dedicated spaces. I tried a lot of the existing products but they either were too convoluted or flat out didn't work."*
- **Quote (reply, `asdev`):** *"yeah I was doing the same [multiple terminal tabs] and it was working okay, but was hard to work in a truly parallel fashion due to agents making conflicting changes"*
- **Why it matters:** Builder explicitly names "terminal tabs + git stashing" as the failing workaround and "conflicting changes" as the breakage. Built an OSS tool to fix it for himself first.

### S4 — Show HN: Vibe Kanban – Kanban board to manage your AI coding agents
- **Date:** 2025-07-11
- **Source:** https://news.ycombinator.com/item?id=44533004 (195 points, 132 comments); repo https://github.com/BloopAI/vibe-kanban (27,471★)
- **Actor:** **Louis Kang** (`louiskw`) + `ggordonhall`, Bloop AI (funded company; YC-backed). **Budget authority: evidenced** (Bloop raised a Series A; this is a funded team building the tool as a product line).
- **Quote (OP):** *"I was feeling pretty useless working synchronously with coding agents. The 2-5 minutes that they take to complete their work often led me to distraction and doomscrolling."*
- **Quote (`deepdarkforest`, commenter):** *"whenever i try to parallelize, they clash while editing files simultaneously, i lose mental context of what's going on, they rewrite tests etc. It's chaos… A kanban board to just shoot off as many tasks as possible and just quickly read over the PR's is crazy to me."*
- **Quote (`helsinki`, commenter, paid power user):** *"This works in theory and somewhat in practice but it is not as clean as people make it seem, as someone who has spent tens of thousands on Opus tokens and worktrees - it's just not that great. It works, but it's just, ugh, boring, super tedious, etc. at the end of it all, you're still sitting around waiting for Claude to merge conflicts."*
- **Why it matters:** Highest-trafficked thread in the set. Two distinct pain sub-clusters visible: **(a) "lose mental context of what's going on"** (visibility), **(b) "chaos" / merge conflicts / "still sitting around waiting"** (coordination + handoff). Plus a power user who has spent "tens of thousands" on tokens — direct budget evidence.

### S5 — Show HN: Emdash – Open-source agentic development environment
- **Date:** 2026-02-24
- **Source:** https://news.ycombinator.com/item?id=47140322 (206 points, 71 comments); repo https://github.com/generalaction/emdash (5,228★, YC W26)
- **Actor:** **Arne & Raban** (`onecommit`), founders of General Action / Emdash (YC W26). **Budget authority: evidenced** (YC-backed founders; they are the buyers for their own tooling and the sellers of the product).
- **Quote (OP):** *"We are building Emdash for ourselves. While working on a cap-table management application… we found our development workflow to be messy: lots of terminals, lots of branches, and too much time spent waiting on Codex."*
- **Quote (`mccoyb`, commenter, sharp skeptic):** *"if agents continue to get better with RL, what is future proof about this environment or UI?… managing 5-10 agents ... is not pretty. Are we really landing good PRs with 100% cognitive focus from 5-10 agents? Chances are, I'm making mistakes… Why not 1 agent managing 5-10 agents for you?"*
- **Why it matters:** YC-backed team built the tool for their own cap-table product's development pain. The skeptical commenter articulates the **strongest counterevidence** (see §4): the platform floor is rising and 1-agent-managing-N may eat the human-steering layer.

### S6 — Show HN: Project management system for Claude Code (ccpm)
- **Date:** 2025-08-20
- **Source:** https://news.ycombinator.com/item?id=44960594 (175 points, 24 comments); repo https://github.com/automazeio/ccpm (8,281★)
- **Actor:** **Automaze** (`aroussi`, UK-based "CTO & Technical Co-Founder as a Service"). **Budget authority: evidenced** (consulting CTO who buys tools for client engagements; public email `hello@automaze.io`).
- **Quote (OP):** *"The problem was that context kept disappearing between tasks. With multiple Claude agents running in parallel, I'd lose track of specs, dependencies, and history. External PM tools didn't help because syncing them with repos always created friction."*
- **Quote (`jdmoreira`, commenter):** *"it blows my mind people can use this at a higher level than I do. I really need to approve every single edit and keep an eye on it at ALL TIMES, otherwise it goes haywire very very fast! How are people using auto-edits and these kind of higher-level abstraction?"*
- **Why it matters:** Names "context disappears between tasks" and "lose track of specs/dependencies/history" — a third pain sub-cluster (shared-context/memory), distinct from S4's visibility and coordination pains. The `jdmoreira` reply shows the steering-attention pain from the opposite end: people who *can't* yet scale to parallel because the review load is already overwhelming.

### S7 — Ask HN: Anyone orchestrating multiple AI coding agents in parallel?
- **Date:** 2026-02-07
- **Source:** https://news.ycombinator.com/item?id=46924871 (1 point, 0 comments)
- **Actor:** `buildingwdavid` (David, builder of Orcha.nl). **Budget authority: unknown** (appears solo).
- **Quote (OP):** *"I've been running into a wall with AI coding assistants. They're great individually, but I end up being the human middleware - copy-pasting between Claude windows, manually coordinating who works on what."*
- **Why it matters:** The phrase **"human middleware"** is the cleanest articulation of the steering/coordination pain in the whole dataset. Low engagement (0 comments) but the OP built a whole product (Orcha) around it.

### S8 — Ask HN: How did you set up a multi-agent orchestration for personal use?
- **Date:** 2026-06-26
- **Source:** https://news.ycombinator.com/item?id=48680842 (6 points, 7 comments)
- **Actor:** `cromka`. **Budget authority: unknown.**
- **Quote (OP):** *"I am about to start a bigger project with several subprojects and want to be a human in the loop of otherwise fairly automated loop, which should ideally use different agents for different roles (coding, design, testing, supervision, etc). I know this approach is becoming increasingly common and I wonder if there's already some tooling that facilitates that?"*
- **Quote (`yaskou`, commenter):** *"they all seem to assume an agent lives in one worktree of one git repo… Outside of that, the repo boundary is often just not the task boundary. Some context lives next door, or two repos away, and the sandbox somehow has to know what to bring in."*
- **Why it matters:** Fresh (within last 30 days). The OP wants role-specialized agents (coding/testing/supervision) and human-in-the-loop — directly matches the "commander/worker + steering" thesis. The `yaskou` reply names a concrete unsolved sub-problem (multi-repo context boundaries).

### S9 — Launch HN: Spine Swarm (YC S23) – AI agents that collaborate on a visual canvas
- **Date:** 2026-03-13
- **Source:** https://news.ycombinator.com/item?id=47364116 (109 points, 69 comments); site https://www.getspine.ai/
- **Actor:** **Ashwin & Akshay** (`a24venka`), Spine AI, YC S23. **Budget authority: evidenced** (YC-backed founders).
- **Quote (OP):** *"chat is the wrong interface for complex AI work. It's a linear thread, and real projects aren't linear… There's no way to see how it's connecting the pieces, no way to correct one step without rerunning everything, and no way to branch off and explore two strategies side by side."*
- **Quote (`jpbryan`, commenter, skeptical):** *"Why do I need a canvas to visualize the work that the agents are doing? I don't want to see their thought process, I just want the end product like how ChatGPT or Claude currently work."*
- **Why it matters:** Funded team's *entire product thesis* is the visibility/steering pain — strongest "someone is paying to solve this" signal. The `jpbryan` reply is **counterevidence** (see §4): not everyone wants a canvas.

### S10 — Simon Willison, "Embracing the parallel coding agent lifestyle"
- **Date:** 2025-10-05
- **Source:** https://simonwillison.net/2025/Oct/5/parallel-coding-agents/
- **Actor:** **Simon Willison** (influential devtools blogger; co-creator of Datasette; ~80k+ readers). **Budget authority: evidenced** (runs his own tooling budget; widely followed by founders/engineers with budget).
- **Quote:** *"I was pretty skeptical about this at first. AI-generated code needs to be reviewed, which means the natural bottleneck on all of this is how fast I can review the results. It's tough keeping up with just a single LLM given how fast they can churn things out, where's the benefit from running more than one at a time if it just leaves me further behind?"*
- **Why it matters:** Willison is an agenda-setter for the devtools audience. His framing — **"review is the bottleneck, parallel agents make the bottleneck worse unless you change the workflow"** — is the most-cited public articulation of the steering-attention problem. His post seeded a lot of the later HN/Reddit discussion.

### S11 — Reddit r/ClaudeAI, "Is there actually a good way to orchestrate multiple agents, or is everyone just running a bunch of terminals?" (already in outreach-targets.md, included for completeness)
- **Date:** 2026-06-19
- **Source:** https://old.reddit.com/r/ClaudeAI/comments/1ua3252/ (36 comments, verified via prior research in `growth/outreach-targets.md`)
- **Actor:** Anonymous OP (Reddit). **Budget authority: unknown.**
- **Quote (OP):** *"isolates environments, lets you review the work, and lets you step in when you need to, without it collapsing back into six terminals."*
- **Why it matters:** Fresh, exact-fit language ("collapse back into six terminals"). Used here only as a cross-reference; the underlying thread is already documented in the existing growth docs.

### S12 — Reddit r/ClaudeCode, "Mental burnout from too many parallel Claude Code sessions" (Google-indexed title)
- **Date:** ~5 months ago (~Feb 2026), 30+ comments
- **Source:** Thread title surfaced via Google search `https://www.google.com/search?q=%22mental+burnout%22+%22parallel+claude+code%22+site:reddit.com`; direct Reddit URL blocked by Reddit's bot wall, so the exact thread body could not be re-verified in this session.
- **Actor:** Anonymous Reddit OP. **Budget authority: unknown.**
- **Observation (labeled, not a direct quote):** Per Google's index, the thread title itself is the pain signal — "mental burnout from too many parallel Claude Code sessions." A separate r/ClaudeCode thread "Mental Fatigue" (110+ comments, ~5 months ago, https://old.reddit.com/r/ClaudeCode/comments/1k9lz8p/mental_fatigue/) was also indexed but its body was blocked from re-fetch.
- **Why it matters:** The emotional register ("burnout," "fatigue") is stronger than the HN signals and indicates the pain has graduated from annoyance to **active suffering** for at least some users. **Caveat:** direct quotes could not be re-verified this session; treat as a title-only signal pending a logged-in Reddit fetch.

### S13 — Reddit r/ClaudeCode, "AI coding helps me with speed, but the mental overload is…" (90+ comments, ~4 months ago)
- **Date:** ~Apr 2026
- **Source:** Thread surfaced via Google search `https://www.google.com/search?q=%22mental+overload%22+%22AI+coding%22+site:reddit.com`; direct Reddit URL blocked.
- **Actor:** Anonymous Reddit OP. **Budget authority: unknown.**
- **Observation (labeled):** Per Google's index, the title frames speed-vs-overload as a direct tradeoff — the same tension Simon Willison names in S10. 90+ comments indicate high engagement.
- **Why it matters:** Corroborates S10 and S12 from an independent platform and a less-technical audience. **Caveat:** same as S12 — body not re-verified; title-only signal.

---

## 3. Current tools, workarounds, and what users say fails

Compiled from the §2 signals plus the existing `growth/competitors.md` map. Workarounds are listed by the actual language users use.

| Workaround | What users say fails | Source |
|---|---|---|
| **Multiple terminal tabs + git stash/branch** | "agents making conflicting changes" (S3); "collapse back into six terminals" (S11); "hard to work in a truly parallel fashion" (S3) | S3, S11 |
| **Git worktrees (one per agent)** | "still sitting around waiting for Claude to merge conflicts" (S4); "just not that great… boring, super tedious" (S4, paid power user); "they all seem to assume an agent lives in one worktree of one git repo… the repo boundary is often just not the task boundary" (S8) | S4, S8 |
| **Kanban board wrappers** (Vibe Kanban, Backlog.md) | "I could open lots of PRs at once but they often need to be dependent on each other" (S4); "compounded false affirmatives… models hid the body in the first place because they needed some input" (S4, `swalsh`) | S4 |
| **TUI agents-in-panes managers** (claude-squad 8.1k★, Seshions, Atria, Architect, Amux) | Each ships but each has low engagement (1–4 HN comments); users complain existing products are "too convoluted or flat out didn't work" (S3) | S3 + HN search |
| **Sidebar/list orchestrators** (Conductor, Warp's agent panel, Sculptor, Paperclip) | "I can't keep up with reviewing even one agent" (paraphrased from `jdmoreira` in S6); list UIs don't show delegation topology | S6 |
| **IDE integrations** (Cursor, OpenCode subagents, VSCode forks like Emdash/codehydra) | "I lose mental context of what's going on" (S4); IDEs assume one repo per agent (S8) | S4, S8 |
| **DIY bash scripts + GitHub Issues as DB** (ccpm) | "context kept disappearing between tasks… external PM tools didn't help because syncing them with repos always created friction" (S6) | S6 |
| **Manual human middleware (copy-paste between windows)** | "I end up being the human middleware" (S7) | S7 |
| **Native agent-team features (Claude Code Agent Teams, shipped Feb 2026)** | Per `growth/competitors.md`: native commander/worker is now free; "only its visualization is left open." The rising platform floor is reducing — but not eliminating — the wedge. | competitors.md |

**What fails most consistently across sources:** (1) **terminal tabs at >3 agents** (universal), (2) **git worktrees for merge/conflict resolution** (called "tedious" even by power users), (3) **list/kanban views for showing who-delegates-to-whom** (no one complains about the list *itself*; they complain that it doesn't show topology and that "which agent needs me" is unanswered), (4) **single-repo assumptions** when the task spans multiple repos.

---

## 4. Ranked pain clusters (scored, with counterevidence)

Scoring: each cluster scored 1–5 on **Frequency** (how often the pain appears across independent sources), **Severity** (cost/impact when it hits), **Urgency** (is it blocking work *now*), **Budget** (evidence the holder can pay), **Access** (can we reach them), **Counterevidence** (higher = less counterevidence). A weighted total is given but should not be read as a number with real precision — it's a forcing function for honest comparison.

Weights: Frequency ×3, Severity ×3, Urgency ×2, Budget ×2, Access ×2, Counterevidence ×1. Max = 65.

### C1 — Steering-attention / "which agent needs me right now" (visibility)
The pain of not knowing which of N concurrent agents is idle, blocked, or producing bad output, and having to poll each one.

- Frequency 5 (S2, S3, S4, S6, S7, S10, S11, S12, S13 all touch it)
- Severity 4 (it's the bottleneck that caps how many agents you can run; S10 frames it as the fundamental ceiling)
- Urgency 4 (blocks parallel-agent adoption *today*)
- Budget 3 (founders and CTOs feel it; some evidence of token spend "tens of thousands" S4)
- Access 4 (the sufferers are public on HN/Reddit/X and built OSS workarounds with their names on them)
- Counterevidence 3 (some users S5-comment, S9-comment say "1 agent managing N agents" removes the need for human steering)
- **Weighted total: 52/65**

### C2 — Context & memory loss across agents and tasks
Specs, dependencies, history, and decisions disappear between agent runs; no shared scratchpad.

- Frequency 4 (S6, S8, S4 "lose mental context," S2 "behavioral drift")
- Severity 4 (causes real rework and prod bugs per S2)
- Urgency 3 (people live with it via copy-paste, but it's grating)
- Budget 3 (same buyer pool as C1)
- Access 4 (public complainers)
- Counterevidence 3 (some users say "just write better specs" — S2 `tossandthrow`)
- **Weighted total: 47/65**

### C3 — Coordination collisions & merge/handoff tedium
Agents editing same files, rewriting each other's tests, merge-conflict resolution as the bottleneck.

- Frequency 4 (S3, S4, S4-`deepdarkforest`, S5-thread, S2-`qi_imbue`)
- Severity 4 (causes broken prod per S2)
- Urgency 4 (blocks parallel adoption immediately)
- Budget 3 (same pool)
- Access 4
- Counterevidence 2 (worktrees + good task decomposition demonstrably *do* help — S2 author says "most changes merge cleanly"; the pain is real but partially mitigable)
- **Weighted total: 46/65**

### C4 — Cost / token-budget blowup at scale
Orchestrating 100 agents burns tokens on context-loading before any work happens.

- Frequency 2 (S2-`maxbeech` is the main articulation; S4-`helsinki` "tens of thousands on Opus tokens")
- Severity 4 (real money)
- Urgency 3 (only hurts at >20 agents, which is beyond most of the segment)
- Budget 3
- Access 3 (the people with this pain are at scale and harder to reach cold)
- Counterevidence 3 (mostly a >50-agent problem; outside the 3–10 agent wedge)
- **Weighted total: 36/65**

### C5 — Tool fragmentation / "everything is too convoluted or flat out doesn't work"
The existing landscape of workarounds doesn't compose.

- Frequency 3 (S3, S8, plus the dozens of low-engagement Show HNs in §2)
- Severity 2 (annoyance, not blocking)
- Urgency 2
- Budget 2 (people who have already cobbled together a stack are less likely to pay to replace it)
- Access 4
- Counterevidence 2 (Emdash, Vibe Kanban, claude-squad are converging on "good enough" for many)
- **Weighted total: 33/65**

### C6 — Cognitive overload / mental fatigue / burnout
The *emotional* cost of running parallel agents, beyond the functional pains.

- Frequency 3 (S10, S12, S13)
- Severity 4 (burnout is severe; it causes people to *quit* parallel-agent workflows entirely)
- Urgency 2 (chronic, not acute)
- Budget 2 (burnout sufferers aren't always the budget holders)
- Access 3 (anonymous Reddit threads)
- Counterevidence 3 (some users report no burnout and high productivity — S2 `tossandthrow`, S4 `louiskw`)
- **Weighted total: 36/65**

### Ranking summary
1. **C1 Steering-attention (52)** — the wedge pain. Highest frequency, highest urgency, reachable sufferers.
2. **C2 Context/memory loss (47)** — second-tier, often co-occurs with C1.
3. **C3 Coordination collisions (46)** — third-tier, *partially* mitigable by worktrees today, so a narrower wedge.
4. **C6 Cognitive overload (36)** / **C4 Cost (36)** — real but secondary.
5. **C5 Tool fragmentation (33)** — weakest.

### Strongest counterevidence (applies to all clusters)

1. **The platform floor is rising fast.** Claude Code native Agent Teams shipped Feb 2026 (per `competitors.md`) and gives away commander/worker delegation. Native orchestration is on a 6–12 month trajectory to "good enough" for most users. **This shrinks the wedge but does not eliminate it today.**
2. **The "1 agent managing N agents" objection (S5-`mccoyb`).** If a lead agent can steer sub-agents autonomously, the *human* doesn't need a steering cockpit. The honest reply: today's lead agents are not reliable enough for unattended fan-out (S2, S4-power-user both show this), but the trajectory is against the wedge.
3. **"I just want the end product, not a canvas" (S9-`jpbryan`).** A segment of users actively *dislike* the visibility layer. TermCanvas's canvas thesis is not universally wanted.
4. **"This is a pitch to sell an agent orchestration product" (S2-`dakolli`).** Public pain posts and Show HNs are correlated with people *selling* orchestration products. Vendor bias inflates the apparent pain. I excluded vendor marketing from the signal set but the builders in §2 are nearly all shipping tools, so the sample is biased toward people who self-selected into the problem.
5. **Star counts are not pain proof.** Vibe Kanban (27k★) and ccpm (8k★) and claude-squad (8k★) demonstrate *demand for the category*, not validated willingness-to-pay for a specific narrow wedge (steering/visibility). Some of these are OSS and free.

---

## 5. Interview prospects (18, public professional information only)

Every prospect below is a real, public person. Contact paths are their publicly-listed GitHub profile, Twitter/X handle, personal blog, or public email. **No outreach has been sent.** "Evidence they face the problem" cites the public signal that proves they personally hit the pain (either by complaining or by building a workaround). "Why now" is the time-sensitive reason to interview them in the next 2–4 weeks.

Ranked roughly by fit (highest first): builders who hit the pain and shipped a workaround are the best prospects because their pain is *demonstrated by action*, not just words.

| # | Name | Public contact path | Evidence they face the problem | Why now |
|---|---|---|---|---|
| 1 | **Amrit Subramanian** (`asdev`) | GitHub https://github.com/built-by-as ; repo https://github.com/built-by-as/FleetCode (420★) | Built FleetCode (S3) because "terminal tabs… conflicting changes" — workaround-by-action. | FleetCode is recent (Oct 2025) and small enough that the builder is still actively wrestling with the workflow. |
| 2 | **Stefan Hoelzl** | GitHub https://github.com/stefanhoelzl ; LinkedIn https://www.linkedin.com/in/shoelzl ; repo https://github.com/stefanhoelzl/codehydra | HN reply in S1: "I regularly work with ~5 parallel task (sometimes up to 10)" and built codehydra (VSCode + worktree + idle notifications) for it. | Dec 2025 build; he is a Munich-based engineer actively iterating on the workflow. |
| 3 | **Louis Kang** (`louiskw`) + **ggordonhall** | GitHub https://github.com/BloopAI/vibe-kanban (27k★) ; X https://x.com/louiskw (via repo) | Built Vibe Kanban (S4); OP quote on "feeling useless… doomscrolling" while agents run. | Their tool is the highest-trafficked in the space; they are YC-backed and likely have customer interview infrastructure we can learn from. |
| 4 | **Arne & Raban** (Emdash founders, `onecommit`) | GitHub https://github.com/generalaction/emdash (5,228★, YC W26) ; X https://x.com/emdashsh ; site https://generalaction.com | Built Emdash (S5) "for ourselves" because "lots of terminals, lots of branches, too much time spent waiting on Codex." | YC W26 batch — they are in active customer-discovery mode and likely receptive to peer-founder interviews. |
| 5 | **Automaze / `aroussi`** | GitHub https://github.com/automazeio ; public email hello@automaze.io ; X https://x.com/automazeio ; repo https://github.com/automazeio/ccpm (8,281★) | Built ccpm (S6) for "context kept disappearing… I'd lose track of specs, dependencies, and history." Consulting CTO, so the pain recurs across client engagements. | Public email + recurring pain across clients = high-value interview. UK-based. |
| 6 | **`khazhoux`** (HN user) | HN profile https://news.ycombinator.com/user?id=khazhoux (no other public handle surfaced) | S2 comment: "has to babysit every feature for hours in Claude Code… I'm doing something wrong, or other people are doing something wrong?" | The skeptical-but-engaged persona; good for testing the counterevidence honestly. |
| 7 | **`helsinki`** (HN user, Vibe Kanban power user) | HN profile https://news.ycombinator.com/user?id=helsinki | S4: "spent tens of thousands on Opus tokens and worktrees - it's just not that great… boring, super tedious." **Budget evidence: spent $10k+ on tokens.** | The highest direct-spend signal in the dataset. Worth a long-form interview on what "good enough" would look like. |
| 8 | **`maxbeech`** (HN user) | HN profile https://news.ycombinator.com/user?id=maxbeech | S2: articulates the observability-at-scale pain ("debugging distributions, not individual runs") most clearly of anyone in the dataset. | Best articulation of C1 at scale; would test whether the wedge holds past 20 agents. |
| 9 | **`yaskou`** (HN user) | HN profile https://news.ycombinator.com/user?id=yaskou | S8: names the multi-repo context boundary problem ("the repo boundary is often just not the task boundary"). | Fresh (Jun 2026); a specific unsolved sub-problem worth understanding before scoping anything. |
| 10 | **`buildingwdavid`** (David, Orcha) | Site https://orcha.nl (from S7); HN profile https://news.ycombinator.com/user?id=buildingwdavid | S7: "I end up being the human middleware - copy-pasting between Claude windows." Built Orcha around it. | Built a visual workflow builder for hand-offs — directly in the TermCanvas problem space. |
| 11 | **Sergei Petunin** (`forketyfork`) | GitHub https://github.com/forketyfork ; site https://forketyfork.github.io ; X https://x.com/forketyfork ; repo https://github.com/forketyfork/architect (43★) | Built Architect — "a flexible terminal grid for multi-agent AI workflows." | Recent (Nov 2025); small enough that the builder will talk; public on multiple channels. |
| 12 | **Seth Deckard** | GitHub https://github.com/sethdeckard ; site https://sethdeckard.com ; X https://x.com/sethdeckard ; repo https://github.com/sethdeckard/atria (19★) | Built Atria — "TUI for managing multiple AI coding agents in terminal tabs and panes." | Mar 2026 build; actively iterating; public site + Twitter. |
| 13 | **Dmitriy Kudryavtsev** (`kuderr`) | GitHub https://github.com/kuderr ; blog https://kuderblog.com/ ; repo https://github.com/kuderr/git-wt (12★) | Built git-wt — bash wrapper for git worktrees (the most common workaround in the dataset). | Feb 2026; the workaround-builder angle — he lives inside the worktree flow and knows exactly where it breaks. |
| 14 | **韩数 / Hanshu** (`hanshuaikang`) | GitHub https://github.com/hanshuaikang ; site https://hanshutx.com/ ; X https://x.com/HanshuGithub ; repo https://github.com/hanshuaikang/nezha (1,818★) | Built Nezha — "Code Editor for the AI Agents Era. Run multiple Claude Code and Codex agents across projects." | High stars for a young project (Mar 2026); builder active on X. |
| 15 | **Kostiantyn Kriuchkov** (`Latand`) | GitHub https://github.com/Latand ; Telegram https://t.me/Latand ; repo https://github.com/Latand/live-log-viewer-next (8★) | Show HN (2026-07-06): "Orchestrate parallel Claude Code and Codex agents on a live map." | Very fresh (this month); the "live map" framing is closest to TermCanvas's spatial thesis. |
| 16 | **Mike Lyons** (`frenchie4111`) | GitHub https://github.com/frenchie4111 ; site http://mikelyons.org/ ; repo https://github.com/frenchie4111/harness (86★) | Show HN (2026-04-29): "Harness – Manage parallel Claude Code agents across Git worktrees." SF-based, "hi finance" company. | SF-based founder; recent build; worktree-centric. |
| 17 | **Kanjun Qiu** (`kanjun`) + **thejash** | Imbue — site https://imbue.com/ ; HN https://news.ycombinator.com/user?id=kanjun ; blog https://imbue.com/product/mngr_part_2/ | S2: Imbue built `mngr` (open-source tmux-based orchestrator) for their own internal 100+ agent fleet. **Budget authority: evidenced (Imbue co-founder).** | Highest-credibility prospect; the deepest public case study in the space. Harder to reach cold but worth a calibrated attempt via HN or Imbue's public email. |
| 18 | **`cromka`** (HN user) | HN profile https://news.ycombinator.com/user?id=cromka | S8 OP: wants "different agents for different roles (coding, design, testing, supervision)" + human-in-the-loop. | Freshest Ask HN (Jun 2026); the ask is exactly the commander/worker + steering thesis. |

**Prospects I deliberately excluded:** the anonymous Reddit OPs (S11, S12, S13) — no public identity, so no public contact path; and the maintainers of Maestri / Agent Grid / OpenCove / Warp (per `competitors.md`) — they are *vendors* in the same space, not neutral sufferers, and interviewing them as "prospects" would be a conflict.

**Note on contact paths:** the GitHub profile URLs and the email/Twitter/blog handles above are all taken from the prospects' own public GitHub profiles (fetched via the GitHub API on 2026-07-21) or from their public Show HN posts. No scraping of private messages, no inferred emails, no purchased lists.

---

## 6. Neutral customer-interview script (TermCanvas mentioned only at the end)

> Format: 30-minute call. Open-ended. The goal is to elicit their workflow and where it breaks, *not* to validate TermCanvas. TermCanvas is mentioned only in the last 2 minutes, only if they ask "what are you building?", and only as a one-line disclosure.

### Intro (2 min)
"Thanks for taking 30 minutes. I'm researching how people who run multiple AI coding agents in parallel actually do it day-to-day — what works, what breaks, what they've cobbled together. There are no right answers; I'm not here to sell anything. I'll keep it casual. Can I record for my own notes?"

### Section A — Current workflow (8 min)
1. "Walk me through the last time you ran more than one coding agent at once. What were you working on, and how many agents were running?"
2. "Where were they running — terminal tabs, worktrees, some tool? Just describe the layout."
3. "From the moment you started the first agent to the moment you had merged code you were happy with, what did you actually *do*? Step by step."
4. "Of all those steps, which ones felt like *your* job, and which ones felt like housekeeping you wished you didn't have to do?"

### Section B — The break point (8 min)
5. "Think about the most recent time it went sideways — an agent went off the rails, or two agents stepped on each other, or you lost track of what was happening. Just tell me the story."
6. "How did you notice? What was the first sign?"
7. "What did you do to recover?"
8. "How often does something like that happen? Is it once a week, once a day, every session?"
9. "Is there a number of agents where it always falls apart? What's that number for you?"

### Section C — Workarounds and spend (8 min)
10. "What have you tried to make it less painful? Tools, scripts, habits, team conventions."
11. "Of those, which ones stuck and which ones did you abandon? Why did the abandoned ones fail?"
12. "Are you paying for anything specifically to help with this — a tool, a hosted version of something, more tokens, a bigger machine? Ballpark, what do you spend per month on the parallel-agent part of your workflow?"
13. "If you could wave a magic wand and fix one thing about running multiple agents, what would it be?" (Listen for whether they name visibility, coordination, context-loss, or cost — don't prompt.)
14. "Who else on your team or in your network hits this same wall? Would they be willing to talk to me too?"

### Section D — Disclosure (2 min, only if they ask)
15. *(Only if asked "what are you building?" or "why are you asking?")*: "Full disclosure: I'm working on an open-source tool called TermCanvas — it's a spatial canvas for steering multiple AI agents, tmux-backed. I'm not here to pitch it; I'm mostly trying to understand whether the pain is big enough to be worth solving and whether the way I'm thinking about it matches how you actually work. Happy to share more at the end if useful."

### Post-call (not part of the script)
- Record: (a) the specific break-point story verbatim if possible, (b) the agent-count where it falls apart, (c) the monthly spend figure, (d) whether they spontaneously named visibility / coordination / context / cost as the magic-wand fix, (e) whether they'd be willing to be interviewed again or to try a prototype.
- **Do not** record anything they say about TermCanvas in section D as "validation." The script is designed to elicit unprompted pain; prompted reactions to a product pitch are not pain evidence.

---

## 7. Hypothesis, falsifiers, and GO/NO-GO recommendation

### The narrow hypothesis to test in 10 interviews

**H1:** *Founders and engineering leads who already run ≥3 parallel AI coding agents on the same product lose ≥30% of their parallel-agent time to "steering-attention overhead" — i.e., polling agents to find out which one needs them, recovering from collisions, and re-establishing mental context after context-switches — and this overhead, not token cost or agent capability, is the binding constraint on how many agents they can productively run.*

**Why this hypothesis:** It's the intersection of the top three clusters (C1, C2, C3) and matches the most frequent verbatim language in the signal set ("which agent needs me," "human middleware," "lose mental context," "babysit every feature"). It is also the *narrowest* claim that would still justify a steering-focused product — broader claims (e.g., "multi-agent is painful") are true but not actionable.

### Operationalization (what counts as evidence per interview)

- **Supports H1 if the interviewee:** (a) spontaneously names visibility/steering/context-switching as the magic-wand fix in Q13, (b) reports losing ≥30% of parallel-agent time to overhead (we will ask them to estimate directly), (c) reports a ceiling of productive agents ≤8 *attributable to overhead* (not to token cost or model capability), (d) has cobbled together a workaround (scripts, worktree conventions, a tool) specifically for steering/visibility.
- **Weakens H1 if the interviewee:** (a) names token cost or model capability as the binding constraint, (b) is productive at ≥10 agents with their current workaround and reports <15% overhead, (c) says "1 lead agent managing N sub-agents" has already removed the human-steering burden for them, (d) reports the pain is real but not worth paying anything to fix.

### Explicit falsifiers (any one of these kills H1)

- **F1:** ≥4 of 10 interviewees report the binding constraint is **token cost or model capability**, not steering overhead.
- **F2:** ≥4 of 10 interviewees are **already productive at ≥10 parallel agents** with their current stack and report <15% overhead.
- **F3:** ≥4 of 10 interviewees say **native agent-team features** (Claude Code Agent Teams, Codex Cloud orchestration, etc.) have already eliminated their need for a separate steering layer.
- **F4:** ≥6 of 10 interviewees say they **would not pay anything** for a tool that solved only the steering/visibility problem (i.e., the pain is real but not a paid-pain).
- **F5:** The median "magic-wand fix" answer across 10 interviews is **not** visibility/steering/context (i.e., the unprompted pain language doesn't converge on our hypothesis).

### GO/NO-GO recommendation

**Recommendation: GO — proceed to 10 customer interviews with H1 and the §6 script.**

**Confidence: moderate.** The public evidence strongly supports that the pain exists (13 independent signals, 4 funded teams building for it, multiple power users with $10k+ in token spend articulating the exact pain). The counterevidence is real but mostly *forward-looking* (the platform floor is rising; "1-agent-manages-N" may eat the wedge). None of the falsifiers F1–F5 are *currently* evidenced at the thresholds that would kill H1 — but only actual interviews can confirm that.

**One decision for Luis:** approve the interview round (10 calls, ~5 hours total, no outreach copy that mentions TermCanvas until §6.D, no public posts) — or defer until after the TermCanvas LICENSE/notarization fixes in `growth/launch-playbook.md` Week 0 are done, so that interviewees who ask to try the tool can actually install it without the unsigned-app friction.

**Safe default if Luis does not decide: NO-GO on outreach; park the prospect list and run zero calls until Luis explicitly approves.** The prospect list and script are ready; no outbound messages will be sent without his sign-off.

---

## 8. Unknowns and stopping condition

### Unknowns (things this artifact does *not* establish)

1. **Willingness-to-pay.** No public signal in the set directly evidences willingness to pay for a *steering-specific* tool. Token spend (S4-`helsinki`) evidences spend on the *workflow*, not on a tool to manage it. Only interviews can price-test.
2. **Platform-floor trajectory.** We do not know whether Claude Code Agent Teams / Codex Cloud / Gemini CLI's native orchestration will be "good enough" for the segment in 6 months. The counterevidence (S5-`mccoyb`, S9-`jpbryan`) says maybe; the workaround-builders (S3–S7) say not yet.
3. **Apple-Silicon-only fit.** Several prospects (S8-`yaskou`, S14-`hanshuaikang`, S15-`Latand`) are outside macOS. TermCanvas's current platform limit disqualifies them as *users* even if they're great as *interviewees*. Interview them anyway for pain validation; just don't pitch.
4. **Team vs. solo.** Most public signals are solo founders or solo power users. The "engineering team of 5–10" sub-segment is under-represented in public pain posts (teams don't post on Reddit about their pain as much). Interviews need to deliberately include 2–3 team leads to test whether the pain scales with team size.
5. **Verified Reddit quotes.** S12 and S13 are title-only signals because Reddit's bot wall blocked re-fetching the bodies this session. A logged-in browser session would let us verify the bodies and lift them from "title-only" to full quotes.
6. **Vendor bias in the sample.** 9 of 13 signals are from people who built or sell an orchestration tool. The sample is biased toward people who self-selected into the problem. The interview round must include at least 3 prospects who are *not* building tools (e.g., `khazhoux`, `cromka`, `buildingwdavid`'s users) to check for this bias.

### Stopping condition

**Stop the interview round after 10 calls and decide GO/NO-GO on continued investment based on:**

- If **≥7 of 10** interviews support H1 (per the operationalization above) and **none of F1–F5 fire**, the pain is validated → recommend Luis commission a small prototype test or a paid pilot with 2–3 of the most forthcoming interviewees.
- If **4–6 of 10** support H1, or **any falsifier fires at half its threshold** (e.g., 2 of 10 say token cost is the binding constraint — half of F1's kill threshold), the pain is *partially* validated → recommend a second round of 10 interviews with a tightened script before any prototype spend.
- If **≤3 of 10** support H1, or **any falsifier fires at its kill threshold**, H1 is falsified → recommend pivoting the wedge away from steering/visibility (likely candidates: shared-context/memory C2, or multi-repo orchestration S8-`yaskou`) and re-running discovery, *not* building a steering product.

**Hard stop regardless of results:** 20 interviews total. If the signal is not clear by call 20, more interviews will not make it clear — at that point the question is no longer research, it is lack of conviction, and the right move is to ship nothing and revisit in 90 days when the platform floor has moved.

---

## Appendix — source-fetch notes (honesty)

- All HN threads and the GitHub API calls were fetched live on 2026-07-21 via the agent browser (Algolia HN API and `api.github.com`). Full JSON outputs saved to `~/.browseros/tool-output/` on the scout's machine.
- Reddit URLs in §2 (S11, S12, S13) are blocked by Reddit's bot wall for automated fetch. S11 is cross-referenced from the existing `growth/outreach-targets.md` (which was browser-verified at the time of that doc). S12 and S13 are Google-indexed titles only; their bodies were not re-verified this session.
- Simon Willison's post (S10) was fetched live and is fully quoted.
- The imbue blog (S2) URL is the canonical source; the HN thread (also S2) was fetched live via Algolia and is the primary evidentiary artifact since it includes the comment-section pain language.
- No outreach was sent. No purchases were made. No external messages. No edits to files outside this one.