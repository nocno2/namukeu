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

            CREATE TABLE IF NOT EXISTS card_preferences (
                username TEXT NOT NULL,
                card_id TEXT NOT NULL,
                collapsed INTEGER NOT NULL DEFAULT 0,
                pinned INTEGER NOT NULL DEFAULT 0,
                pin_order INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY (username, card_id)
            );
        """)

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

    def get_card_preferences(self, username: str) -> list[dict]:
        with self._lock:
            rows = self.conn.execute(
                "SELECT card_id, collapsed, pinned, pin_order FROM card_preferences WHERE username = ? ORDER BY pin_order",
                (username,),
            ).fetchall()
        return [dict(r) for r in rows]

    def set_card_preference(self, username: str, card_id: str, collapsed: bool | None = None, pinned: bool | None = None, pin_order: int | None = None):
        with self._lock:
            existing = self.conn.execute(
                "SELECT * FROM card_preferences WHERE username = ? AND card_id = ?",
                (username, card_id),
            ).fetchone()

            if existing:
                updates = []
                params = []
                if collapsed is not None:
                    updates.append("collapsed = ?")
                    params.append(int(collapsed))
                if pinned is not None:
                    updates.append("pinned = ?")
                    params.append(int(pinned))
                if pin_order is not None:
                    updates.append("pin_order = ?")
                    params.append(pin_order)
                if updates:
                    params.extend([username, card_id])
                    self.conn.execute(
                        f"UPDATE card_preferences SET {', '.join(updates)} WHERE username = ? AND card_id = ?",
                        params,
                    )
            else:
                self.conn.execute(
                    "INSERT INTO card_preferences (username, card_id, collapsed, pinned, pin_order) VALUES (?, ?, ?, ?, ?)",
                    (username, card_id, int(collapsed or False), int(pinned or False), pin_order or 0),
                )
            self.conn.commit()

    def close(self):
        self.conn.close()
