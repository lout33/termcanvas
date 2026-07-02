# Reddit comments — content-marketing batch 2 (2026-06-26)

- **Account:** u/GGO_Sand_wich (via Composio `REDDIT_POST_REDDIT_COMMENT`)
- **Goal:** 10 more value-first interactions (second batch of the day). 1 carries the repo link (natural fit), 0 soft mentions, 9 pure value.
- **Voice:** Luis — lowercase, simple, no em-dashes.
- **Status:** ✅ all 10 posted + verified live in-thread as u/GGO_Sand_wich (none removed/banned).

| # | Thread | Sub | TermCanvas? | parent | comment id | Permalink |
|---|--------|-----|-------------|--------|-----------|-----------|
| 1 | parallel agents in git worktrees (Frame) | r/ClaudeCode | **link (disclosed)** | t3_1ugcw6y | otzm1fa | reddit.com/r/ClaudeCode/comments/1ugcw6y/_/otzm1fa/ |
| 2 | babysitting claude on long tasks / drift | r/ClaudeAI | no | t3_1ugbwtt | otzm1w2 | reddit.com/r/ClaudeAI/comments/1ugbwtt/_/otzm1w2/ |
| 3 | instantly hits 5-hour limit on resume | r/ClaudeCode | no | t3_1ugeyeb | otzm2ct | reddit.com/r/ClaudeCode/comments/1ugeyeb/_/otzm2ct/ |
| 4 | day one setup / init workflow (student) | r/ClaudeCode | no | t3_1ugft1p | otzm2x2 | reddit.com/r/ClaudeCode/comments/1ugft1p/_/otzm2x2/ |
| 5 | stop claude building apps randomly | r/ClaudeAI | no | t3_1ugf9wh | otzm3gs | reddit.com/r/ClaudeAI/comments/1ugf9wh/_/otzm3gs/ |
| 6 | 4B local model distill-on-idle pipeline | r/LocalLLaMA | no | t3_1ugcsfv | otzm3yl | reddit.com/r/LocalLLaMA/comments/1ugcsfv/_/otzm3yl/ |
| 7 | switch back from OpenCodeGo to CC? | r/ClaudeCode | no | t3_1ugb2vo | otzm4ge | reddit.com/r/ClaudeCode/comments/1ugb2vo/_/otzm4ge/ |
| 8 | Claude Design -> Claude Code tips | r/ClaudeCode | no | t3_1ugbivy | otzm50t | reddit.com/r/ClaudeCode/comments/1ugbivy/_/otzm50t/ |
| 9 | Opus horrendous at SQL (90 parallel queries) | r/ClaudeCode | no | t3_1ugcvda | otzm5h4 | reddit.com/r/ClaudeCode/comments/1ugcvda/_/otzm5h4/ |
| 10 | ran /code-review opus, 25 agents ate limit | r/ClaudeAI | no | t3_1ugejtr | otzm5z7 | reddit.com/r/ClaudeAI/comments/1ugejtr/_/otzm5z7/ |

---

### Full comment texts

**1 — t3_1ugcw6y (r/ClaudeCode, "parallel agents in git worktrees" — Frame, OSS):**
the footprint thing is the smart part. letting the model "remember" not to touch overlapping files never held up for me either, it has to be enforced outside the model. once you run a few in parallel like this the next thing that bit me was just seeing which one stalled or is waiting on me, in tabs i lose them. i ended up building an open source thing for that part (disclosure its mine, termcanvas github.com/lout33/termcanvas) puts each agent terminal on a canvas so the conductor->worker tree is actually visible. but the spec-as-a-unit-of-work idea is the real core here, thats what makes them parallelizable at all.

**2 — t3_1ugbwtt (r/ClaudeAI, babysitting/drift on long Obsidian-notes job):**
this reads like context drift, not laziness. your detailed instruction is huge at the start but as it grinds through a class it falls out of the window and it reverts to the cheap default (one summary page). saying "you know how to do this right" works because it re-injects the rule. what fixed it for me on long jobs: make the instruction a file it re-reads at the start of each chunk, and split the work so each lecture is its own run instead of one giant session. fresh context per chunk, the rules stay in view. the single long session is exactly where it degrades.

