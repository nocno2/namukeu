from fastapi import APIRouter, Depends

from src.api.auth import verify
from src.core.config import Config
from src.core.database import Database
from src.core import runtime
from src.models.dashboard import StatusResponse
from src.services.transition_checker import TransitionChecker

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


@router.get("/transition-check")
def transition_check(
    _=Depends(verify),
    db: Database = Depends(get_db),
    strategy_name: str | None = None,
    ticker: str | None = None,
):
    """전환 체크리스트 검증: 라이브 트레이딩 전환 가능 여부 확인."""
    checker = TransitionChecker(db)
    result = checker.check(strategy_name=strategy_name, ticker=ticker)
    return {
        "can_transition": result.can_transition,
        "backtest_valid": result.backtest_valid,
        "paper_win_rate_valid": result.paper_win_rate_valid,
        "max_drawdown_valid": result.max_drawdown_valid,
        "details": result.details,
    }


@router.get("/readiness-report")
def readiness_report(
    _=Depends(verify),
    db: Database = Depends(get_db),
):
    """준비 상태 종합 리포트."""
    checker = TransitionChecker(db)
    return checker.get_readiness_report()
