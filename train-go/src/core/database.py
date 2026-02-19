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
        # 기존 테이블 생성 (error_code 없이)
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
                train_name TEXT,
                train_name_exclude INTEGER DEFAULT 0,
                seat_position TEXT DEFAULT 'any',
                price_range TEXT,
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
        self._migrate_schema()

    def _migrate_schema(self):
        """스키마 마이그레이션: 기존 테이블에 새 컬럼 추가."""
        # search_logs 테이블에 error_code 컬럼 추가 (있는 경우 무시)
        try:
            self.conn.execute("ALTER TABLE search_logs ADD COLUMN error_code TEXT")
            self.conn.commit()
            logger.info("마이그레이션 완료: search_logs.error_code 컬럼 추가")
        except sqlite3.OperationalError as e:
            if "duplicate column name" not in str(e).lower():
                raise

        # search_logs 테이블에 백오프 정보 컬럼 추가
        for col, default in [
            ("consecutive_errors", "INTEGER DEFAULT 0"),
            ("backoff_seconds", "REAL DEFAULT 0"),
            ("is_expected", "INTEGER DEFAULT 0"),
        ]:
            try:
                self.conn.execute(f"ALTER TABLE search_logs ADD COLUMN {col} {default}")
                self.conn.commit()
                logger.info(f"마이그레이션 완료: search_logs.{col} 컬럼 추가")
            except sqlite3.OperationalError as e:
                if "duplicate column name" not in str(e).lower():
                    raise

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
        self,
        reservation_id: int,
        results_count: int = 0,
        error: str | None = None,
        error_code: str | None = None,
        consecutive_errors: int = 0,
        backoff_seconds: float = 0.0,
        is_expected: bool = False,
    ):
        now = datetime.now().isoformat()
        self.conn.execute(
            """INSERT INTO search_logs
               (reservation_id, searched_at, results_count, error, error_code, consecutive_errors, backoff_seconds, is_expected)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (reservation_id, now, results_count, error, error_code, consecutive_errors, backoff_seconds, 1 if is_expected else 0),
        )
        self.conn.commit()

    def get_search_logs(self, reservation_id: int) -> list[dict]:
        rows = self.conn.execute(
            "SELECT * FROM search_logs WHERE reservation_id = ? ORDER BY searched_at ASC",
            (reservation_id,),
        ).fetchall()
        return [dict(r) for r in rows]

    def get_error_stats(self, reservation_id: int | None = None) -> dict:
        """에러 통계 조회. 특정 예약 또는 전체에 대한 에러 패턴 분석."""
        # 에러 코드별 개수
        if reservation_id:
            rows = self.conn.execute(
                "SELECT error_code, COUNT(*) as count FROM search_logs WHERE error_code IS NOT NULL AND reservation_id = ? GROUP BY error_code",
                (reservation_id,),
            ).fetchall()
        else:
            rows = self.conn.execute(
                "SELECT error_code, COUNT(*) as count FROM search_logs WHERE error_code IS NOT NULL GROUP BY error_code",
            ).fetchall()
        error_by_code = {dict(r)["error_code"]: dict(r)["count"] for r in rows}

        # 에러 패턴 분석 (consecutive_errors, backoff_seconds, is_expected 기반)
        if reservation_id:
            pattern_rows = self.conn.execute(
                """SELECT
                    MAX(consecutive_errors) as max_consecutive,
                    AVG(backoff_seconds) as avg_backoff,
                    SUM(CASE WHEN is_expected = 1 THEN 1 ELSE 0 END) as expected_count,
                    SUM(CASE WHEN is_expected = 0 AND error IS NOT NULL THEN 1 ELSE 0 END) as unexpected_count
                   FROM search_logs
                   WHERE reservation_id = ? AND error IS NOT NULL""",
                (reservation_id,),
            ).fetchone()
        else:
            pattern_rows = self.conn.execute(
                """SELECT
                    MAX(consecutive_errors) as max_consecutive,
                    AVG(backoff_seconds) as avg_backoff,
                    SUM(CASE WHEN is_expected = 1 THEN 1 ELSE 0 END) as expected_count,
                    SUM(CASE WHEN is_expected = 0 AND error IS NOT NULL THEN 1 ELSE 0 END) as unexpected_count
                   FROM search_logs
                   WHERE error IS NOT NULL"""
            ).fetchone()

        pattern = dict(pattern_rows) if pattern_rows else {}

        return {
            "error_by_code": error_by_code,
            "max_consecutive_errors": pattern.get("max_consecutive", 0) or 0,
            "avg_backoff_seconds": round(pattern.get("avg_backoff", 0) or 0, 2),
            "expected_error_count": pattern.get("expected_count", 0) or 0,
            "unexpected_error_count": pattern.get("unexpected_count", 0) or 0,
        }

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
