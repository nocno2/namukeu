"""EMA Crossover with Volume confirmation strategy."""
import pandas as pd
import pandas_ta_classic as ta

from src.strategies.base import Signal, TradeSignal
from src.strategies.registry import register


@register
class EMACrossoverVolumeStrategy:
    @property
    def name(self) -> str:
        return "ema_crossover_vol"

    @property
    def required_candle_count(self) -> int:
        return 50

    @property
    def default_params(self) -> dict:
        return {"fast_period": 9, "slow_period": 21, "volume_ma_period": 20, "volume_multiplier": 1.5}

    def analyze(self, df: pd.DataFrame, params: dict | None = None) -> TradeSignal:
        p = {**self.default_params, **(params or {})}

        # EMA 계산
        ema_fast = ta.ema(df["close"], length=p["fast_period"])
        ema_slow = ta.ema(df["close"], length=p["slow_period"])

        # 거래량 이동평균
        volume_ma = ta.sma(df["volume"], length=p["volume_ma_period"])

        current_fast = ema_fast.iloc[-1]
        current_slow = ema_slow.iloc[-1]
        prev_fast = ema_fast.iloc[-2] if len(ema_fast) > 1 else current_fast
        prev_slow = ema_slow.iloc[-2] if len(ema_slow) > 1 else current_slow

        current_volume = df["volume"].iloc[-1]
        avg_volume = volume_ma.iloc[-1] if not pd.isna(volume_ma.iloc[-1]) else current_volume

        close = df["close"].iloc[-1]

        # Golden Cross: fast EMA가 slow EMA 위로
        golden_cross = prev_fast <= prev_slow and current_fast > current_slow
        # Death Cross: fast EMA가 slow EMA 아래로
        death_cross = prev_fast >= prev_slow and current_fast < current_slow

        # 거래량 확인
        volume_confirm = current_volume > (avg_volume * p["volume_multiplier"])

        if golden_cross:
            confidence = 0.7 if volume_confirm else 0.5
            reason = f"EMA Golden Cross (FV:{current_fast:.0f}, SV:{current_slow:.0f})"
            if volume_confirm:
                reason += f" + 거래량 증가 ({current_volume/avg_volume:.1f}배)"

            return TradeSignal(
                signal=Signal.BUY,
                ticker="",
                confidence=confidence,
                reason=reason,
                indicators={
                    "ema_fast": round(current_fast, 2),
                    "ema_slow": round(current_slow, 2),
                    "volume": int(current_volume),
                    "volume_ma": round(avg_volume, 2),
                    "volume_ratio": round(current_volume / avg_volume, 2) if avg_volume > 0 else 0,
                },
            )

        elif death_cross:
            confidence = 0.7 if volume_confirm else 0.5
            reason = f"EMA Death Cross (FV:{current_fast:.0f}, SV:{current_slow:.0f})"
            if volume_confirm:
                reason += f" + 거래량 증가 ({current_volume/avg_volume:.1f}배)"

            return TradeSignal(
                signal=Signal.SELL,
                ticker="",
                confidence=confidence,
                reason=reason,
                indicators={
                    "ema_fast": round(current_fast, 2),
                    "ema_slow": round(current_slow, 2),
                    "volume": int(current_volume),
                    "volume_ma": round(avg_volume, 2),
                    "volume_ratio": round(current_volume / avg_volume, 2) if avg_volume > 0 else 0,
                },
            )

        # 트렌드 확인 ( HOLD 상태)
        if current_fast > current_slow:
            return TradeSignal(
                signal=Signal.HOLD,
                ticker="",
                confidence=0.2,
                reason=f"상승EMA 유지 (FV:{current_fast:.0f} > SV:{current_slow:.0f})",
                indicators={
                    "ema_fast": round(current_fast, 2),
                    "ema_slow": round(current_slow, 2),
                },
            )
        else:
            return TradeSignal(
                signal=Signal.HOLD,
                ticker="",
                confidence=0.2,
                reason=f"하락EMA 유지 (FV:{current_fast:.0f} < SV:{current_slow:.0f})",
                indicators={
                    "ema_fast": round(current_fast, 2),
                    "ema_slow": round(current_slow, 2),
                },
            )
