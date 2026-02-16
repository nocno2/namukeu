"""GoalStore — Python port of shared/agent-core/src/goals.ts"""

import json
import uuid
from datetime import datetime

from src.db.connection import Database

PROJECT_CODES = {"COIN", "BLOG", "DASH", "TRAIN", "TGBOT", "DCBOT", "GENERAL"}


class GoalStore:
    def __init__(self, db: Database):
        self.db = db

    def create_goal(
        self,
        title: str,
        description: str,
        projects: list[str],
        priority: str = "medium",
        deadline: str | None = None,
    ) -> dict:
        goal_id = str(uuid.uuid4())
        now = datetime.now().isoformat()
        with self.db._lock:
            self.db.conn.execute(
                "INSERT INTO agent_goals (id,title,description,projects,status,priority,deadline,progress,created_at,updated_at) "
                "VALUES (?,?,?,?,?,?,?,?,?,?)",
                (goal_id, title, description, json.dumps(projects), "active", priority, deadline, None, now, now),
            )
            self.db.conn.commit()
        return self.get_by_id(goal_id)  # type: ignore

    def get_all(self) -> list[dict]:
        with self.db._lock:
            rows = self.db.conn.execute(
                "SELECT * FROM agent_goals ORDER BY created_at DESC"
            ).fetchall()
        return [_row_to_goal(r) for r in rows]

    def get_active(self) -> list[dict]:
        with self.db._lock:
            rows = self.db.conn.execute(
                "SELECT * FROM agent_goals WHERE status = 'active' ORDER BY priority ASC, created_at DESC"
            ).fetchall()
        return [_row_to_goal(r) for r in rows]

    def get_by_project(self, project: str) -> list[dict]:
        with self.db._lock:
            rows = self.db.conn.execute(
                "SELECT * FROM agent_goals WHERE status = 'active' AND projects LIKE ? ORDER BY priority ASC",
                (f'%"{project}"%',),
            ).fetchall()
        return [_row_to_goal(r) for r in rows]

    def get_by_id(self, goal_id: str) -> dict | None:
        with self.db._lock:
            row = self.db.conn.execute(
                "SELECT * FROM agent_goals WHERE id = ?", (goal_id,)
            ).fetchone()
        return _row_to_goal(row) if row else None

    def update_goal(self, goal_id: str, updates: dict) -> dict | None:
        goal = self.get_by_id(goal_id)
        if not goal:
            return None
        now = datetime.now().isoformat()
        fields = []
        params = []
        for key in ("title", "description", "priority", "deadline", "progress", "status"):
            if key in updates:
                fields.append(f"{key} = ?")
                params.append(updates[key])
        if "projects" in updates:
            fields.append("projects = ?")
            params.append(json.dumps(updates["projects"]))
        if not fields:
            return goal
        fields.append("updated_at = ?")
        params.append(now)
        params.append(goal_id)
        with self.db._lock:
            self.db.conn.execute(
                f"UPDATE agent_goals SET {', '.join(fields)} WHERE id = ?", params
            )
            self.db.conn.commit()
        return self.get_by_id(goal_id)

    def delete_goal(self, goal_id: str) -> bool:
        with self.db._lock:
            cursor = self.db.conn.execute("DELETE FROM agent_goals WHERE id = ?", (goal_id,))
            self.db.conn.commit()
        return cursor.rowcount > 0


def _row_to_goal(row) -> dict:
    d = dict(row)
    d["projects"] = json.loads(d["projects"])
    return d
