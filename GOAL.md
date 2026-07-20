# GOAL: Make TermCanvas simple, fast, stable, and easy to use

## Objective

Refactor TermCanvas across terminal lifecycle, rendering, agent synchronization, workspace updates, persistence, permissions, testing, and UI structure so it remains responsive and predictable with many terminals and agents.

## Known problem inventory

The goal must address all of these areas:

1. Terminal creation blocks Electron's main thread with repeated synchronous tmux commands.
2. `terminalId`, `sessionKey`, tmux session, agent identity, and visual node identity can drift apart.
3. Duplicate terminals can appear during hydration, relaunch, or agent synchronization.
4. Agent discovery depends on recurring polling and may take several seconds to display children.
5. Periodic terminal-tail and canvas-snapshot work makes the app appear to refresh while idle.
6. Every terminal on the active canvas remains mounted and processes output, including offscreen terminals.
7. WebGL and xterm rendering can become unstable with many terminals.
8. Resize observers, terminal fitting, texture clearing, and refresh calls can create rendering storms.
9. Recursive workspace events produce complete snapshots and rebuild large UI sections.
10. Unrelated file changes can recreate the file preview or editor and disturb focus.
11. Canvas, workspace, agent project, layout, and session persistence have overlapping ownership.
12. The renderer is a large global-state file mixing models, DOM, IPC, xterm, workspace, and agent behavior.
13. Terminal display title and agent identity are mixed, allowing background sync to overwrite user choices.
14. Child-agent placement must remain hierarchical, collision-free, and easy to scan.
15. Existing session data needs defensive deduplication and safe migrations.
16. macOS permissions can return after installing a new ad-hoc-signed build.
17. Agent-internal permission prompts must be distinguished from macOS permission prompts.
18. Too many tests inspect source strings instead of testing real behavior.
19. The app lacks repeatable performance and idle-stability checks.

## Target architecture

### Main process

- `ProjectRegistry`: canonical ownership of workspace, agent project, canvases, and persistence.
- `SessionRegistry`: durable sessions keyed by `sessionKey`.
- `AttachmentRegistry`: temporary renderer attachments keyed by `terminalId`.
- `TmuxBackend`: asynchronous, cached, and batched tmux operations.
- `AgentGraphService`: change-driven agent discovery and graph updates.
- `WorkspaceIndex`: lazy directory index with incremental file deltas.
- `PersistenceService`: versioned, atomic, normalized project snapshots.

### Renderer

- `ProjectStore`: plain serializable application state without DOM references.
- `CanvasViewport`: pan, zoom, visible bounds, and layout.
- `TerminalViewPool`: mounts only visible and focused xterm instances.
- `AgentGraphController`: converts agent events into model changes.
- `WorkspaceController`: applies incremental workspace changes.
- Small view modules that update only the affected DOM.

Do not add a frontend framework. Use plain JavaScript modules and explicit event/command boundaries.

## Milestone 1: Canonical terminal identity

- [x] `sessionKey` is the canonical durable terminal identity.
- [x] Temporary renderer attachments remain separately identified by `terminalId`.
- [x] Repeated or concurrent create requests cannot produce duplicate logical sessions.
- [x] Main rejects or idempotently reuses duplicate attachments.
- [x] Relaunch produces exactly one node per stable terminal identity.
- [x] Closing a node destroys its underlying session exactly once.
- [x] Closing the application preserves tmux-backed sessions.
- [x] Reopening reattaches preserved sessions without creating new tmux sessions.
- [x] Existing persisted duplicate data is migrated safely.
- [x] User-edited titles survive agent sync and relaunch.

## Milestone 2: Fast terminal creation

- [x] Terminal creation no longer runs synchronous tmux subprocesses on the main-thread hot path.
- [x] Global tmux configuration runs once per tmux-server lifecycle.
- [x] Per-session configuration runs once unless repair is necessary.
- [x] Tmux options are batched into as few invocations as practical.
- [x] Multiple restored terminals use bounded concurrent initialization.
- [x] Creating one terminal does not wait for unrelated agent synchronization.
- [x] Terminal input, output, resize, detach, destroy, and reattach semantics remain correct.

## Milestone 3: Event-driven agent synchronization

- [x] New child agents appear without waiting for a six-second polling cycle.
- [x] Agent graph mutations use filesystem, database, IPC, or explicit agentmux change events.
- [ ] Expensive pane inspection is separated from graph discovery.
- [x] Unchanged agent state produces no renderer updates or session writes.
- [x] Agent synchronization cannot run during incomplete session hydration.
- [x] Switching projects cannot apply stale synchronization results.
- [x] Parent, child, depth, and peer-edge metadata remain correct.

A low-frequency liveness check is allowed, but it must not rebuild UI or write persistence when nothing changed.

## Milestone 4: Terminal rendering and virtualization

- [ ] Only visible terminals, recently visible terminals, and the focused terminal keep mounted xterm views.
- [ ] Offscreen tmux sessions remain alive without continuously parsing renderer output.
- [ ] Revealing a suspended terminal requests a complete tmux redraw.
- [ ] The number of active accelerated terminal renderers stays within a safe limit.
- [ ] Rendering work scales with visible terminals rather than total terminals.
- [ ] Pan-only frames do not walk every node across every project.
- [ ] Terminal refreshes do not clear texture atlases unnecessarily.
- [ ] Resize events are coalesced and send IPC only when rows or columns changed.
- [ ] Terminal text remains readable after pan, zoom, resize, canvas switching, and maximize/restore.
- [ ] Thirty-terminal stress testing produces no blank, corrupted, or duplicate terminal surfaces.

