import pandas as pd
import pandas_ta_classic as ta

from src.strategies.base import Signal, TradeSignal
from src.strategies.registry import register


@register
class RSIStrategy:
    @property
    def name(self) -> str:
        return "rsi"

    @property
    def required_candle_count(self) -> int:
        return 50

    @property
    def default_params(self) -> dict:
        return {"period": 14, "oversold": 30, "overbought": 70}

    def analyze(self, df: pd.DataFrame, params: dict | None = None) -> TradeSignal:
        p = {**self.default_params, **(params or {})}
        rsi = ta.rsi(df["close"], length=p["period"])
        current_rsi = rsi.iloc[-1]

        if current_rsi < p["oversold"]:
            return TradeSignal(
                signal=Signal.BUY,
                ticker="",
                confidence=min(1.0, (p["oversold"] - current_rsi) / p["oversold"]),
                reason=f"RSI 과매도: {current_rsi:.1f} < {p['oversold']}",
                indicators={"rsi": round(current_rsi, 2)},
            )
        elif current_rsi > p["overbought"]:
            return TradeSignal(
                signal=Signal.SELL,
                ticker="",
                confidence=min(1.0, (current_rsi - p["overbought"]) / (100 - p["overbought"])),
                reason=f"RSI 과매수: {current_rsi:.1f} > {p['overbought']}",
                indicators={"rsi": round(current_rsi, 2)},
            )
        else:
            return TradeSignal(
                signal=Signal.HOLD,
                ticker="",
                confidence=0.0,
                reason=f"RSI 중립: {current_rsi:.1f}",
                indicators={"rsi": round(current_rsi, 2)},
            )
