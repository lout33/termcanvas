const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");

const repoRoot = path.join(__dirname, "..");
const agentmuxScriptPath = path.join(repoRoot, "vendor", "agentmux", "agentmux.py");

function createAgentmuxHarness() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "termcanvas-agentmux-ask-"));
  const binPath = path.join(root, "bin");
  const homePath = path.join(root, "home");
  const workspacePath = path.join(root, "workspace");
  const tmuxLogPath = path.join(root, "tmux.log");
  const paneFilePath = path.join(root, "pane.txt");

  fs.mkdirSync(binPath, { recursive: true });
  fs.mkdirSync(homePath, { recursive: true });
  fs.mkdirSync(workspacePath, { recursive: true });
  fs.writeFileSync(paneFilePath, "SHELL READY\n$", "utf8");
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
      "  if (process.env.FAKE_TMUX_PANE_FILE && fs.existsSync(process.env.FAKE_TMUX_PANE_FILE)) {",
      "    process.stdout.write(fs.readFileSync(process.env.FAKE_TMUX_PANE_FILE, 'utf8'));",
      "  } else {",
      "    process.stdout.write('$\\n');",
      "  }",
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
    paneFilePath,
    cleanup() {
      fs.rmSync(root, { recursive: true, force: true });
    }
  };
}

function agentmuxEnv(harness, envOverrides = {}) {
  return {
    ...process.env,
    PATH: `${harness.binPath}${path.delimiter}${process.env.PATH ?? ""}`,
    AGENTMUX_HOME: harness.homePath,
    FAKE_TMUX_LOG: harness.tmuxLogPath,
    FAKE_TMUX_PANE_FILE: harness.paneFilePath,
    SHELL: "/bin/sh",
    ...envOverrides
  };
}

function runAgentmux(harness, args, envOverrides = {}) {
  return spawnSync("python3", [agentmuxScriptPath, ...args], {
    cwd: harness.workspacePath,
    encoding: "utf8",
    env: agentmuxEnv(harness, envOverrides)
  });
}

function runAgentmuxAsync(harness, args, envOverrides = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn("python3", [agentmuxScriptPath, ...args], {
      cwd: harness.workspacePath,
      env: agentmuxEnv(harness, envOverrides)
    });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (status) => {
      resolve({ status, stdout, stderr });
    });
  });
}

function assertAgentmuxOk(result) {
  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
}

function delay(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function setupSiblingWorkers(harness) {
  assertAgentmuxOk(runAgentmux(harness, ["worker", "proj", "worker-a", "--workdir", harness.workspacePath, "--harness", "shell"]));
  assertAgentmuxOk(runAgentmux(harness, ["worker", "proj", "worker-b", "--workdir", harness.workspacePath, "--harness", "shell"]));
}

test("ask refuses managed callers without a graph connection and self-asks", () => {
  const harness = createAgentmuxHarness();

  try {
    setupSiblingWorkers(harness);

    const unconnected = runAgentmux(
      harness,
      ["ask", "worker-b", "ping", "--timeout", "1", "--stable", "0.2"],
      { AGENTMUX_AGENT_NAME: "worker-a" }
    );
    assert.notEqual(unconnected.status, 0);
    assert.match(unconnected.stderr, /'worker-a' is not connected to 'worker-b'/u);
    assert.match(unconnected.stderr, /agentmux connect worker-a worker-b/u);

    const selfAsk = runAgentmux(
      harness,
      ["ask", "worker-b", "ping", "--timeout", "1", "--stable", "0.2"],
      { AGENTMUX_AGENT_NAME: "worker-b" }
    );
    assert.notEqual(selfAsk.status, 0);
    assert.match(selfAsk.stderr, /cannot ask itself/u);

    const forced = runAgentmux(
      harness,
      ["ask", "worker-b", "ping", "--timeout", "1", "--stable", "0.2", "--force"],
      { AGENTMUX_AGENT_NAME: "worker-a" }
    );
    assert.notEqual(forced.status, 0);
    assert.match(forced.stderr, /Timed out/u, "--force should get past the permission check and reach the wait loop");
  } finally {
    harness.cleanup();
  }
});

test("ask injects the prompt and returns the answer once the pane stabilizes", async () => {
  const harness = createAgentmuxHarness();

  try {
    setupSiblingWorkers(harness);
    assertAgentmuxOk(runAgentmux(harness, ["connect", "worker-a", "worker-b"]));

    const askPromise = runAgentmuxAsync(
      harness,
      ["ask", "worker-b", "What is 6x7?", "--timeout", "10", "--stable", "0.3"],
      { AGENTMUX_AGENT_NAME: "worker-a" }
    );

    await delay(700);
    fs.appendFileSync(harness.paneFilePath, " What is 6x7?\nANSWER: 42", "utf8");

    const result = await askPromise;
    assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
    assert.equal(result.stdout.trim(), "ANSWER: 42");

    const sendCall = fs.readFileSync(harness.tmuxLogPath, "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line))
      .find((args) => args[0] === "send-keys" && args.includes("-l") && args.includes("What is 6x7?"));
    assert.ok(sendCall, "expected the prompt to be injected into the target pane");
  } finally {
    harness.cleanup();
  }
});

test("ask times out when the target never finishes and points at check", () => {
  const harness = createAgentmuxHarness();

  try {
    setupSiblingWorkers(harness);

    const result = runAgentmux(harness, ["ask", "worker-b", "ping", "--timeout", "1", "--stable", "0.3"]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Timed out after 1s waiting for 'worker-b'/u);
    assert.match(result.stderr, /agentmux check worker-b/u);
  } finally {
    harness.cleanup();
  }
});

test("check peeks at the pane without injecting input", () => {
  const harness = createAgentmuxHarness();

  try {
    setupSiblingWorkers(harness);
    fs.writeFileSync(harness.paneFilePath, "WORKER LOG LINE\n$", "utf8");
    const logSizeBefore = fs.readFileSync(harness.tmuxLogPath, "utf8")
      .trim()
      .split("\n")
      .filter((line) => line.includes("send-keys")).length;

    const result = runAgentmux(harness, ["check", "worker-b"]);
    assertAgentmuxOk(result);
    assert.match(result.stdout, /WORKER LOG LINE/u);

    const logSizeAfter = fs.readFileSync(harness.tmuxLogPath, "utf8")
      .trim()
      .split("\n")
      .filter((line) => line.includes("send-keys")).length;
    assert.equal(logSizeAfter, logSizeBefore, "check must not send keys to the pane");
  } finally {
    harness.cleanup();
  }
});
