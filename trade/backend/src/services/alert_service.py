"""
Alert service - manages price alerts.
"""
from datetime import datetime
from typing import List, Optional
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession
from src.models import Alert, Stock, User


class AlertService:
    """Service for managing price alerts."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_alert(
        self,
        user_id: int,
        stock_id: int,
        condition: str,  # "above", "below", "change"
        target_value: float,
    ) -> Alert:
        """Create a new alert."""
        alert = Alert(
            user_id=user_id,
            stock_id=stock_id,
            condition=condition,
            target_value=target_value,
        )
        self.db.add(alert)
        await self.db.commit()
        await self.db.refresh(alert)
        return alert

    async def get_alerts(self, user_id: int) -> List[Alert]:
        """Get user's alerts."""
        result = await self.db.execute(
            select(Alert)
            .where(Alert.user_id == user_id)
            .order_by(Alert.created_at.desc())
        )
        return list(result.scalars().all())

    async def get_active_alerts(self, user_id: int) -> List[Alert]:
        """Get user's active (not triggered) alerts."""
        result = await self.db.execute(
            select(Alert)
            .where(
                and_(
                    Alert.user_id == user_id,
                    Alert.is_triggered == False,
                )
            )
        )
        return list(result.scalars().all())

    async def delete_alert(self, alert_id: int, user_id: int) -> bool:
        """Delete an alert."""
        result = await self.db.execute(
            select(Alert).where(
                and_(
                    Alert.id == alert_id,
                    Alert.user_id == user_id,
                )
            )
        )
        alert = result.scalar_one_or_none()

        if not alert:
            return False

        await self.db.delete(alert)
        await self.db.commit()
        return True

    async def check_alerts(
        self,
        user_id: int,
        get_price_func,
    ) -> List[dict]:
        """Check all active alerts and return triggered ones."""
        alerts = await self.get_active_alerts(user_id)

        triggered = []
        for alert in alerts:
            # Get current price
            stock_result = await self.db.execute(
                select(Stock).where(Stock.id == alert.stock_id)
            )
            stock = stock_result.scalar_one_or_none()

            if not stock:
                continue

            price_data = await get_price_func(stock.symbol)
            if not price_data:
                continue

            current_price = price_data.get("price")
            if not current_price:
                continue

            # Check condition
            is_triggered = False

            if alert.condition == "above":
                is_triggered = current_price > alert.target_value
            elif alert.condition == "below":
                is_triggered = current_price < alert.target_value
            elif alert.condition == "change":
                # Check % change from previous close
                previous_close = price_data.get("previous_close")
                if previous_close:
                    change_pct = ((current_price - previous_close) / previous_close) * 100
                    is_triggered = abs(change_pct) > alert.target_value

            if is_triggered:
                # Mark as triggered
                alert.is_triggered = True
                alert.triggered_at = datetime.utcnow()
                await self.db.commit()

                triggered.append({
                    "alert_id": alert.id,
                    "symbol": stock.symbol,
                    "name": stock.name,
                    "condition": alert.condition,
                    "target_value": alert.target_value,
                    "current_price": current_price,
                })

        return triggered
