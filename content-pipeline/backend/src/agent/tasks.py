"""TaskStore — agent_tasks CRUD + scheduling. Port of agent-core/src/tasks.ts"""

import uuid
from datetime import datetime

from src.agent.cron import get_next_cron_time
from src.agent.types import AgentTask
from src.db.connection import Database


class TaskStore:
    def __init__(self, db: Database):
        self.db = db

    def create_task(
        self,
        title: str,
        prompt: str,
        task_type: str,
        project: str = "GENERAL",
        schedule_cron: str | None = None,
        schedule_at: str | None = None,
        event_trigger: str | None = None,
        notify_user: bool = True,
        requires_approval: bool = False,
        max_runs: int | None = None,
        chain_depth: int = 0,
        chain_parent_id: str | None = None,
    ) -> AgentTask:
        task_id = str(uuid.uuid4())
        now = datetime.now().isoformat()

        schedule_next: str | None = None
        if schedule_cron:
            schedule_next = get_next_cron_time(schedule_cron).isoformat()
        elif schedule_at:
            schedule_next = schedule_at

        if max_runs is None and task_type == "one-time":
            max_runs = 1

        with self.db._lock:
            self.db.conn.execute(
                """INSERT INTO agent_tasks
                   (id, type, status, title, prompt, project,
                    schedule_cron, schedule_next, event_trigger,
                    last_run_at, last_result, run_count, max_runs,
                    notify_user, requires_approval,
                    chain_depth, chain_parent_id,
                    created_at, updated_at)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (
                    task_id, task_type, "pending", title, prompt, project,
                    schedule_cron, schedule_next, event_trigger,
                    None, None, 0, max_runs,
                    1 if notify_user else 0,
                    1 if requires_approval else 0,
                    chain_depth, chain_parent_id,
                    now, now,
                ),
            )
            self.db.conn.commit()

        return self.get_by_id(task_id)  # type: ignore

    def get_due_tasks(self, now: datetime | None = None) -> list[AgentTask]:
        dt = now or datetime.now()
        with self.db._lock:
            rows = self.db.conn.execute(
                """SELECT * FROM agent_tasks
                   WHERE status = 'pending'
                   AND schedule_next IS NOT NULL
                   AND schedule_next <= ?
                   ORDER BY schedule_next ASC""",
                (dt.isoformat(),),
            ).fetchall()
        return [_row_to_task(r) for r in rows]

    def get_event_tasks(self, event_name: str) -> list[AgentTask]:
        with self.db._lock:
            rows = self.db.conn.execute(
                """SELECT * FROM agent_tasks
                   WHERE status = 'pending'
                   AND type = 'event'
                   AND event_trigger = ?""",
                (event_name,),
            ).fetchall()
        return [_row_to_task(r) for r in rows]

    def get_all(self) -> list[AgentTask]:
        with self.db._lock:
            rows = self.db.conn.execute(
                "SELECT * FROM agent_tasks ORDER BY created_at DESC"
            ).fetchall()
        return [_row_to_task(r) for r in rows]

    def get_active(self) -> list[AgentTask]:
        with self.db._lock:
            rows = self.db.conn.execute(
                """SELECT * FROM agent_tasks
                   WHERE status IN ('pending', 'running')
                   ORDER BY schedule_next ASC"""
            ).fetchall()
        return [_row_to_task(r) for r in rows]

    def get_by_id(self, task_id: str) -> AgentTask | None:
        with self.db._lock:
            row = self.db.conn.execute(
                "SELECT * FROM agent_tasks WHERE id = ?", (task_id,)
            ).fetchone()
        return _row_to_task(row) if row else None

    def update_status(self, task_id: str, status: str):
        with self.db._lock:
            self.db.conn.execute(
                "UPDATE agent_tasks SET status = ?, updated_at = ? WHERE id = ?",
                (status, datetime.now().isoformat(), task_id),
            )
            self.db.conn.commit()

    def complete_run(self, task_id: str, result: str, cost_usd: float | None = None):
        task = self.get_by_id(task_id)
        if not task:
            return

        now = datetime.now()
        new_run_count = task["run_count"] + 1

        if task["max_runs"] and new_run_count >= task["max_runs"]:
            next_status = "completed"
            next_schedule = None
        elif task["type"] == "recurring" and task["schedule_cron"]:
            next_status = "pending"
            next_schedule = get_next_cron_time(task["schedule_cron"], now).isoformat()
        elif task["type"] == "event":
            next_status = "pending"
            next_schedule = None
        else:
            next_status = "completed"
            next_schedule = None

        with self.db._lock:
            self.db.conn.execute(
                """UPDATE agent_tasks SET
                   status = ?, run_count = ?, last_run_at = ?,
                   last_result = ?, schedule_next = ?, updated_at = ?
                   WHERE id = ?""",
                (
                    next_status, new_run_count, now.isoformat(),
                    result[:2000], next_schedule, now.isoformat(), task_id,
                ),
            )
            self.db.conn.commit()

    def cancel_task(self, task_id: str) -> bool:
        task = self.get_by_id(task_id)
        if not task or task["status"] == "completed":
            return False
        with self.db._lock:
            self.db.conn.execute(
                "UPDATE agent_tasks SET status = 'completed', updated_at = ? WHERE id = ?",
                (datetime.now().isoformat(), task_id),
            )
            self.db.conn.commit()
        return True

    def update_task(self, task_id: str, updates: dict):
        sets: list[str] = []
        values: list = []

        if "requires_approval" in updates:
            sets.append("requires_approval = ?")
            values.append(1 if updates["requires_approval"] else 0)
        if "schedule_next" in updates:
            sets.append("schedule_next = ?")
            values.append(updates["schedule_next"])
        if "status" in updates:
            sets.append("status = ?")
            values.append(updates["status"])

        if not sets:
            return
        sets.append("updated_at = ?")
        values.append(datetime.now().isoformat())
        values.append(task_id)

        with self.db._lock:
            self.db.conn.execute(
                f"UPDATE agent_tasks SET {', '.join(sets)} WHERE id = ?", values
            )
            self.db.conn.commit()

    def delete_task(self, task_id: str):
        with self.db._lock:
            self.db.conn.execute("DELETE FROM agent_tasks WHERE id = ?", (task_id,))
            self.db.conn.commit()

    def find_by_title(self, search: str) -> AgentTask | None:
        with self.db._lock:
            row = self.db.conn.execute(
                """SELECT * FROM agent_tasks
                   WHERE title LIKE ? AND status IN ('pending', 'running', 'paused')
                   LIMIT 1""",
                (f"%{search}%",),
            ).fetchone()
        return _row_to_task(row) if row else None


def _row_to_task(row) -> AgentTask:
    d = dict(row)
    d["notify_user"] = bool(d["notify_user"])
    d["requires_approval"] = bool(d["requires_approval"])
    d["chain_depth"] = d.get("chain_depth") or 0
    d["chain_parent_id"] = d.get("chain_parent_id")
    return d  # type: ignore