## Milestone 5: Incremental workspace updates

- [ ] Workspace filesystem events produce normalized file deltas.
- [ ] Only affected tree entries are added, removed, renamed, or updated.
- [ ] Unrelated file changes do not recreate the file inspector.
- [ ] An open preview refreshes only when its file changes.
- [ ] An active editor keeps focus, cursor position, selection, scroll, and unsaved text.
- [ ] Generated or noisy directories can be ignored.
- [ ] Switching projects reuses cached workspace state instead of rebuilding all watchers.
- [ ] Workspace access remains constrained to explicitly opened roots.

## Milestone 6: Simplified product state

- [ ] Introduce one canonical `Project` aggregate for workspace root, agent project, terminal sessions, and layouts.
- [ ] Treat canvases as project views rather than independent owners of duplicated state.
- [ ] Migrate existing application sessions without losing canvases, terminals, titles, positions, or workspace state.
- [ ] Separate immutable agent identity from optional user display-name override.
- [ ] Ensure one state mutation produces one persistence action and targeted view update.
- [ ] Split the renderer into focused modules without changing the Electron security boundary.
- [ ] Remove obsolete global state and duplicated synchronization flags after migration.

## Milestone 7: Easier and predictable UI

- [ ] New child terminals appear below their parent.
- [ ] Siblings form a balanced, collision-free horizontal row.
- [ ] Deeper descendants create readable lower levels.
- [ ] Automatic placement never moves nodes the user manually positioned.
- [ ] Default terminal size remains `636 x 414` unless usability testing justifies a documented change.
- [ ] Terminal title editing saves immediately and survives relaunch.
- [ ] Agent sync never overwrites a custom title.
- [ ] Loading, reconnecting, exited, waiting, and failed states are visually distinct without flickering.
- [ ] Background updates do not steal terminal focus or move the viewport.
- [ ] Idle UI produces no recurring visible mutations.

## Milestone 8: macOS permission and release behavior

- [ ] Detect and report whether a release is ad-hoc or stably signed.
- [ ] Support a configured persistent signing identity without storing credentials in the repository.
- [ ] Preserve the bundle identifier and installation path.
- [ ] Document that stable macOS permission identity requires stable signing.
- [ ] Distinguish macOS permissions from Claude, Codex, and OpenCode internal approvals.
- [ ] Never silently launch agents with unsafe global permission-bypass flags.
- [ ] Provide explicit project-scoped trust configuration only when supported safely by the selected harness.
- [ ] Build and verify the final DMG and ZIP.

A missing Developer ID certificate is an external limitation. The implementation must still provide stable-signing support, detection, and clear instructions rather than pretending entitlements alone solve the issue.

## Milestone 9: Behavioral verification

- [ ] Replace important regex or source-inspection tests with executable behavior tests.
- [ ] Test concurrent duplicate terminal creation.
- [ ] Test two consecutive application launches against the same persisted state.
- [ ] Test title editing followed by agent sync and relaunch.
- [ ] Test child creation and hierarchical placement.
- [ ] Test a workspace file-event burst without full editor reconstruction.
- [ ] Test visible and offscreen terminal activation and redraw.
- [ ] Test terminal input, output, resize, destruction, detach, and reattachment.
- [ ] Test idle behavior for at least 30 seconds and confirm no unnecessary DOM rebuilds or persistence writes.
- [ ] Test at least 30 terminal nodes for rendering stability.
- [ ] `npm run build` passes.
- [ ] `npm test` passes.
- [ ] A focused Electron integration run passes.
- [ ] `npm run dist:mac` passes.
- [ ] The packaged application launches and completes a live-shell smoke test.

## Performance targets

- [x] A new terminal becomes interactive within one second after initial app warm-up.
- [x] A new agent child appears on the canvas within one second of registration.
- [x] Restoring 20 terminals does not block the window from becoming interactive.
- [ ] Panning and zooming remain responsive with at least 30 terminal nodes.
- [ ] The active accelerated-renderer count never exceeds its configured budget.
- [ ] Idle CPU activity is not driven by repeated full-tree, full-canvas, or persistence work.

Record measurements before and after the relevant milestones.

## Execution rules

- Work through every milestone; completing Milestone 1 is not completion of the overall goal.
- Keep the application runnable after every milestone.
- Add migrations before changing persisted schemas.
- Add or improve behavioral tests with each architectural change.
- Make a focused commit after each verified milestone.
- Preserve existing terminal sessions during development whenever possible.
- Use isolated temporary tmux sessions and temporary Electron user data for destructive tests.
- Do not perform a large renderer rewrite in one change.
- Prefer extracting seams and replacing one lifecycle at a time.

## Deny list

- Do not modify or restore `releases/v0.2.0.md`.
- Do not delete real user tmux sessions or application data.
- Do not commit generated DMG or ZIP artifacts.
- Do not add React, Vue, Svelte, or another frontend framework.
- Do not expose raw Node APIs or `ipcRenderer` through preload.
- Do not move PTY ownership into the renderer.
- Do not add global agent permission-bypass flags.
- Do not change unrelated marketing or growth files.
- Do not overwrite unrelated working-tree changes.

## Verifier

Before completion, use an independent verifier to check every applicable checkbox against the implementation and evidence. The verifier must run the complete build, unit tests, focused Electron integration tests, idle and terminal stress tests, release packaging, signature checks, and packaged live-shell smoke test. Reject completion if any milestone is skipped, evidence is missing, an important test only inspects source text, or unrelated user changes were modified.

## Completion rule

The goal is complete only when every applicable checklist item has evidence, the complete verification suite passes, the packaged app has been tested, and the independent verifier reports PASS.
