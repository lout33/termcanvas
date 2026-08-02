const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");

const repoRoot = path.join(__dirname, "..");
const agentmuxScriptPath = path.join(repoRoot, "vendor", "agentmux", "agentmux.py");

function createRestartHarness(options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "termcanvas-agentmux-restart-"));
  const binPath = path.join(root, "bin");
  const homePath = path.join(root, "home");
  const workspacePath = path.join(root, "workspace");
  const stateFilePath = path.join(root, "sessions.json");
  const tmuxLogPath = path.join(root, "tmux.log");
  const panePid = options.panePid ?? "";
  const psTable = options.psTable ?? "";
  const paneText = options.paneText ?? "$\n";
  const paneTitle = options.paneTitle ?? "";
  const paneTitleAfterRestart = options.paneTitleAfterRestart ?? paneTitle;
  const paneCommand = options.paneCommand ?? "";
  const dropRestartedSession = options.dropRestartedSession === true;
  const xdgDataHomePath = path.join(root, "data");
  const titleStatePath = path.join(root, "title-state.txt");

  fs.mkdirSync(binPath, { recursive: true });
  fs.mkdirSync(homePath, { recursive: true });
  fs.mkdirSync(workspacePath, { recursive: true });
  fs.writeFileSync(stateFilePath, "[]", "utf8");
  fs.writeFileSync(
    path.join(binPath, "tmux"),
    [
      "#!/usr/bin/env node",
      "const fs = require('node:fs');",
      "const args = process.argv.slice(2);",
      "if (process.env.FAKE_TMUX_LOG) {",
      "  fs.appendFileSync(process.env.FAKE_TMUX_LOG, `${JSON.stringify(args)}\\n`, 'utf8');",
      "}",
      "const statePath = process.env.FAKE_TMUX_STATE;",
      "const read = () => { try { return JSON.parse(fs.readFileSync(statePath, 'utf8')); } catch { return []; } };",
      "const write = (value) => fs.writeFileSync(statePath, JSON.stringify(value));",
      "if (args[0] === 'new-session') {",
      "  const index = args.indexOf('-s');",
      "  const name = args[index + 1];",
      "  const sessions = read();",
      "  const opencodeIndex = args.indexOf('opencode');",
      "  const sessionFlagIndex = args.indexOf('-s', opencodeIndex);",
      "  const dropSession = process.env.FAKE_TMUX_DROP_RESTARTED_SESSION === '1' && sessionFlagIndex > opencodeIndex;",
      "  if (sessionFlagIndex > opencodeIndex && process.env.FAKE_TMUX_TITLE_STATE) fs.writeFileSync(process.env.FAKE_TMUX_TITLE_STATE, 'restarted');",
      "  if (!dropSession && !sessions.includes(name)) sessions.push(name);",
      "  write(sessions);",
      "  process.exit(0);",
      "}",
      "if (args[0] === 'kill-session') {",
      "  const index = args.indexOf('-t');",
      "  const name = args[index + 1];",
      "  write(read().filter((entry) => entry !== name));",
      "  process.exit(0);",
      "}",
      "if (args[0] === 'has-session') {",
      "  const index = args.indexOf('-t');",
      "  const name = args[index + 1];",
      "  process.exit(read().includes(name) ? 0 : 1);",
      "}",
      "if (args[0] === 'capture-pane') {",
      "  process.stdout.write(process.env.FAKE_TMUX_PANE_TEXT ?? '$\\n');",
      "  process.exit(0);",
      "}",
      "if (args[0] === 'display-message') {",
      "  const format = args[args.length - 1];",
      "  const restarted = process.env.FAKE_TMUX_TITLE_STATE && fs.existsSync(process.env.FAKE_TMUX_TITLE_STATE);",
      "  if (format === '#{pane_title}') process.stdout.write(restarted ? (process.env.FAKE_TMUX_PANE_TITLE_AFTER_RESTART ?? '') : (process.env.FAKE_TMUX_PANE_TITLE ?? ''));",
      "  if (format === '#{pane_current_command}') process.stdout.write(process.env.FAKE_TMUX_PANE_COMMAND ?? '');",
      "  process.exit(0);",
      "}",
      "if (args[0] === 'list-panes' && args.includes('-F')) {",
      "  process.stdout.write((process.env.FAKE_TMUX_PANE_PID ?? '') + '\\n');",
      "  process.exit(0);",
      "}",
      "if (args[0] === 'list-panes' || args[0] === 'list-sessions') {",
      "  process.exit(1);",
      "}",
      "process.exit(0);",
      ""
    ].join("\n"),
    { mode: 0o755 }
  );
  fs.writeFileSync(
    path.join(binPath, "ps"),
    [
      "#!/usr/bin/env node",
      "process.stdout.write(process.env.FAKE_PS_TABLE ?? '');",
      ""
    ].join("\n"),
    { mode: 0o755 }
  );

  const run = (args, env = {}) => spawnSync("python3", [agentmuxScriptPath, ...args], {
    cwd: workspacePath,
    encoding: "utf8",
    env: {
      ...process.env,
      AGENTMUX_HOME: homePath,
      PATH: `${binPath}${path.delimiter}${process.env.PATH ?? ""}`,
      FAKE_TMUX_LOG: tmuxLogPath,
      FAKE_TMUX_STATE: stateFilePath,
      FAKE_TMUX_PANE_PID: panePid,
      FAKE_TMUX_PANE_TEXT: paneText,
      FAKE_TMUX_PANE_TITLE: paneTitle,
      FAKE_TMUX_PANE_TITLE_AFTER_RESTART: paneTitleAfterRestart,
      FAKE_TMUX_TITLE_STATE: titleStatePath,
      FAKE_TMUX_PANE_COMMAND: paneCommand,
      FAKE_TMUX_DROP_RESTARTED_SESSION: dropRestartedSession ? "1" : "0",
      FAKE_PS_TABLE: psTable,
      XDG_DATA_HOME: xdgDataHomePath,
      SHELL: "/bin/sh",
      ...env
    }
  });
  const readTmuxCalls = () => {
    if (!fs.existsSync(tmuxLogPath)) {
      return [];
    }
    return fs.readFileSync(tmuxLogPath, "utf8")
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  };
  const readSessions = () => JSON.parse(fs.readFileSync(stateFilePath, "utf8"));

  return {
    root,
    binPath,
    homePath,
    workspacePath,
    xdgDataHomePath,
    run,
    readTmuxCalls,
    readSessions,
    readProjectPayload(project = "proj") {
      const result = run(["ls", "--project", project, "--json"]);
      assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
      return JSON.parse(result.stdout);
    },
    cleanup() {
      fs.rmSync(root, { recursive: true, force: true });
    }
  };
}

