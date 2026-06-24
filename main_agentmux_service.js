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
  const bootstrappedProjectKeys = new Set();
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

    const envOverrides = bundledRootPath !== null && rootPath === bundledRootPath
      ? {
          ...packagedRuntimeEnv,
          AGENTMUX_HOME: agentmuxHomePath
        }
      : {};
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
          envOverrides: {},
          displayText: "agentmux"
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

  async function bootstrapCanvasProject(workspaceRootPath, projectTag) {
    const output = await runAgentmuxCommand(
      [
        "project-sync",
        projectTag,
        "--workdir",
        workspaceRootPath,
        "--harness",
        "shell",
        "--json"
      ],
      `sync canvas project ${projectTag}`
    );

    try {
      return JSON.parse(output);
    } catch {
      throw new Error("agentmux returned invalid JSON while syncing canvas agents.");
    }
  }

  async function syncCanvasProject(payload) {
    const workspaceRootPath = normalizeNonEmptyString(payload?.workspaceRootPath);
    const canvasId = normalizeNonEmptyString(payload?.canvasId);

    if (workspaceRootPath === null) {
      throw new Error("Canvas workspace root path is required.");
    }

    if (canvasId === null) {
      throw new Error("Canvas id is required.");
    }

    const projectTag = normalizeNonEmptyString(payload?.projectTag) ?? deriveCanvasProjectTag(workspaceRootPath, canvasId);
    const projectCacheKey = `${workspaceRootPath}\n${projectTag}`;

    if (!bootstrappedProjectKeys.has(projectCacheKey)) {
      const snapshot = await bootstrapCanvasProject(workspaceRootPath, projectTag);
      bootstrappedProjectKeys.add(projectCacheKey);
      return snapshot;
    }

    const snapshot = await readCanvasProject(projectTag);

    if (snapshot?.manager === null) {
      bootstrappedProjectKeys.delete(projectCacheKey);
      const nextSnapshot = await bootstrapCanvasProject(workspaceRootPath, projectTag);
      bootstrappedProjectKeys.add(projectCacheKey);
      return nextSnapshot;
    }

    return snapshot;
  }

  async function deleteAgent(agentName) {
    const normalizedAgentName = normalizeNonEmptyString(agentName);

    if (normalizedAgentName === null) {
      throw new Error("Agent name is required.");
    }

    await runAgentmuxCommand(["delete", normalizedAgentName, "--force"], `delete agent ${normalizedAgentName}`);
  }

  return {
    rootPath,
    scriptPath,
    agentmuxHomePath,
    deriveCanvasProjectTag,
    getAgentmuxInvocation,
    syncCanvasProject,
    deleteAgent
  };
}

module.exports = {
  buildPackagedRuntimePath,
  createAgentmuxService,
  deriveCanvasProjectTag,
  isAgentmuxUnavailableError
};
