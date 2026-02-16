import asyncio
import logging
import os
import time

import httpx

from src.core.config import Config
from src.core.database import Database
from src.services.health_checker import check_all_services

logger = logging.getLogger(__name__)

COLLECT_INTERVAL = 30  # seconds
CLEANUP_INTERVAL = 3600  # 1 hour


class MetricsCollector:
    def __init__(self, config: Config, db: Database):
        self.config = config
        self.db = db
        self._task: asyncio.Task | None = None
        self._cleanup_task: asyncio.Task | None = None
        self._previous_status: dict[str, str] = {}
        self._telegram_bot_token = os.environ.get("TELEGRAM_BOT_TOKEN", "")
        self._telegram_chat_id = os.environ.get("TELEGRAM_CHAT_ID", "")

    async def start(self):
        # Load initial status to avoid false alerts on startup
        try:
            results = await check_all_services(self.config.services)
            for r in results:
                self._previous_status[r["name"]] = r["status"]
        except Exception as e:
            logger.warning(f"Failed to load initial status: {e}")

        self._task = asyncio.create_task(self._collect_loop())
        self._cleanup_task = asyncio.create_task(self._cleanup_loop())
        logger.info("MetricsCollector started")

    async def stop(self):
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        if self._cleanup_task:
            self._cleanup_task.cancel()
            try:
                await self._cleanup_task
            except asyncio.CancelledError:
                pass
        logger.info("MetricsCollector stopped")

    async def _collect_loop(self):
        while True:
            try:
                await asyncio.sleep(COLLECT_INTERVAL)
                await self._collect()
            except asyncio.CancelledError:
                raise
            except Exception as e:
                logger.error(f"MetricsCollector error: {e}")
                await asyncio.sleep(COLLECT_INTERVAL)

    async def _cleanup_loop(self):
        while True:
            try:
                await asyncio.sleep(CLEANUP_INTERVAL)
                self.db.cleanup_old_metrics()
                logger.debug("Old metrics cleaned up")
            except asyncio.CancelledError:
                raise
            except Exception as e:
                logger.error(f"Metrics cleanup error: {e}")

    async def _collect(self):
        start = time.monotonic()
        results = await check_all_services(self.config.services)
        elapsed = time.monotonic() - start
        logger.debug(f"Health check completed in {elapsed:.2f}s")

        for r in results:
            name = r["name"]
            status = r["status"]
            response_time = round(elapsed * 1000, 2)  # overall check time as fallback

            self.db.insert_metric(name, status, response_time)

            # Detect running → down transition
            prev = self._previous_status.get(name)
            if prev == "running" and status == "down":
                await self._send_down_alert(r)
            elif prev == "down" and status == "running":
                await self._send_recovery_alert(r)

            self._previous_status[name] = status

    async def _send_down_alert(self, service: dict):
        if not self._telegram_bot_token or not self._telegram_chat_id:
            logger.warning("Telegram credentials not configured, skipping alert")
            return

        text = (
            f"🔴 *서비스 다운 감지*\n\n"
            f"**{service['display_name']}** (`{service['name']}`)\n"
            f"상태: running → down\n"
            f"시각: {service['checked_at']}"
        )
        await self._send_telegram(text)

    async def _send_recovery_alert(self, service: dict):
        if not self._telegram_bot_token or not self._telegram_chat_id:
            return

        text = (
            f"🟢 *서비스 복구*\n\n"
            f"**{service['display_name']}** (`{service['name']}`)\n"
            f"상태: down → running\n"
            f"시각: {service['checked_at']}"
        )
        await self._send_telegram(text)

    async def _send_telegram(self, text: str):
        url = f"https://api.telegram.org/bot{self._telegram_bot_token}/sendMessage"
        payload = {
            "chat_id": self._telegram_chat_id,
            "text": text,
            "parse_mode": "Markdown",
        }
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.post(url, json=payload, timeout=10.0)
                if resp.status_code != 200:
                    logger.error(f"Telegram send failed: {resp.status_code} {resp.text}")
        except Exception as e:
            logger.error(f"Telegram send error: {e}")
