# Top Canvas Strip Design

## Goal

Move primary canvas navigation out of the left drawer and into a single centered strip at the top of the app so the user can switch between many canvases quickly.

The redesign should reduce switch cost, preserve board space, and keep canvas switching available even when a terminal is maximized.

## Product Intent

This app is for managing many canvases that each represent a project or working context.

The user should be able to glance at the top of the app, see the available canvases by name, and switch with one click.

The left drawer should stay focused on workspace browsing and file inspection support. It should no longer be the primary place where canvas switching happens.

This remains a terminal-first app:

- no heavy tab system
- no multi-row IDE chrome
- no separate canvas management screen
- no loss of board access when switching contexts quickly

## User Story

As a user, I want a one-row canvas strip at the top center of the app so I can switch between many project canvases quickly.

As a user, if I have a terminal maximized inside a canvas, I still want to see the top navigator, switch to another canvas, and have that destination canvas show its own maximized state correctly.

## Decision Summary

Recommended approach:

1. replace the sidebar canvas switcher with a top canvas strip inside the main workspace shell
2. show real canvas names as clickable pills in one horizontal row
3. use visible `<` and `>` overflow controls when not all canvases fit
4. keep create and secondary canvas actions near the strip, not inside the left drawer
5. keep the top strip visible while a terminal is maximized
6. preserve per-canvas maximized terminal state when switching canvases

This is primarily a layout and interaction redesign, not a canvas data-model rewrite.

## Scope

In scope:

- add a compact top bar for canvas navigation
- remove the left drawer as the primary owner of canvas switching
- show real canvas names in a one-row strip
- support one-click switching for visible canvases
- support overflow navigation with visible chevrons
- keep the top strip visible when a terminal is maximized
- ensure switching to another canvas restores that canvas's own maximized terminal state if present
- preserve existing canvas persistence and workspace-per-canvas behavior
- update tests and smoke checks for the new interaction model

Out of scope:

- multiple tab rows
- drag-reordering in the top strip beyond current canvas ordering behavior
- a full tab-management system with pinning or grouping
- a React rewrite
- changing the underlying terminal ownership model
- changing the persisted app-session schema unless a regression forces it

## UX Design

### App Shell Layout

The main content area should gain a compact top bar above the board.

ASCII target:

```text
+----------------------------------------------------------------------------------+
| [drawer]                     <  Alpha  Beta  Gamma  Delta  Epsilon  >  +   ...   |
+----------------------------------------------------------------------------------+
|                                                                                  |
|                                infinite canvas area                              |
|                                                                                  |
+----------------------------------------------------------------------------------+
```

Behavior:

- the strip is horizontally centered within the main workspace shell
- the strip stays to a single row
- the bar should be visually compact enough that it does not meaningfully shrink the board
- the board occupies the remaining height below the strip

The left drawer toggle can remain at the left edge of the shell, but the canvas list itself should no longer live in the drawer.

### Canvas Items

Each canvas appears as a pill-like button with its saved canvas name.

Rules:

- the active canvas is visually distinct
- inactive canvases remain directly clickable
- names may truncate with ellipsis when necessary
- the active item should remain as readable as possible within the available width
- tooltips may expose the full name when truncated, but the core interaction should not depend on hover

### Overflow Behavior

When the strip cannot show every canvas at once, visible `<` and `>` controls should appear.

Rules:

- controls appear only when overflow exists
- each control scrolls the strip by a meaningful chunk, not tiny increments
- when the active canvas changes, the strip auto-adjusts so the active item is visible
- new canvases should appear in the visible range immediately after creation

The strip may use a horizontally scrollable internal list, but the overflow affordance should be explicit through the chevrons.

### Secondary Canvas Actions

Primary switching should stay friction-free, so destructive or infrequent actions should not compete with the canvas names.

Recommended layout:

- `+` for new canvas
- `...` menu for import, export, rename, and delete

These actions should sit at the right side of the top bar. The left drawer should not duplicate the primary switcher.

### Maximized Terminal Behavior

This requirement is mandatory.

When a terminal is maximized:

- the top canvas strip remains visible
- the user can still switch canvases immediately from the strip
- switching to a different canvas should reveal that canvas's own state
- if the destination canvas has a maximized terminal, it should appear maximized
- if the destination canvas does not have a maximized terminal, it should show its normal board layout

Maximize is therefore scoped to the active canvas's board content, not to the entire application chrome.

The top strip is app chrome and must survive maximize transitions.

## Interaction Model

### Switching

