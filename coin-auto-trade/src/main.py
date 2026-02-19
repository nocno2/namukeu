import asyncio
import logging
import logging.handlers
from contextlib import asynccontextmanager
from pathlib import Path

import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from src.api.auth import get_token
from src.api.routes_backtest import router as backtest_router
from src.api.routes_backtest import get_db as backtest_get_db
from src.api.routes_dashboard import router as dashboard_router
from src.api.routes_dashboard import get_db as dashboard_get_db, get_config as dashboard_get_config
from src.api.routes_strategy import router as strategy_router
from src.api.routes_strategy import get_db as strategy_get_db
from src.api.routes_system import router as system_router
from src.api.routes_system import get_db as system_get_db, get_config as system_get_config
from src.api.routes_trading import router as trading_router
from src.api.routes_trading import get_db as trading_get_db, get_crypto as trading_get_crypto
from src.core.config import Config
from src.core.crypto import CryptoManager
from src.core.database import Database
from src.core import runtime
from src.services.collector import DataCollector
from src.services.exchange_factory import create_exchange
from src.services.notifier import TelegramNotifier
from src.services.portfolio import PortfolioTracker
from src.services.risk_manager import RiskLimits, RiskManager
from src.services.scheduler import TradingScheduler

# Import strategies to trigger registration
import src.strategies.rsi_strategy  # noqa: F401
import src.strategies.macd_strategy  # noqa: F401
import src.strategies.bollinger_strategy  # noqa: F401
import src.strategies.combined_strategy  # noqa: F401
import src.strategies.combined_v2_strategy  # noqa: F401
import src.strategies.trend_strategy  # noqa: F401
import src.strategies.supertrend_strategy  # noqa: F401
import src.strategies.ema_crossover_volume_strategy  # noqa: F401
import src.strategies.rsi_ma_choice_strategy  # noqa: F401

# Import pipeline providers to trigger registration
import src.pipeline.providers.market_regime  # noqa: F401
import src.pipeline.providers.volume_profile  # noqa: F401
import src.pipeline.providers.fear_greed  # noqa: F401

