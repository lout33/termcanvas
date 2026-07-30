---
name: termcanvas-agent-sync-debugging
description: >
  Diagnose TermCanvas agentmux nodes that fail to appear and terminal canvases
  that become janky, resize repeatedly, or show corrupted/unreadable xterm text
  as terminal count grows, plus duplicate terminal views created after a release
  relaunch. Use when a child agent is missing, restored terminals duplicate or
  move to the wrong canvas, a folderless canvas stops syncing, UI or TUI redraws
  recur every few seconds, WebGL glyphs degrade, a smoke probe reports no text,
  or an accidentally deleted OpenCode terminal needs its conversation restored.
license: MIT
metadata:
  author: termcanvas
  version: "1.3"
---

# Debug TermCanvas restore, agent sync, and rendering stability

Use this workflow to identify whether the failing layer is persisted agent
identity, restore ordering, renderer polling, terminal geometry, xterm rendering,
or PTY/tmux I/O before changing lifecycle code.

**Failure pattern:** A release relaunch creates and saves duplicate terminal
views, sometimes on the wrong canvas, when agent sync races partial session
hydration. Related paths include folderless projects being skipped and periodic
renderer work changing geometry or exhausting WebGL contexts.

**Verified by:** Normalizing a real polluted release snapshot reduced 20 nodes
to 15 unique nodes; an isolated Electron relaunch restored all 15 with
`duplicateIdentities: []`. `npm run build` passed and all 249 tests passed. Prior
checks also reproduced the folderless sync mismatch, improved scoped polling
from about 0.55s to 0.20s, held 10-terminal WebGL use to 8, and preserved tail
mount height `486.4609375` and terminal size `116x27`. The deleted-session path
was verified by restoring two exact OpenCode session IDs, rebuilding their
parent chain, and observing both running tmux sessions materialize in TermCanvas.

## Procedure

### 1. Diagnose release-relaunch duplicates from the saved session

- [ ] Quit or isolate the release app before drawing conclusions from changing
  state. Inspect its persisted session first:

  ```sh
  jq '
    [.canvases[] as $canvas | $canvas.terminalNodes[]? | {
      canvasId: $canvas.id,
      canvasProjectTag: $canvas.agentProjectTag,
      sessionKey,
      tmuxSessionName,
      managedProjectTag,
      managedAgentName
    }] as $nodes
    | {
        bySessionKey: ($nodes | group_by(.sessionKey)
          | map(select(.[0].sessionKey != null and length > 1))),
        byTmuxSession: ($nodes | group_by(.tmuxSessionName)
          | map(select(.[0].tmuxSessionName != null and length > 1))),
        byProjectAgent: ($nodes | group_by([.managedProjectTag,.managedAgentName])
          | map(select(.[0].managedProjectTag != null
            and .[0].managedAgentName != null and length > 1)))
      }
  ' "$HOME/Library/Application Support/TermCanvas/app-session.json"
  ```

  Some development or older bundles use a lowercase `termcanvas` directory;
  confirm the running app's Electron `userData` path rather than assuming case.

- [ ] Treat `sessionKey`, `tmuxSessionName`, and the pair
  `(managedProjectTag, managedAgentName)` as connected identity edges. Deduplicate
  globally across all canvases, not once per canvas and not independently per
  field: transitive matches still describe one terminal view identity.

- [ ] Prefer the correctly owned node within each connected component:

  1. `managedProjectTag` matches its canvas `agentProjectTag`;
  2. its tmux name is canonical: `termcanvas-${sessionKey}`;
  3. only then use stable input order as the tie-breaker.

  Put this policy in `session_snapshot.js` normalization so every restore sees a
  safe snapshot. Test normalization on a copy; do not hand-edit live user data
  while Electron can save over it.

- [ ] Trace `restoreCanvasSession()` and `scheduleCanvasAgentSync()`. The root
  race is agent polling while canvases/nodes are only partially hydrated:

  1. set `isSessionHydrating` for the entire restore;
  2. while it is true, `scheduleCanvasAgentSync()` must not start reconciliation;
  3. finish creating every restored canvas and node;
  4. clear the flag in a guaranteed finalization path;
  5. schedule agent sync exactly once after hydration completes.

  Otherwise agent sync can materialize an agent before its saved node is
  restored, then session persistence turns the temporary duplicate into durable
  pollution—possibly under the canvas active during the partial restore.

- [ ] In `reconcileCanvasAgentProject()`, index every existing node by tmux
  session, including already-managed nodes. Matching tmux only for unmanaged
  nodes misses stale or duplicate managed views and creates another node.

- [ ] Never kill tmux to repair this failure. The duplicate records are renderer
  views that can share the same long-lived session; normalization should discard
  extra views while leaving the underlying shell alive.

