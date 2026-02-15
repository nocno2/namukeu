"""Trading pipeline: multi-stage evidence evaluation and aggregation."""
import asyncio
import logging
from dataclasses import dataclass, field

from src.pipeline.base import Evidence, EvidenceProvider, PipelineContext, PipelineResult
from src.strategies.base import Signal

logger = logging.getLogger(__name__)


@dataclass
class PipelineStage:
    name: str
    providers: list[EvidenceProvider] = field(default_factory=list)


class WeightedAggregator:
    def aggregate(self, evidences: list[Evidence], buy_threshold: float = 0.4,
                  sell_threshold: float = 0.4) -> PipelineResult:
        if not evidences:
            return PipelineResult(
                signal=Signal.HOLD, confidence=0.0, evidences=[],
                reason="근거 없음",
            )

        # Check veto
        for ev in evidences:
            if ev.can_veto and ev.signal == Signal.HOLD:
                return PipelineResult(
                    signal=Signal.HOLD, confidence=0.0, evidences=evidences,
                    reason=f"VETO by {ev.source}: {ev.reason}",
                    vetoed=True, veto_source=ev.source,
                )

        total_weight = sum(ev.weight for ev in evidences)
        if total_weight == 0:
            return PipelineResult(
                signal=Signal.HOLD, confidence=0.0, evidences=evidences,
                reason="가중치 합 0",
            )

        buy_score = 0.0
        sell_score = 0.0
        reasons = []

        for ev in evidences:
            norm_weight = ev.weight / total_weight
            if ev.signal == Signal.BUY:
                buy_score += norm_weight * ev.confidence
                reasons.append(f"{ev.source}: BUY({ev.confidence:.2f})")
            elif ev.signal == Signal.SELL:
                sell_score += norm_weight * ev.confidence
                reasons.append(f"{ev.source}: SELL({ev.confidence:.2f})")
            else:
                reasons.append(f"{ev.source}: HOLD")

        reason_str = " | ".join(reasons)

        if buy_score >= buy_threshold and buy_score > sell_score:
            return PipelineResult(
                signal=Signal.BUY, confidence=round(buy_score, 3),
                evidences=evidences,
                reason=f"파이프라인 매수({buy_score:.2f}): {reason_str}",
            )
        elif sell_score >= sell_threshold and sell_score > buy_score:
            return PipelineResult(
                signal=Signal.SELL, confidence=round(sell_score, 3),
                evidences=evidences,
                reason=f"파이프라인 매도({sell_score:.2f}): {reason_str}",
            )
        return PipelineResult(
            signal=Signal.HOLD, confidence=0.0, evidences=evidences,
            reason=f"파이프라인 관망: {reason_str}",
        )


class TradingPipeline:
    def __init__(self, stages: list[PipelineStage] | None = None,
                 buy_threshold: float = 0.4, sell_threshold: float = 0.4):
        self.stages = stages or []
        self.buy_threshold = buy_threshold
        self.sell_threshold = sell_threshold
        self._aggregator = WeightedAggregator()

    async def evaluate(self, context: PipelineContext) -> PipelineResult:
        all_evidences: list[Evidence] = []

        for stage in self.stages:
            # Run providers within a stage in parallel
            tasks = [p.evaluate(context) for p in stage.providers]
            results = await asyncio.gather(*tasks, return_exceptions=True)

            stage_evidences: list[Evidence] = []
            for provider, result in zip(stage.providers, results):
                if isinstance(result, Exception):
                    logger.error(f"Provider {provider.name} 에러: {result}")
                    continue
                if result is not None:
                    stage_evidences.append(result)

            all_evidences.extend(stage_evidences)

            # Check for veto in this stage before proceeding
            for ev in stage_evidences:
                if ev.can_veto and ev.signal == Signal.HOLD:
                    return PipelineResult(
                        signal=Signal.HOLD, confidence=0.0,
                        evidences=all_evidences,
                        reason=f"VETO by {ev.source}: {ev.reason}",
                        vetoed=True, veto_source=ev.source,
                    )

            # Pass evidences to next stage context
            context.prior_evidences = list(all_evidences)

        return self._aggregator.aggregate(
            all_evidences, self.buy_threshold, self.sell_threshold,
        )
