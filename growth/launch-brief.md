# TermCanvas launch one

Status: prepared, not approved for publication

No post, outreach message, upload, release, deploy, commit, or account action is authorized by this document.

## Launch gate

Do not launch `v0.3.7` as if reliable OpenCode attention detection is shipped.

Launch only after all of these are true:

- the local OpenCode option-selector fix is included in a packaged build
- all 333 tests pass on the release candidate
- a clean packaged-app test reproduces the exact `select / enter confirm / esc dismiss` prompt
- the fleet summary turns amber, clicking it focuses the waiting terminal, an answer clears the state, and the agent returns to working
- the new release is public, expected to be `v0.3.8`
- README, article download link, and demo metadata point to that release

Until then, the honest public line is: `v0.3.7 can miss some opencode option selectors. the fix exists locally but is not released yet.`

## Audit

- Product: the local app and README match the peer-graph model. Any agent can spawn a child, connect to a peer, and delegate. There is no fixed commander role.
- Attention: fleet states, amber attention, click-to-focus, sidebar tree, focused-terminal mode, notifications, and dock badges exist. The OpenCode option-selector gap prevents a reliability claim for `v0.3.7`.
- Persistence: closing and reopening TermCanvas can reattach to live tmux sessions. Do not promise survival across a machine reboot or after tmux is killed externally.
- Release: `v0.3.7` is public with arm64 dmg and zip assets. Its GitHub release page has no explanatory release notes beyond the changelog.
- README: the local rewrite correctly leads with the attention problem, exact audience, requirements, unsigned status, and peer graph. A narrow `v0.3.7` detector caveat was added. Do not replace the rewrite.
- Canonical article: the local 93-line July correction is the right long-form story and preserves the April origin. A narrow detector caveat was added. The live URL still shows the old 63-word April version until the blog is deployed.
- Recording: the preferred 10:34 source is 3:19.43, 3456x2234, h264, no audio stream. It is cleaner than the 7:25.33 alternate. It shows project terminal creation, inherited agent context, child spawning, the graph/tree filling in, and a returned result. It does not show amber attention.
- Recording cleanup: the preferred source ends on the recording/OBS interface. Cut before `03:15`; never expose the final capture-control frames.

## Packaging

Title candidates:

1. `see which ai coding agent needs you`
2. `i built a cockpit because i kept checking every agent terminal`
3. `running more agents was easy. knowing where to look was not`

Pick: `see which ai coding agent needs you`

It names the job in seven words, avoids the commodity canvas claim, and remains true without pretending every possible prompt is detected.

## Target user

A developer on an Apple-silicon Mac who already runs at least three coding agents or long-lived shells at once, uses or can install tmux, and repeatedly polls terminals to find finished, failed, stale, or waiting work.

Not the target: someone trying their first coding agent, a Windows or Linux-only developer, a team seeking a hosted collaboration platform, or someone who wants agents fully unattended.

## Problem

Starting another agent is cheap. Steering several makes the human a polling loop. The developer keeps checking terminals because state and requests for judgment are scattered across tabs.

## Promise

TermCanvas keeps real tmux terminals on one spatial canvas, compresses fleet state, and takes the developer to a terminal that needs attention.

The promise is reduced polling, not autonomous management and not perfect prompt detection.

## Proof

- every node is a real interactive terminal
- the fleet summary distinguishes working, idle, done, stale, failed, and needs-input states
- amber state and click-to-focus route the user to relevant terminals
- agentmux records real spawn and peer-connection edges
- any peer can spawn, connect, and delegate with `ask`
- tmux sessions can remain alive across app relaunch and reattach
- the author uses the app on real multi-agent work
- the unreleased OpenCode selector detector test passes locally

The last point is development evidence, not released-product proof until the release gate passes. The current full run is 332/333: the product tests pass, while one README release-flow contract still expects a removed `## GitHub Releases` section.

## Objections

`why not tmux or tabs?`

tmux is the durable session layer. TermCanvas adds a visible fleet summary, attention routing, graph context, and spatial recall. If two panes still fit in your head, stay with tmux.

`why not maestri, opencove, warp, or a kanban?`

They are real alternatives. TermCanvas is open source, local, tmux-backed, and keeps the live terminal plus peer graph visible. Maestri has stronger native polish. OpenCove supports more operating systems. Warp has a funded, broader workflow. A board may be better if review throughput, not terminal attention, is the bottleneck.

