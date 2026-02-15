import asyncio
import json
import logging

from src.core.database import Database
from src.services.exchange_base import Exchange
from src.services.notifier import TelegramNotifier
from src.services.portfolio import PortfolioTracker
from src.services.risk_manager import RiskManager
from src.strategies.base import Signal
from src.strategies.registry import get_strategy

logger = logging.getLogger(__name__)


class TradingScheduler:
    def __init__(
        self,
        db: Database,
        exchange: Exchange,
        risk_manager: RiskManager,
        portfolio: PortfolioTracker,
        notifier: TelegramNotifier,
        trading_interval: int = 60,
    ):
        self.db = db
        self.exchange = exchange
        self.risk_manager = risk_manager
        self.portfolio = portfolio
        self.notifier = notifier
        self.trading_interval = trading_interval
        self._tasks: dict[str, asyncio.Task] = {}
        self._snapshot_task: asyncio.Task | None = None

    def get_active_keys(self) -> list[str]:
        return list(self._tasks.keys())

    def start_trading(self, ticker: str, strategy_name: str, params: dict, strategy_id: int | None = None):
        key = f"{ticker}:{strategy_name}"
        if key in self._tasks and not self._tasks[key].done():
            logger.info(f"이미 실행 중: {key}")
            return
        task = asyncio.create_task(self._trading_loop(ticker, strategy_name, params, strategy_id))
        self._tasks[key] = task
        logger.info(f"매매 루프 시작: {key}")

    def stop_trading(self, ticker: str, strategy_name: str) -> bool:
        key = f"{ticker}:{strategy_name}"
        task = self._tasks.pop(key, None)
        if task and not task.done():
            task.cancel()
            logger.info(f"매매 루프 중단: {key}")
            return True
        return False

    async def stop_all(self):
        tasks = []
        for key in list(self._tasks.keys()):
            task = self._tasks.pop(key)
            if not task.done():
                task.cancel()
                tasks.append(task)
        if self._snapshot_task and not self._snapshot_task.done():
            self._snapshot_task.cancel()
            tasks.append(self._snapshot_task)
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)
        logger.info("모든 매매 루프 중단")

    async def restore_enabled(self):
        """서버 재시작 시 활성 전략 복원."""
        exchange_name = self.exchange.name
        strategies = self.db.get_strategies(enabled_only=True, exchange=exchange_name)
        for s in strategies:
            params = json.loads(s["params"]) if isinstance(s["params"], str) else s["params"]
            self.start_trading(s["ticker"], s["name"], params, s["id"])
        if strategies:
            logger.info(f"{len(strategies)}개 전략 복원")

    def start_snapshot_loop(self, interval_minutes: int = 10, initial_equity: float | None = None):
        if self._snapshot_task is None or self._snapshot_task.done():
            self._snapshot_task = asyncio.create_task(
                self._snapshot_loop(interval_minutes, initial_equity)
            )

    async def _snapshot_loop(self, interval_minutes: int, initial_equity: float | None):
        try:
            while True:
                await self.portfolio.take_snapshot(initial_equity)
                await asyncio.sleep(interval_minutes * 60)
        except asyncio.CancelledError:
            pass

    @property
    def _is_futures(self) -> bool:
        return getattr(self.exchange, "is_futures", False)

    async def _trading_loop(self, ticker: str, strategy_name: str, params: dict, strategy_id: int | None):
        strategy = get_strategy(strategy_name)
        fee_rate = self.exchange.info.fee_rate
        min_order = self.exchange.info.min_order_value
        quote = self.exchange.info.quote_currency
        # Futures: set up leverage for this symbol
        if self._is_futures:
            leverage = params.get("leverage", 20)
            symbol = self.exchange._to_binance_symbol(ticker)
            await self.exchange.setup_symbol(symbol, leverage=leverage)

        try:
            while True:
                try:
                    # 1. 데이터 수집
                    df = await self.exchange.get_ohlcv(ticker, interval="minute60", count=200)
                    if df is None or df.empty or len(df) < strategy.required_candle_count:
                        logger.warning(f"{ticker} 데이터 부족, 건너뜀")
                        await asyncio.sleep(self.trading_interval)
                        continue

                    # 2. 시그널 생성
                    signal = strategy.analyze(df, params)
                    signal.ticker = ticker

                    # 3. 시그널 로그
                    self.db.add_signal_log(
                        ticker=ticker,
                        strategy_name=strategy_name,
                        signal=signal.signal.value,
                        confidence=signal.confidence,
                        reason=signal.reason,
                        indicators=signal.indicators,
                    )

                    # 3.1 파이프라인 evidence 로그
                    if signal.indicators and "evidences" in signal.indicators:
                        self.db.add_pipeline_log(
                            ticker=ticker,
                            strategy_name=strategy_name,
                            signal=signal.signal.value,
                            confidence=signal.confidence,
                            reason=signal.reason,
                            evidences=signal.indicators.get("evidences"),
                            vetoed=signal.indicators.get("vetoed", False),
                            veto_source=signal.indicators.get("veto_source"),
                        )

                    # 4. 리스크 체크
                    can_trade, reason = self.risk_manager.check_can_trade()
                    if not can_trade:
                        logger.warning(f"리스크 제한: {reason}")
                        await self.notifier.notify_risk_halt(reason)
                        await asyncio.sleep(self.trading_interval)
                        continue

                    # 5. 매매 실행
                    if self._is_futures:
                        if signal.signal == Signal.BUY:
                            await self._execute_futures_buy(ticker, signal, strategy_id, fee_rate, min_order, quote, params)
                        elif signal.signal == Signal.SELL:
                            await self._execute_futures_sell(ticker, signal, strategy_id, fee_rate, min_order, quote, params)
                    else:
                        if signal.signal == Signal.BUY:
                            await self._execute_buy(ticker, signal, strategy_id, fee_rate, min_order, quote)
                        elif signal.signal == Signal.SELL:
                            await self._execute_sell(ticker, signal, strategy_id, quote)

                    # 6. 스탑로스 체크
                    if self._is_futures:
                        await self._check_futures_stop_losses(params)
                    else:
                        await self._check_stop_losses()

                    # 7. 포지션 시세 업데이트
                    await self.portfolio.update_positions()

                except Exception as e:
                    logger.error(f"매매 루프 에러 ({ticker}:{strategy_name}): {e}")
                    await self.notifier.notify_error(f"{ticker}:{strategy_name}", str(e))

                await asyncio.sleep(self.trading_interval)

        except asyncio.CancelledError:
            logger.info(f"매매 루프 종료: {ticker}:{strategy_name}")

    async def _execute_buy(self, ticker: str, signal, strategy_id: int | None,
                           fee_rate: float, min_order: float, quote: str):
        positions = self.db.get_positions()
        existing = [p for p in positions if p["ticker"] == ticker]
        if existing:
            return  # 이미 보유 중

        balance = await self.exchange.get_balance()
        if balance is None:
            logger.warning(f"잔고 조회 실패, 매수 스킵: {ticker}")
            return
        amount = self.risk_manager.calculate_position_size(balance, len(positions))

        if amount < min_order:
            return

        order_id = self.db.create_order(
            ticker=ticker, side="buy", order_type="market",
            is_dry_run=self.exchange.dry_run, strategy_id=strategy_id,
            amount_krw=amount, signal_reason=signal.reason,
            signal_confidence=signal.confidence, indicators=signal.indicators,
            exchange=self.exchange.name,
        )

        result = await self.exchange.buy_market_order(ticker, amount)

        if result:
            self.db.update_order_state(order_id, "done", result.created_at)
            price = await self.exchange.get_current_price(ticker)
            if price is not None and price:
                volume = amount * (1 - fee_rate) / float(price)
                self.db.upsert_position(ticker, volume, float(price), strategy_id, float(price),
                                        exchange=self.exchange.name)
            else:
                logger.warning(f"매수 후 가격 조회 실패, 포지션 미등록: {ticker}")
            await self.notifier.notify_trade("buy", ticker, amount, float(price or 0), signal.reason,
                                             quote_currency=quote)
        elif self.exchange.dry_run:
            self.db.update_order_state(order_id, "done")
            price = await self.exchange.get_current_price(ticker)
            if price is not None and price:
                volume = amount * (1 - fee_rate) / float(price)
                self.db.upsert_position(ticker, volume, float(price), strategy_id, float(price),
                                        exchange=self.exchange.name)
            else:
                logger.warning(f"[DRY-RUN] 매수 후 가격 조회 실패, 포지션 미등록: {ticker}")

    async def _execute_sell(self, ticker: str, signal, strategy_id: int | None, quote: str):
        positions = self.db.get_positions()
        position = next((p for p in positions if p["ticker"] == ticker), None)
        if not position:
            return

        volume = position["volume"]
        order_id = self.db.create_order(
            ticker=ticker, side="sell", order_type="market",
            is_dry_run=self.exchange.dry_run, strategy_id=strategy_id,
            volume=volume, signal_reason=signal.reason,
            signal_confidence=signal.confidence, indicators=signal.indicators,
            exchange=self.exchange.name,
        )

        result = await self.exchange.sell_market_order(ticker, volume)

        if result:
            self.db.update_order_state(order_id, "done", result.created_at)
            self.db.delete_position(ticker)
            price = await self.exchange.get_current_price(ticker)
            amount = volume * float(price or 0) if price is not None else 0
            await self.notifier.notify_trade("sell", ticker, amount, float(price or 0), signal.reason,
                                             quote_currency=quote)
        elif self.exchange.dry_run:
            self.db.update_order_state(order_id, "done")
            self.db.delete_position(ticker)

    async def _check_stop_losses(self):
        positions = self.db.get_positions()
        for p in positions:
            current_price = p.get("current_price") or 0
            entry_price = p.get("avg_entry_price", 0)
            if current_price > 0 and self.risk_manager.check_stop_loss(entry_price, current_price):
                logger.warning(f"스탑로스 발동: {p['ticker']} (진입: {entry_price:,.0f}, 현재: {current_price:,.0f})")
                from src.strategies.base import TradeSignal, Signal as Sig
                signal = TradeSignal(
                    signal=Sig.SELL, ticker=p["ticker"], confidence=1.0,
                    reason=f"스탑로스: {((entry_price - current_price) / entry_price * 100):.1f}% 손실",
                    indicators={"entry_price": entry_price, "current_price": current_price},
                )
                await self._execute_sell(p["ticker"], signal, p.get("strategy_id"),
                                         self.exchange.info.quote_currency)
                await self.notifier.send_message(
                    f"🛑 *스탑로스* `{p['ticker']}`\n"
                    f"진입: {entry_price:,.0f} → 현재: {current_price:,.0f}"
                )

    # --- Futures execution ---

    async def _execute_futures_buy(self, ticker: str, signal, strategy_id: int | None,
                                   fee_rate: float, min_order: float, quote: str, params: dict):
        """BUY signal: open long (no position) or close short (short position)."""
        positions = self.db.get_positions()
        existing = next((p for p in positions if p["ticker"] == ticker), None)

        if existing and existing.get("side", "long") == "long":
            return  # Already long

        if existing and existing.get("side") == "short":
            # Close short
            volume = existing["volume"]
            price = await self.exchange.get_current_price(ticker)
            if price is None:
                logger.warning(f"가격 조회 실패, 숏 청산 스킵: {ticker}")
                return
            amount = volume * float(price or 0)
            order_id = self.db.create_order(
                ticker=ticker, side="buy", order_type="market",
                is_dry_run=self.exchange.dry_run, strategy_id=strategy_id,
                volume=volume, signal_reason=f"숏 청산: {signal.reason}",
                signal_confidence=signal.confidence, indicators=signal.indicators,
                exchange=self.exchange.name,
            )
            result = await self.exchange.buy_market_order(ticker, amount)
            if result or self.exchange.dry_run:
                self.db.update_order_state(order_id, "done", result.created_at if result else None)
                self.db.delete_position(ticker)
                await self.notifier.notify_trade("close_short", ticker, amount,
                                                  float(price or 0), signal.reason, quote_currency=quote)
            return

        # No position: open long
        leverage = params.get("leverage", 20)
        balance = await self.exchange.get_balance()
        if balance is None:
            logger.warning(f"잔고 조회 실패, 롱 진입 스킵: {ticker}")
            return
        amount = self.risk_manager.calculate_position_size(balance, len(positions))
        if amount < min_order:
            return

        leveraged_amount = amount * leverage
        order_id = self.db.create_order(
            ticker=ticker, side="buy", order_type="market",
            is_dry_run=self.exchange.dry_run, strategy_id=strategy_id,
            amount_krw=leveraged_amount, signal_reason=f"[{leverage}x 롱] {signal.reason}",
            signal_confidence=signal.confidence, indicators=signal.indicators,
            exchange=self.exchange.name,
        )
        result = await self.exchange.buy_market_order(ticker, leveraged_amount)
        if result or self.exchange.dry_run:
            if result:
                self.db.update_order_state(order_id, "done", result.created_at)
            else:
                self.db.update_order_state(order_id, "done")
            price = await self.exchange.get_current_price(ticker)
            if price is not None and price:
                volume = leveraged_amount * (1 - fee_rate) / float(price)
                self.db.upsert_position(
                    ticker, volume, float(price), strategy_id, float(price),
                    exchange=self.exchange.name, side="long", leverage=leverage,
                )
            else:
                logger.warning(f"롱 진입 후 가격 조회 실패, 포지션 미등록: {ticker}")
            await self.notifier.notify_trade(
                "open_long", ticker, leveraged_amount, float(price or 0),
                f"[{leverage}x] {signal.reason}", quote_currency=quote,
            )

    async def _execute_futures_sell(self, ticker: str, signal, strategy_id: int | None,
                                    fee_rate: float, min_order: float, quote: str, params: dict):
        """SELL signal: close long (long position) or open short (no position)."""
        positions = self.db.get_positions()
        existing = next((p for p in positions if p["ticker"] == ticker), None)

        if existing and existing.get("side") == "short":
            return  # Already short

        if existing and existing.get("side", "long") == "long":
            # Close long
            volume = existing["volume"]
            order_id = self.db.create_order(
                ticker=ticker, side="sell", order_type="market",
                is_dry_run=self.exchange.dry_run, strategy_id=strategy_id,
                volume=volume, signal_reason=f"롱 청산: {signal.reason}",
                signal_confidence=signal.confidence, indicators=signal.indicators,
                exchange=self.exchange.name,
            )
            result = await self.exchange.sell_market_order(ticker, volume)
            if result or self.exchange.dry_run:
                self.db.update_order_state(order_id, "done", result.created_at if result else None)
                self.db.delete_position(ticker)
                price = await self.exchange.get_current_price(ticker)
                amount = volume * float(price or 0) if price is not None else 0
                await self.notifier.notify_trade("close_long", ticker, amount,
                                                  float(price or 0), signal.reason, quote_currency=quote)
            return

        # No position: open short
        leverage = params.get("leverage", 20)
        balance = await self.exchange.get_balance()
        if balance is None:
            logger.warning(f"잔고 조회 실패, 숏 진입 스킵: {ticker}")
            return
        amount = self.risk_manager.calculate_position_size(balance, len(positions))
        if amount < min_order:
            return

        leveraged_amount = amount * leverage
        price = await self.exchange.get_current_price(ticker)
        if not price:
            return
        volume = leveraged_amount * (1 - fee_rate) / float(price)

        order_id = self.db.create_order(
            ticker=ticker, side="sell", order_type="market",
            is_dry_run=self.exchange.dry_run, strategy_id=strategy_id,
            amount_krw=leveraged_amount, signal_reason=f"[{leverage}x 숏] {signal.reason}",
            signal_confidence=signal.confidence, indicators=signal.indicators,
            exchange=self.exchange.name,
        )
        result = await self.exchange.sell_market_order(ticker, volume)
        if result or self.exchange.dry_run:
            if result:
                self.db.update_order_state(order_id, "done", result.created_at)
            else:
                self.db.update_order_state(order_id, "done")
            self.db.upsert_position(
                ticker, volume, float(price), strategy_id, float(price),
                exchange=self.exchange.name, side="short", leverage=leverage,
            )
            await self.notifier.notify_trade(
                "open_short", ticker, leveraged_amount, float(price),
                f"[{leverage}x] {signal.reason}", quote_currency=quote,
            )

    async def _check_futures_stop_losses(self, params: dict):
        positions = self.db.get_positions()
        for p in positions:
            if p.get("exchange") != self.exchange.name:
                continue
            current_price = p.get("current_price") or 0
            entry_price = p.get("avg_entry_price", 0)
            if current_price <= 0 or entry_price <= 0:
                continue

            side = p.get("side", "long")
            leverage = p.get("leverage", 1)

            if side == "long":
                loss_pct = ((entry_price - current_price) / entry_price) * 100
            else:
                loss_pct = ((current_price - entry_price) / entry_price) * 100

            if loss_pct >= self.risk_manager.limits.stop_loss_pct:
                effective_loss = loss_pct * leverage
                logger.warning(
                    f"선물 스탑로스: {p['ticker']} {side} {leverage}x "
                    f"(진입: {entry_price:,.2f}, 현재: {current_price:,.2f}, "
                    f"손실: {effective_loss:.1f}%)"
                )
                from src.strategies.base import TradeSignal, Signal as Sig
                close_signal = Sig.SELL if side == "long" else Sig.BUY
                signal = TradeSignal(
                    signal=close_signal, ticker=p["ticker"], confidence=1.0,
                    reason=f"스탑로스: {loss_pct:.1f}% (실효 {effective_loss:.1f}%)",
                    indicators={"entry_price": entry_price, "current_price": current_price,
                                "leverage": leverage, "side": side},
                )
                fee_rate = self.exchange.info.fee_rate
                min_order = self.exchange.info.min_order_value
                quote = self.exchange.info.quote_currency
                if side == "long":
                    await self._execute_futures_sell(p["ticker"], signal, p.get("strategy_id"),
                                                     fee_rate, min_order, quote, params)
                else:
                    await self._execute_futures_buy(p["ticker"], signal, p.get("strategy_id"),
                                                    fee_rate, min_order, quote, params)
                await self.notifier.send_message(
                    f"*선물 스탑로스* `{p['ticker']}` ({side} {leverage}x)\n"
                    f"진입: {entry_price:,.2f} -> 현재: {current_price:,.2f}\n"
                    f"손실: {effective_loss:.1f}%"
                )
