import json
import logging
import math
from dataclasses import dataclass, field

import pandas as pd

from src.core.constants import UPBIT_FEE_RATE
from src.core.database import Database
from src.strategies.base import Signal, Strategy
from src.strategies.registry import get_strategy

logger = logging.getLogger(__name__)


@dataclass
class BacktestConfig:
    ticker: str
    strategy_name: str
    strategy_params: dict
    interval: str
    start_date: str
    end_date: str
    initial_capital: float
    fee_rate: float = UPBIT_FEE_RATE
    slippage_rate: float = 0.001
    leverage: int = 1
    enable_short: bool = False
    trailing_stop_pct: float | None = None
    stop_loss_pct: float = 5.0


@dataclass
class BacktestTrade:
    timestamp: str
    side: str
    price: float
    volume: float
    fee: float
    reason: str


@dataclass
class BacktestResult:
    config: BacktestConfig
    trades: list[BacktestTrade] = field(default_factory=list)
    final_capital: float = 0.0
    total_return_pct: float = 0.0
    max_drawdown_pct: float = 0.0
    sharpe_ratio: float = 0.0
    win_rate: float = 0.0
    total_trades: int = 0
    profit_factor: float = 0.0
    equity_curve: list[dict] = field(default_factory=list)


class Backtester:
    def __init__(self, db: Database):
        self.db = db

    async def run(self, config: BacktestConfig) -> BacktestResult:
        strategy = get_strategy(config.strategy_name)

        df = self.db.get_ohlcv(
            config.ticker, config.interval,
            limit=100_000, start=config.start_date, end=config.end_date,
        )
        if len(df) < strategy.required_candle_count:
            df = await self._auto_backfill(config, strategy, len(df))

        if config.leverage > 1 or config.enable_short:
            return await self._run_futures(config, strategy, df)
        return await self._run_spot(config, strategy, df)

    async def _auto_backfill(self, config: BacktestConfig, strategy, current_count: int) -> pd.DataFrame:
        from datetime import datetime
        from src.core import runtime

        collector = self._find_collector(config.ticker)
        if not collector:
            raise ValueError(
                f"데이터 부족: {current_count}개 캔들, 최소 {strategy.required_candle_count}개 필요 (자동 수집 불가: 거래소 미연결)"
            )

        start = datetime.strptime(config.start_date, "%Y%m%d")
        end = datetime.strptime(config.end_date, "%Y%m%d")
        days = (end - start).days + 30

        logger.info(f"백테스트 데이터 자동 수집: {config.ticker} {config.interval} {days}일")
        await collector.backfill(config.ticker, config.interval, days)

        df = self.db.get_ohlcv(
            config.ticker, config.interval,
            limit=100_000, start=config.start_date, end=config.end_date,
        )
        if len(df) < strategy.required_candle_count:
            raise ValueError(
                f"데이터 부족: {len(df)}개 캔들, 최소 {strategy.required_candle_count}개 필요 (수집 후에도 부족)"
            )
        return df

    @staticmethod
    def _find_collector(ticker: str):
        from src.core import runtime

        if ticker.startswith("KRW-"):
            return runtime.collectors.get("upbit")
        elif ticker.startswith("USDT-"):
            return runtime.collectors.get("binance") or runtime.collectors.get("binance_futures")
        return runtime.collector

    async def _run_spot(self, config: BacktestConfig, strategy: Strategy, df: pd.DataFrame) -> BacktestResult:
        capital = config.initial_capital
        position_volume = 0.0
        entry_price = 0.0
        high_price = 0.0  # Track peak price for trailing stop
        trades: list[BacktestTrade] = []
        equity_curve: list[dict] = []
        peak_equity = capital
        max_drawdown = 0.0
        daily_returns: list[float] = []
        prev_equity = capital

        for i in range(strategy.required_candle_count, len(df)):
            window = df.iloc[:i + 1]
            current_price = float(window["close"].iloc[-1])
            timestamp = str(window.index[-1])

            # Check trailing stop before strategy signal
            trailing_triggered = False
            if position_volume > 0 and config.trailing_stop_pct:
                high_price = max(high_price, current_price)
                drop_pct = ((high_price - current_price) / high_price) * 100
                if drop_pct >= config.trailing_stop_pct:
                    trailing_triggered = True

            # Check hard stop-loss
            stop_triggered = False
            if position_volume > 0 and entry_price > 0:
                loss_pct = ((entry_price - current_price) / entry_price) * 100
                if loss_pct >= config.stop_loss_pct:
                    stop_triggered = True

            signal = strategy.analyze(window, config.strategy_params)

            if signal.signal == Signal.BUY and position_volume == 0 and capital > 0:
                buy_price = current_price * (1 + config.slippage_rate)
                fee = capital * config.fee_rate
                buy_amount = capital - fee
                volume = buy_amount / buy_price
                position_volume = volume
                entry_price = buy_price
                high_price = buy_price
                capital = 0
                trades.append(BacktestTrade(timestamp, "buy", buy_price, volume, fee, signal.reason))

            elif position_volume > 0 and (signal.signal == Signal.SELL or trailing_triggered or stop_triggered):
                sell_price = current_price * (1 - config.slippage_rate)
                proceeds = position_volume * sell_price
                fee = proceeds * config.fee_rate
                capital = proceeds - fee
                if stop_triggered:
                    reason = f"스탑로스: {((entry_price - current_price) / entry_price * 100):.1f}% 손실"
                elif trailing_triggered:
                    reason = f"트레일링 스탑: 고점 대비 {((high_price - current_price) / high_price * 100):.1f}% 하락"
                else:
                    reason = signal.reason
                trades.append(BacktestTrade(timestamp, "sell", sell_price, position_volume, fee, reason))
                position_volume = 0
                entry_price = 0.0
                high_price = 0.0

            equity = capital + (position_volume * current_price)
            peak_equity = max(peak_equity, equity)
            drawdown = ((peak_equity - equity) / peak_equity) * 100 if peak_equity > 0 else 0
            max_drawdown = max(max_drawdown, drawdown)

            daily_return = (equity - prev_equity) / prev_equity if prev_equity > 0 else 0
            daily_returns.append(daily_return)
            prev_equity = equity

            equity_curve.append({"timestamp": timestamp, "equity": round(equity, 2)})

        # 미결 포지션 청산
        if position_volume > 0:
            last_price = float(df["close"].iloc[-1])
            capital += position_volume * last_price * (1 - config.fee_rate)
            position_volume = 0

        return self._compute_metrics(config, trades, equity_curve, capital, max_drawdown, daily_returns)

    async def _run_futures(self, config: BacktestConfig, strategy: Strategy, df: pd.DataFrame) -> BacktestResult:
        """Backtest with leverage and short positions.

        BUY signal: close short → open long
        SELL signal: close long → open short (if enable_short)
        """
        leverage = config.leverage
        capital = config.initial_capital  # margin balance (USDT)
        position_side: str | None = None  # "long" or "short"
        position_volume = 0.0
        entry_price = 0.0
        high_price = 0.0  # Peak price for trailing stop (lowest for shorts)
        margin_used = 0.0  # margin locked in position
        trades: list[BacktestTrade] = []
        equity_curve: list[dict] = []
        peak_equity = capital
        max_drawdown = 0.0
        daily_returns: list[float] = []
        prev_equity = capital

        def _close_position(close_price: float, reason: str, timestamp: str):
            nonlocal capital, position_side, position_volume, margin_used, entry_price, high_price
            if position_side == "long":
                pnl = (close_price - entry_price) * position_volume
                side_label = "close_long"
            else:
                pnl = (entry_price - close_price) * position_volume
                side_label = "close_short"
            fee = close_price * position_volume * config.fee_rate
            capital = capital + margin_used + pnl - fee
            trades.append(BacktestTrade(timestamp, side_label, close_price, position_volume, fee, reason))
            position_side = None
            position_volume = 0.0
            margin_used = 0.0
            entry_price = 0.0
            high_price = 0.0

        for i in range(strategy.required_candle_count, len(df)):
            window = df.iloc[:i + 1]
            current_price = float(window["close"].iloc[-1])
            timestamp = str(window.index[-1])

            # Check stop-loss and trailing stop before strategy signal
            if position_side and position_volume > 0:
                # Update high_price
                if position_side == "long":
                    high_price = max(high_price, current_price)
                    loss_pct = ((entry_price - current_price) / entry_price) * 100
                else:
                    high_price = min(high_price, current_price) if high_price > 0 else current_price
                    loss_pct = ((current_price - entry_price) / entry_price) * 100

                # Hard stop-loss
                if loss_pct >= config.stop_loss_pct:
                    effective_loss = loss_pct * leverage
                    close_price = current_price * (1 + config.slippage_rate if position_side == "short" else 1 - config.slippage_rate)
                    _close_position(close_price, f"스탑로스: {loss_pct:.1f}% (실효 {effective_loss:.1f}%)", timestamp)
                # Trailing stop
                elif config.trailing_stop_pct and high_price > 0:
                    if position_side == "long":
                        drop_pct = ((high_price - current_price) / high_price) * 100
                    else:
                        drop_pct = ((current_price - high_price) / high_price) * 100
                    effective_drop = drop_pct * leverage
                    if effective_drop >= config.trailing_stop_pct:
                        close_price = current_price * (1 + config.slippage_rate if position_side == "short" else 1 - config.slippage_rate)
                        _close_position(close_price, f"트레일링 스탑: 극점 대비 {drop_pct:.1f}% 반전", timestamp)

            signal = strategy.analyze(window, config.strategy_params)

            if signal.signal == Signal.BUY:
                # Close short if exists
                if position_side == "short" and position_volume > 0:
                    close_price = current_price * (1 + config.slippage_rate)
                    _close_position(close_price, signal.reason, timestamp)

                # Open long if no position
                if position_side is None and capital > 0:
                    margin = capital * 0.95  # use 95% of available margin
                    notional = margin * leverage
                    buy_price = current_price * (1 + config.slippage_rate)
                    fee = notional * config.fee_rate
                    volume = (notional - fee) / buy_price
                    position_side = "long"
                    position_volume = volume
                    entry_price = buy_price
                    high_price = buy_price
                    margin_used = margin
                    capital -= margin
                    trades.append(BacktestTrade(timestamp, "open_long", buy_price, volume, fee,
                                                f"[{leverage}x] {signal.reason}"))

            elif signal.signal == Signal.SELL:
                # Close long if exists
                if position_side == "long" and position_volume > 0:
                    close_price = current_price * (1 - config.slippage_rate)
                    _close_position(close_price, signal.reason, timestamp)

                # Open short if no position and shorts enabled
                if position_side is None and capital > 0 and config.enable_short:
                    margin = capital * 0.95
                    notional = margin * leverage
                    sell_price = current_price * (1 - config.slippage_rate)
                    fee = notional * config.fee_rate
                    volume = (notional - fee) / sell_price
                    position_side = "short"
                    position_volume = volume
                    entry_price = sell_price
                    high_price = sell_price
                    margin_used = margin
                    capital -= margin
                    trades.append(BacktestTrade(timestamp, "open_short", sell_price, volume, fee,
                                                f"[{leverage}x] {signal.reason}"))

            # Calculate equity
            if position_side == "long" and position_volume > 0:
                unrealized_pnl = (current_price - entry_price) * position_volume
                equity = capital + margin_used + unrealized_pnl
            elif position_side == "short" and position_volume > 0:
                unrealized_pnl = (entry_price - current_price) * position_volume
                equity = capital + margin_used + unrealized_pnl
            else:
                equity = capital

            # Liquidation check: if equity drops below 0, stop
            if equity <= 0:
                capital = 0
                position_side = None
                position_volume = 0.0
                margin_used = 0.0
                trades.append(BacktestTrade(timestamp, "liquidation", current_price, 0, 0, "청산"))
                equity = 0

            peak_equity = max(peak_equity, equity)
            drawdown = ((peak_equity - equity) / peak_equity) * 100 if peak_equity > 0 else 0
            max_drawdown = max(max_drawdown, drawdown)

            daily_return = (equity - prev_equity) / prev_equity if prev_equity > 0 else 0
            daily_returns.append(daily_return)
            prev_equity = max(equity, 0.001)

            equity_curve.append({"timestamp": timestamp, "equity": round(equity, 2)})

            if capital <= 0 and position_side is None:
                break  # Fully liquidated

        # Close any remaining position
        if position_side and position_volume > 0:
            last_price = float(df["close"].iloc[-1])
            if position_side == "long":
                pnl = (last_price - entry_price) * position_volume
            else:
                pnl = (entry_price - last_price) * position_volume
            fee = last_price * position_volume * config.fee_rate
            capital = capital + margin_used + pnl - fee

        return self._compute_metrics(config, trades, equity_curve, capital, max_drawdown, daily_returns)

    def _compute_metrics(
        self,
        config: BacktestConfig,
        trades: list[BacktestTrade],
        equity_curve: list[dict],
        final_capital: float,
        max_drawdown: float,
        daily_returns: list[float],
    ) -> BacktestResult:
        total_return_pct = ((final_capital - config.initial_capital) / config.initial_capital) * 100

        # 승률 계산 (진입→청산 쌍)
        wins = 0
        losses = 0
        gross_profit = 0.0
        gross_loss = 0.0

        open_trades = [t for t in trades if t.side in ("buy", "open_long", "open_short")]
        close_trades = [t for t in trades if t.side in ("sell", "close_long", "close_short", "liquidation")]
        pairs = min(len(open_trades), len(close_trades))

        for i in range(pairs):
            open_t = open_trades[i]
            close_t = close_trades[i]
            if open_t.side in ("buy", "open_long"):
                pnl = (close_t.price - open_t.price) * open_t.volume
            else:  # open_short
                pnl = (open_t.price - close_t.price) * open_t.volume
            pnl -= open_t.fee + close_t.fee
            if pnl > 0:
                wins += 1
                gross_profit += pnl
            else:
                losses += 1
                gross_loss += abs(pnl)

        win_rate = (wins / pairs * 100) if pairs > 0 else 0
        profit_factor = (gross_profit / gross_loss) if gross_loss > 0 else float("inf") if gross_profit > 0 else 0

        # 샤프 비율 (연간화)
        if daily_returns and len(daily_returns) > 1:
            avg_return = sum(daily_returns) / len(daily_returns)
            std_return = (sum((r - avg_return) ** 2 for r in daily_returns) / (len(daily_returns) - 1)) ** 0.5
            sharpe_ratio = (avg_return / std_return * math.sqrt(365)) if std_return > 0 else 0
        else:
            sharpe_ratio = 0

        return BacktestResult(
            config=config,
            trades=trades,
            final_capital=round(final_capital, 2),
            total_return_pct=round(total_return_pct, 2),
            max_drawdown_pct=round(max_drawdown, 2),
            sharpe_ratio=round(sharpe_ratio, 2),
            win_rate=round(win_rate, 2),
            total_trades=len(trades),
            profit_factor=round(profit_factor, 2) if profit_factor != float("inf") else 999.99,
            equity_curve=equity_curve,
        )

    def save_result(self, result: BacktestResult) -> int:
        trades_data = [
            {"timestamp": t.timestamp, "side": t.side, "price": t.price,
             "volume": t.volume, "fee": t.fee, "reason": t.reason}
            for t in result.trades
        ]
        return self.db.save_backtest_result(
            strategy_name=result.config.strategy_name,
            ticker=result.config.ticker,
            interval=result.config.interval,
            params=result.config.strategy_params,
            start_date=result.config.start_date,
            end_date=result.config.end_date,
            initial_capital=result.config.initial_capital,
            final_capital=result.final_capital,
            total_return_pct=result.total_return_pct,
            max_drawdown_pct=result.max_drawdown_pct,
            sharpe_ratio=result.sharpe_ratio,
            win_rate=result.win_rate,
            total_trades=result.total_trades,
            profit_factor=result.profit_factor,
            trades_json=json.dumps(trades_data),
            equity_curve_json=json.dumps(result.equity_curve),
        )
