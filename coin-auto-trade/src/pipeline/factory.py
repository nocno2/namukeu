"""Pipeline factory: create pre-configured pipelines."""
from src.pipeline.adapters import StrategyAdapter, PipelineStrategy
from src.pipeline.pipeline import TradingPipeline, PipelineStage
from src.pipeline.registry import get_provider


def create_pipeline(name: str, params: dict | None = None) -> PipelineStrategy:
    """Create a PipelineStrategy by name."""
    p = params or {}

    if name == "combined_v2":
        return _create_combined_v2(p)
    elif name == "trend_following":
        return _create_trend_following(p)
    else:
        raise ValueError(f"Unknown pipeline: {name}")


def _create_combined_v2(params: dict) -> PipelineStrategy:
    """combined_v2: technical indicators + market regime filter + sentiment."""
    pipeline = TradingPipeline(
        stages=[
            PipelineStage(name="technical", providers=[
                StrategyAdapter("rsi", weight=0.35),
                StrategyAdapter("macd", weight=0.3),
                StrategyAdapter("bollinger", weight=0.2),
            ]),
            PipelineStage(name="filters", providers=[
                get_provider("market_regime"),
                get_provider("volume_profile"),
            ]),
            PipelineStage(name="sentiment", providers=[
                get_provider("fear_greed"),
            ]),
        ],
        buy_threshold=params.get("buy_threshold", 0.35),
        sell_threshold=params.get("sell_threshold", 0.35),
    )
    return PipelineStrategy(
        pipeline_name="combined_v2",
        pipeline=pipeline,
        required_candles=60,
        default_params=params,
    )


def _create_trend_following(params: dict) -> PipelineStrategy:
    """trend_following: only enters on strong ADX trend + technical confirmation."""
    pipeline = TradingPipeline(
        stages=[
            PipelineStage(name="technical", providers=[
                StrategyAdapter("rsi", weight=0.3),
                StrategyAdapter("macd", weight=0.35),
                StrategyAdapter("bollinger", weight=0.2),
            ]),
            PipelineStage(name="filters", providers=[
                get_provider("market_regime"),
                get_provider("volume_profile"),
            ]),
        ],
        buy_threshold=params.get("buy_threshold", 0.45),
        sell_threshold=params.get("sell_threshold", 0.45),
    )
    return PipelineStrategy(
        pipeline_name="trend_following",
        pipeline=pipeline,
        required_candles=60,
        default_params=params,
    )
