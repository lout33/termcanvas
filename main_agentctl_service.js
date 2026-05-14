const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const DEFAULT_TIMEOUT_MS = 60000;
const AGENTS_FILE_NAME = "AGENTS.md";
const MANAGED_BLOCK_START = "<!-- TERMCANVAS_MANAGER_RULES_START -->";
const MANAGED_BLOCK_END = "<!-- TERMCANVAS_MANAGER_RULES_END -->";

function normalizeNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
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

function getDefaultAgentctlRootPath() {
  return path.resolve(__dirname, "../../agentctl");
}

function createAgentctlService(options = {}) {
  const rootPath = path.resolve(options.agentctlRootPath ?? process.env.TERMCANVAS_AGENTCTL_ROOT ?? getDefaultAgentctlRootPath());
  const scriptPath = path.join(rootPath, "agentctl.py");
  const pythonBinary = options.pythonBinary ?? process.env.TERMCANVAS_AGENTCTL_PYTHON ?? "python3";

  function hasGlobalAgentctlCommand() {
    const result = spawnSync("agentctl", ["--help"], {
      encoding: "utf8",
      timeout: 5000
    });

    return result.error == null && result.status === 0;
  }

  function getAgentctlInvocation() {
    return hasGlobalAgentctlCommand()
      ? {
          command: "agentctl",
          argsPrefix: [],
          displayText: "agentctl"
        }
      : {
          command: pythonBinary,
          argsPrefix: [scriptPath],
          displayText: `python3 \"${scriptPath}\"`
        };
  }

  function assertAvailable() {
    if (hasGlobalAgentctlCommand()) {
      return;
    }

    if (!fs.existsSync(scriptPath)) {
      throw new Error(`agentctl is unavailable at ${scriptPath}.`);
    }
  }

  function buildManagedAgentsBlock(workspaceRootPath, projectTag, canvasId, canvasName) {
    const agentctlInvocation = getAgentctlInvocation();
    const workerCommand = `${agentctlInvocation.displayText} worker \"${projectTag}\" \"<worker-name>\" --workdir \"${workspaceRootPath}\"`;
    const workerPromptCommand = `${workerCommand} --prompt \"<initial prompt>\"`;
    const sendCommand = `${agentctlInvocation.displayText} send \"<agent-or-short-id>\" \"<prompt>\"`;
    const showCommand = `${agentctlInvocation.displayText} show \"<agent-or-short-id>\"`;
    const logsCommand = `${agentctlInvocation.displayText} logs \"<agent-or-short-id>\"`;

    return [
      MANAGED_BLOCK_START,
      "## TermCanvas Manager Rules",
      "",
      `You are the TermCanvas manager for project \`${projectTag}\` when working from a canvas manager terminal.`,
      `Canvas id: \`${canvasId}\``,
      `Canvas name: \`${canvasName}\``,
      `Workspace root: \`${workspaceRootPath}\``,
      "",
      "### Worker Creation",
      "",
      "To create a worker agent, run:",
      "",
      "```bash",
      workerCommand,
      "```",
      "",
      "With an initial prompt:",
      "",
      "```bash",
      workerPromptCommand,
      "```",
      "",
      "Example:",
      "",
      "```bash",
      `${agentctlInvocation.displayText} worker \"${projectTag}\" \"test-worker\" --workdir \"${workspaceRootPath}\"`,
      "```",
      "",
      "### Prompt An Existing Worker",
      "",
      "To send a prompt to an existing worker, run:",
      "",
      "```bash",
      sendCommand,
      "```",
      "",
      "Example:",
      "",
      "```bash",
      `python3 \"${scriptPath}\" send \"test-worker\" \"Make a joke\"`,
      "```",
      "",
      "### Inspect A Worker",
      "",
      "Show detailed worker state:",
      "",
      "```bash",
      showCommand,
      "```",
      "",
      "Read recent worker output:",
      "",
      "```bash",
      logsCommand,
      "```",
      "",
      "### Rules",
      "",
      "- Never create raw tmux sessions for workers.",
      "- Never use `tmux new-session` for worker creation.",
      "- Keep workers in the same project tag so TermCanvas can materialize them on the same canvas.",
      "- When asked to create a worker, execute the worker command directly instead of researching first.",
      "- When asked to prompt an existing worker, use `agentctl send` directly instead of opening help first.",
      "- When asked to inspect an existing worker, prefer `agentctl show` and `agentctl logs`.",
      "- Do not run `agentctl --help` or `agentctl send --help` unless the operator explicitly asks for documentation.",
      "- After creating a worker, tell the operator the worker name you created.",
      MANAGED_BLOCK_END,
      ""
    ].join("\n");
  }

  function ensureCanvasManagerToolkit(workspaceRootPath, projectTag, canvasId, canvasName) {
    const agentsFilePath = path.join(workspaceRootPath, AGENTS_FILE_NAME);
    const managedBlock = buildManagedAgentsBlock(workspaceRootPath, projectTag, canvasId, canvasName);
    const existingContents = fs.existsSync(agentsFilePath)
      ? fs.readFileSync(agentsFilePath, "utf8")
      : "";
    const managedBlockPattern = new RegExp(
      `${MANAGED_BLOCK_START.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\s\\S]*?${MANAGED_BLOCK_END.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\n?`,
      "u"
    );
    const nextContents = managedBlockPattern.test(existingContents)
      ? existingContents.replace(managedBlockPattern, managedBlock)
      : `${existingContents.replace(/\s*$/u, "")}${existingContents.trim().length > 0 ? "\n\n" : ""}${managedBlock}`;

    fs.writeFileSync(agentsFilePath, nextContents, "utf8");

    return {
      agentsFilePath
    };
  }

  function runAgentctlCommand(args, commandLabel) {
    assertAvailable();
    const invocation = getAgentctlInvocation();

    const result = spawnSync(invocation.command, [...invocation.argsPrefix, ...args], {
      cwd: rootPath,
      encoding: "utf8",
      timeout: DEFAULT_TIMEOUT_MS
    });

    if (result.error) {
      throw result.error;
    }

    if (result.status !== 0) {
      const errorText = typeof result.stderr === "string" && result.stderr.trim().length > 0
        ? result.stderr.trim()
        : `agentctl failed while trying to ${commandLabel}.`;
      throw new Error(errorText);
    }

    return typeof result.stdout === "string" ? result.stdout.trim() : "";
  }

  function syncCanvasProject(payload) {
    const workspaceRootPath = normalizeNonEmptyString(payload?.workspaceRootPath);
    const canvasId = normalizeNonEmptyString(payload?.canvasId);

    if (workspaceRootPath === null) {
      throw new Error("Canvas workspace root path is required.");
    }

    if (canvasId === null) {
      throw new Error("Canvas id is required.");
    }

    const projectTag = normalizeNonEmptyString(payload?.projectTag) ?? deriveCanvasProjectTag(workspaceRootPath, canvasId);
    ensureCanvasManagerToolkit(
      workspaceRootPath,
      projectTag,
      canvasId,
      normalizeNonEmptyString(payload?.canvasName) ?? "Canvas"
    );
    const args = [
      "project-sync",
      projectTag,
      "--workdir",
      workspaceRootPath,
      "--canvas-id",
      canvasId,
      "--canvas-name",
      normalizeNonEmptyString(payload?.canvasName) ?? "Canvas",
      "--json"
    ];
    const output = runAgentctlCommand(args, `sync canvas project ${projectTag}`);

    try {
      return JSON.parse(output);
    } catch {
      throw new Error("agentctl returned invalid JSON while syncing canvas agents.");
    }
  }

  function deleteAgent(agentName) {
    const normalizedAgentName = normalizeNonEmptyString(agentName);

    if (normalizedAgentName === null) {
      throw new Error("Agent name is required.");
    }

    runAgentctlCommand(["delete", normalizedAgentName, "--force"], `delete agent ${normalizedAgentName}`);
  }

  return {
    rootPath,
    scriptPath,
    deriveCanvasProjectTag,
    getAgentctlInvocation,
    syncCanvasProject,
    deleteAgent
  };
}

module.exports = {
  createAgentctlService,
  deriveCanvasProjectTag
};
