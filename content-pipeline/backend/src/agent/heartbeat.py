"""Heartbeat — main orchestrator. Port of agent-core/src/heartbeat.ts"""

import asyncio
import logging
import time
import uuid
from datetime import datetime

from src.agent.audit import AuditLog
from src.agent.claude_cli import call_claude
from src.agent.forbidden import ForbiddenActions
from src.agent.goals import GoalStore
from src.agent.idle import build_idle_prompt, select_idle_strategy
from src.agent.monitors import MonitorSystem
from src.agent.seed import seed_initial_tasks
from src.agent.soul import build_agent_system_prompt, load_soul
from src.agent.tags import process_tags
from src.agent.tasks import TaskStore
from src.agent.telegram import TelegramNotifier
from src.agent.types import AgentTask, MonitorDefinition
from src.config import Config

logger = logging.getLogger(__name__)

PROJECT_POOL = ["COIN", "BLOG", "DASH", "TRAIN", "TGBOT", "DCBOT"]

DEFAULT_MONITORS: list[MonitorDefinition] = [
    {
        "id": "health-all",
        "name": "Service Health Check",
        "event_name": "server_down",
        "interval_sec": 60,
        "enabled": True,
        "endpoints": [
            {"name": "coin-auto-trade", "url": "http://127.0.0.1:8001/health", "project": "COIN"},
            {"name": "train-go", "url": "http://127.0.0.1:8000/health", "project": "TRAIN"},
            {"name": "dashboard", "url": "http://127.0.0.1:8002/health", "project": "DASH"},
        ],
        "failure_threshold": 3,
    },
]


class RunningTask:
    def __init__(self, title: str, project: str):
        self.title = title
        self.project = project
        self.started_at = time.time()

    def to_dict(self) -> dict:
        return {
            "title": self.title,
            "project": self.project,
            "startedAt": int(self.started_at * 1000),
        }


