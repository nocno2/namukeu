import sqlite3
import threading
from datetime import datetime, timedelta
from pathlib import Path
from secrets import token_hex


class Database:
    def __init__(self, db_path: str):
        Path(db_path).parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        self.conn = sqlite3.connect(db_path, check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        self.conn.execute("PRAGMA journal_mode=WAL")
        self.conn.execute("PRAGMA busy_timeout=5000")
        self._create_tables()

    def _create_tables(self):
        self.conn.executescript("""
            CREATE TABLE IF NOT EXISTS sessions (
                token TEXT PRIMARY KEY,
                username TEXT NOT NULL,
                created_at TEXT NOT NULL,
                expires_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS tasks (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT,
                task_type TEXT NOT NULL,
                handler TEXT NOT NULL,
                config TEXT,
                cron_expr TEXT,
                enabled INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS execution_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                task_id TEXT NOT NULL REFERENCES tasks(id),
                status TEXT NOT NULL,
                started_at TEXT NOT NULL,
                finished_at TEXT,
                duration_ms INTEGER,
                result TEXT,
                error TEXT,
                log TEXT
            );

            CREATE INDEX IF NOT EXISTS idx_history_task_time
                ON execution_history(task_id, started_at);

            CREATE TABLE IF NOT EXISTS agent_goals (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                description TEXT NOT NULL,
                projects TEXT NOT NULL,
                status TEXT DEFAULT 'active' CHECK(status IN ('active','completed','paused','proposed')),
                priority TEXT DEFAULT 'medium' CHECK(priority IN ('high','medium','low')),
                deadline TEXT,
                progress TEXT,
                source TEXT DEFAULT 'user',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS evolution_state (
                project TEXT PRIMARY KEY,
                last_cycle_at TEXT,
                last_cycle_result TEXT,
                cycle_count INTEGER DEFAULT 0,
                rejected_proposals TEXT DEFAULT '[]',
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS agent_config (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS agent_tasks (
                id TEXT PRIMARY KEY,
                type TEXT NOT NULL CHECK(type IN ('one-time','recurring','event')),
                status TEXT NOT NULL DEFAULT 'pending'
                    CHECK(status IN ('pending','running','completed','failed','paused')),
                title TEXT NOT NULL,
                prompt TEXT NOT NULL,
                project TEXT NOT NULL DEFAULT 'GENERAL',
                schedule_cron TEXT,
                schedule_next TEXT,
                event_trigger TEXT,
                last_run_at TEXT,
                last_result TEXT,
                run_count INTEGER DEFAULT 0,
                max_runs INTEGER,
                notify_user INTEGER DEFAULT 1,
                requires_approval INTEGER DEFAULT 0,
                chain_depth INTEGER DEFAULT 0,
                chain_parent_id TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_agent_tasks_next
                ON agent_tasks(schedule_next) WHERE status IN ('pending','running');

            CREATE TABLE IF NOT EXISTS agent_audit (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ts TEXT NOT NULL,
                type TEXT NOT NULL,
                task TEXT,
                chat_id TEXT,
                violations TEXT,
                cost REAL,
                tokens INTEGER,
                duration INTEGER,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE INDEX IF NOT EXISTS idx_agent_audit_ts ON agent_audit(ts);

            CREATE TABLE IF NOT EXISTS pipeline_runs (
                id TEXT PRIMARY KEY,
                status TEXT NOT NULL,
                keywords TEXT,
                selected_keyword TEXT,
                blog_draft_id INTEGER,
                seo_score INTEGER,
                readability_score INTEGER,
                review_notes TEXT,
                started_at TEXT NOT NULL,
                completed_at TEXT,
                error TEXT
            );
        """)

    # --- Session ---

    def create_session(self, username: str, expire_hours: int = 24) -> str:
        token = token_hex(32)
        now = datetime.now()
        expires = now + timedelta(hours=expire_hours)
        with self._lock:
            self.conn.execute(
                "INSERT INTO sessions (token, username, created_at, expires_at) VALUES (?, ?, ?, ?)",
                (token, username, now.isoformat(), expires.isoformat()),
            )
            self.conn.commit()
        return token

    def get_session(self, token: str) -> dict | None:
        with self._lock:
            row = self.conn.execute(
                "SELECT * FROM sessions WHERE token = ?", (token,)
            ).fetchone()
        if not row:
            return None
        expires_at = row["expires_at"]
        if not isinstance(expires_at, str):
            self.delete_session(token)
            return None
        if datetime.fromisoformat(expires_at) < datetime.now():
            self.delete_session(token)
            return None
        return dict(row)

    def delete_session(self, token: str):
        with self._lock:
            self.conn.execute("DELETE FROM sessions WHERE token = ?", (token,))
            self.conn.commit()

    def cleanup_expired(self):
        with self._lock:
            self.conn.execute(
                "DELETE FROM sessions WHERE expires_at < ?",
                (datetime.now().isoformat(),),
            )
            self.conn.commit()

    # --- Tasks ---

    def get_tasks(self) -> list[dict]:
        with self._lock:
            rows = self.conn.execute(
                "SELECT * FROM tasks ORDER BY created_at DESC"
            ).fetchall()
        return [dict(r) for r in rows]

    def get_enabled_tasks(self) -> list[dict]:
        with self._lock:
            # tasks table
            rows = self.conn.execute(
                "SELECT id, name, handler, cron_expr, enabled FROM tasks WHERE enabled = 1"
            ).fetchall()
            tasks = [dict(r) for r in rows]
            # agent_tasks table (status = 'pending' or 'running' means enabled)
            rows = self.conn.execute(
                "SELECT id, title as name, 'agent' as handler, schedule_cron, status FROM agent_tasks WHERE status IN ('pending', 'running')"
            ).fetchall()
            agent_tasks = [dict(r) for r in rows]
            for at in agent_tasks:
                at["cron_expr"] = at.pop("schedule_cron")
                at["enabled"] = 1 if at.pop("status") in ("pending", "running") else 0
        return tasks + agent_tasks

    def get_task(self, task_id: str) -> dict | None:
        with self._lock:
            row = self.conn.execute(
                "SELECT id, name, handler, cron_expr, enabled FROM tasks WHERE id = ?", (task_id,)
            ).fetchone()
            if row:
                return dict(row)
            # Check agent_tasks
            row = self.conn.execute(
                "SELECT id, title as name, 'agent' as handler, schedule_cron, status FROM agent_tasks WHERE id = ?", (task_id,)
            ).fetchone()
            if row:
                task = dict(row)
                task["cron_expr"] = task.pop("schedule_cron")
                task["enabled"] = 1 if task.pop("status") in ("pending", "running") else 0
                return task
        return None

    def create_task(self, task: dict) -> dict:
        now = datetime.now().isoformat()
        with self._lock:
            self.conn.execute(
                "INSERT INTO tasks (id, name, description, task_type, handler, config, cron_expr, enabled, created_at, updated_at) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    task["id"], task["name"], task.get("description"),
                    task["task_type"], task["handler"], task.get("config"),
                    task.get("cron_expr"), int(task.get("enabled", True)),
                    now, now,
                ),
            )
            self.conn.commit()
        return self.get_task(task["id"])  # type: ignore

    def update_task(self, task_id: str, updates: dict) -> dict | None:
        existing = self.get_task(task_id)
        if not existing:
            return None
        fields = []
        params = []
        for key in ("name", "description", "task_type", "handler", "config", "cron_expr", "enabled"):
            if key in updates:
                fields.append(f"{key} = ?")
                val = updates[key]
                if key == "enabled":
                    val = int(val)
                params.append(val)
        if not fields:
            return existing
        fields.append("updated_at = ?")
        params.append(datetime.now().isoformat())
        params.append(task_id)
        with self._lock:
            self.conn.execute(
                f"UPDATE tasks SET {', '.join(fields)} WHERE id = ?", params
            )
            self.conn.commit()
        return self.get_task(task_id)

    def delete_task(self, task_id: str) -> bool:
        with self._lock:
            cursor = self.conn.execute("DELETE FROM tasks WHERE id = ?", (task_id,))
            self.conn.commit()
        return cursor.rowcount > 0

    # --- Execution History ---

    def record_start(self, task_id: str) -> int:
        with self._lock:
            cursor = self.conn.execute(
                "INSERT INTO execution_history (task_id, status, started_at) VALUES (?, 'running', ?)",
                (task_id, datetime.now().isoformat()),
            )
            self.conn.commit()
            return cursor.lastrowid  # type: ignore

    def record_success(self, history_id: int, result: str | None, duration_ms: int):
        with self._lock:
            self.conn.execute(
                "UPDATE execution_history SET status = 'success', finished_at = ?, duration_ms = ?, result = ? WHERE id = ?",
                (datetime.now().isoformat(), duration_ms, result, history_id),
            )
            self.conn.commit()

    def record_failure(self, history_id: int, error: str, duration_ms: int):
        with self._lock:
            self.conn.execute(
                "UPDATE execution_history SET status = 'failed', finished_at = ?, duration_ms = ?, error = ? WHERE id = ?",
                (datetime.now().isoformat(), duration_ms, error, history_id),
            )
            self.conn.commit()

    def get_task_history(self, task_id: str, limit: int = 20, offset: int = 0) -> list[dict]:
        with self._lock:
            rows = self.conn.execute(
                "SELECT * FROM execution_history WHERE task_id = ? ORDER BY started_at DESC LIMIT ? OFFSET ?",
                (task_id, limit, offset),
            ).fetchall()
        return [dict(r) for r in rows]

    def get_recent_history(self, limit: int = 50) -> list[dict]:
        with self._lock:
            rows = self.conn.execute(
                "SELECT h.*, t.name as task_name FROM execution_history h "
                "LEFT JOIN tasks t ON h.task_id = t.id "
                "ORDER BY h.started_at DESC LIMIT ?",
                (limit,),
            ).fetchall()
        return [dict(r) for r in rows]

    def get_history_stats(self) -> dict:
        with self._lock:
            total = self.conn.execute("SELECT COUNT(*) as cnt FROM execution_history").fetchone()["cnt"]
            success = self.conn.execute("SELECT COUNT(*) as cnt FROM execution_history WHERE status = 'success'").fetchone()["cnt"]
            failed = self.conn.execute("SELECT COUNT(*) as cnt FROM execution_history WHERE status = 'failed'").fetchone()["cnt"]
            avg_dur = self.conn.execute("SELECT AVG(duration_ms) as avg FROM execution_history WHERE status = 'success'").fetchone()["avg"]
        return {
            "total": total,
            "success": success,
            "failed": failed,
            "success_rate": round(success / total * 100, 1) if total > 0 else 0,
            "avg_duration_ms": round(avg_dur) if avg_dur else 0,
        }

    # --- Pipeline Runs ---

    def create_pipeline_run(self, run_id: str) -> dict:
        with self._lock:
            self.conn.execute(
                "INSERT INTO pipeline_runs (id, status, started_at) VALUES (?, 'keyword_collecting', ?)",
                (run_id, datetime.now().isoformat()),
            )
            self.conn.commit()
        return self.get_pipeline_run(run_id)  # type: ignore

    def get_pipeline_run(self, run_id: str) -> dict | None:
        with self._lock:
            row = self.conn.execute(
                "SELECT * FROM pipeline_runs WHERE id = ?", (run_id,)
            ).fetchone()
        return dict(row) if row else None

    def get_pipeline_runs(self, limit: int = 20) -> list[dict]:
        with self._lock:
            rows = self.conn.execute(
                "SELECT * FROM pipeline_runs ORDER BY started_at DESC LIMIT ?",
                (limit,),
            ).fetchall()
        return [dict(r) for r in rows]

    def update_pipeline_run(self, run_id: str, updates: dict):
        fields = []
        params = []
        for key, val in updates.items():
            fields.append(f"{key} = ?")
            params.append(val)
        if not fields:
            return
        params.append(run_id)
        with self._lock:
            self.conn.execute(
                f"UPDATE pipeline_runs SET {', '.join(fields)} WHERE id = ?", params
            )
            self.conn.commit()

    def close(self):
        self.conn.close()
