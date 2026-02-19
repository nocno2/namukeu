from fastapi import APIRouter, Depends, HTTPException

from src.api.auth import verify
from src.core.crypto import CryptoManager
from src.core.database import Database
from src.core import runtime
from src.models.credential import CredentialCreate, CredentialResponse
from src.models.trading import ModeRequest, ModeResponse, OrderResponse, PositionResponse

router = APIRouter(tags=["trading"])


def get_db() -> Database:
    raise NotImplementedError


def get_crypto() -> CryptoManager:
    raise NotImplementedError


# --- Credentials ---


@router.post("/credentials", response_model=CredentialResponse)
def create_credential(
    body: CredentialCreate,
    _=Depends(verify),
    db: Database = Depends(get_db),
    crypto: CryptoManager = Depends(get_crypto),
):
    if body.provider not in ("upbit", "binance", "binance_futures"):
        raise HTTPException(status_code=400, detail=f"Unsupported provider: {body.provider}")
    encrypted_access = crypto.encrypt(body.access_key)
    encrypted_secret = crypto.encrypt(body.secret_key)
    db.save_credential(body.provider, encrypted_access, encrypted_secret)

    cred = db.get_credential(body.provider)
    return CredentialResponse(
        provider=cred["provider"],
        created_at=cred["created_at"],
        updated_at=cred["updated_at"],
    )


@router.delete("/credentials/{provider}")
def delete_credential(
    provider: str = "upbit",
    _=Depends(verify),
    db: Database = Depends(get_db),
):
    if not db.delete_credential(provider):
        raise HTTPException(status_code=404, detail="Credential not found")
    return {"message": f"{provider} 자격증명 삭제 완료"}


# --- Trading Mode ---


@router.get("/trading/mode", response_model=ModeResponse)
def get_mode(
    _=Depends(verify),
):
    if not runtime.config:
        raise HTTPException(status_code=503, detail="서버 초기화 중")
    config = runtime.config
    return ModeResponse(
        dry_run=config.dry_run,
        mode="dry_run" if config.dry_run else "live",
    )


@router.post("/trading/mode", response_model=ModeResponse)
def set_mode(
    body: ModeRequest,
    _=Depends(verify),
):
    if not runtime.config:
        raise HTTPException(status_code=503, detail="서버 초기화 중")
    config = runtime.config
    config.dry_run = body.dry_run
    for exc in runtime.exchanges.values():
        exc.dry_run = body.dry_run
    return ModeResponse(
        dry_run=config.dry_run,
        mode="dry_run" if config.dry_run else "live",
    )


# --- Orders & Positions ---


@router.get("/trading/orders", response_model=list[OrderResponse])
def list_orders(
    ticker: str | None = None,
    limit: int = 50,
    offset: int = 0,
    _=Depends(verify),
    db: Database = Depends(get_db),
):
    orders = db.get_orders(ticker=ticker, limit=limit, offset=offset)
    return [OrderResponse(**{**o, "is_dry_run": bool(o["is_dry_run"])}) for o in orders]


@router.get("/trading/positions", response_model=list[PositionResponse])
def list_positions(
    _=Depends(verify),
    db: Database = Depends(get_db),
):
    return db.get_positions()


# --- Trading Control ---


@router.post("/trading/start")
async def start_trading(exchange: str | None = None, _=Depends(verify)):
    if exchange:
        sched = runtime.schedulers.get(exchange)
        if not sched:
            raise HTTPException(status_code=503, detail=f"{exchange} 거래소가 초기화되지 않았습니다")
        await sched.restore_enabled()
        return {"message": f"[{exchange}] 활성 전략 매매 시작"}
    else:
        if not runtime.schedulers:
            raise HTTPException(status_code=503, detail="거래소 자격증명이 등록되지 않았습니다")
        for sched in runtime.schedulers.values():
            await sched.restore_enabled()
        return {"message": "전체 거래소 활성 전략 매매 시작"}


@router.post("/trading/stop")
async def stop_trading(exchange: str | None = None, _=Depends(verify)):
    if exchange:
        sched = runtime.schedulers.get(exchange)
        if not sched:
            raise HTTPException(status_code=503, detail=f"{exchange} 거래소가 초기화되지 않았습니다")
        await sched.stop_all()
        return {"message": f"[{exchange}] 매매 중단"}
    else:
        if not runtime.schedulers:
            raise HTTPException(status_code=503, detail="거래소 자격증명이 등록되지 않았습니다")
        for sched in runtime.schedulers.values():
            await sched.stop_all()
        return {"message": "전체 매매 중단"}


# --- Paper Trading Stats ---


@router.get("/trading/paper-stats")
def get_paper_trading_stats(
    _=Depends(verify),
    db: Database = Depends(get_db),
):
    """Get paper trading (dry-run) statistics."""
    stats = db.get_paper_trading_stats()
    return stats


@router.get("/trading/paper-pnl")
def get_paper_trading_pnl(
    initial_capital: float = 1_000_000,
    _=Depends(verify),
    db: Database = Depends(get_db),
):
    """Calculate P&L from paper trading orders."""
    return db.get_paper_trading_pnl(initial_capital)


@router.get("/trading/readiness")
def get_readiness_check(
    min_win_rate: float = 50.0,
    max_drawdown: float = 10.0,
    min_return: float = 0.0,
    _=Depends(verify),
    db: Database = Depends(get_db),
):
    """Check if paper trading meets criteria for live trading transition."""
    # Get paper trading P&L
    paper_stats = db.get_paper_trading_pnl()

    # Get best backtest result
    best_backtest = db.get_backtest_results(limit=1)
    backtest_ready = False
    if best_backtest:
        bt = best_backtest[0]
        backtest_ready = (
            bt["total_return_pct"] > min_return and
            bt["win_rate"] >= min_win_rate and
            bt["max_drawdown_pct"] <= max_drawdown
        )

    # Check current mode
    is_paper = runtime.config.dry_run if runtime.config else True

    return {
        "paper_trading": {
            "win_rate": paper_stats["win_rate"],
            "total_pnl_pct": paper_stats["total_pnl_pct"],
            "completed_trades": paper_stats["completed_trades"],
            "ready": paper_stats["completed_trades"] >= 10 and paper_stats["win_rate"] >= min_win_rate,
        },
        "backtest": {
            "best_return_pct": best_backtest[0]["total_return_pct"] if best_backtest else 0,
            "best_win_rate": best_backtest[0]["win_rate"] if best_backtest else 0,
            "best_max_drawdown": best_backtest[0]["max_drawdown_pct"] if best_backtest else 0,
            "ready": backtest_ready,
        },
        "current_mode": "paper" if is_paper else "live",
        "transition_ready": backtest_ready and paper_stats["completed_trades"] >= 10,
    }
