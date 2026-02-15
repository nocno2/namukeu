from pydantic import BaseModel


class PortfolioSummary(BaseModel):
    total_equity: float
    cash_balance: float
    positions_value: float
    total_pnl: float
    total_pnl_pct: float
    daily_pnl: float
    active_positions: int
    trading_mode: str


class StatusResponse(BaseModel):
    server: str
    trading_mode: str
    active_strategies: int
    active_positions: int
    dry_run: bool
    active_exchanges: list[str] = []
