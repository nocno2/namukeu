from dataclasses import dataclass, field
import os


@dataclass
class ServiceDef:
    name: str
    display_name: str
    description: str
    type: str  # "http", "process", "self"
    port: int | None = None
    health_url: str | None = None
    status_url: str | None = None
    status_token: str | None = None
    launchd_label: str | None = None
    git_dir: str | None = None
    git_codename: str | None = None
    process_cwd: str | None = None  # fallback: check by working directory
    dashboard_url: str | None = None  # proxy URL for built-in dashboard
    error_log_path: str | None = None


@dataclass
class Config:
    host: str = "127.0.0.1"
    port: int = 8002
    admin_username: str = "admin"
    admin_password_hash: str = ""
    session_secret: str = ""
    db_path: str = "data/dashboard.db"
    session_expire_hours: int = 24

    services: list[ServiceDef] = field(default_factory=list)

    project_root: str = ""

    @classmethod
    def from_env(cls) -> "Config":
        project_root = os.environ.get(
            "PROJECT_ROOT", "/Users/namwook/Documents/namukeu"
        )
        coin_url = os.environ.get("COIN_AUTO_TRADE_URL", "http://127.0.0.1:8001")
        coin_token = os.environ.get("COIN_AUTO_TRADE_TOKEN", "")
        train_url = os.environ.get("TRAIN_GO_URL", "http://127.0.0.1:8000")
        train_token = os.environ.get("TRAIN_GO_TOKEN", "")

        log_base = "/Users/namwook/Library/Logs"

        services = [
            ServiceDef(
                name="coin-auto-trade",
                display_name="Coin Auto Trade",
                description="Upbit 자동매매 서버",
                type="http",
                port=8001,
                health_url=f"{coin_url}/health",
                status_url=f"{coin_url}/status",
                status_token=coin_token,
                launchd_label="com.namukeu.coin-auto-trade",
                git_dir=project_root,
                git_codename="COIN",
                dashboard_url="/proxy/coin/",
                error_log_path=f"{log_base}/coin-auto-trade.error.log",
            ),
            ServiceDef(
                name="train-go",
                display_name="Train Go",
                description="SRT/Korail 자동예매 서버",
                type="http",
                port=8000,
                health_url=f"{train_url}/health",
                status_url=f"{train_url}/status",
                status_token=train_token,
                launchd_label="com.namukeu.train-go",
                git_dir=project_root,
                git_codename="TRAIN",
                error_log_path=f"{log_base}/train-go.error.log",
            ),
            ServiceDef(
                name="claude-telegram",
                display_name="Claude Telegram",
                description="Telegram 릴레이 봇",
                type="process",
                launchd_label="com.namukeu.claude-telegram",
                git_dir=project_root,
                git_codename="TGBOT",
                process_cwd=f"{project_root}/claude-telegram",
                error_log_path=f"{log_base}/claude-telegram.error.log",
            ),
            ServiceDef(
                name="claude-discord",
                display_name="Claude Discord",
                description="Discord 릴레이 봇",
                type="process",
                launchd_label="com.namukeu.claude-discord",
                git_dir=project_root,
                git_codename="DCBOT",
                process_cwd=f"{project_root}/claude-discord",
                error_log_path=f"{log_base}/claude-discord.error.log",
            ),
            ServiceDef(
                name="dashboard",
                display_name="Dashboard",
                description="이 대시보드 (namukeu.com)",
                type="self",
                port=8002,
                launchd_label="com.namukeu.dashboard",
                git_dir=project_root,
                git_codename="DASH",
                error_log_path=f"{log_base}/dashboard.error.log",
            ),
            ServiceDef(
                name="api-gateway",
                display_name="API Gateway",
                description="API 게이트웨이 (리버스 프록시)",
                type="http",
                port=8080,
                health_url="http://127.0.0.1:8080/health",
                launchd_label="com.namukeu.api-gateway",
                git_dir=project_root,
                git_codename="GATE",
                error_log_path=f"{log_base}/api-gateway.error.log",
            ),
        ]

        return cls(
            host=os.environ.get("HOST", "127.0.0.1"),
            port=int(os.environ.get("PORT", "8002")),
            admin_username=os.environ.get("ADMIN_USERNAME", "admin"),
            admin_password_hash=os.environ["ADMIN_PASSWORD_HASH"],
            session_secret=os.environ["SESSION_SECRET"],
            db_path=os.environ.get("DB_PATH", "data/dashboard.db"),
            session_expire_hours=int(os.environ.get("SESSION_EXPIRE_HOURS", "24")),
            project_root=project_root,
            services=services,
        )
