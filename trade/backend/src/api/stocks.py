"""
Stock API routes.
"""
from typing import List, Optional
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from src.db import get_db
from src.models import Stock, MarketType
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


class StockListItem(BaseModel):
    symbol: str
    name: str
    price: Optional[float] = None
    change: Optional[float] = None
    change_pct: Optional[float] = None
    history: Optional[List[dict]] = None


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


@router.get("/popular/", response_model=List[StockListItem])
async def get_popular_stocks(
    market: Optional[str] = "US",
    limit: int = Query(20, le=50),
    db: AsyncSession = Depends(get_db),
):
    """Get popular stocks with price and mini chart data."""
    stock_service = StockService(db)
    market_type = MarketType(market) if market else None

    # Get popular symbols based on market
    if market_type == MarketType.US:
        symbols = ["AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA", "BRK-B",
                   "JPM", "V", "UNH", "HD", "MA", "PG", "JNJ", "XOM", "CVX",
                   "ABBV", "PEP", "KO"]
    elif market_type == MarketType.KOSPI:
        symbols = ["005930", "000660", "035420", "207940", "068270", "005380",
                   "012330", "096770", "028260", "004020"]
    elif market_type == MarketType.KOSDAQ:
        symbols = ["035720", "095340", "066410", "058470", "047810", "214370",
                   "078150", "011070", "029460", "036830"]
    else:
        symbols = ["AAPL", "MSFT", "GOOGL", "AMZN", "NVDA"]

    symbols = symbols[:limit]

    result = []
    for symbol in symbols:
        try:
            # Get price
            price_data = await stock_service.fetch_us_stock_price(symbol) if market_type == MarketType.US else await stock_service.fetch_korean_stock_price(symbol)
            if not price_data:
                continue

            # Get mini chart (last 30 days)
            history = await stock_service.fetch_us_stock_history(symbol, "1mo") if market_type == MarketType.US else []

            # Calculate change
            if history and len(history) >= 2:
                first_close = history[0]["close"]
                last_close = history[-1]["close"]
                change = last_close - first_close
                change_pct = (change / first_close * 100) if first_close > 0 else 0
            else:
                change = price_data.get("change", 0)
                change_pct = 0

            result.append(StockListItem(
                symbol=symbol,
                name=price_data.get("name", symbol),
                price=price_data.get("price"),
                change=change,
                change_pct=change_pct,
                history=history[-30:] if history else None,
            ))
        except Exception as e:
            print(f"Error fetching {symbol}: {e}")
            continue

    return result


@router.get("/{symbol}", response_model=StockPriceResponse)
async def get_stock_price(
    symbol: str,
    db: AsyncSession = Depends(get_db),
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
    period: str = Query("1y", regex="^(1m|5m|15m|30m|1h|4h|1d|5d|1wk|1mo|3mo|6mo|1y|2y|5y)$"),
    db: AsyncSession = Depends(get_db),
):
    """Get stock price history."""
    stock_service = StockService(db)

    # Only support US stocks for now with yfinance
    prices = await stock_service.fetch_us_stock_history(symbol, period)

    return [
        PriceHistoryResponse(
            date=p["date"] if isinstance(p["date"], str) else p["date"].isoformat(),
            open=p["open"],
            high=p["high"],
            low=p["low"],
            close=p["close"],
            volume=p["volume"],
        )
        for p in prices
    ]
