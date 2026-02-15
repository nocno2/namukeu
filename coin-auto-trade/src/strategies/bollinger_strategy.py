import pandas as pd
import pandas_ta_classic as ta

from src.strategies.base import Signal, TradeSignal
from src.strategies.registry import register


@register
class BollingerStrategy:
    @property
    def name(self) -> str:
        return "bollinger"

    @property
    def required_candle_count(self) -> int:
        return 40

    @property
    def default_params(self) -> dict:
        return {"period": 20, "std_dev": 2.0}

    def analyze(self, df: pd.DataFrame, params: dict | None = None) -> TradeSignal:
        p = {**self.default_params, **(params or {})}
        bb = ta.bbands(df["close"], length=p["period"], std=p["std_dev"])

        # pandas-ta returns: BBL_{period}_{std}, BBM_{period}_{std}, BBU_{period}_{std}, BBB_{period}_{std}, BBP_{period}_{std}
        suffix = f"{p['period']}_{p['std_dev']}"
        lower = bb[f"BBL_{suffix}"].iloc[-1]
        middle = bb[f"BBM_{suffix}"].iloc[-1]
        upper = bb[f"BBU_{suffix}"].iloc[-1]
        current_price = df["close"].iloc[-1]

        band_width = upper - lower
        indicators = {
            "bb_upper": round(upper, 2),
            "bb_middle": round(middle, 2),
            "bb_lower": round(lower, 2),
            "bb_width": round(band_width, 2),
            "price": round(current_price, 2),
        }

        # 하단 밴드 터치/이탈 → 매수 (반등 기대)
        if current_price <= lower:
            distance = (lower - current_price) / band_width if band_width > 0 else 0
            return TradeSignal(
                signal=Signal.BUY,
                ticker="",
                confidence=min(1.0, 0.5 + distance),
                reason=f"볼린저 하단 돌파: {current_price:,.0f} <= {lower:,.0f}",
                indicators=indicators,
            )
        # 상단 밴드 터치/이탈 → 매도 (과열)
        elif current_price >= upper:
            distance = (current_price - upper) / band_width if band_width > 0 else 0
            return TradeSignal(
                signal=Signal.SELL,
                ticker="",
                confidence=min(1.0, 0.5 + distance),
                reason=f"볼린저 상단 돌파: {current_price:,.0f} >= {upper:,.0f}",
                indicators=indicators,
            )
        else:
            return TradeSignal(
                signal=Signal.HOLD,
                ticker="",
                confidence=0.0,
                reason=f"볼린저 밴드 내 유지: {lower:,.0f} < {current_price:,.0f} < {upper:,.0f}",
                indicators=indicators,
            )
