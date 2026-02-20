import asyncio
import logging
import os
import subprocess

import httpx

from src.core.config import Config
from src.core.database import Database
from src.services.health_checker import check_all_services

logger = logging.getLogger(__name__)

COLLECT_INTERVAL = 30  # seconds
CLEANUP_INTERVAL = 3600  # 1 hour
DOWN_THRESHOLD = 3  # consecutive downs before auto-restart


class MetricsCollector:
    def __init__(self, config: Config, db: Database):
        self.config = config
        self.db = db
        self._task: asyncio.Task | None = None
        self._cleanup_task: asyncio.Task | None = None
        self._previous_status: dict[str, str] = {}
        self._down_counts: dict[str, int] = {}  # consecutive down count
        self._active_incidents: dict[str, int] = {}  # service_name -> incident_id
        self._recovery_attempts: dict[str, int] = {}  # service_name -> attempt count
        self._telegram_bot_token = os.environ.get("TELEGRAM_BOT_TOKEN", "")
        self._telegram_chat_id = os.environ.get("TELEGRAM_CHAT_ID", "")
        self._discord_webhook_url = os.environ.get("DISCORD_WEBHOOK_URL", "")

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
        results = await check_all_services(self.config.services)
        logger.debug(f"Health check completed for {len(results)} services")

        for r in results:
            name = r["name"]
            status = r["status"]
            # Use individual service latency from health_checker, not total elapsed time
            response_time = r.get("latency_ms")

            try:
                self.db.insert_metric(name, status, response_time)
            except Exception as e:
                logger.error(f"Failed to insert metric for {name}: {e}")

            prev = self._previous_status.get(name)

            if status == "down":
                self._down_counts[name] = self._down_counts.get(name, 0) + 1

                # First transition to down: create incident + alert
                if prev == "running":
                    incident_id = self.db.insert_incident(name)
                    self._active_incidents[name] = incident_id
                    self._recovery_attempts[name] = 0
                    await self._send_down_alert(r)

                # Consecutive downs hit threshold: attempt auto-restart (once)
                if self._down_counts[name] == DOWN_THRESHOLD:
                    await self._attempt_auto_restart(r)

            elif status == "running":
                was_down = self._down_counts.get(name, 0) > 0

                if was_down and name in self._active_incidents:
                    # Resolve incident
                    auto_recovered = self._recovery_attempts.get(name, 0) > 0
                    self.db.resolve_incident(
                        self._active_incidents[name],
                        auto_recovered=auto_recovered,
                        recovery_attempts=self._recovery_attempts.get(name, 0),
                    )
                    del self._active_incidents[name]
                    await self._send_recovery_alert(r, auto_recovered)

                self._down_counts[name] = 0
                self._recovery_attempts.pop(name, None)

            self._previous_status[name] = status

    def _get_service_def(self, name: str):
        return next((s for s in self.config.services if s.name == name), None)

    async def _attempt_auto_restart(self, service: dict):
        name = service["name"]
        svc_def = self._get_service_def(name)

        if not svc_def or not svc_def.launchd_label or svc_def.type == "self":
            logger.info(f"Cannot auto-restart {name}: no launchd_label or is self")
            return

        # Only attempt once per incident
        if self._recovery_attempts.get(name, 0) > 0:
            return

        self._recovery_attempts[name] = 1
        logger.info(f"Auto-restart attempt for {name} ({svc_def.launchd_label})")

        try:
            subprocess.run(
                ["launchctl", "stop", svc_def.launchd_label],
                capture_output=True, text=True, timeout=10,
            )
            subprocess.run(
                ["launchctl", "start", svc_def.launchd_label],
                capture_output=True, text=True, timeout=10,
            )
            success = True
        except Exception as e:
            logger.error(f"Auto-restart failed for {name}: {e}")
            success = False

        await self._send_restart_alert(service, success)

    async def _send_down_alert(self, service: dict):
        if not self._telegram_bot_token or not self._telegram_chat_id:
            logger.warning("Telegram credentials not configured, skipping Telegram alert")
            # Continue to send Discord alert if available

        text = (
            f"🔴 *서비스 다운 감지*\n\n"
            f"*{service['display_name']}* (`{service['name']}`)\n"
            f"상태: running → down\n"
            f"시각: {service['checked_at']}"
        )
        if self._telegram_bot_token and self._telegram_chat_id:
            await self._send_telegram(text)
        await self._send_discord(text, 0xFF0000)  # Red

    async def _send_recovery_alert(self, service: dict, auto_recovered: bool = False):
        if not self._telegram_bot_token and not self._telegram_chat_id:
            logger.warning("Telegram credentials not configured, skipping recovery alert")

        recovery_note = " (자동 복구)" if auto_recovered else ""
        text = (
            f"🟢 *서비스 복구{recovery_note}*\n\n"
            f"*{service['display_name']}* (`{service['name']}`)\n"
            f"상태: down → running\n"
            f"시각: {service['checked_at']}"
        )
        if self._telegram_bot_token and self._telegram_chat_id:
            await self._send_telegram(text)
        await self._send_discord(text, 0x00FF00)  # Green

    async def _send_restart_alert(self, service: dict, success: bool):
        if not self._telegram_bot_token and not self._telegram_chat_id:
            logger.warning("Telegram credentials not configured, skipping restart alert")

        emoji = "🔄" if success else "❌"
        result = "자동 재시작 시도" if success else "자동 재시작 실패"
        text = (
            f"{emoji} *{result}*\n\n"
            f"*{service['display_name']}* (`{service['name']}`)\n"
            f"연속 {DOWN_THRESHOLD}회 다운 감지 → 자동 복구 시도\n"
            f"시각: {service['checked_at']}"
        )
        if self._telegram_bot_token and self._telegram_chat_id:
            await self._send_telegram(text)
        await self._send_discord(text, 0xFFA500 if success else 0xFF0000)  # Orange or Red

    async def _send_telegram(self, text: str):
        if not self._telegram_bot_token or not self._telegram_chat_id:
            return
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

    async def _send_discord(self, content: str, color: int = 0):
        if not self._discord_webhook_url:
            return
        payload = {"content": content}
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.post(self._discord_webhook_url, json=payload, timeout=10.0)
                if resp.status_code not in (200, 204):
                    logger.error(f"Discord send failed: {resp.status_code} {resp.text}")
        except Exception as e:
            logger.error(f"Discord send error: {e}")
