---
status: awaiting_human_verify
trigger: "Debug this TermCanvas issue end-to-end using the scientific debugging workflow. User report: while navigating/panning/zooming the canvas, maximizing/full-screening terminal nodes, and switching between terminals, terminal node positions sometimes become wrong; terminal surfaces appear to occupy other nodes' positions; sometimes terminal content disappears until clicking the terminal header."
created: 2026-04-29T00:00:00Z
updated: 2026-04-29T00:40:00Z
---

## Current Focus
<!-- OVERWRITE on each update - reflects NOW -->

reasoning_checkpoint:
  hypothesis: "Switching fullscreen from terminal A to terminal B corrupts terminal A's rendered layout because setNodeMaximized unmaximizes sibling A by removing is-maximized but never restores A's inline left/top/width/height or xterm fit."
  confirming_evidence:
    - "renderer.js line 1673-1678 clears left/top/width/height for maximized nodes."
    - "renderer.js line 470-475 explicit restore removes is-maximized and calls positionNode(nodeRecord), which restores world-coordinate layout."
    - "renderer.js line 456-460 sibling fullscreen switch removes candidateRecord.isMaximized/is-maximized but does not call positionNode(candidateRecord) or sync its terminal size."
  falsification_test: "If sibling unmaximize already called positionNode/syncSize elsewhere before nodes become visible after fullscreen exit, this hypothesis would be wrong; search found no other direct positionNode(candidateRecord) path."
  fix_rationale: "Make the sibling unmaximize path use the same layout restoration and terminal size sync as explicit restore, preserving node world coordinates and xterm geometry after fullscreen terminal switches."
  blind_spots: "Intermittent xterm disappearance could also involve ResizeObserver timing under transforms, but the missing position restore is a deterministic bug directly on the reported interaction path."
next_action: wait for user to run manual Electron fullscreen/pan/terminal-switch scenario and confirm fixed or report remaining failure

## Symptoms
<!-- Written during gathering, then IMMUTABLE -->

expected: terminal nodes keep their saved world-coordinate positions while panning/zooming, maximizing/restoring, and switching focus; each xterm surface remains visible inside its own node
actual: terminal node positions sometimes become wrong; terminal surfaces sometimes appear to occupy other nodes' positions; terminal content sometimes disappears from the canvas until clicking the terminal header
errors: no explicit error message reported
reproduction: navigate/pan/zoom the canvas, maximize/full-screen some terminals, switch between terminals; issue occurs intermittently
started: unknown

## Eliminated
<!-- APPEND only - prevents re-investigating -->


## Evidence
<!-- APPEND only - facts discovered -->

- timestamp: 2026-04-29T00:10:00Z
  checked: knowledge base and initial renderer/CSS scan
  found: no debug knowledge-base.md exists; renderer.js owns viewport CSS vars and terminal node position/maximize state; styles.css transforms .nodes-layer for pan/zoom but removes that transform in .board.has-maximized-node, while .terminal-node normally uses absolute left/top plus transform: translate(-50%, -50%) and .terminal-node.is-maximized uses fixed insets plus transform:none
  implication: the bug is very likely renderer/CSS state/layout rather than PTY lifecycle; State Management and Async/Timing common patterns are candidates due intermittent wrong display and resize/focus-triggered recovery
- timestamp: 2026-04-29T00:20:00Z
  checked: renderer.js setNodeMaximized, terminal strip fullscreen switching, drag/resize/create/restore paths
  found: explicit restore (`setNodeMaximized(node,false)`) sets isMaximized=false, removes class, then calls positionNode(nodeRecord), but fullscreen switching unmaximizes any previous maximized sibling inside the loop by only setting candidateRecord.isMaximized=false and removing `is-maximized`; it never calls positionNode(candidateRecord) or schedules a terminal fit for the old node
  implication: after switching fullscreen terminals, the old node keeps the blank inline left/top/width/height that positionNode wrote for maximized mode; when fullscreen exits and muted nodes become visible again, that old node can appear at a default/static absolute position or with stale xterm geometry, matching nodes occupying wrong positions or disappearing until later interaction/layout refresh

## Resolution
<!-- OVERWRITE as understanding evolves -->

root_cause: renderer.js fullscreen terminal switching unmaximized the previously maximized sibling by clearing its maximized state/class without restoring its normal inline world-coordinate layout or refitting its xterm surface; because maximized layout had blanked left/top/width/height, later unmuting could show the old node in the wrong/default position with stale terminal geometry.
fix: In setNodeMaximized, after removing is-maximized from a previous maximized sibling, call positionNode(candidateRecord) and scheduleTerminalSizeSync([candidateRecord]) so the old node is restored to its saved coordinates and fitted back to normal size.
verification: npm run build passed; npm test passed with 127 tests
files_changed: [renderer.js]
