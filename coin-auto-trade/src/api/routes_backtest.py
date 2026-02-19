import json
import logging

from fastapi import APIRouter, Depends, HTTPException

from src.api.auth import verify
from src.core.database import Database
from src.core import runtime
from src.models.backtest import BackfillRequest, BacktestRequest, BacktestResultResponse, OptimizeRequest

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/backtest", tags=["backtest"])


def get_db() -> Database:
    raise NotImplementedError


@router.post("/run")
async def run_backtest(
    body: BacktestRequest,
    _=Depends(verify),
    db: Database = Depends(get_db),
):
    from src.services.backtester import Backtester, BacktestConfig
    backtester = Backtester(db)
    fee_rate = 0.0004 if body.leverage > 1 else 0.0005  # futures vs spot default
    config = BacktestConfig(
        ticker=body.ticker,
        strategy_name=body.strategy_name,
        strategy_params=body.params,
        interval=body.interval,
        start_date=body.start_date,
        end_date=body.end_date,
        initial_capital=body.initial_capital,
        fee_rate=fee_rate,
        leverage=body.leverage,
        enable_short=body.enable_short,
        trailing_stop_pct=body.trailing_stop_pct,
        stop_loss_pct=body.stop_loss_pct,
    )
    try:
        result = await backtester.run(config)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception("백테스트 실행 중 오류: %s", e)
        raise HTTPException(status_code=500, detail=str(e))

    result_id = backtester.save_result(result)
    return {
        "id": result_id,
        "total_return_pct": result.total_return_pct,
        "max_drawdown_pct": result.max_drawdown_pct,
        "sharpe_ratio": result.sharpe_ratio,
        "win_rate": result.win_rate,
        "total_trades": result.total_trades,
        "profit_factor": result.profit_factor,
        "final_capital": result.final_capital,
    }


@router.post("/data/backfill")
async def backfill_data(
    body: BackfillRequest,
    _=Depends(verify),
):
    collector = None
    if body.exchange and body.exchange in runtime.collectors:
        collector = runtime.collectors[body.exchange]
    else:
        collector = runtime.collector
    if not collector:
        raise HTTPException(status_code=503, detail="거래소 자격증명이 등록되지 않았습니다")

    try:
        count = await collector.backfill(body.ticker, body.interval, body.days)
    except Exception as e:
        logger.exception("데이터 백필 중 오류: %s", e)
        raise HTTPException(status_code=500, detail=str(e))
    return {"message": f"{count}개 캔들 수집 완료", "ticker": body.ticker, "count": count}


@router.post("/optimize")
async def optimize_strategy(
    body: OptimizeRequest,
    _=Depends(verify),
    db: Database = Depends(get_db),
):
    import itertools
    from src.services.backtester import Backtester, BacktestConfig

    backtester = Backtester(db)
    fee_rate = 0.0004 if body.leverage > 1 else 0.0005

    # Build param combinations from grid
    keys = list(body.param_grid.keys())
    values = [body.param_grid[k] if isinstance(body.param_grid[k], list) else [body.param_grid[k]] for k in keys]
    combinations = [dict(zip(keys, combo)) for combo in itertools.product(*values)]

    if len(combinations) > 200:
        raise HTTPException(status_code=400, detail=f"조합 수 초과: {len(combinations)} (최대 200)")

    results = []
    for combo in combinations:
        config = BacktestConfig(
            ticker=body.ticker,
            strategy_name=body.strategy_name,
            strategy_params=combo,
            interval=body.interval,
            start_date=body.start_date,
            end_date=body.end_date,
            initial_capital=body.initial_capital,
            fee_rate=fee_rate,
            leverage=body.leverage,
            enable_short=body.enable_short,
            trailing_stop_pct=body.trailing_stop_pct,
            stop_loss_pct=body.stop_loss_pct,
        )
        try:
            result = await backtester.run(config)
            results.append({
                "params": combo,
                "total_return_pct": result.total_return_pct,
                "max_drawdown_pct": result.max_drawdown_pct,
                "sharpe_ratio": result.sharpe_ratio,
                "win_rate": result.win_rate,
                "total_trades": result.total_trades,
                "profit_factor": result.profit_factor,
                "final_capital": result.final_capital,
            })
        except Exception as e:
            logger.warning("최적화 조합 실패 %s: %s", combo, e)
            continue

    # Sort by Sharpe ratio desc, then return pct desc
    results.sort(key=lambda r: (r["sharpe_ratio"], r["total_return_pct"]), reverse=True)
    return {
        "total_combinations": len(combinations),
        "completed": len(results),
        "top_results": results[:body.top_n],
    }


