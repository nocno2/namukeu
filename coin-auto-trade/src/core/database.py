import json
import sqlite3
from datetime import datetime, timedelta
from pathlib import Path

import pandas as pd


class Database:
    def __init__(self, db_path: str = "data/coin-auto-trade.db"):
        Path(db_path).parent.mkdir(parents=True, exist_ok=True)
        self.conn = sqlite3.connect(db_path, check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        self.conn.execute("PRAGMA journal_mode=WAL")
        self.conn.execute("PRAGMA busy_timeout=5000")
        self._create_tables()
        self._migrate()

    def _create_tables(self):
        self.conn.executescript("""
            CREATE TABLE IF NOT EXISTS credentials (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                provider TEXT NOT NULL UNIQUE DEFAULT 'upbit',
                encrypted_access_key TEXT NOT NULL,
                encrypted_secret_key TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS ohlcv (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ticker TEXT NOT NULL,
                interval TEXT NOT NULL,
                timestamp TEXT NOT NULL,
                open REAL NOT NULL,
                high REAL NOT NULL,
                low REAL NOT NULL,
                close REAL NOT NULL,
                volume REAL NOT NULL,
                UNIQUE(ticker, interval, timestamp)
            );
            CREATE INDEX IF NOT EXISTS idx_ohlcv_ticker_interval_ts
                ON ohlcv(ticker, interval, timestamp);

            CREATE TABLE IF NOT EXISTS strategies (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                ticker TEXT NOT NULL,
                params TEXT NOT NULL DEFAULT '{}',
                interval TEXT NOT NULL DEFAULT 'minute60',
                enabled INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                UNIQUE(name, ticker)
            );

            CREATE TABLE IF NOT EXISTS orders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                uuid TEXT,
                strategy_id INTEGER,
                ticker TEXT NOT NULL,
                side TEXT NOT NULL,
                order_type TEXT NOT NULL,
                price REAL,
                volume REAL,
                amount_krw REAL,
                fee REAL DEFAULT 0,
                state TEXT NOT NULL DEFAULT 'pending',
                is_dry_run INTEGER NOT NULL DEFAULT 1,
                signal_reason TEXT,
                signal_confidence REAL,
                indicators TEXT,
                created_at TEXT NOT NULL,
                executed_at TEXT,
                FOREIGN KEY (strategy_id) REFERENCES strategies(id)
            );
            CREATE INDEX IF NOT EXISTS idx_orders_ticker_created
                ON orders(ticker, created_at);
            CREATE INDEX IF NOT EXISTS idx_orders_strategy
                ON orders(strategy_id, created_at);

            CREATE TABLE IF NOT EXISTS positions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ticker TEXT NOT NULL UNIQUE,
                side TEXT NOT NULL DEFAULT 'long',
                volume REAL NOT NULL,
                avg_entry_price REAL NOT NULL,
                current_price REAL,
                unrealized_pnl REAL DEFAULT 0,
                unrealized_pnl_pct REAL DEFAULT 0,
                strategy_id INTEGER,
                opened_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (strategy_id) REFERENCES strategies(id)
            );

            CREATE TABLE IF NOT EXISTS performance_snapshots (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp TEXT NOT NULL,
                total_equity REAL NOT NULL,
                cash_balance REAL NOT NULL,
                positions_value REAL NOT NULL,
                total_pnl REAL NOT NULL,
                total_pnl_pct REAL NOT NULL,
                daily_pnl REAL DEFAULT 0,
                max_drawdown_pct REAL DEFAULT 0,
                active_positions INTEGER DEFAULT 0,
                snapshot_type TEXT DEFAULT 'periodic'
            );
            CREATE INDEX IF NOT EXISTS idx_perf_snapshot_ts
                ON performance_snapshots(timestamp);

            CREATE TABLE IF NOT EXISTS signal_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ticker TEXT NOT NULL,
                strategy_name TEXT NOT NULL,
                signal TEXT NOT NULL,
                confidence REAL,
                reason TEXT,
                indicators TEXT,
                created_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_signal_ticker_ts
                ON signal_logs(ticker, created_at);

            CREATE TABLE IF NOT EXISTS pipeline_evidence_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ticker TEXT NOT NULL,
                strategy_name TEXT NOT NULL,
                signal TEXT NOT NULL,
                confidence REAL,
                reason TEXT,
                evidences TEXT,
                vetoed INTEGER DEFAULT 0,
                veto_source TEXT,
                created_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_pipeline_log_ticker_ts
                ON pipeline_evidence_logs(ticker, created_at);

            CREATE TABLE IF NOT EXISTS backtest_results (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                strategy_name TEXT NOT NULL,
                ticker TEXT NOT NULL,
                interval TEXT NOT NULL,
                params TEXT NOT NULL,
                start_date TEXT NOT NULL,
                end_date TEXT NOT NULL,
                initial_capital REAL NOT NULL,
                final_capital REAL NOT NULL,
                total_return_pct REAL NOT NULL,
                max_drawdown_pct REAL NOT NULL,
                sharpe_ratio REAL,
                win_rate REAL,
                total_trades INTEGER,
                profit_factor REAL,
                trades_json TEXT,
                equity_curve_json TEXT,
                created_at TEXT NOT NULL
            );
        """)
        self.conn.commit()

    def _migrate(self):
        """Add columns for multi-exchange and futures support."""
        for table in ("strategies", "orders", "positions"):
            columns = [row[1] for row in self.conn.execute(f"PRAGMA table_info({table})").fetchall()]
            if "exchange" not in columns:
                self.conn.execute(f"ALTER TABLE {table} ADD COLUMN exchange TEXT NOT NULL DEFAULT 'upbit'")

        pos_columns = [row[1] for row in self.conn.execute("PRAGMA table_info(positions)").fetchall()]
        if "leverage" not in pos_columns:
            self.conn.execute("ALTER TABLE positions ADD COLUMN leverage INTEGER NOT NULL DEFAULT 1")

        # Migrate strategies UNIQUE(name, ticker) → UNIQUE(name, ticker, exchange)
        indexes = self.conn.execute("PRAGMA index_list(strategies)").fetchall()
        needs_strategy_migration = False
        for idx in indexes:
            if idx[2] == 1:  # unique index
                idx_info = self.conn.execute(f"PRAGMA index_info({idx[1]})").fetchall()
                col_names = [
                    self.conn.execute("PRAGMA table_info(strategies)").fetchall()[c[1]][1]
                    for c in idx_info
                ]
                if col_names == ["name", "ticker"] and len(col_names) == 2:
                    needs_strategy_migration = True
                    break

        if needs_strategy_migration:
            self.conn.executescript("""
                CREATE TABLE IF NOT EXISTS strategies_new (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    ticker TEXT NOT NULL,
                    params TEXT NOT NULL DEFAULT '{}',
                    interval TEXT NOT NULL DEFAULT 'minute60',
                    enabled INTEGER NOT NULL DEFAULT 0,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    exchange TEXT NOT NULL DEFAULT 'upbit',
                    UNIQUE(name, ticker, exchange)
                );
                INSERT INTO strategies_new
                    SELECT id, name, ticker, params, interval, enabled,
                           created_at, updated_at, exchange
                    FROM strategies;
                DROP TABLE strategies;
                ALTER TABLE strategies_new RENAME TO strategies;
            """)

        self.conn.commit()

    # --- Credentials ---

    def save_credential(self, provider: str, encrypted_access_key: str, encrypted_secret_key: str):
        now = datetime.now().isoformat()
        self.conn.execute(
            """INSERT INTO credentials (provider, encrypted_access_key, encrypted_secret_key, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?)
               ON CONFLICT(provider) DO UPDATE SET
                 encrypted_access_key=excluded.encrypted_access_key,
                 encrypted_secret_key=excluded.encrypted_secret_key,
                 updated_at=excluded.updated_at""",
            (provider, encrypted_access_key, encrypted_secret_key, now, now),
        )
        self.conn.commit()

    def get_credential(self, provider: str = "upbit") -> dict | None:
        row = self.conn.execute(
            "SELECT * FROM credentials WHERE provider = ?", (provider,)
        ).fetchone()
        return dict(row) if row else None

    def delete_credential(self, provider: str = "upbit") -> bool:
        cursor = self.conn.execute("DELETE FROM credentials WHERE provider = ?", (provider,))
        self.conn.commit()
        return cursor.rowcount > 0

    # --- OHLCV ---

    def bulk_insert_ohlcv(self, ticker: str, interval: str, df: pd.DataFrame):
        rows = []
        for ts, row in df.iterrows():
            rows.append((
                ticker, interval, str(ts),
                float(row["open"]), float(row["high"]),
                float(row["low"]), float(row["close"]), float(row["volume"]),
            ))
        self.conn.executemany(
            """INSERT OR IGNORE INTO ohlcv (ticker, interval, timestamp, open, high, low, close, volume)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            rows,
        )
        self.conn.commit()

    @staticmethod
    def _normalize_date(d: str) -> str:
        """Convert YYYYMMDD to ISO format (YYYY-MM-DD). Pass through if already ISO."""
        if len(d) == 8 and d.isdigit():
            return f"{d[:4]}-{d[4:6]}-{d[6:8]}"
        return d

    def get_ohlcv(self, ticker: str, interval: str, limit: int = 200, start: str | None = None, end: str | None = None) -> pd.DataFrame:
        query = "SELECT timestamp, open, high, low, close, volume FROM ohlcv WHERE ticker = ? AND interval = ?"
        params: list = [ticker, interval]

        if start:
            query += " AND timestamp >= ?"
            params.append(self._normalize_date(start))
        if end:
            query += " AND timestamp <= ?"
            params.append(self._normalize_date(end))

        query += " ORDER BY timestamp DESC LIMIT ?"
        params.append(limit)

        rows = self.conn.execute(query, params).fetchall()
        if not rows:
            return pd.DataFrame(columns=["open", "high", "low", "close", "volume"])

        data = [dict(r) for r in rows]
        df = pd.DataFrame(data)
        df["timestamp"] = pd.to_datetime(df["timestamp"])
        df = df.set_index("timestamp").sort_index()
        return df

    def cleanup_old_ohlcv(self, retention_days: int = 90):
        cutoff = (datetime.now() - timedelta(days=retention_days)).isoformat()
        self.conn.execute(
            "DELETE FROM ohlcv WHERE interval LIKE 'minute%' AND timestamp < ?",
            (cutoff,),
        )
        self.conn.commit()

    # --- Strategies ---

    def create_strategy(self, name: str, ticker: str, params: dict, interval: str = "minute60",
                        exchange: str = "upbit") -> int:
        now = datetime.now().isoformat()
        cursor = self.conn.execute(
            """INSERT INTO strategies (name, ticker, params, interval, enabled, created_at, updated_at, exchange)
               VALUES (?, ?, ?, ?, 0, ?, ?, ?)""",
            (name, ticker, json.dumps(params), interval, now, now, exchange),
        )
        self.conn.commit()
        return cursor.lastrowid

    def get_strategy(self, strategy_id: int) -> dict | None:
        row = self.conn.execute("SELECT * FROM strategies WHERE id = ?", (strategy_id,)).fetchone()
        return dict(row) if row else None

    def get_strategies(self, enabled_only: bool = False, exchange: str | None = None) -> list[dict]:
        query = "SELECT * FROM strategies WHERE 1=1"
        params: list = []
        if enabled_only:
            query += " AND enabled = 1"
        if exchange:
            query += " AND exchange = ?"
            params.append(exchange)
        query += " ORDER BY created_at DESC"
        rows = self.conn.execute(query, params).fetchall()
        return [dict(r) for r in rows]

    def update_strategy(self, strategy_id: int, params: dict | None = None, interval: str | None = None) -> bool:
        now = datetime.now().isoformat()
        updates = ["updated_at = ?"]
        values: list = [now]

        if params is not None:
            updates.append("params = ?")
            values.append(json.dumps(params))
        if interval is not None:
            updates.append("interval = ?")
            values.append(interval)

        values.append(strategy_id)
        cursor = self.conn.execute(
            f"UPDATE strategies SET {', '.join(updates)} WHERE id = ?", values
        )
        self.conn.commit()
        return cursor.rowcount > 0

    def set_strategy_enabled(self, strategy_id: int, enabled: bool) -> bool:
        now = datetime.now().isoformat()
        cursor = self.conn.execute(
            "UPDATE strategies SET enabled = ?, updated_at = ? WHERE id = ?",
            (1 if enabled else 0, now, strategy_id),
        )
        self.conn.commit()
        return cursor.rowcount > 0

    def delete_strategy(self, strategy_id: int) -> bool:
        cursor = self.conn.execute("DELETE FROM strategies WHERE id = ?", (strategy_id,))
        self.conn.commit()
        return cursor.rowcount > 0

    # --- Orders ---

    def create_order(
        self,
        ticker: str,
        side: str,
        order_type: str,
        is_dry_run: bool = True,
        strategy_id: int | None = None,
        uuid: str | None = None,
        price: float | None = None,
        volume: float | None = None,
        amount_krw: float | None = None,
        fee: float = 0,
        signal_reason: str | None = None,
        signal_confidence: float | None = None,
        indicators: dict | None = None,
        exchange: str = "upbit",
    ) -> int:
        now = datetime.now().isoformat()
        cursor = self.conn.execute(
            """INSERT INTO orders
               (uuid, strategy_id, ticker, side, order_type, price, volume, amount_krw, fee,
                state, is_dry_run, signal_reason, signal_confidence, indicators, created_at, exchange)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?)""",
            (
                uuid, strategy_id, ticker, side, order_type, price, volume, amount_krw, fee,
                1 if is_dry_run else 0, signal_reason, signal_confidence,
                json.dumps(indicators) if indicators else None, now, exchange,
            ),
        )
        self.conn.commit()
        return cursor.lastrowid

    def update_order_state(self, order_id: int, state: str, executed_at: str | None = None):
        now = executed_at or datetime.now().isoformat()
        self.conn.execute(
            "UPDATE orders SET state = ?, executed_at = ? WHERE id = ?",
            (state, now, order_id),
        )
        self.conn.commit()

    def get_orders(self, ticker: str | None = None, limit: int = 50, offset: int = 0) -> list[dict]:
        if ticker:
            rows = self.conn.execute(
                "SELECT * FROM orders WHERE ticker = ? ORDER BY created_at DESC LIMIT ? OFFSET ?",
                (ticker, limit, offset),
            ).fetchall()
        else:
            rows = self.conn.execute(
                "SELECT * FROM orders ORDER BY created_at DESC LIMIT ? OFFSET ?",
                (limit, offset),
            ).fetchall()
        return [dict(r) for r in rows]

    # --- Positions ---

    def upsert_position(
        self,
        ticker: str,
        volume: float,
        avg_entry_price: float,
        strategy_id: int | None = None,
        current_price: float | None = None,
        exchange: str = "upbit",
        side: str = "long",
        leverage: int = 1,
    ):
        now = datetime.now().isoformat()
        unrealized_pnl = 0.0
        unrealized_pnl_pct = 0.0
        if current_price and avg_entry_price > 0:
            if side == "short":
                unrealized_pnl = (avg_entry_price - current_price) * volume
            else:
                unrealized_pnl = (current_price - avg_entry_price) * volume
            unrealized_pnl_pct = (unrealized_pnl / (avg_entry_price * volume)) * 100

        self.conn.execute(
            """INSERT INTO positions (ticker, side, volume, avg_entry_price, current_price,
                unrealized_pnl, unrealized_pnl_pct, strategy_id, opened_at, updated_at,
                exchange, leverage)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(ticker) DO UPDATE SET
                 side=excluded.side, volume=excluded.volume,
                 avg_entry_price=excluded.avg_entry_price,
                 current_price=excluded.current_price,
                 unrealized_pnl=excluded.unrealized_pnl,
                 unrealized_pnl_pct=excluded.unrealized_pnl_pct,
                 exchange=excluded.exchange, leverage=excluded.leverage,
                 updated_at=excluded.updated_at""",
            (ticker, side, volume, avg_entry_price, current_price,
             unrealized_pnl, unrealized_pnl_pct, strategy_id, now, now, exchange, leverage),
        )
        self.conn.commit()

    def get_positions(self) -> list[dict]:
        rows = self.conn.execute("SELECT * FROM positions ORDER BY opened_at DESC").fetchall()
        return [dict(r) for r in rows]

    def delete_position(self, ticker: str) -> bool:
        cursor = self.conn.execute("DELETE FROM positions WHERE ticker = ?", (ticker,))
        self.conn.commit()
        return cursor.rowcount > 0

    # --- Performance Snapshots ---

    def add_performance_snapshot(
        self,
        total_equity: float,
        cash_balance: float,
        positions_value: float,
        total_pnl: float,
        total_pnl_pct: float,
        daily_pnl: float = 0,
        max_drawdown_pct: float = 0,
        active_positions: int = 0,
        snapshot_type: str = "periodic",
    ):
        now = datetime.now().isoformat()
        self.conn.execute(
            """INSERT INTO performance_snapshots
               (timestamp, total_equity, cash_balance, positions_value,
                total_pnl, total_pnl_pct, daily_pnl, max_drawdown_pct,
                active_positions, snapshot_type)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (now, total_equity, cash_balance, positions_value,
             total_pnl, total_pnl_pct, daily_pnl, max_drawdown_pct,
             active_positions, snapshot_type),
        )
        self.conn.commit()

    def get_performance_history(self, limit: int = 100) -> list[dict]:
        rows = self.conn.execute(
            "SELECT * FROM performance_snapshots ORDER BY timestamp DESC LIMIT ?",
            (limit,),
        ).fetchall()
        return [dict(r) for r in rows]

    # --- Pipeline Evidence Logs ---

    def add_pipeline_log(
        self,
        ticker: str,
        strategy_name: str,
        signal: str,
        confidence: float | None = None,
        reason: str | None = None,
        evidences: list[dict] | None = None,
        vetoed: bool = False,
        veto_source: str | None = None,
    ):
        now = datetime.now().isoformat()
        self.conn.execute(
            """INSERT INTO pipeline_evidence_logs
               (ticker, strategy_name, signal, confidence, reason, evidences,
                vetoed, veto_source, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (ticker, strategy_name, signal, confidence, reason,
             json.dumps(evidences) if evidences else None,
             1 if vetoed else 0, veto_source, now),
        )
        self.conn.commit()

    def get_pipeline_logs(self, ticker: str | None = None, limit: int = 50) -> list[dict]:
        if ticker:
            rows = self.conn.execute(
                "SELECT * FROM pipeline_evidence_logs WHERE ticker = ? ORDER BY created_at DESC LIMIT ?",
                (ticker, limit),
            ).fetchall()
        else:
            rows = self.conn.execute(
                "SELECT * FROM pipeline_evidence_logs ORDER BY created_at DESC LIMIT ?",
                (limit,),
            ).fetchall()
        return [dict(r) for r in rows]

    # --- Signal Logs ---

    def add_signal_log(
        self,
        ticker: str,
        strategy_name: str,
        signal: str,
        confidence: float | None = None,
        reason: str | None = None,
        indicators: dict | None = None,
    ):
        now = datetime.now().isoformat()
        self.conn.execute(
            """INSERT INTO signal_logs (ticker, strategy_name, signal, confidence, reason, indicators, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (ticker, strategy_name, signal, confidence, reason,
             json.dumps(indicators) if indicators else None, now),
        )
        self.conn.commit()

    # --- Backtest Results ---

    def save_backtest_result(
        self,
        strategy_name: str,
        ticker: str,
        interval: str,
        params: dict,
        start_date: str,
        end_date: str,
        initial_capital: float,
        final_capital: float,
        total_return_pct: float,
        max_drawdown_pct: float,
        sharpe_ratio: float | None = None,
        win_rate: float | None = None,
        total_trades: int = 0,
        profit_factor: float | None = None,
        trades_json: str | None = None,
        equity_curve_json: str | None = None,
    ) -> int:
        now = datetime.now().isoformat()
        cursor = self.conn.execute(
            """INSERT INTO backtest_results
               (strategy_name, ticker, interval, params, start_date, end_date,
                initial_capital, final_capital, total_return_pct, max_drawdown_pct,
                sharpe_ratio, win_rate, total_trades, profit_factor,
                trades_json, equity_curve_json, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (strategy_name, ticker, interval, json.dumps(params), start_date, end_date,
             initial_capital, final_capital, total_return_pct, max_drawdown_pct,
             sharpe_ratio, win_rate, total_trades, profit_factor,
             trades_json, equity_curve_json, now),
        )
        self.conn.commit()
        return cursor.lastrowid

    def get_backtest_results(self, limit: int = 20, offset: int = 0) -> list[dict]:
        rows = self.conn.execute(
            "SELECT * FROM backtest_results ORDER BY created_at DESC LIMIT ? OFFSET ?",
            (limit, offset),
        ).fetchall()
        return [dict(r) for r in rows]

    def count_backtest_results(self) -> int:
        return self.conn.execute("SELECT COUNT(*) FROM backtest_results").fetchone()[0]

    def get_backtest_result(self, result_id: int) -> dict | None:
        row = self.conn.execute(
            "SELECT * FROM backtest_results WHERE id = ?", (result_id,)
        ).fetchone()
        return dict(row) if row else None

    def close(self):
        self.conn.close()
