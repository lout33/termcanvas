const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const os = require("node:os");
const {
  createTmuxBackend,
  splitTmuxCommands
} = (() => {
  const backend = require("../main_tmux_backend");

  return {
    ...backend,
    splitTmuxCommands: (args) => {
      const commands = [[]];

      for (const arg of args) {
        if (arg === ";") {
          commands.push([]);
        } else {
          commands.at(-1).push(arg);
        }
      }

      return commands.filter((command) => command.length > 0);
    }
  };
})();

function createPtyProcess({ autoExit = false } = {}) {
  return {
    onData: () => {},
    onExit: (listener) => {
      if (autoExit) {
        setImmediate(() => listener({ exitCode: 0, signal: 0 }));
      }
    },
    kill: () => {},
    write: () => {},
    resize: () => {}
  };
}

function createBackendHarness() {
  const calls = [];
  const ptyCalls = [];
  const sessions = new Set();
  let serverStopped = true;

  const getCommandResult = (_command, args) => {
    if (args[0] === "-V") {
      return { status: 0, stdout: "tmux 3.4\n", stderr: "" };
    }

    if (args[0] === "new-session") {
      const sessionName = args[args.indexOf("-s") + 1];
      sessions.add(sessionName);
      serverStopped = false;
      return { status: 0, stdout: "", stderr: "" };
    }

    if (args[0] === "kill-session") {
      sessions.delete(args[args.indexOf("-t") + 1]);
      serverStopped = sessions.size === 0;
      return { status: 0, stdout: "", stderr: "" };
    }

    if (args[0] === "has-session") {
      const sessionName = args[args.indexOf("-t") + 1];

      if (sessions.has(sessionName)) {
        return { status: 0, stdout: "", stderr: "" };
      }

      return serverStopped
        ? { status: 1, stdout: "", stderr: "no server running on /tmp/tmux-test/default" }
        : { status: 1, stdout: "", stderr: `can't find session: ${sessionName}` };
    }

    if (args[0] === "show-options") {
      return {
        status: 0,
        stdout: "terminal-features[0] xterm-256color:RGB:clipboard\n",
        stderr: ""
      };
    }

    if (args[0] === "display-message") {
      return { status: 0, stdout: `${os.homedir()}\n`, stderr: "" };
    }

    if (args[0] === "list-clients") {
      return { status: 0, stdout: "/dev/ttys001\n/dev/ttys002\n", stderr: "" };
    }

    return { status: 0, stdout: "", stderr: "" };
  };

  const spawnProcess = (command, args, options) => {
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    calls.push({ command, args, options });

    setImmediate(() => {
      const result = getCommandResult(command, args);

      if (result.stdout.length > 0) {
        child.stdout.emit("data", result.stdout);
      }

      if (result.stderr.length > 0) {
        child.stderr.emit("data", result.stderr);
      }

      child.emit("close", result.status);
    });

    return child;
  };
  const backend = createTmuxBackend({
    spawnProcess,
    pty: {
      spawn: (command, args, options) => {
        ptyCalls.push({ command, args, options });
        const sessionName = args[args.indexOf("-t") + 1];
        return createPtyProcess({ autoExit: sessionName.startsWith("termcanvas-probe-") });
      }
    },
    getEnvironment: () => ({ PATH: "/opt/homebrew/bin:/usr/bin", TERM: "xterm-256color" }),
    getConfigurationEnvironment: () => ({
      LANG: "en_US.UTF-8",
      LC_CTYPE: "en_US.UTF-8",
      COLORTERM: "truecolor",
      FORCE_COLOR: "3"
    }),
    resolveExistingDirectory: (candidatePath) => candidatePath,
    probeTimeoutMs: 20
  });

  return {
    backend,
    calls,
    ptyCalls,
    sessions,
    stopServer: () => {
      sessions.clear();
      serverStopped = true;
    }
  };
}

function getTmuxCommands(calls) {
  return calls
    .filter(({ command }) => command === "tmux")
    .flatMap(({ args }) => splitTmuxCommands(args));
}