@router.get("/results", response_model=list[BacktestResultResponse])
def list_results(
    limit: int = 20,
    _=Depends(verify),
    db: Database = Depends(get_db),
):
    results = db.get_backtest_results(limit=limit)
    return results


@router.get("/results/{result_id}")
def get_result(
    result_id: int,
    _=Depends(verify),
    db: Database = Depends(get_db),
):
    result = db.get_backtest_result(result_id)
    if not result:
        raise HTTPException(status_code=404, detail="Backtest result not found")
    return result


@router.get("/results/best/profitable")
def get_best_profitable_result(
    _=Depends(verify),
    db: Database = Depends(get_db),
):
    """수익성最高的 백테스트 결과 조회 (페이퍼/라이브 트레이딩 시작용).

    조건: total_return_pct > 0, total_trades >= 10
    정렬: total_return_pct DESC
    """
    row = db.conn.execute("""
        SELECT id, strategy_name, ticker, interval, params,
               total_return_pct, max_drawdown_pct, win_rate, total_trades,
               sharpe_ratio, profit_factor
        FROM backtest_results
        WHERE total_return_pct > 0 AND total_trades >= 10
        ORDER BY total_return_pct DESC
        LIMIT 1
    """).fetchone()

    if not row:
        # 조건放宽: 거래 10회 이상만
        row = db.conn.execute("""
            SELECT id, strategy_name, ticker, interval, params,
                   total_return_pct, max_drawdown_pct, win_rate, total_trades,
                   sharpe_ratio, profit_factor
            FROM backtest_results
            WHERE total_return_pct > 0
            ORDER BY total_return_pct DESC
            LIMIT 1
        """).fetchone()

        if not row:
            raise HTTPException(
                status_code=404,
                detail="수익성 백테스트 결과가 없습니다. 먼저 백테스트를 실행하세요.",
            )

    params = json.loads(row["params"]) if isinstance(row["params"], str) else row["params"]

    return {
        "result_id": row["id"],
        "strategy_name": row["strategy_name"],
        "ticker": row["ticker"],
        "interval": row["interval"],
        "params": params,
        "metrics": {
            "total_return_pct": row["total_return_pct"],
            "max_drawdown_pct": row["max_drawdown_pct"],
            "win_rate": row["win_rate"],
            "total_trades": row["total_trades"],
            "sharpe_ratio": row["sharpe_ratio"],
            "profit_factor": row["profit_factor"],
        },
        "next_action": {
            "paper_trading": f"/backtest/results/{row['id']}/start-paper",
            "validate": f"/backtest/results/{row['id']}/validate",
        },
    }


