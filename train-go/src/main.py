import asyncio
import logging
import logging.handlers
import os
from contextlib import asynccontextmanager
from pathlib import Path

import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI

from src.api.routes import router, get_db, get_crypto, get_scheduler, get_token
from src.core.config import Config
from src.core.crypto import CryptoManager
from src.core.database import Database
from src.services.notifier import CompositeNotifier, DiscordNotifier, EmailNotifier, TelegramNotifier
from src.services.scheduler import ReservationScheduler

LOG_DIR = Path("data/logs")
LOG_DIR.mkdir(parents=True, exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[
        logging.StreamHandler(),
        logging.handlers.RotatingFileHandler(
            LOG_DIR / "train-go.log", maxBytes=5_000_000, backupCount=3, encoding="utf-8"
        ),
    ],
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    config = app.state.config
    db = Database(config.db_path)
    crypto = CryptoManager(config.encryption_key)

    # 알림 채널 설정 (텔레그램 + Discord + Email)
    notifiers = [TelegramNotifier(config.telegram_bot_token, config.telegram_chat_id)]
    if config.discord_webhook_url:
        notifiers.append(DiscordNotifier(config.discord_webhook_url))
        logger.info("Discord 웹훅 알림 활성화")
    if config.smtp_host and config.smtp_user and config.smtp_password:
        notifiers.append(EmailNotifier(
            smtp_host=config.smtp_host,
            smtp_port=config.smtp_port,
            smtp_user=config.smtp_user,
            smtp_password=config.smtp_password,
            smtp_from=config.smtp_from,
            smtp_to=config.smtp_to,
        ))
        logger.info("이메일 알림 활성화")
    notifier = CompositeNotifier(notifiers) if len(notifiers) > 1 else notifiers[0]

    scheduler = ReservationScheduler(
        db=db,
        crypto=crypto,
        notifier=notifier,
        search_interval_min=config.search_interval_min,
        search_interval_max=config.search_interval_max,
        max_duration_hours=config.max_search_duration_hours,
        progress_report_minutes=config.progress_report_minutes,
    )

    # 의존성 오버라이드
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_crypto] = lambda: crypto
    app.dependency_overrides[get_scheduler] = lambda: scheduler
    app.dependency_overrides[get_token] = lambda: config.api_token

    # pending 예약 복원
    await scheduler.restore_pending()

    # 오래된 검색 로그 정리
    cleanup_count = db.cleanup_old_logs()
    if cleanup_count > 0:
        logger.info(f"시작 시 search_logs 정리: {cleanup_count}개 삭제")

    logger.info(f"train-go 서버 시작 (http://{config.host}:{config.port})")

    yield

    # Shutdown — 태스크를 먼저 취소하고 완료될 때까지 대기한 뒤 DB 닫기
    tasks = []
    for rid in list(scheduler.get_active_ids()):
        task = scheduler.stop_search(rid)
        if task:
            tasks.append(task)
    if tasks:
        await asyncio.gather(*tasks, return_exceptions=True)
    db.close()
    logger.info("train-go 서버 종료")


def create_app() -> FastAPI:
    load_dotenv()
    config = Config.from_env()
    Path(config.db_path).parent.mkdir(parents=True, exist_ok=True)

    app = FastAPI(title="train-go", version="0.1.0", lifespan=lifespan)
    app.state.config = config
    app.include_router(router)
    return app


def main():
    app = create_app()
    uvicorn.run(app, host=app.state.config.host, port=app.state.config.port)


if __name__ == "__main__":
    main()
