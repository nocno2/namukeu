import asyncio
import logging
import time

import pandas as pd
from binance.client import Client as BinanceClient

from src.services.exchange_base import ExchangeInfo, OrderResult

logger = logging.getLogger(__name__)

# Upbit-style interval → Binance kline interval
_INTERVAL_MAP = {
    "minute1": BinanceClient.KLINE_INTERVAL_1MINUTE,
    "minute3": BinanceClient.KLINE_INTERVAL_3MINUTE,
    "minute5": BinanceClient.KLINE_INTERVAL_5MINUTE,
    "minute15": BinanceClient.KLINE_INTERVAL_15MINUTE,
    "minute30": BinanceClient.KLINE_INTERVAL_30MINUTE,
    "minute60": BinanceClient.KLINE_INTERVAL_1HOUR,
    "minute240": BinanceClient.KLINE_INTERVAL_4HOUR,
    "day": BinanceClient.KLINE_INTERVAL_1DAY,
    "week": BinanceClient.KLINE_INTERVAL_1WEEK,
    "month": BinanceClient.KLINE_INTERVAL_1MONTH,
}


class BinanceExchange:
    def __init__(self, api_key: str, api_secret: str, dry_run: bool = True):
        self._client = BinanceClient(api_key, api_secret)
        self._dry_run = dry_run
        self._last_call_time: float = 0
        self._min_interval = 0.1  # 10 calls/sec

    @property
    def name(self) -> str:
        return "binance"

    @property
    def info(self) -> ExchangeInfo:
        return ExchangeInfo(
            name="binance",
            display_name="Binance",
            quote_currency="USDT",
            fee_rate=0.001,
            min_order_value=10,
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

    # --- Ticker format conversion ---
    # Unified: "USDT-BTC", Binance: "BTCUSDT"

    @staticmethod
    def _to_binance_symbol(ticker: str) -> str:
        if "-" in ticker:
            quote, base = ticker.split("-", 1)
            return f"{base}{quote}"
        return ticker

    @staticmethod
    def _to_unified_ticker(symbol: str, quote: str = "USDT") -> str:
        if symbol.endswith(quote):
            base = symbol[: -len(quote)]
            return f"{quote}-{base}"
        return symbol

    # --- Quotation (public) ---

    async def get_ohlcv(
        self, ticker: str, interval: str = "minute1", count: int = 200, to: str | None = None
    ) -> pd.DataFrame | None:
        try:
            await self._rate_limit()
            symbol = self._to_binance_symbol(ticker)
            bi = _INTERVAL_MAP.get(interval, BinanceClient.KLINE_INTERVAL_1MINUTE)

            kwargs: dict = {"symbol": symbol, "interval": bi, "limit": count}
            if to:
                try:
                    end_ts = int(pd.Timestamp(to).timestamp() * 1000)
                    kwargs["endTime"] = end_ts
                except Exception:
                    pass

            klines = await asyncio.to_thread(self._client.get_klines, **kwargs)

            if not klines:
                return pd.DataFrame()

            df = pd.DataFrame(klines, columns=[
                "timestamp", "open", "high", "low", "close", "volume",
                "close_time", "quote_volume", "trades", "taker_buy_base",
                "taker_buy_quote", "ignore",
            ])
            df["timestamp"] = pd.to_datetime(df["timestamp"], unit="ms")
            df = df.set_index("timestamp")
            for col in ["open", "high", "low", "close", "volume"]:
                df[col] = df[col].astype(float)
            return df[["open", "high", "low", "close", "volume"]]
        except Exception as e:
            logger.error(f"[Binance] get_ohlcv 실패 ({ticker}): {e}")
            return None

    async def get_current_price(self, tickers: str | list[str]) -> dict | float | None:
        try:
            await self._rate_limit()
            if isinstance(tickers, str):
                symbol = self._to_binance_symbol(tickers)
                result = await asyncio.to_thread(self._client.get_symbol_ticker, symbol=symbol)
                return float(result["price"])
            else:
                all_prices = await asyncio.to_thread(self._client.get_all_tickers)
                price_map = {p["symbol"]: float(p["price"]) for p in all_prices}
                return {t: price_map.get(self._to_binance_symbol(t), 0) for t in tickers}
        except Exception as e:
            logger.error(f"[Binance] get_current_price 실패 ({tickers}): {e}")
            return None

    async def get_orderbook(self, ticker: str) -> list | None:
        try:
            await self._rate_limit()
            symbol = self._to_binance_symbol(ticker)
            result = await asyncio.to_thread(self._client.get_order_book, symbol=symbol)
            return result.get("bids", [])
        except Exception as e:
            logger.error(f"[Binance] get_orderbook 실패 ({ticker}): {e}")
            return None

    async def get_tickers(self, fiat: str | None = None) -> list[str]:
        try:
            await self._rate_limit()
            quote = fiat or "USDT"
            prices = await asyncio.to_thread(self._client.get_all_tickers)
            return [
                self._to_unified_ticker(p["symbol"], quote)
                for p in prices
                if p["symbol"].endswith(quote)
            ]
        except Exception as e:
            logger.error(f"[Binance] get_tickers 실패: {e}")
            return []

    # --- Exchange (authenticated) ---

    async def get_balance(self, ticker: str | None = None) -> float | None:
        try:
            ticker = ticker or "USDT"
            await self._rate_limit()
            account = await asyncio.to_thread(self._client.get_account)
            for b in account["balances"]:
                if b["asset"] == ticker:
                    return float(b["free"])
            return 0.0
        except Exception as e:
            logger.error(f"[Binance] get_balance 실패 ({ticker}): {e}")
            return None

    async def get_balances(self) -> list[dict]:
        try:
            await self._rate_limit()
            account = await asyncio.to_thread(self._client.get_account)
            return [
                {"currency": b["asset"], "balance": float(b["free"]), "locked": float(b["locked"])}
                for b in account["balances"]
                if float(b["free"]) > 0 or float(b["locked"]) > 0
            ]
        except Exception as e:
            logger.error(f"[Binance] get_balances 실패: {e}")
            return []

    async def buy_market_order(self, ticker: str, amount: float) -> OrderResult | None:
        if self._dry_run:
            logger.info(f"[DRY-RUN] BUY {ticker} for {amount:,.2f} USDT")
            return None
        await self._rate_limit()
        symbol = self._to_binance_symbol(ticker)
        result = await asyncio.to_thread(
            self._client.order_market_buy, symbol=symbol, quoteOrderQty=f"{amount:.2f}"
        )
        return self._parse_order(result)

    async def sell_market_order(self, ticker: str, volume: float) -> OrderResult | None:
        if self._dry_run:
            logger.info(f"[DRY-RUN] SELL {ticker} volume={volume}")
            return None
        await self._rate_limit()
        symbol = self._to_binance_symbol(ticker)
        result = await asyncio.to_thread(
            self._client.order_market_sell, symbol=symbol, quantity=f"{volume}"
        )
        return self._parse_order(result)

    async def buy_limit_order(self, ticker: str, price: float, volume: float) -> OrderResult | None:
        if self._dry_run:
            logger.info(f"[DRY-RUN] LIMIT BUY {ticker} @ {price:,.2f} x {volume}")
            return None
        await self._rate_limit()
        symbol = self._to_binance_symbol(ticker)
        result = await asyncio.to_thread(
            self._client.order_limit_buy, symbol=symbol,
            price=f"{price}", quantity=f"{volume}", timeInForce="GTC",
        )
        return self._parse_order(result)

    async def sell_limit_order(self, ticker: str, price: float, volume: float) -> OrderResult | None:
        if self._dry_run:
            logger.info(f"[DRY-RUN] LIMIT SELL {ticker} @ {price:,.2f} x {volume}")
            return None
        await self._rate_limit()
        symbol = self._to_binance_symbol(ticker)
        result = await asyncio.to_thread(
            self._client.order_limit_sell, symbol=symbol,
            price=f"{price}", quantity=f"{volume}", timeInForce="GTC",
        )
        return self._parse_order(result)

    async def get_order(self, uuid: str) -> dict | None:
        await self._rate_limit()
        # Binance needs symbol for order lookup; this is a simplified version
        try:
            result = await asyncio.to_thread(self._client.get_order, orderId=int(uuid))
            return result
        except Exception:
            return None

    async def cancel_order(self, uuid: str) -> dict | None:
        if self._dry_run:
            logger.info(f"[DRY-RUN] CANCEL order {uuid}")
            return None
        await self._rate_limit()
        try:
            result = await asyncio.to_thread(self._client.cancel_order, orderId=int(uuid))
            return result
        except Exception:
            return None

    def _parse_order(self, raw: dict) -> OrderResult:
        fills = raw.get("fills", [])
        total_fee = sum(float(f.get("commission", 0)) for f in fills)
        return OrderResult(
            uuid=str(raw.get("orderId", "")),
            side=raw.get("side", "").lower(),
            market=raw.get("symbol", ""),
            price=float(raw["price"]) if raw.get("price") and float(raw["price"]) > 0 else None,
            volume=float(raw.get("origQty", 0)),
            executed_volume=float(raw.get("executedQty", 0)),
            paid_fee=total_fee,
            state=raw.get("status", "").lower(),
            created_at=str(raw.get("transactTime", "")),
            raw=raw,
        )
