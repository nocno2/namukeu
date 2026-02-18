"""
Watchlist API routes.
"""
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from src.db import get_db
from src.models import User, Watchlist
from src.utils.auth import get_current_user
from src.services.stock_service import StockService

router = APIRouter(prefix="/api/watchlist", tags=["watchlist"])


# === Schemas ===
class WatchlistCreate(BaseModel):
    name: str
    symbols: str  # comma-separated


class WatchlistItem(BaseModel):
    symbol: str
    name: str
    price: float | None = None
    change: float | None = None
    change_pct: float | None = None


class WatchlistResponse(BaseModel):
    id: int
    name: str
    symbols: str

    class Config:
        from_attributes = True


class WatchlistWithPrices(BaseModel):
    id: int
    name: str
    items: List[WatchlistItem]


# === Routes ===
@router.get("/", response_model=List[WatchlistWithPrices])
async def get_watchlists(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get user's watchlists with current prices."""
    result = await db.execute(
        select(Watchlist).where(Watchlist.user_id == current_user.id)
    )
    watchlists = result.scalars().all()

    stock_service = StockService(db)
    output = []

    for wl in watchlists:
        symbols = [s.strip() for s in wl.symbols.split(",") if s.strip()]
        items = []

        for symbol in symbols:
            # Try to get price
            if symbol.isdigit() and len(symbol) == 6:
                price_data = await stock_service.fetch_korean_stock_price(symbol)
            else:
                price_data = await stock_service.fetch_us_stock_price(symbol)

            if price_data:
                items.append(WatchlistItem(
                    symbol=symbol,
                    name=price_data.get("name", symbol),
                    price=price_data.get("price"),
                    change=price_data.get("change"),
                    change_pct=price_data.get("change_pct"),
                ))
            else:
                items.append(WatchlistItem(
                    symbol=symbol,
                    name=symbol,
                    price=None,
                    change=None,
                    change_pct=None,
                ))

        output.append(WatchlistWithPrices(
            id=wl.id,
            name=wl.name,
            items=items,
        ))

    return output


@router.post("/", response_model=WatchlistResponse, status_code=201)
async def create_watchlist(
    watchlist_data: WatchlistCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new watchlist."""
    watchlist = Watchlist(
        user_id=current_user.id,
        name=watchlist_data.name,
        symbols=watchlist_data.symbols,
    )
    db.add(watchlist)
    await db.commit()
    await db.refresh(watchlist)

    return WatchlistResponse(
        id=watchlist.id,
        name=watchlist.name,
        symbols=watchlist.symbols,
    )


@router.delete("/{watchlist_id}")
async def delete_watchlist(
    watchlist_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a watchlist."""
    result = await db.execute(
        select(Watchlist).where(
            Watchlist.id == watchlist_id,
            Watchlist.user_id == current_user.id,
        )
    )
    watchlist = result.scalar_one_or_none()

    if not watchlist:
        raise HTTPException(status_code=404, detail="Watchlist not found")

    await db.delete(watchlist)
    await db.commit()

    return {"message": "Watchlist deleted"}
