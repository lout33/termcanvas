function clampIndex(index, length) {
  if (!Number.isFinite(index)) {
    return 0;
  }

  return Math.min(Math.max(0, Math.trunc(index)), length);
}

function moveArrayItem(items, fromIndex, toIndex) {
  if (!Array.isArray(items)) {
    throw new Error("Expected an array of items to reorder.");
  }

  const sourceIndex = clampIndex(fromIndex, items.length - 1);
  const targetIndex = clampIndex(toIndex, items.length - 1);
  const nextItems = [...items];

  if (nextItems.length === 0) {
    return nextItems;
  }

  const [movedItem] = nextItems.splice(sourceIndex, 1);
  nextItems.splice(targetIndex, 0, movedItem);
  return nextItems;
}

module.exports = {
  moveArrayItem
};