`does the canvas actually help?`

It helps the author. That is one person's evidence. The launch asks experienced multi-agent developers to test it on real work and report where the map becomes noise.

`does it detect every prompt?`

No. Detection is heuristic. The release gate covers one known OpenCode selector pattern, not every prompt any agent can render.

## Honest limitations

- macos on Apple silicon only
- tmux required for managed agents and live-session reattach
- unsigned build with a Gatekeeper approval step
- solo-maintained and early
- no claim that tmux sessions survive a machine reboot
- no cross-platform promise
- no collaboration claim
- prompt detection is not universal
- the spatial thesis is still being tested

## Primary action

Install the current gated release on a real project, run at least three agents or shells, complete one workflow, and report the first moment TermCanvas gives the wrong status or still makes you poll terminals.

Stars are a secondary way to remember the repo, not the launch goal.

## Demo edit

Master output: 60 to 68 seconds, 16:9, 1440p or 1080p, silent-safe with burned-in lowercase captions. Use the native recording rather than a vertical crop for Show HN and README. Make a separate 20 to 30 second crop only for X if the terminal text remains legible.

Preferred source: `~/Desktop/Screen Recording 2026-07-28 at 10.34.07 AM.mov` (the filename contains a narrow no-break space before `AM` on disk).

Source selects:

| Output | Source | Picture | Caption |
|---|---|---|---|
| 00:00-00:04 | 02:45-03:10 | result already returned, child nodes visible | `running more agents was easy` |
| 00:04-00:10 | 00:14-00:25 | choose project, create the first terminal | `keeping track of them was the work` |
| 00:10-00:18 | 00:34-00:55 | start OpenCode and ask it to inspect its context | `every node is a real terminal` |
| 00:18-00:27 | 00:55-01:22 | inherited TermCanvas and agentmux context appears | `agents know which graph they are in` |
| 00:27-00:39 | 01:23-02:05 | request child agents; sidebar tree and graph begin to fill | `any peer can spawn and delegate` |
| 00:39-00:49 | 02:05-02:45 | move through the live tree and agent list | `spawn and connection edges stay visible` |
| 00:49-01:01 | new insert | waiting prompt, amber summary, click, answer, working | `see which agent needs you` |
| 01:01-01:06 | still from final graph | repo and constraints | `open source. macos + apple silicon + tmux.` |

Trim each source range to the action, not the waiting. Use straight cuts. One restrained 110% crop is acceptable when terminal text is otherwise too small. No zoom transitions, cursor spotlights, synthetic typing, or dramatic music.

### Missing attention insert

Record after the release candidate is packaged, not in the development build.

1. Open a clean canvas with two working agents and the fleet summary visible.
2. In OpenCode, trigger the exact option selector: `select / enter confirm / esc dismiss`.
3. Hold for one second so the prompt and amber fleet summary are readable in the same frame.
4. Click the amber fleet summary once. Do not open a separate panel. The app must focus the waiting terminal directly.
5. Choose an option and press Enter.
6. Hold until the summary leaves amber and that agent returns to working.

Target length: 10 to 15 seconds in one continuous take. Reject the take if focus is already on the waiting terminal, the amber state is not visible, a notification covers the UI, or the state clears before the click can be understood.

## What each surface does

- README: conversion and trust. Exact requirements, install steps, feature inventory, detector caveat, and current release. It should not retell the origin story.
- Yupanqui article: the durable first-person story. April origin, July correction, polling-loop realization, thesis, alternatives, and honest limits. It should not become release notes.
- Demo: visual proof. Creation, inherited context, peer spawning, live graph, returned work, then the attention loop. Minimal narration or captions.
- Show HN: technical critique and qualified installs. Lead with the problem and implementation shape, then invite hard feedback about detection and whether a spatial view beats tabs.
- X: one compressed build-in-public moment with native video. Do not summarize the README or paste a feature list.
- Selected community, r/ClaudeCode: a workflow discussion about terminal polling. One native post, one repo link, full author disclosure. Recheck current self-promo rules before posting.
- Direct touches: ask three people with demonstrated parallel-agent pain to test the narrow attention thesis. Never ask for amplification or votes.
- Product Hunt, generic directories, dev.to, multiple Reddit communities, and short-form syndication: deferred. They add coordination without improving the first qualified-feedback loop.

