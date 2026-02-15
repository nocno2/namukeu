"""Exchange abstraction layer.

Defines the Exchange Protocol that all exchange implementations must satisfy,
along with shared data types (OrderResult, ExchangeInfo).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol, runtime_checkable

import pandas as pd


@dataclass
class OrderResult:
    uuid: str
    side: str
    market: str
    price: float | None
    volume: float | None
    executed_volume: float
    paid_fee: float
    state: str
    created_at: str
    raw: dict = field(default_factory=dict)


@dataclass
class ExchangeInfo:
    name: str           # "upbit", "binance", "binance_futures"
    display_name: str   # "Upbit", "Binance", "Binance Futures"
    quote_currency: str # "KRW" or "USDT"
    fee_rate: float     # 0.0005 for Upbit, 0.001 for Binance
    min_order_value: float  # 5000 KRW for Upbit, 10 USDT for Binance
    leverage: int = 1
    supports_short: bool = False
    is_futures: bool = False


@runtime_checkable
class Exchange(Protocol):
    @property
    def name(self) -> str: ...

    @property
    def info(self) -> ExchangeInfo: ...

    @property
    def dry_run(self) -> bool: ...

    @dry_run.setter
    def dry_run(self, value: bool): ...

    # --- Quotation (public) ---

    async def get_ohlcv(
        self, ticker: str, interval: str = "minute1", count: int = 200, to: str | None = None
    ) -> pd.DataFrame: ...

    async def get_current_price(self, tickers: str | list[str]) -> dict | float: ...

    async def get_orderbook(self, ticker: str) -> list: ...

    async def get_tickers(self, fiat: str | None = None) -> list[str]: ...

    # --- Exchange (authenticated) ---

    async def get_balance(self, ticker: str | None = None) -> float: ...

    async def get_balances(self) -> list[dict]: ...

    async def buy_market_order(self, ticker: str, amount: float) -> OrderResult | None: ...

    async def sell_market_order(self, ticker: str, volume: float) -> OrderResult | None: ...

    async def buy_limit_order(self, ticker: str, price: float, volume: float) -> OrderResult | None: ...

    async def sell_limit_order(self, ticker: str, price: float, volume: float) -> OrderResult | None: ...

    async def get_order(self, uuid: str) -> dict | None: ...

    async def cancel_order(self, uuid: str) -> dict | None: ...
