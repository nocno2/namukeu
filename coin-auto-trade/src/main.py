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
from src.agent.cycle import CycleOrchestrator
from src.agent.telegram import TelegramReporter
from src.services.collector import DataCollector
from src.services.exchange_factory import create_exchange
from src.services.notifier import TelegramNotifier
from src.services.portfolio import PortfolioTracker
from src.services.risk_manager import RiskLimits, RiskManager
from src.services.scheduler import TradingScheduler

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
            partial_profit_take_pct=config.partial_profit_take_pct,
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
        # 전략 시스템 제거됨 — 에이전트 시스템으로 대체 예정
        # await scheduler.restore_enabled()
        scheduler.start_snapshot_loop(interval_minutes=10)
        scheduler.start_transition_check_loop(hour=9, minute=0)

    # Start data collectors for active tickers per exchange
    for provider, collector in runtime.collectors.items():
        strategies = db.get_strategies(enabled_only=True, exchange=provider)
        for s in strategies:
            collector.add_ticker(s["ticker"])
        if strategies:
            collector.start()

    # 에이전트 시스템 초기화
    runtime.agent_db = db
    upbit_exchange = runtime.exchanges.get("upbit")
    if upbit_exchange:
        telegram_reporter = TelegramReporter(notifier, db)
        orchestrator = CycleOrchestrator(config, db, upbit_exchange, telegram_reporter)
        runtime.cycle_orchestrator = orchestrator

        # 에이전트 사이클 스케줄러 시작
        _start_agent_scheduler(config, orchestrator)

        # 일일/주간 보고서 스케줄러 시작
        _start_report_scheduler(config, orchestrator.agent_runner, db,
                                orchestrator.context_builder, telegram_reporter)
        logger.info(f"에이전트 시스템 초기화 완료 (사이클: {config.agent_cycle_hours}시)")
    else:
        logger.warning("Upbit 거래소 없음 — 에이전트 시스템 미초기화")

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
    runtime.cycle_orchestrator = None
    runtime.agent_db = None
    logger.info("coin-auto-trade 서버 종료")


def _start_report_scheduler(
    config: Config, runner, db: Database,
    context_builder, telegram_reporter: TelegramReporter,
):
    """일일/주간 보고서를 자동 발송하는 스케줄러."""
    import datetime as dt
    from src.agent.reporter import generate_daily_report, generate_weekly_report

    async def _daily_loop():
        while True:
            now = dt.datetime.now()
            target = now.replace(hour=config.report_daily_hour, minute=0, second=0, microsecond=0)
            if target <= now:
                target += dt.timedelta(days=1)
            await asyncio.sleep((target - now).total_seconds())
            try:
                text = await generate_daily_report(runner, db, context_builder)
                if text:
                    await telegram_reporter.send_daily_report(text)
            except Exception as e:
                logger.error(f"일일 리포트 생성 실패: {e}")

    async def _weekly_loop():
        while True:
            now = dt.datetime.now()
            days_ahead = config.report_weekly_day - now.isoweekday()
            if days_ahead < 0 or (days_ahead == 0 and now.hour >= config.report_weekly_hour):
                days_ahead += 7
            target = (now + dt.timedelta(days=days_ahead)).replace(
                hour=config.report_weekly_hour, minute=0, second=0, microsecond=0
            )
            await asyncio.sleep((target - now).total_seconds())
            try:
                text = await generate_weekly_report(runner, db, context_builder)
                if text:
                    await telegram_reporter.send_weekly_report(text)
            except Exception as e:
                logger.error(f"주간 리포트 생성 실패: {e}")

    asyncio.create_task(_daily_loop())
    asyncio.create_task(_weekly_loop())
    logger.info(f"보고서 스케줄러: 일일 {config.report_daily_hour}시, 주간 {config.report_weekly_day}요일 {config.report_weekly_hour}시")


def _start_agent_scheduler(config: Config, orchestrator: CycleOrchestrator):
    """매시간 랜덤한 분에 에이전트 사이클을 자동 실행한다."""
    import datetime as dt
    import random

    async def _scheduler_loop():
        while True:
            now = dt.datetime.now()
            
            # 다음 정각 시간 계산
            next_hour_start = (now + dt.timedelta(hours=1)).replace(minute=0, second=0, microsecond=0)
            
            # 다음 시간 내의 랜덤한 분(Minute) 선택
            random_minute = random.randint(0, 59)
            next_run = next_hour_start.replace(minute=random_minute)
            
            wait_seconds = (next_run - now).total_seconds()
            logger.info(f"다음 에이전트 사이클 예약: {next_run.strftime('%H:%M')} (랜덤 {random_minute}분 선택, {wait_seconds / 60:.1f}분 후)")
            
            await asyncio.sleep(wait_seconds)

            if not orchestrator.is_running:
                logger.info(f"에이전트 사이클 자동 시작 ({next_run.strftime('%H:%M')})")
                try:
                    await orchestrator.run_cycle()
                except Exception as e:
                    logger.error(f"에이전트 사이클 실패: {e}")
            else:
                logger.info("이미 사이클 실행 중, 스킵")

    asyncio.create_task(_scheduler_loop())


def create_app() -> FastAPI:
    load_dotenv()
    config = Config.from_env()
    Path(config.db_path).parent.mkdir(parents=True, exist_ok=True)

    app = FastAPI(title="coin-auto-trade", version="0.2.0", lifespan=lifespan)
    app.state.config = config

    from src.api.routes_agent import router as agent_router

    app.include_router(system_router)
    app.include_router(trading_router)
    app.include_router(strategy_router)
    app.include_router(backtest_router)
    app.include_router(dashboard_router)
    app.include_router(agent_router)

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
