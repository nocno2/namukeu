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
    db: Database = Depends(get_db),
):
    if not runtime.config:
        raise HTTPException(status_code=503, detail="서버 초기화 중")
    config = runtime.config

    # 전환 조건 확인 (라이브 모드로 전환 시)
    warnings: list[str] = []
    backtest_valid = False
    paper_ready = False
    paper_trades = 0
    paper_win_rate = 0.0

    if not body.dry_run:  # 라이브 모드 전환 시
        # 페이퍼 트레이딩 통계 조회
        paper_stats = db.get_paper_trading_pnl()
        paper_trades = paper_stats.get("completed_trades", 0)
        paper_win_rate = paper_stats.get("win_rate", 0)

        # 백테스트 조건 확인 (수익률 > 0, 승률 >= 50%, 낙폭 <= 10%, 거래 >= 10)
        backtest_row = db.conn.execute("""
            SELECT COUNT(*) as cnt FROM backtest_results
            WHERE total_return_pct > 0
              AND win_rate >= 50
              AND max_drawdown_pct <= 10
              AND total_trades >= 10
        """).fetchone()
        backtest_valid = (backtest_row["cnt"] or 0) > 0

        # 페이퍼 트레이딩 조건: 거래 >= 10, 승률 >= 50%
        paper_ready = paper_trades >= 10 and paper_win_rate >= 50

        transition_ready = backtest_valid and paper_ready

        # 경고 메시지 생성
        if not backtest_valid:
            warnings.append("백테스트 조건 미충족: 수익률>0, 승률>=50%, 낙폭<=10%, 거래>=10 인 전략이 없습니다")
        if not paper_ready:
            warnings.append(f"페이퍼 트레이딩 조건 미충족: 현재 {paper_trades}건 (필요: 10건), 승률 {paper_win_rate:.1f}% (필요: 50% 이상)")
        if paper_trades < 10:
            warnings.append(f"⚠️ 페이퍼 트레이딩 거래가 부족합니다. 최소 10건 이상의 거래를 권장합니다.")

    config.dry_run = body.dry_run
    for exc in runtime.exchanges.values():
        exc.dry_run = body.dry_run

    return ModeResponse(
        dry_run=config.dry_run,
        mode="dry_run" if config.dry_run else "live",
        transition_ready=backtest_valid and paper_ready if not body.dry_run else False,
        backtest_valid=backtest_valid,
        paper_ready=paper_ready if not body.dry_run else False,
        paper_trades=paper_trades,
        paper_win_rate=paper_win_rate,
        warnings=warnings,
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
    min_trades: int = 10,
    _=Depends(verify),
    db: Database = Depends(get_db),
):
    """Check if paper trading meets criteria for live trading transition.

    Uses same logic as TransitionChecker to accurately determine readiness.
    """
    # Get paper trading P&L
    paper_stats = db.get_paper_trading_pnl()

    # Check backtest results that meet ALL criteria (same as TransitionChecker)
    query = """
        SELECT strategy_name, ticker, total_return_pct, win_rate, max_drawdown_pct, total_trades
        FROM backtest_results
        WHERE total_return_pct > ?
          AND win_rate >= ?
          AND max_drawdown_pct <= ?
          AND total_trades >= ?
        ORDER BY total_return_pct DESC
        LIMIT 1
    """
    row = db.conn.execute(query, [min_return, min_win_rate, max_drawdown, min_trades]).fetchone()

    backtest_ready = row is not None
    best_backtest = None
    if row:
        best_backtest = {
            "strategy_name": row["strategy_name"],
            "ticker": row["ticker"],
            "total_return_pct": row["total_return_pct"],
            "win_rate": row["win_rate"],
            "max_drawdown_pct": row["max_drawdown_pct"],
            "total_trades": row["total_trades"],
        }

    # Get total backtest stats
    all_backtest = db.conn.execute("""
        SELECT COUNT(*) as total,
               SUM(CASE WHEN total_return_pct > 0 THEN 1 ELSE 0 END) as profitable
        FROM backtest_results
    """).fetchone()

    # Check current mode
    is_paper = runtime.config.dry_run if runtime.config else True

    paper_ready = paper_stats["completed_trades"] >= min_trades and paper_stats["win_rate"] >= min_win_rate

    return {
        "paper_trading": {
            "win_rate": paper_stats["win_rate"],
            "total_pnl_pct": paper_stats["total_pnl_pct"],
            "completed_trades": paper_stats["completed_trades"],
            "ready": paper_ready,
        },
        "backtest": {
            "total": all_backtest["total"] or 0,
            "profitable": all_backtest["profitable"] or 0,
            "best_result": best_backtest,
            "ready": backtest_ready,
        },
        "current_mode": "paper" if is_paper else "live",
        "transition_ready": backtest_ready and paper_ready,
    }
