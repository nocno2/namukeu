"""
News API routes.
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from src.db import get_db
from src.models import User, Stock, News
from src.utils.auth import get_current_user
from src.services.news_service import NewsService

router = APIRouter(prefix="/api/news", tags=["news"])


# === Schemas ===
class NewsItemResponse(BaseModel):
    id: int
    title: str
    summary: Optional[str]
    source: str
    url: str
    published_at: str
    symbol: Optional[str] = None

    class Config:
        from_attributes = True


class NewsFetchResponse(BaseModel):
    news: List[dict]


# === Routes ===
@router.get("/", response_model=List[NewsItemResponse])
async def get_news(
    symbol: Optional[str] = None,
    limit: int = Query(50, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get news from database."""
    news_service = NewsService(db)

    stock_id = None
    if symbol:
        result = await db.execute(
            select(Stock).where(Stock.symbol == symbol)
        )
        stock = result.scalar_one_or_none()
        if stock:
            stock_id = stock.id

    news_items = await news_service.get_news(stock_id, limit)

    result = []
    for news in news_items:
        symbol = None
        if news.stock_id:
            stock_result = await db.execute(
                select(Stock).where(Stock.id == news.stock_id)
            )
            stock_obj = stock_result.scalar_one_or_none()
            if stock_obj:
                symbol = stock_obj.symbol

        result.append(NewsItemResponse(
            id=news.id,
            title=news.title,
            summary=news.content,
            source=news.source,
            url=news.url,
            published_at=news.published_at.isoformat(),
            symbol=symbol,
        ))

    return result


@router.get("/fetch", response_model=NewsFetchResponse)
async def fetch_news(
    symbol: Optional[str] = None,
    query: Optional[str] = None,
    limit: int = Query(20, le=50),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Fetch latest news from external sources."""
    news_service = NewsService(db)

    if symbol:
        # Determine market
        if symbol.isdigit() and len(symbol) == 6:
            # Korean stock - use Naver
            news_items = await news_service.fetch_naver_news(symbol, limit)
        else:
            # US stock - use Yahoo
            news_items = await news_service.fetch_yahoo_news(symbol, limit)
    elif query:
        # General search
        news_items = await news_service.fetch_general_news(query, limit)
    else:
        # Default - general financial news
        news_items = await news_service.fetch_general_news("주식 시장", limit)

    # Save to database
    stock_id = None
    if symbol:
        result = await db.execute(
            select(Stock).where(Stock.symbol == symbol)
        )
        stock = result.scalar_one_or_none()
        if stock:
            stock_id = stock.id

    if news_items:
        await news_service.save_news(news_items, stock_id)

    return NewsFetchResponse(news=news_items)
