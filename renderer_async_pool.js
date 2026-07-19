(function exposeRendererAsyncPool(root, factory) {
  const exports = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = exports;
  } else {
    root.noteCanvasRendererAsyncPool = exports;

    if (root.window != null) {
      root.window.noteCanvasRendererAsyncPool = exports;
    }
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function createRendererAsyncPool() {
  async function mapWithConcurrency(items, concurrency, worker) {
    if (!Array.isArray(items) || items.length === 0) {
      return [];
    }

    if (typeof worker !== "function") {
      throw new TypeError("A worker function is required.");
    }

    const workerCount = Math.max(1, Math.min(items.length, Math.floor(concurrency) || 1));
    const results = new Array(items.length);
    let nextIndex = 0;

    const runWorker = async () => {
      while (nextIndex < items.length) {
        const itemIndex = nextIndex;
        nextIndex += 1;
        results[itemIndex] = await worker(items[itemIndex], itemIndex);
      }
    };

    await Promise.all(Array.from({ length: workerCount }, () => runWorker()));
    return results;
  }

  return { mapWithConcurrency };
});
