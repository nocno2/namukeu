"""
Stock data service - fetches and manages stock data.
"""
import asyncio
from datetime import datetime, timedelta
from typing import Optional, List
import yfinance as yf
from bs4 import BeautifulSoup
import httpx
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession
from src.models import Stock, Price, MarketType
from src.config import USER_AGENT


class StockService:
    """Service for fetching and managing stock data."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_or_create_stock(
        self,
        symbol: str,
        name: str,
        market: MarketType,
        sector: Optional[str] = None,
        industry: Optional[str] = None,
    ) -> Stock:
        """Get existing stock or create new one."""
        result = await self.db.execute(
            select(Stock).where(Stock.symbol == symbol)
        )
        stock = result.scalar_one_or_none()

        if not stock:
            stock = Stock(
                symbol=symbol,
                name=name,
                market=market,
                sector=sector,
                industry=industry,
            )
            self.db.add(stock)
            await self.db.commit()
            await self.db.refresh(stock)

        return stock

    async def fetch_us_stock_price(self, symbol: str) -> Optional[dict]:
        """Fetch US stock price using yfinance."""
        try:
            ticker = yf.Ticker(symbol)
            info = ticker.info

            return {
                "symbol": symbol,
                "name": info.get("shortName", symbol),
                "price": info.get("currentPrice") or info.get("regularMarketPrice"),
                "change": info.get("regularMarketChange"),
                "change_pct": info.get("regularMarketChangePercent"),
                "volume": info.get("regularMarketVolume"),
                "market_cap": info.get("marketCap"),
                "high": info.get("regularMarketDayHigh"),
                "low": info.get("regularMarketDayLow"),
                "open": info.get("regularMarketOpen"),
                "previous_close": info.get("regularMarketPreviousClose"),
            }
        except Exception as e:
            print(f"Error fetching US stock {symbol}: {e}")
            return None

    async def fetch_us_stock_history(
        self, symbol: str, period: str = "1y"
    ) -> List[dict]:
        """Fetch US stock historical data."""
        try:
            ticker = yf.Ticker(symbol)
            hist = ticker.history(period=period)

            return [
                {
                    "date": row.index.to_pydatetime(),
                    "open": row["Open"],
                    "high": row["High"],
                    "low": row["Low"],
                    "close": row["Close"],
                    "volume": int(row["Volume"]),
                }
                for row in hist.itertuples()
            ]
        except Exception as e:
            print(f"Error fetching US stock history {symbol}: {e}")
            return []

    async def fetch_korean_stock_price(self, symbol: str) -> Optional[dict]:
        """Fetch Korean stock price from Naver Finance."""
        try:
            url = f"https://finance.naver.com/item/main.naver?code={symbol}"
            headers = {"User-Agent": USER_AGENT}

            async with httpx.AsyncClient() as client:
                resp = await client.get(url, headers=headers, timeout=10)
                soup = BeautifulSoup(resp.text, "lxml")

                # Extract price data
                today = soup.select_one(".today")
                price_elem = today.select_one(".blind")
                price = price_elem.text.replace(",", "") if price_elem else None

                # Get change
                change_elem = soup.select_one(".upday .blind") or soup.select_one(".downday .blind")
                change = change_elem.text.replace(",", "") if change_elem else "0"

                return {
                    "symbol": symbol,
                    "price": float(price) if price else 0,
                    "change": float(change) if change else 0,
                }
        except Exception as e:
            print(f"Error fetching Korean stock {symbol}: {e}")
            return None

    async def save_price_history(
        self, stock_id: int, prices: List[dict]
    ) -> None:
        """Save price history to database."""
        for p in prices:
            price = Price(
                stock_id=stock_id,
                date=p["date"],
                open=p["open"],
                high=p["high"],
                low=p["low"],
                close=p["close"],
                volume=p["volume"],
            )
            self.db.add(price)

        await self.db.commit()

    async def get_price_history(
        self,
        stock_id: int,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
    ) -> List[Price]:
        """Get price history for a stock."""
        query = select(Price).where(Price.stock_id == stock_id)

        if start_date:
            query = query.where(Price.date >= start_date)
        if end_date:
            query = query.where(Price.date <= end_date)

        query = query.order_by(Price.date.asc())

        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def search_stocks(self, query: str, market: Optional[MarketType] = None) -> List[Stock]:
        """Search stocks by symbol or name."""
        stmt = select(Stock).where(
            (Stock.symbol.ilike(f"%{query}%")) | (Stock.name.ilike(f"%{query}%"))
        )

        if market:
            stmt = stmt.where(Stock.market == market)

        stmt = stmt.limit(20)

        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def get_all_stocks(self, market: Optional[MarketType] = None) -> List[Stock]:
        """Get all stocks."""
        stmt = select(Stock)

        if market:
            stmt = stmt.where(Stock.market == market)

        stmt = stmt.order_by(Stock.symbol.asc())

        result = await self.db.execute(stmt)
        return list(result.scalars().all())
