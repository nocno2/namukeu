import pandas as pd
import pandas_ta_classic as ta

from src.strategies.base import Signal, TradeSignal
from src.strategies.registry import register


@register
class MACDStrategy:
    @property
    def name(self) -> str:
        return "macd"

    @property
    def required_candle_count(self) -> int:
        return 60

    @property
    def default_params(self) -> dict:
        return {"fast": 12, "slow": 26, "signal": 9}

    def analyze(self, df: pd.DataFrame, params: dict | None = None) -> TradeSignal:
        p = {**self.default_params, **(params or {})}
        macd_df = ta.macd(df["close"], fast=p["fast"], slow=p["slow"], signal=p["signal"])

        # pandas-ta returns columns: MACD_{fast}_{slow}_{signal}, MACDh_{...}, MACDs_{...}
        macd_col = f"MACD_{p['fast']}_{p['slow']}_{p['signal']}"
        hist_col = f"MACDh_{p['fast']}_{p['slow']}_{p['signal']}"
        signal_col = f"MACDs_{p['fast']}_{p['slow']}_{p['signal']}"

        macd_val = macd_df[macd_col].iloc[-1]
        hist_val = macd_df[hist_col].iloc[-1]
        prev_hist = macd_df[hist_col].iloc[-2]

        indicators = {
            "macd": round(macd_val, 4),
            "macd_histogram": round(hist_val, 4),
            "macd_signal": round(macd_df[signal_col].iloc[-1], 4),
        }

        # 골든크로스: 히스토그램이 음→양 전환
        if prev_hist < 0 and hist_val > 0:
            confidence = min(1.0, abs(hist_val) / (abs(hist_val) + abs(prev_hist)))
            return TradeSignal(
                signal=Signal.BUY,
                ticker="",
                confidence=confidence,
                reason=f"MACD 골든크로스 (hist: {prev_hist:.4f} → {hist_val:.4f})",
                indicators=indicators,
            )
        # 데드크로스: 히스토그램이 양→음 전환
        elif prev_hist > 0 and hist_val < 0:
            confidence = min(1.0, abs(hist_val) / (abs(hist_val) + abs(prev_hist)))
            return TradeSignal(
                signal=Signal.SELL,
                ticker="",
                confidence=confidence,
                reason=f"MACD 데드크로스 (hist: {prev_hist:.4f} → {hist_val:.4f})",
                indicators=indicators,
            )
        else:
            return TradeSignal(
                signal=Signal.HOLD,
                ticker="",
                confidence=0.0,
                reason=f"MACD 유지 (hist: {hist_val:.4f})",
                indicators=indicators,
            )
