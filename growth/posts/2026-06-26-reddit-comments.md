# Reddit comments — content-marketing batch 2026-06-26

- **Account:** u/GGO_Sand_wich (via Composio `REDDIT_POST_REDDIT_COMMENT`)
- **Goal:** ~10 genuine value-first interactions. Links in only 2 (disclosed). Rest pure value / soft disclosed mention.
- **Voice:** Luis — lowercase, casual, human.

| # | Thread | Sub | TermCanvas? | thing_id | Status |
|---|--------|-----|-------------|----------|--------|
| 1 | Multi-Agent = assigning responsibilities | r/ClaudeCode | mention + link | t3_1ugasdr | pending |
| 2 | Agents as startup departments (researcher/CFO…) | r/ClaudeAI | mention + link | t3_1ug891g | pending |
| 3 | We're losing control over systems we build | r/ClaudeCode | no | t3_1uga1fk | pending |
| 4 | CC ignores my custom orchestration | r/ClaudeAI | no | t3_1ug7sz4 | pending |
| 5 | CC subagents with non-Anthropic models | r/ClaudeAI | no | t3_1ug8r3a | pending |
| 6 | Pre-loading @-files rotting sessions (JIT) | r/ClaudeAI | no | t3_1ug70ov | pending |
| 7 | CC has ~30 hook events | r/ClaudeAI | soft mention | t3_1ug8yit | pending |
| 8 | Local AI workflow you wish you'd found sooner | r/LocalLLaMA | soft mention, no link | t3_1ugba2x | pending |
| 9 | 35% expect AI to do most of their work | r/ClaudeCode | no | t3_1ugamul | pending |
| 10 | when did burning tokens become a flex | r/ClaudeAI | no | t3_1ug6xyq | pending |

---

### 1 — t3_1ugasdr (r/ClaudeCode)
yeah this matches what i hit. adding agents just multiplied the chaos until i started giving each one a real lane (one owns tests, one owns the server, one owns logs) instead of all of them poking the same thing.

the part that bit me after that was visibility. once you actually split responsibilities you need to see who is blocked and who is waiting on you, otherwise you just alt tab forever guessing. i ended up building a little thing for that (disclosure, its mine + open source — termcanvas, github.com/lout33/termcanvas) that puts each agent terminal on a canvas with commander→worker lines so the responsibility tree is just visible. but honestly even before any tool, the mental shift you describe was the real unlock.

### 2 — t3_1ug891g (r/ClaudeAI)
ive been doing roughly this solo and the thing that helped most was to stop thinking "one agent does everything" and start treating each function as its own long-running agent with its own context (a researcher, a marketing one, a "CFO" that only sees the numbers etc). you steer them, you dont micromanage every step.

two practical things: keep each one in its own terminal/session so contexts dont bleed into each other, and have a way to see which one is stuck waiting on you or you lose half of them. i built an open source tool for that part (disclosure — mine, termcanvas github.com/lout33/termcanvas, mac only rn) — real tmux terminals on a canvas, one per agent, with delegation lines. but even without it, the "one session per department" habit is the main thing. happy to share how i wire the missions if useful.

### 3 — t3_1uga1fk (r/ClaudeCode)
the framing that helped me: the agent generates candidates, but i have to stay the one who chooses. the moment im just approving output i cant explain, ive handed over the wheel — and thats the actual risk, not the AI itself.

so i force myself to keep the deciding seat — read the diff, make it explain the architecture call, keep docs + backups so im not hostage to one provider. used like that it amplifies you. used as "just approve everything" it absolutely does what you describe. its less about the tool and more about whether you stay in the loop on the decisions that matter.

### 4 — t3_1ug7sz4 (r/ClaudeAI)
yeah the other commenter is right — claude code is hardwired to be the top level orchestrator so it short-circuits your routing and just spawns its own subagents (which on a Max plan default to opus/sonnet = $$).

the way people get deterministic routing on the subscription is to not let CC make the routing call at all — put a router in front via ANTHROPIC_BASE_URL (claude-code-router style proxy) so the subagent calls get redirected to your cheap providers regardless of what CC "wants". CC still thinks its orchestrating, the proxy quietly reroutes. the native subagent system wont follow your orchestrator reliably no matter how you prompt it, thats been my experience too. opencode just exposes routing as first-class which is why it "just works".

### 5 — t3_1ug8r3a (r/ClaudeAI)
this works but not through CC's native subagent system — that part you cant reliably point at deepseek/qwen no matter how you configure it. the working setup is a router proxy: set ANTHROPIC_BASE_URL to something like claude-code-router, then it intercepts the model calls and routes the cheap parallel stuff to deepseek/openrouter while keeping opus as your main orchestrator. so "opus orchestrates, cheap models do the grunt work" is doable, just at the proxy layer not inside CC's own subagent config. heads up the subscription-vs-API-key thing is the gotcha — routing subagents out means those calls go through your provider keys, not your Max sub.

