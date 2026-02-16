"""AgentConfigStore — simple key-value store for agent feature toggles."""

from datetime import datetime

from src.db.connection import Database

DEFAULTS = {
    "idle_enabled": "false",
    "chaining_enabled": "false",
    "monitors_enabled": "false",
    "evolution_enabled": "true",
}


class AgentConfigStore:
    def __init__(self, db: Database):
        self.db = db
        self._ensure_defaults()

    def _ensure_defaults(self):
        now = datetime.now().isoformat()
        with self.db._lock:
            for key, value in DEFAULTS.items():
                self.db.conn.execute(
                    "INSERT OR IGNORE INTO agent_config (key, value, updated_at) VALUES (?, ?, ?)",
                    (key, value, now),
                )
            self.db.conn.commit()

    def get(self, key: str, default: str = "") -> str:
        with self.db._lock:
            row = self.db.conn.execute(
                "SELECT value FROM agent_config WHERE key = ?", (key,)
            ).fetchone()
        return row["value"] if row else default

    def get_bool(self, key: str) -> bool:
        return self.get(key, "false") == "true"

    def set(self, key: str, value: str):
        now = datetime.now().isoformat()
        with self.db._lock:
            self.db.conn.execute(
                "INSERT OR REPLACE INTO agent_config (key, value, updated_at) VALUES (?, ?, ?)",
                (key, value, now),
            )
            self.db.conn.commit()

    def set_bool(self, key: str, value: bool):
        self.set(key, "true" if value else "false")
