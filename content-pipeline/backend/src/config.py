import os
from dataclasses import dataclass


@dataclass
class Config:
    host: str = "127.0.0.1"
    port: int = 8003
    db_path: str = "data/pipeline.db"

    # Auth
    admin_username: str = "nocno2"
    admin_password_hash: str = ""
    session_secret: str = ""
    session_expire_hours: int = 24

    # ai-blog
    blog_api_url: str = "http://localhost:3100"
    blog_db_path: str = ""
    blog_jwt_secret: str = ""

    # Agent API (dashboard integration)
    agent_api_token: str = "agent-api-token"

    # Naver DataLab (optional)
    naver_client_id: str = ""
    naver_client_secret: str = ""

    @classmethod
    def from_env(cls) -> "Config":
        return cls(
            host=os.getenv("HOST", "127.0.0.1"),
            port=int(os.getenv("PORT", "8003")),
            db_path=os.getenv("DB_PATH", "data/pipeline.db"),
            admin_username=os.getenv("ADMIN_USERNAME", "nocno2"),
            admin_password_hash=os.getenv("ADMIN_PASSWORD_HASH", ""),
            session_secret=os.getenv("SESSION_SECRET", ""),
            session_expire_hours=int(os.getenv("SESSION_EXPIRE_HOURS", "24")),
            blog_api_url=os.getenv("BLOG_API_URL", "http://localhost:3100"),
            blog_db_path=os.getenv("BLOG_DB_PATH", ""),
            blog_jwt_secret=os.getenv("BLOG_JWT_SECRET", ""),
            agent_api_token=os.getenv("AGENT_API_TOKEN", "agent-api-token"),
            naver_client_id=os.getenv("NAVER_CLIENT_ID", ""),
            naver_client_secret=os.getenv("NAVER_CLIENT_SECRET", ""),
        )
