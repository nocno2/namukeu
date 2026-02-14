import os
from dataclasses import dataclass


@dataclass
class Config:
    api_token: str
    encryption_key: str
    telegram_bot_token: str
    telegram_chat_id: str
    host: str = "127.0.0.1"
    port: int = 8000
    search_interval_seconds: int = 5
    max_search_duration_hours: int = 24
    db_path: str = "data/train-go.db"

    @classmethod
    def from_env(cls) -> "Config":
        return cls(
            api_token=os.environ["API_TOKEN"],
            encryption_key=os.environ["ENCRYPTION_KEY"],
            telegram_bot_token=os.environ["TELEGRAM_BOT_TOKEN"],
            telegram_chat_id=os.environ["TELEGRAM_CHAT_ID"],
            host=os.environ.get("HOST", "127.0.0.1"),
            port=int(os.environ.get("PORT", "8000")),
            search_interval_seconds=int(os.environ.get("SEARCH_INTERVAL_SECONDS", "5")),
            max_search_duration_hours=int(os.environ.get("MAX_SEARCH_DURATION_HOURS", "24")),
        )
