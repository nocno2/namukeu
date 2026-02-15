"""MarketRegimeProvider: ADX-based trend/range detection with veto power."""
import pandas_ta_classic as ta

from src.pipeline.base import Evidence, PipelineContext
from src.pipeline.registry import register_provider
from src.strategies.base import Signal


@register_provider
class MarketRegimeProvider:
    @property
    def name(self) -> str:
        return "market_regime"

    @property
    def source_type(self) -> str:
        return "filter"

    @property
    def default_config(self) -> dict:
        return {"adx_period": 14, "adx_weak": 15, "adx_strong": 25}

    async def evaluate(self, context: PipelineContext) -> Evidence | None:
        cfg = {**self.default_config, **context.params.get("market_regime", {})}
        df = context.df
        if len(df) < cfg["adx_period"] + 14:
            return None

        adx_df = ta.adx(df["high"], df["low"], df["close"], length=cfg["adx_period"])
        if adx_df is None or adx_df.empty:
            return None

        adx_col = f"ADX_{cfg['adx_period']}"
        if adx_col not in adx_df.columns:
            return None

        adx_value = adx_df[adx_col].iloc[-1]
        if adx_value != adx_value:  # NaN check
            return None

        if adx_value < cfg["adx_weak"]:
            return Evidence(
                source="filter:market_regime",
                signal=Signal.HOLD,
                confidence=0.0,
                weight=0.3,
                reason=f"횡보장 감지 (ADX={adx_value:.1f} < {cfg['adx_weak']})",
                data={"adx": round(adx_value, 2), "regime": "ranging"},
                can_veto=True,
            )
        elif adx_value >= cfg["adx_strong"]:
            buy_count = sum(1 for e in context.prior_evidences if e.signal == Signal.BUY)
            sell_count = sum(1 for e in context.prior_evidences if e.signal == Signal.SELL)
            if buy_count > sell_count:
                sig = Signal.BUY
            elif sell_count > buy_count:
                sig = Signal.SELL
            else:
                sig = Signal.HOLD
            conf = min(1.0, (adx_value - cfg["adx_strong"]) / 25 + 0.5)
            return Evidence(
                source="filter:market_regime",
                signal=sig,
                confidence=round(conf, 3),
                weight=0.3,
                reason=f"강한 추세 (ADX={adx_value:.1f})",
                data={"adx": round(adx_value, 2), "regime": "trending"},
            )
        else:
            return Evidence(
                source="filter:market_regime",
                signal=Signal.HOLD,
                confidence=0.0,
                weight=0.3,
                reason=f"보통 추세 (ADX={adx_value:.1f})",
                data={"adx": round(adx_value, 2), "regime": "moderate"},
            )
