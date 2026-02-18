"""
Trading API routes.
"""
from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from src.db import get_db
from src.models import User, Stock, Portfolio, Order, OrderType, OrderSide, OrderStatus
from src.utils.auth import get_current_user
from src.services.trading_service import TradingService
from src.services.stock_service import StockService

router = APIRouter(prefix="/api/trading", tags=["trading"])


# === Schemas ===
class PortfolioItemResponse(BaseModel):
    id: int
    symbol: str
    name: str
    quantity: float
    avg_price: float
    current_price: float
    market_value: float
    unrealized_pnl: float
    unrealized_pnl_pct: float


class PortfolioSummaryResponse(BaseModel):
    total_value: float
    total_cost: float
    total_pnl: float
    total_pnl_pct: float
    items: List[PortfolioItemResponse]


class OrderCreate(BaseModel):
    symbol: str
    order_type: str  # "MARKET", "LIMIT"
    side: str  # "BUY", "SELL"
    quantity: float
    price: Optional[float] = None


class OrderResponse(BaseModel):
    id: int
    symbol: str
    name: str
    order_type: str
    side: str
    quantity: float
    price: Optional[float]
    status: str
    filled_quantity: float
    filled_price: Optional[float]
    created_at: str

    class Config:
        from_attributes = True


# === Helper ===
async def get_stock_or_error(db: AsyncSession, symbol: str) -> Stock:
    """Get stock by symbol or raise 404."""
    result = await db.execute(
        select(Stock).where(Stock.symbol == symbol)
    )
    stock = result.scalar_one_or_none()
    if not stock:
        raise HTTPException(status_code=404, detail="Stock not found")
    return stock


async def get_current_price(symbol: str) -> Optional[dict]:
    """Get current price for a symbol."""
    stock_service = StockService(None)
    if symbol.isdigit() and len(symbol) == 6:
        return await stock_service.fetch_korean_stock_price(symbol)
    else:
        return await stock_service.fetch_us_stock_price(symbol)


# === Routes ===
@router.get("/portfolio", response_model=PortfolioSummaryResponse)
async def get_portfolio(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get user's portfolio."""
    trading_service = TradingService(db)

    # Get portfolio with market values
    result = await trading_service.get_portfolio_with_market_value(
        current_user.id,
        get_current_price,
    )

    total_value = sum(item["market_value"] for item in result)
    total_cost = sum(item["avg_price"] * item["quantity"] for item in result)
    total_pnl = total_value - total_cost
    total_pnl_pct = (total_pnl / total_cost * 100) if total_cost > 0 else 0

    return PortfolioSummaryResponse(
        total_value=total_value,
        total_cost=total_cost,
        total_pnl=total_pnl,
        total_pnl_pct=total_pnl_pct,
        items=[
            PortfolioItemResponse(**item)
            for item in result
        ],
    )


@router.post("/order", response_model=OrderResponse)
async def create_order(
    order_data: OrderCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new order."""
    trading_service = TradingService(db)

    # Get stock
    stock = await get_stock_or_error(db, order_data.symbol)

    # Validate order
    if order_data.quantity <= 0:
        raise HTTPException(status_code=400, detail="Quantity must be positive")

    if order_data.order_type == "LIMIT" and not order_data.price:
        raise HTTPException(status_code=400, detail="Limit orders require a price")

    # Create order
    order = await trading_service.create_order(
        user_id=current_user.id,
        stock_id=stock.id,
        order_type=OrderType(order_data.order_type),
        side=OrderSide(order_data.side),
        quantity=order_data.quantity,
        price=order_data.price,
    )

    # For market orders, execute immediately
    if order_data.order_type == "MARKET":
        price_data = await get_current_price(order_data.symbol)
        if price_data and price_data.get("price"):
            order = await trading_service.execute_order(
                order.id,
                price_data["price"]
            )

    return OrderResponse(
        id=order.id,
        symbol=stock.symbol,
        name=stock.name,
        order_type=order.order_type.value,
        side=order.side.value,
        quantity=order.quantity,
        price=order.price,
        status=order.status.value,
        filled_quantity=order.filled_quantity,
        filled_price=order.filled_price,
        created_at=order.created_at.isoformat(),
    )


@router.get("/orders", response_model=List[OrderResponse])
async def get_orders(
    status: Optional[str] = None,
    limit: int = Query(50, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get user's orders."""
    trading_service = TradingService(db)

    order_status = OrderStatus(status) if status else None
    orders = await trading_service.get_orders(current_user.id, order_status, limit)

    result = []
    for order in orders:
        # Get stock info
        stock_result = await db.execute(
            select(Stock).where(Stock.id == order.stock_id)
        )
        stock = stock_result.scalar_one()

        result.append(OrderResponse(
            id=order.id,
            symbol=stock.symbol,
            name=stock.name,
            order_type=order.order_type.value,
            side=order.side.value,
            quantity=order.quantity,
            price=order.price,
            status=order.status.value,
            filled_quantity=order.filled_quantity,
            filled_price=order.filled_price,
            created_at=order.created_at.isoformat(),
        ))

    return result


@router.delete("/order/{order_id}")
async def cancel_order(
    order_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Cancel an order."""
    trading_service = TradingService(db)

    try:
        order = await trading_service.cancel_order(order_id)
        return {"message": "Order cancelled", "order_id": order.id}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
