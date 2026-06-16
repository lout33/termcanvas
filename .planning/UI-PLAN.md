# UI Plan — "Classic" layout pass (dark theme retained)

## ✅ Shipped — Phase 1 (2026-06-15)

- **Header → one row.** Terminal strip relocated inline into the primary row; added
  `project / <name>` breadcrumb (prefers workspace folder name, falls back to canvas name).
  Verified live in-app.
- **Left → "Explorer."** Renamed from "Workspace"; 6-button toolbar now VS Code-style
  hover/focus reveal (`.sidebar-section-actions-reveal`). Verified live in-app.
- **Right → CM6 code preview.** Read-only `<pre>` replaced with a syntax-highlighted CodeMirror 6
  viewer (`createCodeViewer`) for ts/js/json/css/html — line numbers + highlighting + dark theme.
  Verified via harness screenshot.
- Build + all 140 tests pass.
- Added env-gated `CANVAS_CAPTURE=<path>` screenshot hook in `main.js` (mirrors `CANVAS_SMOKE_TEST`).
- **Header v2 (2026-06-15):** reworked from a spread 3-zone grid (empty middle, stacked on narrow
  widths) into a single **left-flowing flex row** — brand → breadcrumb → canvas tabs → divider →
  terminal tabs, file actions pushed right via `margin-left:auto`. `flex-wrap:nowrap` + removed the
  stacking media query, so it never becomes two rows. Canvas-switcher box chrome dropped for a flat
  look. Updated `fluid-quiet-phosphor-styles.test.js` to assert the single-row design.
- **Still deferred to phase 2:** vertical project rail, multi-file tabs, Cmd+P quick-open.
- **Next up (per Luis):** improving the infinite canvas itself.

---



Source of truth: `.planning/1 _ Classic _ icons _ explorer _ canvas _ file (1).png`
Scope this pass: **header (2 rows → 1), left panel (Explorer), right panel (file preview).**
Decision locked: keep the current **dark** theme; adopt the mockup's **layout/IA** only.

---

## 1. The key insight (what the mockup's "one row" actually is)

The mockup is NOT one horizontal band — it's **one global app bar + three per-panel headers**.
What the user calls "two rows in our app" = our `canvas-topbar-shell` stacking
`canvas-topbar-primary-row` (brand + canvas switcher + import/export) **on top of**
`terminal-strip-topbar-section` (terminal tabs). The mockup collapses the global chrome to a
single row and pushes everything else *down into the panel each control belongs to*.

### Mockup information architecture

```
┌ GLOBAL APP BAR (one row) ─────────────────────────────────────────────────────┐
│ ▮ termcanvas   project / acme-platform        🔍   ▢left  ▢right   ○avatar      │
├──────┬──────────────────────────┬──────────────────────────┬───────────────────┤
│ rail │ Explorer        🔍 ▢     │ acme-platform · canvas    │ 📄planner.ts 📄... │  ← per-panel headers
│ A    │ ─ acme-platform ─        │      (delegation tree)    │                   │
│ D    │  ▾ src                   │      (5 agents)           │   1  import {...} │
│ M    │   ▾ agents               │                          │   2  ...          │
│ +    │     ▸ planner.ts ◀sel    │      [ canvas nodes ]     │   src/agents/...  │
└──────┴──────────────────────────┴──────────────────────────┴───────────────────┘
```

- **Far-left vertical rail** = project/canvas switcher (A / D / M / dashed `+`). This REPLACES
  our horizontal canvas strip.
