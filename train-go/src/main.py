import logging
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
from src.services.notifier import TelegramNotifier
from src.services.scheduler import ReservationScheduler

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    config = app.state.config
    db = Database(config.db_path)
    crypto = CryptoManager(config.encryption_key)
    notifier = TelegramNotifier(config.telegram_bot_token, config.telegram_chat_id)
    scheduler = ReservationScheduler(
        db=db,
        crypto=crypto,
        notifier=notifier,
        search_interval=config.search_interval_seconds,
        max_duration_hours=config.max_search_duration_hours,
    )

    # 의존성 오버라이드
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_crypto] = lambda: crypto
    app.dependency_overrides[get_scheduler] = lambda: scheduler
    app.dependency_overrides[get_token] = lambda: config.api_token

    # pending 예약 복원
    await scheduler.restore_pending()
    logger.info(f"train-go 서버 시작 (http://{config.host}:{config.port})")

    yield

    # Shutdown
    for rid in list(scheduler.get_active_ids()):
        scheduler.stop_search(rid)
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