### 2. Classify periodic cadence before blaming tmux

- [ ] Reproduce with enough visible terminals to expose the issue. Record
  whether the symptom repeats near either fixed renderer interval:

  - `NODE_TAIL_REFRESH_INTERVAL_MS = 4000`
  - `CANVAS_AGENT_SYNC_INTERVAL_MS = 6000`

- [ ] If a redraw or stall follows either cadence, inspect `renderer.js` timers,
  DOM writes, layout, `ResizeObserver`, and xterm fitting first. Terminal output
  routing is not the default suspect when the symptom is periodic without new
  PTY output.

- [ ] Across one tick, capture for an affected node:

  - `terminalMount.getBoundingClientRect().height`
  - `terminal.cols` and `terminal.rows`
  - whether `tail.hidden` changed
  - whether `ResizeObserver`, `FitAddon.fit()`, or `resizeTerminal()` ran

  A changing mount height links renderer layout to tmux/TUI redraws.

### 3. Keep the tail slot geometrically stable

- [ ] Inspect `.terminal-node-tail` in `styles.css`. The tail participates in a
  flex column, so hiding it must not remove it from layout. Reserve a fixed slot:

  ```css
  .terminal-node-tail {
    flex: 0 0 1.35rem;
    height: 1.35rem;
  }

  .terminal-node-tail[hidden] {
    display: block;
    visibility: hidden;
  }
  ```

  Do not use the browser default `[hidden] { display: none; }` for this element.
  Removing and restoring the tail changes the terminal mount height, which can
  trigger `ResizeObserver -> FitAddon -> terminal:resize -> tmux/TUI redraw`.

- [ ] In `updateNodeTailLine()`, set `textContent`, `title`, or `hidden` only
  when the next value differs. Keep quiet state implicit; do not write a changing
  quiet-duration label on every four-second tick.

- [ ] Verify a hidden-to-visible tail transition leaves mount height and xterm
  rows/columns unchanged. A redraw that merely makes the text look better is not
  proof that geometry is stable.

### 4. Treat WebGL contexts as a bounded resource

- [ ] When text becomes scrambled, incomplete, or unreadable only after many
  terminals are visible, inspect active xterm renderers before changing PTY or
  tmux code. Chromium can evict WebGL contexts under pressure, invalidating
  xterm glyph atlases.

- [ ] Keep `MAX_TERMINAL_WEBGL_RENDERERS` conservative; this checkout uses 8.
  Count attached addons across all canvases, attach WebGL only to connected,
  visible nodes on the active canvas, and let terminals beyond the budget use
  xterm's DOM renderer.

- [ ] For each terminal attachment, make WebGL failure sticky:

  1. initialize `isWebglRendererDisabled` to `false` when binding a fresh xterm;
  2. on context loss, set it to `true`, detach/dispose the addon, and refresh;
  3. on addon construction/load failure, set it to `true` and remain on DOM;
  4. never reattach WebGL for that attachment after either failure.

  This prevents a loss/re-attach loop. A newly bound xterm attachment may try
  WebGL again if the global budget has room.

- [ ] In an isolated multi-terminal Electron check, assert the WebGL count never
  exceeds the budget and verify every remaining terminal still renders through
  DOM. The observed 10-terminal check reported `webglCount: 8` for budget 8.

### 5. Make periodic agent sync a no-op when nothing changed

- [ ] `setTerminalNodeStatus()` and `syncTerminalMeta()` should compare current
  text, title, dataset, and ARIA values before writing. Rewriting equal strings
  still creates needless renderer work when multiplied across terminals.

- [ ] In `syncManagedNodeState()`, compare the previous managed state with the
  incoming snapshot and return whether it changed. Only schedule edge rendering
  when graph identity changes.

- [ ] In `reconcileCanvasAgentProject()`:

  - index existing nodes once by agent name and tmux session;
  - create/remove nodes in a batch;
  - redraw edges only when the node set, project tag, or edge set changed;
  - schedule attention/session persistence only when nodes, graph, or managed
    state changed.

  A quiet six-second sync must not rewrite node chrome, edges, or app-session
  state.

- [ ] At the CLI layer, `agentmux ls --project <project-tag> --json` must refresh
  only that project's sessions before querying tmux. Do not refresh every stored
  project and filter afterward.

### 6. Diagnose a missing agent from live persisted state

- [ ] On macOS, inspect the live canvas and renderer snapshots first:

  ```sh
  jq '.canvases[] | {id,name,workspace,agentProjectTag,terminalNodes}' \
    "$HOME/Library/Application Support/termcanvas/app-session.json"
  jq . "$HOME/Library/Application Support/termcanvas/canvas-snapshot.json"
  ```

  `workspace: null` is valid when `agentProjectTag` is persisted.

