const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");

const DEFAULT_TIMEOUT_MS = 60000;
const AGENTMUX_UNAVAILABLE_CODE = "AGENTMUX_UNAVAILABLE";

function getPackagedRuntimePaths() {
  const homeDirectory = os.homedir();

  return [
    homeDirectory ? path.join(homeDirectory, ".local/bin") : null,
    homeDirectory ? path.join(homeDirectory, ".bun/bin") : null,
    homeDirectory ? path.join(homeDirectory, ".npm-global/bin") : null,
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/usr/bin",
    "/bin",
    "/usr/sbin",
    "/sbin"
  ];
}

function shellQuote(value) {
  return `"${String(value).replace(/(["\\$`])/g, "\\$1")}"`;
}

function normalizeNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function isAgentmuxUnavailableError(error) {
  return error instanceof Error && error.code === AGENTMUX_UNAVAILABLE_CODE;
}

function slugifySegment(value, fallback) {
  const normalizedValue = normalizeNonEmptyString(value) ?? fallback;
  const slug = normalizedValue
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug.length > 0 ? slug : fallback;
}

function deriveCanvasProjectTag(workspaceRootPath, canvasId) {
  const workspaceName = path.basename(workspaceRootPath) || "canvas";
  const canvasSuffix = slugifySegment(canvasId, "canvas").slice(0, 10);
  return `${slugifySegment(workspaceName, "canvas")}-${canvasSuffix}`;
}

function getDefaultAgentmuxRootPath() {
  return path.resolve(__dirname, "vendor/agentmux");
}

function getBundledAgentmuxRootPath(options = {}) {
  const app = options.app ?? null;

  if (app?.isPackaged !== true) {
    return null;
  }

  const bundledRootPath = path.join(process.resourcesPath, "agentmux");
  return fs.existsSync(path.join(bundledRootPath, "agentmux.py")) ? bundledRootPath : null;
}

function buildPackagedRuntimePath(basePath = process.env.PATH) {
  const seenPaths = new Set();
  const pathParts = [];

  for (const candidatePath of [...getPackagedRuntimePaths(), ...(basePath ?? "").split(path.delimiter)]) {
    if (typeof candidatePath !== "string" || candidatePath.length === 0 || seenPaths.has(candidatePath)) {
      continue;
    }

    seenPaths.add(candidatePath);
    pathParts.push(candidatePath);
  }

  return pathParts.join(path.delimiter);
}

