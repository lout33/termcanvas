#!/usr/bin/env python3

from __future__ import annotations

import argparse
import curses
import hashlib
import json
import os
import re
import shlex
import shutil
import sqlite3
import subprocess
import sys
import textwrap
import time
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable


DEFAULT_APP_DIR = Path(__file__).resolve().parent / ".agentmux"
LEGACY_APP_DIRS = [
    Path(path).expanduser()
    for path in os.environ.get("AGENTMUX_LEGACY_APP_DIRS", "").split(os.pathsep)
    if path.strip()
]
APP_DIR = Path(os.environ.get("AGENTMUX_HOME", DEFAULT_APP_DIR))
DB_PATH = APP_DIR / "agentmux.db"
WAIT_PATTERNS = [
    re.compile(pattern, re.IGNORECASE)
    for pattern in [
        r"need[s]? your input",
        r"waiting for approval",
        r"approve",
        r"\[y/n\]",
        r"\[y/N\]",
        r"press enter",
        r"select an option",
        r"continue\?",
        r"permission",
    ]
]

READY_PATTERNS: dict[str, list[re.Pattern[str]]] = {
    "claude": [re.compile(r"^\s*❯\s*$", re.MULTILINE)],
    "pi": [re.compile(r"^\s*~/.*$", re.MULTILINE), re.compile(r"❯", re.MULTILINE)],
    "opencode": [re.compile(r"Ask anything", re.IGNORECASE), re.compile(r"ctrl\+p commands", re.IGNORECASE)],
    "codex": [re.compile(r">", re.MULTILINE)],
    "shell": [re.compile(r"[%$#❯] ?$", re.MULTILINE)],
    "custom": [re.compile(r"[%$#❯] ?$", re.MULTILINE)],
}

STATE_PRIORITY = {
    "waiting": 0,
    "running": 1,
    "starting": 2,
    "idle": 3,
    "stopped": 4,
}

STATE_STYLES = {
    "waiting": ("WAITING", "33"),
    "running": ("RUNNING", "32"),
    "starting": ("STARTING", "36"),
    "idle": ("IDLE", "90"),
    "stopped": ("STOPPED", "31"),
}

AGENT_STATES = ["active", "idle", "finished", "failed", "archived"]
STALE_AFTER_SECONDS = 15 * 60
UTF8_LOCALE = "en_US.UTF-8"


@dataclass(frozen=True)
class Harness:
    id: str
    command: str
    description: str
    interactive: bool = True


@dataclass(frozen=True)
class TmuxPane:
    session_name: str
    pane_id: str
    command: str
    path: str


@dataclass(frozen=True)
class TmuxSessionInfo:
    session_name: str
    created_at: str
    created_ts: int
    pane_count: int


HARNESSES: dict[str, Harness] = {
    "claude": Harness("claude", "claude", "Claude Code interactive CLI"),
    "codex": Harness("codex", "codex", "OpenAI Codex CLI"),
    "pi": Harness("pi", "pi", "Pi coding harness"),
    "opencode": Harness("opencode", "opencode", "OpenCode CLI"),
    "shell": Harness("shell", os.environ.get("SHELL", "bash"), "Plain interactive shell"),
    "custom": Harness("custom", "", "Custom command supplied with --cmd"),
}

DEFAULT_HARNESS_MODELS = {
    "opencode": os.environ.get("AGENTMUX_OPENCODE_MODEL", "ollama-cloud/glm-5.2"),
}

