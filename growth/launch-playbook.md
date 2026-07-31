# Launching & Growing an OSS Dev Tool as a Solo Maker — A Verified Playbook (June 2026)

> **Superseded for launch execution on 2026-07-28.** Keep this as June channel research only. Its v0.2.5, commander/worker, reboot-persistence, and broad four-week sequence claims are stale. Use `growth/launch-brief.md` for launch one.

For **TermCanvas** (OSS, macOS/Apple-Silicon-only Electron app — an infinite canvas of real tmux-backed terminals for steering multiple AI coding agents; ~8 stars, solo maintainer, builds in public).

> Evidence standard: every named tool/number below traces to a page I fetched. Causation is almost always **self-reported by the maker** (flagged). Funded/large-team examples are tagged **(non-comparable)** because a maintainer at 8 stars can't replicate what a funded team or a 70k-follower account did. The honest meta-finding up front:

> **Distribution drives the star spike; the README/demo converts it; build-in-public/video AMPLIFY an audience you already have — in the verified record they do not MANUFACTURE cold-start reach.** Plan accordingly: your spike will come from Hacker News + Reddit + a genuinely useful demo, not from a video going viral on its own.

---

## 0. The prerequisite that gates everything (do this first, week 0)

**Add an OSI `LICENSE` (MIT) file + the `license` field in `package.json` before making any "open source" claim.** TermCanvas currently has neither. Until it does:
- The "open-source" lead differentiator is **not legally true** — and it's your single best wedge vs the near-twins (Maestri is closed; OpenCove is OSS + cross-platform with a 1.5k-star head start, so "open" is the one axis you can credibly fight on).
- **r/opensource Rule 4 requires an OSI LICENSE file** — you're blocked there without it.
- AlternativeTo can only be listed as "Open Source" (not just "Free") once the license exists.

This is a 5-minute fix that unblocks your entire positioning. It is the true Day 0.

---

## 1. What actually works to get the first 100–1000 stars

### Hacker News is the heaviest single lever — and the mechanics are learnable