- **Right-side `planner.ts · router.ts`** = the **right code panel's file tabs** — NOT terminal
  tabs. (Advisor #1 resolved: there is no terminal strip in the mockup.)
- **Center `acme-platform · canvas`** = a breadcrumb over the canvas, plus agentmux pills
  (`delegation tree`, `5 agents`) — NOT a canvas tab strip.

---

## 2. Header — element-by-element map (`index.html` + `styles.css`)

Goal: `canvas-topbar-shell` becomes **one** row. Each current element → stays / demoted / moved / removed.

| Current element | Today | Plan | Effort |
|---|---|---|---|
| `sidebar-edge-handle` (☰) | row 1 left | **Keep** — left toggle in global bar | XS |
| `canvas-brand` (logo + name) | row 1 left | **Keep** — add `project / <name>` breadcrumb beside it | S |
| `create-canvas-button` (+) | row 1 left | **Move** to the new left rail's `+` (or keep as overflow) | S |
| `canvas-switcher-section` (horizontal canvas tabs) | row 1 center | **Move** → vertical left rail (see §4b). Short-term: demote to a compact dropdown if rail is deferred | M |
| `export/import-canvas` file actions | row 1 center-right | **Demote** → overflow "⋯" menu in global bar | S |
| `canvas-topbar-spacer` | row 1 right | **Remove** (flex handles spacing) | XS |
| `terminal-strip-section` (terminal tabs, **row 2**) | row 2 | **Decision needed** — see §5.A. Default: move to a *canvas-panel header* row, not the global bar | M |

Net effect: global bar height roughly halves; `canvas-topbar-shell` loses its `display:grid`
two-child stack (`styles.css:1458`) and becomes a single flex row.

---

## 3. Left panel → "Explorer" (`#workspace-browser-section`)

Mockup left header has only **search + collapse**. Ours crams **6 icon buttons** (open / refresh /
new file / new folder / rename / delete) into `sidebar-section-actions` (`index.html:80-129`).

| Change | Detail | Effort |
|---|---|---|
| Rename label | "Workspace" → "Explorer" | XS |
| Strip the toolbar | Keep **search + collapse** in header; move file ops (new/rename/delete/refresh) to a **hover-reveal overflow `⋯` + right-click context menu** | **M** (context menu is real code, not just CSS — see §5.B) |
| Root + divider | Show `acme-platform` root label + dashed separator above the tree | S |
| Tree polish | Bigger row height, chevron + folder/file icons already partly present; selected row = soft amber highlight pill | S |

---

## 4a. Right panel → file preview (`#file-inspector`)

Good news: this is mostly **already built** — `file-inspector` already renders header, eyebrow,
title, path crumbs, type/status badges, and markdown + code editors (`renderer.js:2931+`).
So "better right panel" = **tabs + polish**, not new construction.

| Change | Detail | Effort |
|---|---|---|
| File tabs | `📄 planner.ts · 📄 router.ts` tab strip atop the inspector | **M** — requires multiple files open at once (see §5.C) |
| Line numbers | Confirm/enable in code view | S |
| Path footer | `src/agents/planner.ts` under the header (crumbs already exist) | XS |
| Spacing/typography | Match mockup density | S |

## 4b. Left rail (vertical project/canvas switcher) — **optional / phase 2**

The `A / D / M / +` rail is a new component (no equivalent today). It's where the horizontal canvas
switcher should go. Recommend as a **follow-up** so this pass stays tight, unless you want it now.

---

## 5. Decisions that change the build (need your call)

- **A. Terminal strip (current row 2).** The mockup has no terminal strip — terminals are canvas
  nodes. Options: (1) **drop it**, rely on canvas nodes; (2) **keep it** but as a slim canvas-panel
  header row (not in the global bar). *Recommendation: keep but relocate* — losing fast terminal
  switching is a usability regression.
- **B. Left file-ops.** Hover-overflow `⋯` only (cheap), OR full right-click context menu (mockup-
  faithful, more code). *Recommendation: overflow `⋯` now, context menu later.*
- **C. Right-panel tabs.** Does the inspector support multiple files open at once today, or one
  preview at a time? If one-at-a-time, multi-file tabs is a **feature**, not polish. *Recommendation:
  single-file preview now, tabs in phase 2* — keeps this pass layout-only.
- **D. Left rail.** Build the vertical A/D/M/+ rail this pass, or defer to phase 2?
  *Recommendation: defer.*

---

## 5.5 Quality bar — "VS Code / Obsidian-class" document navigation

Goal stated by Luis: feel like Zed/VS Code/Obsidian — **no lag, very easy, rock-solid doc nav.**
Reality check: Zed is Rust/GPUI (open source, GPLv3) and not embeddable here. Our stack already
has the right JS-land pieces — **CodeMirror 6** (`codemirror ^6.0.2`, today markdown-only) and
**xterm.js**. So this is a "don't regress, expose cleanly" job, not a rewrite.

Non-negotiables for the left/right panels:
- **Editor = CodeMirror 6.** Extend from markdown to code langs (`.ts/.js/.json/...`). Do NOT add
  Monaco — heavier, against the lightweight goal.
- **File tree must be virtualized** — never render every node eagerly. Verify current
  `workspace-browser` behavior at scale before polishing it.
- **Tab/file switch keeps editor state warm** — switching documents must not rebuild the editor
  from scratch (that's the lag source). Pool/keep CM6 instances.
- **Zero layout jank** — fixed panel grid, GPU-friendly transforms, no reflow when a file opens.
- **Phase 2 win:** Cmd+P fuzzy quick-open — the biggest single "feels like Zed" upgrade.

Reference (same stack): **VS Code** (MIT, Electron). Not Zed's code — its *patterns*.

## 6. Verification (per AGENTS.md)

1. `npm run build` → 2. `npm test` → 3. launch in Electron → 4. **screenshot, diff against the
mockup PNG**. Layout work is done when it *matches the reference*, not when CSS compiles.