- [ ] Query the app-scoped database before assuming spawn failed:

  ```sh
  sqlite3 -header -column \
    "$HOME/Library/Application Support/termcanvas/agentmux/agentmux.db" \
    "select name,project,tmux_session,state,agent_state,json_extract(metadata_json,'$.parent_agent') as parent from sessions order by created_at desc;"
  ```

  If the child record exists under the canvas project, creation succeeded and
  the defect is downstream: sync gating, IPC, or renderer reconciliation.

- [ ] Confirm database identity inside the managed terminal by inspecting
  `AGENTMUX_HOME`, `AGENTMUX_BIN`, and `AGENTMUX_PROJECT`. The main service,
  terminal shell, restored tmux environment, and vendored wrapper must resolve
  the same app-scoped `AGENTMUX_HOME`. Do not mistake a legacy or development
  database for the packaged app database.

- [ ] Trace the sync gate in order:

  1. `renderer.js -> syncActiveCanvasAgentProject()` syncs when either a
     persisted project tag or workspace root exists.
  2. `main_agentmux_service.js -> syncCanvasProject()` accepts an explicit tag
     without a workspace; it derives a tag only when no tag was supplied.
  3. `reconcileCanvasAgentProject()` matches by agent name or tmux session,
     creates missing nodes, and detaches stale PTY views without killing tmux.

### 7. Recover an accidentally deleted OpenCode terminal

- [ ] First establish the failure boundary without changing live state:

  ```sh
  "$AGENTMUX_BIN" ls --json
  tmux list-sessions -F '#{session_name}'
  ```

  A forced agentmux delete removes the record, events, graph edges, and tmux
  session. If all are gone, tmux reattachment is impossible, but OpenCode's
  native conversation may still survive independently.

- [ ] Query OpenCode's durable session database by title, directory, and recency:

  ```sh
  sqlite3 -json "$HOME/.local/share/opencode/opencode.db" '
    SELECT id, title, directory, model,
           datetime(time_updated / 1000, "unixepoch", "localtime") AS updated_at
    FROM session
    WHERE lower(title) LIKE "%search terms%"
       OR lower(directory) LIKE "%project fragment%"
    ORDER BY time_updated DESC
    LIMIT 30;
  '
  ```

  Do not select by a vague title alone. Match the working directory and recent
  activity, then inspect the earliest TermCanvas briefing to recover the exact
  agent name, project tag, and original parent:

  ```sh
  sqlite3 -json "$HOME/.local/share/opencode/opencode.db" '
    SELECT s.id, s.title, substr(json_extract(p.data, "$.text"), 1, 600) AS briefing
    FROM session s
    JOIN part p ON p.session_id = s.id
    WHERE s.id = "<session-id>"
      AND json_extract(p.data, "$.type") = "text"
      AND json_extract(p.data, "$.text") LIKE "[TermCanvas] You are agent %"
    ORDER BY p.time_created ASC
    LIMIT 1;
  '
  ```

- [ ] Restore parents before children using the same app-scoped `AGENTMUX_HOME`.
  Reuse the model provider/id stored in the OpenCode row; the variant remains
  part of the native session:

  ```sh
  "$AGENTMUX_BIN" new \
    --harness opencode \
    --agent <original-agent-name> \
    --workdir <original-directory> \
    --project <original-project-tag> \
    --model <provider/model> \
    --session <session-id> \
    --no-briefing

  "$AGENTMUX_BIN" reparent <restored-agent> --parent <restored-or-live-parent>
  ```

  `--no-briefing` avoids injecting a new task into the recovered conversation.
  Reparenting restores lineage metadata, depth, and the spawn edge.

- [ ] Verify all three layers before reporting recovery:

  ```sh
  "$AGENTMUX_BIN" ls --project <project-tag> --json
  tmux has-session -t <restored-tmux-session>
  jq '[.canvases[].terminalNodes[] | select(.managedAgentName == "<agent-name>")]' \
    "$HOME/Library/Application Support/TermCanvas/app-session.json"
  ```

  The agentmux row must show the exact `external_session_id`, expected parent and
  depth, the tmux session must exist, and the renderer snapshot must contain the
  restored node. If the native OpenCode session is absent, stop: recreating a
  new conversation is not recovery and requires the user's direction.

### 8. Probe xterm correctly

- [ ] Do not use `terminalMount.textContent` to decide whether terminal output
  arrived. WebGL xterm draws to a canvas, so DOM text may be empty while the PTY,
  xterm buffer, and visible terminal are healthy.