function writeOpenCodeDatabase(harness, sessions) {
  const databasePath = path.join(harness.xdgDataHomePath, "opencode", "opencode.db");
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  const normalizedSessions = sessions.map((session) => ({
    ...session,
    directory: fs.realpathSync(session.directory)
  }));
  const script = [
    "import json, sqlite3, sys",
    "database_path = sys.argv[1]",
    "sessions = json.loads(sys.argv[2])",
    "conn = sqlite3.connect(database_path)",
    "conn.execute('CREATE TABLE session (id TEXT PRIMARY KEY, directory TEXT NOT NULL, title TEXT NOT NULL, time_updated INTEGER NOT NULL)')",
    "conn.execute('CREATE TABLE part (id TEXT PRIMARY KEY, session_id TEXT NOT NULL, time_created INTEGER NOT NULL, data TEXT NOT NULL)')",
    "for index, session in enumerate(sessions):",
    "    conn.execute('INSERT INTO session(id, directory, title, time_updated) VALUES(?, ?, ?, ?)', (session['id'], session['directory'], session['title'], session['time_updated']))",
    "    if session.get('briefing'):",
    "        data = json.dumps({'type': 'text', 'text': session['briefing']})",
    "        conn.execute('INSERT INTO part(id, session_id, time_created, data) VALUES(?, ?, ?, ?)', (f'part-{index}', session['id'], session['time_updated'], data))",
    "conn.commit()",
    "conn.close()"
  ].join("\n");
  const result = spawnSync("python3", ["-c", script, databasePath, JSON.stringify(normalizedSessions)], {
    encoding: "utf8"
  });
  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
}

