"""Supertrend strategy: ATR-based trend following with confirmed signals."""
import numpy as np
import pandas as pd

from src.strategies.base import Signal, TradeSignal
from src.strategies.registry import register


def calculate_supertrend(df: pd.DataFrame, period: int = 10, multiplier: float = 3.0) -> pd.DataFrame:
    """Calculate Supertrend indicator using vectorized operations."""
    close = df["close"].values
    high = df["high"].values
    low = df["low"].values

    # ATR 계산 (Vectorized)
    tr1 = high - low
    tr2 = np.abs(high - np.roll(close, 1))
    tr3 = np.abs(low - np.roll(close, 1))
    tr = np.maximum(tr1, np.maximum(tr2, tr3))
    tr[0] = 0

    # ATR 이동평균
    atr = np.zeros(len(close))
    atr[period - 1] = np.mean(tr[:period])
    for i in range(period, len(close)):
        atr[i] = (atr[i - 1] * (period - 1) + tr[i]) / period

    # 기본 선 계산
    hl_mid = (high + low) / 2
    upper = hl_mid + (multiplier * atr)
    lower = hl_mid - (multiplier * atr)

    # Supertrend 계산
    supertrend = np.zeros(len(close))
    supertrend[period - 1] = upper[period - 1]
    trend = np.ones(len(close))  # 1 = bullish, -1 = bearish

    for i in range(period, len(close)):
        prev_st = supertrend[i - 1]
        curr_up = upper[i]
        curr_low = lower[i]

        if close[i] <= curr_up:
            supertrend[i] = min(curr_up, prev_st)
        else:
            supertrend[i] = max(curr_low, prev_st)

    # 트렌드 방향
    trend[close < supertrend] = -1.0

    result = df.copy()
    result["atr"] = atr
    result["supertrend"] = supertrend
    result["trend"] = trend

    return result


@register
class SupertrendStrategy:
    @property
    def name(self) -> str:
        return "supertrend"

    @property
    def required_candle_count(self) -> int:
        return 50

    @property
    def default_params(self) -> dict:
        return {"period": 10, "multiplier": 3.0}

    def analyze(self, df: pd.DataFrame, params: dict | None = None) -> TradeSignal:
        p = {**self.default_params, **(params or {})}

        df_calc = calculate_supertrend(df, p["period"], p["multiplier"])

        current_trend = df_calc["trend"].iloc[-1]
        prev_trend = df_calc["trend"].iloc[-2] if len(df_calc) > 1 else current_trend
        supertrend = df_calc["supertrend"].iloc[-1]
        close = df["close"].iloc[-1]
        atr = df_calc["atr"].iloc[-1]

        # 트렌드 전환 감지
        if current_trend == 1.0 and prev_trend == -1.0:
            # 하락 → 상승 전환 (Golden Cross)
            confidence = min(1.0, abs(close - supertrend) / atr) if atr > 0 else 0.5
            return TradeSignal(
                signal=Signal.BUY,
                ticker="",
                confidence=confidence,
                reason=f"Supertrend 전환: 하락→상승 ({supertrend:.0f})",
                indicators={
                    "supertrend": round(supertrend, 2),
                    "close": round(close, 2),
                    "atr": round(atr, 2),
                    "trend": "bullish"
                },
            )
        elif current_trend == -1.0 and prev_trend == 1.0:
            # 상승 → 하락 전환 (Death Cross)
            confidence = min(1.0, abs(close - supertrend) / atr) if atr > 0 else 0.5
            return TradeSignal(
                signal=Signal.SELL,
                ticker="",
                confidence=confidence,
                reason=f"Supertrend 전환: 상승→하락 ({supertrend:.0f})",
                indicators={
                    "supertrend": round(supertrend, 2),
                    "close": round(close, 2),
                    "atr": round(atr, 2),
                    "trend": "bearish"
                },
            )
        elif current_trend == 1.0:
            # 현재 상승 트렌드 유지
            return TradeSignal(
                signal=Signal.HOLD,
                ticker="",
                confidence=0.3,
                reason=f"상승 트렌드 유지 ({supertrend:.0f})",
                indicators={
                    "supertrend": round(supertrend, 2),
                    "close": round(close, 2),
                    "trend": "bullish"
                },
            )
        else:
            # 현재 하락 트렌드 유지
            return TradeSignal(
                signal=Signal.HOLD,
                ticker="",
                confidence=0.3,
                reason=f"하락 트렌드 유지 ({supertrend:.0f})",
                indicators={
                    "supertrend": round(supertrend, 2),
                    "close": round(close, 2),
                    "trend": "bearish"
                },
            )
