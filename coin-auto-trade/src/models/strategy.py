from pydantic import BaseModel


class StrategyConfigCreate(BaseModel):
    name: str
    ticker: str
    params: dict = {}
    interval: str = "minute60"
    exchange: str = "upbit"


class StrategyConfigUpdate(BaseModel):
    params: dict | None = None
    interval: str | None = None


class StrategyConfigResponse(BaseModel):
    id: int
    name: str
    ticker: str
    params: str  # JSON string
    interval: str
    enabled: bool
    exchange: str = "upbit"
    created_at: str
    updated_at: str


class StrategyInfo(BaseModel):
    name: str
    required_candle_count: int
    default_params: dict