function updateAgentmuxCommand(harness, agentName, commandText, externalSessionId = "") {
  const databasePath = path.join(harness.homePath, "agentmux.db");
  const script = [
    "import sqlite3, sys",
    "conn = sqlite3.connect(sys.argv[1])",
    "conn.execute('UPDATE sessions SET command_text = ?, external_session_id = ? WHERE name = ?', (sys.argv[3], sys.argv[4], sys.argv[2]))",
    "conn.commit()",
    "conn.close()"
  ].join("\n");
  const result = spawnSync("python3", ["-c", script, databasePath, agentName, commandText, externalSessionId], {
    encoding: "utf8"
  });
  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
}

function assertAgentmuxOk(result) {
  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
}

test("agentmux restart reuses the stored runtime and preserves the agent record", () => {
  const harness = createRestartHarness();

  try {
    assertAgentmuxOk(harness.run(["worker", "proj", "parent", "--workdir", harness.workspacePath, "--harness", "shell"]));

    const restarted = harness.run(["restart", "parent"]);

    assertAgentmuxOk(restarted);
    assert.match(restarted.stdout, /Restarted parent/u);
    assert.match(restarted.stdout, /tmux: agentmux-parent-[a-f0-9]{8}/u);
    assert.match(restarted.stdout, /run:\s+\S+/u);

    const sessions = new Map(
      harness.readProjectPayload().sessions.map((session) => [session.name, session])
    );
    const parent = sessions.get("parent");

    assert.equal(parent.name, "parent");
    assert.equal(parent.runtime_state, "running");
    assert.equal(parent.agent_state, "active");
  } finally {
    harness.cleanup();
  }
});

test("restarting opencode pins the active terminal session before replacing the runtime", () => {
  const activeTitle = "Continue the existing implementation";
  const harness = createRestartHarness({
    paneText: "Ask anything\nctrl+p commands\n",
    paneTitle: `OC | ${activeTitle}`
  });

  try {
    assertAgentmuxOk(harness.run([
      "worker", "proj", "opencode-worker", "--workdir", harness.workspacePath, "--harness", "opencode"
    ]));
    updateAgentmuxCommand(
      harness,
      "opencode-worker",
      "opencode -c=true --fork=true --model ollama-cloud/glm-5.2 -s=ses_original",
      "ses_original"
    );
    writeOpenCodeDatabase(harness, [
      {
        id: "ses_original",
        directory: harness.workspacePath,
        title: "Original agent briefing",
        time_updated: 100,
        briefing: "[TermCanvas] You are agent 'opencode-worker' on canvas project 'proj', one node in a graph of peer agents."
      },
      {
        id: "ses_active",
        directory: harness.workspacePath,
        title: activeTitle,
        time_updated: 200
      }
    ]);

    const restarted = harness.run(["restart", "opencode-worker"]);

    assertAgentmuxOk(restarted);
    assert.match(restarted.stdout, /run:\s+opencode -s ses_active/u);
    assert.doesNotMatch(restarted.stdout, /--continue|--fork/u);
    const project = harness.readProjectPayload();
    const worker = project.sessions.find((session) => session.name === "opencode-worker");
    assert.equal(worker.external_session_id, "ses_active");
    const restartLaunch = harness.readTmuxCalls()
      .filter((args) => args[0] === "new-session")
      .at(-1);
    const opencodeIndex = restartLaunch.indexOf("opencode");
    const sessionFlagIndex = restartLaunch.indexOf("-s", opencodeIndex);
    assert.ok(sessionFlagIndex > opencodeIndex);
    assert.equal(restartLaunch[sessionFlagIndex + 1], "ses_active");
  } finally {
    harness.cleanup();
  }
});