**Show HN qualification (verbatim, fetched — https://news.ycombinator.com/showhn.html):**
- "Show HN is for something you've made that other people can play with." A desktop app you can download and run **qualifies**.
- Off-topic: "blog posts, sign-up pages, newsletters, lists." So your *launch* is a Show HN of the app; your dev.to writeup is **not** a Show HN.
- "Please make it easy for users to try your thing out, ideally without barriers such as signups or emails." TermCanvas has none — good. But the macOS-Apple-Silicon gate IS a barrier for HN's Linux-heavy crowd; pre-empt it (below).

**Timing — verified, and it overturns the common "Tue–Thu morning" advice.** Myriade analyzed **157,000+ Show HN posts since 2009** (fetched — https://www.myriade.ai/blogs/when-is-it-the-best-time-to-post-on-show-hn): "Weekends are 20–30% more effective than weekdays for breakout potential." **Sunday hit an 11.75% breakout rate vs weekdays' 9.45–9.90%.** Best single windows: Sunday 0–2 UTC (15.7%), and ~12:00 UTC peak. A second independent analysis of 13,159 posts (https://www.ankle.io/posts/hacker-news-analysis/) agrees the **day effect is small and the hour matters ~3x more**, and found front-page breakout needs roughly **4–6 upvotes in the first ~30 minutes** (avg 5.22 votes in 27 min). **75% of Show HN posts get fewer than 6 votes** — so this is probabilistic, not a guarantee.
- **Action:** post **Sunday morning (US), which lands in the strong UTC windows.** Lead with the app link, plain title.

**Title format — plain and descriptive beats clever** (https://awesome-directories.com/blog/hacker-news-front-page-guide/, citing "Show HN: InstantDB – A Modern Firebase," 1,145 pts). For you:
> `Show HN: TermCanvas – an open-source canvas of terminals for steering AI agents (macOS)`
Put `(macOS)` or `(macOS, Apple Silicon)` in the title to pre-empt the inevitable "why not Linux?" — answer it **once**, calmly, in a comment, and move on.

**The second-chance pool is your safety net.** Official HN mechanism: moderators + reviewers comb `/newest` for overlooked posts and re-surface them on the lower front page; you can also email **hn@ycombinator.com** to nominate an overlooked post. Verified via https://bengtan.com/blog/open-secrets-hacker-news/ and a solo maker's retrospective (https://www.indiehackers.com/post/my-show-hn-reached-hacker-news-front-page-here-is-how-you-can-do-it-44c73fbdc6) whose post got "just 30 upvotes," was picked into the pool, "stayed on the front page for about 13 hours," and brought "11k unique visitors." **Implication: if your Sunday post stalls, don't delete it — it may get rescued.**

### Real comparable cold-start example: DrawDB

**DrawDB** (solo maker, no audience, a visual web tool — the closest peer to TermCanvas's situation): launched as a plain Show HN — "Show HN: Online database diagram editor," 311 points, two-line body + live link (https://hn.algolia.com/api/v1/items/39955944). The maker explicitly called the virality **"an accident"** and named **Reddit as the only organic channel** he used (https://hn.algolia.com/api/v1/items/43627758). It's now at **37,441 stars** (verified live — https://api.github.com/repos/drawdb-io/drawdb). Takeaway: **demo-first Show HN + native Reddit + a genuinely useful product**, not clever marketing.

> **Calibrate the ceiling, though:** DrawDB is a **browser app with zero install friction** and **cross-platform**. TermCanvas is **macOS/Apple-Silicon-only, downloaded, AND currently unsigned** (your README documents the right-click-open → "unidentified developer" → System Settings dance). The *mechanics* of DrawDB's launch transfer; its 37k *ceiling* does not — a Mac-Apple-Silicon-only unsigned desktop app has a much smaller addressable pool and a real conversion gap between "curious HN visitor" and "running it." Two consequences: **(a) make the demo video/GIF the evaluation surface** so people can judge it and star *without* crossing the install barrier — the star should come from the demo, not the install; **(b)** if feasible, **notarizing the app** (Apple Developer signing) is the single highest-leverage friction fix, because it removes the scariest part of first-run. Set expectations at hundreds, not tens of thousands, of stars for the first run.

Other verified demo-first Show HN launches for visual tools: **Onlook** ("visual-first Cursor for designers," 408 pts — https://hn.algolia.com/api/v1/items/44127653) and **Haystack** (IDE on an infinite canvas, 546 pts, body leads with a YouTube overview — https://hn.algolia.com/api/v1/items/41068719). All three **led with the demo, not an essay.**

### README + demo GIF: table stakes that convert the traffic

No fetchable study quantifies "the GIF drove my stars" (and the widely-quoted **"demo GIFs get 40% more stars" stat is fabricated — the source page has no citation; do not repeat it**). But the verified pattern is unanimous: **comparable visual tools open the README with a screenshot/GIF and lead the launch post with a demo.** DrawDB's README opens with a large screenshot; Onlook's opens with an 800px header + "View Demo" link; Haystack's body leads with video. The solo maker behind Rando.js puts it plainly (https://dev.to/nastyox1/8-concrete-steps-to-get-stars-on-github-355c): "A good percentage of people will star your project just because it looks good… make the top part as pretty as possible."

TermCanvas already has a demo GIF + a YouTube demo in its README — you're at baseline. **The job is to make the GIF the very first thing and tight (a 10–20s loop showing terminals being arranged + a commander spawning a worker with the delegation line drawing itself).** That delegation-line moment is your single most differentiated visual — make sure it's in the loop.

### Awesome-list PRs: real but low-evidence; do them, don't expect a spike

Honest finding: **no fetched primary source shows being *added to* an existing awesome-list causing a measurable star bump.** A YC-backed maker (Wasp) who tried it called it "not much" (https://dev.to/wasp/...-6k-stars-in-6-months-3li9). Treat awesome-list PRs as **cheap evergreen discoverability**, not a launch event. Your verified best fits (from prior channel research, primary-sourced):
- `rothgar/awesome-tmux` (Tools & session management) — best evergreen fit, actively merging.
- `cdleon/awesome-terminals` (Terminal Emulators → macOS) — lists Electron terminals already.
- `BNLNPPS/awesome-terminals-ai` — thematic AI-terminal fit.
- Each list has a **different entry format** (dash/period/capitalization) — match it exactly or the PR gets rejected on style.

### dev.to / Hashnode writeups: drive traffic + syndication, not the spike directly

The verified win is **syndication reach**, not a direct star spike. Best case: **portfolio-ideas** (solo) — a Hashnode "how I built it" post "got picked up by daily.dev and the rest was history… crossed over 1000+ stars" (https://eke.hashnode.dev/how-my-open-source-project-got-1000-stars-on-github-in-4-months). The proximate amplifier was **daily.dev syndication**, not the post itself. Another solo maker got "1400+ views" from one dev.to post (https://dev.to/rahuldkjain/...-200-stars-in-less-than-36-hours-2l15) — traffic, not a confirmed star spike. **Use `#showdev` on dev.to; write the canonical writeup here and link to it from everywhere else.**

### Newsletters: two free editorial paths worth pursuing; the big ones are pay-to-play

- **console.dev** — FREE editorial. Submit by emailing **hello@console.dev**. Features pre-1.0 / beta tools (v0.2.5 qualifies). Criteria require a developer user, self-service trial, good docs, active maintenance — TermCanvas fits. "We do not do sponsored reviews." (https://console.dev/selection-criteria)
- **Cooper Press (JavaScript Weekly / Node Weekly)** — FREE editorial; submit via their Typeform or just reply to an issue. An Electron app with a JS stack fits JS/Node Weekly. A maker once credited JavaScript Weekly with "a lot of people backing the project… an additional surge" (https://news.ycombinator.com/item?id=6038226).
- **TLDR and Bytes are paid sponsorships only** — no editorial pickup (https://advertise.tldr.tech/, https://bytes.dev/advertise). **(non-comparable** — skip for a solo launch budget.)

### Product Hunt: real channel, modest verified star impact

Causal PH→stars attribution is rare and small. Best indie data point: **Papermark** (bootstrapped) launch day — 850 upvotes, **250 GitHub stars**, 300 signups (https://www.papermark.com/blog/product-hunt-launch). A funded maker's head-to-head found PH **underperformed HN for stars** — "Got 10 GitHub stars" on PH vs "50+ stars" on HN (https://medium.com/@baristaGeek/...27be8784338b). One solo maker reported "almost nobody clicked through to the GitHub repo" from PH (https://dev.to/raxxostudios/...-1opb). **Treat PH as a supplementary launch-day surface, not the engine. Pair it with Show HN, don't substitute.** Mac-only is fine on PH; note Apple Silicon in the description; use the YouTube demo as the video.

---

## 2. "Find people with the pain and show up authentically" — without getting banned

This is the highest-leverage organic tactic AND the easiest way to torch your reputation. The line is **intent**, and every platform judges it.

### The clean rule (works everywhere)
**Legitimate:** someone publicly describes *exactly the pain your tool solves* (or asks "is there a tool that does X?"), and you reply with a genuinely helpful answer that **discloses you made it** — "Full disclosure, I built this: [link] — it does X because [their problem]." Value first, then disclose, then leave.
**Spam:** dropping your link on threads that didn't ask, posting the same link across many threads, or replying-with-link as your primary activity. This is what gets accounts removed.

### Reddit (the platform with the most explicit rules)
- **The 9:1 rule is still live as a "rule of thumb."** Reddiquette (Internet Archive snapshot dated **Aug 18, 2025**, retrieved verbatim): *"A widely used rule of thumb is the 9:1 ratio, i.e. only 1 out of every 10 of your submissions should be your own content."* **It was removed from the modern spam-enforcement page**, which replaced the number with an **intent test**: spam = contributions that "consist primarily of links to a business that you run, own, or otherwise benefit from." So: don't treat 9:1 as a magic shield, but DO keep most of your Reddit activity non-promotional and genuinely participatory. The number is a heuristic; **behavior is what's judged.** *(Confidence note: this 9:1 wording was retrieved verbatim from an Internet Archive snapshot of Reddit's official pages, dated Aug 18 & 14, 2025 — Reddit's live pages block automated fetch, so this is the one load-bearing claim sourced via archive rather than a direct live fetch. The snapshot dates are recent and the wording is verbatim, so it's solid; just slightly less certain than the HN/DrawDB anchors that were re-fetched live.)*
- **Shadowbans are real and silent.** Detect via **r/ShadowBan** and by checking your profile **logged out** (if your posts aren't visible, you're shadowbanned). Triggers (community convention): new account + immediate self-promo, identical links across subs, fast posting cadence. **Counter: age the account, comment helpfully for days before you post anything of your own, vary your activity.**
- **Per-subreddit gates matter more than the global rule.** From verified channel research: **r/macapps** needs 10 local karma + `[OS]` prefix + 1×/30d (first-timers land in the monthly Megathread); **r/commandline bans GUI-only apps** (you'd be removed — skip it); **r/coolgithubprojects** and **r/SideProject** explicitly allow self-promo. **Post natively in each sub (rewrite per audience), never cross-post the identical link.**

### Hacker News
- **Never solicit upvotes.** Verbatim (https://news.ycombinator.com/showhn.html): "Please don't ask friends to upvote or comment. That's not ok on HN." The guidelines add that HN **penalizes or bans submissions, accounts, and sites** that do — voting rings are detected and killed (post goes `[dead]`). **Don't share your HN link in any group/DM asking for votes** — that's the fastest way to get the post killed.
- Engage substantively in your own thread (answer every question, including the hostile "why Electron / why Mac-only" ones) — that's allowed and helps.

### X / Twitter (etiquette is convention, not an enforced number)
- Official policy (verified) bans **bulk/aggressive unsolicited replies** and **link-only reply-spam**. The deboost line is convention, sourced from maker norms: **don't reply to popular tweets with a bare link to your tool.** Reply with a genuinely useful point; mention your tool only if directly relevant; disclose you built it.
- Build-in-public posting on your *own* timeline is the safe, compounding channel (Part 4).

### Discord / communities
- Most servers have a dedicated **#show-your-work / #i-made-this** channel — post there, not in general chat. Rules are per-server convention (no fetchable global doc); read the channel's pinned rules first. **One post, then engage with others' work** — don't repost.

**The disclosure norm in one line:** lead with value, then *"disclosure: I'm the author."* Every platform forgives a helpful, disclosed, on-topic mention; none forgive a drive-by link.

---

## 3. The content engine — formats, and one artifact into many

### What converts for a VISUAL tool
The verified packaging pattern across DrawDB, Onlook, Haystack, tldraw: **lead with the demo.** For a canvas tool specifically, the demo IS the pitch — a static description undersells it. Your hierarchy:
1. **A tight demo GIF** (top of README, top of every post). The delegation-line-drawing moment is your differentiator — feature it.
2. **A 30–90s demo video** (you already have one on YouTube) — embed in launch posts where video is allowed (HN body, PH, dev.to).
3. **"How I use it" workflow video** — you steering a real fleet of agents on the canvas. This is the format that sells a *workflow* tool, because the value is in the orchestration, not a single screenshot.

### Comparison ("X vs Y") content — high-intent, long-tail capture
PostHog (**non-comparable** — funded) reports comparison articles convert **~25%** vs 6.3% for generic guides, "because people coming into these articles are already in a consideration phase" (https://posthog.com/blog/posthog-marketing). Bootstrapped **Plausible** runs the same play with a "Compare" nav section (https://plausible.io/vs-matomo). For TermCanvas, the honest, useful comparison pages write themselves from your existing competitor map:
- **"TermCanvas vs Maestri"** (the near-exact twin — your OSS + tmux-durability vs their native polish + $18)
- **"TermCanvas vs OpenCove"** (OSS twin — your commander→worker delegation hierarchy, which OpenCove lacks)
- **"Why I built an open-source alternative to [Warp's agent panel]"**
Write these honestly (concede where rivals win — it builds credibility and they rank). Caveat: the verified PostHog number is a *conversion rate*, not proof of traffic volume — treat comparison content as a slow compounder, not a launch spike.

### One artifact → many pieces (the repurposing workflow)
The best-documented solo system is **kanta13jp1's launch timeline** (https://dev.to/kanta13jp1/...-18g6), which maps almost exactly onto your launch: *"T+0 PH post… T+9h Show HN (US morning)… T+12h Reddit (r/SideProject first)… T+16h LinkedIn,"* with the rule *"Don't spray-post the same link everywhere. Pick 2–3 subreddits and post natively in each."* **Arvid Kahl** (solo, comparable) documents the create-once principle: one recorded session becomes "a newsletter, two blog posts, two videos, and two podcast episodes" (https://thebootstrappedfounder.com/diversify-your-creator-portfolio/).

**Your atomization recipe from ONE demo recording:**
- The full recording → **YouTube** demo (canonical).
- A 10–20s loop → **README GIF** + **X/Reddit** inline.
- A 30–60s vertical cut → **YouTube Short** (treat as an experiment — see below).
- The "here's the problem → here's the canvas → watch the delegation line draw" beats → an **X thread** (1 hook tweet + GIF + 4–6 follow-ups).
- The written narrative → **dev.to `#showdev`** post (canonical writeup, links to repo + video).
- A single screenshot of the delegation graph → **Show HN** thumbnail context + **PH** gallery.

### Short-form video (Shorts/TikTok) — unproven for devtools; instrument it if you try
Strict finding: **no fetchable page causally attributes a developer tool's stars/installs to short-form video.** Verified short-form wins are **consumer apps (ASO-driven) and games**, not devtools (e.g. Bopl Battle, a game — https://medium.com/...500-000-game-copies-via-tiktok-youtube-1ee3e966fc23). A solo dev who got 4,000 stars in 7 days did it via **Reddit + HN + a newsletter, explicitly NOT video** (https://gourav.io/blog/my-simple-github-project-went-viral). **So: written communities are the verified channel for your niche. If you post Shorts, treat them as an experiment and add UTM/tracking so you generate the missing attribution data — don't bet the launch on them.**

---

## 4. Build-in-public / livestream → distribution + stars

The honest mechanic (verified across every case): **build-in-public doesn't manufacture a cold-start audience — it COMPOUNDS one, and the audience is what converts at launch.**
- **tldraw "Make Real"** (**non-comparable** — funded): a demo video went viral *because a Figma engineer with an audience posted it* → "over 10,000 GitHub stars" in ~2 weeks (https://tldraw.dev/blog/make-real-the-story-so-far). The artifact was "simple, clever, and easily hackable" and deployed as a public URL → a UGC loop. **Lesson you can use: make the thing instantly try-able and hackable so others can show it off for you.**
- **Tony Dinh** (solo, comparable): ~90k followers from sharing the journey incl. revenue; says outright *"If that tweet didn't blow up, if I didn't have 70k followers, I don't think the product will have seen the light of day"* (https://thebootstrappedfounder.com/tony-dinh-ups-and-downs-of-an-indie-hacker-journey/).
- **Marc Lou** (solo, comparable): transparency about **revenue AND failures** (21 launched products before ShipFast broke out) built ~95k followers; the failures became the persistence narrative (https://www.builderkit.ai/blog/marc-lous-shipfast-story).
- **Caleb Porzio** (solo OSS maintainer — the closest peer): build-in-public + "sponsorware" took him to **$100k+/yr on GitHub Sponsors**; his own ranking says **sponsored screencasts that ADD VALUE drove ~$80k of $100k** — not bare narration (https://calebporzio.com/i-just-hit-dollar-100000yr-on-github-sponsors-heres-how-i-did-it, https://calebporzio.com/sponsorware).

**What this means for a livestreaming solo maker (you):**
1. **The stream is the audience-building flywheel, not the launch.** Run it daily; the launch *cashes in* the audience the stream builds. Don't expect the stream alone to drive stars on day one.
2. **Share failures and decisions, not just output** — that's the verified converter (Marc Lou's 21 failures; Porzio's transparency).
3. **Add value, don't just narrate** (Porzio's $80k lesson). Turn stream segments into teaching: "how I wired commander→worker delegation over tmux," "why I went canvas instead of tabs." These double as content (Part 3) and recruit the people with the pain (Part 2).
4. **Make TermCanvas instantly try-able and hackable** so viewers become re-sharers (the tldraw UGC loop) — the one-click skill install + bundled runtime already helps here.

---

## 5. The concrete 4-week launch sequence for TermCanvas

Designed to compound: seed quietly → produce the core artifact → coordinated launch day → sustain. Dependencies are called out. **External posts go from your own accounts on your timing** — the sequence assumes you're the one posting.

### WEEK 0 / Pre-flight (before the clock starts — half a day)
- [ ] **Add `LICENSE` (MIT) + `package.json` license field.** Unblocks every "open source" claim. **Hard gate — nothing else proceeds without this.**
- [ ] **Set GitHub repo metadata:** description = *"Spatial, tmux-backed canvas to run and steer multiple AI agent terminals with visible commander→worker delegation"*; topics (`terminal`, `tmux`, `electron`, `ai-agents`, `developer-tools`, `xterm`, `macos`, `infinite-canvas`); upload a **social-preview image** (the canvas with a delegation line). `gh repo edit lout33/termcanvas --add-topic ...`
- [ ] **Tighten the README top:** make the demo GIF the *first* element, 10–20s, ending on the delegation line drawing itself. State **"macOS, Apple Silicon only"** in the first two lines (pre-empt the objection everywhere).
- [ ] **Create an AlternativeTo account TODAY** — there's a **1-week account-age requirement** before you can submit. Starting the clock now means it clears in time for launch week.

### WEEK 1 — Seed quietly + produce the core artifact
*Goal: a few real users, the canonical demo, and a non-spammy footprint before any big push.*
- **Mon:** Record the **one core demo** (full screen-capture of a real session: open a project → spawn a commander → it delegates to a worker → delegation line draws → you re-steer). This is the artifact everything else is cut from. Upload the clean version to **YouTube**.
- **Tue:** Cut the artifact into pieces (Part 3 recipe): README GIF, 10–20s loop, a vertical short, an X-thread storyboard. Update the README GIF.
- **Wed:** **awesome-tmux PR** (`rothgar/awesome-tmux`, exact entry format). Low-stakes, evergreen, transparent. (awesome-terminals + awesome-terminals-ai PRs can follow later in the week — match each list's format.)
- **Thu:** Write the **canonical dev.to `#showdev` writeup** — "I built an open-source canvas for steering a fleet of AI agents." This is the piece you'll link from the launch. Don't publish loud yet; have it ready.
- **Fri–Sun:** **Build-in-public on your own timeline** (X + livestream): post the demo GIF, share a decision/failure from the week, ask for feedback (not stars). Start *participating* in r/macapps, r/tmux, r/SideProject as a real commenter so you're not a cold account on launch day (the shadowban counter from Part 2). Get **3–5 real users** to try it and fix whatever breaks — launch-day traffic converts to stars only if first-run works.

### WEEK 2 — Editorial + community warm-up (low-gate channels first)
*Goal: get the slow editorial pipelines moving and land the safe self-promo posts.*
- **Mon:** Email **hello@console.dev** with a tight pitch (label it beta/v0.2.x; it features pre-1.0 tools). Submit to **Cooper Press JS/Node Weekly** (free editorial). These have lead times — start now so a feature can land near or after launch.
- **Tue:** Publish the **dev.to writeup** (now it's live to link to). Cross-post natively (rewritten) to **r/coolgithubprojects** and **r/SideProject** — both explicitly allow self-promo. **Post natively in each, never the identical link.**
- **Wed:** **r/tmux** + **r/electronjs** native posts (directly relevant, on-topic). Engage in every comment thread.
- **Thu:** Publish **"TermCanvas vs Maestri"** comparison page (honest — concede their native polish, lead with OSS + tmux-durability). This is long-tail SEO that compounds past launch.
- **Fri:** **Submit the AlternativeTo listing** (account has now aged 1 week — dependency satisfied). Anchor as an alternative to **tmux** and **iTerm2** (verified first-class on AlternativeTo), license = **Open Source** (now true).
- **Weekend:** Continue build-in-public. Tease the launch ("shipping the public launch next Sunday"). Keep participating in communities.

### WEEK 3 — Coordinated launch day (the spike)
*Goal: concentrate Show HN + Product Hunt + native Reddit on one day for maximum compounding. **Launch on a SUNDAY** per the verified 157k-post timing data.*

> **Timing caveat:** Sunday is optimized for your **primary lever (Show HN)** — the 157k-post data is Show-HN-specific. It is **not** established as Product Hunt's best day. Because PH is framed here as a *supplementary* surface, same-day-on-Sunday is an acceptable timing compromise; if you'd rather optimize PH separately, **stagger the PH launch to a weekday** and keep Show HN on Sunday.

**Launch Sunday — sequenced (kanta13jp1 model, adapted):**
- **T+0 (early US Sunday / strong UTC window):** **Show HN** — `Show HN: TermCanvas – open-source canvas of terminals for steering AI agents (macOS)`. Body: 2–3 plain sentences + the live download/repo link + the YouTube demo. **Do NOT ask anyone to upvote** (Part 2 — it kills the post). Then **sit in the thread all day** answering every question, especially "why Electron / why Mac-only" — answer the Linux question once, calmly.
- **T+1h:** **Product Hunt** launch (Mac-only is fine; Apple Silicon in the description; YouTube demo as the video; tagline ≤60 chars: "Open-source canvas for steering a fleet of AI agents"). Ask for **feedback**, not upvotes.
- **T+3h:** **r/macapps** (if you've cleared 10 local karma from Week 1–2 participation; else post in the Megathread) + a fresh native **r/SideProject** launch post. Rewrite per sub.
- **T+5h:** **X launch thread** (hook + demo GIF + the build-in-public story + repo link). Pin it. This is where your streamed audience converts.
- **All day:** respond everywhere. If the Show HN stalls under ~5 votes in 30 min, **don't delete it** — the second-chance pool may rescue it; you can email hn@ycombinator.com to nominate it.
- **Mon (day after):** Post the **"launch numbers" build-in-public recap** (transparency converts — Marc Lou/Porzio). Whatever happened, share it honestly.

### WEEK 4 — Sustain + convert the long tail
*Goal: keep the curve from flat-lining; turn launch attention into durable channels.*
- **Mon:** Publish **"TermCanvas vs OpenCove"** comparison (your delegation hierarchy is the wedge OpenCove lacks). Submit remaining **awesome-list PRs** (awesome-terminals-ai).
- **Tue–Thu:** Ship the **"how I use TermCanvas to steer a real agent fleet" workflow video** (the format that sells a workflow tool) → YouTube + X + a fresh dev.to angle. This is a *different* artifact from the launch demo, so it's a legitimate new post everywhere.
- **Throughout:** Reply authentically to anyone publicly describing the multi-agent-tabs pain (Part 2 — disclosed, value-first, on-topic). Search X/Reddit/HN for "too many terminal tabs," "managing multiple Claude Code agents," "orchestrate AI agents" — that's your pain-aware audience.
- **Fri:** Retrospective build-in-public post + decide the next loop. If console.dev / a newsletter featured you, amplify that. Set up a tiny **Discord** (or use an existing relevant one's #show-your-work) for the users you've gathered.

**Why this order compounds:** LICENSE unblocks positioning → quiet seeding builds a non-spammy footprint + fixes first-run bugs → editorial pipelines (slow) are started early so features land around launch → AlternativeTo's 1-week clock is started in Week 0 so it's submittable by Week 2 → the Sunday launch concentrates HN+PH+Reddit+X on the statistically-best day → Week 4 comparison content + workflow video catch the long tail and feed evergreen SEO.

---

## 6. Anti-patterns — what NOT to do

1. **Don't claim "open source" before the LICENSE exists.** It's the #1 credibility risk and a hard block on r/opensource + AlternativeTo's OSS label. (Currently true of TermCanvas — fix first.)
2. **Don't ask anyone to upvote your Show HN / PH** — including in DMs or groups. HN detects voting rings and kills the post (`[dead]`); verbatim rule: "Please don't ask friends to upvote or comment. That's not ok on HN."
3. **Don't drive-by drop your link.** Replying to threads that didn't ask, or posting the same link across many subs/threads, is what gets accounts shadowbanned. Lead with value + disclosure, or don't post.
4. **Don't cross-post the identical text everywhere.** Rewrite natively per platform (kanta13jp1: "don't spray-post the same link"). Identical multi-sub links trigger spam flags.
5. **Don't claim the niche is empty / "first of its kind."** It's demonstrably false as of mid-2026 (Maestri, OpenCove, Agent Grid, 49Agents, Cate all occupy it; Claude Code ships native Agent Teams). Someone will correct you in the comments and you'll lose credibility. Lead with **OSS + tmux-durable + interactive commander→worker steering** instead.
6. **Don't bury or omit the macOS/Apple-Silicon limit.** Hiding it wastes the clicks of every non-Mac visitor and reads as bait. State it in the title and first README lines; among Mac users it's not even a relative disadvantage (Maestri shares the exact constraint).
7. **Don't repost "Foo 1.3.1 is out" as a Show HN** — HN's rules say minor updates aren't substantive enough. Save Show HN for a real launch or a major overhaul.
8. **Don't republish the "demo GIFs get 40% more stars" stat** — it's fabricated (no source). Stick to "a great demo converts traffic," which is defensible.
9. **Don't treat build-in-public/video as the engine.** Every verified viral-video case cashed in a pre-existing audience. The stream builds the audience; HN + Reddit drive the spike. Don't skip the launch mechanics expecting a video to carry it.
10. **Don't pay for TLDR/Bytes sponsorships at this stage** — they're pay-only, expensive, and not where a solo OSS launch's leverage is. Use the free editorial paths (console.dev, Cooper Press).
11. **Don't post to clashing subs:** r/commandline (bans GUI apps), r/programming ("I made this" not allowed). You'll be removed — it's wasted effort and a small reputation ding.

---

## Sources (all fetched/verified during this research)
- HN Show HN rules — https://news.ycombinator.com/showhn.html
- HN FAQ — https://news.ycombinator.com/newsfaq.html
- Show HN timing (157k posts) — https://www.myriade.ai/blogs/when-is-it-the-best-time-to-post-on-show-hn
- HN timing (13k posts) — https://www.ankle.io/posts/hacker-news-analysis/
- HN front-page guide / titles — https://awesome-directories.com/blog/hacker-news-front-page-guide/
- Second-chance pool — https://bengtan.com/blog/open-secrets-hacker-news/
- Solo Show HN retrospective — https://www.indiehackers.com/post/my-show-hn-reached-hacker-news-front-page-here-is-how-you-can-do-it-44c73fbdc6
- DrawDB Show HN — https://hn.algolia.com/api/v1/items/39955944 ; Reddit-as-channel — https://hn.algolia.com/api/v1/items/43627758 ; live stars — https://api.github.com/repos/drawdb-io/drawdb
- Onlook Show HN — https://hn.algolia.com/api/v1/items/44127653 ; Haystack — https://hn.algolia.com/api/v1/items/41068719
- README/looks → stars (Rando.js) — https://dev.to/nastyox1/8-concrete-steps-to-get-stars-on-github-355c
- console.dev criteria — https://console.dev/selection-criteria
- JavaScript Weekly effect — https://news.ycombinator.com/item?id=6038226
- Hashnode→daily.dev→1000 stars — https://eke.hashnode.dev/how-my-open-source-project-got-1000-stars-on-github-in-4-months
- dev.to traffic — https://dev.to/rahuldkjain/how-my-project-repo-reached-200-stars-in-less-than-36-hours-on-github-2l15
- Papermark PH launch — https://www.papermark.com/blog/product-hunt-launch
- PH vs HN for stars — https://medium.com/@baristaGeek/lessons-launching-a-developer-tool-on-hacker-news-vs-product-hunt-and-other-channels-27be8784338b
- Solo PH underperformance — https://dev.to/raxxostudios/launching-a-side-project-on-producthunt-as-a-solo-maker-1opb
- Reddit self-promo / 9:1 — reddiquette (Internet Archive snapshot dated Aug 18, 2025, retrieved verbatim) + Reddit "Am I a spammer?" page
- Launch-sequence timeline (solo) — https://dev.to/kanta13jp1/indie-dev-launch-strategy-getting-traction-on-producthunt-hackernews-and-reddit-18g6
- Repurposing system (Arvid Kahl) — https://thebootstrappedfounder.com/diversify-your-creator-portfolio/
- Comparison-content conversion (PostHog) — https://posthog.com/blog/posthog-marketing ; Plausible — https://plausible.io/vs-matomo
- Short-form NOT the channel (Gourav, 4k stars via Reddit/HN) — https://gourav.io/blog/my-simple-github-project-went-viral
- tldraw Make Real — https://tldraw.dev/blog/make-real-the-story-so-far
- Tony Dinh (audience as amplifier) — https://thebootstrappedfounder.com/tony-dinh-ups-and-downs-of-an-indie-hacker-journey/
- Marc Lou (revenue+failure transparency) — https://www.builderkit.ai/blog/marc-lous-shipfast-story
- Caleb Porzio (sponsorware / $100k) — https://calebporzio.com/i-just-hit-dollar-100000yr-on-github-sponsors-heres-how-i-did-it , https://calebporzio.com/sponsorware

**Flagged as fabricated / do not repeat:** "demo GIFs get 40% more GitHub stars" (no source). **Flagged convention (not enforced rule):** X reply etiquette; Reddit shadowban triggers. **Flagged (non-comparable / funded):** tldraw, PostHog, Supabase, Cal.com, TLDR, Bytes, Wasp.
