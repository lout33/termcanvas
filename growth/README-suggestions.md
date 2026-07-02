# TermCanvas — Discoverability & README fixes

Concrete, diff-style changes. Ordered by leverage. (None are applied — this goal only touches `growth/`. Apply these yourself or in a follow-up goal.)

## 0. 🔴 BLOCKER — add a license (do before any "open source" launch)

Verified locally: **no `LICENSE` file, no `license` field in `package.json`, no license mention in README.** Without an OSI license the project is legally "all rights reserved" — calling it "open source" is inaccurate, and it blocks r/opensource, awesome-electron, and AlternativeTo's "Open Source" tag.

- [ ] Add a top-level `LICENSE` file (MIT recommended — permissive, matches a dev tool meant for adoption).
- [ ] Add `"license": "MIT"` to `package.json`.
- [ ] Add a `## License` section to the README. Then "open source" is true everywhere.

## 1. Above-the-fold: lead with the 5-second hook + platform reality

- [ ] First line should be the sharpened one-sentence pitch (see `positioning.md`), not the current two-clause sentence.
- [ ] Add a **Requirements** line near the top, not buried: `Requires macOS on Apple Silicon (M1+).` Stating it up front builds trust; hiding it generates "doesn't work" issues.
- [ ] Move the demo GIF directly under the hook (it already exists at `docs/termcanvas-demo.gif`) — it's the single best converter.

## 2. GitHub repo metadata

- [ ] **Add repo topics** (Settings → Topics): `terminal`, `tmux`, `xterm-js`, `electron`, `infinite-canvas`, `developer-tools`, `ai-agents`, `terminal-workspace`, `macos`, `spatial-computing`. (Can be done via `gh` — own-repo, low risk.)
- [ ] **Set a repo description** matching the tagline (≤120 chars).
- [ ] **Add a social-preview image** (Settings → Social preview, 1280×640) — a clean canvas screenshot. This is what renders when the repo is shared on X/Slack/Discord; default is a blank Octocat.
- [ ] **Pin the demo YouTube video** in the README and as a repo "About" website link.

## 3. Reduce install friction (the macOS Gatekeeper flow is a drop-off point)

- [ ] The current README walks through "Open Anyway" in Privacy & Security — good. Consider a one-paragraph "Why the security prompt?" note so users trust it (unsigned/notarization status).
- [ ] If feasible later, **notarize the build** — removes the scary prompt entirely and is the biggest single install-conversion win.

## 4. Make the value legible to non-Mac visitors

- [ ] Most HN/Reddit traffic can't run a Mac-only app. Add a short **"How it works"** section with 2–3 screenshots so they get the idea (and star/share) without installing.
- [ ] Add a **comparison line** ("vs tmux / Warp / Zellij") near the top — see `competitors.md`. Visitors orient fastest against tools they already know.

## 5. Future-reach note (separate goal)

- [ ] The macOS-Apple-Silicon-only constraint is the real growth ceiling. Intel-Mac + Linux builds would unlock the Linux-heavy HN/Reddit audience. Track as its own follow-up goal, not part of this launch.