# Harnesses that read injected text as an AI prompt. Shell/custom sessions would
# try to execute the briefing as a command, so they never receive one.
BRIEFING_HARNESS_IDS = {"claude", "codex", "pi", "opencode"}


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def ensure_app() -> None:
    migrate_legacy_app_dir()
    APP_DIR.mkdir(parents=True, exist_ok=True)
    with db() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS sessions (
              id TEXT PRIMARY KEY,
              name TEXT UNIQUE NOT NULL,
              harness TEXT NOT NULL,
              tmux_session TEXT UNIQUE NOT NULL,
              workdir TEXT NOT NULL,
              command_text TEXT NOT NULL,
              state TEXT NOT NULL,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL,
              last_activity_at TEXT NOT NULL,
              last_output TEXT NOT NULL DEFAULT '',
              last_output_hash TEXT NOT NULL DEFAULT '',
              startup_delay REAL NOT NULL DEFAULT 1.0,
              metadata_json TEXT NOT NULL DEFAULT '{}'
            );

            CREATE TABLE IF NOT EXISTS events (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              session_id TEXT NOT NULL,
              event_type TEXT NOT NULL,
              message TEXT NOT NULL,
              created_at TEXT NOT NULL,
              FOREIGN KEY(session_id) REFERENCES sessions(id)
            );

            CREATE TABLE IF NOT EXISTS edges (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              project TEXT NOT NULL,
              agent_a TEXT NOT NULL,
              agent_b TEXT NOT NULL,
              kind TEXT NOT NULL DEFAULT 'link',
              created_at TEXT NOT NULL,
              UNIQUE(project, agent_a, agent_b)
            );
            """
        )
        ensure_column(conn, "sessions", "agent_state", "TEXT NOT NULL DEFAULT 'active'")
        ensure_column(conn, "sessions", "external_session_id", "TEXT NOT NULL DEFAULT ''")
        ensure_column(conn, "sessions", "project", "TEXT NOT NULL DEFAULT ''")
        conn.execute("UPDATE sessions SET agent_state = 'active' WHERE agent_state IS NULL OR agent_state = ''")


def ensure_column(conn: sqlite3.Connection, table: str, column: str, definition: str) -> None:
    columns = {row["name"] for row in conn.execute(f"PRAGMA table_info({table})")}
    if column not in columns:
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")


def migrate_legacy_app_dir() -> None:
    if APP_DIR != DEFAULT_APP_DIR:
        return
    if DB_PATH.exists():
        return
    source = next((path for path in LEGACY_APP_DIRS if path.exists()), None)
    if source is None:
        return
    APP_DIR.mkdir(parents=True, exist_ok=True)
    shutil.copytree(source, APP_DIR, dirs_exist_ok=True)


def skill_source_path() -> Path:
    source = Path(__file__).resolve().parent / "skills" / "agentmux" / "SKILL.md"
    if not source.exists():
        raise SystemExit(f"Bundled skill not found: {source}")
    return source


def db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def command_exists(command: str) -> bool:
    return shutil.which(command) is not None


def tmux(*args: str, check: bool = True) -> subprocess.CompletedProcess[str]:
    command = ["tmux", *args]
    return subprocess.run(command, check=check, text=True, capture_output=True)


def list_tmux_panes() -> list[TmuxPane]:
    result = tmux(
        "list-panes",
        "-a",
        "-F",
        "#{session_name}|#{window_index}.#{pane_index}|#{pane_current_command}|#{pane_current_path}",
        check=False,
    )
    if result.returncode != 0:
        return []
    panes: list[TmuxPane] = []
    for raw_line in result.stdout.splitlines():
        parts = raw_line.split("|", 3)
        if len(parts) != 4:
            continue
        panes.append(TmuxPane(parts[0], parts[1], parts[2], parts[3]))
    return panes


def list_tmux_sessions() -> dict[str, TmuxSessionInfo]:
    result = tmux(
        "list-sessions",
        "-F",
        "#{session_name}|#{session_created}|#{session_windows}",
        check=False,
    )
    if result.returncode != 0:
        return {}
    sessions: dict[str, TmuxSessionInfo] = {}
    for raw_line in result.stdout.splitlines():
        parts = raw_line.split("|", 2)
        if len(parts) != 3:
            continue
        created_at = "<unknown>"
        if parts[1].isdigit():
            created_at = datetime.fromtimestamp(int(parts[1]), tz=timezone.utc).astimezone().strftime("%Y-%m-%d %H:%M:%S")
        pane_count = int(parts[2]) if parts[2].isdigit() else 0
        created_ts = int(parts[1]) if parts[1].isdigit() else 0
        sessions[parts[0]] = TmuxSessionInfo(parts[0], created_at, created_ts, pane_count)
    return sessions


def has_tmux_session(tmux_session: str) -> bool:
    result = tmux("has-session", "-t", tmux_session, check=False)
    return result.returncode == 0


def capture_pane(tmux_session: str, lines: int = 80) -> str:
    result = tmux("capture-pane", "-p", "-t", tmux_session, "-S", f"-{lines}", check=False)
    if result.returncode != 0:
        return ""
    return result.stdout.rstrip()


def capture_terminal_pane(tmux_session: str, lines: int = 500) -> str:
    result = tmux("capture-pane", "-p", "-t", tmux_session, "-S", f"-{lines}", check=False)
    if result.returncode != 0:
        return ""
    return result.stdout.rstrip("\n")


def send_keys(tmux_session: str, text: str, enter: bool = True) -> None:
    tmux("send-keys", "-t", tmux_session, "-l", text)
    if enter:
        tmux("send-keys", "-t", tmux_session, "Enter")


def send_terminal_input(tmux_session: str, text: str) -> None:
    buffer: list[str] = []

    def flush() -> None:
        if buffer:
            tmux("send-keys", "-t", tmux_session, "-l", "".join(buffer))
            buffer.clear()

    for char in text:
        if char in ("\r", "\n"):
            flush()
            tmux("send-keys", "-t", tmux_session, "Enter")
        elif char == "\x7f":
            flush()
            tmux("send-keys", "-t", tmux_session, "BSpace")
        elif char == "\x03":
            flush()
            tmux("send-keys", "-t", tmux_session, "C-c")
        elif char == "\x04":
            flush()
            tmux("send-keys", "-t", tmux_session, "C-d")
        else:
            buffer.append(char)
    flush()


def wait_until_ready(tmux_session: str, harness_id: str, timeout: float, fallback_delay: float) -> bool:
    patterns = READY_PATTERNS.get(harness_id, [])
    deadline = time.time() + timeout

    if not patterns:
        time.sleep(fallback_delay)
        return True

    while time.time() < deadline:
        if not has_tmux_session(tmux_session):
            return False
        pane = capture_pane(tmux_session, lines=120)
        if pane and all(pattern.search(pane) for pattern in patterns):
            return True
        time.sleep(0.5)

    time.sleep(max(0.0, fallback_delay))
    return has_tmux_session(tmux_session)


def slugify(value: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9_-]+", "-", value.strip().lower())
    cleaned = re.sub(r"-+", "-", cleaned).strip("-")
    return cleaned or f"session-{uuid.uuid4().hex[:6]}"


def short_id(session_id: str) -> str:
    return session_id.split("-")[0]


def hash_text(text: str) -> str:
    return hashlib.sha1(text.encode("utf-8")).hexdigest()


def default_model_for_harness(harness_id: str) -> str:
    return (DEFAULT_HARNESS_MODELS.get(harness_id) or "").strip()


def apply_model_to_command_parts(harness_id: str, command_parts: list[str], model: str | None = None) -> list[str]:
    chosen_model = (model or default_model_for_harness(harness_id)).strip()
    if not chosen_model:
        return command_parts
    if harness_id != "opencode":
        return command_parts
    if "--model" in command_parts or "-m" in command_parts:
        return command_parts
    return [command_parts[0], "--model", chosen_model, *command_parts[1:]]


def apply_session_to_command_parts(harness_id: str, command_parts: list[str], session_id: str | None = None) -> list[str]:
    if not session_id:
        return command_parts
    if harness_id != "opencode":
        return command_parts
    if "-s" in command_parts or "--session" in command_parts:
        return command_parts
    return [command_parts[0], "-s", session_id, *command_parts[1:]]


def build_command_parts(harness: Harness, extra_args: list[str], model: str | None = None, session_id: str | None = None) -> list[str]:
    parts = apply_model_to_command_parts(harness.id, [harness.command, *extra_args], model=model)
    return apply_session_to_command_parts(harness.id, parts, session_id=session_id)


def normalize_project(value: str | None) -> str:
    if not value:
        return ""
    return slugify(value)


def infer_project_from_workdir(workdir: str) -> str:
    return slugify(Path(workdir).name)


def session_project_name(session: sqlite3.Row | dict[str, str]) -> str:
    explicit = session["project"] if "project" in session.keys() else session.get("project", "")
    return explicit or infer_project_from_workdir(session["workdir"])


def filter_sessions_by_project(sessions: list[sqlite3.Row], project: str | None) -> list[sqlite3.Row]:
    normalized = normalize_project(project)
    if not normalized:
        return sessions
    return [session for session in sessions if session_project_name(session) == normalized]


def project_from_arg_or_env(project: str | None) -> str:
    normalized = normalize_project(project or os.environ.get("AGENTMUX_PROJECT"))
    if not normalized:
        raise SystemExit("Project is required. Pass a project tag or run from a managed AGENTMUX_PROJECT terminal.")
    return normalized


def session_metadata(session: sqlite3.Row | dict[str, str]) -> dict[str, object]:
    raw = session["metadata_json"] if "metadata_json" in session.keys() else session.get("metadata_json", "{}")
    if not raw:
        return {}
    try:
        parsed = json.loads(raw)
    except (TypeError, json.JSONDecodeError):
        return {}
    return parsed if isinstance(parsed, dict) else {}


def session_role(session: sqlite3.Row | dict[str, str]) -> str:
    role = session_metadata(session).get("role")
    return str(role).strip() if role else ""


def metadata_text(metadata: dict[str, object], key: str) -> str:
    value = metadata.get(key)
    return str(value).strip() if value is not None else ""


def metadata_depth(metadata: dict[str, object], fallback: int) -> int:
    value = metadata.get("depth")
    try:
        depth = int(value)
    except (TypeError, ValueError):
        return fallback
    return max(0, depth)


def session_awareness_role_from_metadata(metadata: dict[str, object]) -> str:
    del metadata
    return "agent"


def session_awareness_depth(metadata: dict[str, object], role: str) -> int:
    del role
    return metadata_depth(metadata, fallback=0)


def session_awareness_parent(project: str, role: str, metadata: dict[str, object]) -> str:
    del project, role
    return metadata_text(metadata, "parent_agent")


def agentmux_bin_path() -> str:
    wrapper_path = Path(__file__).resolve().with_name("agentmux")
    if wrapper_path.exists():
        return str(wrapper_path)
    return str(Path(__file__).resolve())


def build_session_awareness_env(
    *,
    session_id: str,
    name: str,
    project: str,
    workdir: str,
    tmux_session: str,
    metadata: dict[str, object] | None = None,
) -> dict[str, str]:
    resolved_metadata = metadata or {}
    role = session_awareness_role_from_metadata(resolved_metadata)
    normalized_project = normalize_project(project)
    return {
        "AGENTMUX_AGENT_ID": session_id,
        "AGENTMUX_AGENT_NAME": name,
        "AGENTMUX_PROJECT": normalized_project,
        "AGENTMUX_ROLE": role,
        "AGENTMUX_DEPTH": str(session_awareness_depth(resolved_metadata, role)),
        "AGENTMUX_PARENT_AGENT": session_awareness_parent(normalized_project, role, resolved_metadata),
        "AGENTMUX_WORKDIR": workdir,
        "AGENTMUX_TMUX_SESSION": tmux_session,
        "AGENTMUX_HOME": str(APP_DIR),
        "AGENTMUX_BIN": agentmux_bin_path(),
        "PATH": os.environ.get("PATH", ""),
    }


def build_session_awareness_env_args(env_values: dict[str, str]) -> list[str]:
    return [f"{key}={value}" for key, value in env_values.items() if value]


def utf8_locale(value: str | None) -> str:
    return value if value and re.search(r"UTF-?8", value, re.IGNORECASE) else UTF8_LOCALE


def build_interactive_color_env_args() -> list[str]:
    return [
        "-u",
        "NO_COLOR",
        f"LANG={utf8_locale(os.environ.get('LANG'))}",
        f"LC_CTYPE={utf8_locale(os.environ.get('LC_CTYPE') or os.environ.get('LANG'))}",
        "COLORTERM=truecolor",
        "CLICOLOR=1",
        "CLICOLOR_FORCE=1",
        "FORCE_COLOR=3",
    ]


def agentmux_command_hint() -> str:
    wrapper_path = Path(agentmux_bin_path())
    if wrapper_path.name == "agentmux":
        return shlex.quote(str(wrapper_path))
    return f"python3 {shlex.quote(str(Path(__file__).resolve()))}"


def project_worker_command_hint(project_name: str, workdir: str, parent_agent: str | None = None) -> str:
    parts = [
        agentmux_command_hint(),
        "worker",
        shlex.quote(normalize_project(project_name)),
        '"<worker-name>"',
        "--workdir",
        shlex.quote(str(Path(workdir).resolve())),
        "--harness",
        "shell",
    ]
    if parent_agent:
        parts.extend(["--parent", shlex.quote(parent_agent)])
    return " ".join(parts)


def default_worker_parent_context() -> dict[str, object]:
    # No parent supplied and none inferable: the worker joins the graph as a root.
    return {"parent_agent": "", "depth": 0}


def resolve_project_worker_parent(
    conn: sqlite3.Connection,
    project_name: str,
    child_name: str,
    explicit_parent: str | None = None,
) -> dict[str, object]:
    normalized = normalize_project(project_name)
    parent_identifier = (explicit_parent or "").strip()
    is_explicit_parent = bool(parent_identifier)

    if not parent_identifier:
        env_project = normalize_project(os.environ.get("AGENTMUX_PROJECT"))
        env_agent = (os.environ.get("AGENTMUX_AGENT_NAME") or "").strip()
        if env_agent and (not env_project or env_project == normalized):
            parent_identifier = env_agent

    if not parent_identifier:
        return default_worker_parent_context()

    try:
        parent_session = resolve_session(conn, parent_identifier)
    except SystemExit:
        if is_explicit_parent:
            raise
        return default_worker_parent_context()

    parent_project = session_project_name(parent_session)
    if parent_project != normalized:
        raise SystemExit(f"Parent agent '{parent_session['name']}' belongs to project '{parent_project}', not '{normalized}'.")
    if parent_session["name"] == child_name:
        raise SystemExit("Worker cannot use itself as its parent.")

    parent_metadata = session_metadata(parent_session)
    parent_role = session_awareness_role_from_metadata(parent_metadata)
    parent_depth = session_awareness_depth(parent_metadata, parent_role)
    return {
        "parent_agent": parent_session["name"],
        "depth": parent_depth + 1,
    }


def create_project_worker(
    conn: sqlite3.Connection,
    project_name: str,
    agent_name: str,
    workdir: str,
    prompt: str | None = None,
    model: str | None = None,
    harness_id: str = "shell",
    parent_agent: str | None = None,
    briefing: bool = True,
) -> sqlite3.Row:
    normalized = normalize_project(project_name)
    child_name = slugify(agent_name)
    parent_context = resolve_project_worker_parent(
        conn,
        normalized,
        child_name,
        explicit_parent=parent_agent,
    )
    worker = create_managed_session(
        conn,
        name=child_name,
        harness=HARNESSES.get(harness_id, HARNESSES["shell"]),
        extra_args=[],
        workdir=str(Path(workdir).resolve()),
        project=normalized,
        model=model,
        prompt=prompt,
        metadata={
            "role": "agent",
            "project": normalized,
            "parent_agent": parent_context["parent_agent"],
            "depth": parent_context["depth"],
        },
        briefing=briefing,
    )
    spawner = str(parent_context["parent_agent"] or "")
    if spawner and try_resolve_session(conn, spawner) is not None:
        create_edge(conn, normalized, spawner, child_name, kind="spawn")
    return worker


def resolve_session(conn: sqlite3.Connection, identifier: str) -> sqlite3.Row:
    rows = conn.execute(
        "SELECT * FROM sessions WHERE name = ? OR id = ? OR id LIKE ? ORDER BY created_at ASC",
        (identifier, identifier, f"{identifier}%"),
    ).fetchall()
    if not rows:
        raise SystemExit(f"No session found for '{identifier}'.")
    if len(rows) > 1:
        choices = ", ".join(f"{row['name']}({short_id(row['id'])})" for row in rows)
        raise SystemExit(f"Ambiguous session identifier '{identifier}': {choices}")
    return rows[0]


def try_resolve_session(conn: sqlite3.Connection, identifier: str) -> sqlite3.Row | None:
    try:
        return resolve_session(conn, identifier)
    except SystemExit:
        return None


def edge_summary(edge: sqlite3.Row) -> dict[str, object]:
    return {
        "from": edge["agent_a"],
        "to": edge["agent_b"],
        "kind": edge["kind"],
        "created_at": edge["created_at"],
    }


def find_edge(conn: sqlite3.Connection, project: str, agent_a: str, agent_b: str) -> sqlite3.Row | None:
    return conn.execute(
        "SELECT * FROM edges WHERE project = ? AND ((agent_a = ? AND agent_b = ?) OR (agent_a = ? AND agent_b = ?))",
        (project, agent_a, agent_b, agent_b, agent_a),
    ).fetchone()


def create_edge(conn: sqlite3.Connection, project: str, agent_a: str, agent_b: str, kind: str = "link") -> dict[str, object]:
    if agent_a == agent_b:
        raise SystemExit("An agent cannot connect to itself.")
    existing = find_edge(conn, project, agent_a, agent_b)
    if existing is not None:
        return edge_summary(existing)
    conn.execute(
        "INSERT INTO edges(project, agent_a, agent_b, kind, created_at) VALUES(?, ?, ?, ?, ?)",
        (project, agent_a, agent_b, kind, utc_now()),
    )
    created = find_edge(conn, project, agent_a, agent_b)
    return edge_summary(created) if created is not None else {"from": agent_a, "to": agent_b, "kind": kind}


def delete_edge(conn: sqlite3.Connection, project: str, agent_a: str, agent_b: str) -> bool:
    cursor = conn.execute(
        "DELETE FROM edges WHERE project = ? AND ((agent_a = ? AND agent_b = ?) OR (agent_a = ? AND agent_b = ?))",
        (project, agent_a, agent_b, agent_b, agent_a),
    )
    return cursor.rowcount > 0


def delete_agent_edges(conn: sqlite3.Connection, project: str, agent_name: str) -> None:
    conn.execute(
        "DELETE FROM edges WHERE project = ? AND (agent_a = ? OR agent_b = ?)",
        (project, agent_name, agent_name),
    )


def list_project_edges(conn: sqlite3.Connection, project: str) -> list[dict[str, object]]:
    rows = conn.execute(
        "SELECT * FROM edges WHERE project = ? ORDER BY created_at ASC, id ASC",
        (project,),
    ).fetchall()
    return [edge_summary(row) for row in rows]


def compute_agent_neighbors(conn: sqlite3.Connection, session: sqlite3.Row) -> list[dict[str, object]]:
    """Neighbors = stored edges touching this agent, plus spawn lineage derived
    from parent_agent metadata for agents that predate the edges table."""
    name = session["name"]
    project = session_project_name(session)
    neighbors: dict[str, dict[str, object]] = {}

    for edge in list_project_edges(conn, project):
        other = None
        if edge["from"] == name:
            other = str(edge["to"])
        elif edge["to"] == name:
            other = str(edge["from"])
        if other is not None and other not in neighbors:
            neighbors[other] = {"name": other, "kind": edge["kind"]}

    sessions = filter_sessions_by_project(conn.execute("SELECT * FROM sessions").fetchall(), project)
    by_name = {row["name"]: row for row in sessions}
    own_parent = metadata_text(session_metadata(session), "parent_agent")
    if own_parent and own_parent != name and own_parent in by_name and own_parent not in neighbors:
        neighbors[own_parent] = {"name": own_parent, "kind": "spawn"}
    for row in sessions:
        row_parent = metadata_text(session_metadata(row), "parent_agent")
        if row_parent == name and row["name"] != name and row["name"] not in neighbors:
            neighbors[row["name"]] = {"name": row["name"], "kind": "spawn"}

    return sorted(neighbors.values(), key=lambda item: str(item["name"]))


def tmux_format(tmux_session: str, fmt: str) -> str:
    result = tmux("display-message", "-p", "-t", tmux_session, fmt, check=False)
    if result.returncode != 0:
        return ""
    return result.stdout.strip()


def infer_resume_command(harness_id: str, external_session_id: str) -> str:
    if not external_session_id:
        return ""
    if harness_id == "opencode":
        command_parts = apply_model_to_command_parts(harness_id, ["opencode", "-s", external_session_id])
        return " ".join(shlex.quote(part) for part in command_parts)
    return ""


def command_parts_from_text(command_text: str) -> list[str]:
    if not command_text.strip():
        raise SystemExit("No stored command is available for this agent.")
    return shlex.split(command_text)


def emit_event(conn: sqlite3.Connection, session_id: str, event_type: str, message: str) -> None:
    conn.execute(
        "INSERT INTO events(session_id, event_type, message, created_at) VALUES(?, ?, ?, ?)",
        (session_id, event_type, message, utc_now()),
    )


def infer_state(session: sqlite3.Row | dict[str, str], pane_text: str, is_running: bool) -> str:
    if not is_running:
        return "stopped"
    for pattern in WAIT_PATTERNS:
        if pattern.search(pane_text):
            return "waiting"
    last_activity = datetime.fromisoformat(session["last_activity_at"])
    seconds_since = (datetime.now(timezone.utc) - last_activity).total_seconds()
    if seconds_since < 8:
        return "running"
    return "idle"


def refresh_one(conn: sqlite3.Connection, session: sqlite3.Row) -> sqlite3.Row:
    tmux_session = session["tmux_session"]
    running = has_tmux_session(tmux_session)
    pane_text = capture_pane(tmux_session) if running else ""
    pane_hash = hash_text(pane_text) if pane_text else ""
    updates: dict[str, str] = {}
    if pane_text and pane_hash != session["last_output_hash"]:
        updates["last_output"] = pane_text
        updates["last_output_hash"] = pane_hash
        updates["last_activity_at"] = utc_now()

    updated_base = {**{k: session[k] for k in session.keys()}, **updates}
    pseudo_row = dict(updated_base)
    pseudo_row["last_activity_at"] = updates.get("last_activity_at", session["last_activity_at"])
    state = infer_state(pseudo_row, pane_text, running)
    if state != session["state"]:
        updates["state"] = state
    if updates:
        updates["updated_at"] = utc_now()
        set_clause = ", ".join(f"{key} = ?" for key in updates)
        conn.execute(
            f"UPDATE sessions SET {set_clause} WHERE id = ?",
            [*updates.values(), session["id"]],
        )
        if "state" in updates:
            emit_event(conn, session["id"], "session.state", f"State changed to {updates['state']}")
    return conn.execute("SELECT * FROM sessions WHERE id = ?", (session["id"],)).fetchone()


def refresh_all(conn: sqlite3.Connection) -> list[sqlite3.Row]:
    sessions = conn.execute("SELECT * FROM sessions ORDER BY created_at ASC").fetchall()
    return [refresh_one(conn, session) for session in sessions]


def refresh_project(conn: sqlite3.Connection, project: str | None) -> list[sqlite3.Row]:
    sessions = conn.execute("SELECT * FROM sessions ORDER BY created_at ASC").fetchall()
    project_sessions = filter_sessions_by_project(sessions, project)
    return [refresh_one(conn, session) for session in project_sessions]


def fetch_recent_events(conn: sqlite3.Connection, session_id: str, limit: int) -> list[sqlite3.Row]:
    return conn.execute(
        "SELECT event_type, message, created_at FROM events WHERE session_id = ? ORDER BY id DESC LIMIT ?",
        (session_id, limit),
    ).fetchall()


def select_harness(args: argparse.Namespace) -> tuple[Harness, list[str]]:
    harness = HARNESSES[args.harness]
    if harness.id == "custom":
        if not args.cmd:
            raise SystemExit("Custom harness requires --cmd.")
        if not command_exists(args.cmd):
            raise SystemExit(f"Command not found: {args.cmd}")
        return Harness("custom", args.cmd, "Custom command"), list(args.arg or [])
    if not command_exists(harness.command):
        raise SystemExit(f"Harness '{harness.id}' is unavailable because '{harness.command}' is not installed.")
    return harness, []


def build_spawn_briefing(name: str, project: str, parent_agent: str = "") -> str:
    quoted_name = shlex.quote(name)
    parent_note = (
        f"You were spawned by agent '{parent_agent}' — your first neighbor; report back to it when it asks. "
        if parent_agent
        else ""
    )
    return (
        f"[TermCanvas] You are agent '{name}' on canvas project '{project}', one node in a graph of peer agents. "
        f"{parent_note}"
        f'Operate the graph with the agentmux CLI at "$AGENTMUX_BIN": '
        f'"$AGENTMUX_BIN" neighbors (list agents connected to you), '
        f'"$AGENTMUX_BIN" ask <agent> "<task>" (delegate and wait for the answer), '
        f'"$AGENTMUX_BIN" check <agent> (peek without interrupting), '
        f'"$AGENTMUX_BIN" child {quoted_name} <child-name> --prompt "<task>" (spawn a sub-agent wired to you). '
        f"For the full manual load the 'agentmux' skill if you have it."
    )


def create_managed_session(
    conn: sqlite3.Connection,
    *,
    name: str,
    harness: Harness,
    extra_args: list[str],
    workdir: str,
    project: str,
    model: str | None = None,
    prompt: str | None = None,
    startup_delay: float = 1.0,
    ready_timeout: float = 25.0,
    agent_state: str = "active",
    metadata: dict[str, object] | None = None,
    external_session_id: str = "",
    briefing: bool = True,
) -> sqlite3.Row:
    existing = conn.execute("SELECT 1 FROM sessions WHERE name = ?", (name,)).fetchone()
    if existing:
        raise SystemExit(f"Agent name already exists: {name}")

    session_id = str(uuid.uuid4())
    tmux_session = f"agentmux-{name}-{short_id(session_id)}"
    command_parts = build_command_parts(harness, extra_args, model=model, session_id=external_session_id or None)
    command_text = " ".join(shlex.quote(part) for part in command_parts)
    session_env_args = build_session_awareness_env_args(
        build_session_awareness_env(
            session_id=session_id,
            name=name,
            project=project,
            workdir=workdir,
            tmux_session=tmux_session,
            metadata=metadata,
        )
    )

    tmux(
        "new-session",
        "-d",
        "-s",
        tmux_session,
        "-c",
        workdir,
        "env",
        *build_interactive_color_env_args(),
        *session_env_args,
        *command_parts,
    )
    now = utc_now()
    conn.execute(
        textwrap.dedent(
            """
            INSERT INTO sessions(
              id, name, harness, tmux_session, workdir, command_text,
              state, agent_state, created_at, updated_at, last_activity_at, startup_delay, project, metadata_json,
              external_session_id
            ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """
        ),
        (
            session_id,
            name,
            harness.id,
            tmux_session,
            workdir,
            command_text,
            "starting",
            agent_state,
            now,
            now,
            now,
            startup_delay,
            project,
            json.dumps(metadata or {}, sort_keys=True),
            external_session_id or "",
        ),
    )
    emit_event(conn, session_id, "session.created", f"Created session {name} with {harness.id}")

    briefing_text = ""
    if briefing and harness.id in BRIEFING_HARNESS_IDS:
        briefing_text = build_spawn_briefing(
            name,
            normalize_project(project),
            parent_agent=metadata_text(metadata or {}, "parent_agent"),
        )

    initial_message = briefing_text
    if prompt:
        initial_message = f"{briefing_text} Your first task from the operator: {prompt}" if briefing_text else prompt

    if initial_message:
        ready = wait_until_ready(
            tmux_session,
            harness.id,
            timeout=ready_timeout,
            fallback_delay=startup_delay,
        )
        if not ready:
            raise SystemExit(f"Session '{name}' exited before it became ready for input.")
        send_keys(tmux_session, initial_message)
        emit_event(conn, session_id, "session.input", f"Initial prompt sent: {initial_message}")
        conn.execute(
            "UPDATE sessions SET state = ?, updated_at = ?, last_activity_at = ? WHERE id = ?",
            ("running", utc_now(), utc_now(), session_id),
        )

    session = conn.execute("SELECT * FROM sessions WHERE id = ?", (session_id,)).fetchone()
    return refresh_one(conn, session)


def create_session(args: argparse.Namespace) -> None:
    harness, extra_args = select_harness(args)
    name = slugify(args.agent or args.name or f"{args.harness}-{uuid.uuid4().hex[:4]}")
    workdir = str(Path(args.workdir or os.getcwd()).resolve())
    project = normalize_project(args.project) or infer_project_from_workdir(workdir)

    with db() as conn:
        session = create_managed_session(
            conn,
            name=name,
            harness=harness,
            extra_args=extra_args,
            workdir=workdir,
            project=project,
            model=args.model,
            prompt=args.prompt,
            startup_delay=args.startup_delay,
            ready_timeout=args.ready_timeout,
            external_session_id=args.session or "",
            briefing=not args.no_briefing,
        )

    print(f"Created {session['name']} ({short_id(session['id'])})")
    print(f"tmux: {session['tmux_session']}")
    print(f"cwd:  {session['workdir']}")
    print(f"run:  {session['command_text']}")


def import_session(args: argparse.Namespace) -> None:
    name = slugify(args.agent)
    tmux_session = args.tmux_session
    if not has_tmux_session(tmux_session):
        raise SystemExit(f"tmux session '{tmux_session}' is not running.")

    workdir = str(Path(args.workdir).resolve()) if args.workdir else tmux_format(tmux_session, "#{pane_current_path}")
    if not workdir:
        workdir = str(Path.cwd())
    project = normalize_project(args.project) or infer_project_from_workdir(workdir)

    command_text = args.cmd or infer_resume_command(args.harness, args.session_id)
    if not command_text:
        command_text = tmux_format(tmux_session, "#{pane_current_command}")
    command_parts = apply_model_to_command_parts(args.harness, command_parts_from_text(command_text), model=args.model)
    command_text = " ".join(shlex.quote(part) for part in command_parts)

    with db() as conn:
        existing = conn.execute("SELECT 1 FROM sessions WHERE name = ?", (name,)).fetchone()
        if existing:
            raise SystemExit(f"Agent name already exists: {name}")
        tracked_tmux = conn.execute("SELECT 1 FROM sessions WHERE tmux_session = ?", (tmux_session,)).fetchone()
        if tracked_tmux:
            raise SystemExit(f"tmux session '{tmux_session}' is already tracked.")

        session_id = str(uuid.uuid4())
        now = utc_now()
        pane_text = capture_pane(tmux_session)
        pane_hash = hash_text(pane_text) if pane_text else ""
        pseudo = {
            "last_activity_at": now,
        }
        state = infer_state(pseudo, pane_text, True)
        conn.execute(
            textwrap.dedent(
                """
                INSERT INTO sessions(
                  id, name, harness, tmux_session, workdir, command_text, state,
                  agent_state, created_at, updated_at, last_activity_at,
                  last_output, last_output_hash, startup_delay, external_session_id, project,
                  metadata_json
                ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """
            ),
            (
                session_id,
                name,
                args.harness,
                tmux_session,
                workdir,
                command_text,
                state,
                "active",
                now,
                now,
                now,
                pane_text,
                pane_hash,
                args.startup_delay,
                args.session_id or "",
                project,
                # Imported/adopted terminals join the graph as root agents.
                json.dumps(
                    {
                        "role": "agent",
                        "project": project,
                        "parent_agent": "",
                        "depth": 0,
                    },
                    sort_keys=True,
                ),
            ),
        )
        message = f"Imported tmux session {tmux_session}"
        if args.session_id:
            message += f" ({args.session_id})"
        emit_event(conn, session_id, "session.imported", message)
        session = conn.execute("SELECT * FROM sessions WHERE id = ?", (session_id,)).fetchone()
        session = refresh_one(conn, session)

    print(f"Imported {session['name']} ({short_id(session['id'])})")
    print(f"tmux: {session['tmux_session']}")
    print(f"cwd:  {session['workdir']}")
    print(f"run:  {session['command_text'] or '<unknown>'}")


def resume_session(args: argparse.Namespace) -> None:
    with db() as conn:
        session = resolve_session(conn, args.session)
        refreshed = resume_session_runtime(
            conn,
            session,
            command_override=args.cmd,
            prompt=args.prompt,
            ready_timeout=args.ready_timeout,
        )

    print(f"Resumed {refreshed['name']} ({short_id(refreshed['id'])})")
    print(f"tmux: {refreshed['tmux_session']}")
    print(f"run:  {refreshed['command_text']}")


def format_age(seconds: int) -> str:
    if seconds < 60:
        return f"{seconds}s"
    if seconds < 3600:
        return f"{seconds // 60}m"
    if seconds < 86400:
        return f"{seconds // 3600}h"
    return f"{seconds // 86400}d"


def seconds_since(iso_timestamp: str) -> int:
    timestamp = datetime.fromisoformat(iso_timestamp)
    return max(0, int((datetime.now(timezone.utc) - timestamp).total_seconds()))


def abbreviate_home(path: str) -> str:
    home = str(Path.home())
    return path.replace(home, "~") if path.startswith(home) else path


def clip_text(text: str, width: int) -> str:
    if width <= 0:
        return ""
    if len(text) <= width:
        return text
    if width <= 1:
        return text[:width]
    return text[: width - 1] + "…"


def tail_lines(text: str, limit: int) -> str:
    if not text:
        return ""
    lines = text.splitlines()
    return "\n".join(lines[-limit:])


def wrap_lines(text: str, width: int) -> list[str]:
    if width <= 1:
        return [""]
    wrapped: list[str] = []
    for raw_line in text.splitlines() or [""]:
        pieces = textwrap.wrap(raw_line, width=width, replace_whitespace=False, drop_whitespace=False)
        wrapped.extend(pieces or [""])
    return wrapped or [""]


def indent_block(text: str, prefix: str) -> str:
    return "\n".join(f"{prefix}{line}" for line in text.splitlines()) if text else f"{prefix}<empty>"


def style_state(state: str, use_color: bool = True) -> str:
    label, color = STATE_STYLES.get(state, (state.upper(), "37"))
    if not use_color:
        return label
    return f"\033[{color}m{label}\033[0m"


def sort_sessions_for_attention(sessions: list[sqlite3.Row]) -> list[sqlite3.Row]:
    return sorted(
        sessions,
        key=lambda session: (
            STATE_PRIORITY.get(session["state"], 99),
            session["last_activity_at"],
        ),
    )


def build_session_rows(sessions: list[sqlite3.Row]) -> list[dict[str, str]]:
    now_dt = datetime.now(timezone.utc)
    rows: list[dict[str, str]] = []
    for session in sessions:
        created = datetime.fromisoformat(session["created_at"])
        age_seconds = int((now_dt - created).total_seconds())
        rows.append(
            {
                "id": short_id(session["id"]),
                "harness": session["harness"],
                "agent_state": session["agent_state"],
                "state": session["state"],
                "state_label": session["state"].upper(),
                "age": format_age(age_seconds),
                "project": session_project_name(session),
                "name": session["name"],
                "workdir": abbreviate_home(session["workdir"]),
            }
        )
    return rows


def render_session_table(sessions: list[sqlite3.Row], use_color: bool = False) -> str:
    rows = build_session_rows(sessions)
    if not rows:
        return "No agents yet. Use `new` or `import` to create one."

    header = f"{'ID':8} {'HARNESS':10} {'AGENT':10} {'RUNTIME':9} {'AGE':8} {'PROJECT':16} {'NAME':24} WORKDIR"
    lines = [header, "-" * len(header)]
    for row in rows:
        state = style_state(row["state"], use_color=use_color)
        lines.append(
            f"{row['id']:8} {row['harness']:10} {row['agent_state'][:10]:10} {state:9} {row['age']:8} {row['project'][:16]:16} {row['name'][:24]:24} {row['workdir']}"
        )
    return "\n".join(lines)


def session_attention(session: sqlite3.Row) -> str | None:
    if session["agent_state"] == "failed":
        return "failed"
    if session["state"] == "waiting":
        return "waiting"
    if session["agent_state"] == "active" and session["state"] == "stopped":
        return "stopped"
    if session["agent_state"] == "active" and seconds_since(session["last_activity_at"]) >= STALE_AFTER_SECONDS:
        return "stale"
    if session["agent_state"] == "finished":
        return "done"
    return None


def board_column_for_session(session: sqlite3.Row) -> str:
    agent_state = session["agent_state"]
    runtime_state = session["state"]
    attention = session_attention(session)

    if agent_state in {"finished", "archived"}:
        return "done"
    if agent_state == "failed" or runtime_state == "waiting" or attention == "stale":
        return "review"
    if agent_state == "idle" or runtime_state == "stopped":
        return "todo"
    return "in_progress"


def session_summary(session: sqlite3.Row) -> dict[str, object]:
    metadata = session_metadata(session)
    role = session_awareness_role_from_metadata(metadata)
    project = session_project_name(session)

    return {
        "id": session["id"],
        "short_id": short_id(session["id"]),
        "name": session["name"],
        "role": role,
        "raw_role": session_role(session),
        "depth": session_awareness_depth(metadata, role),
        "parent_agent": session_awareness_parent(project, role, metadata),
        "harness": session["harness"],
        "agent_state": session["agent_state"],
        "runtime_state": session["state"],
        "attention": session_attention(session),
        "board_column": board_column_for_session(session),
        "project": project,
        "tmux_session": session["tmux_session"],
        "workdir": session["workdir"],
        "command_text": session["command_text"],
        "external_session_id": session["external_session_id"],
        "created_at": session["created_at"],
        "updated_at": session["updated_at"],
        "last_activity_at": session["last_activity_at"],
        "last_activity_age_seconds": seconds_since(session["last_activity_at"]),
        "last_output_preview": tail_lines(session["last_output"], 8),
    }


def event_summary(event: sqlite3.Row) -> dict[str, str]:
    return {
        "created_at": event["created_at"],
        "event_type": event["event_type"],
        "message": event["message"],
    }


def conversation_items(session: sqlite3.Row, events: list[sqlite3.Row]) -> list[dict[str, str]]:
    items: list[dict[str, str]] = []
    ordered = list(reversed(events))
    for event in ordered:
        event_type = event["event_type"]
        message = event["message"]
        role = "system"
        if event_type == "session.input":
            if message.startswith("Initial prompt sent:"):
                continue
            role = "user"
            if ": " in message:
                message = message.split(": ", 1)[1]
        items.append(
            {
                "role": role,
                "kind": "event",
                "created_at": event["created_at"],
                "event_type": event_type,
                "text": message,
            }
        )

    output = (session["last_output"] or "").strip()
    if output:
        items.append(
            {
                "role": "assistant",
                "kind": "output",
                "created_at": session["last_activity_at"],
                "event_type": "session.output",
                "text": tail_lines(output, 80),
            }
        )
    return items


def session_detail(conn: sqlite3.Connection, session: sqlite3.Row, event_limit: int = 20) -> dict[str, object]:
    session = refresh_one(conn, session)
    events = fetch_recent_events(conn, session["id"], limit=event_limit)
    detail = session_summary(session)
    detail["last_output"] = session["last_output"]
    detail["events"] = [event_summary(event) for event in events]
    detail["conversation"] = conversation_items(session, events)
    detail["attach_command"] = f"tmux attach -t {session['tmux_session']}"
    return detail


def build_board_projects(sessions: list[sqlite3.Row]) -> list[dict[str, object]]:
    grouped: dict[str, list[sqlite3.Row]] = {}
    for session in sessions:
        grouped.setdefault(session_project_name(session), []).append(session)

    projects: list[dict[str, object]] = []
    for project_name in sorted(grouped.keys()):
        project_sessions = sort_sessions_for_attention(grouped[project_name])
        board_sessions = project_sessions
        workdirs = sorted({session["workdir"] for session in project_sessions})
        payload = {
            "project": project_name,
            "display_name": project_name.replace("-", " "),
            "workdirs": workdirs,
            "agent_count": len(board_sessions),
            "counts": {"todo": 0, "in_progress": 0, "review": 0, "done": 0},
            "columns": {"todo": [], "in_progress": [], "review": [], "done": []},
        }
        for session in board_sessions:
            column = board_column_for_session(session)
            summary = session_summary(session)
            payload["counts"][column] += 1
            payload["columns"][column].append(summary)
        projects.append(payload)
    return projects


def project_detail(conn: sqlite3.Connection, project_name: str, event_limit: int = 20) -> dict[str, object]:
    normalized = normalize_project(project_name)
    if not normalized:
        raise SystemExit("Project is required.")

    sessions = sort_sessions_for_attention(refresh_project(conn, normalized))
    if not sessions:
        raise SystemExit(f"No project found for '{normalized}'.")

    return build_board_projects(sessions)[0]


def project_payload_from_sessions(project_name: str, sessions: list[sqlite3.Row], edges: list[dict[str, object]] | None = None) -> dict[str, object]:
    normalized = normalize_project(project_name)
    return {
        "project": normalized,
        "sessions": [session_summary(session) for session in sessions],
        "workdirs": sorted({session["workdir"] for session in sessions}),
        "edges": edges if edges is not None else [],
    }


def project_status_payload(conn: sqlite3.Connection, project_name: str) -> dict[str, object]:
    normalized = normalize_project(project_name)
    sessions = sort_sessions_for_attention(refresh_project(conn, normalized))
    return project_payload_from_sessions(normalized, sessions, edges=list_project_edges(conn, normalized))


def tree_sort_key(summary: dict[str, object]) -> tuple[int, int, str]:
    depth = summary.get("depth")
    return (
        depth if isinstance(depth, int) else 999,
        str(summary.get("name") or ""),
    )


def build_project_tree_nodes(summaries: list[dict[str, object]]) -> list[dict[str, object]]:
    by_name = {
        str(summary["name"]): summary
        for summary in summaries
        if isinstance(summary.get("name"), str) and str(summary.get("name")).strip()
    }
    children_by_parent: dict[str, list[dict[str, object]]] = {name: [] for name in by_name}
    roots: list[dict[str, object]] = []

    for summary in summaries:
        name = str(summary.get("name") or "")
        parent_name = str(summary.get("parent_agent") or "").strip()

        if parent_name and parent_name != name and parent_name in by_name:
            children_by_parent[parent_name].append(summary)
        else:
            roots.append(summary)

    def build_node(summary: dict[str, object]) -> dict[str, object]:
        name = str(summary.get("name") or "")
        children = sorted(children_by_parent.get(name, []), key=tree_sort_key)
        return {
            "agent": summary,
            "children": [build_node(child) for child in children],
        }

    return [build_node(summary) for summary in sorted(roots, key=tree_sort_key)]


def project_tree_payload(conn: sqlite3.Connection, project_name: str) -> dict[str, object]:
    normalized = project_from_arg_or_env(project_name)
    sessions = sort_sessions_for_attention(refresh_project(conn, normalized))
    if not sessions:
        raise SystemExit(f"No project found for '{normalized}'.")

    summaries = [session_summary(session) for session in sessions]
    runtime_counts: dict[str, int] = {}
    agent_counts: dict[str, int] = {}
    attention: list[dict[str, object]] = []

    for summary in summaries:
        runtime_state = str(summary.get("runtime_state") or "unknown")
        agent_state = str(summary.get("agent_state") or "unknown")
        runtime_counts[runtime_state] = runtime_counts.get(runtime_state, 0) + 1
        agent_counts[agent_state] = agent_counts.get(agent_state, 0) + 1
        if summary.get("attention"):
            attention.append(summary)

    return {
        "project": normalized,
        "agent_count": len(summaries),
        "runtime_counts": runtime_counts,
        "agent_counts": agent_counts,
        "attention": sorted(attention, key=tree_sort_key),
        "tree": build_project_tree_nodes(summaries),
        "sessions": summaries,
        "edges": list_project_edges(conn, normalized),
    }


def format_agent_summary(summary: dict[str, object]) -> str:
    name = str(summary.get("name") or "<unknown>")
    role = str(summary.get("role") or "agent")
    agent_state = str(summary.get("agent_state") or "unknown")
    runtime_state = str(summary.get("runtime_state") or "unknown")
    depth = summary.get("depth")
    attention = summary.get("attention")
    pieces = [
        f"{name} ({role})",
        f"{agent_state}/{runtime_state}",
    ]
    if isinstance(depth, int):
        pieces.append(f"depth={depth}")
    if attention:
        pieces.append(f"attention={attention}")
    return "  ".join(pieces)


def render_tree_node(node: dict[str, object], prefix: str = "", is_last: bool = True, is_root: bool = False) -> list[str]:
    summary = node.get("agent")
    if not isinstance(summary, dict):
        return []

    connector = "" if is_root else ("`- " if is_last else "|- ")
    lines = [f"{prefix}{connector}{format_agent_summary(summary)}"]
    child_prefix = prefix if is_root else prefix + ("   " if is_last else "|  ")
    children = node.get("children")
    if not isinstance(children, list):
        return lines

    for index, child in enumerate(children):
        if isinstance(child, dict):
            lines.extend(render_tree_node(child, child_prefix, index == len(children) - 1))
    return lines


def render_project_command_hints(project: str) -> list[str]:
    del project
    command = agentmux_command_hint()
    return [
        "Command center:",
        f"  child:    {command} child <parent-agent> <worker-name> --prompt \"<task>\"",
        f"  connect:  {command} connect <agent-a> <agent-b> --announce",
        f"  ask:      {command} ask <agent> \"<prompt>\"",
        f"  inspect:  {command} show <agent>",
        f"  logs:     {command} logs <agent> --lines 120",
        f"  send:     {command} send <agent> \"<prompt>\"",
        f"  stop:     {command} stop <agent>",
    ]


def render_project_tree(payload: dict[str, object]) -> str:
    project = str(payload.get("project") or "")
    runtime_counts = payload.get("runtime_counts")
    runtime_text = ", ".join(f"{key}={value}" for key, value in sorted(runtime_counts.items())) if isinstance(runtime_counts, dict) else ""
    lines = [
        f"Project: {project}",
        f"Agents: {payload.get('agent_count', 0)}" + (f"  runtime: {runtime_text}" if runtime_text else ""),
        "",
        "Tree:",
    ]

    tree = payload.get("tree")
    if isinstance(tree, list) and tree:
        for index, node in enumerate(tree):
            if isinstance(node, dict):
                lines.extend(render_tree_node(node, is_last=index == len(tree) - 1, is_root=True))
    else:
        lines.append("  <empty>")

    lines.append("")
    lines.extend(render_project_command_hints(project))
    return "\n".join(lines)


def render_project_status(payload: dict[str, object]) -> str:
    project = str(payload.get("project") or "")
    runtime_counts = payload.get("runtime_counts")
    agent_counts = payload.get("agent_counts")
    runtime_text = ", ".join(f"{key}={value}" for key, value in sorted(runtime_counts.items())) if isinstance(runtime_counts, dict) else ""
    agent_text = ", ".join(f"{key}={value}" for key, value in sorted(agent_counts.items())) if isinstance(agent_counts, dict) else ""
    lines = [
        f"Project: {project}",
        f"Agents: {payload.get('agent_count', 0)}",
        f"Runtime: {runtime_text or '<none>'}",
        f"Agent state: {agent_text or '<none>'}",
        "",
        "Attention:",
    ]

    attention = payload.get("attention")
    if isinstance(attention, list) and attention:
        for summary in attention:
            if isinstance(summary, dict):
                lines.append(f"  - {format_agent_summary(summary)}")
    else:
        lines.append("  <none>")

    lines.append("")
    lines.extend(render_project_command_hints(project))
    return "\n".join(lines)


def send_text_to_session(conn: sqlite3.Connection, session: sqlite3.Row, text: str) -> sqlite3.Row:
    if has_tmux_session(session["tmux_session"]):
        return send_input_to_runtime(conn, session, text)
    return resume_session_runtime(conn, session, prompt=text)


def resume_session_runtime(
    conn: sqlite3.Connection,
    session: sqlite3.Row,
    command_override: str | None = None,
    prompt: str | None = None,
    ready_timeout: float = 25.0,
) -> sqlite3.Row:
    if has_tmux_session(session["tmux_session"]):
        raise SystemExit(f"Agent '{session['name']}' already has a running tmux session.")

    command_text = command_override or session["command_text"]
    if not command_text and session["external_session_id"]:
        command_text = infer_resume_command(session["harness"], session["external_session_id"])
    command_parts = apply_model_to_command_parts(session["harness"], command_parts_from_text(command_text), model=command_override and None)
    command_text = " ".join(shlex.quote(part) for part in command_parts)
    session_env_args = build_session_awareness_env_args(
        build_session_awareness_env(
            session_id=session["id"],
            name=session["name"],
            project=session_project_name(session),
            workdir=session["workdir"],
            tmux_session=session["tmux_session"],
            metadata=session_metadata(session),
        )
    )

    tmux(
        "new-session",
        "-d",
        "-s",
        session["tmux_session"],
        "-c",
        session["workdir"],
        "env",
        *build_interactive_color_env_args(),
        *session_env_args,
        *command_parts,
    )
    conn.execute(
        """
        UPDATE sessions
        SET command_text = ?, state = ?, agent_state = ?, updated_at = ?, last_activity_at = ?
        WHERE id = ?
        """,
        (command_text, "starting", "active", utc_now(), utc_now(), session["id"]),
    )
    emit_event(conn, session["id"], "session.resumed", f"Resumed runtime with: {command_text}")

    if prompt:
        ready = wait_until_ready(
            session["tmux_session"],
            session["harness"],
            timeout=ready_timeout,
            fallback_delay=session["startup_delay"],
        )
        if not ready:
            raise SystemExit(f"Agent '{session['name']}' exited before it became ready for input.")
        send_keys(session["tmux_session"], prompt)
        emit_event(conn, session["id"], "session.input", f"Resume prompt sent: {prompt}")
        conn.execute(
            "UPDATE sessions SET state = ?, updated_at = ?, last_activity_at = ? WHERE id = ?",
            ("running", utc_now(), utc_now(), session["id"]),
        )

    refreshed = conn.execute("SELECT * FROM sessions WHERE id = ?", (session["id"],)).fetchone()
    return refresh_one(conn, refreshed)


def send_input_to_runtime(conn: sqlite3.Connection, session: sqlite3.Row, text: str, enter: bool = True) -> sqlite3.Row:
    if not has_tmux_session(session["tmux_session"]):
        raise SystemExit(f"Agent '{session['name']}' is not running.")
    send_keys(session["tmux_session"], text, enter=enter)
    conn.execute(
        "UPDATE sessions SET updated_at = ?, last_activity_at = ?, state = ? WHERE id = ?",
        (utc_now(), utc_now(), "running", session["id"]),
    )
    emit_event(conn, session["id"], "session.input", f"Sent input: {text}")
    refreshed = conn.execute("SELECT * FROM sessions WHERE id = ?", (session["id"],)).fetchone()
    return refresh_one(conn, refreshed)


def wait_for_turn_end(
    tmux_session: str,
    baseline_pane: str,
    timeout: float,
    stable_seconds: float,
    capture_lines: int = 500,
) -> tuple[bool, str]:
    """Poll a pane until it changes at least once after an injection and then
    stays unchanged for `stable_seconds`. Returns (finished, final_pane)."""
    poll_interval = max(0.05, min(0.5, stable_seconds / 2))
    deadline = time.monotonic() + timeout
    last_pane = baseline_pane
    last_change_at = time.monotonic()
    changed = False

    while time.monotonic() < deadline:
        time.sleep(poll_interval)
        pane = capture_pane(tmux_session, lines=capture_lines)
        if pane != last_pane:
            last_pane = pane
            last_change_at = time.monotonic()
            changed = True
        elif changed and time.monotonic() - last_change_at >= stable_seconds:
            return True, pane

    return False, last_pane


def extract_ask_answer(pane_text: str, prompt_text: str, fallback_lines: int) -> str:
    """Best-effort answer extraction: everything after the last pane line that
    echoes the prompt; falls back to the pane tail."""
    lines = pane_text.splitlines()
    first_prompt_line = prompt_text.strip().splitlines()[0].strip() if prompt_text.strip() else ""
    marker = first_prompt_line[:60]

    if marker:
        for index in range(len(lines) - 1, -1, -1):
            if marker in lines[index]:
                answer = "\n".join(lines[index + 1:]).strip()
                if answer:
                    return answer
                break

    return "\n".join(lines[-fallback_lines:]).strip()


def enforce_ask_permission(conn: sqlite3.Connection, target_session: sqlite3.Row, force: bool) -> None:
    caller_name = (os.environ.get("AGENTMUX_AGENT_NAME") or "").strip()
    if not caller_name:
        return

    if caller_name == target_session["name"]:
        raise SystemExit("An agent cannot ask itself: the injected prompt would deadlock its own turn.")

    if force:
        return

    caller_session = try_resolve_session(conn, caller_name)
    if caller_session is None:
        return

    caller_project = session_project_name(caller_session)
    target_project = session_project_name(target_session)
    if caller_project != target_project:
        raise SystemExit(f"'{target_session['name']}' belongs to project '{target_project}', not '{caller_project}'.")

    neighbor_names = {str(neighbor["name"]) for neighbor in compute_agent_neighbors(conn, caller_session)}
    if target_session["name"] not in neighbor_names:
        raise SystemExit(
            f"'{caller_name}' is not connected to '{target_session['name']}'. "
            f"Run: agentmux connect {shlex.quote(caller_name)} {shlex.quote(target_session['name'])} (or pass --force)."
        )


def stop_runtime(conn: sqlite3.Connection, session: sqlite3.Row) -> sqlite3.Row:
    if not has_tmux_session(session["tmux_session"]):
        raise SystemExit(f"Agent '{session['name']}' is not running.")
    tmux("send-keys", "-t", session["tmux_session"], "C-c")
    conn.execute(
        "UPDATE sessions SET updated_at = ?, state = ? WHERE id = ?",
        (utc_now(), "idle", session["id"]),
    )
    emit_event(conn, session["id"], "session.stop", "Sent Ctrl-C to runtime")
    refreshed = conn.execute("SELECT * FROM sessions WHERE id = ?", (session["id"],)).fetchone()
    return refresh_one(conn, refreshed)


def kill_runtime(conn: sqlite3.Connection, session: sqlite3.Row) -> sqlite3.Row:
    if has_tmux_session(session["tmux_session"]):
        tmux("kill-session", "-t", session["tmux_session"])
    conn.execute(
        "UPDATE sessions SET updated_at = ?, state = ? WHERE id = ?",
        (utc_now(), "stopped", session["id"]),
    )
    emit_event(conn, session["id"], "session.killed", "Killed tmux session")
    refreshed = conn.execute("SELECT * FROM sessions WHERE id = ?", (session["id"],)).fetchone()
    return refresh_one(conn, refreshed)


def update_manual_agent_state(conn: sqlite3.Connection, session: sqlite3.Row, new_state: str) -> sqlite3.Row:
    conn.execute(
        "UPDATE sessions SET agent_state = ?, updated_at = ? WHERE id = ?",
        (new_state, utc_now(), session["id"]),
    )
    emit_event(conn, session["id"], "agent.state", f"Agent state set to {new_state}")
    refreshed = conn.execute("SELECT * FROM sessions WHERE id = ?", (session["id"],)).fetchone()
    return refresh_one(conn, refreshed)


def delete_session_record(conn: sqlite3.Connection, session: sqlite3.Row, force: bool = False) -> dict[str, object]:
    running = has_tmux_session(session["tmux_session"])
    if running and not force:
        raise SystemExit(f"Agent '{session['name']}' is still running. Use kill first or pass force.")
    if running:
        tmux("kill-session", "-t", session["tmux_session"])
    conn.execute("DELETE FROM events WHERE session_id = ?", (session["id"],))
    conn.execute("DELETE FROM sessions WHERE id = ?", (session["id"],))
    delete_agent_edges(conn, session_project_name(session), session["name"])
    return {
        "id": session["id"],
        "name": session["name"],
        "project": session_project_name(session),
        "tmux_session": session["tmux_session"],
    }


def delete_project_sessions(conn: sqlite3.Connection, project_name: str, force: bool = False) -> dict[str, object]:
    normalized = normalize_project(project_name)
    sessions = sort_sessions_for_attention(filter_sessions_by_project(refresh_all(conn), normalized))
    if not sessions:
        raise SystemExit(f"No project found for '{normalized}'.")
    deleted = [delete_session_record(conn, session, force=force) for session in sessions]
    return {"project": normalized, "deleted_sessions": deleted}


def web_command(args: argparse.Namespace) -> None:
    import sys

    from agentmux_web import web_command as run_web_command
    from agentmux_web_ui import WEB_INDEX_HTML

    run_web_command(args, core=sys.modules[__name__], web_index_html=WEB_INDEX_HTML)


def choose_focus_session(sessions: list[sqlite3.Row], requested: str | None) -> sqlite3.Row | None:
    if not sessions:
        return None
    if requested:
        for session in sessions:
            if session["name"] == requested or session["id"] == requested or session["id"].startswith(requested):
                return session
        return None
    ordered = sort_sessions_for_attention(sessions)
    return ordered[0] if ordered else None


def render_watch_frame(
    sessions: list[sqlite3.Row],
    focus: sqlite3.Row | None,
    events: list[sqlite3.Row],
    interval: float,
    output_lines: int,
    requested_session: str | None,
) -> str:
    width = shutil.get_terminal_size((120, 40)).columns
    table_width = max(40, width)
    waiting_count = sum(1 for session in sessions if session["state"] == "waiting")
    running_count = sum(1 for session in sessions if session["state"] == "running")
    active_count = sum(1 for session in sessions if session["agent_state"] == "active")
    title = f"agentmux watch   refresh {interval:.1f}s   {len(sessions)} agents   {active_count} active   {waiting_count} waiting   {running_count} running"
    lines = [clip_text(title, table_width), ""]

    if sessions:
        lines.append(render_session_table(sessions, use_color=True))
    else:
        lines.append("No agents yet. Use `new` or `import` to create one.")

    lines.append("")
    if requested_session and focus is None:
        lines.append(f"Focus: agent '{requested_session}' not found")
        return "\n".join(lines)

    if focus is None:
        lines.append("Focus: <none>")
        return "\n".join(lines)

    focus_state = style_state(focus["state"], use_color=True)
    lines.append(f"Focus: {focus['name']} [{focus['agent_state']} / {focus_state}]")
    lines.append(f"tmux: {focus['tmux_session']}")
    lines.append(f"cwd:  {abbreviate_home(focus['workdir'])}")
    lines.append(f"run:  {focus['command_text']}")
    if focus["external_session_id"]:
        lines.append(f"sid:  {focus['external_session_id']}")
    lines.append("")
    lines.append(f"Recent output ({output_lines} lines):")
    output = focus["last_output"] or "<none>"
    output_tail = "\n".join(output.splitlines()[-output_lines:]) if output != "<none>" else output
    lines.append(indent_block(output_tail, "  "))
    lines.append("")
    lines.append("Recent events:")
    if events:
        for event in events:
            message = clip_text(event["message"], max(20, table_width - 34))
            lines.append(f"  {event['created_at']} [{event['event_type']}] {message}")
    else:
        lines.append("  <none>")
    return "\n".join(lines)


def infer_harness_from_command(command: str) -> str:
    normalized = command.strip().lower()
    if normalized == "opencode":
        return "opencode"
    if normalized == "claude":
        return "claude"
    if normalized == "pi" or normalized == "node":
        return "pi"
    if normalized == "codex":
        return "codex"
    if normalized in {"zsh", "bash", "sh", "fish"}:
        return "shell"
    return "custom"


def discover_command(_: argparse.Namespace) -> None:
    panes = list_tmux_panes()
    session_info = list_tmux_sessions()
    with db() as conn:
        tracked = {
            row["tmux_session"]: row["name"]
            for row in conn.execute("SELECT tmux_session, name FROM sessions ORDER BY created_at ASC").fetchall()
        }

    untracked = [pane for pane in panes if pane.session_name not in tracked]
    untracked.sort(key=lambda pane: session_info.get(pane.session_name).created_ts if session_info.get(pane.session_name) else 0, reverse=True)
    if not untracked:
        print("No untracked tmux sessions found.")
        return

    print(f"{'TMUX SESSION':36} {'CREATED':24} {'PANES':5} {'CMD':10} {'HARNESS':10} PATH")
    print("-" * 132)
    for pane in untracked:
        harness = infer_harness_from_command(pane.command)
        info = session_info.get(pane.session_name)
        session_name = clip_text(pane.session_name, 36)
        created_at = clip_text(info.created_at if info else "<unknown>", 24)
        panes_text = str(info.pane_count) if info else "?"
        command = clip_text(pane.command or "<unknown>", 10)
        path = abbreviate_home(pane.path)
        print(f"{session_name:36} {created_at:24} {panes_text:5} {command:10} {harness:10} {path}")

    print()
    print("Import example:")
    print("  ./agentmux import --agent my-agent --tmux-session <session-name> --harness <harness>")


def render_console_header(session: sqlite3.Row | None) -> str:
    if session is None:
        return "No agents yet"
    runtime = session["state"]
    return (
        f"{session['name']}  project={session_project_name(session)}  harness={session['harness']}  agent={session['agent_state']}  "
        f"runtime={runtime}"
    )


def prompt_for_text(screen: curses.window, prompt: str) -> str | None:
    height, width = screen.getmaxyx()
    input_width = max(20, min(width - 4, width - 2))
    input_y = max(0, height - 2)
    screen.move(input_y, 0)
    screen.clrtoeol()
    screen.addnstr(input_y, 0, prompt, width - 1)
    curses.echo()
    curses.curs_set(1)
    try:
        raw = screen.getstr(input_y, min(len(prompt), width - 1), max(1, input_width - len(prompt) - 1))
    except KeyboardInterrupt:
        raw = b""
    finally:
        curses.noecho()
        curses.curs_set(0)
    text = raw.decode("utf-8", errors="ignore").strip()
    return text or None


def move_selection(sessions: list[sqlite3.Row], current_id: str | None, delta: int) -> str | None:
    if not sessions:
        return None
    ids = [session["id"] for session in sessions]
    if current_id not in ids:
        return ids[0]
    index = ids.index(current_id)
    return ids[(index + delta) % len(ids)]


def console_command(args: argparse.Namespace) -> None:
    def run(screen: curses.window) -> None:
        curses.curs_set(0)
        screen.nodelay(False)
        screen.keypad(True)

        selected_id = args.session
        status_message = "j/k or arrows move, p prompt, r refresh, s stop, x kill, q quit"

        while True:
            with db() as conn:
                sessions = refresh_all(conn)
                sessions = filter_sessions_by_project(sessions, args.project)
                ordered = sort_sessions_for_attention(sessions)
                if selected_id is None or not any(session["id"] == selected_id or session["name"] == selected_id for session in ordered):
                    focus = choose_focus_session(ordered, selected_id)
                    selected_id = focus["id"] if focus else None
                else:
                    matched = choose_focus_session(ordered, selected_id)
                    selected_id = matched["id"] if matched else selected_id

                focus = choose_focus_session(ordered, selected_id)
                focus_events = fetch_recent_events(conn, focus["id"], limit=args.event_lines) if focus else []

            height, width = screen.getmaxyx()
            list_width = min(max(36, width // 3), max(36, width - 40)) if width > 80 else width
            detail_x = min(width - 1, list_width + 1)
            detail_width = max(20, width - detail_x - 1)
            output_height = max(6, height - 10)

            screen.erase()
            screen.addnstr(0, 0, "agentmux console", width - 1, curses.A_BOLD)
            screen.addnstr(1, 0, status_message, width - 1)

            list_title = f"Agents ({len(ordered)})"
            if args.project:
                list_title += f"  project={normalize_project(args.project)}"
            screen.addnstr(3, 0, list_title, list_width - 1, curses.A_BOLD)
            for index, session in enumerate(ordered[: max(1, height - 6)]):
                marker = ">" if focus and session["id"] == focus["id"] else " "
                line = f"{marker} {session_project_name(session)} / {session['name']} [{session['agent_state']}/{session['state']}]"
                attr = curses.A_REVERSE if focus and session["id"] == focus["id"] else curses.A_NORMAL
                screen.addnstr(4 + index, 0, clip_text(line, list_width - 1), list_width - 1, attr)

            if focus:
                screen.addnstr(3, detail_x, clip_text(render_console_header(focus), detail_width), detail_width, curses.A_BOLD)
                screen.addnstr(4, detail_x, clip_text(f"cwd: {abbreviate_home(focus['workdir'])}", detail_width), detail_width)
                screen.addnstr(5, detail_x, clip_text(f"run: {focus['command_text']}", detail_width), detail_width)
                output = focus["last_output"] or "<no output>"
                wrapped_output = wrap_lines(output, detail_width)
                screen.addnstr(7, detail_x, "Recent output", detail_width, curses.A_BOLD)
                for index, line in enumerate(wrapped_output[-output_height:]):
                    row = 8 + index
                    if row >= height - args.event_lines - 3:
                        break
                    screen.addnstr(row, detail_x, line, detail_width)

                events_y = max(8, height - args.event_lines - 2)
                screen.addnstr(events_y, detail_x, "Recent events", detail_width, curses.A_BOLD)
                for index, event in enumerate(focus_events[: max(1, height - events_y - 2)]):
                    row = events_y + 1 + index
                    if row >= height - 1:
                        break
                    event_line = f"{event['created_at'][11:19]} {event['event_type']} {event['message']}"
                    screen.addnstr(row, detail_x, clip_text(event_line, detail_width), detail_width)
            else:
                screen.addnstr(3, detail_x, "No focused agent", detail_width, curses.A_BOLD)

            screen.refresh()
            key = screen.getch()

            if key in (ord("q"), 27):
                break
            if key in (ord("j"), curses.KEY_DOWN):
                selected_id = move_selection(ordered, selected_id, 1)
                status_message = "moved selection"
                continue
            if key in (ord("k"), curses.KEY_UP):
                selected_id = move_selection(ordered, selected_id, -1)
                status_message = "moved selection"
                continue
            if key == ord("r"):
                status_message = "refreshed"
                continue
            if focus is None:
                status_message = "no agent selected"
                continue

            if key == ord("p"):
                text = prompt_for_text(screen, "Prompt: ")
                if text:
                    with db() as conn:
                        current = resolve_session(conn, focus["id"])
                        if not has_tmux_session(current["tmux_session"]):
                            status_message = f"{current['name']} is not running"
                        else:
                            send_keys(current["tmux_session"], text)
                            conn.execute(
                                "UPDATE sessions SET updated_at = ?, last_activity_at = ?, state = ? WHERE id = ?",
                                (utc_now(), utc_now(), "running", current["id"]),
                            )
                            emit_event(conn, current["id"], "session.input", f"Sent input: {text}")
                            status_message = f"sent prompt to {current['name']}"
                else:
                    status_message = "prompt cancelled"
                continue

            if key == ord("s"):
                with db() as conn:
                    current = resolve_session(conn, focus["id"])
                    if has_tmux_session(current["tmux_session"]):
                        tmux("send-keys", "-t", current["tmux_session"], "C-c")
                        conn.execute(
                            "UPDATE sessions SET updated_at = ?, state = ? WHERE id = ?",
                            (utc_now(), "idle", current["id"]),
                        )
                        emit_event(conn, current["id"], "session.stop", "Sent Ctrl-C to runtime")
                        status_message = f"stopped {current['name']}"
                    else:
                        status_message = f"{current['name']} is not running"
                continue

            if key == ord("x"):
                with db() as conn:
                    current = resolve_session(conn, focus["id"])
                    if has_tmux_session(current["tmux_session"]):
                        tmux("kill-session", "-t", current["tmux_session"])
                    conn.execute(
                        "UPDATE sessions SET updated_at = ?, state = ? WHERE id = ?",
                        (utc_now(), "stopped", current["id"]),
                    )
                    emit_event(conn, current["id"], "session.killed", "Killed tmux session")
                    status_message = f"killed {current['name']}"
                continue

            status_message = "j/k move, p prompt, r refresh, s stop, x kill, q quit"

    curses.wrapper(run)


def list_sessions(args: argparse.Namespace) -> None:
    with db() as conn:
        sessions = refresh_project(conn, args.project) if args.project else refresh_all(conn)
        if args.json:
            if args.project:
                edges = list_project_edges(conn, normalize_project(args.project))
                print(json.dumps(project_payload_from_sessions(args.project, sessions, edges=edges), sort_keys=True))
            else:
                print(json.dumps({"sessions": [session_summary(session) for session in sessions]}, sort_keys=True))
            return

    print(render_session_table(sessions))


def show_session(args: argparse.Namespace) -> None:
    with db() as conn:
        session = resolve_session(conn, args.session)
        session = refresh_one(conn, session)
        events = fetch_recent_events(conn, session["id"], limit=8)
        detail = session_summary(session)
    project_name = session_project_name(session)
    workdir = session["workdir"]

    print(f"name:          {session['name']}")
    print(f"id:            {session['id']}")
    print(f"harness:       {session['harness']}")
    print(f"project:       {project_name}")
    print(f"role:          {detail['role']}")
    print(f"parent:        {detail['parent_agent'] or '<none>'}")
    print(f"depth:         {detail['depth']}")
    if session["harness"] == "opencode":
        print(f"default model: {default_model_for_harness(session['harness']) or '<none>'}")
    print(f"agent state:   {session['agent_state']}")
    print(f"runtime state: {session['state']}")
    print(f"tmux session:  {session['tmux_session']}")
    print(f"cwd:           {abbreviate_home(session['workdir'])}")
    print(f"command:       {session['command_text']}")
    print(f"external sid:  {session['external_session_id'] or '<none>'}")
    print(f"created:       {session['created_at']}")
    print(f"updated:       {session['updated_at']}")
    print(f"last activity: {session['last_activity_at']}")
    print()
    print("session awareness:")
    print("  env:            env | grep '^AGENTMUX_'")
    print(f"  inspect self:   {agentmux_command_hint()} show \"$AGENTMUX_AGENT_NAME\"")
    print(f"  child worker:   {project_worker_command_hint(project_name, workdir)}")
    print(f"  explicit child: {project_worker_command_hint(project_name, workdir, parent_agent=session['name'])}")
    print("  note:           from a managed terminal, worker without --parent attaches under $AGENTMUX_AGENT_NAME.")
    print("  safety:         use agentmux worker/send/logs; do not create raw tmux worker sessions.")
    print()
    print("last output:")
    print(indent_block(session["last_output"] or "<none>", "  "))
    print()
    print("recent events:")
    for event in events:
        print(f"  - {event['created_at']} [{event['event_type']}] {event['message']}")


def send_to_session(args: argparse.Namespace) -> None:
    with db() as conn:
        session = resolve_session(conn, args.agent)
        refreshed = send_input_to_runtime(conn, session, args.text, enter=not args.no_enter)

    print(f"Sent to {refreshed['name']} ({short_id(refreshed['id'])})")


def ask_session(args: argparse.Namespace) -> None:
    with db() as conn:
        session = resolve_session(conn, args.agent)
        enforce_ask_permission(conn, session, args.force)
        if not has_tmux_session(session["tmux_session"]):
            raise SystemExit(f"Agent '{session['name']}' is not running.")
        baseline_pane = capture_pane(session["tmux_session"], lines=500)
        send_input_to_runtime(conn, session, args.text)

    finished, final_pane = wait_for_turn_end(
        session["tmux_session"],
        baseline_pane,
        timeout=args.timeout,
        stable_seconds=args.stable,
    )
    answer = extract_ask_answer(final_pane, args.text, fallback_lines=args.lines)

    if not finished:
        if answer:
            print(answer)
        raise SystemExit(
            f"Timed out after {args.timeout:.0f}s waiting for '{session['name']}' to finish. "
            f"Peek later with: agentmux check {shlex.quote(session['name'])}"
        )

    print(answer or "<no output>")


def check_session(args: argparse.Namespace) -> None:
    with db() as conn:
        session = resolve_session(conn, args.agent)
    if not has_tmux_session(session["tmux_session"]):
        raise SystemExit(f"Agent '{session['name']}' is not running.")
    pane = capture_pane(session["tmux_session"], lines=args.lines)
    print(pane or "<no output>")


def stop_session(args: argparse.Namespace) -> None:
    with db() as conn:
        session = resolve_session(conn, args.agent)
        stop_runtime(conn, session)
    print(f"Sent Ctrl-C to {session['name']}")


def kill_session(args: argparse.Namespace) -> None:
    with db() as conn:
        session = resolve_session(conn, args.agent)
        kill_runtime(conn, session)
    print(f"Killed {session['name']}")


def attach_session(args: argparse.Namespace) -> None:
    with db() as conn:
        session = resolve_session(conn, args.agent)
    if not has_tmux_session(session["tmux_session"]):
        raise SystemExit(f"Agent '{session['name']}' is not running.")
    os.execvp("tmux", ["tmux", "-u", "attach", "-t", session["tmux_session"]])


def logs_session(args: argparse.Namespace) -> None:
    with db() as conn:
        session = resolve_session(conn, args.agent)
        session = refresh_one(conn, session)
    lines = capture_pane(session["tmux_session"], lines=args.lines) if has_tmux_session(session["tmux_session"]) else session["last_output"]
    print(lines or "<no output>")


def set_agent_state(args: argparse.Namespace) -> None:
    with db() as conn:
        session = resolve_session(conn, args.agent)
        update_manual_agent_state(conn, session, args.state)
    print(f"Set {session['name']} to {args.state}")


def delete_agent(args: argparse.Namespace) -> None:
    with db() as conn:
        session = resolve_session(conn, args.agent)
        delete_session_record(conn, session, force=args.force)
    print(f"Deleted {session['name']}")


def project_tree_command(args: argparse.Namespace) -> None:
    with db() as conn:
        payload = project_tree_payload(conn, project_from_arg_or_env(args.project))

    if args.json:
        print(json.dumps(payload, sort_keys=True))
        return

    print(render_project_tree(payload))


def project_status_command(args: argparse.Namespace) -> None:
    with db() as conn:
        payload = project_tree_payload(conn, project_from_arg_or_env(args.project))

    if args.json:
        print(json.dumps(payload, sort_keys=True))
        return

    print(render_project_status(payload))


def project_worker_command(args: argparse.Namespace) -> None:
    with db() as conn:
        worker = create_project_worker(
            conn,
            project_from_arg_or_env(args.project),
            args.agent,
            args.workdir or os.getcwd(),
            prompt=args.prompt,
            model=args.model,
            harness_id=args.harness,
            parent_agent=args.parent,
            briefing=not args.no_briefing,
        )

    print(f"Created worker {worker['name']} ({short_id(worker['id'])})")
    print(f"tmux: {worker['tmux_session']}")
    print(f"cwd:  {worker['workdir']}")


def child_worker_command(args: argparse.Namespace) -> None:
    with db() as conn:
        parent = resolve_session(conn, args.parent)
        project = session_project_name(parent)
        worker = create_project_worker(
            conn,
            project,
            args.agent,
            args.workdir or parent["workdir"],
            prompt=args.prompt,
            model=args.model,
            harness_id=args.harness,
            parent_agent=parent["name"],
            briefing=not args.no_briefing,
        )
        worker_summary = session_summary(worker)

    print(f"Created child worker {worker['name']} ({short_id(worker['id'])})")
    print(f"parent: {parent['name']}")
    print(f"project: {project}")
    print(f"depth: {worker_summary['depth']}")
    print(f"tmux: {worker['tmux_session']}")
    print(f"cwd:  {worker['workdir']}")
    print("next:")
    print(f"  {agentmux_command_hint()} tree {shlex.quote(project)}")
    print(f"  {agentmux_command_hint()} logs {shlex.quote(worker['name'])} --lines 120")


def build_connection_briefing(peer_summary: dict[str, object]) -> str:
    peer_name = str(peer_summary["name"])
    quoted = shlex.quote(peer_name)
    return (
        f"[TermCanvas] You are now connected to agent '{peer_name}' "
        f"(role: {peer_summary['role']}, state: {peer_summary['runtime_state']}, "
        f"workdir: {abbreviate_home(str(peer_summary['workdir']))}). "
        f"Delegate and wait for its answer: agentmux ask {quoted} \"<task>\". "
        f"Peek without interrupting: agentmux check {quoted}. "
        f"List all your connections: agentmux neighbors"
    )


def connect_command(args: argparse.Namespace) -> None:
    announced: list[str] = []

    with db() as conn:
        session_a = resolve_session(conn, args.agent_a)
        session_b = resolve_session(conn, args.agent_b)
        project_a = session_project_name(session_a)
        project_b = session_project_name(session_b)
        if project_a != project_b:
            raise SystemExit(f"Agents belong to different projects ('{project_a}' vs '{project_b}').")
        edge = create_edge(conn, project_a, session_a["name"], session_b["name"], kind="link")

        if args.announce:
            for session, peer in ((session_a, session_b), (session_b, session_a)):
                if has_tmux_session(session["tmux_session"]):
                    send_input_to_runtime(conn, session, build_connection_briefing(session_summary(peer)))
                    announced.append(session["name"])

    print(f"Connected {edge['from']} <-> {edge['to']} ({edge['kind']})")
    print(f"project: {project_a}")
    if args.announce:
        print(f"announced: {', '.join(announced) if announced else '<none running>'}")


def disconnect_command(args: argparse.Namespace) -> None:
    with db() as conn:
        session_a = resolve_session(conn, args.agent_a)
        session_b = resolve_session(conn, args.agent_b)
        project = session_project_name(session_a)
        removed = delete_edge(conn, project, session_a["name"], session_b["name"])

    if not removed:
        raise SystemExit(f"No connection between '{session_a['name']}' and '{session_b['name']}'.")
    print(f"Disconnected {session_a['name']} <-> {session_b['name']}")


def neighbors_command(args: argparse.Namespace) -> None:
    identifier = (args.agent or os.environ.get("AGENTMUX_AGENT_NAME") or "").strip()
    if not identifier:
        raise SystemExit("Agent name is required (or run inside a managed terminal).")

    with db() as conn:
        session = resolve_session(conn, identifier)
        neighbors = compute_agent_neighbors(conn, session)

    if args.json:
        print(json.dumps(
            {
                "agent": session["name"],
                "project": session_project_name(session),
                "neighbors": neighbors,
            },
            sort_keys=True,
        ))
        return

    if not neighbors:
        print(f"{session['name']} has no connections.")
        return

    print(f"Connections for {session['name']}:")
    for neighbor in neighbors:
        print(f"  - {neighbor['name']} ({neighbor['kind']})")


def adapters_command(_: argparse.Namespace) -> None:
    print(f"{'HARNESS':10} {'AVAILABLE':10} DESCRIPTION")
    print("-" * 60)
    for harness in HARNESSES.values():
        command = harness.command
        available = command_exists(command) if command else True
        print(f"{harness.id:10} {str(available):10} {harness.description}")


def install_command(args: argparse.Namespace) -> None:
    target_dir = Path(args.bin_dir or os.environ.get("AGENTMUX_INSTALL_DIR") or Path.home() / ".local" / "bin").expanduser()
    target = target_dir / "agentmux"
    source = Path(__file__).resolve()

    target_dir.mkdir(parents=True, exist_ok=True)
    if target.exists() or target.is_symlink():
        if not args.force:
            raise SystemExit(f"{target} already exists. Re-run with --force to replace it.")
        target.unlink()

    target.write_text(
        "#!/usr/bin/env bash\n"
        "set -euo pipefail\n"
        f"exec python3 {shlex.quote(str(source))} \"$@\"\n",
        encoding="utf-8",
    )
    target.chmod(0o755)
    print(f"Installed agentmux wrapper for {source}")
    print(f"Binary: {target}")
    if str(target_dir) not in os.environ.get("PATH", "").split(os.pathsep):
        print(f"Add this to your shell profile if needed: export PATH=\"{target_dir}:$PATH\"")


def install_skill_command(args: argparse.Namespace) -> None:
    target_dir = Path(args.target_dir or Path.home() / ".agents" / "skills" / "agentmux").expanduser()
    target = target_dir / "SKILL.md"
    source = skill_source_path()

    target_dir.mkdir(parents=True, exist_ok=True)
    if target.exists() and not args.force:
        raise SystemExit(f"{target} already exists. Re-run with --force to replace it.")

    shutil.copyfile(source, target)
    print(f"Installed agentmux skill from {source}")
    print(f"Skill: {target}")
    print("Restart OpenCode to load the updated global skill.")


def events_command(args: argparse.Namespace) -> None:
    with db() as conn:
        if args.session:
            session = resolve_session(conn, args.session)
            rows = conn.execute(
                "SELECT created_at, event_type, message FROM events WHERE session_id = ? ORDER BY id DESC LIMIT ?",
                (session["id"], args.limit),
            ).fetchall()
        else:
            if args.project:
                project_sessions = filter_sessions_by_project(refresh_all(conn), args.project)
                session_ids = [session["id"] for session in project_sessions]
                if not session_ids:
                    rows = []
                else:
                    placeholders = ", ".join("?" for _ in session_ids)
                    rows = conn.execute(
                        f"SELECT created_at, event_type, message FROM events WHERE session_id IN ({placeholders}) ORDER BY id DESC LIMIT ?",
                        (*session_ids, args.limit),
                    ).fetchall()
            else:
                rows = conn.execute(
                    "SELECT created_at, event_type, message FROM events ORDER BY id DESC LIMIT ?",
                    (args.limit,),
                ).fetchall()
    for row in rows:
        print(f"{row['created_at']} [{row['event_type']}] {row['message']}")


def watch_command(args: argparse.Namespace) -> None:
    hide_cursor = not args.once and sys.stdout.isatty()
    if hide_cursor:
        sys.stdout.write("\033[?25l")
        sys.stdout.flush()
    try:
        while True:
            with db() as conn:
                sessions = refresh_all(conn)
                sessions = filter_sessions_by_project(sessions, args.project)
                focus = choose_focus_session(sessions, args.session)
                focus_events = fetch_recent_events(conn, focus["id"], limit=args.event_lines) if focus else []
            frame = render_watch_frame(
                sessions=sessions,
                focus=focus,
                events=focus_events,
                interval=args.interval,
                output_lines=args.lines,
                requested_session=args.session,
            )
            if sys.stdout.isatty():
                sys.stdout.write("\033[2J\033[H")
            sys.stdout.write(frame)
            sys.stdout.write("\n")
            sys.stdout.flush()
            if args.once:
                break
            time.sleep(args.interval)
    except KeyboardInterrupt:
        pass
    finally:
        if hide_cursor:
            sys.stdout.write("\033[?25h")
            sys.stdout.flush()


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="agentmux", description="Local control plane for terminal AI agents.")
    sub = parser.add_subparsers(dest="command", required=True)

    new = sub.add_parser("new", help="Create a new managed agent")
    new.add_argument("--harness", choices=sorted(HARNESSES.keys()), default="shell")
    new.add_argument("--agent")
    new.add_argument("--name")
    new.add_argument("--workdir")
    new.add_argument("--project", help="Project tag for grouping related agents")
    new.add_argument("--model", help="Model override for harnesses that support it")
    new.add_argument("--prompt")
    new.add_argument("--cmd", help="Command for custom harness")
    new.add_argument("--arg", action="append", default=[], help="Extra argument for the custom command")
    new.add_argument("--session", help="Resume an existing harness-native session (e.g. opencode ses_xxx)")
    new.add_argument("--startup-delay", type=float, default=1.0)
    new.add_argument("--ready-timeout", type=float, default=25.0)
    new.add_argument("--no-briefing", action="store_true", help="Skip the spawn briefing injected into AI harnesses")
    new.set_defaults(func=create_session)

    imp = sub.add_parser("import", help="Adopt an existing tmux-backed agent runtime")
    imp.add_argument("--agent", required=True)
    imp.add_argument("--tmux-session", required=True)
    imp.add_argument("--harness", choices=sorted(HARNESSES.keys()), required=True)
    imp.add_argument("--session-id", help="Harness-native session id, for example opencode ses_...")
    imp.add_argument("--cmd", help="Stored resume command if pane command is not enough")
    imp.add_argument("--workdir")
    imp.add_argument("--project", help="Project tag for grouping related agents")
    imp.add_argument("--model", help="Model override for harnesses that support it")
    imp.add_argument("--startup-delay", type=float, default=1.0)
    imp.set_defaults(func=import_session)

    resume = sub.add_parser("resume", help="Start or restart an agent runtime")
    resume.add_argument("session")
    resume.add_argument("--cmd", help="Override the stored command for this resume")
    resume.add_argument("--prompt")
    resume.add_argument("--ready-timeout", type=float, default=25.0)
    resume.set_defaults(func=resume_session)

    ls = sub.add_parser("ls", help="List agents")
    ls.add_argument("--project", help="Only show agents for one project")
    ls.add_argument("--json", action="store_true")
    ls.set_defaults(func=list_sessions)

    show = sub.add_parser("show", help="Show one agent")
    show.add_argument("session")
    show.set_defaults(func=show_session)

    send = sub.add_parser("send", help="Send input to an agent runtime")
    send.add_argument("agent")
    send.add_argument("text")
    send.add_argument("--no-enter", action="store_true")
    send.set_defaults(func=send_to_session)

    ask = sub.add_parser("ask", help="Send a prompt to an agent and block until its turn ends, printing the answer")
    ask.add_argument("agent")
    ask.add_argument("text")
    ask.add_argument("--timeout", type=float, default=300.0, help="Seconds to wait for the turn to end (default: 300)")
    ask.add_argument("--stable", type=float, default=2.0, help="Seconds of unchanged output that count as turn end (default: 2)")
    ask.add_argument("--lines", type=int, default=120, help="Fallback answer lines when the prompt echo is not found (default: 120)")
    ask.add_argument("--force", action="store_true", help="Skip the graph connection requirement")
    ask.set_defaults(func=ask_session)

    check = sub.add_parser("check", help="Peek at an agent's current terminal output without sending anything")
    check.add_argument("agent")
    check.add_argument("--lines", type=int, default=120)
    check.set_defaults(func=check_session)

    attach = sub.add_parser("attach", help="Attach to the agent tmux session")
    attach.add_argument("agent")
    attach.set_defaults(func=attach_session)

    stop = sub.add_parser("stop", help="Send Ctrl-C to the agent runtime")
    stop.add_argument("agent")
    stop.set_defaults(func=stop_session)

    kill = sub.add_parser("kill", help="Kill the agent tmux session")
    kill.add_argument("agent")
    kill.set_defaults(func=kill_session)

    logs = sub.add_parser("logs", help="Show recent agent output")
    logs.add_argument("agent")
    logs.add_argument("--lines", type=int, default=80)
    logs.set_defaults(func=logs_session)

    discover = sub.add_parser("discover", help="List untracked tmux sessions that can be imported")
    discover.set_defaults(func=discover_command)

    state = sub.add_parser("state", help="Set the manual state for an agent")
    state.add_argument("agent")
    state.add_argument("state", choices=AGENT_STATES)
    state.set_defaults(func=set_agent_state)

    delete = sub.add_parser("delete", help="Delete an agent record")
    delete.add_argument("agent")
    delete.add_argument("--force", action="store_true", help="Kill the runtime first if it is still running")
    delete.set_defaults(func=delete_agent)

    tree = sub.add_parser("tree", help="Show the project agent graph with command hints")
    tree.add_argument("project", nargs="?", help="Project tag, defaults to AGENTMUX_PROJECT in managed terminals")
    tree.add_argument("--json", action="store_true")
    tree.set_defaults(func=project_tree_command)

    status = sub.add_parser("status", help="Show project status and attention queue")
    status.add_argument("project", nargs="?", help="Project tag, defaults to AGENTMUX_PROJECT in managed terminals")
    status.add_argument("--json", action="store_true")
    status.set_defaults(func=project_status_command)

    worker = sub.add_parser("worker", help="Create a managed project worker")
    worker.add_argument("project", nargs="?", help="Project tag, defaults to AGENTMUX_PROJECT in managed terminals")
    worker.add_argument("agent")
    worker.add_argument("--workdir")
    worker.add_argument("--parent", help="Existing agent to use as this worker's parent")
    worker.add_argument("--prompt")
    worker.add_argument("--model")
    worker.add_argument("--harness", choices=sorted(HARNESSES.keys()), default="shell", help="Harness for the worker session (default: shell)")
    worker.add_argument("--no-briefing", action="store_true", help="Skip the spawn briefing injected into AI harnesses")
    worker.set_defaults(func=project_worker_command)

    child = sub.add_parser("child", help="Create a child worker under an existing agent")
    child.add_argument("parent")
    child.add_argument("agent")
    child.add_argument("--workdir", help="Workspace root for the child, defaults to the parent's workdir")
    child.add_argument("--prompt")
    child.add_argument("--model")
    child.add_argument("--harness", choices=sorted(HARNESSES.keys()), default="shell", help="Harness for the child session (default: shell)")
    child.add_argument("--no-briefing", action="store_true", help="Skip the spawn briefing injected into AI harnesses")
    child.set_defaults(func=child_worker_command)

    connect = sub.add_parser("connect", help="Create a graph connection between two agents")
    connect.add_argument("agent_a")
    connect.add_argument("agent_b")
    connect.add_argument("--announce", action="store_true", help="Inject a briefing about the new peer into both terminals")
    connect.set_defaults(func=connect_command)

    disconnect = sub.add_parser("disconnect", help="Remove a graph connection between two agents")
    disconnect.add_argument("agent_a")
    disconnect.add_argument("agent_b")
    disconnect.set_defaults(func=disconnect_command)

    neighbors = sub.add_parser("neighbors", help="List agents connected to one agent")
    neighbors.add_argument("agent", nargs="?", help="Agent name, defaults to AGENTMUX_AGENT_NAME in managed terminals")
    neighbors.add_argument("--json", action="store_true")
    neighbors.set_defaults(func=neighbors_command)

    adapters = sub.add_parser("adapters", help="List harness availability")
    adapters.set_defaults(func=adapters_command)

    install = sub.add_parser("install", help="Install agentmux as a global user-local CLI")
    install.add_argument("--bin-dir", help="Directory to install the agentmux launcher into")
    install.add_argument("--force", action="store_true", help="Replace an existing agentmux command at the target path")
    install.set_defaults(func=install_command)

    install_skill = sub.add_parser("install-skill", help="Install the bundled global agentmux skill")
    install_skill.add_argument("--target-dir", help="Directory to install the skill into")
    install_skill.add_argument("--force", action="store_true", help="Replace an existing skill file at the target path")
    install_skill.set_defaults(func=install_skill_command)

    events = sub.add_parser("events", help="Show recent events")
    events.add_argument("--session")
    events.add_argument("--project", help="Only show events for one project")
    events.add_argument("--limit", type=int, default=20)
    events.set_defaults(func=events_command)

    watch = sub.add_parser("watch", help="Live terminal dashboard")
    watch.add_argument("--session", help="Pin the focus panel to one session")
    watch.add_argument("--project", help="Only watch agents for one project")
    watch.add_argument("--interval", type=float, default=1.0)
    watch.add_argument("--lines", type=int, default=14, help="Recent output lines for the focus panel")
    watch.add_argument("--event-lines", type=int, default=6, help="Recent event rows for the focus panel")
    watch.add_argument("--once", action="store_true", help="Render one frame and exit")
    watch.set_defaults(func=watch_command)

    web = sub.add_parser("web", help="Local web dashboard")
    web.add_argument("--host", default="127.0.0.1")
    web.add_argument("--port", type=int, default=8421)
    web.add_argument("--open", action="store_true", help="Open the dashboard in your browser")
    web.set_defaults(func=web_command)

    console = sub.add_parser("console", help="Interactive terminal control room")
    console.add_argument("--session", help="Start focused on one agent")
    console.add_argument("--project", help="Only show agents for one project")
    console.add_argument("--event-lines", type=int, default=6, help="Recent event rows for the focused agent")
    console.set_defaults(func=console_command)
    return parser


def main(argv: Iterable[str] | None = None) -> int:
    ensure_app()
    if not command_exists("tmux"):
        print("tmux is required for this MVP.", file=sys.stderr)
        return 1
    parser = build_parser()
    args = parser.parse_args(list(argv) if argv is not None else None)
    args.func(args)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
