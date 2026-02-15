"""VolumeProfileProvider: volume-based signal strength modifier."""
from src.pipeline.base import Evidence, PipelineContext
from src.pipeline.registry import register_provider
from src.strategies.base import Signal


@register_provider
class VolumeProfileProvider:
    @property
    def name(self) -> str:
        return "volume_profile"

    @property
    def source_type(self) -> str:
        return "filter"

    @property
    def default_config(self) -> dict:
        return {"lookback": 20, "high_multiplier": 1.5, "low_multiplier": 0.5}

    async def evaluate(self, context: PipelineContext) -> Evidence | None:
        cfg = {**self.default_config, **context.params.get("volume_profile", {})}
        df = context.df
        lookback = cfg["lookback"]
        if len(df) < lookback + 1:
            return None

        avg_volume = df["volume"].iloc[-lookback - 1:-1].mean()
        current_volume = df["volume"].iloc[-1]

        if avg_volume <= 0:
            return None

        volume_ratio = current_volume / avg_volume

        buy_count = sum(1 for e in context.prior_evidences if e.signal == Signal.BUY)
        sell_count = sum(1 for e in context.prior_evidences if e.signal == Signal.SELL)

        if volume_ratio >= cfg["high_multiplier"]:
            if buy_count > sell_count:
                sig = Signal.BUY
            elif sell_count > buy_count:
                sig = Signal.SELL
            else:
                sig = Signal.HOLD
            conf = min(1.0, (volume_ratio - 1.0) / 2.0)
            return Evidence(
                source="filter:volume_profile",
                signal=sig,
                confidence=round(conf, 3),
                weight=0.15,
                reason=f"고거래량 확인 (x{volume_ratio:.1f})",
                data={"volume_ratio": round(volume_ratio, 2)},
            )
        elif volume_ratio <= cfg["low_multiplier"]:
            return Evidence(
                source="filter:volume_profile",
                signal=Signal.HOLD,
                confidence=0.0,
                weight=0.15,
                reason=f"저거래량 (x{volume_ratio:.1f})",
                data={"volume_ratio": round(volume_ratio, 2)},
            )
        else:
            return Evidence(
                source="filter:volume_profile",
                signal=Signal.HOLD,
                confidence=0.0,
                weight=0.15,
                reason=f"보통 거래량 (x{volume_ratio:.1f})",
                data={"volume_ratio": round(volume_ratio, 2)},
            )
