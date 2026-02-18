"""
Strategy API routes.
"""
from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from src.db import get_db
from src.models import User, Strategy, StrategyStatus, BacktestResult, MarketType
from src.utils.auth import get_current_user
from src.services.trading_service import TradingService
from src.services.stock_service import StockService

router = APIRouter(prefix="/api/strategies", tags=["strategies"])


# === Schemas ===
class StrategyCreate(BaseModel):
    name: str
    description: Optional[str] = None
    logic: dict  # {"type": "RSI", "params": {...}}
    market: str  # "KOSPI", "KOSDAQ", "US"
    symbols: str  # comma-separated


class StrategyResponse(BaseModel):
    id: int
    name: str
    description: Optional[str]
    logic: dict
    market: str
    symbols: str
    status: str
    last_run_at: Optional[str]
    created_at: str

    class Config:
        from_attributes = True


class StrategyUpdate(BaseModel):
    status: str  # "ACTIVE", "PAUSED", "STOPPED"


class BacktestCreate(BaseModel):
    strategy_id: int
    symbol: str
    start_date: str
    end_date: str
    initial_capital: float = 10000000


class BacktestResponse(BaseModel):
    id: int
    strategy_id: int
    symbol: str
    start_date: str
    end_date: str
    initial_capital: float
    final_capital: float
    total_return: float
    trades: int


# === Routes ===
@router.get("/", response_model=List[StrategyResponse])
async def list_strategies(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List user's strategies."""
    trading_service = TradingService(db)
    strategies = await trading_service.get_strategies(current_user.id)

    return [
        StrategyResponse(
            id=s.id,
            name=s.name,
            description=s.description,
            logic=s.logic,
            market=s.market.value,
            symbols=s.symbols,
            status=s.status.value,
            last_run_at=s.last_run_at.isoformat() if s.last_run_at else None,
            created_at=s.created_at.isoformat(),
        )
        for s in strategies
    ]


@router.post("/", response_model=StrategyResponse, status_code=201)
async def create_strategy(
    strategy_data: StrategyCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new strategy."""
    trading_service = TradingService(db)

    strategy = await trading_service.create_strategy(
        user_id=current_user.id,
        name=strategy_data.name,
        description=strategy_data.description,
        logic=strategy_data.logic,
        market=MarketType(strategy_data.market),
        symbols=strategy_data.symbols,
    )

    return StrategyResponse(
        id=strategy.id,
        name=strategy.name,
        description=strategy.description,
        logic=strategy.logic,
        market=strategy.market.value,
        symbols=strategy.symbols,
        status=strategy.status.value,
        last_run_at=strategy.last_run_at.isoformat() if strategy.last_run_at else None,
        created_at=strategy.created_at.isoformat(),
    )


@router.get("/{strategy_id}", response_model=StrategyResponse)
async def get_strategy(
    strategy_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get a strategy by ID."""
    result = await db.execute(
        select(Strategy).where(
            Strategy.id == strategy_id,
            Strategy.user_id == current_user.id,
        )
    )
    strategy = result.scalar_one_or_none()

    if not strategy:
        raise HTTPException(status_code=404, detail="Strategy not found")

    return StrategyResponse(
        id=strategy.id,
        name=strategy.name,
        description=strategy.description,
        logic=strategy.logic,
        market=strategy.market.value,
        symbols=strategy.symbols,
        status=strategy.status.value,
        last_run_at=strategy.last_run_at.isoformat() if strategy.last_run_at else None,
        created_at=strategy.created_at.isoformat(),
    )


@router.patch("/{strategy_id}", response_model=StrategyResponse)
async def update_strategy(
    strategy_id: int,
    update_data: StrategyUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update a strategy."""
    result = await db.execute(
        select(Strategy).where(
            Strategy.id == strategy_id,
            Strategy.user_id == current_user.id,
        )
    )
    strategy = result.scalar_one_or_none()

    if not strategy:
        raise HTTPException(status_code=404, detail="Strategy not found")

    strategy.status = StrategyStatus(update_data.status)
    await db.commit()
    await db.refresh(strategy)

    return StrategyResponse(
        id=strategy.id,
        name=strategy.name,
        description=strategy.description,
        logic=strategy.logic,
        market=strategy.market.value,
        symbols=strategy.symbols,
        status=strategy.status.value,
        last_run_at=strategy.last_run_at.isoformat() if strategy.last_run_at else None,
        created_at=strategy.created_at.isoformat(),
    )


@router.delete("/{strategy_id}")
async def delete_strategy(
    strategy_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a strategy."""
    result = await db.execute(
        select(Strategy).where(
            Strategy.id == strategy_id,
            Strategy.user_id == current_user.id,
        )
    )
    strategy = result.scalar_one_or_none()

    if not strategy:
        raise HTTPException(status_code=404, detail="Strategy not found")

    await db.delete(strategy)
    await db.commit()

    return {"message": "Strategy deleted"}


# === Backtest ===
@router.post("/backtest", response_model=BacktestResponse)
async def run_backtest(
    backtest_data: BacktestCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Run a backtest for a strategy."""
    trading_service = TradingService(db)

    start_date = datetime.fromisoformat(backtest_data.start_date)
    end_date = datetime.fromisoformat(backtest_data.end_date)

    result = await trading_service.run_backtest(
        user_id=current_user.id,
        strategy_id=backtest_data.strategy_id,
        symbol=backtest_data.symbol,
        start_date=start_date,
        end_date=end_date,
        initial_capital=backtest_data.initial_capital,
    )

    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])

    return BacktestResponse(
        id=result["id"],
        strategy_id=backtest_data.strategy_id,
        symbol=backtest_data.symbol,
        start_date=backtest_data.start_date,
        end_date=backtest_data.end_date,
        initial_capital=backtest_data.initial_capital,
        final_capital=result["final_capital"],
        total_return=result["total_return"],
        trades=result["trades"],
    )
