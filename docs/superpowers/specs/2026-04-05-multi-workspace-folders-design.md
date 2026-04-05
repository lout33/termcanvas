# Multi-Workspace Folders Design

## Goal

Let the user import multiple folders, keep them in a list similar to canvases, and switch one active folder at a time so the folder tree, file preview, and new terminal default cwd follow the selected folder.

## Product Intent

This app remains canvas-first.

Terminal nodes remain the primary place where work happens. Imported folders exist only as a secondary observation layer so the user can inspect what terminal nodes and agents are creating.

That means the multi-folder feature should stay simple:

- one active folder at a time
- one tree at a time
- one preview target at a time
- no editor behavior

## User Story

As a user, I want to import multiple folders and switch between them from a left-panel list so I can inspect outputs from different agent workspaces while keeping the terminal canvas as the primary interface.

## Scope

In scope:

- import multiple folders into the app
- show imported folders in a selectable list similar to canvases
- keep one active folder at a time
- show the active folder tree in the existing `Folders` browser area
- make the active folder drive file preview
- make the active folder drive default cwd for newly created terminal nodes
- make the active folder drive import/export dialog default paths
- allow removing imported folders from the list
- avoid duplicate folder entries

Out of scope:

- multiple active folders
- showing several folder trees at once
- editing folder names
- persistence across relaunches
- folder grouping, nesting, or tags
- linking folders to specific canvases

## UX Design

### Left Sidebar Structure

The left sidebar becomes three stacked sections:

- `Canvases`
- `Imported Folders`
- `Folders`

`Imported Folders` is a compact list styled similarly to the canvas list.

Each row shows:

- folder name
- short path metadata
- active state
- remove action

Behavior:

- `Open Folder` adds a folder to the imported-folder list
- importing a folder that already exists re-selects it instead of duplicating it
- selecting a folder row makes it active
- removing a folder removes it from the list and stops tracking it

### Active Folder Behavior

Only one folder is active at a time.

The active folder controls:

- the folder tree rendered in the lower `Folders` browser
- the right-side preview inspector
- the default cwd for newly created terminal nodes
- the default path used by import/export dialogs

When the active folder changes:

- the tree swaps to the new folder snapshot
- the current preview is cleared
- new terminal nodes start in the new folder by default

### Removal Behavior

When removing an imported folder:

- if it is not active, remove it only from the list
- if it is active and another imported folder exists, activate the next available folder
- if it is active and no other folders remain, clear the tree, preview, and default folder-driven cwd

## Architecture

### Main Process — `main.js`

The current architecture stores one workspace directory per window. This changes to a folder registry per window.

Recommended per-window state shape:

```js
{
  importedFolders: Map<folderId, folderRecord>,
  activeFolderId: string | null
}
```

Where each `folderRecord` contains:

```js
{
  id,
  rootPath,
  rootName,
  entries,
  isTruncated,
  lastError
}
```

Responsibilities:

- import folders and deduplicate by normalized real path
- maintain one active folder per window
- keep one watcher per imported folder
- refresh folder snapshots independently
- resolve preview reads against an explicit folder id
- resolve default dialog paths from the active folder
- return plain serializable payloads only

### Preload — `preload.js`

Expose narrow folder-registry methods such as:

- `openWorkspaceDirectory()`
- `activateWorkspaceFolder(folderId)`
- `removeWorkspaceFolder(folderId)`
- `refreshWorkspaceDirectory(folderId)` or active-folder refresh
- `readWorkspaceFile(folderId, relativePath)`

The renderer still gets no raw filesystem access.

### Renderer — `renderer.js`

Replace the single workspace state with:

- imported-folder list state
- active-folder id
- per-folder expanded-directory state
- preview state scoped to the active folder

The renderer only renders the active folder tree, not all folder trees.

Recommended renderer state shape:

```js
{
  importedFolders: [],
  activeFolderId: null,
  expandedDirectoriesByFolderId: Map<folderId, Set<relativePath>>,
  preview: {
    folderId: null,
    relativePath: null,
    status: "empty" | "loading" | "ready" | "error",
    data: null,
    errorMessage: ""
  }
}
```

