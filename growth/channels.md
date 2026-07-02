# TermCanvas — Distribution Channels (verified June 2026)

> All submission URLs and rules below were verified against primary sources. **TermCanvas is macOS Apple-Silicon-only** — every channel note flags where that bites. **Pre-launch blocker: add an OSI `LICENSE` (MIT) first** (see `README-suggestions.md`) — several channels and the whole "open source" framing depend on it.

## Priority sequence

1. **Add OSI `LICENSE` (MIT)** + `package.json` license field. (Unblocks "open source" framing everywhere.)
2. **Create an AlternativeTo account today** — there's a 1-week waiting period before you can submit. Start the clock now.
3. **Safe-now, zero-gate posts:** awesome-tmux PR · r/coolgithubprojects · r/SideProject · dev.to `#showdev` writeup.
4. **Curated/editorial:** console.dev email · AlternativeTo listing (once the week clears) · awesome-terminals + awesome-terminals-ai PRs.
5. **Coordinated launch day (pair them):** Show HN + Product Hunt, both leading with the macOS/Apple-Silicon caveat and the demo video.

## Channel table

| Channel | Exact submission target | Audience | Self-promo rule | Platform-fit note |
|---|---|---|---|---|
| **awesome-tmux** | PR to `github.com/rothgar/awesome-tmux` (§ *Tools and session management*) | tmux power users | PRs welcome (active, merges May 2026) | ✅ Best evergreen fit — already lists GUI front-ends + a Claude Code mgr |
| **r/coolgithubprojects** | `reddit.com/r/coolgithubprojects` | OSS-curious devs | Self-promo explicitly allowed; GitHub-hosted only | ✅ No Mac/OS/license gate |
| **r/SideProject** | `reddit.com/r/SideProject` | indie makers (~757k) | Built for launches; `[Name] - [desc]` | ✅ Big reach, no platform gate |
| **dev.to** | `dev.to/new` | web/JS devs | Own-project show-and-tell is the point | ✅ Use tag `#showdev` (+`#opensource #terminal #electron #macos`). Write the canonical writeup here, link from everywhere else |
| **r/tmux** | `reddit.com/r/tmux` | tmux users (~26k) | On-topic self-posts OK | ✅ Directly relevant (built on tmux) |
| **r/electronjs** | `reddit.com/r/electronjs` | Electron devs (~14k) | No restrictive rules | ✅ Relevant, low reach |
| **r/macapps** | `reddit.com/r/macapps` | Mac users (~235k) | Gated: 10 local karma, 1×/30d, `[OS]` prefix; else monthly Megathread | ✅ Strongest audience fit; first-timer likely lands in Megathread |
| **AlternativeTo** | Log in → user icon → "Suggest new application" (`alternativeto.net/faq/`) | tool-switchers searching for alternatives | Self-submit standard; mod-reviewed; **account needs 1-week age** | ✅ Mac is first-class. Anchor as alternative-to: **tmux** + **iTerm2** (verified), then Warp/Wave/Zellij/Tabby/Hyper. License = **Free** (NOT "Open Source" until LICENSE added) |
| **console.dev** | Email `hello@console.dev` (criteria: `console.dev/selection-criteria`) | devtools newsletter readers | Editorial, no paid reviews; pre-1.0 = label beta | ✅ v0.2.5 qualifies as beta; send a tight pitch |
| **awesome-terminals** | PR to `github.com/cdleon/awesome-terminals` (§ *Terminal Emulators → macOS*) | terminal users | PRs welcome (very active, June 2026) | ✅ Lists Electron terminals (Hyper, Tabby) already |
| **awesome-terminals-ai** | PR to `github.com/BNLNPPS/awesome-terminals-ai` | AI-terminal crowd | CONTRIBUTING says contributions wanted (slower list) | 🟡 Good thematic fit (AI-agent angle); GUI-vs-CLI mismatch |
| **Show HN** | `news.ycombinator.com/submit` (logged in) | HN front page | Posting own project = the point; **never solicit upvotes** | ⚠️ HN skews Linux/Intel — put "(macOS, Apple Silicon)" in the title, pre-empt "why not Linux?" once, lean on demo video |
| **Product Hunt** | `producthunt.com/launch` → Submit | early adopters | Personal acct; ask for feedback not upvotes; relaunch allowed after 6mo | ✅ Mac-only fine; note Apple-Silicon in description; YouTube demo as video |
| **Indie Hackers** | `indiehackers.com` | indie founders | Build-in-public story welcome | 🟡 Founder/SaaS skew; modest engagement for niche OSS |

## Entry formats (for the awesome-list PRs — copy exactly)

- **awesome-tmux** — `- [TermCanvas](https://github.com/lout33/termcanvas) Description` — **no dash before description, no trailing period.**
- **awesome-terminals** — `- [TermCanvas](https://github.com/lout33/termcanvas) - Description.` — capital start, trailing period.
- **awesome-terminals-ai** — `- [TermCanvas](https://github.com/lout33/termcanvas) - Description.` — see its CONTRIBUTING.md.

## Channels to SKIP (verified poor fit / blocked)

- **r/commandline** — Rule 2 bans GUI-only apps; Rule 5 bans <1-month/few-commit projects; Rule 6 restricts gen-AI projects. Triple clash — will likely be removed.
- **r/opensource** — Rule 4 requires an OSI LICENSE file. Blocked until you add one.
- **r/programming** — no "I made this" posts; only deep technical write-ups survive.
- **awesome-electron** — fits conceptually but **submissions are paused** by the maintainer.
- **awesome-cli-apps / awesome-tuis** — CLI/TUI-only; a GUI Electron app is out of scope.
- **Terminal Trove** — curates tools that run *inside* a terminal; install-command fields don't map to a `.dmg`. Likely rejected.
- **Lobste.rs** — invite-only + historically Electron-skeptical. High barrier, not a quick channel.

## Could-not-verify flags
- Show HN exact field labels (login-gated); timing/presence tips are community convention, not official rules.
- Product Hunt description char limit (PH docs conflict: 260 vs 500 — write ≤260 to be safe); no standalone submit URL (button-driven).
- AlternativeTo exact form URL + license/platform dropdown labels (auth-gated).
- Reddit subscriber counts approximate (API was blocked); all *rules* are primary-sourced.
