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
    trading_interval_seconds: int = 30
    max_positions: int = 5
    max_loss_percent: float = 5.0
    default_order_percent: float = 10.0
    ohlcv_collect_interval_minutes: int = 5
    ohlcv_retention_days: int = 90
    db_path: str = "data/coin-auto-trade.db"
    active_exchanges: list[str] = field(default_factory=lambda: ["upbit"])
    trailing_stop_pct: float | None = 3.0  # trailing stop: close when price drops this % from peak
    partial_profit_take_pct: float | None = 2.0  # partial profit taking (예: 2% 수익에서 50% 청산)
    futures_leverage: int = 20
    futures_margin_type: str = "ISOLATED"

    # LLM 에이전트 설정
    gemini_api_key: str = ""
    researcher_model: str = "gemini-3.1-flash-lite-preview"
    technician_model: str = "gemini-3.1-flash-lite-preview"
    strategist_model: str = "gemini-3.1-flash-lite-preview"
    risk_manager_model: str = "gemini-3.1-flash-lite-preview"
    reporter_model: str = "gemini-3.1-flash-lite-preview"
    agent_cycle_hours: list[int] = field(default_factory=lambda: [6, 10, 14, 18, 22])
    agent_scan_top_n: int = 20
    agent_cycle_timeout: int = 300
    agent_max_positions: int = 5
    agent_max_position_pct: float = 20.0
    agent_min_cash_ratio: float = 30.0
    agent_max_daily_loss_pct: float = 3.0
    agent_max_total_loss_pct: float = 5.0
    agent_max_trades_per_day: int = 10
    agent_stop_loss_pct: float = 5.0

    # 보고서 설정
    report_daily_hour: int = 21
    report_weekly_day: int = 1  # 1=월요일
    report_weekly_hour: int = 9

    @classmethod
    def from_env(cls) -> "Config":
        cycle_hours_str = os.environ.get("AGENT_CYCLE_HOURS", "6,10,14,18,22")
        cycle_hours = [int(h.strip()) for h in cycle_hours_str.split(",") if h.strip()]

        return cls(
            api_token=os.environ["API_TOKEN"],
            encryption_key=os.environ["ENCRYPTION_KEY"],
            telegram_bot_token=os.environ.get("TELEGRAM_BOT_TOKEN", ""),
            telegram_chat_id=os.environ.get("TELEGRAM_CHAT_ID", ""),
            host=os.environ.get("HOST", "127.0.0.1"),
            port=int(os.environ.get("PORT", "8001")),
            dry_run=os.environ.get("DRY_RUN", "true").lower() == "true",
            trading_interval_seconds=int(os.environ.get("TRADING_INTERVAL_SECONDS", "30")),
            max_positions=int(os.environ.get("MAX_POSITIONS", "5")),
            max_loss_percent=float(os.environ.get("MAX_LOSS_PERCENT", "5.0")),
            default_order_percent=float(os.environ.get("DEFAULT_ORDER_PERCENT", "10.0")),
            ohlcv_collect_interval_minutes=int(os.environ.get("OHLCV_COLLECT_INTERVAL_MINUTES", "5")),
            ohlcv_retention_days=int(os.environ.get("OHLCV_RETENTION_DAYS", "90")),
            active_exchanges=[
                e.strip() for e in os.environ.get("ACTIVE_EXCHANGES", "upbit").split(",") if e.strip()
            ],
            trailing_stop_pct=float(v) if (v := os.environ.get("TRAILING_STOP_PCT")) else 3.0,
            partial_profit_take_pct=float(v) if (v := os.environ.get("PARTIAL_PROFIT_TAKE_PCT")) else 2.0,
            futures_leverage=int(os.environ.get("FUTURES_LEVERAGE", "20")),
            futures_margin_type=os.environ.get("FUTURES_MARGIN_TYPE", "ISOLATED"),
            # LLM 에이전트
            gemini_api_key=os.environ.get("GEMINI_API_KEY", ""),
            researcher_model=os.environ.get("RESEARCHER_MODEL", "gemini-3.1-flash-lite-preview"),
            technician_model=os.environ.get("TECHNICIAN_MODEL", "gemini-3.1-flash-lite-preview"),
            strategist_model=os.environ.get("STRATEGIST_MODEL", "gemini-3.1-pro-preview"),
            risk_manager_model=os.environ.get("RISK_MANAGER_MODEL", "gemini-3.1-pro-preview"),
            reporter_model=os.environ.get("REPORTER_MODEL", "gemini-3.1-flash-lite-preview"),
            agent_cycle_hours=cycle_hours,
            agent_scan_top_n=int(os.environ.get("AGENT_SCAN_TOP_N", "20")),
            agent_cycle_timeout=int(os.environ.get("AGENT_CYCLE_TIMEOUT", "300")),
            agent_max_positions=int(os.environ.get("AGENT_MAX_POSITIONS", "5")),
            agent_max_position_pct=float(os.environ.get("AGENT_MAX_POSITION_PCT", "20")),
            agent_min_cash_ratio=float(os.environ.get("AGENT_MIN_CASH_RATIO", "30")),
            agent_max_daily_loss_pct=float(os.environ.get("AGENT_MAX_DAILY_LOSS_PCT", "3")),
            agent_max_total_loss_pct=float(os.environ.get("AGENT_MAX_TOTAL_LOSS_PCT", "5")),
            agent_max_trades_per_day=int(os.environ.get("AGENT_MAX_TRADES_PER_DAY", "10")),
            agent_stop_loss_pct=float(os.environ.get("AGENT_STOP_LOSS_PCT", "5")),
            report_daily_hour=int(os.environ.get("REPORT_DAILY_HOUR", "21")),
            report_weekly_day=int(os.environ.get("REPORT_WEEKLY_DAY", "1")),
            report_weekly_hour=int(os.environ.get("REPORT_WEEKLY_HOUR", "9")),
        )
