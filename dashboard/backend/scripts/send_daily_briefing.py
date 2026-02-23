#!/usr/bin/env python3
"""일일 브리핑 발송 스크립트 (crontab용)"""
import asyncio
import logging
import sys
from pathlib import Path

# 프로젝트 루트를 sys.path에 추가
sys.path.insert(0, str(Path(__file__).parent.parent))

from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")

from src.core.config import Config
from src.core.database import Database
from src.services.daily_briefing import (
    collect_briefing_data,
    format_briefing_message,
    send_telegram,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("daily_briefing")


async def main():
    config = Config.from_env()
    db = Database(config.db_path)

    try:
        data = await collect_briefing_data(config, db)
        message = format_briefing_message(data)
        success = await send_telegram(message)

        if success:
            logger.info("일일 브리핑 발송 완료")
        else:
            logger.error("일일 브리핑 발송 실패")
            sys.exit(1)
    finally:
        db.close()


if __name__ == "__main__":
    asyncio.run(main())
