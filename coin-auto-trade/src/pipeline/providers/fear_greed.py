"""FearGreedProvider: Crypto Fear & Greed Index from alternative.me API."""
import logging
import time

import httpx

from src.pipeline.base import Evidence, PipelineContext
from src.pipeline.registry import register_provider
from src.strategies.base import Signal

logger = logging.getLogger(__name__)

_cache: dict = {"value": None, "timestamp": 0}
_CACHE_TTL = 3600


async def _fetch_fear_greed() -> int | None:
    now = time.time()
    if _cache["value"] is not None and (now - _cache["timestamp"]) < _CACHE_TTL:
        return _cache["value"]

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get("https://api.alternative.me/fng/?limit=1")
            if resp.status_code == 200:
                data = resp.json()
                value = int(data["data"][0]["value"])
                _cache["value"] = value
                _cache["timestamp"] = now
                return value
    except Exception as e:
        logger.warning(f"Fear & Greed API 실패: {e}")

    return _cache["value"]


@register_provider
class FearGreedProvider:
    @property
    def name(self) -> str:
        return "fear_greed"

    @property
    def source_type(self) -> str:
        return "sentiment"

    @property
    def default_config(self) -> dict:
        return {"extreme_fear": 20, "fear": 35, "greed": 65, "extreme_greed": 80}

    async def evaluate(self, context: PipelineContext) -> Evidence | None:
        if context.extra.get("backtesting"):
            return None

        cfg = {**self.default_config, **context.params.get("fear_greed", {})}
        value = await _fetch_fear_greed()
        if value is None:
            return None

        if value <= cfg["extreme_fear"]:
            return Evidence(
                source="sentiment:fear_greed",
                signal=Signal.BUY,
                confidence=min(1.0, (cfg["extreme_fear"] - value) / cfg["extreme_fear"] + 0.5),
                weight=0.2,
                reason=f"극도 공포 (FGI={value})",
                data={"fear_greed_index": value, "classification": "extreme_fear"},
            )
        elif value <= cfg["fear"]:
            return Evidence(
                source="sentiment:fear_greed",
                signal=Signal.BUY,
                confidence=0.3,
                weight=0.2,
                reason=f"공포 (FGI={value})",
                data={"fear_greed_index": value, "classification": "fear"},
            )
        elif value >= cfg["extreme_greed"]:
            return Evidence(
                source="sentiment:fear_greed",
                signal=Signal.SELL,
                confidence=min(1.0, (value - cfg["extreme_greed"]) / (100 - cfg["extreme_greed"]) + 0.5),
                weight=0.2,
                reason=f"극도 탐욕 (FGI={value})",
                data={"fear_greed_index": value, "classification": "extreme_greed"},
            )
        elif value >= cfg["greed"]:
            return Evidence(
                source="sentiment:fear_greed",
                signal=Signal.SELL,
                confidence=0.3,
                weight=0.2,
                reason=f"탐욕 (FGI={value})",
                data={"fear_greed_index": value, "classification": "greed"},
            )
        else:
            return Evidence(
                source="sentiment:fear_greed",
                signal=Signal.HOLD,
                confidence=0.0,
                weight=0.2,
                reason=f"중립 (FGI={value})",
                data={"fear_greed_index": value, "classification": "neutral"},
            )