test("restarting opencode recovers its session from the TermCanvas briefing when the title is generic", () => {
  const harness = createRestartHarness({
    paneText: "Ask anything\nctrl+p commands\n",
    paneTitle: "OpenCode"
  });

  try {
    assertAgentmuxOk(harness.run([
      "worker", "proj", "opencode-worker", "--workdir", harness.workspacePath, "--harness", "opencode"
    ]));
    writeOpenCodeDatabase(harness, [{
      id: "ses_briefed",
      directory: harness.workspacePath,
      title: "New session",
      time_updated: 100,
      briefing: "[TermCanvas] You are agent 'opencode-worker' on canvas project 'proj', one node in a graph of peer agents."
    }]);

    const restarted = harness.run(["restart", "opencode-worker"]);

    assertAgentmuxOk(restarted);
    assert.match(restarted.stdout, /run:\s+opencode -s ses_briefed/u);
  } finally {
    harness.cleanup();
  }
});

test("generic OpenCode titles preserve a valid stored session instead of selecting an old briefing", () => {
  const harness = createRestartHarness({
    paneText: "Ask anything\nctrl+p commands\n",
    paneTitle: "OpenCode"
  });

  try {
    assertAgentmuxOk(harness.run([
      "new", "--agent", "opencode-worker", "--project", "proj", "--workdir", harness.workspacePath,
      "--harness", "opencode", "--session", "ses_stored", "--no-briefing"
    ]));
    writeOpenCodeDatabase(harness, [
      {
        id: "ses_old_briefing",
        directory: harness.workspacePath,
        title: "Old briefing session",
        time_updated: 200,
        briefing: "[TermCanvas] You are agent 'opencode-worker' on canvas project 'proj', one node in a graph of peer agents."
      },
      {
        id: "ses_stored",
        directory: harness.workspacePath,
        title: "Stored active session",
        time_updated: 100
      }
    ]);

    const restarted = harness.run(["restart", "opencode-worker"]);

    assertAgentmuxOk(restarted);
    assert.match(restarted.stdout, /-s ses_stored/u);
    assert.doesNotMatch(restarted.stdout, /ses_old_briefing/u);
  } finally {
    harness.cleanup();
  }
});

test("generic OpenCode titles fail closed when multiple historical sessions share the briefing", () => {
  const harness = createRestartHarness({
    paneText: "Ask anything\nctrl+p commands\n",
    paneTitle: "OpenCode"
  });

  try {
    assertAgentmuxOk(harness.run([
      "worker", "proj", "opencode-worker", "--workdir", harness.workspacePath, "--harness", "opencode"
    ]));
    const briefing = "[TermCanvas] You are agent 'opencode-worker' on canvas project 'proj', one node in a graph of peer agents.";
    writeOpenCodeDatabase(harness, [
      { id: "ses_first", directory: harness.workspacePath, title: "First", time_updated: 100, briefing },
      { id: "ses_second", directory: harness.workspacePath, title: "Second", time_updated: 200, briefing }
    ]);
    const sessionName = harness.readProjectPayload().sessions
      .find((session) => session.name === "opencode-worker").tmux_session;
    const killCallsBefore = harness.readTmuxCalls().filter((args) => args[0] === "kill-session").length;

    const restarted = harness.run(["restart", "opencode-worker"]);

    assert.notEqual(restarted.status, 0);
    assert.match(`${restarted.stderr}\n${restarted.stdout}`, /multiple OpenCode sessions contain its TermCanvas briefing/u);
    assert.equal(harness.readSessions().includes(sessionName), true);
    const killCallsAfter = harness.readTmuxCalls().filter((args) => args[0] === "kill-session").length;
    assert.equal(killCallsAfter, killCallsBefore);
  } finally {
    harness.cleanup();
  }
});

