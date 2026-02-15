from pydantic import BaseModel


class BacktestRequest(BaseModel):
    strategy_name: str
    ticker: str
    params: dict = {}
    interval: str = "minute60"
    start_date: str  # YYYYMMDD
    end_date: str    # YYYYMMDD
    initial_capital: float = 1_000_000
    leverage: int = 1
    enable_short: bool = False


class BackfillRequest(BaseModel):
    ticker: str
    interval: str = "day"
    days: int = 365
    exchange: str | None = None


class OptimizeRequest(BaseModel):
    strategy_name: str
    ticker: str
    interval: str = "minute60"
    start_date: str
    end_date: str
    initial_capital: float = 1_000_000
    leverage: int = 1
    enable_short: bool = False
    param_grid: dict  # e.g. {"rsi_period": [10, 14, 20], "rsi_oversold": [25, 30]}
    top_n: int = 5


class BacktestResultResponse(BaseModel):
    id: int
    strategy_name: str
    ticker: str
    interval: str
    params: str
    start_date: str
    end_date: str
    initial_capital: float
    final_capital: float
    total_return_pct: float
    max_drawdown_pct: float
    sharpe_ratio: float | None
    win_rate: float | None
    total_trades: int | None
    profit_factor: float | None
    created_at: str
