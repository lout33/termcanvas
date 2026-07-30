const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const repoRoot = path.join(__dirname, "..");
const agentmuxScriptPath = path.join(repoRoot, "vendor", "agentmux", "agentmux.py");

function createAgentmuxHarness() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "termcanvas-agentmux-hierarchy-"));
  const binPath = path.join(root, "bin");
  const homePath = path.join(root, "home");
  const workspacePath = path.join(root, "workspace");
  const tmuxLogPath = path.join(root, "tmux.log");

  fs.mkdirSync(binPath, { recursive: true });
  fs.mkdirSync(homePath, { recursive: true });
  fs.mkdirSync(workspacePath, { recursive: true });
  fs.writeFileSync(
    path.join(binPath, "tmux"),
    [
      "#!/usr/bin/env node",
      "const fs = require('node:fs');",
      "const args = process.argv.slice(2);",
      "if (process.env.FAKE_TMUX_LOG) {",
      "  fs.appendFileSync(process.env.FAKE_TMUX_LOG, `${JSON.stringify(args)}\\n`, 'utf8');",
      "}",
      "if (args[0] === 'capture-pane') {",
      "  process.stdout.write((process.env.FAKE_TMUX_PANE ?? '$') + '\\n');",
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
  for (const command of ["opencode", "claude"]) {
    fs.writeFileSync(path.join(binPath, command), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  }

  return {
    root,
    binPath,
    homePath,
    workspacePath,
    tmuxLogPath,
    cleanup() {
      fs.rmSync(root, { recursive: true, force: true });
    }
  };
}

function runAgentmux(harness, args, envOverrides = {}) {
  return spawnSync("python3", [agentmuxScriptPath, ...args], {
    cwd: harness.workspacePath,
    encoding: "utf8",
    env: {
      ...process.env,
      AGENTMUX_AGENT_NAME: "",
      AGENTMUX_PROJECT: "",
      AGENTMUX_ROLE: "",
      AGENTMUX_DEPTH: "",
      AGENTMUX_PARENT_AGENT: "",
      PATH: `${harness.binPath}${path.delimiter}${process.env.PATH ?? ""}`,
      AGENTMUX_HOME: harness.homePath,
      FAKE_TMUX_LOG: harness.tmuxLogPath,
      SHELL: "/bin/sh",
      ...envOverrides
    }
  });
}

function assertAgentmuxOk(result) {
  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
}

function readProjectPayload(harness, project, envOverrides = {}) {
  const result = runAgentmux(harness, ["ls", "--project", project, "--json"], envOverrides);
  assertAgentmuxOk(result);
  return JSON.parse(result.stdout);
}

test("agentmux waiting inference ignores incidental approval and permission prose", () => {
  const harness = createAgentmuxHarness();

  try {
    assertAgentmuxOk(runAgentmux(harness, ["worker", "proj", "worker-a", "--workdir", harness.workspacePath, "--harness", "shell"]));
    const payload = readProjectPayload(harness, "proj", {
      FAKE_TMUX_PANE: "B1 approved. The permission model is documented.\nThe guide says to press enter after setup.\n$"
    });
    const session = sessionsByName(payload).get("worker-a");

    assert.notEqual(session.runtime_state, "waiting");
    assert.equal(session.attention, null);
  } finally {
    harness.cleanup();
  }
});

test("agentmux waiting inference recognizes current prompts and explicit user handoffs", () => {
  const samples = [
    "Permission required\nAllow once",
    "Select an option\n[y/n]",
    "Do you want to proceed?\n1. Yes\n2. No",
    "PAUSED until you explicitly resume after the release decision",
    "Which account should become the creator account?\n1. @luis.fyupanqui\n2. @code4fun_gg\n⇆ tab  ↑↓ select  enter confirm  esc dismiss"
  ];

  for (const [index, paneText] of samples.entries()) {
    const harness = createAgentmuxHarness();
    try {
      const agentName = `worker-${index}`;
      assertAgentmuxOk(runAgentmux(harness, ["worker", "proj", agentName, "--workdir", harness.workspacePath, "--harness", "shell"]));
      const session = sessionsByName(readProjectPayload(harness, "proj", { FAKE_TMUX_PANE: paneText })).get(agentName);

      assert.equal(session.runtime_state, "waiting", paneText);
      assert.equal(session.attention, "waiting", paneText);
    } finally {
      harness.cleanup();
    }
  }
});

test("agentmux waiting inference clears negated and answered prompts", () => {
  const samples = [
    { harness: "shell", paneText: "We do not need your input for this step.\n$" },
    { harness: "shell", paneText: "Permission required\nAllow once\ny\nBuild complete\n$" },
    { harness: "shell", paneText: "Continue? [y/n]\nno\nCancelled\n$" },
    { harness: "opencode", paneText: "Permission required\nAllow once\nApproved\nBuild complete" },
    { harness: "claude", paneText: "Proceed?\nSelected Yes\nTests passed" },
    { harness: "opencode", paneText: "Needs your input\nWe do not need your input now\nDone" }
  ];

  for (const [index, sample] of samples.entries()) {
    const harness = createAgentmuxHarness();
    try {
      const agentName = `worker-${index}`;
      assertAgentmuxOk(runAgentmux(
        harness,
        [
          "import",
          "--agent", agentName,
          "--tmux-session", `termcanvas-prompt-${index}`,
          "--harness", sample.harness,
          "--project", "proj",
          "--workdir", harness.workspacePath,
          "--cmd", sample.harness
        ]
      ));
      const session = sessionsByName(readProjectPayload(harness, "proj", { FAKE_TMUX_PANE: sample.paneText })).get(agentName);

      assert.notEqual(session.runtime_state, "waiting", sample.paneText);
      assert.equal(session.attention, null, sample.paneText);
    } finally {
      harness.cleanup();
    }
  }
});

function sessionsByName(payload) {
  return new Map(payload.sessions.map((session) => [session.name, session]));
}

function readNewSessionCalls(harness) {
  return readTmuxCalls(harness).filter((args) => args[0] === "new-session");
}

function readTmuxCalls(harness) {
  const log = fs.existsSync(harness.tmuxLogPath)
    ? fs.readFileSync(harness.tmuxLogPath, "utf8")
    : "";
  return log
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

test("agentmux installs the bundled TermCanvas skill", () => {
  const harness = createAgentmuxHarness();

  try {
    const targetDir = path.join(harness.root, "skills", "agentmux");
    const install = runAgentmux(harness, ["install-skill", "--target-dir", targetDir]);
    assertAgentmuxOk(install);

    const installedSkill = path.join(targetDir, "SKILL.md");
    const publicSkill = path.join(repoRoot, "skills", "agentmux", "SKILL.md");

    assert.equal(fs.existsSync(installedSkill), true);
    assert.equal(fs.readFileSync(installedSkill, "utf8"), fs.readFileSync(publicSkill, "utf8"));
    assert.match(install.stdout, /Installed agentmux skill/u);
  } finally {
    harness.cleanup();
  }
});

test("agentmux workers are graph roots and can spawn children with lineage metadata", () => {
  const harness = createAgentmuxHarness();

  try {
    assertAgentmuxOk(runAgentmux(harness, ["worker", "proj", "root-a", "--workdir", harness.workspacePath, "--harness", "shell"]));
    assertAgentmuxOk(runAgentmux(
      harness,
      ["worker", "proj", "grandchild", "--workdir", harness.workspacePath, "--harness", "shell"],
      {
        AGENTMUX_AGENT_NAME: "root-a",
        AGENTMUX_PROJECT: "proj",
        AGENTMUX_ROLE: "agent",
        AGENTMUX_DEPTH: "0"
      }
    ));
    assertAgentmuxOk(runAgentmux(harness, ["worker", "proj", "explicit-child", "--workdir", harness.workspacePath, "--harness", "shell", "--parent", "root-a"]));

    const payload = readProjectPayload(harness, "proj");
    const sessions = sessionsByName(payload);

    assert.equal(payload.manager, undefined, "the manager concept is gone from project payloads");
    assert.equal(sessions.get("root-a").role, "agent");
    assert.equal(sessions.get("root-a").parent_agent, "");
    assert.equal(sessions.get("root-a").depth, 0);
    assert.equal(sessions.get("grandchild").parent_agent, "root-a");
    assert.equal(sessions.get("grandchild").depth, 1);
    assert.equal(sessions.get("explicit-child").parent_agent, "root-a");
    assert.equal(sessions.get("explicit-child").depth, 1);

    const grandchildCall = readNewSessionCalls(harness).find((args) => args.some((arg) => /^agentmux-grandchild-/u.test(arg)));

    assert.ok(grandchildCall, "expected fake tmux to record grandchild creation");
    assert.ok(grandchildCall.includes("AGENTMUX_PARENT_AGENT=root-a"));
    assert.ok(grandchildCall.includes("AGENTMUX_DEPTH=1"));
    assert.ok(grandchildCall.includes("AGENTMUX_ROLE=agent"));
    assert.ok(!grandchildCall.some((arg) => typeof arg === "string" && arg.startsWith("AGENTMUX_COMMANDER_AGENT=")), "commander env var must be gone");
    assert.ok(grandchildCall.includes("AGENTMUX_PROJECT=proj"));
    assert.ok(grandchildCall.includes(`AGENTMUX_HOME=${harness.homePath}`));
    assert.ok(grandchildCall.some((arg) => /^LANG=.*UTF-?8$/iu.test(arg)));
    assert.ok(grandchildCall.some((arg) => /^AGENTMUX_BIN=.*vendor\/agentmux\/agentmux$/u.test(arg)));
    assert.ok(grandchildCall.some((arg) => arg.startsWith("PATH=") && arg.includes(harness.binPath)));

    const showWorker = runAgentmux(harness, ["show", "grandchild"]);
    assertAgentmuxOk(showWorker);
    assert.match(showWorker.stdout, /role:\s+agent/u);
    assert.match(showWorker.stdout, /parent:\s+root-a/u);
    assert.match(showWorker.stdout, /depth:\s+1/u);
    assert.doesNotMatch(showWorker.stdout, /commander:/u);
    assert.match(showWorker.stdout, /session awareness:/u);
  } finally {
    harness.cleanup();
  }
});

test("agentmux reparent replaces stale lineage and updates descendant depths", () => {
  const harness = createAgentmuxHarness();

  try {
    assertAgentmuxOk(runAgentmux(harness, ["worker", "proj", "old-parent", "--workdir", harness.workspacePath, "--harness", "shell"]));
    assertAgentmuxOk(runAgentmux(harness, ["worker", "proj", "new-parent", "--workdir", harness.workspacePath, "--harness", "shell"]));
    assertAgentmuxOk(runAgentmux(harness, ["worker", "proj", "child", "--workdir", harness.workspacePath, "--harness", "shell", "--parent", "old-parent"]));
    assertAgentmuxOk(runAgentmux(harness, ["worker", "proj", "grandchild", "--workdir", harness.workspacePath, "--harness", "shell", "--parent", "child"]));

    assertAgentmuxOk(runAgentmux(harness, ["reparent", "child", "--parent", "new-parent"]));
    let payload = readProjectPayload(harness, "proj");
    let sessions = sessionsByName(payload);

    assert.equal(sessions.get("child").parent_agent, "new-parent");
    assert.equal(sessions.get("child").depth, 1);
    assert.equal(sessions.get("grandchild").parent_agent, "child");
    assert.equal(sessions.get("grandchild").depth, 2);
    assert.deepEqual(
      payload.edges.filter((edge) => edge.kind === "spawn").map((edge) => [edge.from, edge.to]).sort(),
      [["child", "grandchild"], ["new-parent", "child"]]
    );

    assertAgentmuxOk(runAgentmux(harness, ["reparent", "child", "--root"]));
    payload = readProjectPayload(harness, "proj");
    sessions = sessionsByName(payload);
    assert.equal(sessions.get("child").parent_agent, "");
    assert.equal(sessions.get("child").depth, 0);
    assert.equal(sessions.get("grandchild").depth, 1);
    assert.deepEqual(
      payload.edges.filter((edge) => edge.kind === "spawn").map((edge) => [edge.from, edge.to]),
      [["child", "grandchild"]]
    );

    const cycle = runAgentmux(harness, ["reparent", "child", "--parent", "grandchild"]);
    assert.notEqual(cycle.status, 0);
    assert.match(cycle.stderr, /cycle/u);
  } finally {
    harness.cleanup();
  }
});

test("agentmux child inherits an AI parent's harness and sends its task to that harness", () => {
  const harness = createAgentmuxHarness();
  const readyPane = { FAKE_TMUX_PANE: "Ask anything\nctrl+p commands\n$" };

  try {
    assertAgentmuxOk(runAgentmux(
      harness,
      ["worker", "proj", "ai-parent", "--workdir", harness.workspacePath, "--harness", "opencode"],
      readyPane
    ));
    assertAgentmuxOk(runAgentmux(
      harness,
      ["child", "ai-parent", "ai-child", "--prompt", "Investigate the regression and report back."],
      readyPane
    ));

    const child = sessionsByName(readProjectPayload(harness, "proj", readyPane)).get("ai-child");
    const childLaunch = readNewSessionCalls(harness).find((args) => args.some((arg) => /^agentmux-ai-child-/u.test(arg)));
    const childInputs = readTmuxCalls(harness)
      .filter((args) => args[0] === "send-keys" && args[2] === child.tmux_session && args.includes("-l"))
      .map((args) => args[args.indexOf("-l") + 1]);

    assert.equal(child.harness, "opencode");
    assert.match(child.command_text, /^opencode --model /u);
    assert.ok(childLaunch.includes("opencode"));
    assert.equal(childLaunch.includes("/bin/sh"), false);
    assert.equal(childInputs.length, 1);
    assert.match(childInputs[0], /Your first task from the operator: Investigate the regression and report back\.$/u);
  } finally {
    harness.cleanup();
  }
});

test("agentmux child rejects an ambiguous shell-parent task but preserves explicit shell input", () => {
  const harness = createAgentmuxHarness();
  const shellCommand = "printf '%s\\n' explicit-shell-child";

  try {
    assertAgentmuxOk(runAgentmux(harness, ["worker", "proj", "shell-parent", "--workdir", harness.workspacePath, "--harness", "shell"]));

    const rejected = runAgentmux(
      harness,
      ["child", "shell-parent", "ambiguous-child", "--prompt", "Investigate the regression and report back."]
    );

    assert.notEqual(rejected.status, 0);
    assert.match(`${rejected.stderr}\n${rejected.stdout}`, /--harness (?:claude, codex, opencode, or pi).*--harness shell/u);
    assert.equal(sessionsByName(readProjectPayload(harness, "proj")).has("ambiguous-child"), false);
    assert.equal(
      readNewSessionCalls(harness).some((args) => args.some((arg) => /^agentmux-ambiguous-child-/u.test(arg))),
      false
    );

    assertAgentmuxOk(runAgentmux(
      harness,
      ["child", "shell-parent", "shell-child", "--harness", "shell", "--prompt", shellCommand]
    ));

    const child = sessionsByName(readProjectPayload(harness, "proj")).get("shell-child");
    const childLaunch = readNewSessionCalls(harness).find((args) => args.some((arg) => /^agentmux-shell-child-/u.test(arg)));
    const childInputs = readTmuxCalls(harness)
      .filter((args) => args[0] === "send-keys" && args[2] === child.tmux_session && args.includes("-l"))
      .map((args) => args[args.indexOf("-l") + 1]);

    assert.equal(child.harness, "shell");
    assert.ok(childLaunch.includes("/bin/sh"));
    assert.deepEqual(childInputs, [shellCommand]);
  } finally {
    harness.cleanup();
  }
});

test("agentmux rejects invalid explicit worker parents", () => {
  const harness = createAgentmuxHarness();

  try {
    assertAgentmuxOk(runAgentmux(harness, ["worker", "proj", "worker-a", "--workdir", harness.workspacePath, "--harness", "shell"]));
    assertAgentmuxOk(runAgentmux(harness, ["worker", "other", "other-worker", "--workdir", harness.workspacePath, "--harness", "shell"]));

    const missingParent = runAgentmux(harness, ["worker", "proj", "bad-child", "--workdir", harness.workspacePath, "--harness", "shell", "--parent", "missing-agent"]);
    assert.notEqual(missingParent.status, 0);
    assert.match(`${missingParent.stderr}\n${missingParent.stdout}`, /No session found for 'missing-agent'/u);

    const crossProjectParent = runAgentmux(harness, ["worker", "proj", "bad-child", "--workdir", harness.workspacePath, "--harness", "shell", "--parent", "other-worker"]);
    assert.notEqual(crossProjectParent.status, 0);
    assert.match(`${crossProjectParent.stderr}\n${crossProjectParent.stdout}`, /belongs to project 'other', not 'proj'/u);

    const selfParent = runAgentmux(harness, ["worker", "proj", "worker-a", "--workdir", harness.workspacePath, "--harness", "shell", "--parent", "worker-a"]);
    assert.notEqual(selfParent.status, 0);
    assert.match(`${selfParent.stderr}\n${selfParent.stdout}`, /Worker cannot use itself as its parent/u);
  } finally {
    harness.cleanup();
  }
});

test("project-scoped agent lists refresh only that project's tmux sessions", () => {
  const harness = createAgentmuxHarness();

  try {
    assertAgentmuxOk(runAgentmux(harness, ["worker", "proj", "project-worker", "--workdir", harness.workspacePath, "--harness", "shell"]));
    assertAgentmuxOk(runAgentmux(harness, ["worker", "other", "other-worker", "--workdir", harness.workspacePath, "--harness", "shell"]));

    const allResult = runAgentmux(harness, ["ls", "--json"]);
    assertAgentmuxOk(allResult);
    const allSessions = JSON.parse(allResult.stdout).sessions;
    const projectSession = allSessions.find((session) => session.name === "project-worker");
    const otherSession = allSessions.find((session) => session.name === "other-worker");

    fs.writeFileSync(harness.tmuxLogPath, "", "utf8");
    const projectResult = runAgentmux(harness, ["ls", "--project", "proj", "--json"]);
    assertAgentmuxOk(projectResult);

    const refreshTargets = readTmuxCalls(harness)
      .filter((args) => args[0] === "has-session" || args[0] === "capture-pane")
      .map((args) => args[args.indexOf("-t") + 1]);

    assert.ok(refreshTargets.includes(projectSession.tmux_session));
    assert.equal(refreshTargets.includes(otherSession.tmux_session), false);
  } finally {
    harness.cleanup();
  }
});

test("agentmux command center shows the agent graph tree and status", () => {
  const harness = createAgentmuxHarness();

  try {
    assertAgentmuxOk(runAgentmux(harness, ["worker", "proj", "worker-a", "--workdir", harness.workspacePath, "--harness", "shell"]));
    assertAgentmuxOk(runAgentmux(harness, ["child", "worker-a", "child-a", "--harness", "shell", "--prompt", "Handle the subtask"]));
    assertAgentmuxOk(runAgentmux(
      harness,
      ["worker", "env-root", "--workdir", harness.workspacePath, "--harness", "shell"],
      { AGENTMUX_PROJECT: "proj" }
    ));

    const payload = readProjectPayload(harness, "proj");
    const sessions = sessionsByName(payload);

    assert.equal(sessions.get("child-a").parent_agent, "worker-a");
    assert.equal(sessions.get("child-a").depth, 1);
    assert.equal(sessions.get("env-root").parent_agent, "", "no agent name in env means the worker becomes a root");
    assert.equal(sessions.get("env-root").depth, 0);

    const tree = runAgentmux(harness, ["tree", "proj"]);
    assertAgentmuxOk(tree);
    assert.match(tree.stdout, /Project: proj/u);
    assert.doesNotMatch(tree.stdout, /Manager:/u);
    assert.match(tree.stdout, /worker-a \(agent\)/u);
    assert.match(tree.stdout, /child-a \(agent\).*depth=1/u);
    assert.match(tree.stdout, /env-root \(agent\)/u);
    assert.match(tree.stdout, /Command center:/u);
    assert.doesNotMatch(tree.stdout, /mission/u);
    assert.match(tree.stdout, /agentmux.* child <parent-agent> <worker-name> --harness <ai-harness> --prompt "<task>"/u);
    assert.match(tree.stdout, /--harness shell.*literal shell input/u);
    assert.match(tree.stdout, /agentmux.* connect <agent-a> <agent-b> --announce/u);
    assert.match(tree.stdout, /agentmux.* ask <agent> "<prompt>"/u);
    assert.match(tree.stdout, /agentmux.* logs <agent> --lines 120/u);

    const status = runAgentmux(harness, ["status"], { AGENTMUX_PROJECT: "proj" });
    assertAgentmuxOk(status);
    assert.match(status.stdout, /Project: proj/u);
    assert.doesNotMatch(status.stdout, /Manager:/u);
    assert.match(status.stdout, /Runtime:/u);
    assert.match(status.stdout, /Attention:/u);

    const treeJson = runAgentmux(harness, ["tree", "proj", "--json"]);
    assertAgentmuxOk(treeJson);
    const treePayload = JSON.parse(treeJson.stdout);
    assert.equal(treePayload.project, "proj");
    assert.equal(treePayload.manager, undefined);
    assert.ok(Array.isArray(treePayload.tree));
    assert.equal(treePayload.tree.length, 2, "worker-a and env-root are both roots");
  } finally {
    harness.cleanup();
  }
});

test("agentmux stores spawn edges and supports connect/disconnect/neighbors", () => {
  const harness = createAgentmuxHarness();

  try {
    assertAgentmuxOk(runAgentmux(harness, ["worker", "proj", "worker-a", "--workdir", harness.workspacePath, "--harness", "shell"]));
    assertAgentmuxOk(runAgentmux(harness, ["worker", "proj", "worker-b", "--workdir", harness.workspacePath, "--harness", "shell"]));
    assertAgentmuxOk(runAgentmux(harness, ["child", "worker-a", "child-a", "--harness", "shell", "--prompt", "Handle the subtask"]));

    const spawnPayload = readProjectPayload(harness, "proj");
    assert.deepEqual(
      spawnPayload.edges.map((edge) => [edge.from, edge.to, edge.kind]),
      [["worker-a", "child-a", "spawn"]]
    );

    const connect = runAgentmux(harness, ["connect", "worker-a", "worker-b"]);
    assertAgentmuxOk(connect);
    assert.match(connect.stdout, /Connected worker-a <-> worker-b \(link\)/u);

    const repeatConnect = runAgentmux(harness, ["connect", "worker-b", "worker-a"]);
    assertAgentmuxOk(repeatConnect);

    const selfConnect = runAgentmux(harness, ["connect", "worker-a", "worker-a"]);
    assert.notEqual(selfConnect.status, 0);
    assert.match(`${selfConnect.stderr}\n${selfConnect.stdout}`, /cannot connect to itself/u);

    const linkedPayload = readProjectPayload(harness, "proj");
    assert.equal(linkedPayload.edges.length, 2);
    assert.deepEqual(
      linkedPayload.edges.filter((edge) => edge.kind === "link").map((edge) => [edge.from, edge.to]),
      [["worker-a", "worker-b"]]
    );

    const neighbors = runAgentmux(harness, ["neighbors", "worker-a", "--json"]);
    assertAgentmuxOk(neighbors);
    const neighborsPayload = JSON.parse(neighbors.stdout);
    assert.equal(neighborsPayload.agent, "worker-a");
    assert.deepEqual(
      neighborsPayload.neighbors.map((neighbor) => [neighbor.name, neighbor.kind]),
      [["child-a", "spawn"], ["worker-b", "link"]]
    );

    const envNeighbors = runAgentmux(harness, ["neighbors", "--json"], { AGENTMUX_AGENT_NAME: "worker-b" });
    assertAgentmuxOk(envNeighbors);
    assert.equal(JSON.parse(envNeighbors.stdout).agent, "worker-b");

    const disconnect = runAgentmux(harness, ["disconnect", "worker-b", "worker-a"]);
    assertAgentmuxOk(disconnect);
    assert.match(disconnect.stdout, /Disconnected worker-b <-> worker-a/u);

    const missingDisconnect = runAgentmux(harness, ["disconnect", "worker-b", "worker-a"]);
    assert.notEqual(missingDisconnect.status, 0);
    assert.match(`${missingDisconnect.stderr}\n${missingDisconnect.stdout}`, /No connection between/u);

    assertAgentmuxOk(runAgentmux(harness, ["delete", "child-a", "--force"]));
    const cleanedPayload = readProjectPayload(harness, "proj");
    assert.equal(cleanedPayload.edges.some((edge) => edge.from === "child-a" || edge.to === "child-a"), false);
  } finally {
    harness.cleanup();
  }
});

test("agentmux connect --announce briefs both agents about their new peer", () => {
  const harness = createAgentmuxHarness();

  try {
    assertAgentmuxOk(runAgentmux(harness, ["worker", "proj", "worker-a", "--workdir", harness.workspacePath, "--harness", "shell"]));
    assertAgentmuxOk(runAgentmux(harness, ["worker", "proj", "worker-b", "--workdir", harness.workspacePath, "--harness", "shell"]));

    const connect = runAgentmux(harness, ["connect", "worker-a", "worker-b", "--announce"]);
    assertAgentmuxOk(connect);
    assert.match(connect.stdout, /Connected worker-a <-> worker-b \(link\)/u);
    assert.match(connect.stdout, /announced: worker-a, worker-b/u);

    const briefingCalls = readTmuxCalls(harness).filter((args) => (
      args[0] === "send-keys"
      && args.includes("-l")
      && args.some((arg) => typeof arg === "string" && arg.includes("[TermCanvas] You are now connected to agent"))
    ));

    assert.equal(briefingCalls.length, 2, "expected one briefing per side");
    const briefingTexts = briefingCalls.map((args) => args[args.indexOf("-l") + 1]);
    const briefingAboutB = briefingTexts.find((text) => text.includes("connected to agent 'worker-b'"));
    const briefingAboutA = briefingTexts.find((text) => text.includes("connected to agent 'worker-a'"));

    assert.ok(briefingAboutB, "worker-a should be briefed about worker-b");
    assert.ok(briefingAboutA, "worker-b should be briefed about worker-a");
    assert.match(briefingAboutB, /agentmux ask worker-b "<task>"/u);
    assert.match(briefingAboutB, /agentmux check worker-b/u);
    assert.match(briefingAboutB, /agentmux neighbors/u);
  } finally {
    harness.cleanup();
  }
});

test("agentmux import adopts a terminal as a root graph agent that can connect", () => {
  const harness = createAgentmuxHarness();

  try {
    assertAgentmuxOk(runAgentmux(harness, ["worker", "proj", "worker-a", "--workdir", harness.workspacePath, "--harness", "shell"]));
    assertAgentmuxOk(runAgentmux(harness, [
      "import",
      "--agent", "My Terminal",
      "--tmux-session", "termcanvas-plain-1",
      "--harness", "shell",
      "--project", "proj",
      "--workdir", harness.workspacePath,
      "--cmd", "zsh"
    ]));

    const payload = readProjectPayload(harness, "proj");
    const adopted = sessionsByName(payload).get("my-terminal");

    assert.ok(adopted, "expected the imported terminal to appear in the project");
    assert.equal(adopted.role, "agent");
    assert.equal(adopted.parent_agent, "");
    assert.equal(adopted.depth, 0);

    const connect = runAgentmux(harness, ["connect", "my-terminal", "worker-a"]);
    assertAgentmuxOk(connect);

    const linkedPayload = readProjectPayload(harness, "proj");
    assert.deepEqual(
      linkedPayload.edges.map((edge) => [edge.from, edge.to, edge.kind]),
      [["my-terminal", "worker-a", "link"]]
    );
  } finally {
    harness.cleanup();
  }
});

test("agentmux injects a spawn briefing into AI-harness agents", () => {
  const harness = createAgentmuxHarness();
  const claudeReadyPane = { FAKE_TMUX_PANE: "❯" };

  try {
    assertAgentmuxOk(runAgentmux(
      harness,
      ["worker", "proj", "root-agent", "--workdir", harness.workspacePath, "--harness", "claude"],
      claudeReadyPane
    ));
    assertAgentmuxOk(runAgentmux(
      harness,
      ["child", "root-agent", "child-agent", "--harness", "claude", "--prompt", "Handle the subtask"],
      claudeReadyPane
    ));
    assertAgentmuxOk(runAgentmux(
      harness,
      ["worker", "proj", "quiet-agent", "--workdir", harness.workspacePath, "--harness", "claude", "--prompt", "Just do this", "--no-briefing"],
      claudeReadyPane
    ));
    assertAgentmuxOk(runAgentmux(
      harness,
      ["worker", "proj", "shell-agent", "--workdir", harness.workspacePath, "--harness", "shell", "--prompt", "echo hi"]
    ));

    const injectedTexts = readTmuxCalls(harness)
      .filter((args) => args[0] === "send-keys" && args.includes("-l"))
      .map((args) => args[args.indexOf("-l") + 1]);

    const rootBriefing = injectedTexts.find((text) => text.includes("You are agent 'root-agent'"));
    assert.ok(rootBriefing, "claude worker without a prompt should still receive a briefing");
    assert.match(rootBriefing, /\[TermCanvas\] You are agent 'root-agent' on canvas project 'proj'/u);
    assert.match(rootBriefing, /"\$AGENTMUX_BIN" neighbors/u);
    assert.match(rootBriefing, /"\$AGENTMUX_BIN" ask <agent>/u);
    assert.match(rootBriefing, /"\$AGENTMUX_BIN" check <agent>/u);
    assert.match(rootBriefing, /"\$AGENTMUX_BIN" child root-agent <child-name> --harness claude --prompt "<task>"/u);
    assert.match(rootBriefing, /--harness shell only for literal shell input/u);
    assert.doesNotMatch(rootBriefing, /Your first task/u);

    const childBriefing = injectedTexts.find((text) => text.includes("You are agent 'child-agent'"));
    assert.ok(childBriefing, "child agent should receive a briefing");
    assert.match(childBriefing, /spawned by agent 'root-agent'/u);
    assert.match(childBriefing, /Your first task from the operator: Handle the subtask$/u);

    assert.ok(injectedTexts.includes("Just do this"), "--no-briefing should send the bare prompt");
    assert.equal(
      injectedTexts.some((text) => text.includes("You are agent 'quiet-agent'")),
      false,
      "--no-briefing should skip the briefing"
    );

    assert.ok(injectedTexts.includes("echo hi"), "shell prompt should be sent unchanged");
    assert.equal(
      injectedTexts.some((text) => text.includes("You are agent 'shell-agent'")),
      false,
      "shell harness should never receive a briefing"
    );
  } finally {
    harness.cleanup();
  }
});

test("agentmux child help and bundled guidance distinguish AI tasks from shell input", () => {
  const harness = createAgentmuxHarness();

  try {
    const help = runAgentmux(harness, ["child", "--help"]);
    const readme = fs.readFileSync(path.join(repoRoot, "README.md"), "utf8");
    const skill = fs.readFileSync(path.join(repoRoot, "skills", "agentmux", "SKILL.md"), "utf8");

    assertAgentmuxOk(help);
    assert.match(help.stdout, /inherits the parent\s+AI harness/u);
    assert.match(help.stdout, /--harness shell[\s\S]*literal\s+shell input/u);
    assert.match(readme, /child <parent> <name> --harness <ai-harness> --prompt/u);
    assert.match(readme, /--harness shell[\s\S]*literal\s+shell input/u);
    assert.match(skill, /child <parent-agent> <agent-name> --harness <ai-harness> --prompt/u);
    assert.match(skill, /--harness shell[\s\S]*literal\s+shell input/u);
  } finally {
    harness.cleanup();
  }
});

test("agentmux removed the commander-era commands", () => {
  const harness = createAgentmuxHarness();

  try {
    const projectSync = runAgentmux(harness, ["project-sync", "proj"]);
    assert.notEqual(projectSync.status, 0);

    const mission = runAgentmux(harness, ["mission", "proj", "do things"]);
    assert.notEqual(mission.status, 0);
  } finally {
    harness.cleanup();
  }
});
