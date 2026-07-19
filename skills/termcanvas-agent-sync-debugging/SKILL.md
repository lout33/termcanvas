---
name: termcanvas-agent-sync-debugging
description: >
  Diagnose TermCanvas agentmux agents that exist but do not appear as terminal
  nodes, and investigate canvas slowdowns as agent counts grow. Use when a child
  agent is missing from a canvas, agentmux and the renderer disagree, a restored
  or folderless canvas stops syncing, or periodic agent sync causes UI stalls.
license: MIT
metadata:
  author: termcanvas
  version: "1.0"
---

# Debug TermCanvas agent sync

Use this workflow to locate the failing layer before changing tmux, agentmux,
main-process IPC, or renderer reconciliation.

**Failure pattern:** An agentmux child is present in the app database and may
still be running, but the renderer never materializes its terminal node; larger
stores also make project polling and reconciliation increasingly expensive.

**Verified by:** The live app state reproduced a child record missing from a
folderless canvas, `npm run build` passed, all 235 tests passed, and scoped
agentmux polling in the observed checkout fell from about 0.55s to 0.20s.

## Procedure

- [ ] 1. Inspect the live canvas and persisted renderer state before changing
  code. On macOS, compare:

  ```sh
  jq . "$HOME/Library/Application Support/termcanvas/canvas-snapshot.json"
  jq '.canvases[] | {id,name,workspace,agentProjectTag,terminalNodes}' \
    "$HOME/Library/Application Support/termcanvas/app-session.json"
  ```

  A `null` workspace is valid when `agentProjectTag` is already persisted.

- [ ] 2. Query the same app-scoped agentmux database the packaged app uses.
  Confirm the missing agent's project, parent, tmux session, and runtime state:

  ```sh
  sqlite3 -header -column \
    "$HOME/Library/Application Support/termcanvas/agentmux/agentmux.db" \
    "select name,project,tmux_session,state,agent_state,json_extract(metadata_json,'$.parent_agent') as parent from sessions order by created_at desc;"
  ```

  If the record exists in the canvas project, the bug is downstream of agent
  creation. Do not create a replacement child yet.

- [ ] 3. Check database identity. Inspect `AGENTMUX_HOME`, `AGENTMUX_BIN`, and
  `AGENTMUX_PROJECT` inside the managed terminal, then compare the app database
  with `vendor/agentmux/.agentmux/agentmux.db` in development. The main service,
  terminal shell, restored tmux session, and vendored wrapper must resolve the
  same `AGENTMUX_HOME`.

- [ ] 4. Trace the sync gate in this order:

  1. `renderer.js -> syncActiveCanvasAgentProject()` must sync when either a
     persisted `agentProjectTag` or a workspace root exists.
  2. `main_agentmux_service.js -> syncCanvasProject()` must accept an explicit
     project tag without requiring a workspace path; require workspace plus
     canvas id only when deriving a new tag.
  3. `reconcileCanvasAgentProject()` must match existing nodes by agent name or
     tmux session, create missing nodes, and detach stale PTY clients while
     preserving their underlying tmux sessions.

- [ ] 5. Check scaling at both layers. `agentmux ls --project ... --json` should
  refresh only sessions in that project, not every historical record. Renderer
  reconciliation should build name/tmux indexes once and batch terminal-strip
  or canvas-switcher rendering after additions/removals.

  ```sh
  /usr/bin/time -p vendor/agentmux/agentmux ls --project <project-tag> --json >/dev/null
  ```

- [ ] 6. Verify narrowly, then broadly:

  ```sh
  node --check main.js
  node --check main_agentmux_service.js
  node --check renderer.js
  python3 -m py_compile vendor/agentmux/agentmux.py
  node --test test/main-agentmux-service.test.js \
    test/agentmux-hierarchy.test.js \
    test/terminal-header-title.test.js \
    test/canvas-workspace-ipc-main.test.js
  npm run build
  npm test
  ```

  Reopen TermCanvas and allow one sync interval for an existing child to
  materialize on its canvas.

## Gotchas

- `workspace: null` does not mean the canvas has no agent project. Treat
  `agentProjectTag` as the stable graph identity.
- Renderer nodes are views. Removing one must close its renderer-to-main PTY
  attachment; preserving tmux must not leave a ghost attachment forwarding data.
- Development and packaged apps can use different database locations. Always
  establish which `AGENTMUX_HOME` the live terminal and main process use.
- A missing parent node does not invalidate a surviving child agent. Place the
  child as an unanchored/root-position node and retain its parent metadata.

## What didn't work

- Assuming the child failed to spawn because it was absent from the canvas. The
  live child record existed and was active; the renderer skipped polling because
  the canvas workspace was `null`.
- Treating the general Electron smoke script as proof of this path. Its observed
  empty-output failure used a folderless, non-agent terminal, so it did not
  execute the agentmux sync changes and must be tracked separately.
- Refreshing every stored agent before filtering by project. That made one
  canvas pay tmux polling cost for unrelated historical projects.
