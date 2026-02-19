import asyncio
import json
import logging
import time
from collections.abc import Callable, Coroutine
from typing import Any

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from src.db.connection import Database

logger = logging.getLogger(__name__)


class SchedulerEngine:
    def __init__(self, db: Database):
        self.db = db
        self._scheduler = AsyncIOScheduler(timezone="Asia/Seoul")
        self._handlers: dict[str, Callable[..., Coroutine[Any, Any, Any]]] = {}

    def register_handler(self, name: str, handler: Callable[..., Coroutine[Any, Any, Any]]):
        self._handlers[name] = handler
        logger.info(f"[scheduler] Registered handler: {name}")

    async def start(self):
        tasks = self.db.get_enabled_tasks()
        for task in tasks:
            self._add_job(task)
        self._scheduler.start()
        logger.info(f"[scheduler] Started with {len(tasks)} task(s)")

    async def stop(self):
        self._scheduler.shutdown(wait=False)
        logger.info("[scheduler] Stopped")

    def _add_job(self, task: dict):
        if not task.get("cron_expr"):
            return
        try:
            trigger = CronTrigger.from_crontab(task["cron_expr"], timezone="Asia/Seoul")
            self._scheduler.add_job(
                self._execute_task,
                trigger,
                args=[task["id"]],
                id=task["id"],
                replace_existing=True,
                misfire_grace_time=60,
                max_instances=1,
                coalesce=True,
            )
            logger.info(f"[scheduler] Job added: {task['name']} ({task['cron_expr']})")
        except Exception as e:
            logger.error(f"[scheduler] Failed to add job {task['name']}: {e}")

    def _remove_job(self, task_id: str):
        try:
            self._scheduler.remove_job(task_id)
        except Exception:
            pass

    async def _execute_task(self, task_id: str):
        task = self.db.get_task(task_id)
        if not task:
            logger.warning(f"[scheduler] Task not found: {task_id}")
            return

        handler = self._handlers.get(task["handler"])
        if not handler:
            logger.warning(f"[scheduler] Handler not found: {task['handler']}")
            return

        history_id = self.db.record_start(task_id)
        start_time = time.time()

        try:
            config = json.loads(task["config"]) if task.get("config") else {}
            result = await handler(task_id=task_id, config=config)
            duration_ms = int((time.time() - start_time) * 1000)
            result_str = json.dumps(result, ensure_ascii=False) if result else None
            self.db.record_success(history_id, result_str, duration_ms)
            logger.info(f"[scheduler] Task succeeded: {task['name']} ({duration_ms}ms)")
        except Exception as e:
            duration_ms = int((time.time() - start_time) * 1000)
            self.db.record_failure(history_id, str(e), duration_ms)
            logger.error(f"[scheduler] Task failed: {task['name']} — {e}")

    async def run_now(self, task_id: str) -> int | None:
        """Manual trigger. Returns history_id."""
        task = self.db.get_task(task_id)
        if not task:
            return None

        handler = self._handlers.get(task["handler"])
        if not handler:
            return None

        history_id = self.db.record_start(task_id)
        start_time = time.time()

        async def _run():
            try:
                config = json.loads(task["config"]) if task.get("config") else {}
                result = await handler(task_id=task_id, config=config)
                duration_ms = int((time.time() - start_time) * 1000)
                result_str = json.dumps(result, ensure_ascii=False) if result else None
                self.db.record_success(history_id, result_str, duration_ms)
            except Exception as e:
                duration_ms = int((time.time() - start_time) * 1000)
                self.db.record_failure(history_id, str(e), duration_ms)

        asyncio.create_task(_run())
        return history_id

    def sync_task(self, task_id: str):
        """Called after task CRUD to update scheduler jobs."""
        self._remove_job(task_id)
        task = self.db.get_task(task_id)
        if task and task["enabled"]:
            self._add_job(task)
