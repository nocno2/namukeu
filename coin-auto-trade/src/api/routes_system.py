from fastapi import APIRouter, Depends

from src.api.auth import verify
from src.core.config import Config
from src.core.database import Database
from src.core import runtime
from src.models.dashboard import StatusResponse
from src.services.transition_checker import TransitionChecker

# In-memory flag to track dry_run state per exchange
# This is separate from runtime.dry_run_override to allow per-exchange control
_exchange_dry_run: dict[str, bool] = {}

router = APIRouter(tags=["system"])


def get_effective_dry_run(config: Config, exchange_name: str | None = None) -> bool:
    """Get effective dry_run value considering override and per-exchange settings."""
    if runtime.dry_run_override is not None:
        return runtime.dry_run_override
    if exchange_name and exchange_name in _exchange_dry_run:
        return _exchange_dry_run[exchange_name]
    return config.dry_run


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
    # Show effective dry_run (considering runtime override)
    effective_dry_run = get_effective_dry_run(config)
    return StatusResponse(
        server="coin-auto-trade",
        trading_mode="dry_run" if effective_dry_run else "live",
        active_strategies=len(strategies),
        active_positions=len(positions),
        dry_run=effective_dry_run,
        active_exchanges=list(runtime.exchanges.keys()),
    )


@router.post("/toggle-dry-run")
def toggle_dry_run(
    _=Depends(verify),
    exchange: str | None = None,
    dry_run: bool | None = None,
    config: Config = Depends(get_config),
):
    """토글 또는 설정: dry_run 모드 전환.

    - dry_run=true: 페이퍼 트레이딩 모드
    - dry_run=false: 실거래 모드
    - dry_run=None: 설정값으로 복원
    - exchange 지정 시 해당 거래소만 전환 (미지정 시 전체)
    """
    global _exchange_dry_run

    if dry_run is None:
        # Reset to config value
        if exchange:
            _exchange_dry_run.pop(exchange, None)
        else:
            _exchange_dry_run.clear()
            runtime.dry_run_override = None
        effective = config.dry_run
    elif exchange:
        # Per-exchange control
        _exchange_dry_run[exchange] = dry_run
        effective = dry_run
    else:
        # Global override
        runtime.dry_run_override = dry_run
        effective = dry_run

    # Apply to exchanges
    for exc_name, exc in runtime.exchanges.items():
        if exchange and exc_name != exchange:
            continue
        if dry_run is None:
            # Reset to config
            exc.dry_run = config.dry_run
        else:
            exc.dry_run = dry_run

    mode = "DRY-RUN" if effective else "LIVE"
    target = exchange if exchange else "전체"
    return {
        "success": True,
        "mode": mode,
        "exchange": target,
        "effective_dry_run": effective,
        "message": f"{target} 모드가 {mode}(으)로 전환되었습니다.",
    }


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


@router.get("/trading-mode")
def get_trading_mode(
    _=Depends(verify),
    config: Config = Depends(get_config),
):
    """현재 트레이딩 모드 확인 (설정값 + 런타임 오버라이드)."""
    exchange_modes = {}
    for exc_name, exc in runtime.exchanges.items():
        exchange_modes[exc_name] = {
            "config": config.dry_run,
            "runtime_override": runtime.dry_run_override,
            "per_exchange": _exchange_dry_run.get(exc_name),
            "effective": exc.dry_run,
        }

    return {
        "global": {
            "config": config.dry_run,
            "runtime_override": runtime.dry_run_override,
            "effective": get_effective_dry_run(config),
        },
        "exchanges": exchange_modes,
    }
