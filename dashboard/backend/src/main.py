import logging
from contextlib import asynccontextmanager
from pathlib import Path

import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from src.api import auth, proxy, routes
from src.core.config import Config
from src.core.database import Database

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
    logger.info(f"Server started on http://{config.host}:{config.port}")

    yield

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
    app.include_router(routes.router)
    app.include_router(proxy.router)

    # Health check (no auth)
    @app.get("/health")
    def health():
        return {"status": "ok"}

    # Serve frontend static files
    if FRONTEND_DIR.exists():
        app.mount("/assets", StaticFiles(directory=FRONTEND_DIR / "assets"), name="assets")

        @app.get("/{path:path}")
        async def spa_fallback(request: Request, path: str):
            # Serve actual files if they exist
            file_path = FRONTEND_DIR / path
            if file_path.is_file():
                return FileResponse(file_path)
            # SPA fallback: return index.html
            return FileResponse(FRONTEND_DIR / "index.html")

    return app


def main():
    load_dotenv()
    config = Config.from_env()
    app = create_app(config)
    uvicorn.run(app, host=config.host, port=config.port)


if __name__ == "__main__":
    main()
