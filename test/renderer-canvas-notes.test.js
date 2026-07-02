const test = require("node:test");
const assert = require("node:assert/strict");

const {
  DEFAULT_NOTE_WIDTH,
  DEFAULT_NOTE_HEIGHT,
  normalizeCanvasNoteRecord,
  serializeCanvasNoteRecord
} = require("../renderer_canvas_notes.js");

test("normalize keeps a valid snapshot intact", () => {
  const note = normalizeCanvasNoteRecord({ id: "n1", x: 10, y: -20, width: 300, height: 200, text: "todo" });

  assert.deepEqual(note, { id: "n1", x: 10, y: -20, width: 300, height: 200, text: "todo" });
});

test("normalize fills defaults for missing geometry and text", () => {
  const note = normalizeCanvasNoteRecord({ id: "n2" });

  assert.deepEqual(note, {
    id: "n2",
    x: 0,
    y: 0,
    width: DEFAULT_NOTE_WIDTH,
    height: DEFAULT_NOTE_HEIGHT,
    text: ""
  });
});

test("normalize generates an id when missing and a generator is provided", () => {
  const note = normalizeCanvasNoteRecord({ text: "hi" }, () => "generated");

  assert.equal(note.id, "generated");
  assert.equal(note.text, "hi");
});

test("normalize rejects unusable snapshots", () => {
  assert.equal(normalizeCanvasNoteRecord(null), null);
  assert.equal(normalizeCanvasNoteRecord("nope"), null);
  assert.equal(normalizeCanvasNoteRecord({ text: "no id, no generator" }), null);
});

test("normalize clamps tiny sizes and truncates huge text", () => {
  const note = normalizeCanvasNoteRecord({ id: "n3", width: 5, height: 5, text: "y".repeat(30000) });

  assert.equal(note.width, 140);
  assert.equal(note.height, 100);
  assert.equal(note.text.length, 20000);
});

test("serialize round-trips through normalize", () => {
  const original = { id: "n4", x: 1.5, y: 2.5, width: 260, height: 180, text: "keep me" };

  assert.deepEqual(normalizeCanvasNoteRecord(serializeCanvasNoteRecord(original)), original);
});
