"""AuditLog — SQLite-based audit logging. Port of agent-core/src/audit.ts"""

import json
from datetime import datetime, timedelta

from src.db.connection import Database


class AuditLog:
    def __init__(self, db: Database):
        self.db = db

    def record(
        self,
        ts: str,
        audit_type: str,
        task: str | None = None,
        chat_id: str | None = None,
        violations: list | None = None,
        cost: float | None = None,
        tokens: int | None = None,
        duration: int | None = None,
    ):
        violations_json = json.dumps(violations) if violations else "[]"
        with self.db._lock:
            self.db.conn.execute(
                """INSERT INTO agent_audit (ts, type, task, chat_id, violations, cost, tokens, duration, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))""",
                (ts, audit_type, task, chat_id, violations_json, cost, tokens, duration),
            )
            self.db.conn.commit()

    def get_recent(self, limit: int = 20) -> list[dict]:
        with self.db._lock:
            rows = self.db.conn.execute(
                "SELECT * FROM agent_audit ORDER BY ts DESC LIMIT ?", (limit,)
            ).fetchall()
        return [dict(r) for r in rows]

    def get_today_cost(self, timezone: str = "Asia/Seoul") -> float:
        today_str = datetime.now().strftime("%Y-%m-%d")
        with self.db._lock:
            row = self.db.conn.execute(
                """SELECT COALESCE(SUM(cost), 0) as total FROM agent_audit
                   WHERE date(ts) = ? AND cost IS NOT NULL""",
                (today_str,),
            ).fetchone()
        return row["total"] if row else 0.0

    def get_today_tokens(self, timezone: str = "Asia/Seoul") -> int:
        today_str = datetime.now().strftime("%Y-%m-%d")
        with self.db._lock:
            row = self.db.conn.execute(
                """SELECT COALESCE(SUM(tokens), 0) as total FROM agent_audit
                   WHERE date(ts) = ? AND tokens IS NOT NULL""",
                (today_str,),
            ).fetchone()
        return row["total"] if row else 0

    def get_proactive_count_last_hour(self) -> int:
        one_hour_ago = (datetime.now() - timedelta(hours=1)).isoformat()
        with self.db._lock:
            row = self.db.conn.execute(
                """SELECT COUNT(*) as cnt FROM agent_audit
                   WHERE type = 'heartbeat'
                   AND ts >= ?""",
                (one_hour_ago,),
            ).fetchone()
        return row["cnt"] if row else 0

    def get_today_stats(self, timezone: str = "Asia/Seoul") -> dict:
        today_str = datetime.now().strftime("%Y-%m-%d")
        with self.db._lock:
            row = self.db.conn.execute(
                """SELECT
                     COUNT(*) as task_count,
                     COALESCE(SUM(cost), 0) as total_cost,
                     MAX(ts) as last_task_at
                   FROM agent_audit
                   WHERE type = 'heartbeat' AND date(ts) = ?""",
                (today_str,),
            ).fetchone()
        if not row:
            return {"task_count": 0, "total_cost": 0.0, "last_task_at": None}
        return {
            "task_count": row["task_count"],
            "total_cost": row["total_cost"],
            "last_task_at": row["last_task_at"],
        }