- [ ] Read `terminal.buffer.active` line by line:

  ```js
  const buffer = nodeRecord.terminal?.buffer?.active;
  const lines = [];
  for (let row = 0; buffer != null && row < buffer.length; row += 1) {
    const line = buffer.getLine(row);
    if (line != null) lines.push(line.translateToString(true));
  }
  const terminalText = lines.join("\n");
  ```

  Use this for Electron smoke assertions and live-echo diagnostics regardless of
  renderer type.

### 9. Verify the relevant path, then the suite

- [ ] Run targeted regressions first:

  ```sh
  node --test test/terminal-rendering-stability.test.js \
    test/main-agentmux-service.test.js \
    test/agentmux-hierarchy.test.js \
    test/terminal-header-title.test.js \
    test/session-snapshot.test.js
  ```

- [ ] Then run:

  ```sh
  npm run build
  npm test
  ```

- [ ] In Electron, verify separately:

  1. start from a copied polluted snapshot and record its raw/unique counts;
  2. relaunch twice and confirm the restored count stays at the unique count;
  3. report `duplicateIdentities: []` across session, tmux, and project-agent
     identity keys, including cross-canvas matches;
  4. verify correctly owned nodes stayed on their project canvas;
  5. confirm every retained terminal still attaches to its existing tmux session;
  6. verify live echo in `terminal.buffer.active` and cwd restore/switch behavior;
  7. confirm 10 visible terminals do not exceed the WebGL budget;
  8. confirm a tail transition preserves mount height and cols/rows;
  9. confirm a persisted child materializes on a folderless canvas after sync.

  If a later smoke assertion fails outside these checkpoints, report it
  separately; do not erase the evidence from the path already exercised.

## Gotchas

- Duplicate nodes are renderer-state corruption, not necessarily duplicate shell
  processes. Preserve tmux unless a user explicitly asks to destroy the session.
- Deduplication must span all canvases. Per-canvas cleanup leaves wrong-canvas
  copies alive and allows them to be saved again.
- A blind "first node wins" rule can keep the wrong owner. Prefer project
  ownership and canonical tmux identity before falling back to source order.
- Session hydration is a transaction boundary for renderer reconciliation. A
  zero-delay scheduled sync is still unsafe if restore has not finished.
- An empty agentmux database does not clear the saved app session. Duplicates can
  already be durable in `app-session.json` even when no live agents are listed.
- A visible terminal is not necessarily DOM-rendered. Empty mount text is not an
  I/O failure under WebGL.
- A one-row fit change is enough to resize tmux and make a full-screen TUI redraw.
  Small layout shifts matter when they repeat across many terminals.
- `hidden` changes both visibility and layout by default. Override layout only
  for elements whose slot must remain reserved.
- WebGL fallback must be per attachment and sticky after context loss; otherwise
  periodic visibility/fitting work can recreate the failure loop.
- A missing parent node does not invalidate a surviving child agent. Preserve
  its parent metadata and place it independently if necessary.
- Renderer nodes are views. Detaching a stale view must not destroy its
  long-lived tmux session.
- A forced agentmux delete deliberately kills tmux and deletes its own events,
  but it does not delete OpenCode's native session database. Search that durable
  store before concluding an OpenCode conversation is lost.

## What didn't work

- Deleting duplicate tmux sessions. It is destructive and targets the shared
  shell instead of the extra renderer views.
- Indexing tmux identities only for unmanaged nodes. Already-managed stale or
  duplicate views then evade reconciliation and another view is created.
- Inspecting an empty live agentmux database alone. It misses duplicates already
  persisted in `app-session.json`, which restore can recreate without DB rows.
- Reading smoke `firstTerminalText` from `terminalMount.textContent` and treating
  an empty string as failed PTY I/O. WebGL rendered to canvas while the xterm
  buffer contained the live echo.
- Treating all periodic activity as tmux or terminal-output routing without
  inspecting the four-second tail timer, six-second sync timer, and flex layout.
- Forcing fullscreen, fit, refresh, or redraw. It temporarily masks bad geometry
  or a damaged context but leaves the trigger intact.
- Assuming a missing canvas node means the agentmux database is missing. The
  live child record existed; a folderless renderer gate skipped synchronization.
- Refreshing every stored agent before filtering by project, which makes one
  canvas pay tmux polling cost for unrelated projects.
- Trying to recover a force-deleted agent from tmux or agentmux events. Both were
  deleted by design; the surviving OpenCode `session` row and its TermCanvas
  briefing held the recoverable identity and hierarchy.
- Restoring from `app-session.json` alone. It retained node identity and titles
  but not the native OpenCode session ID needed to resume the conversation.
