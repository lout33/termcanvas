# Experiment: Is the Spatial Canvas Necessary?

## Hypothesis

For steering a fleet of terminal agents, the nested terminal tree plus one focused terminal is simpler and more reliable than an infinite canvas of terminal windows.

## Prototype

- The Terminals sidebar is the primary fleet overview.
- Selecting a terminal shows it as the only terminal in the main workspace.
- The selected terminal uses the full available workspace.
- Agent spawn relationships remain visible through tree nesting.
- Explorer remains available through the existing sidebar tab.
- Opening a file replaces the terminal workspace with a full-size, read-first document view; editing is explicit and closing it returns to the selected terminal.
- Pan, zoom, dragging, resizing, notes, graph edges, and canvas selection mode are hidden.
- Terminal creation, input/output, rename, close, attention navigation, tmux persistence, and relaunch behavior continue to use the existing runtime.

This is a product experiment, not a new architecture. The existing spatial state remains intact so the branch can be discarded without migration work.

## Predictions

If the hypothesis is true:

- The next agent requiring attention can be found and entered in one action.
- The user remains oriented with ten or more agents using names, nesting, state, and attention alone.
- Most steering sessions do not require two terminal outputs to be readable simultaneously.
- The focused terminal feels calmer and easier to read than a zoomed canvas.
- Removing canvas gestures and node manipulation does not block normal work.

## Falsifiers

Reject the hypothesis if any of these happen repeatedly:

- A task requires comparing two live terminal outputs side by side.
- Spatial position is needed to remember agent purpose or work grouping.
- The nested tree becomes harder to scan than the canvas graph.
- Switching terminals loses useful context or feels slower than panning.
- Agent relationships cannot be understood without the graph edges.

If simultaneous comparison is the only failure, test an explicit two-terminal split before restoring the infinite canvas.

## Trial

Use this branch for five representative steering sessions involving at least five terminals and one parent/child agent group.

For each session record:

1. Whether more than one live terminal needed to be readable at once.
2. Whether the next terminal was found without searching the canvas.
3. Whether agent lineage remained understandable.
4. Any canvas interaction that was missed.
5. Any moment the focused layout reduced friction.

## Decision Rule

- **Keep focused mode:** at least four of five sessions complete without needing simultaneous terminals and without loss of orientation.
- **Try a two-terminal split:** comparison is needed, but freeform placement is not.
- **Keep the spatial canvas:** spatial placement or many simultaneous terminal surfaces repeatedly improve real work.
