const test = require("node:test");
const assert = require("node:assert/strict");

const { moveArrayItem } = require("../list_reorder.js");

test("moveArrayItem moves an item to a new index without mutating the input", () => {
  const input = ["a", "b", "c"];

  const output = moveArrayItem(input, 2, 0);

  assert.deepEqual(output, ["c", "a", "b"]);
  assert.deepEqual(input, ["a", "b", "c"]);
});

test("moveArrayItem returns a copy when the source and target indexes are the same", () => {
  const input = ["a", "b", "c"];

  const output = moveArrayItem(input, 1, 1);

  assert.notEqual(output, input);
  assert.deepEqual(output, input);
});