@router.get("/results/{result_id}/validate")
def validate_for_trading(
    result_id: int,
    _=Depends(verify),
    db: Database = Depends(get_db),
):
    """백테스트 결과를 기반으로 라이브/페이퍼 트레이딩 전환 가능 여부 검증."""
    from src.services.risk_manager import RiskManager, RiskLimits, TradingChecklist

    result = db.get_backtest_result(result_id)
    if not result:
        raise HTTPException(status_code=404, detail="백테스트 결과를 찾을 수 없습니다")

    # 기본값으로 RiskManager 생성 (limits는 사용 안 함)
    limits = RiskLimits()
    risk_manager = RiskManager(db, limits)

    # 체크리스트 조건으로 검증
    checklist = TradingChecklist(
        min_backtest_return_pct=0.0,
        min_backtest_win_rate_pct=50.0,
        max_backtest_drawdown_pct=10.0,
        min_backtest_trades=10,
    )

    eligibility = risk_manager.validate_trading_eligibility(
        backtest_return_pct=result["total_return_pct"],
        backtest_win_rate_pct=result["win_rate"],
        backtest_drawdown_pct=result["max_drawdown_pct"],
        backtest_total_trades=result["total_trades"],
        checklist=checklist,
    )

    # params 파싱
    params = json.loads(result["params"]) if isinstance(result["params"], str) else result["params"]

    return {
        "result_id": result_id,
        "strategy_name": result["strategy_name"],
        "ticker": result["ticker"],
        "interval": result["interval"],
        "params": params,
        "backtest_metrics": {
            "total_return_pct": result["total_return_pct"],
            "win_rate": result["win_rate"],
            "max_drawdown_pct": result["max_drawdown_pct"],
            "total_trades": result["total_trades"],
        },
        "checklist": {
            "min_return_pct": checklist.min_backtest_return_pct,
            "min_win_rate_pct": checklist.min_backtest_win_rate_pct,
            "max_drawdown_pct": checklist.max_backtest_drawdown_pct,
            "min_trades": checklist.min_backtest_trades,
        },
        "eligibility": {
            "can_live_trade": eligibility.eligible,
            "can_paper_trade": eligibility.can_paper_trade,
            "reasons": eligibility.reasons,
        },
    }


@router.post("/results/{result_id}/start-paper")
async def start_paper_trading(
    result_id: int,
    exchange: str = "upbit",
    _=Depends(verify),
    db: Database = Depends(get_db),
):
    """백테스트 결과를 기반으로 페이퍼 트레이딩 시작 (dry_run=True).

    - 백테스트 결과 검증 수행
    - strategy config 생성 후 활성화
    - dry_run 모드로 trading 시작
    """
    from src.services.risk_manager import RiskManager, RiskLimits, TradingChecklist
    from src.models.strategy import StrategyConfigCreate

    result = db.get_backtest_result(result_id)
    if not result:
        raise HTTPException(status_code=404, detail="백테스트 결과를 찾을 수 없습니다")

    # params 파싱
    params = json.loads(result["params"]) if isinstance(result["params"], str) else result["params"]

    # 검증 수행
    limits = RiskLimits()
    risk_manager = RiskManager(db, limits)
    checklist = TradingChecklist(
        min_backtest_return_pct=0.0,
        min_backtest_win_rate_pct=50.0,
        max_backtest_drawdown_pct=10.0,
        min_backtest_trades=10,
    )
    eligibility = risk_manager.validate_trading_eligibility(
        backtest_return_pct=result["total_return_pct"],
        backtest_win_rate_pct=result["win_rate"],
        backtest_drawdown_pct=result["max_drawdown_pct"],
        backtest_total_trades=result["total_trades"],
        checklist=checklist,
    )

    # 페이퍼 트레이딩은 거래 횟수만 충족하면 가능
    if not eligibility.can_paper_trade:
        raise HTTPException(
            status_code=400,
            detail=f"페이퍼 트레이딩 불가: {eligibility.reasons[0] if eligibility.reasons else '조건 미충족'}",
        )

    # strategy config 생성
    strategy = StrategyConfigCreate(
        name=result["strategy_name"],
        ticker=result["ticker"],
        params=params,
        interval=result["interval"],
        exchange=exchange,
    )
    strategy_id = db.create_strategy(
        strategy.name,
        strategy.ticker,
        strategy.params,
        strategy.interval,
        exchange=strategy.exchange,
    )

    # 활성화
    db.set_strategy_enabled(strategy_id, True)

    # dry_run 모드로 설정
    if not runtime.config:
        raise HTTPException(status_code=503, detail="서버 초기화 중")
    runtime.config.dry_run = True
    for exc in runtime.exchanges.values():
        exc.dry_run = True

    # trading 시작
    sched = runtime.schedulers.get(exchange)
    if not sched:
        raise HTTPException(status_code=503, detail=f"{exchange} 거래소가 초기화되지 않았습니다")

    sched.start_trading(result["ticker"], result["strategy_name"], params, strategy_id)

    return {
        "message": f"페이퍼 트레이딩 시작: {result['strategy_name']} on {result['ticker']}",
        "result_id": result_id,
        "strategy_id": strategy_id,
        "exchange": exchange,
        "dry_run": True,
        "validation": {
            "can_live_trade": eligibility.eligible,
            "can_paper_trade": eligibility.can_paper_trade,
            "reasons": eligibility.reasons,
        },
    }


