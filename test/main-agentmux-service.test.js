const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const { buildPackagedRuntimePath, createAgentmuxService, deriveCanvasProjectTag } = require("../main_agentmux_service.js");

test("deriveCanvasProjectTag keeps canvas projects stable and scoped", () => {
  assert.equal(
    deriveCanvasProjectTag("/tmp/My Project", "canvas-Alpha_123"),
    "my-project-canvas-alp"
  );
});

test("packaged agentmux service prefers bundled runtime and writable app data", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "termcanvas-agentmux-"));
  const bundledRoot = path.join(tempRoot, "agentmux");
  const userDataPath = path.join(tempRoot, "user-data");
  const originalResourcesPath = process.resourcesPath;

  fs.mkdirSync(bundledRoot, { recursive: true });
  fs.mkdirSync(userDataPath, { recursive: true });
  fs.writeFileSync(path.join(bundledRoot, "agentmux"), "#!/usr/bin/env bash\n", "utf8");
  fs.writeFileSync(path.join(bundledRoot, "agentmux.py"), "#!/usr/bin/env python3\n", "utf8");
  process.resourcesPath = tempRoot;

  try {
    const service = createAgentmuxService({
      envPath: "/custom/bin:/usr/bin",
      app: {
        isPackaged: true,
        getPath: (name) => {
          assert.equal(name, "userData");
          return userDataPath;
        }
      }
    });
    const invocation = service.getAgentmuxInvocation();

    assert.equal(service.rootPath, bundledRoot);
    assert.equal(service.agentmuxHomePath, path.join(userDataPath, "agentmux"));
    assert.equal(invocation.command, path.join(bundledRoot, "agentmux"));
    assert.deepEqual(invocation.argsPrefix, []);
    assert.equal(invocation.envOverrides.AGENTMUX_HOME, path.join(userDataPath, "agentmux"));
    assert.equal(invocation.envOverrides.PATH, buildPackagedRuntimePath("/custom/bin:/usr/bin"));
    assert.match(invocation.displayText, /AGENTMUX_HOME=/);
    assert.match(invocation.displayText, /PATH=/);
    assert.match(invocation.displayText, /agentmux"?$/);
  } finally {
    process.resourcesPath = originalResourcesPath;
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("packaged runtime path includes common mac cli install locations first", () => {
  const homeDirectory = os.homedir();

  assert.equal(
    buildPackagedRuntimePath("/custom/bin:/opt/homebrew/bin:/usr/bin"),
    [
      path.join(homeDirectory, ".opencode/bin"),
      path.join(homeDirectory, ".local/bin"),
      path.join(homeDirectory, ".bun/bin"),
      path.join(homeDirectory, ".npm-global/bin"),
      "/opt/homebrew/bin",
      "/usr/local/bin",
      "/usr/bin",
      "/bin",
      "/usr/sbin",
      "/sbin",
      "/custom/bin"
    ].join(path.delimiter)
  );
});

test("development agentmux service uses vendored runtime by default", () => {
  const repoRoot = path.join(__dirname, "..");
  const originalAgentmuxRoot = process.env.TERMCANVAS_AGENTMUX_ROOT;
  delete process.env.TERMCANVAS_AGENTMUX_ROOT;

  try {
    const service = createAgentmuxService({ agentmuxHomePath: path.join(repoRoot, ".tmp-agentmux-home") });
    const invocation = service.getAgentmuxInvocation();

    assert.equal(service.rootPath, path.join(repoRoot, "vendor", "agentmux"));
    assert.equal(invocation.command, path.join(repoRoot, "vendor", "agentmux", "agentmux"));
    assert.deepEqual(invocation.argsPrefix, []);
    assert.equal(invocation.envOverrides.AGENTMUX_HOME, path.join(repoRoot, ".tmp-agentmux-home"));
  } finally {
    if (originalAgentmuxRoot === undefined) {
      delete process.env.TERMCANVAS_AGENTMUX_ROOT;
    } else {
      process.env.TERMCANVAS_AGENTMUX_ROOT = originalAgentmuxRoot;
    }
  }
});

test("buildTerminalAgentEnv gives canvas terminals full agentmux context", () => {
  const repoRoot = path.join(__dirname, "..");
  const service = createAgentmuxService({ agentmuxHomePath: path.join(repoRoot, ".tmp-agentmux-home") });

  const env = service.buildTerminalAgentEnv({
    projectTag: "proj-abc123",
    agentName: "terminal-3f9c2a",
    workdir: "/tmp/workspace",
    tmuxSessionName: "termcanvas-node-1"
  });

  assert.equal(env.AGENTMUX_PROJECT, "proj-abc123");
  assert.equal(env.AGENTMUX_AGENT_NAME, "terminal-3f9c2a");
  assert.equal(env.AGENTMUX_ROLE, "agent");
  assert.equal(env.AGENTMUX_DEPTH, "0");
  assert.equal(env.AGENTMUX_PARENT_AGENT, "");
  assert.equal(env.AGENTMUX_WORKDIR, "/tmp/workspace");
  assert.equal(env.AGENTMUX_TMUX_SESSION, "termcanvas-node-1");
  assert.equal(env.AGENTMUX_BIN, path.join(repoRoot, "vendor", "agentmux", "agentmux"));
  assert.equal(env.AGENTMUX_HOME, path.join(repoRoot, ".tmp-agentmux-home"));
  assert.deepEqual(service.buildTerminalRuntimeEnv(), {
    AGENTMUX_HOME: path.join(repoRoot, ".tmp-agentmux-home"),
    AGENTMUX_BIN: path.join(repoRoot, "vendor", "agentmux", "agentmux")
  });

  assert.deepEqual(service.buildTerminalAgentEnv({ projectTag: "", agentName: "x" }), {});
  assert.deepEqual(service.buildTerminalAgentEnv({ projectTag: "proj", agentName: null }), {});
});

test("canvas sync accepts a persisted project tag without a workspace folder", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "termcanvas-agentmux-project-only-"));
  const runtimeRoot = path.join(tempRoot, "runtime");
  const agentmuxHomePath = path.join(tempRoot, "home");

  fs.mkdirSync(runtimeRoot, { recursive: true });
  fs.writeFileSync(
    path.join(runtimeRoot, "agentmux.py"),
    "import json\nprint(json.dumps({'project': 'persisted-project', 'sessions': [], 'edges': []}))\n",
    "utf8"
  );

  try {
    const service = createAgentmuxService({
      agentmuxRootPath: runtimeRoot,
      agentmuxHomePath
    });
    const snapshot = await service.syncCanvasProject({
      canvasId: "canvas-1",
      projectTag: "persisted-project",
      workspaceRootPath: null
    });

    assert.equal(snapshot.project, "persisted-project");
    assert.deepEqual(snapshot.sessions, []);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("restartAgent parses tmux session name from agentmux restart output", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "termcanvas-agentmux-restart-"));
  const runtimeRoot = path.join(tempRoot, "runtime");
  const agentmuxHomePath = path.join(tempRoot, "home");

  fs.mkdirSync(runtimeRoot, { recursive: true });
  fs.writeFileSync(
    path.join(runtimeRoot, "agentmux.py"),
    [
      "import sys",
      "assert sys.argv[1] == 'restart'",
      "assert sys.argv[2] == 'opencode-worker'",
      "print('Restarted opencode-worker (abc123)')",
      "print('tmux: agentmux-opencode-worker-abc123')",
      "print('run:  opencode --model ollama-cloud/glm-5.2 -s abc123')"
    ].join("\n"),
    "utf8"
  );

  try {
    const service = createAgentmuxService({
      agentmuxRootPath: runtimeRoot,
      agentmuxHomePath
    });
    const result = await service.restartAgent({ agentName: "opencode-worker" });

    assert.equal(result.agentName, "opencode-worker");
    assert.equal(result.tmuxSessionName, "agentmux-opencode-worker-abc123");
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("restartAgent passes ready timeout flag through", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "termcanvas-agentmux-restart-flags-"));
  const runtimeRoot = path.join(tempRoot, "runtime");
  const agentmuxHomePath = path.join(tempRoot, "home");

  fs.mkdirSync(runtimeRoot, { recursive: true });
  fs.writeFileSync(
    path.join(runtimeRoot, "agentmux.py"),
    [
      "import sys, json",
      "print(json.dumps(sys.argv))",
      "print('Restarted x (y)')",
      "print('tmux: agentmux-x-y')",
      "print('run:  opencode')"
    ].join("\n"),
    "utf8"
  );

  try {
    const service = createAgentmuxService({
      agentmuxRootPath: runtimeRoot,
      agentmuxHomePath
    });
    const result = await service.restartAgent({
      agentName: "x",
      readyTimeout: 10
    });

    assert.equal(result.agentName, "x");
    assert.equal(result.tmuxSessionName, "agentmux-x-y");
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("restartAgent rejects when agent name is missing", async () => {
  const repoRoot = path.join(__dirname, "..");
  const service = createAgentmuxService({ agentmuxHomePath: path.join(repoRoot, ".tmp-agentmux-home") });

  await assert.rejects(
    () => service.restartAgent({ agentName: null }),
    /Agent name is required/u
  );
  await assert.rejects(
    () => service.restartAgent({}),
    /Agent name is required/u
  );
});

test("resumeAgent parses tmux session name from agentmux resume output", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "termcanvas-agentmux-resume-"));
  const runtimeRoot = path.join(tempRoot, "runtime");
  const agentmuxHomePath = path.join(tempRoot, "home");

  fs.mkdirSync(runtimeRoot, { recursive: true });
  fs.writeFileSync(
    path.join(runtimeRoot, "agentmux.py"),
    [
      "import sys",
      "assert sys.argv[1] == 'resume'",
      "assert sys.argv[2] == 'opencode-worker'",
      "print('Resumed opencode-worker (abc123)')",
      "print('tmux: agentmux-opencode-worker-abc123')",
      "print('run:  opencode --model ollama-cloud/glm-5.2 -s abc123')"
    ].join("\n"),
    "utf8"
  );

  try {
    const service = createAgentmuxService({
      agentmuxRootPath: runtimeRoot,
      agentmuxHomePath
    });
    const result = await service.resumeAgent({ agentName: "opencode-worker" });

    assert.equal(result.agentName, "opencode-worker");
    assert.equal(result.tmuxSessionName, "agentmux-opencode-worker-abc123");
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("resumeAgent passes prompt and ready timeout flags through", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "termcanvas-agentmux-resume-flags-"));
  const runtimeRoot = path.join(tempRoot, "runtime");
  const agentmuxHomePath = path.join(tempRoot, "home");

  fs.mkdirSync(runtimeRoot, { recursive: true });
  fs.writeFileSync(
    path.join(runtimeRoot, "agentmux.py"),
    [
      "import sys, json",
      "print(json.dumps(sys.argv))",
      "print('Resumed x (y)')",
      "print('tmux: agentmux-x-y')",
      "print('run:  opencode')"
    ].join("\n"),
    "utf8"
  );

  try {
    const service = createAgentmuxService({
      agentmuxRootPath: runtimeRoot,
      agentmuxHomePath
    });
    const result = await service.resumeAgent({
      agentName: "x",
      prompt: "Continue the task",
      readyTimeout: 10
    });

    assert.equal(result.agentName, "x");
    assert.equal(result.tmuxSessionName, "agentmux-x-y");
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("resumeAgent rejects when agent name is missing", async () => {
  const repoRoot = path.join(__dirname, "..");
  const service = createAgentmuxService({ agentmuxHomePath: path.join(repoRoot, ".tmp-agentmux-home") });

  await assert.rejects(
    () => service.resumeAgent({ agentName: null }),
    /Agent name is required/u
  );
  await assert.rejects(
    () => service.resumeAgent({}),
    /Agent name is required/u
  );
});

test("reparentAgent sends a parent or root update to agentmux", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "termcanvas-agentmux-reparent-"));
  const runtimeRoot = path.join(tempRoot, "runtime");
  const callsPath = path.join(tempRoot, "calls.jsonl");
  fs.mkdirSync(runtimeRoot, { recursive: true });
  fs.writeFileSync(
    path.join(runtimeRoot, "agentmux.py"),
    `import json, sys\nwith open(${JSON.stringify(callsPath)}, 'a') as f: f.write(json.dumps(sys.argv[1:]) + '\\n')\n`,
    "utf8"
  );

  try {
    const service = createAgentmuxService({
      agentmuxRootPath: runtimeRoot,
      agentmuxHomePath: path.join(tempRoot, "home")
    });
    await service.reparentAgent("child", "new-parent");
    await service.reparentAgent("child", null);

    assert.deepEqual(
      fs.readFileSync(callsPath, "utf8").trim().split("\n").map((line) => JSON.parse(line)),
      [["reparent", "child", "--parent", "new-parent"], ["reparent", "child", "--root"]]
    );
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("spawnChildWorker runs agentmux worker --parent and parses the echoed agent/tmux session", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "termcanvas-agentmux-spawn-child-"));
  const runtimeRoot = path.join(tempRoot, "runtime");
  const agentmuxHomePath = path.join(tempRoot, "home");

  fs.mkdirSync(runtimeRoot, { recursive: true });
  fs.writeFileSync(
    path.join(runtimeRoot, "agentmux.py"),
    [
      "import sys, json, shlex",
      "assert sys.argv[1] == 'worker'",
      "assert sys.argv[2] == 'my-proj'",
      // The third positional is the agent name we generated (child-<6hex).
      "assert sys.argv[3].startswith('child-') and len(sys.argv[3]) >= 7",
      "assert sys.argv[4] == '--harness'",
      "assert sys.argv[5] == 'shell'",
      "assert sys.argv[6] == '--parent'",
      "assert sys.argv[7] == 'parent-agent'",
      "assert sys.argv[8] == '--workdir'",
      "assert sys.argv[9] == '/tmp/cwd'",
      "name = sys.argv[3]",
      "print('Created worker ' + name + ' (abc123)')",
      "print('tmux: agentmux-' + name + '-abc123')",
      "print('cwd:  /tmp/cwd')"
    ].join("\n"),
    "utf8"
  );

  try {
    const service = createAgentmuxService({
      agentmuxRootPath: runtimeRoot,
      agentmuxHomePath
    });
    const result = await service.spawnChildWorker({
      projectTag: "my-proj",
      parentAgentName: "parent-agent",
      workdir: "/tmp/cwd"
    });

    assert.equal(result.parentAgentName, "parent-agent");
    assert.equal(result.projectTag, "my-proj");
    assert.match(result.agentName, /^child-[a-z0-9]{6}$/u);
    assert.equal(result.tmuxSessionName, `agentmux-${result.agentName}-abc123`);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("spawnChildWorker throws when agentmux worker output omits the tmux session line", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "termcanvas-agentmux-spawn-child-no-tmux-"));
  const runtimeRoot = path.join(tempRoot, "runtime");
  const agentmuxHomePath = path.join(tempRoot, "home");

  fs.mkdirSync(runtimeRoot, { recursive: true });
  fs.writeFileSync(
    path.join(runtimeRoot, "agentmux.py"),
    [
      "import sys",
      "print('Created worker ' + sys.argv[3] + ' (abc123)')"
    ].join("\n"),
    "utf8"
  );

  try {
    const service = createAgentmuxService({
      agentmuxRootPath: runtimeRoot,
      agentmuxHomePath
    });

    await assert.rejects(
      () => service.spawnChildWorker({
        projectTag: "my-proj",
        parentAgentName: "parent-agent",
        workdir: "/tmp/cwd"
      }),
      /did not report a tmux session/u
    );
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("spawnChildWorker rejects missing project tag or parent agent name", async () => {
  const repoRoot = path.join(__dirname, "..");
  const service = createAgentmuxService({ agentmuxHomePath: path.join(repoRoot, ".tmp-agentmux-home") });

  await assert.rejects(
    () => service.spawnChildWorker({ parentAgentName: "p", workdir: "/tmp" }),
    /project tag is required/u
  );
  await assert.rejects(
    () => service.spawnChildWorker({ projectTag: "proj", workdir: "/tmp" }),
    /parent agent name is required/u
  );
  await assert.rejects(
    () => service.spawnChildWorker({}),
    /project tag is required/u
  );
});

test("vendored agentmux recovers app-scoped home from a repaired tmux session", () => {
  const repoRoot = path.join(__dirname, "..");
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "termcanvas-agentmux-wrapper-home-"));
  const binPath = path.join(tempRoot, "bin");
  const recoveredHomePath = path.join(tempRoot, "recovered-home");

  fs.mkdirSync(binPath, { recursive: true });
  fs.writeFileSync(
    path.join(binPath, "tmux"),
    [
      "#!/usr/bin/env bash",
      "if [[ \"$1\" == \"display-message\" ]]; then printf '%s\\n' 'canvas-session'; exit 0; fi",
      "if [[ \"$1\" == \"show-environment\" ]]; then printf 'AGENTMUX_HOME=%s\\n' \"$FAKE_AGENTMUX_HOME\"; exit 0; fi",
      "exit 1",
      ""
    ].join("\n"),
    { mode: 0o755 }
  );

  const env = {
    ...process.env,
    PATH: `${binPath}${path.delimiter}${process.env.PATH ?? ""}`,
    TMUX: "fake-tmux-socket,1,0",
    FAKE_AGENTMUX_HOME: recoveredHomePath
  };
  delete env.AGENTMUX_HOME;

  try {
    const result = spawnSync(path.join(repoRoot, "vendor", "agentmux", "agentmux"), ["ls", "--json"], {
      cwd: repoRoot,
      encoding: "utf8",
      env
    });

    assert.equal(result.status, 0, result.stderr);
    assert.equal(fs.existsSync(path.join(recoveredHomePath, "agentmux.db")), true);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("release config bundles agentmux from electron-builder config", () => {
  const repoRoot = path.join(__dirname, "..");
  const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"));
  const skillsShConfig = JSON.parse(fs.readFileSync(path.join(repoRoot, "skills.sh.json"), "utf8"));
  const electronBuilderConfig = fs.readFileSync(path.join(repoRoot, "electron-builder.yml"), "utf8");

  assert.equal(packageJson.build, undefined);
  assert.equal(skillsShConfig.$schema, "https://skills.sh/schemas/skills.sh.schema.json");
  assert.deepEqual(skillsShConfig.groupings[0].skills, ["agentmux"]);
  assert.match(electronBuilderConfig, /extraResources:/u);
  assert.match(electronBuilderConfig, /!skills\/\*\*/u);
  assert.match(electronBuilderConfig, /!\.worktrees\/\*\*/u);
  assert.match(electronBuilderConfig, /from: "vendor\/agentmux\/agentmux"/u);
  assert.match(electronBuilderConfig, /to: "agentmux\/agentmux"/u);
  assert.match(electronBuilderConfig, /from: "vendor\/agentmux\/agentmux\.py"/u);
  assert.match(electronBuilderConfig, /to: "agentmux\/agentmux\.py"/u);
  assert.match(electronBuilderConfig, /from: "skills"/u);
  assert.match(electronBuilderConfig, /to: "agentmux\/skills"/u);
  assert.doesNotMatch(electronBuilderConfig, /from: "vendor\/agentmux\/skills"/u);
  assert.match(electronBuilderConfig, /!vendor\/agentmux\/\*\*/u);
  assert.equal(fs.existsSync(path.join(repoRoot, "vendor", "agentmux", "agentmux")), true);
  assert.equal(fs.existsSync(path.join(repoRoot, "vendor", "agentmux", "agentmux.py")), true);
  assert.equal(fs.existsSync(path.join(repoRoot, "skills", "agentmux", "SKILL.md")), true);
  assert.equal(fs.existsSync(path.join(repoRoot, "vendor", "agentmux", "skills", "agentmux", "SKILL.md")), false);
});
