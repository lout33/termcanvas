const test = require("node:test");
const assert = require("node:assert/strict");
const { mapWithConcurrency } = require("../renderer_async_pool");

test("mapWithConcurrency preserves result order while bounding active work", async () => {
  let activeWorkers = 0;
  let maximumActiveWorkers = 0;
  const values = Array.from({ length: 12 }, (_, index) => index);
  const results = await mapWithConcurrency(values, 4, async (value) => {
    activeWorkers += 1;
    maximumActiveWorkers = Math.max(maximumActiveWorkers, activeWorkers);
    await new Promise((resolve) => setTimeout(resolve, (value % 3) + 1));
    activeWorkers -= 1;
    return value * 2;
  });

  assert.deepEqual(results, values.map((value) => value * 2));
  assert.equal(maximumActiveWorkers, 4);
});

test("mapWithConcurrency handles empty input without invoking its worker", async () => {
  let invocationCount = 0;
  const results = await mapWithConcurrency([], 4, async () => {
    invocationCount += 1;
  });

  assert.deepEqual(results, []);
  assert.equal(invocationCount, 0);
});
