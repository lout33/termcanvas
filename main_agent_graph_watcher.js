const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_LIVENESS_INTERVAL_MS = 30000;
const DEFAULT_DEBOUNCE_MS = 250;

function normalizeNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function createAgentGraphWatcher(options = {}) {
  let databasePath = typeof options.databasePath === "string" ? options.databasePath : null;
  const livenessIntervalMs = Number.isFinite(options.livenessIntervalMs) && options.livenessIntervalMs > 0
    ? Math.floor(options.livenessIntervalMs)
    : DEFAULT_LIVENESS_INTERVAL_MS;
  const debounceMs = Number.isFinite(options.debounceMs) && options.debounceMs >= 0
    ? Math.floor(options.debounceMs)
    : DEFAULT_DEBOUNCE_MS;
  const logger = options.logger ?? console;
  const watchedProjectTags = new Set();
  const listenersByOwner = new Map();
  let fsWatcher = null;
  let livenessTimer = null;
  let lastKnownMtime = 0;
  let lastKnownSize = 0;
  let debounceTimer = null;
  let isStarted = false;
  let isDispatching = false;

  function setDatabasePath(nextDatabasePath) {
    if (typeof nextDatabasePath !== "string" || nextDatabasePath === databasePath) {
      return;
    }
    const wasStarted = isStarted;
    if (wasStarted) {
      stop();
    }
    databasePath = nextDatabasePath;
    if (wasStarted) {
      start();
    }
  }

  function readStat() {
    if (databasePath === null) {
      return null;
    }

    try {
      return fs.statSync(databasePath);
    } catch {
      return null;
    }
  }

  function notifyListeners(changedProjectTags) {
    if (listenersByOwner.size === 0) {
      return;
    }

    const tags = changedProjectTags === null
      ? [...watchedProjectTags]
      : [...changedProjectTags].filter((tag) => watchedProjectTags.has(tag));

    if (tags.length === 0 && changedProjectTags !== null) {
      return;
    }

    const payload = {
      changedProjectTags: changedProjectTags === null ? [...watchedProjectTags] : tags,
      databaseMtime: lastKnownMtime
    };

    listenersByOwner.forEach((callback) => {
      try {
        callback(payload);
      } catch (error) {
        logger.error?.(error);
      }
    });
  }

  function scheduleDispatch(changedProjectTags) {
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
    }

    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      if (isDispatching) {
        return;
      }
      isDispatching = true;
      try {
        notifyListeners(changedProjectTags);
      } finally {
        isDispatching = false;
      }
    }, debounceMs);
    if (typeof debounceTimer.unref === "function") {
      debounceTimer.unref();
    }
  }

  function handleDatabaseChange(changedProjectTags = null) {
    const stat = readStat();
    if (stat !== null) {
      const didChange = stat.mtimeMs !== lastKnownMtime || stat.size !== lastKnownSize;
      lastKnownMtime = stat.mtimeMs;
      lastKnownSize = stat.size;
      if (changedProjectTags === null && !didChange) {
        return;
      }
    }
    scheduleDispatch(changedProjectTags);
  }

  function handleExplicitProjectTagChanged(projectTag) {
    const stat = readStat();
    if (stat !== null) {
      lastKnownMtime = stat.mtimeMs;
      lastKnownSize = stat.size;
    }
    scheduleDispatch([projectTag]);
  }

  function startFsWatcher() {
    if (fsWatcher !== null || databasePath === null) {
      return;
    }

    const directoryPath = path.dirname(databasePath);
    const targetName = path.basename(databasePath);

    try {
      fsWatcher = fs.watch(directoryPath, (eventType, filename) => {
        if (typeof filename !== "string" || filename !== targetName && filename !== `${targetName}-wal` && filename !== `${targetName}-shm`) {
          return;
        }
        handleDatabaseChange(null);
      });
      fsWatcher.on?.("error", () => {
        // Best effort: the liveness poll keeps the watcher effective.
      });
    } catch (error) {
      logger.warn?.(`agentmux db watcher failed to start: ${error.message}`);
      fsWatcher = null;
    }
  }

  function stopFsWatcher() {
    if (fsWatcher !== null) {
      try {
        fsWatcher.close();
      } catch {
        // Best effort cleanup.
      }
      fsWatcher = null;
    }
  }

  function startLivenessPoll() {
    if (livenessTimer !== null) {
      return;
    }

    livenessTimer = setInterval(() => {
      if (isDispatching || debounceTimer !== null) {
        return;
      }
      const stat = readStat();
      if (stat === null) {
        return;
      }
      if (stat.mtimeMs !== lastKnownMtime || stat.size !== lastKnownSize) {
        handleDatabaseChange(null);
      }
    }, livenessIntervalMs);
    if (typeof livenessTimer.unref === "function") {
      livenessTimer.unref();
    }
  }

  function stopLivenessPoll() {
    if (livenessTimer !== null) {
      clearInterval(livenessTimer);
      livenessTimer = null;
    }
  }

  function start() {
    if (isStarted) {
      return;
    }
    isStarted = true;
    const stat = readStat();
    if (stat !== null) {
      lastKnownMtime = stat.mtimeMs;
      lastKnownSize = stat.size;
    }
    startFsWatcher();
    startLivenessPoll();
  }

  function stop() {
    stopFsWatcher();
    stopLivenessPoll();
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    listenersByOwner.clear();
    watchedProjectTags.clear();
    isStarted = false;
  }

  function watchProjectTag(projectTag) {
    const normalizedTag = normalizeNonEmptyString(projectTag);
    if (normalizedTag === null) {
      return;
    }
    watchedProjectTags.add(normalizedTag);
  }

  function unwatchProjectTag(projectTag) {
    const normalizedTag = normalizeNonEmptyString(projectTag);
    if (normalizedTag === null) {
      return;
    }
    watchedProjectTags.delete(normalizedTag);
  }

  function registerListener(ownerWebContentsId, callback) {
    if (typeof callback !== "function") {
      return () => {};
    }
    listenersByOwner.set(ownerWebContentsId, callback);
    return () => {
      if (listenersByOwner.get(ownerWebContentsId) === callback) {
        listenersByOwner.delete(ownerWebContentsId);
      }
    };
  }

  function unregisterListener(ownerWebContentsId) {
    listenersByOwner.delete(ownerWebContentsId);
  }

  function notifyProjectTagChanged(projectTag) {
    const normalizedTag = normalizeNonEmptyString(projectTag);
    if (normalizedTag === null) {
      return;
    }
    if (!watchedProjectTags.has(normalizedTag)) {
      return;
    }
    handleExplicitProjectTagChanged(normalizedTag);
  }

  return Object.freeze({
    start,
    stop,
    setDatabasePath,
    watchProjectTag,
    unwatchProjectTag,
    registerListener,
    unregisterListener,
    notifyProjectTagChanged
  });
}

module.exports = { createAgentGraphWatcher };