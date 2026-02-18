"""
Stock API routes.
"""
from typing import List, Optional
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from src.db import get_db
from src.models import User, Stock, MarketType
from src.utils.auth import get_current_user
from src.services.stock_service import StockService

router = APIRouter(prefix="/api/stocks", tags=["stocks"])


# === Schemas ===
class StockResponse(BaseModel):
    id: int
    symbol: str
    name: str
    market: str
    sector: Optional[str] = None
    industry: Optional[str] = None

    class Config:
        from_attributes = True


class StockPriceResponse(BaseModel):
    symbol: str
    name: str
    price: Optional[float] = None
    change: Optional[float] = None
    change_pct: Optional[float] = None
    volume: Optional[int] = None
    market_cap: Optional[float] = None
    high: Optional[float] = None
    low: Optional[float] = None
    open: Optional[float] = None
    previous_close: Optional[float] = None


class PriceHistoryResponse(BaseModel):
    date: str
    open: float
    high: float
    low: float
    close: float
    volume: int


# === Routes ===
@router.get("/search", response_model=List[StockResponse])
async def search_stocks(
    q: str = Query(..., min_length=1),
    market: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Search stocks by symbol or name."""
    stock_service = StockService(db)
    market_type = MarketType(market) if market else None
    stocks = await stock_service.search_stocks(q, market_type)

    return [
        StockResponse(
            id=s.id,
            symbol=s.symbol,
            name=s.name,
            market=s.market.value,
            sector=s.sector,
            industry=s.industry,
        )
        for s in stocks
    ]


@router.get("/", response_model=List[StockResponse])
async def list_stocks(
    market: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all stocks."""
    stock_service = StockService(db)
    market_type = MarketType(market) if market else None
    stocks = await stock_service.get_all_stocks(market_type)

    return [
        StockResponse(
            id=s.id,
            symbol=s.symbol,
            name=s.name,
            market=s.market.value,
            sector=s.sector,
            industry=s.industry,
        )
        for s in stocks
    ]


@router.get("/{symbol}", response_model=StockPriceResponse)
async def get_stock_price(
    symbol: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get current stock price."""
    stock_service = StockService(db)

    # Determine market from symbol
    # US stocks usually don't have digits or have longer names
    # Korean stocks are 6 digits
    if symbol.isdigit() and len(symbol) == 6:
        # Korean stock
        price_data = await stock_service.fetch_korean_stock_price(symbol)
    else:
        # US stock
        price_data = await stock_service.fetch_us_stock_price(symbol)

    if not price_data:
        raise HTTPException(status_code=404, detail="Stock not found")

    return StockPriceResponse(**price_data)


@router.get("/{symbol}/history", response_model=List[PriceHistoryResponse])
async def get_stock_history(
    symbol: str,
    period: str = Query("1y", regex="^(1d|5d|1mo|3mo|6mo|1y|2y|5y)$"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get stock price history."""
    stock_service = StockService(db)

    # Only support US stocks for now with yfinance
    prices = await stock_service.fetch_us_stock_history(symbol, period)

    return [
        PriceHistoryResponse(
            date=p["date"].isoformat(),
            open=p["open"],
            high=p["high"],
            low=p["low"],
            close=p["close"],
            volume=p["volume"],
        )
        for p in prices
    ]
