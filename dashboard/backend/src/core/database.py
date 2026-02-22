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

            CREATE TABLE IF NOT EXISTS metrics (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp TEXT NOT NULL,
                service_name TEXT NOT NULL,
                status TEXT NOT NULL,
                response_time_ms REAL
            );

            CREATE INDEX IF NOT EXISTS idx_metrics_service_time
                ON metrics (service_name, timestamp);

            CREATE TABLE IF NOT EXISTS incidents (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                service_name TEXT NOT NULL,
                started_at TEXT NOT NULL,
                resolved_at TEXT,
                duration_sec INTEGER,
                auto_recovered INTEGER NOT NULL DEFAULT 0,
                recovery_attempt_count INTEGER NOT NULL DEFAULT 0
            );

            CREATE INDEX IF NOT EXISTS idx_incidents_service_time
                ON incidents (service_name, started_at);

            CREATE TABLE IF NOT EXISTS service_types (
                service_name TEXT PRIMARY KEY,
                type TEXT NOT NULL DEFAULT 'evolving'
            );

            CREATE TABLE IF NOT EXISTS events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                type TEXT NOT NULL,
                service_name TEXT NOT NULL,
                message TEXT NOT NULL,
                severity TEXT NOT NULL DEFAULT 'info',
                timestamp TEXT NOT NULL,
                notified INTEGER NOT NULL DEFAULT 0
            );

            CREATE INDEX IF NOT EXISTS idx_events_timestamp
                ON events (timestamp);

            CREATE INDEX IF NOT EXISTS idx_events_service_severity
                ON events (service_name, severity);
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

    def insert_metric(self, service_name: str, status: str, response_time_ms: float | None):
        with self._lock:
            self.conn.execute(
                "INSERT INTO metrics (timestamp, service_name, status, response_time_ms) VALUES (?, ?, ?, ?)",
                (datetime.now().isoformat(), service_name, status, response_time_ms),
            )
            self.conn.commit()

    def get_metrics(self, service_name: str, since: datetime) -> list[dict]:
        with self._lock:
            rows = self.conn.execute(
                "SELECT timestamp, status, response_time_ms FROM metrics WHERE service_name = ? AND timestamp >= ? ORDER BY timestamp",
                (service_name, since.isoformat()),
            ).fetchall()
        return [dict(r) for r in rows]

    def get_latest_metric(self, service_name: str) -> dict | None:
        with self._lock:
            row = self.conn.execute(
                "SELECT timestamp, status, response_time_ms FROM metrics WHERE service_name = ? ORDER BY timestamp DESC LIMIT 1",
                (service_name,),
            ).fetchone()
        return dict(row) if row else None

    def insert_incident(self, service_name: str) -> int:
        with self._lock:
            cursor = self.conn.execute(
                "INSERT INTO incidents (service_name, started_at) VALUES (?, ?)",
                (service_name, datetime.now().isoformat()),
            )
            self.conn.commit()
            return cursor.lastrowid

    def resolve_incident(self, incident_id: int, auto_recovered: bool = False, recovery_attempts: int = 0):
        now = datetime.now()
        with self._lock:
            row = self.conn.execute(
                "SELECT started_at FROM incidents WHERE id = ?", (incident_id,)
            ).fetchone()
            if not row:
                return
            started_at = datetime.fromisoformat(row["started_at"])
            duration_sec = int((now - started_at).total_seconds())
            self.conn.execute(
                "UPDATE incidents SET resolved_at = ?, duration_sec = ?, auto_recovered = ?, recovery_attempt_count = ? WHERE id = ?",
                (now.isoformat(), duration_sec, int(auto_recovered), recovery_attempts, incident_id),
            )
            self.conn.commit()

    def get_incidents(self, service_name: str, since: datetime) -> list[dict]:
        with self._lock:
            rows = self.conn.execute(
                "SELECT id, service_name, started_at, resolved_at, duration_sec, auto_recovered, recovery_attempt_count "
                "FROM incidents WHERE service_name = ? AND started_at >= ? ORDER BY started_at DESC",
                (service_name, since.isoformat()),
            ).fetchall()
        return [dict(r) for r in rows]

    def insert_event(self, type: str, service_name: str, message: str, severity: str = "info", notified: bool = False):
        with self._lock:
            self.conn.execute(
                "INSERT INTO events (type, service_name, message, severity, timestamp, notified) VALUES (?, ?, ?, ?, ?, ?)",
                (type, service_name, message, severity, datetime.now().isoformat(), int(notified)),
            )
            self.conn.commit()

    def get_events(self, since: datetime, severity: str | None = None, service_name: str | None = None, limit: int = 100) -> list[dict]:
        query = "SELECT id, type, service_name, message, severity, timestamp, notified FROM events WHERE timestamp >= ?"
        params: list = [since.isoformat()]
        if severity:
            query += " AND severity = ?"
            params.append(severity)
        if service_name:
            query += " AND service_name = ?"
            params.append(service_name)
        query += " ORDER BY timestamp DESC LIMIT ?"
        params.append(limit)
        with self._lock:
            rows = self.conn.execute(query, params).fetchall()
        return [dict(r) for r in rows]

    def cleanup_old_metrics(self, retention_days: int = 7):
        """Aggregate metrics older than retention_days into hourly summaries, then delete raw data."""
        cutoff = (datetime.now() - timedelta(days=retention_days)).isoformat()
        with self._lock:
            # Get hourly aggregates for old data
            rows = self.conn.execute("""
                SELECT service_name,
                       strftime('%Y-%m-%dT%H:00:00', timestamp) as hour_ts,
                       -- Most common status in the hour (majority vote)
                       CASE WHEN SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) >
                            SUM(CASE WHEN status = 'down' THEN 1 ELSE 0 END)
                       THEN 'running' ELSE 'down' END as status,
                       AVG(response_time_ms) as response_time_ms
                FROM metrics
                WHERE timestamp < ?
                GROUP BY service_name, strftime('%Y-%m-%dT%H:00:00', timestamp)
            """, (cutoff,)).fetchall()

            # Delete old raw data
            self.conn.execute("DELETE FROM metrics WHERE timestamp < ?", (cutoff,))

            # Insert hourly aggregates
            for row in rows:
                self.conn.execute(
                    "INSERT INTO metrics (timestamp, service_name, status, response_time_ms) VALUES (?, ?, ?, ?)",
                    (row["hour_ts"], row["service_name"], row["status"], row["response_time_ms"]),
                )
            self.conn.commit()

    def get_service_type(self, service_name: str) -> str:
        """Get service type (ktlo or evolving). Defaults to evolving."""
        with self._lock:
            row = self.conn.execute(
                "SELECT type FROM service_types WHERE service_name = ?",
                (service_name,),
            ).fetchone()
        return row["type"] if row else "evolving"

    def set_service_type(self, service_name: str, type: str):
        """Set service type (ktlo or evolving)."""
        if type not in ("ktlo", "evolving"):
            raise ValueError("type must be 'ktlo' or 'evolving'")
        with self._lock:
            self.conn.execute(
                "INSERT OR REPLACE INTO service_types (service_name, type) VALUES (?, ?)",
                (service_name, type),
            )
            self.conn.commit()

    def close(self):
        self.conn.close()
