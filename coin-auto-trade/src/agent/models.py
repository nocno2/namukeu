"""에이전트 입출력 Pydantic 모델"""

from __future__ import annotations
from pydantic import BaseModel, Field


# --- 리서처 에이전트 출력 ---
class NewsItem(BaseModel):
    headline: str
    source: str
    impact: str = Field(description="BULLISH | BEARISH | NEUTRAL")
    affected_tickers: list[str] = []
    summary: str

class MacroEvent(BaseModel):
    event: str
    date: str
    expected_impact: str

class ResearchReport(BaseModel):
    research_date: str
    market_sentiment: str = Field(description="FEAR | NEUTRAL | GREED")
    fear_greed_index: int | None = None
    btc_dominance: float | None = None
    key_news: list[NewsItem] = []
    macro_events: list[MacroEvent] = []
    upbit_notices: list[str] = []
    market_overview: str


# --- 테크니컬 에이전트 출력 ---
class KeyIndicators(BaseModel):
    rsi_14: float | None = None
    macd_signal: str | None = None  # BULLISH_CROSS | BEARISH_CROSS | NEUTRAL
    bb_position: str | None = None  # UPPER | MIDDLE | LOWER | SQUEEZE
    ema_alignment: str | None = None  # BULLISH | BEARISH | MIXED

class TickerAnalysis(BaseModel):
    ticker: str
    trend: str = Field(description="BULLISH | BEARISH | SIDEWAYS")
    trend_strength: float = Field(ge=0.0, le=1.0)
    momentum: str = Field(description="STRONG_BUY | BUY | NEUTRAL | SELL | STRONG_SELL")
    volatility: str = Field(description="LOW | MEDIUM | HIGH")
    volume_signal: str = Field(description="INCREASING | DECREASING | SPIKE | NORMAL")
    support_levels: list[float] = []
    resistance_levels: list[float] = []
    key_indicators: KeyIndicators = Field(default_factory=KeyIndicators)
    technical_score: int = Field(ge=-100, le=100)
    analysis: str

class TechnicalReport(BaseModel):
    analysis_timestamp: str
    tickers: list[TickerAnalysis] = []


# --- 전략가 에이전트 출력 ---
class DecisionReasoning(BaseModel):
    fundamental: str = ""
    technical: str = ""
    catalyst: str = ""

class TradeDecision(BaseModel):
    ticker: str
    action: str = Field(description="BUY | SELL | HOLD")
    urgency: str = Field(default="WITHIN_CYCLE", description="IMMEDIATE | WITHIN_CYCLE | MONITOR")
    confidence: float = Field(ge=0.0, le=1.0)
    amount_krw: int = 0
    reasoning: DecisionReasoning = Field(default_factory=DecisionReasoning)
    risk_level: str = Field(default="MEDIUM", description="LOW | MEDIUM | HIGH")
    target_price: float | None = None
    stop_loss_price: float | None = None
    time_horizon: str = "단기(1-3일)"

class HoldPosition(BaseModel):
    ticker: str
    action: str = "HOLD"
    reasoning: str = ""
    review_next_cycle: bool = True

class StrategyDecisions(BaseModel):
    cycle_id: str
    market_assessment: str
    decisions: list[TradeDecision] = []
    hold_positions: list[HoldPosition] = []
    portfolio_advice: str = ""
    self_reflection: str = ""


# --- 리스크 매니저 에이전트 출력 ---
class RiskDecision(BaseModel):
    ticker: str
    original_action: str
    verdict: str = Field(description="APPROVE | ADJUST | REJECT")
    adjusted_amount_krw: int | None = None
    rejection_reason: str | None = None
    risk_notes: str = ""

class ForcedAction(BaseModel):
    ticker: str
    action: str  # SELL
    reason: str

class RiskReview(BaseModel):
    review_timestamp: str
    portfolio_risk_score: int = Field(ge=0, le=100)
    decisions: list[RiskDecision] = []
    overall_assessment: str = ""
    warnings: list[str] = []
    forced_actions: list[ForcedAction] = []
