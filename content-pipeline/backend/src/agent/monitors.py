"""MonitorSystem — asyncio health checks + event firing. Port of agent-core/src/monitors.ts"""

import asyncio
import logging
from typing import Callable, Awaitable

import httpx

from src.agent.types import MonitorDefinition

logger = logging.getLogger(__name__)

FireEventFn = Callable[[str, str | None], Awaitable[None]]


class MonitorSystem:
    def __init__(
        self,
        monitors: list[MonitorDefinition],
        fire_event: FireEventFn,
    ):
        self.monitors = monitors
        self.fire_event = fire_event
        self.failure_counts: dict[str, int] = {}
        self.last_check_at: str | None = None
        self.fired_events: dict[str, str] = {}
        self._tasks: list[asyncio.Task] = []
        self._stopped = False

    def start(self):
        self._stopped = False
        for monitor in self.monitors:
            if not monitor["enabled"]:
                continue
            task = asyncio.create_task(self._monitor_loop(monitor))
            self._tasks.append(task)
            logger.info(f"[monitor] Started: {monitor['name']} (every {monitor['interval_sec']}s)")

    def stop(self):
        self._stopped = True
        for task in self._tasks:
            task.cancel()
        self._tasks.clear()
        logger.info("[monitor] All monitors stopped")

    async def _monitor_loop(self, monitor: MonitorDefinition):
        # First check after 10 seconds
        await asyncio.sleep(10)
        while not self._stopped:
            try:
                await self._check_monitor(monitor)
            except Exception as e:
                logger.error(f"[monitor] Check error for {monitor['name']}: {e}")
            await asyncio.sleep(monitor["interval_sec"])

    async def _check_monitor(self, monitor: MonitorDefinition):
        from datetime import datetime
        self.last_check_at = datetime.now().isoformat()

        async with httpx.AsyncClient() as client:
            for endpoint in monitor["endpoints"]:
                key = f"{monitor['id']}:{endpoint['name']}"
                timeout_ms = endpoint.get("timeout_ms", 5000)

                try:
                    resp = await client.get(
                        endpoint["url"],
                        timeout=timeout_ms / 1000,
                    )
                    if resp.is_success:
                        was_fired = key in self.fired_events
                        self.failure_counts[key] = 0
                        if was_fired:
                            del self.fired_events[key]
                            logger.info(f"[monitor] {endpoint['name']} recovered")
                            await self.fire_event(
                                "server_recovered",
                                f"{endpoint['name']} 서비스가 복구되었습니다.",
                            )
                    else:
                        self.failure_counts[key] = self.failure_counts.get(key, 0) + 1
                except Exception:
                    self.failure_counts[key] = self.failure_counts.get(key, 0) + 1

                failures = self.failure_counts.get(key, 0)
                if failures >= monitor["failure_threshold"] and key not in self.fired_events:
                    self.fired_events[key] = datetime.now().isoformat()
                    logger.warning(f"[monitor] {endpoint['name']} DOWN ({failures} consecutive failures)")
                    await self.fire_event(
                        monitor["event_name"],
                        f"{endpoint['name']} 서비스가 {failures}회 연속 응답 실패했습니다.\n"
                        f"URL: {endpoint['url']}\n"
                        f"Project: {endpoint.get('project', 'UNKNOWN')}",
                    )

    def get_status(self) -> dict:
        monitors = []
        for m in self.monitors:
            failures: dict[str, int] = {}
            for ep in m["endpoints"]:
                key = f"{m['id']}:{ep['name']}"
                count = self.failure_counts.get(key, 0)
                if count > 0:
                    failures[ep["name"]] = count
            monitors.append({
                "id": m["id"],
                "name": m["name"],
                "enabled": m["enabled"],
                "lastCheck": self.last_check_at,
                "failures": failures,
            })
        return {"monitors": monitors}

    def get_healthy_count(self) -> tuple[int, int]:
        healthy = 0
        total = 0
        for m in self.monitors:
            for ep in m["endpoints"]:
                total += 1
                key = f"{m['id']}:{ep['name']}"
                if self.failure_counts.get(key, 0) == 0:
                    healthy += 1
        return healthy, total
