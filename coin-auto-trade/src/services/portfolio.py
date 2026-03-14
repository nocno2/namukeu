import logging

from src.core.database import Database
from src.services.exchange_base import Exchange

logger = logging.getLogger(__name__)


class PortfolioTracker:
    def __init__(self, db: Database, exchange: Exchange | None = None):
        self.db = db
        self.exchange = exchange

    async def update_positions(self):
        """현재 포지션의 시세를 업데이트."""
        if not self.exchange:
            return

        positions = self.db.get_positions()
        if not positions:
            return

        tickers = [p["ticker"] for p in positions]
        try:
            prices = await self.exchange.get_current_price(tickers)
            if prices is None:
                logger.warning("포지션 시세 조회 실패 (None 반환), 업데이트 스킵")
                return
            if isinstance(prices, dict):
                for p in positions:
                    price = prices.get(p["ticker"])
                    if price:
                        self.db.upsert_position(
                            ticker=p["ticker"],
                            volume=p["volume"],
                            avg_entry_price=p["avg_entry_price"],
                            strategy_id=p["strategy_id"],
                            current_price=float(price),
                            exchange=p.get("exchange", "upbit"),
                            side=p.get("side", "long"),
                            leverage=p.get("leverage", 1),
                        )
        except Exception as e:
            logger.error(f"포지션 시세 업데이트 실패: {e}")

    async def get_summary(self) -> dict:
        """포트폴리오 요약."""
        cash = 0.0
        if self.exchange:
            try:
                result = await self.exchange.get_balance()
                cash = result if result is not None else 0.0
            except Exception as e:
                logger.error(f"잔고 조회 실패: {e}")

        positions = self.db.get_positions()
        positions_value = sum(
            (p.get("current_price", 0) or 0) * p.get("volume", 0)
            for p in positions
        )
        total_equity = cash + positions_value

        return {
            "total_equity": total_equity,
            "cash_balance": cash,
            "positions_value": positions_value,
            "active_positions": len(positions),
            "positions": positions,
        }

    async def take_snapshot(self, initial_equity: float | None = None):
        """성과 스냅샷 저장."""
        summary = await self.get_summary()

        if summary["total_equity"] <= 0 or summary["cash_balance"] <= 0:
            logger.warning(
                "스냅샷 저장 스킵: total_equity=%.2f, cash_balance=%.2f",
                summary["total_equity"], summary["cash_balance"],
            )
            return

        total_pnl = 0.0
        total_pnl_pct = 0.0

        if initial_equity and initial_equity > 0:
            total_pnl = summary["total_equity"] - initial_equity
            total_pnl_pct = (total_pnl / initial_equity) * 100

        self.db.add_performance_snapshot(
            total_equity=summary["total_equity"],
            cash_balance=summary["cash_balance"],
            positions_value=summary["positions_value"],
            total_pnl=total_pnl,
            total_pnl_pct=total_pnl_pct,
            active_positions=summary["active_positions"],
        )
