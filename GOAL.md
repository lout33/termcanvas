# GOAL: TermCanvas growth launch kit + safe distribution

## Objective
Produce a complete, review-ready growth launch kit for TermCanvas (competitor/positioning map, channel targets, and ready-to-post drafts) and execute only the low-risk, transparent submissions (awesome-list PRs + AlternativeTo listing) — each external post gated by explicit per-site approval.

## Context / constraints
- TermCanvas is **macOS Apple-Silicon-only** (Electron, node-pty, tmux, xterm.js). No Intel/Linux/Windows builds, no Homebrew. This caps reach on Linux-heavy channels — every launch draft must state the platform requirement up front so it builds trust instead of generating "doesn't work" backlash.
- ~8 GitHub stars, v0.2.5. Has a demo GIF (`docs/termcanvas-demo.gif`) and a YouTube demo.
- Honesty rule: **no astroturfing.** No drive-by "try this alternative" comments on third-party threads. All promotion is transparent and author-disclosed.

## Deliverables (all under `growth/`)
- `growth/competitors.md` — positioning map of ≥6 real competitors/adjacent tools (e.g. tmux, Zellij, Warp, Wave Terminal, WezTerm, Tmuxinator/Smug, iTerm2 split panes). For each: what it is, who it's for, and a one-line honest "TermCanvas differs by…" angle.
- `growth/positioning.md` — the single sharpest 1-sentence pitch + 3 differentiators, derived from the competitor map. The "spatial canvas for AI-agent orchestration" angle is the lead candidate.
- `growth/channels.md` — table of distribution targets with **exact submission URL**, audience, format/rules, and platform-fit note. Must include: Show HN, r/commandline, r/electronjs, Product Hunt, AlternativeTo, and ≥3 relevant `awesome-*` lists (awesome-electron, awesome-terminal, awesome-tuis/cli) with the exact repo + the line to add.
- `growth/drafts/` — ready-to-post copy, one file each: `show-hn.md` (title + body), `reddit-commandline.md`, `product-hunt.md`, `alternativeto.md` (tagline + description + competitor tags), `x-thread.md`. Every draft discloses the macOS-Apple-Silicon requirement and author authorship.
- `growth/README-suggestions.md` — concrete discoverability fixes (GitHub topics to add, README above-the-fold tweak, social-preview image note) as a diff-style list.

## Execution (remote-write — each gated by explicit approval before going live)
- Open PR(s) to the chosen `awesome-*` list(s) adding TermCanvas. Record PR URL(s) in `growth/execution-log.md`.
- Submit/draft the AlternativeTo listing. Record URL in `growth/execution-log.md`.
- (Optional, own-repo) Add GitHub repo topics via `gh`. Record in execution-log.

## Done condition (objectively checkable)
- [ ] `growth/competitors.md` exists, lists ≥6 competitors, each with a "TermCanvas differs by" line.
- [ ] `growth/positioning.md` exists with one headline pitch + exactly 3 differentiators.
- [ ] `growth/channels.md` exists with ≥8 rows, each having a real submission URL.
- [ ] `growth/drafts/` contains all 5 draft files; every draft mentions the macOS Apple-Silicon requirement.
- [ ] `growth/README-suggestions.md` exists with ≥5 concrete fixes.
- [ ] `growth/execution-log.md` exists; for each executed item it records a live URL (PR/listing) OR is explicitly marked "awaiting approval — not posted".
- [ ] No third-party thread received an unsolicited promo comment (verify execution-log shows only awesome-list PRs / AlternativeTo / own-repo topics).
- [ ] No file outside `growth/` and the repo's own GitHub topics was modified.

## Deny list (must NOT touch)
- Application source: `main.js`, `renderer*.js`, `preload.js`, `*_service.js`, `index.html`, `styles.css`, `package.json`, `electron-builder.yml`, `test/`, `release/`, `releases/`, `vendor/`, `node_modules/`.
- No automated posting to Hacker News, Reddit, Product Hunt, or X — those launches must come from Luis's own accounts with his timing. Agent only drafts them.
- No promotional comments on any third-party issue, thread, or discussion not owned by Luis.

## Verifier
- `goal-verifier` sub-agent: confirm each done-condition checkbox against the actual files in `growth/`; for remote items, confirm the recorded URLs resolve or are correctly marked "awaiting approval". Reject if any draft omits the platform requirement or if anything outside the allowed surface was modified.
