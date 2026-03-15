import logging

from src.core.database import Database
from src.services.exchange_base import Exchange

logger = logging.getLogger(__name__)


class PortfolioTracker:
    def __init__(self, db: Database, exchange: Exchange | None = None):
        self.db = db
        self.exchange = exchange

    async def sync_from_exchange(self):
        """거래소의 실제 잔고와 로컬 DB(positions)를 강제로 동기화(Reconciliation)한다."""
        if not self.exchange or self.exchange.dry_run:
            # 모의 투자(Dry Run) 모드에서는 가상 잔고만 사용하므로 동기화를 스킵
            return

        try:
            balances = await self.exchange.get_balances()
            if not balances:
                return

            # 업비트 API에서 불러온 실제 코인 잔고 목록 (현금 KRW 제외)
            # 형태: [{'currency': 'BTC', 'balance': '0.05', 'avg_buy_price': '100000000'}, ...]
            actual_positions = {}
            for b in balances:
                currency = b.get("currency")
                if currency in ("KRW", "USDT"):
                    continue
                balance_qty = float(b.get("balance", 0))
                locked_qty = float(b.get("locked", 0))
                total_qty = balance_qty + locked_qty
                
                if total_qty > 0:
                    avg_buy_price = float(b.get("avg_buy_price", 0))
                    # ticker 구성 (예: KRW-BTC)
                    quote = self.exchange.info.quote_currency
                    ticker = f"{quote}-{currency}"
                    actual_positions[ticker] = {
                        "volume": total_qty,
                        "avg_buy_price": avg_buy_price
                    }

            # 현재 로컬 DB에 기록된 포지션 목록
            local_positions = {p["ticker"]: p for p in self.db.get_positions()}

            # 1. 거래소에는 없는데 DB에만 남아있는 코인 (사용자가 수동으로 매도함) -> DB에서 삭제
            for ticker in local_positions.keys():
                if ticker not in actual_positions:
                    logger.info(f"[Sync] 사용자가 {ticker}를 수동으로 전량 매도했거나 거래소에 없음. DB에서 삭제.")
                    self.db.delete_position(ticker)

            # 2. 거래소와 DB 간의 잔고 업데이트 (사용자가 수동으로 샀거나, 누락된 매수건)
            for ticker, actual in actual_positions.items():
                local = local_positions.get(ticker)
                
                # 수량이 일치하지 않거나 DB에 아예 없는 경우
                if not local or abs(local["volume"] - actual["volume"]) > 0.00000001:
                    logger.info(f"[Sync] {ticker} 보유량 동기화 진행. 실제: {actual['volume']} / DB: {local['volume'] if local else 0}")
                    
                    # 현재가 조회 (동기화 당시 기준가)
                    current_price = actual["avg_buy_price"]
                    try:
                        price_res = await self.exchange.get_current_price(ticker)
                        if price_res:
                            current_price = float(price_res if not isinstance(price_res, dict) else price_res.get(ticker, actual["avg_buy_price"]))
                    except Exception:
                        pass
                        
                    self.db.upsert_position(
                        ticker=ticker,
                        volume=actual["volume"],
                        avg_entry_price=actual["avg_buy_price"],
                        strategy_id=local["strategy_id"] if local else None,
                        current_price=current_price,
                        exchange=self.exchange.name
                    )

        except Exception as e:
            logger.error(f"[PortfolioTracker] 잔고 동기화 실패: {e}")

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
