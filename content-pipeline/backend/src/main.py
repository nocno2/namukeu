import logging
from contextlib import asynccontextmanager
from pathlib import Path

import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from src.agent.audit import AuditLog
from src.agent.config import AgentConfigStore
from src.agent.evolution import EvolutionEngine
from src.agent.forbidden import ForbiddenActions
from src.agent.goals import GoalStore
from src.agent.heartbeat import Heartbeat
from src.agent.seed import seed_evolution_task
from src.agent.tasks import TaskStore
from src.agent.telegram import TelegramNotifier
from src.api import agent, auth, history, n8n, pipeline, tasks
from src.config import Config
from src.db.connection import Database
from src.scheduler.engine import SchedulerEngine

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

FRONTEND_DIR = Path(__file__).parent.parent.parent / "frontend" / "dist"


@asynccontextmanager
async def lifespan(app: FastAPI):
    config = app.state.config
    db = Database(config.db_path)
    scheduler = SchedulerEngine(db)

    # Agent stores
    goal_store = GoalStore(db)
    config_store = AgentConfigStore(db)
    task_store = TaskStore(db)
    audit_log = AuditLog(db)

    # Forbidden actions
    forbidden = ForbiddenActions(config.forbidden_config_path)
    if config.forbidden_config_path:
        forbidden.load()

    # Telegram notifier
    notifier = TelegramNotifier(config.telegram_bot_token, config.telegram_chat_id)

    # Evolution engine
    evolution_engine = EvolutionEngine(db, goal_store)

    # Heartbeat
    heartbeat: Heartbeat | None = None
    if config.agent_enabled:
        heartbeat = Heartbeat(
            config=config,
            task_store=task_store,
            audit=audit_log,
            goal_store=goal_store,
            forbidden=forbidden,
            notifier=notifier,
            evolution_engine=evolution_engine,
        )

        # Sync feature toggles from DB
        heartbeat.set_idle_enabled(config_store.get_bool("idle_enabled"))
        heartbeat.set_chaining_enabled(config_store.get_bool("chaining_enabled"))
        heartbeat.set_monitors_enabled(config_store.get_bool("monitors_enabled"))
        heartbeat.set_evolution_enabled(config_store.get_bool("evolution_enabled"))

        # Seed evolution task if missing
        seed_evolution_task(task_store)

    # Dependency overrides
    app.dependency_overrides[auth.get_db] = lambda: db
    app.dependency_overrides[auth.get_config] = lambda: config
    app.dependency_overrides[tasks.get_scheduler] = lambda: scheduler
    app.dependency_overrides[agent.get_goal_store] = lambda: goal_store
    app.dependency_overrides[agent.get_config_store] = lambda: config_store
    app.dependency_overrides[agent.get_config] = lambda: config
    app.dependency_overrides[agent.get_heartbeat] = lambda: heartbeat
    app.dependency_overrides[agent.get_task_store] = lambda: task_store
    app.dependency_overrides[agent.get_audit_log] = lambda: audit_log
    app.dependency_overrides[agent.get_forbidden] = lambda: forbidden
    app.dependency_overrides[agent.get_evolution_engine] = lambda: evolution_engine
    app.dependency_overrides[n8n.get_config] = lambda: config

    db.cleanup_expired()
    await scheduler.start()

    if heartbeat:
        await heartbeat.start()
        logger.info("[agent] Heartbeat started")

    logger.info(f"Server started on http://{config.host}:{config.port}")

    yield

    if heartbeat:
        heartbeat.stop()
    await notifier.close()
    await scheduler.stop()
    db.close()
    logger.info("Server stopped")


def create_app(config: Config | None = None) -> FastAPI:
    if config is None:
        load_dotenv()
        config = Config.from_env()

    app = FastAPI(title="Content Pipeline", lifespan=lifespan)
    app.state.config = config

    # API routes
    app.include_router(auth.router)
    app.include_router(tasks.router)
    app.include_router(history.router)
    app.include_router(pipeline.router)
    app.include_router(agent.router)
    app.include_router(n8n.router)  # n8n integration (no auth required)

    # Health check (no auth)
    @app.get("/health")
    def health():
        return {"status": "ok"}

    # Serve frontend static files
    if FRONTEND_DIR.exists():
        app.mount("/assets", StaticFiles(directory=FRONTEND_DIR / "assets"), name="assets")

        @app.get("/{path:path}")
        async def spa_fallback(request: Request, path: str):
            file_path = FRONTEND_DIR / path
            if file_path.is_file():
                return FileResponse(file_path)
            return FileResponse(FRONTEND_DIR / "index.html")

    return app


def main():
    load_dotenv()
    config = Config.from_env()
    app = create_app(config)
    uvicorn.run(app, host=config.host, port=config.port)


if __name__ == "__main__":
    main()
