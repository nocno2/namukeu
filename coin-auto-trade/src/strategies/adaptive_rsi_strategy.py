"""Adaptive RSI Strategy: Regime-aware RSI with dynamic thresholds.

Market regime (ADX-based)에 따라 RSI 임계값을 동적으로 조정:
- 횡보장 (ADX < 15): 더 많은 시그널을 위해 임계값 축소 (25/75)
- 중간 (15 <= ADX < 25): 약간 축소 (28/72)
- 추세장 (ADX >= 25): 표준 임계값 (30/70)

이로써 다양한 시장 환경에서 거래 기회 포착 가능.
"""
import pandas as pd
import pandas_ta_classic as ta

from src.strategies.base import Signal, TradeSignal
from src.strategies.registry import register


@register
class AdaptiveRSIStrategy:
    @property
    def name(self) -> str:
        return "adaptive_rsi"

    @property
    def required_candle_count(self) -> int:
        return 60  # RSI(14) + ADX(14) + SMA(20) + buffer

    @property
    def default_params(self) -> dict:
        return {
            "rsi_period": 14,
            # 횡보장용 임계값
            "oversold_range": 25,
            "overbought_range": 75,
            # 중간 시장용 임계값
            "oversold_moderate": 28,
            "overbought_moderate": 72,
            # 추세장용 임계값
            "oversold_trend": 30,
            "overbought_trend": 70,
            # ADX 설정
            "adx_period": 14,
            "adx_weak": 15,
            "adx_strong": 25,
        }

    def analyze(self, df: pd.DataFrame, params: dict | None = None) -> TradeSignal:
        p = {**self.default_params, **(params or {})}

        # RSI 계산
        rsi = ta.rsi(df["close"], length=p["rsi_period"])
        current_rsi = rsi.iloc[-1]

        # ADX 계산 (시장 Regime 감지)
        adx_df = ta.adx(df["high"], df["low"], df["close"], length=p["adx_period"])
        if adx_df is None or adx_df.empty:
            # ADX 계산 실패 시 표준 RSI만 사용
            return self._generate_signal(current_rsi, p, "unknown")

        adx_col = f"ADX_{p['adx_period']}"
        if adx_col not in adx_df.columns:
            return self._generate_signal(current_rsi, p, "unknown")

        adx_value = adx_df[adx_col].iloc[-1]
        if adx_value != adx_value:  # NaN check
            return self._generate_signal(current_rsi, p, "unknown")

        # Regime 감지 및 임계값 선택
        if adx_value < p["adx_weak"]:
            regime = "range"  # 횡보장
            oversold = p["oversold_range"]
            overbought = p["overbought_range"]
        elif adx_value >= p["adx_strong"]:
            regime = "trend"  # 추세장
            oversold = p["oversold_trend"]
            overbought = p["overbought_trend"]
        else:
            regime = "moderate"  # 중간
            oversold = p["oversold_moderate"]
            overbought = p["overbought_moderate"]

        return self._generate_signal(current_rsi, p, regime, oversold, overbought, adx_value)

    def _generate_signal(
        self,
        current_rsi: float,
        params: dict,
        regime: str,
        oversold: int | None = None,
        overbought: int | None = None,
        adx_value: float | None = None,
    ) -> TradeSignal:
        """RSI 값과 regime에 따른 시그널 생성."""
        # regime별 기본값
        if oversold is None:
            if regime == "range":
                oversold = params["oversold_range"]
                overbought = params["overbought_range"]
            elif regime == "moderate":
                oversold = params["oversold_moderate"]
                overbought = params["overbought_moderate"]
            else:  # trend or unknown
                oversold = params["oversold_trend"]
                overbought = params["overbought_trend"]

        # 시그널 생성
        if current_rsi < oversold:
            confidence = min(1.0, (oversold - current_rsi) / oversold)
            return TradeSignal(
                signal=Signal.BUY,
                ticker="",
                confidence=confidence,
                reason=f"RSI 과매도: {current_rsi:.1f} < {oversold} ({regime}, ADX={adx_value:.1f if adx_value else 'N/A'})",
                indicators={
                    "rsi": round(current_rsi, 2),
                    "regime": regime,
                    "adx": round(adx_value, 2) if adx_value else None,
                    "threshold_oversold": oversold,
                    "threshold_overbought": overbought,
                },
            )
        elif current_rsi > overbought:
            confidence = min(1.0, (current_rsi - overbought) / (100 - overbought))
            return TradeSignal(
                signal=Signal.SELL,
                ticker="",
                confidence=confidence,
                reason=f"RSI 과매수: {current_rsi:.1f} > {overbought} ({regime}, ADX={adx_value:.1f if adx_value else 'N/A'})",
                indicators={
                    "rsi": round(current_rsi, 2),
                    "regime": regime,
                    "adx": round(adx_value, 2) if adx_value else None,
                    "threshold_oversold": oversold,
                    "threshold_overbought": overbought,
                },
            )
        else:
            return TradeSignal(
                signal=Signal.HOLD,
                ticker="",
                confidence=0.0,
                reason=f"RSI 중립: {current_rsi:.1f} ({regime}, ADX={adx_value:.1f if adx_value else 'N/A'})",
                indicators={
                    "rsi": round(current_rsi, 2),
                    "regime": regime,
                    "adx": round(adx_value, 2) if adx_value else None,
                    "threshold_oversold": oversold,
                    "threshold_overbought": overbought,
                },
            )