function createSessionOptions(sessionKey, overrides = {}) {
  return {
    sessionKey,
    cols: 100,
    rows: 30,
    cwd: os.homedir(),
    sessionEnv: { AGENTMUX_PROJECT: "project-a" },
    ...overrides
  };
}

test("tmux creation is asynchronous and batches cached global and per-session configuration", async () => {
  const harness = createBackendHarness();
  let eventLoopAdvanced = false;
  const firstCreation = harness.backend.createClientSession(createSessionOptions("one"));

  setImmediate(() => {
    eventLoopAdvanced = true;
  });

  const first = await firstCreation;
  assert.equal(eventLoopAdvanced, true, "tmux creation should yield while child processes run");
  const second = await harness.backend.createClientSession(createSessionOptions("two"));
  const reattached = await harness.backend.createClientSession(createSessionOptions("one", {
    tmuxSessionName: "termcanvas-one",
    createIfMissing: false
  }));
  const commands = getTmuxCommands(harness.calls);
  const globalEnvironmentCommands = commands.filter((command) => (
    command[0] === "set-environment" && command[1] === "-g"
  ));
  const configuredSessionNames = commands
    .filter((command) => command[0] === "set-option" && command[1] === "-t" && command[3] === "status")
    .map((command) => command[2]);
  const sessionConfigurationInvocations = harness.calls.filter(({ command, args }) => (
    command === "tmux"
    && splitTmuxCommands(args).some((tmuxCommand) => tmuxCommand[0] === "set-option" && tmuxCommand[1] === "-t")
  ));

  assert.equal(first.tmuxSessionName, "termcanvas-one");
  assert.equal(second.tmuxSessionName, "termcanvas-two");
  assert.equal(reattached.tmuxSessionName, "termcanvas-one");
  assert.equal(commands.filter((command) => command[0] === "-V").length, 1);
  assert.equal(commands.filter((command) => command[0] === "show-options").length, 1);
  assert.equal(globalEnvironmentCommands.filter((command) => command[2] === "-u" && command[3] === "NO_COLOR").length, 1);
  assert.deepEqual(configuredSessionNames.sort(), ["termcanvas-one", "termcanvas-two"]);
  assert.equal(sessionConfigurationInvocations.length, 2, "each session should use one batched configuration invocation");
  assert.ok(sessionConfigurationInvocations.every(({ args }) => args.filter((arg) => arg === ";").length >= 6));
  assert.equal(harness.ptyCalls.filter(({ args }) => !args.at(-1).startsWith("termcanvas-probe-")).length, 3);
});

test("global tmux configuration reruns only after the server lifecycle changes", async () => {
  const harness = createBackendHarness();

  await harness.backend.createClientSession(createSessionOptions("one"));
  await harness.backend.createClientSession(createSessionOptions("two"));
  assert.equal(getTmuxCommands(harness.calls).filter((command) => command[0] === "show-options").length, 1);

  harness.stopServer();
  await harness.backend.createClientSession(createSessionOptions("three"));
  assert.equal(getTmuxCommands(harness.calls).filter((command) => command[0] === "show-options").length, 2);
});

test("tmux destroy and redraw preserve explicit session semantics", async () => {
  const harness = createBackendHarness();

  await harness.backend.createClientSession(createSessionOptions("one"));
  await harness.backend.redrawSession("termcanvas-one");
  await harness.backend.destroySession("termcanvas-one");
  const commands = getTmuxCommands(harness.calls);

  assert.equal(commands.filter((command) => command[0] === "refresh-client").length, 2);
  assert.equal(commands.filter((command) => (
    command[0] === "kill-session" && command[2] === "termcanvas-one"
  )).length, 1);
  assert.equal(harness.sessions.has("termcanvas-one"), false);
});

test("reattaching a missing tmux session fails without creating a replacement", async () => {
  const harness = createBackendHarness();

  await assert.rejects(
    harness.backend.createClientSession(createSessionOptions("missing", {
      tmuxSessionName: "termcanvas-missing",
      createIfMissing: false
    })),
    (error) => error.code === "TMUX_SESSION_MISSING"
  );
  assert.equal(
    getTmuxCommands(harness.calls).filter((command) => (
      command[0] === "new-session" && command.includes("termcanvas-missing")
    )).length,
    0
  );
});
