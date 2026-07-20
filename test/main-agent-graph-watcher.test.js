const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createAgentGraphWatcher } = require("../main_agent_graph_watcher");

function createTempDatabase() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "agent-graph-watcher-"));
  const databasePath = path.join(directory, "agentmux.db");
  fs.writeFileSync(databasePath, "init");
  return { directory, databasePath };
}

function touchDatabase(databasePath, content = Date.now().toString()) {
  fs.writeFileSync(databasePath, content);
}

function waitForCondition(condition, timeoutMs = 1500) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      if (condition()) {
        resolve();
        return;
      }
      if (Date.now() - start > timeoutMs) {
        reject(new Error("condition timed out"));
        return;
      }
      setTimeout(check, 10);
    };
    check();
  });
}

test("agent graph watcher emits a change when the database file is touched", async () => {
  const { directory, databasePath } = createTempDatabase();
  const watcher = createAgentGraphWatcher({
    databasePath,
    livenessIntervalMs: 200,
    debounceMs: 20
  });
  let changedProjectTags = null;
  watcher.registerListener(1, (payload) => {
    changedProjectTags = payload.changedProjectTags;
  });
  watcher.watchProjectTag("project-a");
  watcher.start();

  try {
    touchDatabase(databasePath);
    await waitForCondition(() => changedProjectTags !== null);
    assert.deepEqual(changedProjectTags, ["project-a"]);
  } finally {
    watcher.stop();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("agent graph watcher filters change notifications by watched project tags", async () => {
  const { directory, databasePath } = createTempDatabase();
  const watcher = createAgentGraphWatcher({
    databasePath,
    livenessIntervalMs: 200,
    debounceMs: 20
  });
  let callCount = 0;
  watcher.registerListener(1, () => {
    callCount += 1;
  });
  watcher.watchProjectTag("project-a");
  watcher.start();

  try {
    watcher.notifyProjectTagChanged("project-b");
    await new Promise((resolve) => setTimeout(resolve, 60));
    assert.equal(callCount, 0);
    watcher.notifyProjectTagChanged("project-a");
    await waitForCondition(() => callCount === 1);
  } finally {
    watcher.stop();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("agent graph watcher debounces rapid database changes into one notification", async () => {
  const { directory, databasePath } = createTempDatabase();
  const watcher = createAgentGraphWatcher({
    databasePath,
    livenessIntervalMs: 500,
    debounceMs: 80
  });
  let callCount = 0;
  watcher.registerListener(1, () => {
    callCount += 1;
  });
  watcher.watchProjectTag("project-a");
  watcher.start();

  try {
    touchDatabase(databasePath, "1");
    touchDatabase(databasePath, "2");
    touchDatabase(databasePath, "3");
    await waitForCondition(() => callCount >= 1, 400);
    await new Promise((resolve) => setTimeout(resolve, 120));
    assert.equal(callCount, 1);
  } finally {
    watcher.stop();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("agent graph watcher notifies all watched tags when a filesystem event has no tag", async () => {
  const { directory, databasePath } = createTempDatabase();
  const watcher = createAgentGraphWatcher({
    databasePath,
    livenessIntervalMs: 500,
    debounceMs: 20
  });
  const seen = [];
  watcher.registerListener(1, (payload) => {
    seen.push([...payload.changedProjectTags].sort());
  });
  watcher.watchProjectTag("project-a");
  watcher.watchProjectTag("project-b");
  watcher.start();

  try {
    touchDatabase(databasePath);
    await waitForCondition(() => seen.length > 0);
    assert.deepEqual(seen[0], ["project-a", "project-b"]);
  } finally {
    watcher.stop();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("agent graph watcher stops timers and listeners on stop", async () => {
  const { directory, databasePath } = createTempDatabase();
  const watcher = createAgentGraphWatcher({
    databasePath,
    livenessIntervalMs: 100,
    debounceMs: 10
  });
  let callCount = 0;
  watcher.registerListener(1, () => {
    callCount += 1;
  });
  watcher.watchProjectTag("project-a");
  watcher.start();
  watcher.stop();

  try {
    touchDatabase(databasePath);
    await new Promise((resolve) => setTimeout(resolve, 150));
    assert.equal(callCount, 0);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});