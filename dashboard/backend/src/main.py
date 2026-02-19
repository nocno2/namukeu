import logging
from contextlib import asynccontextmanager
from pathlib import Path

import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI, Request, HTTPException, APIRouter
from fastapi.responses import FileResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles

from src.api import auth, proxy, routes
from src.core.config import Config
from src.core.database import Database
from src.services.metrics_collector import MetricsCollector

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

    # Dependency overrides
    app.dependency_overrides[auth.get_db] = lambda: db
    app.dependency_overrides[auth.get_config] = lambda: config
    app.dependency_overrides[routes.get_config] = lambda: config
    app.dependency_overrides[routes.get_db] = lambda: db
    app.dependency_overrides[proxy.get_config] = lambda: config

    db.cleanup_expired()

    collector = MetricsCollector(config, db)
    await collector.start()

    logger.info(f"Server started on http://{config.host}:{config.port}")

    yield

    await collector.stop()
    db.close()
    logger.info("Server stopped")


def create_app(config: Config | None = None) -> FastAPI:
    if config is None:
        load_dotenv()
        config = Config.from_env()

    app = FastAPI(title="namukeu.com Dashboard", lifespan=lifespan)
    app.state.config = config

    # API routes
    app.include_router(auth.router)
    app.include_router(routes.router)  # proxy routes are included in routes.router

    # Health check (no auth)
    @app.get("/health")
    def health():
        return {"status": "ok"}

    # Serve frontend static files
    if FRONTEND_DIR.exists():
        app.mount("/assets", StaticFiles(directory=FRONTEND_DIR / "assets"), name="assets")

        # SPA fallback - must be last route
        @app.get("/{path:path}", include_in_schema=False)
        async def spa_fallback(request: Request, path: str):
            # API routes should be handled by API routers, not here
            if path.startswith("api"):
                raise HTTPException(status_code=404, detail="Not Found")
            # Serve frontend
            return FileResponse(FRONTEND_DIR / "index.html")

    return app


def main():
    load_dotenv()
    config = Config.from_env()
    app = create_app(config)
    uvicorn.run(app, host=config.host, port=config.port)


if __name__ == "__main__":
    main()
