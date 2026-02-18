"""
Trading service - handles orders, portfolio, and backtesting.
"""
from datetime import datetime, timedelta
from typing import Optional, List
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession
from src.models import (
    User, Stock, Portfolio, Order, OrderType, OrderSide, OrderStatus,
    Strategy, BacktestResult, MarketType
)
from src.config import PAPER_TRADING


class TradingService:
    """Service for trading operations."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.paper_trading = PAPER_TRADING

    # === Portfolio ===

    async def get_portfolio(self, user_id: int) -> List[Portfolio]:
        """Get user's portfolio."""
        result = await self.db.execute(
            select(Portfolio)
            .where(Portfolio.user_id == user_id)
            .where(Portfolio.quantity > 0)
        )
        return list(result.scalars().all())

    async def get_portfolio_with_market_value(
        self, user_id: int, get_price_func
    ) -> List[dict]:
        """Get portfolio with current market value."""
        portfolios = await self.get_portfolio(user_id)

        result = []
        for p in portfolios:
            # Get current price
            price_data = await get_price_func(p.stock.symbol)
            current_price = price_data.get("price") if price_data else p.avg_price
            market_value = current_price * p.quantity
            unrealized_pnl = (current_price - p.avg_price) * p.quantity
            unrealized_pnl_pct = (
                ((current_price - p.avg_price) / p.avg_price * 100)
                if p.avg_price > 0 else 0
            )

            result.append({
                "id": p.id,
                "symbol": p.stock.symbol,
                "name": p.stock.name,
                "quantity": p.quantity,
                "avg_price": p.avg_price,
                "current_price": current_price,
                "market_value": market_value,
                "unrealized_pnl": unrealized_pnl,
                "unrealized_pnl_pct": unrealized_pnl_pct,
            })

        return result

    async def update_portfolio(
        self,
        user_id: int,
        stock_id: int,
        quantity: float,
        price: float,
        side: OrderSide,
    ) -> Portfolio:
        """Update portfolio after order execution."""
        result = await self.db.execute(
            select(Portfolio).where(
                and_(
                    Portfolio.user_id == user_id,
                    Portfolio.stock_id == stock_id,
                )
            )
        )
        portfolio = result.scalar_one_or_none()

        if side == OrderSide.BUY:
            if portfolio:
                # Average in
                total_quantity = portfolio.quantity + quantity
                total_cost = (portfolio.avg_price * portfolio.quantity) + (price * quantity)
                portfolio.avg_price = total_cost / total_quantity
                portfolio.quantity = total_quantity
            else:
                portfolio = Portfolio(
                    user_id=user_id,
                    stock_id=stock_id,
                    quantity=quantity,
                    avg_price=price,
                )
                self.db.add(portfolio)

        elif side == OrderSide.SELL:
            if portfolio:
                portfolio.quantity -= quantity
                if portfolio.quantity <= 0:
                    await self.db.delete(portfolio)
                    portfolio = None

        await self.db.commit()
        if portfolio:
            await self.db.refresh(portfolio)

        return portfolio

    # === Orders ===

    async def create_order(
        self,
        user_id: int,
        stock_id: int,
        order_type: OrderType,
        side: OrderSide,
        quantity: float,
        price: Optional[float] = None,
    ) -> Order:
        """Create a new order."""
        order = Order(
            user_id=user_id,
            stock_id=stock_id,
            order_type=order_type,
            side=side,
            quantity=quantity,
            price=price,
            status=OrderStatus.PENDING,
        )
        self.db.add(order)
        await self.db.commit()
        await self.db.refresh(order)
        return order

    async def execute_order(
        self,
        order_id: int,
        execution_price: float,
    ) -> Order:
        """Execute an order (fill it)."""
        result = await self.db.execute(
            select(Order).where(Order.id == order_id)
        )
        order = result.scalar_one_or_none()

        if not order:
            raise ValueError("Order not found")

        # Update order
        order.status = OrderStatus.FILLED
        order.filled_quantity = order.quantity
        order.filled_price = execution_price
        order.filled_at = datetime.utcnow()

        # Update portfolio (if not paper trading)
        if not self.paper_trading:
            trading_svc = TradingService(self.db)
            await trading_svc.update_portfolio(
                order.user_id,
                order.stock_id,
                order.quantity,
                execution_price,
                order.side,
            )

        await self.db.commit()
        await self.db.refresh(order)
        return order

    async def cancel_order(self, order_id: int) -> Order:
        """Cancel an order."""
        result = await self.db.execute(
            select(Order).where(Order.id == order_id)
        )
        order = result.scalar_one_or_none()

        if not order:
            raise ValueError("Order not found")

        if order.status != OrderStatus.PENDING:
            raise ValueError("Only pending orders can be cancelled")

        order.status = OrderStatus.CANCELLED
        await self.db.commit()
        await self.db.refresh(order)
        return order

    async def get_orders(
        self,
        user_id: int,
        status: Optional[OrderStatus] = None,
        limit: int = 50,
    ) -> List[Order]:
        """Get user's orders."""
        query = select(Order).where(Order.user_id == user_id)

        if status:
            query = query.where(Order.status == status)

        query = query.order_by(Order.created_at.desc()).limit(limit)

        result = await self.db.execute(query)
        return list(result.scalars().all())

    # === Strategy ===

    async def create_strategy(
        self,
        user_id: int,
        name: str,
        logic: dict,
        market: MarketType,
        symbols: str,
        description: Optional[str] = None,
    ) -> Strategy:
        """Create a new strategy."""
        strategy = Strategy(
            user_id=user_id,
            name=name,
            description=description,
            logic=logic,
            market=market,
            symbols=symbols,
        )
        self.db.add(strategy)
        await self.db.commit()
        await self.db.refresh(strategy)
        return strategy

    async def update_strategy_status(
        self,
        strategy_id: int,
        status: str,
    ) -> Strategy:
        """Update strategy status."""
        result = await self.db.execute(
            select(Strategy).where(Strategy.id == strategy_id)
        )
        strategy = result.scalar_one_or_none()

        if not strategy:
            raise ValueError("Strategy not found")

        strategy.status = status
        await self.db.commit()
        await self.db.refresh(strategy)
        return strategy

    async def get_strategies(self, user_id: int) -> List[Strategy]:
        """Get user's strategies."""
        result = await self.db.execute(
            select(Strategy).where(Strategy.user_id == user_id)
        )
        return list(result.scalars().all())

    # === Backtesting ===

    async def run_backtest(
        self,
        user_id: int,
        strategy_id: int,
        symbol: str,
        start_date: datetime,
        end_date: datetime,
        initial_capital: float = 10000000,
    ) -> dict:
        """Run a backtest for a strategy."""
        # Get strategy
        result = await self.db.execute(
            select(Strategy).where(Strategy.id == strategy_id)
        )
        strategy = result.scalar_one_or_none()

        if not strategy:
            raise ValueError("Strategy not found")

        # Simple backtest simulation
        # In production, this would use actual price data and strategy logic
        from src.services.stock_service import StockService

        stock_service = StockService(self.db)
        prices = await stock_service.fetch_us_stock_history(symbol, period="1y")

        if not prices:
            return {"error": "No price data available"}

        # Calculate returns
        final_capital = initial_capital  # Simplified - just return initial
        total_return = 0
        trades = []

        # Save backtest result
        backtest = BacktestResult(
            user_id=user_id,
            strategy_id=strategy_id,
            symbol=symbol,
            start_date=start_date,
            end_date=end_date,
            initial_capital=initial_capital,
            final_capital=final_capital,
            total_return=total_return,
            sharpe_ratio=0,
            max_drawdown=0,
            win_rate=0,
            trades=trades,
        )
        self.db.add(backtest)
        await self.db.commit()
        await self.db.refresh(backtest)

        return {
            "id": backtest.id,
            "initial_capital": initial_capital,
            "final_capital": final_capital,
            "total_return": total_return,
            "trades": len(trades),
        }
