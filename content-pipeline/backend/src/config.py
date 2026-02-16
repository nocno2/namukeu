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

    # Heartbeat / Agent
    telegram_bot_token: str = ""
    telegram_chat_id: str = ""
    claude_path: str = "claude"
    project_dir: str = "/Users/namwook/Documents/namukeu"
    heartbeat_interval_sec: int = 300
    quiet_hours_start: int = -1
    quiet_hours_end: int = -1
    agent_daily_budget_usd: float = 999.0
    max_proactive_per_hour: int = 5
    user_name: str = ""
    user_timezone: str = "Asia/Seoul"
    idle_threshold_sec: int = 600
    idle_max_per_day: int = 3
    agent_enabled: bool = True
    forbidden_config_path: str = ""
    soul_path: str = ""

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
            telegram_bot_token=os.getenv("TELEGRAM_BOT_TOKEN", ""),
            telegram_chat_id=os.getenv("TELEGRAM_CHAT_ID", ""),
            claude_path=os.getenv("CLAUDE_PATH", "claude"),
            project_dir=os.getenv("PROJECT_DIR", "/Users/namwook/Documents/namukeu"),
            heartbeat_interval_sec=int(os.getenv("HEARTBEAT_INTERVAL_SEC", "300")),
            quiet_hours_start=int(os.getenv("QUIET_HOURS_START", "-1")),
            quiet_hours_end=int(os.getenv("QUIET_HOURS_END", "-1")),
            agent_daily_budget_usd=float(os.getenv("AGENT_DAILY_BUDGET_USD", "999")),
            max_proactive_per_hour=int(os.getenv("MAX_PROACTIVE_PER_HOUR", "5")),
            user_name=os.getenv("USER_NAME", ""),
            user_timezone=os.getenv("USER_TIMEZONE", "Asia/Seoul"),
            idle_threshold_sec=int(os.getenv("IDLE_THRESHOLD_SEC", "600")),
            idle_max_per_day=int(os.getenv("IDLE_MAX_PER_DAY", "3")),
            agent_enabled=os.getenv("AGENT_ENABLED", "true").lower() == "true",
            forbidden_config_path=os.getenv("FORBIDDEN_CONFIG_PATH", ""),
            soul_path=os.getenv("SOUL_PATH", ""),
        )
