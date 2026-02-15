import asyncio
import logging
import time

import pandas as pd
import pyupbit

from src.services.exchange_base import ExchangeInfo, OrderResult

logger = logging.getLogger(__name__)


class UpbitExchange:
    def __init__(self, access_key: str, secret_key: str, dry_run: bool = True):
        self._upbit = pyupbit.Upbit(access_key, secret_key)
        self._dry_run = dry_run
        self._last_call_time: float = 0
        self._min_interval = 0.125  # 8 calls/sec for orders

    @property
    def name(self) -> str:
        return "upbit"

    @property
    def info(self) -> ExchangeInfo:
        return ExchangeInfo(
            name="upbit",
            display_name="Upbit",
            quote_currency="KRW",
            fee_rate=0.0005,
            min_order_value=5000,
        )

    @property
    def dry_run(self) -> bool:
        return self._dry_run

    @dry_run.setter
    def dry_run(self, value: bool):
        self._dry_run = value

    async def _rate_limit(self, interval: float | None = None):
        min_gap = interval or self._min_interval
        now = time.monotonic()
        elapsed = now - self._last_call_time
        if elapsed < min_gap:
            await asyncio.sleep(min_gap - elapsed)
        self._last_call_time = time.monotonic()

    # --- Quotation (public) ---

    async def get_ohlcv(
        self, ticker: str, interval: str = "minute1", count: int = 200, to: str | None = None
    ) -> pd.DataFrame:
        await self._rate_limit(0.11)
        return await asyncio.to_thread(
            pyupbit.get_ohlcv, ticker, interval=interval, count=count, to=to
        )

    async def get_current_price(self, tickers: str | list[str]) -> dict | float:
        await self._rate_limit(0.11)
        return await asyncio.to_thread(pyupbit.get_current_price, tickers)

    async def get_orderbook(self, ticker: str) -> list:
        await self._rate_limit(0.11)
        return await asyncio.to_thread(pyupbit.get_orderbook, ticker)

    async def get_tickers(self, fiat: str | None = None) -> list[str]:
        await self._rate_limit(0.11)
        return await asyncio.to_thread(pyupbit.get_tickers, fiat=fiat or "KRW")

    # --- Exchange (authenticated) ---

    async def get_balance(self, ticker: str | None = None) -> float:
        await self._rate_limit()
        return await asyncio.to_thread(self._upbit.get_balance, ticker or "KRW")

    async def get_balances(self) -> list[dict]:
        await self._rate_limit()
        result = await asyncio.to_thread(self._upbit.get_balances)
        if isinstance(result, dict) and "error" in result:
            raise RuntimeError(result["error"].get("message", str(result["error"])))
        if not isinstance(result, list):
            raise RuntimeError(f"Unexpected response: {result}")
        return result

    async def buy_market_order(self, ticker: str, amount: float) -> OrderResult | None:
        if self._dry_run:
            logger.info(f"[DRY-RUN] BUY {ticker} for {amount:,.0f} {self.info.quote_currency}")
            return None
        await self._rate_limit()
        result = await asyncio.to_thread(self._upbit.buy_market_order, ticker, amount)
        return self._parse_order(result) if result else None

    async def sell_market_order(self, ticker: str, volume: float) -> OrderResult | None:
        if self._dry_run:
            logger.info(f"[DRY-RUN] SELL {ticker} volume={volume}")
            return None
        await self._rate_limit()
        result = await asyncio.to_thread(self._upbit.sell_market_order, ticker, volume)
        return self._parse_order(result) if result else None

    async def buy_limit_order(self, ticker: str, price: float, volume: float) -> OrderResult | None:
        if self._dry_run:
            logger.info(f"[DRY-RUN] LIMIT BUY {ticker} @ {price:,.0f} x {volume}")
            return None
        await self._rate_limit()
        result = await asyncio.to_thread(self._upbit.buy_limit_order, ticker, price, volume)
        return self._parse_order(result) if result else None

    async def sell_limit_order(self, ticker: str, price: float, volume: float) -> OrderResult | None:
        if self._dry_run:
            logger.info(f"[DRY-RUN] LIMIT SELL {ticker} @ {price:,.0f} x {volume}")
            return None
        await self._rate_limit()
        result = await asyncio.to_thread(self._upbit.sell_limit_order, ticker, price, volume)
        return self._parse_order(result) if result else None

    async def get_order(self, uuid: str) -> dict | None:
        await self._rate_limit()
        return await asyncio.to_thread(self._upbit.get_order, uuid)

    async def cancel_order(self, uuid: str) -> dict | None:
        if self._dry_run:
            logger.info(f"[DRY-RUN] CANCEL order {uuid}")
            return None
        await self._rate_limit()
        return await asyncio.to_thread(self._upbit.cancel_order, uuid)

    def _parse_order(self, raw: dict) -> OrderResult:
        return OrderResult(
            uuid=raw.get("uuid", ""),
            side=raw.get("side", ""),
            market=raw.get("market", ""),
            price=float(raw["price"]) if raw.get("price") else None,
            volume=float(raw["volume"]) if raw.get("volume") else None,
            executed_volume=float(raw.get("executed_volume", 0)),
            paid_fee=float(raw.get("paid_fee", 0)),
            state=raw.get("state", ""),
            created_at=raw.get("created_at", ""),
            raw=raw,
        )
