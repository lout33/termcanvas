const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createWorkspaceActionDialogState,
  openWorkspaceActionDialog,
  closeWorkspaceActionDialog,
  getWorkspaceActionDialogSubmitValue
} = require("../renderer_action_dialog.js");

test("openWorkspaceActionDialog creates a prompt dialog with initial text", () => {
  const state = openWorkspaceActionDialog(createWorkspaceActionDialogState(), {
    kind: "prompt",
    title: "New file",
    message: "Choose a file name",
    confirmLabel: "Create",
    cancelLabel: "Cancel",
    initialValue: "untitled.txt"
  });

  assert.deepEqual(state, {
    isOpen: true,
    kind: "prompt",
    title: "New file",
    message: "Choose a file name",
    confirmLabel: "Create",
    cancelLabel: "Cancel",
    value: "untitled.txt"
  });
});

test("openWorkspaceActionDialog creates a confirm dialog without text input", () => {
  const state = openWorkspaceActionDialog(createWorkspaceActionDialogState(), {
    kind: "confirm",
    title: "Delete entry",
    message: "Delete docs/readme.md?",
    confirmLabel: "Delete",
    cancelLabel: "Keep"
  });

  assert.equal(state.isOpen, true);
  assert.equal(state.kind, "confirm");
  assert.equal(state.value, "");
});

test("openWorkspaceActionDialog preserves an explicit empty cancel label", () => {
  const state = openWorkspaceActionDialog(createWorkspaceActionDialogState(), {
    kind: "confirm",
    title: "Action failed",
    message: "No native prompt support",
    confirmLabel: "OK",
    cancelLabel: ""
  });

  assert.equal(state.cancelLabel, "");
});

test("getWorkspaceActionDialogSubmitValue trims prompt input and returns null for blank values", () => {
  assert.equal(getWorkspaceActionDialogSubmitValue({ kind: "prompt", value: "  final.md  " }), "final.md");
  assert.equal(getWorkspaceActionDialogSubmitValue({ kind: "prompt", value: "   " }), null);
  assert.equal(getWorkspaceActionDialogSubmitValue({ kind: "confirm", value: "ignored" }), true);
});

test("closeWorkspaceActionDialog resets dialog state", () => {
  const state = closeWorkspaceActionDialog({
    isOpen: true,
    kind: "prompt",
    title: "Rename",
    message: "",
    confirmLabel: "Save",
    cancelLabel: "Cancel",
    value: "draft.md"
  });

  assert.deepEqual(state, createWorkspaceActionDialogState());
});