test("restart preserves opencode when a managed shell is currently running it", () => {
  const activeTitle = "Work launched from a shell";
  const harness = createRestartHarness({
    paneCommand: "bun",
    paneText: "Ask anything\nctrl+p commands\n",
    paneTitle: `OC | ${activeTitle}`
  });

  try {
    assertAgentmuxOk(harness.run([
      "worker", "proj", "shell-worker", "--workdir", harness.workspacePath, "--harness", "shell"
    ]));
    writeOpenCodeDatabase(harness, [{
      id: "ses_shell_active",
      directory: harness.workspacePath,
      title: activeTitle,
      time_updated: 100
    }]);

    const restarted = harness.run(["restart", "shell-worker"]);

    assertAgentmuxOk(restarted);
    assert.match(restarted.stdout, /run:\s+opencode .*\s-s ses_shell_active/u);
    const worker = harness.readProjectPayload().sessions
      .find((session) => session.name === "shell-worker");
    assert.equal(worker.harness, "opencode");
    assert.equal(worker.external_session_id, "ses_shell_active");
  } finally {
    harness.cleanup();
  }
});

test("restarting opencode fails closed when its session identity cannot be recovered", () => {
  const harness = createRestartHarness({
    paneText: "Ask anything\nctrl+p commands\n",
    paneTitle: "OpenCode"
  });

  try {
    assertAgentmuxOk(harness.run([
      "worker", "proj", "opencode-worker", "--workdir", harness.workspacePath, "--harness", "opencode"
    ]));
    const sessionName = harness.readProjectPayload().sessions
      .find((session) => session.name === "opencode-worker").tmux_session;
    const killCallsBefore = harness.readTmuxCalls().filter((args) => args[0] === "kill-session").length;

    const restarted = harness.run(["restart", "opencode-worker"]);

    assert.notEqual(restarted.status, 0);
    assert.match(`${restarted.stderr}\n${restarted.stdout}`, /active OpenCode session ID could not be identified/u);
    assert.equal(harness.readSessions().includes(sessionName), true, "the existing runtime must remain alive");
    const killCallsAfter = harness.readTmuxCalls().filter((args) => args[0] === "kill-session").length;
    assert.equal(killCallsAfter, killCallsBefore, "restart must not kill a runtime whose session identity is unknown");
  } finally {
    harness.cleanup();
  }
});

test("restarting opencode fails closed when its stored session no longer exists", () => {
  const harness = createRestartHarness({
    paneText: "Ask anything\nctrl+p commands\n",
    paneTitle: "OpenCode"
  });

  try {
    assertAgentmuxOk(harness.run([
      "new", "--agent", "opencode-worker", "--project", "proj", "--workdir", harness.workspacePath,
      "--harness", "opencode", "--session", "ses_missing", "--no-briefing"
    ]));
    writeOpenCodeDatabase(harness, [{
      id: "ses_other",
      directory: harness.workspacePath,
      title: "Another session",
      time_updated: 100
    }]);
    const sessionName = harness.readProjectPayload().sessions
      .find((session) => session.name === "opencode-worker").tmux_session;
    const killCallsBefore = harness.readTmuxCalls().filter((args) => args[0] === "kill-session").length;

    const restarted = harness.run(["restart", "opencode-worker"]);

    assert.notEqual(restarted.status, 0);
    assert.match(`${restarted.stderr}\n${restarted.stdout}`, /stored OpenCode session no longer exists/u);
    assert.equal(harness.readSessions().includes(sessionName), true);
    const killCallsAfter = harness.readTmuxCalls().filter((args) => args[0] === "kill-session").length;
    assert.equal(killCallsAfter, killCallsBefore);
  } finally {
    harness.cleanup();
  }
});

test("restart reports failure when the replacement OpenCode runtime exits before ready", () => {
  const activeTitle = "Runtime that exits";
  const harness = createRestartHarness({
    dropRestartedSession: true,
    paneText: "Ask anything\nctrl+p commands\n",
    paneTitle: `OC | ${activeTitle}`
  });

  try {
    assertAgentmuxOk(harness.run([
      "worker", "proj", "opencode-worker", "--workdir", harness.workspacePath, "--harness", "opencode"
    ]));
    writeOpenCodeDatabase(harness, [{
      id: "ses_active",
      directory: harness.workspacePath,
      title: activeTitle,
      time_updated: 100
    }]);

    const restarted = harness.run(["restart", "opencode-worker", "--ready-timeout", "0.1"]);

    assert.notEqual(restarted.status, 0);
    assert.match(`${restarted.stderr}\n${restarted.stdout}`, /exited before it became ready/u);
    assert.doesNotMatch(restarted.stdout, /Restarted opencode-worker/u);
  } finally {
    harness.cleanup();
  }
});

