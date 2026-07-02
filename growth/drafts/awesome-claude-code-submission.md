# awesome-claude-code (hesreallyhim, 47k★) — submission draft

**Why this list:** It explicitly curates "agent orchestrators" for Claude Code. TermCanvas spawns/steers Claude Code agents via agentmux → strong, honest fit.

**⚠️ MUST be submitted BY YOU (a human), via the GitHub web UI issue form.** Their rules: *"Issues must be submitted by human users using the github.com UI. Programmatic means violate the Code of Conduct and submissions will be automatically closed,"* with temp/permanent ban penalties. I will NOT auto-submit this — it would risk a ban on your account. You fill the form (60 sec); values below.

**Submit here (logged in as you):**
https://github.com/hesreallyhim/awesome-claude-code/issues/new?template=recommend-resource.yml

**Eligibility check:** Resource must be ≥1 week old ✓ (TermCanvas is past v0.2.5). Must be MIT/open ✓.

---

## Field values to paste

- **Title:** `[Resource]: TermCanvas`
- **Display Name:** `TermCanvas`
- **Category:** `Tooling`
- **Sub-Category:** (pick if one fits; otherwise leave default)
- **Primary Link:** `https://github.com/lout33/termcanvas`
- **Author Name:** `Luis (lout33)`
- **Author Link:** `https://github.com/lout33`
- **License:** `MIT`
- **Other License:** (leave blank)

**Description:**
```
TermCanvas is an open-source macOS desktop app that arranges real tmux-backed terminal sessions as draggable nodes on an infinite canvas, built for running and steering multiple Claude Code agents at once. Its bundled agentmux manager spawns commander and worker agents and draws commander→worker delegation lines between their terminals, so you can see the live agent tree and spot which agent is blocked or waiting on you. Sessions are tmux-backed, so an in-progress agent run survives app relaunches. The repo ships a Claude Code skill (installs to ~/.agents/skills) that teaches agents how to spawn workers, send prompts, read logs, and stop agents from a terminal.
```

**Validate Claims (how you tested it):**
```
Open a project folder in TermCanvas, launch the commander agent from the agentmux manager terminal, and send it a mission. It spawns worker agents on the canvas; commander→worker delegation lines render the tree live, and each card shows agent name/role/status. Closing and reopening the app reattaches to the still-running tmux sessions.
```

**Specific Task(s):** e.g. "Run 3 Claude Code agents in parallel on one repo (server / tests / logs) and keep track of which one needs input."
**Specific Prompt(s):** e.g. `agentmux mission <project> "Build the next feature"` then `agentmux child <parent> <worker> --prompt "Handle this subtask"`.

**Additional Comments:** "Disclosure: I'm the author. macOS (Apple Silicon) only right now."

**Checklist:** tick all boxes (you've read CONTRIBUTING + Code of Conduct; resource is ≥1 week old; submitted via the web form).