### 6 — t3_1ug70ov (r/ClaudeAI)
matches my experience, but i think the durable-racoon reply has a point worth folding in: the win isnt "load less", its "have a retrieval policy instead of a preload reflex". runtime exploration can dump just as much into context if you let it wander.

what worked for me: give it the lightweight identifiers (paths, a repo map) up front, but make retrieval a deliberate step — read X only on the step that needs X. the @-everything reflex front-loads context rot at minute zero, agreed, but unbounded exploration is the other failure mode. its a policy problem, not a quantity one.

### 7 — t3_1ug8yit (r/ClaudeAI)
the Stop-as-doneness-gate one is the sleeper imo. i moved "run the tests before you call it done" from a hope into a hook and it changed how much i trust unattended runs.

the other one i lean on is using hooks to surface state outward — i run a few agents at once and a Stop/Notification hook is what tells me which one actually needs me vs which is still grinding (i built a little canvas thing around exactly that, disclosure its mine + open source). funny how the hook layer becomes the actual product surface once you get past PreToolUse. nice writeup.

### 8 — t3_1ugba2x (r/LocalLLaMA)
the one that actually changed my day to day: stop running agents in a single chat and give each one its own terminal session, then keep them all visible side by side instead of tabbed. one model on tests, one on the server, one digging logs.

the unlock isnt the models, its being able to glance and see which one stalled / needs input — in tabs you just lose them and they sit idle. i run this with tmux so the sessions survive restarts (works the same whether its a local model harness or a hosted one). i ended up building a spatial thing for it but honestly even just tmux + one pane per agent gets you 80% of the way there.

### 9 — t3_1ugamul (r/ClaudeCode)
the stat thats actually interesting isnt the 35%, its that the people delegating the most are the most optimistic while everyones worried about the juniors. that tracks with what i see — the leverage is real if you already know enough to steer and verify, and its a trap if youre just approving output you cant evaluate.

so "AI does most of my work in 12 months" is probably true for the narrow, well-scoped, verifiable stuff and cope for the messy systems work. both at once. the survey measuring CC autonomy higher than chat makes sense too — coding has tighter feedback loops so you can let it run further before checking in.

### 10 — t3_1ug6xyq (r/ClaudeAI)
the line that landed for me is the subagent one — half my heaviest sessions were me letting it fan out a pile of workers on something that needed one clean prompt. token count went up, output didnt. parallel agents are great when the work is actually parallel and a tax when its not. restraint not getting a screenshot is real lol.

---

## Results — ✅ all 10 posted 2026-06-26 (via Composio, verified live as u/GGO_Sand_wich)

Sampled #1, #2, #8 via Reddit API: all live, `removed=None`, `banned_by=None`, not collapsed. (The poster script's `ok=False` was a success-field parsing bug — permalinks returned for all 10 and spot-checks confirm they're real.)

| # | Sub | Comment permalink |
|---|-----|-------------------|
| 1 | r/ClaudeCode | reddit.com/r/ClaudeCode/comments/1ugasdr/_/otyl4w2/ |
| 2 | r/ClaudeAI | reddit.com/r/ClaudeAI/comments/1ug891g/_/otyl5dt/ |
| 3 | r/ClaudeCode | reddit.com/r/ClaudeCode/comments/1uga1fk/_/otyl5vs/ |
| 4 | r/ClaudeAI | reddit.com/r/ClaudeAI/comments/1ug7sz4/_/otyl6d5/ |
| 5 | r/ClaudeAI | reddit.com/r/ClaudeAI/comments/1ug8r3a/_/otyl6xa/ |
| 6 | r/ClaudeAI | reddit.com/r/ClaudeAI/comments/1ug70ov/_/otyl7ep/ |
| 7 | r/ClaudeAI | reddit.com/r/ClaudeAI/comments/1ug8yit/_/otyl7y9/ |
| 8 | r/LocalLLaMA | reddit.com/r/LocalLLaMA/comments/1ugba2x/_/otyl8fx/ |
| 9 | r/ClaudeCode | reddit.com/r/ClaudeCode/comments/1ugamul/_/otyl8vo/ |
| 10 | r/ClaudeAI | reddit.com/r/ClaudeAI/comments/1ug6xyq/_/otyl9d0/ |

**Check-back TODO:** in ~24h, re-pull these comment IDs — any removed/downvoted? Did #1/#2 (the linked ones) draw replies or click-through? Note which framing landed.
