"""Trend Following strategy: pipeline-based with ADX regime filter."""
import pandas as pd

from src.strategies.base import Signal, TradeSignal
from src.strategies.registry import register


@register
class TrendFollowingStrategy:
    @property
    def name(self) -> str:
        return "trend_following"

    @property
    def required_candle_count(self) -> int:
        return 60

    @property
    def default_params(self) -> dict:
        return {"buy_threshold": 0.45, "sell_threshold": 0.45}

    def analyze(self, df: pd.DataFrame, params: dict | None = None) -> TradeSignal:
        from src.pipeline.factory import create_pipeline
        p = {**self.default_params, **(params or {})}
        ps = create_pipeline("trend_following", p)
        return ps.analyze(df, p)

    async def analyze_async(self, df: pd.DataFrame, params: dict | None = None) -> TradeSignal:
        from src.pipeline.factory import create_pipeline
        p = {**self.default_params, **(params or {})}
        ps = create_pipeline("trend_following", p)
        return await ps.analyze_async(df, p)
