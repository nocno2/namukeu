import json
import logging
import sqlite3
from datetime import datetime
from pathlib import Path

logger = logging.getLogger(__name__)


class Database:
    def __init__(self, db_path: str = "data/train-go.db"):
        Path(db_path).parent.mkdir(parents=True, exist_ok=True)
        self.conn = sqlite3.connect(db_path, check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        self._create_tables()

    def _create_tables(self):
        self.conn.executescript("""
            CREATE TABLE IF NOT EXISTS credentials (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                provider TEXT NOT NULL UNIQUE,
                encrypted_id TEXT NOT NULL,
                encrypted_pw TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS reservations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                provider TEXT NOT NULL,
                dep_station TEXT NOT NULL,
                arr_station TEXT NOT NULL,
                date TEXT NOT NULL,
                time_range_start TEXT NOT NULL,
                time_range_end TEXT NOT NULL,
                passengers TEXT NOT NULL DEFAULT '{"adult": 1}',
                seat_type TEXT NOT NULL DEFAULT 'general',
                -- 세분화된 필터 옵션
                train_name TEXT,
                train_name_exclude INTEGER DEFAULT 0,
                seat_position TEXT DEFAULT 'any',
                price_range TEXT,
                -- 상태
                status TEXT NOT NULL DEFAULT 'pending',
                train_info TEXT,
                error_message TEXT,
                created_at TEXT NOT NULL,
                reserved_at TEXT,
                expires_at TEXT
            );

            CREATE TABLE IF NOT EXISTS search_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                reservation_id INTEGER NOT NULL,
                searched_at TEXT NOT NULL,
                results_count INTEGER DEFAULT 0,
                error TEXT,
                FOREIGN KEY (reservation_id) REFERENCES reservations(id)
            );

            CREATE INDEX IF NOT EXISTS idx_search_logs_reservation_id ON search_logs(reservation_id);
        """)
        self.conn.commit()

    # --- Credentials ---

    def save_credential(self, provider: str, encrypted_id: str, encrypted_pw: str):
        now = datetime.now().isoformat()
        self.conn.execute(
            """INSERT INTO credentials (provider, encrypted_id, encrypted_pw, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?)
               ON CONFLICT(provider) DO UPDATE SET
                 encrypted_id=excluded.encrypted_id,
                 encrypted_pw=excluded.encrypted_pw,
                 updated_at=excluded.updated_at""",
            (provider, encrypted_id, encrypted_pw, now, now),
        )
        self.conn.commit()

    def get_credential(self, provider: str) -> dict | None:
        row = self.conn.execute(
            "SELECT * FROM credentials WHERE provider = ?", (provider,)
        ).fetchone()
        return dict(row) if row else None

    def delete_credential(self, provider: str) -> bool:
        cursor = self.conn.execute("DELETE FROM credentials WHERE provider = ?", (provider,))
        self.conn.commit()
        return cursor.rowcount > 0

    # --- Reservations ---

    def create_reservation(
        self,
        provider: str,
        dep_station: str,
        arr_station: str,
        date: str,
        time_range_start: str,
        time_range_end: str,
        passengers: dict | None = None,
        seat_type: str = "general",
        train_name: str | None = None,
        train_name_exclude: bool = False,
        seat_position: str = "any",
        price_range: dict | None = None,
    ) -> int:
        now = datetime.now().isoformat()
        cursor = self.conn.execute(
            """INSERT INTO reservations
               (provider, dep_station, arr_station, date, time_range_start, time_range_end,
                passengers, seat_type, train_name, train_name_exclude, seat_position, price_range,
                status, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)""",
            (
                provider,
                dep_station,
                arr_station,
                date,
                time_range_start,
                time_range_end,
                json.dumps(passengers or {"adult": 1}),
                seat_type,
                train_name,
                1 if train_name_exclude else 0,
                seat_position,
                json.dumps(price_range) if price_range else None,
                now,
            ),
        )
        self.conn.commit()
        return cursor.lastrowid

    def get_reservation(self, reservation_id: int) -> dict | None:
        row = self.conn.execute(
            "SELECT * FROM reservations WHERE id = ?", (reservation_id,)
        ).fetchone()
        return dict(row) if row else None

    def get_reservations(self, status: str | None = None) -> list[dict]:
        if status:
            rows = self.conn.execute(
                "SELECT * FROM reservations WHERE status = ? ORDER BY created_at DESC",
                (status,),
            ).fetchall()
        else:
            rows = self.conn.execute(
                "SELECT * FROM reservations ORDER BY created_at DESC"
            ).fetchall()
        return [dict(r) for r in rows]

    def update_reservation_status(
        self,
        reservation_id: int,
        status: str,
        train_info: dict | None = None,
        error_message: str | None = None,
    ):
        now = datetime.now().isoformat()
        reserved_at = now if status == "reserved" else None
        self.conn.execute(
            """UPDATE reservations
               SET status = ?, train_info = ?, error_message = ?, reserved_at = COALESCE(?, reserved_at)
               WHERE id = ?""",
            (
                status,
                json.dumps(train_info) if train_info else None,
                error_message,
                reserved_at,
                reservation_id,
            ),
        )
        self.conn.commit()

    def delete_reservation(self, reservation_id: int) -> bool:
        cursor = self.conn.execute("DELETE FROM reservations WHERE id = ?", (reservation_id,))
        self.conn.commit()
        return cursor.rowcount > 0

    # --- Search Logs ---

    def add_search_log(
        self, reservation_id: int, results_count: int = 0, error: str | None = None
    ):
        now = datetime.now().isoformat()
        self.conn.execute(
            "INSERT INTO search_logs (reservation_id, searched_at, results_count, error) VALUES (?, ?, ?, ?)",
            (reservation_id, now, results_count, error),
        )
        self.conn.commit()

    def get_search_logs(self, reservation_id: int) -> list[dict]:
        rows = self.conn.execute(
            "SELECT * FROM search_logs WHERE reservation_id = ? ORDER BY searched_at ASC",
            (reservation_id,),
        ).fetchall()
        return [dict(r) for r in rows]

    def cleanup_old_logs(self, keep_days: int = 7) -> int:
        """만료된 예약의 오래된 검색 로그 삭제. 삭제된 로그 수 반환."""
        from datetime import timedelta

        cutoff = datetime.now() - timedelta(days=keep_days)
        cursor = self.conn.execute(
            "DELETE FROM search_logs WHERE searched_at < ?",
            (cutoff.isoformat(),),
        )
        self.conn.commit()
        deleted = cursor.rowcount
        if deleted > 0:
            logger.info(f"search_logs 정리 완료: {deleted}개 로그 삭제 (보관 {keep_days}일)")
        return deleted

    def close(self):
        self.conn.close()