test("restart rejects a ready OpenCode runtime that did not return to the active titled session", () => {
  const activeTitle = "Expected active conversation";
  const harness = createRestartHarness({
    paneText: "Ask anything\nctrl+p commands\n",
    paneTitle: `OC | ${activeTitle}`,
    paneTitleAfterRestart: "OpenCode"
  });

  try {
    assertAgentmuxOk(harness.run([
      "worker", "proj", "opencode-worker", "--workdir", harness.workspacePath, "--harness", "opencode"
    ]));
    writeOpenCodeDatabase(harness, [{
      id: "ses_active",
      directory: harness.workspacePath,
      title: activeTitle,
      time_updated: 100
    }]);

    const restarted = harness.run(["restart", "opencode-worker", "--ready-timeout", "0.2"]);

    assert.notEqual(restarted.status, 0);
    assert.match(`${restarted.stderr}\n${restarted.stdout}`, /did not reopen the expected active session/u);
    assert.doesNotMatch(restarted.stdout, /Restarted opencode-worker/u);
    const failedWorker = harness.readProjectPayload().sessions
      .find((session) => session.name === "opencode-worker");
    assert.equal(failedWorker.harness, "opencode");
    assert.equal(failedWorker.external_session_id, "ses_active");

    const retried = harness.run(["restart", "opencode-worker", "--ready-timeout", "0.2"]);
    assertAgentmuxOk(retried);
    assert.match(retried.stdout, /-s ses_active/u);
  } finally {
    harness.cleanup();
  }
});

test("restarting a parent does not delete or stop its children", () => {
  const harness = createRestartHarness();

  try {
    assertAgentmuxOk(harness.run(["worker", "proj", "parent", "--workdir", harness.workspacePath, "--harness", "shell"]));
    assertAgentmuxOk(harness.run(["worker", "proj", "child", "--workdir", harness.workspacePath, "--harness", "shell", "--parent", "parent"]));

    const childSessionName = harness.readProjectPayload().sessions
      .find((session) => session.name === "child").tmux_session;

    assertAgentmuxOk(harness.run(["restart", "parent"]));

    const sessions = new Map(
      harness.readProjectPayload().sessions.map((session) => [session.name, session])
    );
    const child = sessions.get("child");

    assert.ok(child, "child agent record must survive a parent restart");
    assert.equal(child.parent_agent, "parent");
    assert.equal(child.depth, 1);
    assert.equal(child.runtime_state, "running", "child runtime must not be stopped");
    assert.equal(harness.readSessions().includes(childSessionName), true, "child tmux session must stay alive");

    const killCalls = harness.readTmuxCalls()
      .filter((args) => args[0] === "kill-session")
      .flatMap((args) => [args[args.indexOf("-t") + 1]]);
    assert.equal(killCalls.includes(childSessionName), false, "child tmux session must not be killed");
  } finally {
    harness.cleanup();
  }
});

test("restart preserves graph edges", () => {
  const harness = createRestartHarness();

  try {
    assertAgentmuxOk(harness.run(["worker", "proj", "parent", "--workdir", harness.workspacePath, "--harness", "shell"]));
    assertAgentmuxOk(harness.run(["worker", "proj", "child", "--workdir", harness.workspacePath, "--harness", "shell", "--parent", "parent"]));
    assertAgentmuxOk(harness.run(["worker", "proj", "grandchild", "--workdir", harness.workspacePath, "--harness", "shell", "--parent", "child"]));

    const edgesBefore = harness.readProjectPayload().edges
      .filter((edge) => edge.kind === "spawn")
      .map((edge) => [edge.from, edge.to])
      .sort();

    assertAgentmuxOk(harness.run(["restart", "parent"]));
    assertAgentmuxOk(harness.run(["restart", "child"]));

    const edgesAfter = harness.readProjectPayload().edges
      .filter((edge) => edge.kind === "spawn")
      .map((edge) => [edge.from, edge.to])
      .sort();

    assert.deepEqual(edgesAfter, edgesBefore);
    assert.deepEqual(edgesAfter, [["child", "grandchild"], ["parent", "child"]]);
  } finally {
    harness.cleanup();
  }
});