LOG_DIR = Path("data/logs")
LOG_DIR.mkdir(parents=True, exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[
        logging.StreamHandler(),
        logging.handlers.RotatingFileHandler(
            LOG_DIR / "coin-auto-trade.log", maxBytes=5_000_000, backupCount=3, encoding="utf-8"
        ),
    ],
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    config = app.state.config
    runtime.config = config

    # Initialize core
    db = Database(config.db_path)
    crypto = CryptoManager(config.encryption_key)
    notifier = TelegramNotifier(config.telegram_bot_token, config.telegram_chat_id)

    # Initialize exchanges for all providers with credentials
    for provider in config.active_exchanges:
        cred = db.get_credential(provider)
        # Fallback: binance_futures reuses binance credentials
        if not cred and provider == "binance_futures":
            cred = db.get_credential("binance")
        if not cred:
            logger.info(f"{provider}: 자격증명 없음, 건너뜀")
            continue

        try:
            access_key = crypto.decrypt(cred["encrypted_access_key"])
            secret_key = crypto.decrypt(cred["encrypted_secret_key"])
            kwargs = {}
            if provider == "binance_futures":
                kwargs["default_leverage"] = config.futures_leverage
                kwargs["margin_type"] = config.futures_margin_type
            exc = create_exchange(provider, access_key, secret_key, dry_run=config.dry_run, **kwargs)
            runtime.exchanges[provider] = exc
            logger.info(f"{provider}: 거래소 초기화 완료")
        except Exception as e:
            logger.error(f"{provider}: 거래소 초기화 실패 — {e}")
            continue

    # Backward compat: set first available exchange
    if runtime.exchanges:
        runtime.exchange = next(iter(runtime.exchanges.values()))

    # Initialize per-exchange services
    for provider, exc in runtime.exchanges.items():
        risk_manager = RiskManager(db, RiskLimits(
            max_positions=config.max_positions,
            max_total_loss_pct=config.max_loss_percent,
            min_order_value=exc.info.min_order_value,
            trailing_stop_pct=config.trailing_stop_pct,
        ))
        logger.info(f"{provider}: trailing_stop_pct={config.trailing_stop_pct}")
        portfolio = PortfolioTracker(db, exc)
        collector = DataCollector(db, exc, config.ohlcv_collect_interval_minutes)
        runtime.collectors[provider] = collector

        # Set initial equity for risk limit checks
        try:
            balance = await exc.get_balance()
            if balance is not None:
                risk_manager.set_initial_equity(balance)
                logger.info(f"{provider}: 초기 자산 설정 완료 ({balance:,.2f})")
        except Exception as e:
            logger.warning(f"{provider}: 초기 자산 조회 실패 — {e}")

        scheduler = TradingScheduler(
            db=db, exchange=exc, risk_manager=risk_manager,
            portfolio=portfolio, notifier=notifier,
            trading_interval=config.trading_interval_seconds,
        )
        runtime.schedulers[provider] = scheduler

    # Backward compat
    runtime.scheduler = runtime.schedulers.get(config.active_exchanges[0]) if config.active_exchanges else None
    runtime.collector = runtime.collectors.get(config.active_exchanges[0]) if config.active_exchanges else None

    from src.services.backtester import Backtester
    backtester = Backtester(db)
    runtime.backtester = backtester

    # Dependency overrides
    app.dependency_overrides[get_token] = lambda: config.api_token
    app.dependency_overrides[system_get_db] = lambda: db
    app.dependency_overrides[system_get_config] = lambda: config
    app.dependency_overrides[trading_get_db] = lambda: db
    app.dependency_overrides[trading_get_crypto] = lambda: crypto
    app.dependency_overrides[strategy_get_db] = lambda: db
    app.dependency_overrides[backtest_get_db] = lambda: db
    app.dependency_overrides[dashboard_get_db] = lambda: db
    app.dependency_overrides[dashboard_get_config] = lambda: config

    # Restore enabled strategies per exchange & start snapshot loops
    for provider, scheduler in runtime.schedulers.items():
        await scheduler.restore_enabled()
        scheduler.start_snapshot_loop(interval_minutes=10)
        scheduler.start_transition_check_loop(hour=9, minute=0)  # 매일早上 9시 전환 체크

    # Start data collectors for active tickers per exchange
    for provider, collector in runtime.collectors.items():
        strategies = db.get_strategies(enabled_only=True, exchange=provider)
        for s in strategies:
            collector.add_ticker(s["ticker"])
        if strategies:
            collector.start()

    exchanges_str = ", ".join(runtime.exchanges.keys()) or "없음"
    logger.info(
        f"coin-auto-trade 서버 시작 (http://{config.host}:{config.port}) "
        f"[{'DRY-RUN' if config.dry_run else 'LIVE'}] "
        f"거래소: [{exchanges_str}]"
    )

    yield

    # Shutdown
    for scheduler in runtime.schedulers.values():
        await scheduler.stop_all()
    for collector in runtime.collectors.values():
        collector.stop()
    db.close()

    runtime.config = None
    runtime.exchanges.clear()
    runtime.schedulers.clear()
    runtime.collectors.clear()
    runtime.exchange = None
    runtime.scheduler = None
    runtime.collector = None
    runtime.backtester = None
    logger.info("coin-auto-trade 서버 종료")


def create_app() -> FastAPI:
    load_dotenv()
    config = Config.from_env()
    Path(config.db_path).parent.mkdir(parents=True, exist_ok=True)

    app = FastAPI(title="coin-auto-trade", version="0.2.0", lifespan=lifespan)
    app.state.config = config

    app.include_router(system_router)
    app.include_router(trading_router)
    app.include_router(strategy_router)
    app.include_router(backtest_router)
    app.include_router(dashboard_router)

    # Static files for dashboard
    static_dir = Path(__file__).parent / "dashboard" / "static"
    if static_dir.exists():
        app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")

    return app


def main():
    app = create_app()
    uvicorn.run(app, host=app.state.config.host, port=app.state.config.port)


if __name__ == "__main__":
    main()