**3 — t3_1ugeyeb (r/ClaudeCode, 5-hour limit on resume w/ 24MB artifact):**
sounds like its reloading that 24mb built file back into context on resume. when the artifact itself is sitting in the window every message is huge so you hit the cap almost instantly. dont resume the old session for the export step. /clear, start fresh, tell it the file is already built and to just return/copy it without reading the whole thing. keep the giant generated file out of context and reference it by path. the limit is tokens in the window, not actual time, and a fat artifact eats it fast.

**4 — t3_1ugft1p (r/ClaudeCode, student day-one workflow):**
day one i keep it boring. git init, then a tiny CLAUDE.md that says how to behave (run tests before calling it done, dont touch X, the 2-3 architecture decisions) not a restatement of the file tree. then run the first real task in plan mode so it asks questions before writing anything. thats basically it. the trap is front loading a giant config on an empty repo, it rots fast and the model cant use most of it yet. let the CLAUDE.md grow from real mistakes, every time it does something dumb add one line. the "pull skills from popular repos" thing does exist (plugins/marketplaces) but as a student id learn what each piece does first, a borrowed mega-setup hides the why.

**5 — t3_1ugf9wh (r/ClaudeAI, claude builds apps randomly):**
its the tool not you. claude code / the coding agent is wired so its default action is to build something, so a vague request gets answered with "ill build it". for hiking routes or "find me an app" use the normal claude chat at claude.ai, not the coding one, it'll just answer. if you are stuck in the coding tool start the message with "dont write any code, just answer:" and it behaves. wrong tool for the question, not a broken bot. the quota burn is it doing work you didnt want, that prefix stops it.

**6 — t3_1ugcsfv (r/LocalLLaMA, 4B distill-on-idle):**
the distill-on-idle part is the bit i find clever, spending the idle gpu cycles to compress instead of trying to do it live is what makes a 4B actually usable here. most "local assistant" posts skip exactly that. question, how do you decide whats worth distilling vs dropping, time based or some salience score on the capture? the failure mode id worry about is the 4B confidently distilling a wrong summary and you never catch it because the raw is already gone. do you keep the raw around or is the distilled version the only copy?

**7 — t3_1ugb2vo (r/ClaudeCode, OpenCodeGo vs CC):**
honest take, the model isnt the main difference, the harness is. claude codes orchestration (how it explores, spawns subagents, recovers from dead ends) does a lot you dont see, thats what you actually pay for. opencode + glm/deepseek is cheaper and more controllable but you feel the harness gap on messy multi step work. if in 3 days you didnt notice quality dropping, stay on opencode and keep the money. if you did feel it getting dumber on the hard stuff, thats the harness, switch back. decide on whether the cheaper setup actually did your work, not on the promo deadline.

**8 — t3_1ugbivy (r/ClaudeCode, Claude Design -> Code):**
two things from doing this. before "build this thing" run one plan mode session and make it ask you a pile of questions about intent and the api shape, the design export alone wont carry your goals. and export the design as a bundle that includes the why (what each screen expects from the backend) not just the jsx, otherwise code rebuilds the look but guesses the behavior. opus vs sonnet for the actual code, yeah its noticeably better at multi file wiring and not breaking stuff across the project, worth it for the build pass. coming from lovable the big shift is you own the loop now, it wont silently auto-fix, so go smaller steps and check each one.

**9 — t3_1ugcvda (r/ClaudeCode, Opus bad at SQL):**
the tell is it had the original single query to copy and still fanned out to 90. agents default to "looks thorough" (parallel, defensive) over "efficient" unless efficiency is actually in the spec. it has no feel for rows-scanned cost, a 1M row scan and a 200 row return read the same to it. what works for me, state it as a hard rule ("match the original query shape, one query, no per-row loops, this runs on sqlite/D1") and make it explain the query plan before you accept it. it wont find efficiency on its own, you have to make it a requirement. not a sql-iq thing, nobody told it that cheap matters.

**10 — t3_1ugejtr (r/ClaudeAI, /code-review spawned 25 agents):**
25 agents is it treating the whole repo as if its all new. point /code-review at just the diff or the branch instead of the full tree and it spawns a handful, not an army. the fan-out is proportional to how much surface you hand it. also opus for a broad audit is the expensive combo, fine for a tight diff, brutal for "review everything". (no movie runs that long but you basically funded one)

---

**Check-back TODO (~24h):** re-pull these 10 comment ids — any removed/downvoted? Did #1 (the linked one) draw replies/click-through? Note which framing landed. NB: this is the **2nd batch of 10 today** from this account (20 comments + 1 self-post in one day) — watch for any rate/spam flag.
