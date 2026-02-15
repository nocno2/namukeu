from fastapi import APIRouter, Depends

from src.api.auth import verify
from src.core.config import Config
from src.core.database import Database
from src.core import runtime
from src.models.dashboard import StatusResponse

router = APIRouter(tags=["system"])


def get_db() -> Database:
    raise NotImplementedError


def get_config() -> Config:
    raise NotImplementedError


@router.get("/health")
def health():
    return {"status": "ok"}


@router.get("/status", response_model=StatusResponse)
def status(
    _=Depends(verify),
    db: Database = Depends(get_db),
    config: Config = Depends(get_config),
):
    strategies = db.get_strategies(enabled_only=True)
    positions = db.get_positions()
    return StatusResponse(
        server="coin-auto-trade",
        trading_mode="dry_run" if config.dry_run else "live",
        active_strategies=len(strategies),
        active_positions=len(positions),
        dry_run=config.dry_run,
        active_exchanges=list(runtime.exchanges.keys()),
    )
