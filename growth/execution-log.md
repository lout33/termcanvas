# TermCanvas growth — execution log

> Records every external/remote action. Posting mode: **drive-the-browser, Luis hits submit** for identity posts. Updated 2026-06-24.

## ✅ DONE — shipped & verified

| # | Action | Evidence |
|---|---|---|
| 1 | **MIT LICENSE added** — LICENSE file + `package.json` license field + README section. "Open source" is now legally true. | Committed `497e22a`, pushed to `main`. `node -e` confirms `license: MIT`. |
| 2 | **GitHub repo metadata upgraded** — sharper description (leads with agent-steering wedge), demo video set as homepage, +6 topics (`tmux`, `claude-code`, `agent-orchestration`, `macos`, `ai-coding`, `xterm-js`) | Verified via `gh repo view`. |
| 3 | **awesome-tmux PR submitted & OPEN** — TermCanvas added under Tools and session management | [rothgar/awesome-tmux#311](https://github.com/rothgar/awesome-tmux/pull/311) · "No conflicts, can be cleanly merged" (created via browser; CLI couldn't reach api.github.com) |
| 4 | **awesome-terminals PR submitted & OPEN** — TermCanvas added under macOS (alphabetical, alongside Warp/Wave/Terminal Workspace) | [cdleon/awesome-terminals#80](https://github.com/cdleon/awesome-terminals/pull/80) · "can be cleanly merged" · author-disclosed (created via Claude-in-Chrome) |
| 5 | **awesome-terminals-ai PR submitted & OPEN** — TermCanvas added to AI-Enhanced Terminals section (bottom, per contributing guidelines) | [BNLNPPS/awesome-terminals-ai#15](https://github.com/BNLNPPS/awesome-terminals-ai/pull/15) · "No conflicts, can be cleanly merged" · author-disclosed |

## 🔎 Channel sweep — 2026-06-25 (driven via Claude-in-Chrome)

Tested every channel I could self-execute. What worked, what's blocked, and why:

| Channel | Result | Note |
|---|---|---|
| awesome-terminals PR | ✅ **POSTED** (#80, open) | self-executed, author-disclosed |
| awesome-terminals-ai PR | ✅ **POSTED** (#15, open) | self-executed, author-disclosed |
| console.dev | ✍️ **drafted, needs your send** | email-only (hello@console.dev); outbound email = your call. Draft: `drafts/console-dev-email.md` |
| dev.to publish | 🔒 **blocked — not logged in** | redirects to login; article ready in `content/devto-launch-article.md` |
| awesome-electron | ⛔ **ineligible — skipped** | requires ≥100 stars + 30-day age; TermCanvas ~8 stars. Would auto-reject/look spammy. |
| awesome-claude-code (47k★) | ✍️ **prepared, needs YOU to submit** | strong fit ("agent orchestrators"), but rules REQUIRE human web-form submission — automating = ban risk. All field values in `drafts/awesome-claude-code-submission.md` |
| AlternativeTo | ⏸️ deferred by you | 1-week account-age gate |

## 🧭 Channel research — 2026-06-26 (Exa live search)

**Big signal: this niche is HOT right now.** Competitors **cmux**, **jmux**, **Orca** (all "run multiple coding agents in parallel") are getting active write-ups *this month* (DEV.to, blogs, aitoolnet). Demand is proven; the conversation is live — TermCanvas should be *in* it. Wedge stays: OSS + tmux-durable + commander→worker steering (cmux/jmux/Orca don't all have all three).

**Ranked channels (by real-user leverage, not vanity):**

| Rank | Channel | Why | Status |
|---|---|---|---|
| 1 | **X build-in-public thread** (demo video) | Luis's keystone/owned channel; highest-fit audience | needs his account — I draft |
| 2 | **r/ChatGPTCoding** | Most active sub *comparing* multi-agent tools (Cursor/Claude Code/cmux) — exact buyer convo | needs account/Composio login — I draft + find threads |
| 3 | **r/ClaudeAI** | Broad Claude audience moving to agentic workflows | already 1 comment posted; pace next |
| 4 | **r/LocalLLaMA** | Technical CLI-agent comparison threads | I find live threads |
| 5 | **r/commandline + r/tmux** | tmux-durability wedge lands hardest here | drafts in `drafts/` |
| 6 | AgentHub (agent-hub, GitHub sign-in) | Only directory worth it — Claude/Gemini/Codex agent registry, human-reviewed | needs his GitHub sign-in |
| — | Fushu / OpenFihris / Prompt-Frenzy / generic AI-directories | **Skipped** — SEO farms, listings not users, dilute focus | not pursuing |

**Composio-for-Reddit:** blocked — `composio` CLI is installed but **not authenticated** (`api_key: null`). Needs Luis to run `composio login` (browser auth) before I can use it to read/post Reddit. Account auth = his hands.

## ⏳ READY — needs you

| Action | What I need from you |
|---|---|
| **Submit awesome-claude-code** (60 sec, high value) | Open the form link in `drafts/awesome-claude-code-submission.md`, paste the prepared values, tick checklist, submit |
| **Send console.dev email** | Copy `drafts/console-dev-email.md` → send to hello@console.dev from your mail |
| **Log into dev.to** in this Chrome, then I publish the article | Canonical link everything else points to |
| **Create AlternativeTo account** ⏰ | 1-week age gate; sign up so it clears by launch week |
| **Reddit/X replies** | Paced (1 already posted today — space the next to tomorrow) |
| **Show HN + Product Hunt** (launch day) | Launch on a **Sunday**; coordinate same day |

## awesome-tmux PR — one click to submit
**URL:** `https://github.com/rothgar/awesome-tmux/compare/main...lout33:awesome-tmux:add-termcanvas?expand=1`
- **Suggested title:** `Add TermCanvas to Tools and session management`
- **Suggested body:**
  ```
  Adds TermCanvas — an open-source (MIT) desktop app that arranges tmux-backed
  terminal sessions as draggable nodes on an infinite canvas, for running and
  steering multiple AI coding agents. It's tmux-backed (sessions reattach from a
  plain terminal). Placed alphabetically under Tools and session management.
  Repo: https://github.com/lout33/termcanvas
  ```

## Guardrails (still enforced)
- No upvote solicitation anywhere (kills HN/PH posts).
- No drive-by promo: replies only on threads that asked, value-first, author-disclosed.
- Native per-platform copy — never the identical link blasted across subs.
- Pace Reddit/X replies (a few/day) — burst-posting identical links triggers spam filters / shadowbans.