- clicking a visible canvas pill switches immediately
- switching updates `activeCanvasId` through the existing renderer flow
- switching also restores that canvas's viewport, workspace binding, preview state, and visible maximize state using the current canvas session model

### Create And Import

- creating a canvas should keep the new canvas visible in the top strip
- importing a canvas should keep the imported canvas visible and switch to it immediately, matching current behavior

### Rename And Delete

- rename and delete stay available through the secondary actions menu
- deleting the active canvas should continue to fall back to the next valid canvas using existing behavior

## Architecture

### `index.html`

Add a top canvas bar inside `workspace-shell`, above the board.

Expected structure:

- left drawer toggle remains available
- centered strip container holds chevron controls and the horizontal canvas list
- right-side actions hold `+` and the secondary canvas menu

The old sidebar switcher section should be removed or reduced so it no longer presents a competing primary switching UI.

### `styles.css`

Add layout and component styles for:

- top canvas bar shell
- single-row horizontal canvas strip
- overflow controls
- active and inactive canvas pills
- compact actions area

Important no-regression rule:

The maximize styles that currently hide or mute other chrome must not hide the new top strip.

The board may still manage its own fullscreen-like presentation for the active terminal node, but that presentation must stop below the top strip.

### `renderer_canvas_switcher.js`

Keep this module responsible for deriving the canvas list view model.

It should continue to:

- normalize canvas names
- mark the active canvas
- preserve ordering rules used by the UI
- provide data for create, rename, and delete availability

It does not need to own DOM measurement or scroll math. Those concerns belong in the renderer DOM layer.

### `renderer.js`

Update renderer wiring to:

- bind the new top-strip DOM nodes
- render canvas pills into the top strip instead of the sidebar dropdown
- support overflow buttons and active-item visibility
- keep switching behavior connected to existing `setActiveCanvas()` and restore flows
- preserve the current workspace restore behavior per canvas
- keep the top strip visible when `getVisibleMaximizedNode()` is non-null

Specific constraint:

The renderer already stores maximize state per terminal node with `isMaximized`, and app-session serialization already persists it. The redesign must reuse that state instead of introducing a parallel maximize-tracking structure.

### `main.js`

Main process changes should stay minimal.

Expected work is mainly smoke-test updates that verify the new top-strip behavior.

No new filesystem or terminal IPC surface should be required for this redesign.

## State Model

No new top-level app-session concept is required.

The current persisted model already stores:

- canvas list
- `activeCanvasId`
- per-canvas viewport state
- per-canvas workspace state
- per-terminal `isMaximized`

That is sufficient for the new navigator as long as the UI renders the active canvas and respects the already-persisted maximize state.

## Error Handling And Edge Cases

- if only one canvas exists, hide overflow controls
- if no overflow exists, keep the strip static and centered
- if a canvas name is extremely long, truncate visually without breaking click targets
- if the active canvas is deleted, continue using the existing fallback-canvas behavior
- if switching occurs while a canvas has a maximized terminal, ensure the target canvas does not inherit that maximize state incorrectly
- if session restore loads a canvas with a maximized terminal, the top strip must still render and remain interactive

## Testing

### Unit Tests

Update `test/renderer-canvas-switcher.test.js` to keep validating the derived list model while removing assumptions tied to the old dropdown trigger.

Add focused coverage for:

- active canvas identification
- canvas ordering
- delete availability rules
- model stability when canvas names are long or only one canvas exists

### Renderer Tests

Add or expand renderer-facing tests for:

- top strip renders real canvas names
- switching via a top-strip button changes the active canvas
- overflow controls appear only when needed
- active canvas auto-scrolls into view after switching or creation
- top strip remains present when the active canvas has a maximized terminal
- switching from one maximized canvas to another preserves the destination canvas's own maximize state

### Smoke Tests

Update Electron smoke coverage in `main.js` to verify:

- the primary canvas navigator exists in the top bar
- the left drawer no longer owns the primary canvas switcher
- the top bar remains visible after maximizing a terminal
- canvas switching still works while maximized
- switching to a canvas with its own maximized terminal shows that maximized terminal correctly
- the board still retains most of the available vertical space below the top bar

## Acceptance Criteria

- the app shows a single-row top-centered canvas strip
- the strip uses real canvas names
- visible canvas items are one-click switches
- visible `<` and `>` controls appear when the strip overflows
- the left drawer is no longer the primary canvas-switching surface
- the top strip remains visible while a terminal is maximized
- switching canvases while maximized works without hiding the navigator
- destination canvases preserve and display their own maximized state correctly
- existing canvas persistence and workspace restore behavior continue to work
