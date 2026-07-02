(function (root, factory) {
  const exports = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = exports;
  }

  if (root && typeof root === "object") {
    root.noteCanvasRendererCanvasNotes = exports;

    if (root.window && typeof root.window === "object") {
      root.window.noteCanvasRendererCanvasNotes = exports;
    }
  }
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const DEFAULT_NOTE_WIDTH = 260;
  const DEFAULT_NOTE_HEIGHT = 180;
  const MAX_NOTE_TEXT_LENGTH = 20000;

  function toFiniteNumber(value, fallback) {
    return Number.isFinite(value) ? value : fallback;
  }

  // Normalize a persisted/imported note snapshot into a canvas note record.
  // Returns null when the snapshot is not usable at all.
  function normalizeCanvasNoteRecord(snapshot, generateId) {
    if (snapshot == null || typeof snapshot !== "object") {
      return null;
    }

    const id = typeof snapshot.id === "string" && snapshot.id.trim().length > 0
      ? snapshot.id.trim()
      : typeof generateId === "function"
        ? generateId()
        : null;

    if (id === null) {
      return null;
    }

    const text = typeof snapshot.text === "string" ? snapshot.text.slice(0, MAX_NOTE_TEXT_LENGTH) : "";

    return {
      id,
      x: toFiniteNumber(snapshot.x, 0),
      y: toFiniteNumber(snapshot.y, 0),
      width: Math.max(140, toFiniteNumber(snapshot.width, DEFAULT_NOTE_WIDTH)),
      height: Math.max(100, toFiniteNumber(snapshot.height, DEFAULT_NOTE_HEIGHT)),
      text
    };
  }

  function serializeCanvasNoteRecord(note) {
    return {
      id: note.id,
      x: note.x,
      y: note.y,
      width: note.width,
      height: note.height,
      text: typeof note.text === "string" ? note.text : ""
    };
  }

  return {
    DEFAULT_NOTE_WIDTH,
    DEFAULT_NOTE_HEIGHT,
    normalizeCanvasNoteRecord,
    serializeCanvasNoteRecord
  };
});
