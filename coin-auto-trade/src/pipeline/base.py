"""Evidence pipeline abstractions."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol, runtime_checkable

import pandas as pd

from src.strategies.base import Signal


@dataclass
class Evidence:
    source: str           # e.g. "technical:rsi", "sentiment:fear_greed"
    signal: Signal
    confidence: float     # 0.0 ~ 1.0
    weight: float         # importance
    reason: str
    data: dict = field(default_factory=dict)
    can_veto: bool = False  # if True and signal is HOLD, forces entire pipeline to HOLD


@dataclass
class PipelineContext:
    ticker: str
    df: pd.DataFrame
    interval: str
    params: dict
    existing_position: dict | None = None
    prior_evidences: list[Evidence] = field(default_factory=list)
    extra: dict = field(default_factory=dict)


@dataclass
class PipelineResult:
    signal: Signal
    confidence: float
    evidences: list[Evidence]
    reason: str
    vetoed: bool = False
    veto_source: str | None = None


@runtime_checkable
class EvidenceProvider(Protocol):
    @property
    def name(self) -> str: ...

    @property
    def source_type(self) -> str: ...

    @property
    def default_config(self) -> dict: ...

    async def evaluate(self, context: PipelineContext) -> Evidence | None: ...