## Platform drafts

All copy below remains staged until Luis approves it and the release gate passes. Replace `[release]` and `[demo]` only with live URLs.

### Demo title and description

Title:

`see which ai coding agent needs you`

Description:

```text
i kept starting more coding agents, then checking the same terminals to find the one that had stopped.

termcanvas is the open-source macos app i built for that problem. every agent and shell is a real tmux terminal. the fleet summary shows what is working, done, stale, failed, or waiting, and the live peer graph shows who spawned or connected to whom.

it is early, unsigned, apple-silicon only, and maintained by one person. prompt detection is heuristic, so i want the failures too...

source and download: https://github.com/lout33/termcanvas
```

### Show HN

Title:

`show hn: termcanvas - see which ai coding agent needs you (macos)`

URL: `https://github.com/lout33/termcanvas`

First comment:

```text
i built termcanvas after i noticed that running another coding agent was easier than knowing which one had stopped.

it is an open-source macos app where every node is a real tmux terminal. agentmux gives those terminals a live peer graph, so any agent can spawn a child, connect to another peer, or delegate work. the ui compresses the fleet into working, idle, done, stale, failed, and needs-input states. clicking the amber summary focuses the next terminal that needs attention.

the narrow bet is that steering-attention is the bottleneck once you already run three or more agents. the canvas is one way to keep context, but i am not claiming it is the only one or even the right one for everyone.

honest limits: apple silicon only, unsigned, tmux required, solo maintained. prompt detection is heuristic rather than universal. sessions can reattach after the app closes, but i am not promising they survive a machine reboot.

the demo is here: [demo]

i would especially like to hear from people already running several agents. where does your current setup make you poll, and does this actually remove any of that... or just draw it?
```

Prepared replies:

```text
why electron?

the terminal and tmux behavior mattered more to me than choosing a native stack. electron is a real tradeoff here. maestri is the stronger option if native polish is your main criterion.
```

```text
why no linux or intel?

i only have a packaged and tested apple-silicon path today, and i do not want to turn a platform wish into a promise. opencove and warp are better fits if cross-platform support is required now.
```

```text
is prompt detection reliable?

not for every possible prompt. it recognizes known terminal patterns and i test concrete misses as i find them. the latest release includes the opencode option-selector case shown in the demo, but i still want bug reports with the exact prompt text.
```

Use the last reply only after the release gate passes.

### X

Post with the native 20 to 30 second cut:

```text
running several coding agents was easy.

the annoying part was checking the same terminals to find the one that had stopped...

so i built termcanvas to show the fleet state and take me straight to the agent that needs input.

macos on apple silicon. open source.
```

First reply:

```text
every node is still a real tmux terminal, and the lines come from the live peer graph underneath.

it is early and prompt detection is not universal. i need people who already run several agents to break it on real work: https://github.com/lout33/termcanvas
```

### r/ClaudeCode

Title:

`i stopped alt-tabbing through agent terminals and made the waiting one come to me`

Body:

```text
i have been running several coding agents at once, and the weird failure was not the agents. it was me checking the same terminals over and over.

one looked quiet, so i opened it. another might have finished, so i checked that too. sometimes an agent had been sitting on a question while i was looking somewhere else...

i built termcanvas around that problem. it keeps each agent as a real tmux terminal, shows a compressed fleet state, and turns the summary amber when a recognized prompt needs input or an agent fails. clicking the summary focuses the relevant terminal directly. there is no separate attention panel.

the graph is peer-based now. any agent can spawn a child, connect to another peer, and delegate. the lines on the canvas come from those real relationships.

disclosure: i am the author. it is open source, macos on apple silicon only, unsigned, and early. prompt detection is heuristic, so i am not pretending it catches everything.

i am curious where the polling loop shows up in other setups. is it waiting prompts, finished work, failures, or does a sorted terminal list already solve it for you?

https://github.com/lout33/termcanvas
```

### Exact-fit direct touches

Send only after the recipient has a public, appropriate contact path and Luis approves each send.

Stefan Hoelzl, based on his public note about running about five tasks and building idle notifications into codehydra:

```text
you wrote that launching more agents stops scaling when you lose the overview, and codehydra's idle notifications seem aimed at exactly that.

i ended up building a different take around real tmux terminals and an amber attention state. i would value the skeptical comparison: does direct focus on the waiting terminal remove anything your notification flow does not, or is the canvas extra machinery...

[demo]
```

