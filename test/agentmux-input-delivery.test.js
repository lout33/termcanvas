const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const repoRoot = path.join(__dirname, "..");
const agentmuxScriptPath = path.join(repoRoot, "vendor", "agentmux", "agentmux.py");

function createHarness() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "termcanvas-agentmux-input-"));
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
      "let stdin = '';",
      "process.stdin.setEncoding('utf8');",
      "process.stdin.on('data', (chunk) => { stdin += chunk; });",
      "process.stdin.on('end', () => {",
      "  fs.appendFileSync(process.env.FAKE_TMUX_LOG, `${JSON.stringify({ args, stdin })}\\n`, 'utf8');",
      "  if (args[0] === 'paste-buffer' && process.env.FAKE_TMUX_FAIL_PASTE === '1') process.exit(1);",
      "  if (args[0] === 'capture-pane') process.stdout.write('$\\n');",
      "  if (args[0] === 'list-panes' || args[0] === 'list-sessions') process.exit(1);",
      "  process.exit(0);",
      "});",
      ""
    ].join("\n"),
    { mode: 0o755 }
  );

  const run = (args, env = {}) => spawnSync("python3", [agentmuxScriptPath, ...args], {
    cwd: workspacePath,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${binPath}${path.delimiter}${process.env.PATH ?? ""}`,
      AGENTMUX_HOME: homePath,
      FAKE_TMUX_LOG: tmuxLogPath,
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

  const created = run(["worker", "input-test", "target", "--workdir", workspacePath, "--harness", "shell"]);
  assert.equal(created.status, 0, `${created.stderr}\n${created.stdout}`);
  fs.writeFileSync(tmuxLogPath, "", "utf8");

  return {
    run,
    readTmuxCalls,
    clearTmuxCalls: () => fs.writeFileSync(tmuxLogPath, "", "utf8"),
    cleanup: () => fs.rmSync(root, { recursive: true, force: true })
  };
}

function assertAgentmuxOk(result) {
  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
}

function inputDeliveryCalls(calls) {
  return calls.filter(({ args }) => ["load-buffer", "paste-buffer", "delete-buffer", "send-keys"].includes(args[0]));
}

test("ordinary agentmux input keeps the literal send-keys path and Enter ordering", () => {
  const harness = createHarness();

  try {
    assertAgentmuxOk(harness.run(["send", "target", "ordinary prompt"]));
    const calls = inputDeliveryCalls(harness.readTmuxCalls());
    const targetSession = calls[0].args[2];

    assert.match(targetSession, /^agentmux-target-[a-f0-9]{8}$/u);
    assert.deepEqual(calls, [
      { args: ["send-keys", "-t", targetSession, "-l", "ordinary prompt"], stdin: "" },
      { args: ["send-keys", "-t", targetSession, "Enter"], stdin: "" }
    ]);
  } finally {
    harness.cleanup();
  }
});

test("large and multiline agentmux input use isolated buffers, clean up, and remain responsive", () => {
  const harness = createHarness();
  const firstPrompt = "first delegated line\nsecond delegated line";
  const secondPrompt = "x".repeat(5000);

  try {
    assertAgentmuxOk(harness.run(["send", "target", firstPrompt]));
    assertAgentmuxOk(harness.run(["send", "target", secondPrompt]));
    assertAgentmuxOk(harness.run(["send", "target", "recovery-probe", "--no-enter"]));

    const calls = inputDeliveryCalls(harness.readTmuxCalls());
    const loadCalls = calls.filter(({ args }) => args[0] === "load-buffer");
    const firstBufferName = loadCalls[0].args[2];
    const secondBufferName = loadCalls[1].args[2];
    const targetSession = calls.find(({ args }) => args[0] === "paste-buffer").args[6];

    assert.equal(loadCalls[0].stdin, firstPrompt);
    assert.equal(loadCalls[1].stdin, secondPrompt);
    assert.match(firstBufferName, /^agentmux-input-[a-f0-9]{32}$/u);
    assert.match(secondBufferName, /^agentmux-input-[a-f0-9]{32}$/u);
    assert.notEqual(firstBufferName, secondBufferName);
    assert.deepEqual(calls.slice(0, 4).map(({ args }) => args), [
      ["load-buffer", "-b", firstBufferName, "-"],
      ["paste-buffer", "-p", "-d", "-b", firstBufferName, "-t", targetSession],
      ["delete-buffer", "-b", firstBufferName],
      ["send-keys", "-t", targetSession, "Enter"]
    ]);
    assert.deepEqual(calls.slice(4, 8).map(({ args }) => args), [
      ["load-buffer", "-b", secondBufferName, "-"],
      ["paste-buffer", "-p", "-d", "-b", secondBufferName, "-t", targetSession],
      ["delete-buffer", "-b", secondBufferName],
      ["send-keys", "-t", targetSession, "Enter"]
    ]);
    assert.deepEqual(calls.at(-1), {
      args: ["send-keys", "-t", targetSession, "-l", "recovery-probe"],
      stdin: ""
    });
  } finally {
    harness.cleanup();
  }
});

test("failed buffered paste still deletes its unique tmux buffer and never sends Enter", () => {
  const harness = createHarness();

  try {
    const result = harness.run(["send", "target", "first line\nsecond line"], {
      FAKE_TMUX_FAIL_PASTE: "1"
    });
    const calls = inputDeliveryCalls(harness.readTmuxCalls());
    const bufferName = calls[0].args[2];
    const targetSession = calls[1].args[6];

    assert.notEqual(result.status, 0);
    assert.deepEqual(calls.map(({ args }) => args), [
      ["load-buffer", "-b", bufferName, "-"],
      ["paste-buffer", "-p", "-d", "-b", bufferName, "-t", targetSession],
      ["delete-buffer", "-b", bufferName]
    ]);
  } finally {
    harness.cleanup();
  }
});
