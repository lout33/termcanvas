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
    assert.ok(grandchildCall.includes(`AGENTMUX_HOME=${harness.homePath}`));
    assert.ok(grandchildCall.some((arg) => /^LANG=.*UTF-?8$/iu.test(arg)));
    assert.ok(grandchildCall.some((arg) => /^LC_CTYPE=.*UTF-?8$/iu.test(arg)));
    assert.ok(grandchildCall.some((arg) => /^AGENTMUX_BIN=.*vendor\/agentmux\/agentmux$/u.test(arg)));
    assert.ok(grandchildCall.some((arg) => arg.startsWith("PATH=") && arg.includes(harness.binPath)));
    assert.ok(grandchildCall.includes("-u"));
    assert.ok(grandchildCall.includes("NO_COLOR"));
    assert.ok(grandchildCall.includes("COLORTERM=truecolor"));
    assert.ok(grandchildCall.includes("CLICOLOR=1"));
    assert.ok(grandchildCall.includes("CLICOLOR_FORCE=1"));
    assert.ok(grandchildCall.includes("FORCE_COLOR=3"));

    const showWorker = runAgentmux(harness, ["show", "worker-a"]);
    assertAgentmuxOk(showWorker);
    assert.match(showWorker.stdout, /role:\s+worker/u);
    assert.match(showWorker.stdout, /parent:\s+proj-general/u);
    assert.match(showWorker.stdout, /depth:\s+1/u);
    assert.match(showWorker.stdout, /session awareness:/u);
    assert.match(showWorker.stdout, /env \| grep '\^AGENTMUX_'/u);
    assert.match(showWorker.stdout, /worker proj "<worker-name>" --workdir/u);
    assert.match(showWorker.stdout, /--parent worker-a/u);
    assert.match(showWorker.stdout, /do not create raw tmux worker sessions/u);
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

test("agentmux command center shows tree and status for child-worker projects", () => {
  const harness = createAgentmuxHarness();

  try {
    assertAgentmuxOk(runAgentmux(harness, ["project-sync", "proj", "--workdir", harness.workspacePath, "--harness", "shell", "--json"]));
    assertAgentmuxOk(runAgentmux(harness, ["worker", "proj", "worker-a", "--workdir", harness.workspacePath, "--harness", "shell"]));
    assertAgentmuxOk(runAgentmux(harness, ["child", "worker-a", "child-a", "--prompt", "Handle the subtask"]));
    assertAgentmuxOk(runAgentmux(
      harness,
      ["worker", "env-child", "--workdir", harness.workspacePath, "--harness", "shell"],
      { AGENTMUX_PROJECT: "proj" }
    ));

    const payload = readProjectPayload(harness, "proj");
    const sessions = sessionsByName(payload);

    assert.equal(sessions.get("child-a").parent_agent, "worker-a");
    assert.equal(sessions.get("child-a").depth, 2);
    assert.equal(sessions.get("env-child").parent_agent, "proj-general");
    assert.equal(sessions.get("env-child").depth, 1);

    const tree = runAgentmux(harness, ["tree", "proj"]);
    assertAgentmuxOk(tree);
    assert.match(tree.stdout, /Project: proj/u);
    assert.match(tree.stdout, /proj-general \(commander\)/u);
    assert.match(tree.stdout, /worker-a \(worker\)/u);
    assert.match(tree.stdout, /child-a \(worker\).*depth=2/u);
    assert.match(tree.stdout, /Command center:/u);
    assert.match(tree.stdout, /agentmux.* mission proj "<mission>"/u);
    assert.match(tree.stdout, /agentmux.* child <parent-agent> <worker-name> --prompt "<task>"/u);
    assert.match(tree.stdout, /agentmux.* logs <agent> --lines 120/u);
    assert.match(tree.stdout, /agentmux.* send <agent> "<prompt>"/u);
    assert.match(tree.stdout, /agentmux.* stop <agent>/u);

    const status = runAgentmux(harness, ["status"], { AGENTMUX_PROJECT: "proj" });
    assertAgentmuxOk(status);
    assert.match(status.stdout, /Project: proj/u);
    assert.match(status.stdout, /Runtime:/u);
    assert.match(status.stdout, /Attention:/u);
    assert.match(status.stdout, /Command center:/u);

    const treeJson = runAgentmux(harness, ["tree", "proj", "--json"]);
    assertAgentmuxOk(treeJson);
    const treePayload = JSON.parse(treeJson.stdout);
    assert.equal(treePayload.project, "proj");
    assert.equal(treePayload.manager.name, "proj-general");
    assert.ok(Array.isArray(treePayload.tree));
  } finally {
    harness.cleanup();
  }
});

test("agentmux mission sends a delegation-oriented prompt to the project commander", () => {
  const harness = createAgentmuxHarness();

  try {
    const mission = runAgentmux(harness, [
      "mission",
      "proj",
      "Build the next feature",
      "--workdir",
      harness.workspacePath,
      "--harness",
      "shell"
    ]);
    assertAgentmuxOk(mission);
    assert.match(mission.stdout, /Sent mission to proj-general/u);
    assert.match(mission.stdout, /agentmux.* tree proj/u);
    assert.match(mission.stdout, /agentmux.* logs proj-general --lines 120/u);

    const sendLiteralCall = readTmuxCalls(harness).find((args) => (
      args[0] === "send-keys"
      && args.includes("-l")
      && args.some((arg) => typeof arg === "string" && arg.includes("Build the next feature"))
    ));

    assert.ok(sendLiteralCall, "expected mission text to be sent to the commander");
    const sentText = sendLiteralCall[sendLiteralCall.indexOf("-l") + 1];

    assert.match(sentText, /Mission for TermCanvas project `proj`:/u);
    assert.match(sentText, /Create child workers when delegation helps/u);
    assert.match(sentText, /agentmux.* child "\$AGENTMUX_AGENT_NAME" <worker-name> --prompt "<task>"/u);
    assert.match(sentText, /Do not create raw tmux sessions/u);

    const envMission = runAgentmux(harness, ["mission", "Follow up from env"], { AGENTMUX_PROJECT: "proj" });
    assertAgentmuxOk(envMission);
    assert.match(envMission.stdout, /Sent mission to proj-general/u);
  } finally {
    harness.cleanup();
  }
});
