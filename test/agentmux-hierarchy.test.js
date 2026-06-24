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
      "  process.stdout.write('$\\n');",
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

function readProjectPayload(harness, project) {
  const result = runAgentmux(harness, ["ls", "--project", project, "--json"]);
  assertAgentmuxOk(result);
  return JSON.parse(result.stdout);
}

function sessionsByName(payload) {
  return new Map(payload.sessions.map((session) => [session.name, session]));
}

function readNewSessionCalls(harness) {
  const log = fs.existsSync(harness.tmuxLogPath)
    ? fs.readFileSync(harness.tmuxLogPath, "utf8")
    : "";
  return log
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line))
    .filter((args) => args[0] === "new-session");
}

test("agentmux workers can spawn child workers with parent and depth metadata", () => {
  const harness = createAgentmuxHarness();

  try {
    assertAgentmuxOk(runAgentmux(harness, ["project-sync", "proj", "--workdir", harness.workspacePath, "--harness", "shell", "--json"]));
    assertAgentmuxOk(runAgentmux(harness, ["worker", "proj", "worker-a", "--workdir", harness.workspacePath, "--harness", "shell"]));
    assertAgentmuxOk(runAgentmux(
      harness,
      ["worker", "proj", "grandchild", "--workdir", harness.workspacePath, "--harness", "shell"],
      {
        AGENTMUX_AGENT_NAME: "worker-a",
        AGENTMUX_PROJECT: "proj",
        AGENTMUX_ROLE: "worker",
        AGENTMUX_DEPTH: "1"
      }
    ));
    assertAgentmuxOk(runAgentmux(harness, ["worker", "proj", "explicit-child", "--workdir", harness.workspacePath, "--harness", "shell", "--parent", "worker-a"]));

    const payload = readProjectPayload(harness, "proj");
    const sessions = sessionsByName(payload);

    assert.equal(payload.manager.name, "proj-general");
    assert.equal(sessions.get("proj-general").role, "commander");
    assert.equal(sessions.get("proj-general").depth, 0);
    assert.equal(sessions.get("proj-general").parent_agent, "");
    assert.equal(sessions.get("worker-a").role, "worker");
    assert.equal(sessions.get("worker-a").parent_agent, "proj-general");
    assert.equal(sessions.get("worker-a").depth, 1);
    assert.equal(sessions.get("worker-a").commander_agent, "proj-general");
    assert.equal(sessions.get("grandchild").parent_agent, "worker-a");
    assert.equal(sessions.get("grandchild").depth, 2);
    assert.equal(sessions.get("grandchild").commander_agent, "proj-general");
    assert.equal(sessions.get("explicit-child").parent_agent, "worker-a");
    assert.equal(sessions.get("explicit-child").depth, 2);

    const grandchildCall = readNewSessionCalls(harness).find((args) => args.some((arg) => /^agentmux-grandchild-/u.test(arg)));

    assert.ok(grandchildCall, "expected fake tmux to record grandchild creation");
    assert.ok(grandchildCall.includes("AGENTMUX_PARENT_AGENT=worker-a"));
    assert.ok(grandchildCall.includes("AGENTMUX_DEPTH=2"));
    assert.ok(grandchildCall.includes("AGENTMUX_COMMANDER_AGENT=proj-general"));
    assert.ok(grandchildCall.includes("AGENTMUX_PROJECT=proj"));
  } finally {
    harness.cleanup();
  }
});

test("agentmux rejects invalid explicit worker parents", () => {
  const harness = createAgentmuxHarness();

  try {
    assertAgentmuxOk(runAgentmux(harness, ["project-sync", "proj", "--workdir", harness.workspacePath, "--harness", "shell", "--json"]));
    assertAgentmuxOk(runAgentmux(harness, ["project-sync", "other", "--workdir", harness.workspacePath, "--harness", "shell", "--json"]));
    assertAgentmuxOk(runAgentmux(harness, ["worker", "other", "other-worker", "--workdir", harness.workspacePath, "--harness", "shell"]));

    const missingParent = runAgentmux(harness, ["worker", "proj", "bad-child", "--workdir", harness.workspacePath, "--harness", "shell", "--parent", "missing-agent"]);
    assert.notEqual(missingParent.status, 0);
    assert.match(`${missingParent.stderr}\n${missingParent.stdout}`, /No session found for 'missing-agent'/u);

    const crossProjectParent = runAgentmux(harness, ["worker", "proj", "bad-child", "--workdir", harness.workspacePath, "--harness", "shell", "--parent", "other-worker"]);
    assert.notEqual(crossProjectParent.status, 0);
    assert.match(`${crossProjectParent.stderr}\n${crossProjectParent.stdout}`, /belongs to project 'other', not 'proj'/u);

    const selfParent = runAgentmux(harness, ["worker", "proj", "proj-general", "--workdir", harness.workspacePath, "--harness", "shell", "--parent", "proj-general"]);
    assert.notEqual(selfParent.status, 0);
    assert.match(`${selfParent.stderr}\n${selfParent.stdout}`, /Worker cannot use itself as its parent/u);
  } finally {
    harness.cleanup();
  }
});
