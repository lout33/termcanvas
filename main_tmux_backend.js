const DEFAULT_SESSION_OPTIONS = Object.freeze([
  ["status", "off"],
  ["destroy-unattached", "off"],
  ["default-terminal", "tmux-256color"],
  ["mouse", "on"],
  ["history-limit", "20000"],
  ["set-clipboard", "external"]
]);

function tmuxTerminalFeaturesInclude(value, feature) {
  if (typeof value !== "string" || value.length === 0) {
    return false;
  }

  return value.split(/\r?\n/u).some((line) => {
    const optionValue = line.replace(/^terminal-features(?:\[\d+\])?\s+/u, "").trim();
    const [terminalPattern, ...features] = optionValue.split(":");

    return (terminalPattern === "xterm-256color" || terminalPattern === "xterm*" || terminalPattern === "xterm-*")
      && features.includes(feature);
  });
}

function flattenTmuxCommands(commands) {
  return commands.flatMap((command, index) => index === 0 ? command : [";", ...command]);
}

function isTmuxSessionMissingResult(result) {
  return typeof result?.stderr === "string"
    && /(can't find session|no server running|failed to connect to server)/u.test(result.stderr);
}

function isTmuxServerMissingResult(result) {
  return typeof result?.stderr === "string"
    && /(no server running|failed to connect to server)/u.test(result.stderr);
}

function createTmuxCommandRunner({ spawnProcess, getEnvironment }) {
  if (typeof spawnProcess !== "function") {
    throw new TypeError("A child-process spawn function is required.");
  }

  return (command, args) => new Promise((resolve) => {
    let child = null;

    try {
      child = spawnProcess(command, args, {
        env: getEnvironment(),
        stdio: ["ignore", "pipe", "pipe"]
      });
    } catch (error) {
      resolve({ status: null, stdout: "", stderr: "", error });
      return;
    }

    let stdout = "";
    let stderr = "";
    let isSettled = false;

    const settle = (result) => {
      if (isSettled) {
        return;
      }

      isSettled = true;
      resolve(result);
    };

    child.stdout?.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.once("error", (error) => {
      settle({ status: null, stdout, stderr, error });
    });
    child.once("close", (status) => {
      settle({
        status: Number.isInteger(status) ? status : null,
        stdout,
        stderr,
        error: null
      });
    });
  });
}

function createTmuxBackend(options) {
  const {
    spawnProcess,
    pty,
    getEnvironment,
    getConfigurationEnvironment,
    resolveExistingDirectory,
    logger = console,
    sessionPrefix = "termcanvas",
    probeTimeoutMs = 500
  } = options;
  const runProcess = createTmuxCommandRunner({ spawnProcess, getEnvironment });
  const configuredSessions = new Set();
  let tmuxBinaryPromise = null;
  let backendAvailabilityPromise = null;
  let globalConfigurationPromise = null;
  let probeSequence = 0;

  const runKnownTmuxCommand = (tmuxBinary, args) => runProcess(tmuxBinary, args);

  const getTmuxBinary = () => {
    if (tmuxBinaryPromise === null) {
      tmuxBinaryPromise = runProcess("tmux", ["-V"]).then((result) => result.status === 0 ? "tmux" : null);
    }

    return tmuxBinaryPromise;
  };

  const resetServerCaches = () => {
    globalConfigurationPromise = null;
    configuredSessions.clear();
  };

  const ensureCommandSucceeded = (result, actionLabel) => {
    if (result?.status === 0) {
      return;
    }

    const details = typeof result?.stderr === "string" && result.stderr.trim().length > 0
      ? result.stderr.trim()
      : result?.error?.message ?? `tmux failed while trying to ${actionLabel}.`;
    throw new Error(details);
  };

  const warnIfCommandFailed = (result, actionLabel) => {
    if (result?.status === 0) {
      return;
    }

    const details = typeof result?.stderr === "string" && result.stderr.trim().length > 0
      ? result.stderr.trim()
      : result?.error?.message ?? `tmux failed while trying to ${actionLabel}.`;
    logger.warn(details);
  };

  const getConfigEnvironment = () => Object.fromEntries(
    Object.entries(getConfigurationEnvironment())
      .filter(([, value]) => typeof value === "string" && value.length > 0)
  );

  const getEnvironmentCommands = (targetArgs, environment) => [
    ["set-environment", ...targetArgs, "-u", "NO_COLOR"],
    ...Object.entries(environment).map(([name, value]) => (
      ["set-environment", ...targetArgs, name, value]
    ))
  ];

  const ensureGlobalConfiguration = (tmuxBinary) => {
    if (globalConfigurationPromise !== null) {
      return globalConfigurationPromise;
    }

    globalConfigurationPromise = (async () => {
      const featuresResult = await runKnownTmuxCommand(tmuxBinary, ["show-options", "-s", "terminal-features"]);
      const features = featuresResult.status === 0 ? featuresResult.stdout : "";
      const missingFeatures = [];

      if (!tmuxTerminalFeaturesInclude(features, "RGB")) {
        missingFeatures.push("RGB");
      }

      if (!tmuxTerminalFeaturesInclude(features, "clipboard")) {
        missingFeatures.push("clipboard");
      }

      const environmentCommands = getEnvironmentCommands(["-g"], getConfigEnvironment());
      const commands = missingFeatures.length === 0
        ? environmentCommands
        : [
          ...environmentCommands,
          ["set-option", "-s", "-a", "terminal-features", `,xterm-256color:${missingFeatures.join(":")}`]
        ];
      const configurationResult = await runKnownTmuxCommand(tmuxBinary, flattenTmuxCommands(commands));

      if (configurationResult.status === 0) {
        return;
      }

      // Older tmux releases may reject terminal-features. Keep the environment
      // repair and use the established truecolor override as a compatibility path.
      const environmentResult = await runKnownTmuxCommand(
        tmuxBinary,
        flattenTmuxCommands(environmentCommands)
      );
      ensureCommandSucceeded(environmentResult, "configure the global tmux environment");

      if (missingFeatures.includes("RGB")) {
        const overrideResult = await runKnownTmuxCommand(
          tmuxBinary,
          ["set-option", "-s", "-a", "terminal-overrides", ",xterm-256color:Tc"]
        );
        warnIfCommandFailed(overrideResult, "enable tmux truecolor support");
      }

      if (missingFeatures.includes("clipboard")) {
        logger.warn("The installed tmux version could not enable clipboard terminal features.");
      }
    })().catch((error) => {
      globalConfigurationPromise = null;
      throw error;
    });

    return globalConfigurationPromise;
  };

  const configureSession = async (tmuxBinary, sessionName, sessionEnvironment) => {
    if (configuredSessions.has(sessionName)) {
      return;
    }

    const commands = [
      ...DEFAULT_SESSION_OPTIONS.map(([name, value]) => (
        ["set-option", "-t", sessionName, name, value]
      )),
      ...getEnvironmentCommands(["-t", sessionName], sessionEnvironment)
    ];
    const result = await runKnownTmuxCommand(tmuxBinary, flattenTmuxCommands(commands));

    ensureCommandSucceeded(result, `configure tmux session ${sessionName}`);
    configuredSessions.add(sessionName);
  };

  const destroySessionWithBinary = async (tmuxBinary, sessionName) => {
    const result = await runKnownTmuxCommand(tmuxBinary, ["kill-session", "-t", sessionName]);
    configuredSessions.delete(sessionName);

    if (result.status !== 0 && !isTmuxSessionMissingResult(result)) {
      ensureCommandSucceeded(result, `close tmux session ${sessionName}`);
    }
  };

  const probePtyBackend = async (tmuxBinary, cwd) => {
    probeSequence += 1;
    const probeSessionName = `${sessionPrefix}-probe-${process.pid}-${Date.now()}-${probeSequence}`;
    const createResult = await runKnownTmuxCommand(
      tmuxBinary,
      ["new-session", "-d", "-s", probeSessionName, "-c", cwd]
    );

    if (createResult.status !== 0) {
      return false;
    }

    return new Promise((resolve) => {
      let probePty = null;
      let timeoutId = null;
      let isSettled = false;

      const settle = async (isAvailable) => {
        if (isSettled) {
          return;
        }

        isSettled = true;

        if (timeoutId !== null) {
          clearTimeout(timeoutId);
        }

        try {
          probePty?.kill();
        } catch {
          // The probe PTY may already have exited.
        }

        await destroySessionWithBinary(tmuxBinary, probeSessionName).catch(() => {});
        resetServerCaches();
        resolve(isAvailable);
      };

      try {
        probePty = pty.spawn(tmuxBinary, ["-u", "attach-session", "-t", probeSessionName], {
          name: "xterm-256color",
          cols: 80,
          rows: 24,
          cwd,
          env: getEnvironment()
        });
        probePty.onData((data) => {
          if (/server exited unexpectedly|open terminal failed|not a terminal/iu.test(data)) {
            void settle(false);
          }
        });
        probePty.onExit(({ exitCode }) => {
          void settle(exitCode === 0);
        });
        timeoutId = setTimeout(() => {
          void settle(true);
        }, probeTimeoutMs);
      } catch {
        void settle(false);
      }
    });
  };

  const getBackendAvailability = async (cwd) => {
    const tmuxBinary = await getTmuxBinary();

    if (tmuxBinary === null) {
      return false;
    }

    if (backendAvailabilityPromise === null) {
      backendAvailabilityPromise = probePtyBackend(tmuxBinary, cwd).then((isAvailable) => {
        if (!isAvailable) {
          logger.warn("tmux is installed but cannot run inside node-pty; falling back to plain shell PTYs.");
        }

        return isAvailable;
      });
    }

    return backendAvailabilityPromise;
  };

  const createClientSession = async (sessionOptions) => {
    const tmuxBinary = await getTmuxBinary();

    if (tmuxBinary === null || !await getBackendAvailability(sessionOptions.cwd)) {
      return null;
    }

    const sessionName = typeof sessionOptions.tmuxSessionName === "string" && sessionOptions.tmuxSessionName.trim().length > 0
      ? sessionOptions.tmuxSessionName.trim()
      : `${sessionPrefix}-${sessionOptions.sessionKey}`;
    const hasSessionResult = await runKnownTmuxCommand(tmuxBinary, ["has-session", "-t", sessionName]);
    const sessionAlreadyExists = hasSessionResult.status === 0;

    if (isTmuxServerMissingResult(hasSessionResult)) {
      resetServerCaches();
    }

    if (!sessionAlreadyExists && sessionOptions.createIfMissing === false) {
      const error = new Error(`tmux session '${sessionName}' is not running.`);
      error.code = "TMUX_SESSION_MISSING";
      throw error;
    }

    const sessionEnvironment = {
      ...getConfigEnvironment(),
      ...Object.fromEntries(
        Object.entries(sessionOptions.sessionEnv ?? {})
          .filter(([, value]) => typeof value === "string" && value.length > 0)
      )
    };
    let createdSession = false;

    try {
      if (!sessionAlreadyExists) {
        const environmentArgs = Object.entries(sessionEnvironment)
          .flatMap(([name, value]) => ["-e", `${name}=${value}`]);
        const createResult = await runKnownTmuxCommand(tmuxBinary, [
          "new-session",
          "-d",
          "-s",
          sessionName,
          "-c",
          sessionOptions.cwd,
          ...environmentArgs
        ]);
        ensureCommandSucceeded(createResult, `create tmux session ${sessionName}`);
        createdSession = true;
      }

      const cwdPromise = runKnownTmuxCommand(
        tmuxBinary,
        ["display-message", "-p", "-t", sessionName, "#{pane_current_path}"]
      );
      await Promise.all([
        ensureGlobalConfiguration(tmuxBinary),
        configureSession(tmuxBinary, sessionName, sessionEnvironment)
      ]);
      const cwdResult = await cwdPromise;
      const resolvedCwd = cwdResult.status === 0
        ? resolveExistingDirectory(cwdResult.stdout.trim()) ?? sessionOptions.cwd
        : sessionOptions.cwd;
      const terminalPty = pty.spawn(tmuxBinary, ["-u", "attach-session", "-t", sessionName], {
        name: "xterm-256color",
        cols: sessionOptions.cols,
        rows: sessionOptions.rows,
        cwd: sessionOptions.cwd,
        env: getEnvironment()
      });

      return {
        pty: terminalPty,
        tmuxSessionName: sessionName,
        cwd: resolvedCwd,
        createdSession
      };
    } catch (error) {
      if (createdSession) {
        await destroySessionWithBinary(tmuxBinary, sessionName).catch(() => {});
      }

      throw error;
    }
  };

  const destroySession = async (sessionName) => {
    const tmuxBinary = await getTmuxBinary();

    if (tmuxBinary !== null) {
      await destroySessionWithBinary(tmuxBinary, sessionName);
    }
  };

  const redrawSession = async (sessionName) => {
    const tmuxBinary = await getTmuxBinary();

    if (tmuxBinary === null) {
      return;
    }

    const clientsResult = await runKnownTmuxCommand(
      tmuxBinary,
      ["list-clients", "-t", sessionName, "-F", "#{client_tty}"]
    );

    if (clientsResult.status !== 0) {
      return;
    }

    const clientTtys = clientsResult.stdout
      .split("\n")
      .map((clientTty) => clientTty.trim())
      .filter((clientTty) => clientTty.length > 0);

    await Promise.all(clientTtys.map(async (clientTty) => {
      const refreshResult = await runKnownTmuxCommand(tmuxBinary, ["refresh-client", "-t", clientTty]);
      warnIfCommandFailed(refreshResult, "refresh tmux client");
    }));
  };

  return {
    createClientSession,
    destroySession,
    redrawSession
  };
}

module.exports = {
  createTmuxBackend,
  createTmuxCommandRunner,
  flattenTmuxCommands,
  isTmuxSessionMissingResult,
  tmuxTerminalFeaturesInclude
};