## Data Flow

### Import Folder

1. user clicks `Open Folder`
2. main opens dialog and resolves selected path
3. main checks whether the real path is already imported for that window
4. if already imported, main marks that folder active and returns updated workspace payload
5. if new, main creates a folder record, snapshot, watcher, and active selection
6. renderer updates folder list and active tree

### Select Folder

1. user clicks an imported-folder row
2. renderer requests `activateWorkspaceFolder(folderId)`
3. main updates active folder state and returns updated payload
4. renderer swaps tree and clears preview

### Folder Watch Updates

1. a watched folder changes on disk
2. main refreshes only that folder record
3. main emits updated workspace payload to that window
4. renderer updates the corresponding folder record
5. if the changed folder is active, the visible tree updates

### New Terminal Creation

Renderer uses the active folder root path when creating a new terminal node with no explicit cwd.

### File Preview

Renderer sends both `folderId` and `relativePath` for file preview requests.

This avoids stale preview identity bugs when switching between folders that share the same relative file paths such as `README.md` or `notes.md`.

## Error Handling

### Duplicate Imports

Importing the same folder twice should not add a second row.

Expected behavior:

- select the existing folder row
- make it active
- keep the folder list unchanged

### Unavailable Folder

If an imported folder becomes unavailable:

- keep it in the imported-folder list
- store an error on that folder record
- if it becomes active, show an error state in the tree/browser area
- allow manual removal from the list

### Active Folder Removal

Removing the active folder must always leave the renderer in a valid state.

Expected behavior:

- preview clears
- active tree swaps to fallback folder if one exists
- otherwise no active folder remains

### Preview State

Preview state is scoped to the active folder.

Switching folders clears preview selection so the app never shows stale file contents from another folder.

Expanded directory state is scoped per folder, so switching back to a previously active folder restores its expansion state for the current session.

## Security Constraints

All preview reads still resolve in the main process.

Validation requirements remain:

- resolve against the selected imported folder root
- reject traversal outside that root
- reject non-file preview targets
- reject unsupported or oversized files safely

Folder activation and removal APIs should operate only on folder ids owned by the current window.

## Testing And Verification

### Unit / Node-Level

Add tests for folder-registry behavior where practical:

- duplicate folder import resolves to existing folder instead of duplication
- removing an active folder selects the next available folder
- symlinked directories remain classified correctly in snapshots

### Smoke / Electron

Extend smoke coverage to verify:

- importing two folders adds two imported-folder rows
- selecting folder A shows folder A tree
- selecting folder B swaps tree and clears prior preview
- new terminal nodes inherit the active folder cwd
- removing the active folder falls back cleanly
- duplicate import focuses the existing folder instead of adding a second row
- existing canvas import/export and terminal smoke flow still passes

### Manual Verification

1. import folder A
2. import folder B
3. confirm both appear in `Imported Folders`
4. switch between them and confirm the tree swaps
5. open a file preview from folder A
6. switch to folder B and confirm preview clears
7. create a terminal node and confirm it starts in the active folder
8. remove the active folder and confirm fallback behavior

## Acceptance Criteria

- user can import multiple folders
- imported folders appear in a list similar to canvases
- only one imported folder is active at a time
- selecting a folder swaps the tree and preview source
- duplicate folder imports do not create duplicate rows
- removing folders works cleanly, including active-folder fallback
- new terminal nodes inherit the active folder root as default cwd
- file preview and import/export dialogs follow the active folder
- canvas-first interaction model remains intact

## Simplifying Decisions

To keep this feature small and aligned with product intent:

- imported folders are window-local only
- one active folder at a time
- one visible tree at a time
- no folder persistence yet
- no folder-to-canvas binding
- no multiple simultaneous preview contexts

## Recommended Next Step

Write an implementation plan that executes this in small steps:

1. refactor main-process workspace state from single-folder to folder registry
2. expose activation/removal IPC in preload
3. render imported-folder list in the left sidebar
4. scope tree and preview state to the active folder
5. extend smoke coverage for multi-folder switching and terminal cwd behavior