class Heartbeat:
    def __init__(
        self,
        config: Config,
        task_store: TaskStore,
        audit: AuditLog,
        goal_store: GoalStore,
        forbidden: ForbiddenActions,
        notifier: TelegramNotifier,
    ):
        self.config = config
        self.task_store = task_store
        self.audit = audit
        self.goal_store = goal_store
        self.forbidden = forbidden
        self.notifier = notifier

        self._stopped = True
        self._task: asyncio.Task | None = None
        self._running_tasks: dict[str, RunningTask] = {}

        # Idle tracking
        self._last_task_at = time.time()
        self._idle_tasks_today = 0
        self._idle_reset_date = datetime.now().strftime("%Y-%m-%d")

        # Feature toggles (from agent_config DB)
        self._idle_enabled = False
        self._chaining_enabled = False
        self._monitors_enabled = False

        # Monitor system
        self._monitor_system: MonitorSystem | None = None

        # Soul content
        self._soul = ""

    async def start(self):
        self._stopped = False

        # Load soul
        if self.config.soul_path:
            self._soul = load_soul(self.config.soul_path)

        # Load forbidden
        if self.config.forbidden_config_path:
            self.forbidden.load()

        # Seed initial tasks
        seed_initial_tasks(self.task_store)

        # Recover zombie tasks
        self._recover_zombies()

        # Start monitors if enabled
        if self._monitors_enabled:
            self._start_monitors()

        logger.info(f"[heartbeat] Started (interval: {self.config.heartbeat_interval_sec}s)")

        self._task = asyncio.create_task(self._loop())

    def stop(self):
        self._stopped = True
        if self._task:
            self._task.cancel()
            self._task = None
        if self._monitor_system:
            self._monitor_system.stop()
            self._monitor_system = None
        logger.info("[heartbeat] Stopped")

    def is_stopped(self) -> bool:
        return self._stopped

    async def resume(self):
        if self._stopped:
            await self.start()

    def _recover_zombies(self):
        active = self.task_store.get_active()
        zombies = [
            t for t in active
            if t["status"] == "running" and (t.get("project") or "GENERAL") not in self._running_tasks
        ]
        for z in zombies:
            logger.info(f'[heartbeat] Recovering zombie task: "{z["title"]}" → pending')
            self.task_store.update_task(z["id"], {"status": "pending"})
        if zombies:
            logger.info(f"[heartbeat] Recovered {len(zombies)} zombie task(s)")

    def _start_monitors(self):
        if self._monitor_system:
            return
        self._monitor_system = MonitorSystem(
            DEFAULT_MONITORS,
            lambda event_name, context: self.fire_event(event_name, context),
        )
        self._monitor_system.start()

    async def _loop(self):
        # Initial delay
        await asyncio.sleep(5)

        while not self._stopped:
            try:
                await self._tick()
            except Exception as e:
                logger.error(f"[heartbeat] Tick error: {e}")
            await asyncio.sleep(self.config.heartbeat_interval_sec)

    async def _tick(self):
        if self._stopped:
            return

        # Periodically recover zombies
        self._recover_zombies()

        # Check quiet hours
        if self._is_quiet_hours():
            return

        # Check daily budget
        today_cost = self.audit.get_today_cost(self.config.user_timezone)
        if today_cost >= self.config.agent_daily_budget_usd:
            logger.info(f"[heartbeat] Daily budget exceeded (${today_cost:.2f} / ${self.config.agent_daily_budget_usd})")
            return

        # Check rate limit
        recent_count = self.audit.get_proactive_count_last_hour()
        if recent_count >= self.config.max_proactive_per_hour:
            logger.info(f"[heartbeat] Rate limit reached ({recent_count}/{self.config.max_proactive_per_hour} per hour)")
            return

        # Get due tasks
        due_tasks = self.task_store.get_due_tasks()

        if not due_tasks:
            await self._maybe_run_idle()
            return

        # Filter tasks already running for the same project
        tasks_to_run = [
            t for t in due_tasks
            if (t.get("project") or "GENERAL") not in self._running_tasks
        ]

        if not tasks_to_run:
            running = [r.project for r in self._running_tasks.values()]
            logger.info(f"[heartbeat] All due tasks blocked by running: {', '.join(running)}")
            return

        logger.info(f"[heartbeat] {len(tasks_to_run)} task(s) to run ({len(self._running_tasks)} already running)")

        # Launch all in parallel
        results = await asyncio.gather(
            *[self._execute_task(t) for t in tasks_to_run],
            return_exceptions=True,
        )
        for r in results:
            if isinstance(r, Exception):
                logger.error(f"[heartbeat] Task execution exception: {r}")

    async def _execute_task(self, task: AgentTask):
        project_key = task.get("project") or "GENERAL"

        # Check if approval required
        if task["requires_approval"]:
            await self.notifier.send_message(
                f'[AUTO/{task["project"]}] 승인 필요: "{task["title"]}"\n'
                f'실행하려면 /approve {task["id"][:8]}',
            )
            return

        # Register running task
        self._running_tasks[project_key] = RunningTask(task["title"], project_key)
        self.task_store.update_status(task["id"], "running")
        logger.info(f'[heartbeat] Executing task: {task["title"]} ({project_key})')

        try:
            result_data = await self._call_claude_for_task(task)
            result_text = result_data["result"]
            cost_usd = result_data.get("cost_usd")
            duration_ms = result_data.get("duration_ms")

            # Update last task time
            self._last_task_at = time.time()

            # Complete the run
            self.task_store.complete_run(task["id"], result_text, cost_usd)

            # Audit
            self.audit.record(
                ts=datetime.now().isoformat(),
                audit_type="heartbeat",
                task=task["title"],
                cost=cost_usd,
                duration=duration_ms,
            )

            # Notify user
            if task["notify_user"] and result_text:
                prefix = f'[AUTO/{task["project"]}] '
                message = prefix + (result_text[:3800] + "..." if len(result_text) > 3800 else result_text)
                await self.notifier.send_message(message)

            logger.info(f'[heartbeat] Task "{task["title"]}" completed (${cost_usd or 0:.4f})')

        except Exception as e:
            logger.error(f'[heartbeat] Task "{task["title"]}" failed: {e}')
            self.task_store.update_status(task["id"], "failed")

            await self.notifier.send_message(
                f'[AUTO/{task["project"]}] 태스크 실패: "{task["title"]}"\n{str(e)[:200]}'
            )

            self.audit.record(
                ts=datetime.now().isoformat(),
                audit_type="heartbeat",
                task=task["title"],
            )
        finally:
            self._running_tasks.pop(project_key, None)

    async def _call_claude_for_task(self, task: AgentTask) -> dict:
        time_str = datetime.now().strftime("%A, %B %d, %Y %I:%M %p")

        goals_context = ""
        if self.goal_store:
            goals = self.goal_store.get_by_project(task.get("project", "GENERAL"))
            if goals:
                goals_context = "\n".join(
                    f"- [{g['priority'].upper()}] {g['title']}"
                    + (f" (공유: {', '.join(g['projects'])})" if len(g["projects"]) > 1 else "")
                    for g in goals
                )

        active_tasks = self.task_store.get_active()
        tasks_summary = "\n".join(f"- {t['title']} ({t['type']})" for t in active_tasks)

        system_prompt = build_agent_system_prompt(
            soul=self._soul,
            forbidden_block=self.forbidden.format_for_prompt(),
            active_tasks_summary=tasks_summary,
            user_name=self.config.user_name,
            current_time=time_str,
            goals_context=goals_context,
            chaining_enabled=self._chaining_enabled,
        )

        session_id = str(uuid.uuid4())

        # Progress callback: send to Telegram
        def on_progress(msg: str):
            asyncio.create_task(self.notifier.send_message(
                f'[AUTO/{task.get("project", "GENERAL")}] {msg}'
            ))

        result = await call_claude(
            prompt=task["prompt"],
            session_id=session_id,
            is_new_session=True,
            system_prompt=system_prompt,
            claude_path=self.config.claude_path,
            cwd=self.config.project_dir,
            on_progress=on_progress,
        )

        if result["success"]:
            # Process tags
            tag_result = process_tags(
                result["result"],
                self.task_store,
                chain_depth=task.get("chain_depth", 0),
            )
            return {
                "result": tag_result.clean_text,
                "cost_usd": result.get("cost_usd"),
                "duration_ms": result.get("duration_ms"),
            }

        return {
            "result": result.get("error") or "Task failed",
            "cost_usd": result.get("cost_usd"),
            "duration_ms": result.get("duration_ms"),
        }

    async def _maybe_run_idle(self):
        if not self._idle_enabled:
            return

        # Reset daily counter
        today = datetime.now().strftime("%Y-%m-%d")
        if today != self._idle_reset_date:
            self._idle_tasks_today = 0
            self._idle_reset_date = today

        # Check daily limit
        if self._idle_tasks_today >= self.config.idle_max_per_day:
            return

        # Check idle threshold
        elapsed = time.time() - self._last_task_at
        if elapsed < self.config.idle_threshold_sec:
            return

        # Find available projects (not currently running)
        available = [p for p in PROJECT_POOL if p not in self._running_tasks]
        if not available:
            return

        # Run up to 3 idle tasks in parallel
        max_parallel = min(3, len(available), self.config.idle_max_per_day - self._idle_tasks_today)
        idle_coros = []

        for i in range(max_parallel):
            strategy, project = select_idle_strategy(
                goal_store=self.goal_store, project=available[i]
            )
            if project in self._running_tasks:
                continue

            prompt = build_idle_prompt(strategy, project, self.goal_store)
            logger.info(f"[heartbeat] Running idle task: {strategy.title} ({project})")

            idle_task: AgentTask = {
                "id": str(uuid.uuid4()),
                "type": "one-time",
                "status": "running",
                "title": f"[IDLE] {strategy.title} - {project}",
                "prompt": prompt,
                "project": project,
                "schedule_cron": None,
                "schedule_next": None,
                "event_trigger": None,
                "last_run_at": None,
                "last_result": None,
                "run_count": 0,
                "max_runs": 1,
                "notify_user": True,
                "requires_approval": False,
                "chain_depth": 0,
                "chain_parent_id": None,
                "created_at": datetime.now().isoformat(),
                "updated_at": datetime.now().isoformat(),
            }

            self._idle_tasks_today += 1
            idle_coros.append(self._execute_idle_task(idle_task, project))

        await asyncio.gather(*idle_coros, return_exceptions=True)

    async def _execute_idle_task(self, task: AgentTask, project: str):
        self._running_tasks[project] = RunningTask(task["title"], project)

        try:
            result_data = await self._call_claude_for_task(task)
            result_text = result_data["result"]
            cost_usd = result_data.get("cost_usd")
            duration_ms = result_data.get("duration_ms")

            self._last_task_at = time.time()

            self.audit.record(
                ts=datetime.now().isoformat(),
                audit_type="heartbeat",
                task=task["title"],
                cost=cost_usd,
                duration=duration_ms,
            )

            if result_text:
                prefix = f"[IDLE/{project}] "
                message = prefix + (result_text[:3800] + "..." if len(result_text) > 3800 else result_text)
                await self.notifier.send_message(message)

            logger.info(f'[heartbeat] Idle task "{task["title"]}" completed (${cost_usd or 0:.4f})')

        except Exception as e:
            logger.error(f'[heartbeat] Idle task "{task["title"]}" failed: {e}')
        finally:
            self._running_tasks.pop(project, None)

    def _is_quiet_hours(self) -> bool:
        start = self.config.quiet_hours_start
        end = self.config.quiet_hours_end
        if start < 0 or end < 0:
            return False

        now = datetime.now()
        hour = now.hour

        if start > end:
            return hour >= start or hour < end
        return start <= hour < end

    async def fire_event(self, event_name: str, context: str | None = None):
        if self._stopped:
            return
        if self._is_quiet_hours():
            logger.info(f'[heartbeat] Event "{event_name}" suppressed (quiet hours)')
            return

        tasks = self.task_store.get_event_tasks(event_name)
        coros = []
        for task in tasks:
            if context:
                enriched = dict(task)
                enriched["prompt"] = f"{task['prompt']}\n\nContext: {context}"
                coros.append(self._execute_task(enriched))
            else:
                coros.append(self._execute_task(task))
        await asyncio.gather(*coros, return_exceptions=True)

    # ─── Feature Toggles ───

    def set_idle_enabled(self, enabled: bool):
        self._idle_enabled = enabled
        logger.info(f"[heartbeat] Idle tasks {'enabled' if enabled else 'disabled'}")

    def set_chaining_enabled(self, enabled: bool):
        self._chaining_enabled = enabled
        logger.info(f"[heartbeat] Task chaining {'enabled' if enabled else 'disabled'}")

    def set_monitors_enabled(self, enabled: bool):
        self._monitors_enabled = enabled
        if enabled and not self._monitor_system:
            self._start_monitors()
        elif not enabled and self._monitor_system:
            self._monitor_system.stop()
            self._monitor_system = None
        logger.info(f"[heartbeat] Monitors {'enabled' if enabled else 'disabled'}")

    # ─── Status ───

    async def get_status(self) -> dict:
        stats = self.audit.get_today_stats(self.config.user_timezone)
        return {
            "running": not self._stopped,
            "runningTasks": [r.to_dict() for r in self._running_tasks.values()],
            "idleEnabled": self._idle_enabled,
            "chainingEnabled": self._chaining_enabled,
            "monitorsEnabled": self._monitors_enabled,
            "todayTaskCount": stats["task_count"],
            "todayCost": stats["total_cost"],
            "lastTaskExecutedAt": stats["last_task_at"],
            "monitorStatus": self._monitor_system.get_status() if self._monitor_system else None,
        }