function createAgentmuxService(options = {}) {
  const bundledRootPath = getBundledAgentmuxRootPath(options);
  const rootPath = path.resolve(
    options.agentmuxRootPath
    ?? process.env.TERMCANVAS_AGENTMUX_ROOT
    ?? bundledRootPath
    ?? getDefaultAgentmuxRootPath()
  );
  const scriptPath = path.join(rootPath, "agentmux.py");
  const wrapperPath = path.join(rootPath, "agentmux");
  const pythonBinary = options.pythonBinary ?? process.env.TERMCANVAS_AGENTMUX_PYTHON ?? "python3";
  const agentmuxHomePath = path.resolve(
    options.agentmuxHomePath
    ?? process.env.TERMCANVAS_AGENTMUX_HOME
    ?? path.join(options.app?.getPath?.("userData") ?? process.cwd(), "agentmux")
  );
  const packagedRuntimeEnv = options.app?.isPackaged === true
    ? { PATH: buildPackagedRuntimePath(options.envPath ?? process.env.PATH) }
    : {};

  function formatEnvPrefix(envOverrides) {
    return ["PATH", "AGENTMUX_HOME"]
      .filter((envName) => typeof envOverrides[envName] === "string" && envOverrides[envName].length > 0)
      .map((envName) => `${envName}=${shellQuote(envOverrides[envName])}`)
      .join(" ");
  }

  function getRootAgentmuxInvocation() {
    if (!fs.existsSync(scriptPath)) {
      return null;
    }

    const envOverrides = {
      ...packagedRuntimeEnv,
      AGENTMUX_HOME: agentmuxHomePath
    };
    const envPrefix = formatEnvPrefix(envOverrides);
    const commandPrefix = envPrefix.length > 0 ? `${envPrefix} ` : "";

    if (fs.existsSync(wrapperPath)) {
      return {
        command: wrapperPath,
        argsPrefix: [],
        envOverrides,
        displayText: `${commandPrefix}${shellQuote(wrapperPath)}`
      };
    }

    return {
      command: pythonBinary,
      argsPrefix: [scriptPath],
      envOverrides,
      displayText: `${commandPrefix}python3 ${shellQuote(scriptPath)}`
    };
  }

  function hasGlobalAgentmuxCommand() {
    const result = spawnSync("agentmux", ["--help"], {
      encoding: "utf8",
      timeout: 5000
    });

    return result.error == null && result.status === 0;
  }

  function getAgentmuxInvocation() {
    const rootInvocation = getRootAgentmuxInvocation();

    if (rootInvocation !== null) {
      return rootInvocation;
    }

    return hasGlobalAgentmuxCommand()
      ? {
          command: "agentmux",
          argsPrefix: [],
          envOverrides: {
            ...packagedRuntimeEnv,
            AGENTMUX_HOME: agentmuxHomePath
          },
          displayText: `${formatEnvPrefix({
            ...packagedRuntimeEnv,
            AGENTMUX_HOME: agentmuxHomePath
          })} agentmux`
        }
      : null;
  }

  function assertAvailable() {
    const invocation = getAgentmuxInvocation();

    if (invocation !== null) {
      return invocation;
    }

    const error = new Error(`agentmux is unavailable. Expected ${wrapperPath} or ${scriptPath}, or a working global agentmux command.`);
    error.code = AGENTMUX_UNAVAILABLE_CODE;
    throw error;
  }

  function runAgentmuxCommand(args, commandLabel) {
    const invocation = assertAvailable();

    return new Promise((resolve, reject) => {
      const childProcess = spawn(invocation.command, [...invocation.argsPrefix, ...args], {
        cwd: rootPath,
        env: {
          ...process.env,
          ...invocation.envOverrides
        },
        stdio: ["ignore", "pipe", "pipe"]
      });
      let stdout = "";
      let stderr = "";
      let didSettle = false;
      const timeoutId = setTimeout(() => {
        didSettle = true;
        childProcess.kill("SIGTERM");
        reject(new Error(`agentmux timed out while trying to ${commandLabel}.`));
      }, DEFAULT_TIMEOUT_MS);

      childProcess.stdout?.on("data", (chunk) => {
        stdout += chunk.toString();
      });

      childProcess.stderr?.on("data", (chunk) => {
        stderr += chunk.toString();
      });

      childProcess.on("error", (error) => {
        if (didSettle) {
          return;
        }

        didSettle = true;
        clearTimeout(timeoutId);
        reject(error);
      });

      childProcess.on("close", (exitCode) => {
        if (didSettle) {
          return;
        }

        didSettle = true;
        clearTimeout(timeoutId);

        if (exitCode !== 0) {
          const errorText = stderr.trim().length > 0
            ? stderr.trim()
            : `agentmux failed while trying to ${commandLabel}.`;
          reject(new Error(errorText));
          return;
        }

        resolve(stdout.trim());
      });
    });
  }

  async function readCanvasProject(projectTag) {
    const output = await runAgentmuxCommand(
      ["ls", "--project", projectTag, "--json"],
      `read canvas project ${projectTag}`
    );

    try {
      return JSON.parse(output);
    } catch {
      throw new Error("agentmux returned invalid JSON while reading canvas agents.");
    }
  }

  async function syncCanvasProject(payload) {
    const workspaceRootPath = normalizeNonEmptyString(payload?.workspaceRootPath);
    const canvasId = normalizeNonEmptyString(payload?.canvasId);
    const requestedProjectTag = normalizeNonEmptyString(payload?.projectTag);

    if (requestedProjectTag === null && workspaceRootPath === null) {
      throw new Error("A canvas project tag or workspace root path is required.");
    }

    if (requestedProjectTag === null && canvasId === null) {
      throw new Error("Canvas id is required when deriving a project tag.");
    }

    // The canvas is a graph with no mandatory commander: an empty project is a
    // valid state, so syncing only reads — it never creates agents.
    const projectTag = requestedProjectTag ?? deriveCanvasProjectTag(workspaceRootPath, canvasId);
    return readCanvasProject(projectTag);
  }

  async function deleteAgent(agentName) {
    const normalizedAgentName = normalizeNonEmptyString(agentName);

    if (normalizedAgentName === null) {
      throw new Error("Agent name is required.");
    }

    await runAgentmuxCommand(["delete", normalizedAgentName, "--force"], `delete agent ${normalizedAgentName}`);
  }

  async function sendAgentPrompt(agentName, message) {
    const normalizedAgentName = normalizeNonEmptyString(agentName);
    const normalizedMessage = normalizeNonEmptyString(message);

    if (normalizedAgentName === null) {
      throw new Error("Agent name is required.");
    }

    if (normalizedMessage === null) {
      throw new Error("Prompt message is required.");
    }

    await runAgentmuxCommand(
      ["send", normalizedAgentName, normalizedMessage],
      `send prompt to agent ${normalizedAgentName}`
    );
  }

  async function adoptAgent(payload) {
    const tmuxSessionName = normalizeNonEmptyString(payload?.tmuxSessionName);
    const projectTag = normalizeNonEmptyString(payload?.projectTag);
    const agentName = slugifySegment(payload?.agentName, "terminal");

    if (tmuxSessionName === null) {
      throw new Error("A tmux session name is required to adopt a terminal.");
    }

    if (projectTag === null) {
      throw new Error("A project tag is required to adopt a terminal.");
    }

    const args = ["import", "--agent", agentName, "--tmux-session", tmuxSessionName, "--harness", "shell", "--project", projectTag];
    const workdir = normalizeNonEmptyString(payload?.workdir);

    if (workdir !== null) {
      args.push("--workdir", workdir);
    }

    await runAgentmuxCommand(args, `adopt terminal ${tmuxSessionName} as ${agentName}`);
    return { agentName };
  }

  async function resumeAgent(payload) {
    const agentName = normalizeNonEmptyString(payload?.agentName);

    if (agentName === null) {
      throw new Error("Agent name is required to resume a runtime.");
    }

    const args = ["resume", agentName];
    const prompt = normalizeNonEmptyString(payload?.prompt);

    if (prompt !== null) {
      args.push("--prompt", prompt);
    }

    if (Number.isFinite(payload?.readyTimeout) && payload.readyTimeout > 0) {
      args.push("--ready-timeout", String(payload.readyTimeout));
    }

    const output = await runAgentmuxCommand(args, `resume agent ${agentName}`);
    const tmuxSessionLine = output
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .find((line) => line.startsWith("tmux:"));

    const resumedTmuxSession = tmuxSessionLine !== undefined
      ? normalizeNonEmptyString(tmuxSessionLine.slice("tmux:".length))
      : null;

    return { agentName, tmuxSessionName: resumedTmuxSession };
  }

  function getAgentmuxBinPath() {
    if (fs.existsSync(wrapperPath)) {
      return wrapperPath;
    }

    return fs.existsSync(scriptPath) ? scriptPath : null;
  }

  function buildTerminalRuntimeEnv() {
    const env = {
      AGENTMUX_HOME: agentmuxHomePath
    };
    const binPath = getAgentmuxBinPath();

    if (binPath !== null) {
      env.AGENTMUX_BIN = binPath;
    }

    return env;
  }

  function buildTerminalAgentEnv(payload) {
    const projectTag = normalizeNonEmptyString(payload?.projectTag);
    const agentName = normalizeNonEmptyString(payload?.agentName);

    if (projectTag === null || agentName === null) {
      return {};
    }

    const env = {
      ...buildTerminalRuntimeEnv(),
      AGENTMUX_PROJECT: projectTag,
      AGENTMUX_AGENT_NAME: agentName,
      AGENTMUX_ROLE: "agent",
      AGENTMUX_DEPTH: "0",
      AGENTMUX_PARENT_AGENT: ""
    };
    const workdir = normalizeNonEmptyString(payload?.workdir);
    const tmuxSessionName = normalizeNonEmptyString(payload?.tmuxSessionName);

    if (workdir !== null) {
      env.AGENTMUX_WORKDIR = workdir;
    }

    if (tmuxSessionName !== null) {
      env.AGENTMUX_TMUX_SESSION = tmuxSessionName;
    }

    return env;
  }

  async function connectAgents(agentNameA, agentNameB) {
    const normalizedA = normalizeNonEmptyString(agentNameA);
    const normalizedB = normalizeNonEmptyString(agentNameB);

    if (normalizedA === null || normalizedB === null) {
      throw new Error("Both agent names are required.");
    }

    await runAgentmuxCommand(
      ["connect", normalizedA, normalizedB, "--announce"],
      `connect agents ${normalizedA} and ${normalizedB}`
    );
  }

  return {
    rootPath,
    scriptPath,
    agentmuxHomePath,
    deriveCanvasProjectTag,
    getAgentmuxInvocation,
    syncCanvasProject,
    deleteAgent,
    sendAgentPrompt,
    adoptAgent,
    resumeAgent,
    connectAgents,
    getAgentmuxBinPath,
    buildTerminalRuntimeEnv,
    buildTerminalAgentEnv
  };
}

module.exports = {
  buildPackagedRuntimePath,
  createAgentmuxService,
  deriveCanvasProjectTag,
  isAgentmuxUnavailableError
};
