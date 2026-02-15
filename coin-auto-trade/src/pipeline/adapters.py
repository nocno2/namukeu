"""Adapters between pipeline and existing strategy/protocol systems."""
from __future__ import annotations

import pandas as pd

from src.pipeline.base import Evidence, PipelineContext, PipelineResult
from src.pipeline.pipeline import TradingPipeline
from src.strategies.base import Signal, Strategy, TradeSignal
from src.strategies.registry import get_strategy


class StrategyAdapter:
    """Wraps an existing Strategy as an EvidenceProvider."""

    def __init__(self, strategy_name: str, weight: float = 0.3,
                 sub_params: dict | None = None):
        self._strategy_name = strategy_name
        self._weight = weight
        self._sub_params = sub_params or {}

    @property
    def name(self) -> str:
        return self._strategy_name

    @property
    def source_type(self) -> str:
        return "technical"

    @property
    def default_config(self) -> dict:
        return {"weight": self._weight, "params": self._sub_params}

    async def evaluate(self, context: PipelineContext) -> Evidence | None:
        strategy = get_strategy(self._strategy_name)
        params = {**self._sub_params, **context.params.get(self._strategy_name, {})}
        signal = strategy.analyze(context.df, params)
        return Evidence(
            source=f"technical:{self._strategy_name}",
            signal=signal.signal,
            confidence=signal.confidence,
            weight=self._weight,
            reason=signal.reason,
            data=signal.indicators,
        )


class PipelineStrategy:
    """Exposes a TradingPipeline as a Strategy (for backtester compatibility)."""

    def __init__(self, pipeline_name: str, pipeline: TradingPipeline,
                 required_candles: int = 60, default_params: dict | None = None):
        self._name = pipeline_name
        self._pipeline = pipeline
        self._required_candles = required_candles
        self._default_params = default_params or {}
        self._last_result: PipelineResult | None = None

    @property
    def name(self) -> str:
        return self._name

    @property
    def required_candle_count(self) -> int:
        return self._required_candles

    @property
    def default_params(self) -> dict:
        return self._default_params

    @property
    def last_pipeline_result(self) -> PipelineResult | None:
        return self._last_result

    def _to_trade_signal(self, result: PipelineResult) -> TradeSignal:
        self._last_result = result
        return TradeSignal(
            signal=result.signal,
            ticker="",
            confidence=result.confidence,
            reason=result.reason,
            indicators={
                "evidences": [
                    {"source": e.source, "signal": e.signal.value,
                     "confidence": e.confidence, "reason": e.reason}
                    for e in result.evidences
                ],
                "vetoed": result.vetoed,
                "veto_source": result.veto_source,
            },
        )

    async def analyze_async(self, df: pd.DataFrame, params: dict | None = None) -> TradeSignal:
        """Async version — used by scheduler directly."""
        p = {**self._default_params, **(params or {})}
        context = PipelineContext(ticker="", df=df, interval="minute60", params=p)
        result = await self._pipeline.evaluate(context)
        return self._to_trade_signal(result)

    def analyze(self, df: pd.DataFrame, params: dict | None = None) -> TradeSignal:
        """Sync version — used by backtester."""
        import asyncio
        p = {**self._default_params, **(params or {})}
        context = PipelineContext(ticker="", df=df, interval="minute60", params=p)
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            loop = None

        if loop and loop.is_running():
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor() as pool:
                result = pool.submit(asyncio.run, self._pipeline.evaluate(context)).result()
        else:
            result = asyncio.run(self._pipeline.evaluate(context))

        return self._to_trade_signal(result)