test("restart failures are visible", () => {
  const harness = createRestartHarness();

  try {
    assertAgentmuxOk(harness.run(["worker", "proj", "parent", "--workdir", harness.workspacePath, "--harness", "shell"]));

    const missing = harness.run(["restart", "missing-agent"]);
    assert.notEqual(missing.status, 0);
    assert.match(`${missing.stderr}\n${missing.stdout}`, /No session found/u);

    harness.run(["kill", "parent"]);
    const notRunning = harness.run(["restart", "parent"]);
    assertAgentmuxOk(notRunning, "restart must also resume a previously killed runtime");
    assert.match(notRunning.stdout, /Restarted parent/u);
  } finally {
    harness.cleanup();
  }
});

function hasChildExited(child) {
  return child.exitCode !== null || child.signalCode !== null;
}

function spawnOrphanProcess() {
  // Stand-in for a double-forked agent process that tmux kill-session alone
  // would leave orphaned (opencode does this and spins at full CPU).
  const child = spawn("sleep", ["300"], { stdio: "ignore" });
  return child;
}

function waitForChildExit(child, timeoutMs = 3000) {
  return new Promise((resolve) => {
    if (hasChildExited(child)) {
      resolve(true);
      return;
    }
    const timer = setTimeout(() => resolve(false), timeoutMs);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve(true);
    });
  });
}

test("restart reaps the pane process tree so the old runtime cannot survive as an orphan", async () => {
  const orphan = spawnOrphanProcess();
  const orphanPid = orphan.pid;
  // A descendant of the pane shell, plus a nonexistent grandchild that the
  // collector should tolerate (os.kill on it raises ProcessLookupError).
  const missingGrandchild = orphanPid + 400000;
  const harness = createRestartHarness({
    panePid: String(orphanPid),
    psTable: `  ${orphanPid}     1\n  ${missingGrandchild} ${orphanPid}\n`
  });

  try {
    assertAgentmuxOk(harness.run(["worker", "proj", "parent", "--workdir", harness.workspacePath, "--harness", "shell"]));
    assert.equal(hasChildExited(orphan), false, "orphan must be alive before restart");

    const restarted = harness.run(["restart", "parent"]);

    assertAgentmuxOk(restarted);
    assert.match(restarted.stdout, /Restarted parent/u);
    assert.equal(await waitForChildExit(orphan), true, "restart must reap the orphaned pane process tree");
  } finally {
    if (!hasChildExited(orphan)) {
      try {
        orphan.kill("SIGKILL");
      } catch {
        // Already exited.
      }
    }
    harness.cleanup();
  }
});

test("restart reaps process-tree descendants before resuming the runtime", async () => {
  const orphan = spawnOrphanProcess();
  const grandchild = spawnOrphanProcess();
  const orphanPid = orphan.pid;
  const grandchildPid = grandchild.pid;
  const harness = createRestartHarness({
    panePid: String(orphanPid),
    psTable: `  ${orphanPid}     1\n  ${grandchildPid} ${orphanPid}\n`
  });

  try {
    assertAgentmuxOk(harness.run(["worker", "proj", "parent", "--workdir", harness.workspacePath, "--harness", "shell"]));
    assertAgentmuxOk(harness.run(["restart", "parent"]));

    assert.equal(await waitForChildExit(orphan), true, "pane shell process must be reaped");
    assert.equal(await waitForChildExit(grandchild), true, "double-forked grandchild must be reaped");
  } finally {
    for (const child of [orphan, grandchild]) {
      if (!hasChildExited(child)) {
        try {
          child.kill("SIGKILL");
        } catch {
          // Already exited.
        }
      }
    }
    harness.cleanup();
  }
});
