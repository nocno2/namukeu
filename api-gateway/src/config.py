from __future__ import annotations

import os
from dataclasses import dataclass, field


@dataclass
class ServiceDef:
    name: str
    url: str
    prefix: str  # e.g. "/api/coin"
    token: str | None = None  # Bearer token for upstream auth
    public: bool = False  # skip gateway JWT check


@dataclass
class Config:
    host: str = "127.0.0.1"
    port: int = 8080

    # JWT
    jwt_secret: str = ""
    jwt_algorithm: str = "HS256"
    jwt_expire_hours: int = 24

    # CORS
    allowed_origins: list[str] = field(default_factory=list)

    # Rate limiting
    rate_limit_requests: int = 100
    rate_limit_window_seconds: int = 60

    # Logging
    log_level: str = "INFO"

    # Services
    services: list[ServiceDef] = field(default_factory=list)

    @classmethod
    def from_env(cls) -> Config:
        origins_raw = os.getenv("ALLOWED_ORIGINS", "")
        origins = [o.strip() for o in origins_raw.split(",") if o.strip()]

        services = [
            ServiceDef(
                name="coin",
                url=os.getenv("COIN_URL", "http://127.0.0.1:8001"),
                prefix="/api/coin",
                token=os.getenv("COIN_TOKEN"),
            ),
            ServiceDef(
                name="train",
                url=os.getenv("TRAIN_URL", "http://127.0.0.1:8000"),
                prefix="/api/train",
                token=os.getenv("TRAIN_TOKEN"),
            ),
            ServiceDef(
                name="dash",
                url=os.getenv("DASH_URL", "http://127.0.0.1:8002"),
                prefix="/api/dash",
            ),
            ServiceDef(
                name="blog",
                url=os.getenv("BLOG_URL", "http://127.0.0.1:3100"),
                prefix="/blog",
                public=True,
            ),
        ]

        return cls(
            host=os.getenv("HOST", "127.0.0.1"),
            port=int(os.getenv("PORT", "8080")),
            jwt_secret=os.getenv("JWT_SECRET", ""),
            jwt_algorithm=os.getenv("JWT_ALGORITHM", "HS256"),
            jwt_expire_hours=int(os.getenv("JWT_EXPIRE_HOURS", "24")),
            allowed_origins=origins,
            rate_limit_requests=int(os.getenv("RATE_LIMIT_REQUESTS", "100")),
            rate_limit_window_seconds=int(os.getenv("RATE_LIMIT_WINDOW_SECONDS", "60")),
            log_level=os.getenv("LOG_LEVEL", "INFO"),
            services=services,
        )
