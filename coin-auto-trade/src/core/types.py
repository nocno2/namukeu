from dataclasses import dataclass, field
from enum import Enum


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
