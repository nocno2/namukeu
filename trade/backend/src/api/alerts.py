"""
Alert API routes.
"""
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from src.db import get_db
from src.models import User, Stock, Alert
from src.utils.auth import get_current_user
from src.services.alert_service import AlertService

router = APIRouter(prefix="/api/alerts", tags=["alerts"])


# === Schemas ===
class AlertCreate(BaseModel):
    symbol: str
    condition: str  # "above", "below", "change"
    target_value: float


class AlertResponse(BaseModel):
    id: int
    symbol: str
    name: str
    condition: str
    target_value: float
    is_triggered: bool
    triggered_at: str | None
    created_at: str

    class Config:
        from_attributes = True


# === Routes ===
@router.get("/", response_model=List[AlertResponse])
async def get_alerts(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get user's alerts."""
    alert_service = AlertService(db)
    alerts = await alert_service.get_alerts(current_user.id)

    result = []
    for alert in alerts:
        # Get stock
        stock_result = await db.execute(
            select(Stock).where(Stock.id == alert.stock_id)
        )
        stock = stock_result.scalar_one_or_none()

        result.append(AlertResponse(
            id=alert.id,
            symbol=stock.symbol if stock else "Unknown",
            name=stock.name if stock else "Unknown",
            condition=alert.condition,
            target_value=alert.target_value,
            is_triggered=alert.is_triggered,
            triggered_at=alert.triggered_at.isoformat() if alert.triggered_at else None,
            created_at=alert.created_at.isoformat(),
        ))

    return result


@router.post("/", response_model=AlertResponse, status_code=201)
async def create_alert(
    alert_data: AlertCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new alert."""
    # Get stock
    result = await db.execute(
        select(Stock).where(Stock.symbol == alert_data.symbol)
    )
    stock = result.scalar_one_or_none()

    if not stock:
        raise HTTPException(status_code=404, detail="Stock not found")

    alert_service = AlertService(db)
    alert = await alert_service.create_alert(
        user_id=current_user.id,
        stock_id=stock.id,
        condition=alert_data.condition,
        target_value=alert_data.target_value,
    )

    return AlertResponse(
        id=alert.id,
        symbol=stock.symbol,
        name=stock.name,
        condition=alert.condition,
        target_value=alert.target_value,
        is_triggered=alert.is_triggered,
        triggered_at=alert.triggered_at.isoformat() if alert.triggered_at else None,
        created_at=alert.created_at.isoformat(),
    )


@router.delete("/{alert_id}")
async def delete_alert(
    alert_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete an alert."""
    alert_service = AlertService(db)
    success = await alert_service.delete_alert(alert_id, current_user.id)

    if not success:
        raise HTTPException(status_code=404, detail="Alert not found")

    return {"message": "Alert deleted"}


@router.post("/check")
async def check_alerts(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Check all active alerts."""
    # This would typically be called by a scheduler
    # For now, just return a placeholder

    # Get price function would need to be injected
    async def get_price(symbol: str):
        from src.services.stock_service import StockService
        stock_service = StockService(db)
        if symbol.isdigit() and len(symbol) == 6:
            return await stock_service.fetch_korean_stock_price(symbol)
        else:
            return await stock_service.fetch_us_stock_price(symbol)

    alert_service = AlertService(db)
    triggered = await alert_service.check_alerts(current_user.id, get_price)

    return {"triggered": triggered}
