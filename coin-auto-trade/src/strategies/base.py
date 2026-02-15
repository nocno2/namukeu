from dataclasses import dataclass, field
from enum import Enum
from typing import Protocol

import pandas as pd


class Signal(Enum):
    BUY = "buy"
    SELL = "sell"
    HOLD = "hold"


@dataclass
class TradeSignal:
    signal: Signal
    ticker: str
    confidence: float  # 0.0 ~ 1.0
    reason: str
    indicators: dict = field(default_factory=dict)
    suggested_amount_percent: float | None = None


class Strategy(Protocol):
    @property
    def name(self) -> str: ...

    @property
    def required_candle_count(self) -> int: ...

    @property
    def default_params(self) -> dict: ...

    def analyze(self, df: pd.DataFrame, params: dict | None = None) -> TradeSignal: ...