@router.post("/results/{result_id}/start-live")
async def start_live_trading(
    result_id: int,
    exchange: str = "upbit",
    max_position_pct: float = 5.0,
    _=Depends(verify),
    db: Database = Depends(get_db),
):
    """백테스트 결과를 기반으로 라이브 트레이딩 시작 (dry_run=False).

    - 백테스트 결과 검증 수행 (모든 조건 충족 필요)
    - strategy config 생성 후 활성화
    - live 모드로 trading 시작
    - max_position_pct: 단일 포지션당 최대 금액 비율 (기본 5%, 소액 거래용)
    """
    from src.services.risk_manager import RiskManager, RiskLimits, TradingChecklist
    from src.models.strategy import StrategyConfigCreate

    result = db.get_backtest_result(result_id)
    if not result:
        raise HTTPException(status_code=404, detail="백테스트 결과를 찾을 수 없습니다")

    # 포지션 사이즈 유효성 검증
    if max_position_pct <= 0 or max_position_pct > 100:
        raise HTTPException(status_code=400, detail="max_position_pct는 0~100 사이여야 합니다")

    # params 파싱
    params = json.loads(result["params"]) if isinstance(result["params"], str) else result["params"]

    # 검증 수행 - 포지션 사이즈 제한 적용
    limits = RiskLimits(max_position_size_pct=max_position_pct)
    risk_manager = RiskManager(db, limits)
    checklist = TradingChecklist(
        min_backtest_return_pct=0.0,
        min_backtest_win_rate_pct=50.0,
        max_backtest_drawdown_pct=10.0,
        min_backtest_trades=10,
    )
    eligibility = risk_manager.validate_trading_eligibility(
        backtest_return_pct=result["total_return_pct"],
        backtest_win_rate_pct=result["win_rate"],
        backtest_drawdown_pct=result["max_drawdown_pct"],
        backtest_total_trades=result["total_trades"],
        checklist=checklist,
    )

    # 라이브 트레이딩은 모든 조건 충족 필요
    if not eligibility.eligible:
        raise HTTPException(
            status_code=400,
            detail=f"라이브 트레이딩 불가: {eligibility.reasons[0] if eligibility.reasons else '조건 미충족'}",
        )

    # strategy config 생성
    strategy = StrategyConfigCreate(
        name=result["strategy_name"],
        ticker=result["ticker"],
        params=params,
        interval=result["interval"],
        exchange=exchange,
    )
    strategy_id = db.create_strategy(
        strategy.name,
        strategy.ticker,
        strategy.params,
        strategy.interval,
        exchange=strategy.exchange,
    )

    # 활성화
    db.set_strategy_enabled(strategy_id, True)

    # live 모드로 설정 (dry_run=False)
    if not runtime.config:
        raise HTTPException(status_code=503, detail="서버 초기화 중")
    runtime.config.dry_run = False
    for exc in runtime.exchanges.values():
        exc.dry_run = False

    # trading 시작 - 포지션 사이즈 제한 적용
    sched = runtime.schedulers.get(exchange)
    if not sched:
        raise HTTPException(status_code=503, detail=f"{exchange} 거래소가 초기화되지 않았습니다")

    # RiskManager의 limits를 scheduler에 적용
    sched.risk_manager = risk_manager

    sched.start_trading(result["ticker"], result["strategy_name"], params, strategy_id)

    return {
        "message": f"라이브 트레이딩 시작: {result['strategy_name']} on {result['ticker']}",
        "result_id": result_id,
        "strategy_id": strategy_id,
        "exchange": exchange,
        "dry_run": False,
        "max_position_pct": max_position_pct,
        "validation": {
            "can_live_trade": eligibility.eligible,
            "can_paper_trade": eligibility.can_paper_trade,
            "reasons": eligibility.reasons,
        },
    }
