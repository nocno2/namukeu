import os
from dataclasses import dataclass, field


@dataclass
class Config:
    api_token: str
    encryption_key: str
    telegram_bot_token: str
    telegram_chat_id: str
    host: str = "127.0.0.1"
    port: int = 8001
    dry_run: bool = True
    trading_interval_seconds: int = 60
    max_positions: int = 5
    max_loss_percent: float = 5.0
    default_order_percent: float = 10.0
    ohlcv_collect_interval_minutes: int = 5
    ohlcv_retention_days: int = 90
    db_path: str = "data/coin-auto-trade.db"
    active_exchanges: list[str] = field(default_factory=lambda: ["upbit"])
    trailing_stop_pct: float | None = 3.0  # trailing stop: close when price drops this % from peak
    futures_leverage: int = 20
    futures_margin_type: str = "ISOLATED"

    @classmethod
    def from_env(cls) -> "Config":
        return cls(
            api_token=os.environ["API_TOKEN"],
            encryption_key=os.environ["ENCRYPTION_KEY"],
            telegram_bot_token=os.environ.get("TELEGRAM_BOT_TOKEN", ""),
            telegram_chat_id=os.environ.get("TELEGRAM_CHAT_ID", ""),
            host=os.environ.get("HOST", "127.0.0.1"),
            port=int(os.environ.get("PORT", "8001")),
            dry_run=os.environ.get("DRY_RUN", "true").lower() == "true",
            trading_interval_seconds=int(os.environ.get("TRADING_INTERVAL_SECONDS", "60")),
            max_positions=int(os.environ.get("MAX_POSITIONS", "5")),
            max_loss_percent=float(os.environ.get("MAX_LOSS_PERCENT", "5.0")),
            default_order_percent=float(os.environ.get("DEFAULT_ORDER_PERCENT", "10.0")),
            ohlcv_collect_interval_minutes=int(os.environ.get("OHLCV_COLLECT_INTERVAL_MINUTES", "5")),
            ohlcv_retention_days=int(os.environ.get("OHLCV_RETENTION_DAYS", "90")),
            active_exchanges=[
                e.strip() for e in os.environ.get("ACTIVE_EXCHANGES", "upbit").split(",") if e.strip()
            ],
            trailing_stop_pct=float(v) if (v := os.environ.get("TRAILING_STOP_PCT")) else 3.0,
            futures_leverage=int(os.environ.get("FUTURES_LEVERAGE", "20")),
            futures_margin_type=os.environ.get("FUTURES_MARGIN_TYPE", "ISOLATED"),
        )
