from __future__ import annotations

import logging
from contextlib import asynccontextmanager

import httpx
import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.auth.middleware import get_jwt_algorithm, get_jwt_secret
from src.config import Config
from src.middleware.logging import RequestLoggingMiddleware
from src.middleware.rate_limit import RateLimitMiddleware
from src.proxy import get_config, get_http_client
from src.proxy import router as proxy_router
from src.routes.auth import router as auth_router
from src.routes.health import router as health_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    config: Config = app.state.config
    client = httpx.AsyncClient()

    # Dependency overrides
    app.dependency_overrides[get_config] = lambda: config
    app.dependency_overrides[get_http_client] = lambda: client
    app.dependency_overrides[get_jwt_secret] = lambda: config.jwt_secret
    app.dependency_overrides[get_jwt_algorithm] = lambda: config.jwt_algorithm

    logger = logging.getLogger("gateway")
    logger.info(
        "API Gateway started on %s:%d — %d services registered",
        config.host,
        config.port,
        len(config.services),
    )
    for svc in config.services:
        logger.info("  %s → %s", svc.prefix, svc.url)

    yield

    await client.aclose()
    logger.info("API Gateway stopped")


def create_app() -> FastAPI:
    load_dotenv()
    config = Config.from_env()

    # Setup logging
    logging.basicConfig(
        level=getattr(logging, config.log_level.upper(), logging.INFO),
        format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    app = FastAPI(
        title="API Gateway",
        description="Monorepo services reverse proxy + auth gateway",
        version="1.0.0",
        lifespan=lifespan,
    )
    app.state.config = config

    # Middleware (order matters: last added = first executed)
    app.add_middleware(RateLimitMiddleware,
                       max_requests=config.rate_limit_requests,
                       window_seconds=config.rate_limit_window_seconds)
    app.add_middleware(RequestLoggingMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=config.allowed_origins or ["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Routes
    app.include_router(health_router)
    app.include_router(auth_router)
    app.include_router(proxy_router)

    return app


def main():
    app = create_app()
    uvicorn.run(app, host=app.state.config.host, port=app.state.config.port)


if __name__ == "__main__":
    main()