Amrit Subramanian, based on FleetCode and his public terminal-tab/conflicting-change account:

```text
i found your fleetcode thread while trying to separate two pains i kept mixing together: agents colliding in git, and me polling terminals to see who stopped.

termcanvas only attacks the second one right now. it shows fleet state and focuses the terminal asking for attention. if you have a minute for the demo, i would rather hear where that narrow idea fails than pitch you another orchestration tool: [demo]
```

HN user `khazhoux`, based on the public comment about babysitting every Claude Code feature:

```text
your comment about babysitting every feature is the objection i keep coming back to. more agents do not help if review and intervention are already the bottleneck.

i built a small attention-routing layer over real terminals, but i do not know if that reduces the babysitting or only makes it easier to locate. if this maps to your workflow, i would value the blunt answer: [demo]
```

## Smallest launch sequence

1. Release gate: package, install, and live-test the detector fix. Record the missing insert. Publish the release only with Luis approval.
2. Canonical surfaces: update README release references and demo, deploy the expanded Yupanqui article, and verify both live. No social post yet.
3. Show HN: submit the repo and immediately add the first comment. Luis stays available for at least two hours. Never ask anyone to vote or comment.
4. Direct fit: after the HN thread is live, send at most the three approved research touches. Link the demo or repo, never the HN voting URL, and do not ask them to amplify.
5. X: post the native short cut later that day only if Luis can respond. It carries the personal polling-loop angle, not the HN technical copy.
6. Community: wait at least 24 hours. Recheck r/ClaudeCode rules and account health, then post once if allowed. Do not post to another subreddit in the same launch window.
7. Read signal at 24 hours, day 3, day 7, and day 14. Fix concrete product or install failures before adding Product Hunt, directories, or more communities.

Stop outbound distribution immediately if the packaged detector demo fails, Gatekeeper instructions are wrong, the download is broken, or the first two qualified installers hit the same blocking bug.

## Measurement

There is no verified product telemetry in the current audit. Use release-download counts as gross traffic only, never as installs or active users.

| Metric | Count only when | Evidence | Read |
|---|---|---|---|
| qualified install | a person confirms Apple silicon + tmux, opens the app, and runs at least three terminals or agents | reply, issue, or direct follow-up | day 1, 3, 7, 14 |
| completed workflow | a qualified installer finishes one real multi-agent task, including a handoff, return, or intervention | their short account of the task | day 3, 7, 14 |
| returning user | the same person reports using TermCanvas on a second day | dated follow-up | day 7 and 14 |
| substantive conversation | someone describes their agent count, current setup, polling failure, or why TermCanvas does not fit | public thread or approved direct reply | daily in week 1 |
| bug report | reproducible install, status, focus, persistence, or graph failure with enough detail to investigate | GitHub issue or copied report | immediate |
| stars | repository star count | GitHub | context only |

Launch-one success is not a star threshold. The useful outcome is five qualified installs, two completed workflows, one returning user, and at least three substantive conversations or reproducible bug reports within 14 days.

If there are clicks or release downloads but zero qualified installs, diagnose install friction before changing the headline. If installs happen but no completed workflow does, inspect onboarding and product behavior. If workflows complete but nobody returns, ask what they returned to instead.

## Launch ledger

| Item | State | Evidence / next action |
|---|---|---|
| `v0.3.7` public | live, caveated | public dmg and zip; known OpenCode selector miss |
| local detector fix | detector test passes | full suite currently 332/333 because one README release-flow documentation test is stale; packaged proof still required |
| README rewrite | ready locally | reviewed; detector caveat added; uncommitted |
| Yupanqui expansion | ready locally | reviewed; detector caveat added; uncommitted and not deployed |
| 10:34 recording | audited | preferred source; 3:19.43; no audio; cut before capture UI |
| attention insert | blocked on release candidate | record exact six-step interaction after packaging |
| final demo | planned, not edited | source map above |
| Show HN | drafted, not posted | launch gate + Luis approval |
| X | drafted, not posted | requires native short cut + Luis approval |
| r/ClaudeCode | drafted, not posted | recheck rules, wait 24h, Luis approval |
| direct touches | drafted, not sent | validate contact path + individual approval |
| Product Hunt / directories | deferred | reconsider only after qualified workflow signal |
