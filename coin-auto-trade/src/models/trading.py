from pydantic import BaseModel


class ModeRequest(BaseModel):
    dry_run: bool


class ModeResponse(BaseModel):
    dry_run: bool
    mode: str


class ManualBuyRequest(BaseModel):
    ticker: str
    amount: float  # KRW


class ManualSellRequest(BaseModel):
    ticker: str
    volume: float


class OrderResponse(BaseModel):
    id: int
    uuid: str | None
    strategy_id: int | None
    ticker: str
    side: str
    order_type: str
    price: float | None
    volume: float | None
    amount_krw: float | None
    fee: float
    state: str
    is_dry_run: bool
    signal_reason: str | None
    signal_confidence: float | None
    created_at: str
    executed_at: str | None


class PositionResponse(BaseModel):
    id: int
    ticker: str
    side: str
    volume: float
    avg_entry_price: float
    current_price: float | None
    unrealized_pnl: float
    unrealized_pnl_pct: float
    strategy_id: int | None
    opened_at: str
    updated_at: str
    exchange: str = "upbit"
    leverage: int = 1
