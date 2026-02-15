"""Binance USDT-M Futures exchange implementation."""
import asyncio
import logging
import time

import pandas as pd
from binance.client import Client as BinanceClient

from src.services.exchange_base import ExchangeInfo, OrderResult

logger = logging.getLogger(__name__)

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


class BinanceFuturesExchange:
    def __init__(self, api_key: str, api_secret: str, dry_run: bool = True,
                 default_leverage: int = 20, margin_type: str = "ISOLATED"):
        self._client = BinanceClient(api_key, api_secret)
        self._dry_run = dry_run
        self._last_call_time: float = 0
        self._min_interval = 0.1
        self._default_leverage = default_leverage
        self._margin_type = margin_type
        self._initialized_symbols: set[str] = set()

    @property
    def name(self) -> str:
        return "binance_futures"

    @property
    def info(self) -> ExchangeInfo:
        return ExchangeInfo(
            name="binance_futures",
            display_name="Binance Futures",
            quote_currency="USDT",
            fee_rate=0.0004,
            min_order_value=10,
            leverage=self._default_leverage,
            supports_short=True,
            is_futures=True,
        )

    @property
    def dry_run(self) -> bool:
        return self._dry_run

    @dry_run.setter
    def dry_run(self, value: bool):
        self._dry_run = value

    @property
    def is_futures(self) -> bool:
        return True

    async def _rate_limit(self, interval: float | None = None):
        min_gap = interval or self._min_interval
        now = time.monotonic()
        elapsed = now - self._last_call_time
        if elapsed < min_gap:
            await asyncio.sleep(min_gap - elapsed)
        self._last_call_time = time.monotonic()

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

    async def setup_symbol(self, symbol: str, leverage: int | None = None):
        """Initialize leverage and margin type for a symbol. Idempotent."""
        if symbol in self._initialized_symbols:
            return
        lev = leverage or self._default_leverage
        try:
            await asyncio.to_thread(
                self._client.futures_change_leverage,
                symbol=symbol, leverage=lev,
            )
            logger.info(f"Futures leverage set: {symbol} {lev}x")
        except Exception as e:
            logger.warning(f"Set leverage failed for {symbol}: {e}")

        try:
            await asyncio.to_thread(
                self._client.futures_change_margin_type,
                symbol=symbol, marginType=self._margin_type,
            )
            logger.info(f"Futures margin type set: {symbol} {self._margin_type}")
        except Exception as e:
            if "No need to change" not in str(e):
                logger.warning(f"Set margin type failed for {symbol}: {e}")

        self._initialized_symbols.add(symbol)

    # --- Quotation (public) ---

    async def get_ohlcv(
        self, ticker: str, interval: str = "minute1", count: int = 200, to: str | None = None
    ) -> pd.DataFrame:
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

        klines = await asyncio.to_thread(self._client.futures_klines, **kwargs)

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

    async def get_current_price(self, tickers: str | list[str]) -> dict | float:
        await self._rate_limit()
        if isinstance(tickers, str):
            symbol = self._to_binance_symbol(tickers)
            result = await asyncio.to_thread(
                self._client.futures_symbol_ticker, symbol=symbol,
            )
            return float(result["price"])
        else:
            all_prices = await asyncio.to_thread(self._client.futures_symbol_ticker)
            price_map = {p["symbol"]: float(p["price"]) for p in all_prices}
            return {t: price_map.get(self._to_binance_symbol(t), 0) for t in tickers}

    async def get_orderbook(self, ticker: str) -> list:
        await self._rate_limit()
        symbol = self._to_binance_symbol(ticker)
        result = await asyncio.to_thread(
            self._client.futures_order_book, symbol=symbol,
        )
        return result.get("bids", [])

    async def get_tickers(self, fiat: str | None = None) -> list[str]:
        await self._rate_limit()
        quote = fiat or "USDT"
        prices = await asyncio.to_thread(self._client.futures_symbol_ticker)
        return [
            self._to_unified_ticker(p["symbol"], quote)
            for p in prices
            if p["symbol"].endswith(quote)
        ]

    # --- Exchange (authenticated) ---

    async def get_balance(self, ticker: str | None = None) -> float:
        ticker = ticker or "USDT"
        await self._rate_limit()
        balances = await asyncio.to_thread(self._client.futures_account_balance)
        for b in balances:
            if b["asset"] == ticker:
                return float(b["availableBalance"])
        return 0.0

    async def get_balances(self) -> list[dict]:
        await self._rate_limit()
        balances = await asyncio.to_thread(self._client.futures_account_balance)
        return [
            {"currency": b["asset"], "balance": float(b["availableBalance"]),
             "locked": float(b["balance"]) - float(b["availableBalance"])}
            for b in balances
            if float(b["balance"]) > 0
        ]

    async def get_futures_position(self, ticker: str) -> dict | None:
        """Get current futures position for a ticker."""
        await self._rate_limit()
        symbol = self._to_binance_symbol(ticker)
        positions = await asyncio.to_thread(
            self._client.futures_position_information, symbol=symbol,
        )
        for p in positions:
            amt = float(p.get("positionAmt", 0))
            if amt != 0:
                return {
                    "side": "long" if amt > 0 else "short",
                    "quantity": abs(amt),
                    "entry_price": float(p.get("entryPrice", 0)),
                    "unrealized_pnl": float(p.get("unRealizedProfit", 0)),
                    "leverage": int(p.get("leverage", 1)),
                }
        return None

    async def buy_market_order(self, ticker: str, amount: float) -> OrderResult | None:
        """BUY (open long / close short). amount is in USDT."""
        if self._dry_run:
            logger.info(f"[DRY-RUN] FUTURES BUY {ticker} for {amount:,.2f} USDT")
            return None
        await self._rate_limit()
        symbol = self._to_binance_symbol(ticker)
        await self.setup_symbol(symbol)
        price = float((await asyncio.to_thread(
            self._client.futures_symbol_ticker, symbol=symbol,
        ))["price"])
        quantity = round(amount / price, 3)
        result = await asyncio.to_thread(
            self._client.futures_create_order,
            symbol=symbol, side="BUY", type="MARKET", quantity=quantity,
        )
        return self._parse_order(result)

    async def sell_market_order(self, ticker: str, volume: float) -> OrderResult | None:
        """SELL (open short / close long). volume is in base asset."""
        if self._dry_run:
            logger.info(f"[DRY-RUN] FUTURES SELL {ticker} volume={volume}")
            return None
        await self._rate_limit()
        symbol = self._to_binance_symbol(ticker)
        await self.setup_symbol(symbol)
        result = await asyncio.to_thread(
            self._client.futures_create_order,
            symbol=symbol, side="SELL", type="MARKET", quantity=round(volume, 3),
        )
        return self._parse_order(result)

    async def buy_limit_order(self, ticker: str, price: float, volume: float) -> OrderResult | None:
        if self._dry_run:
            logger.info(f"[DRY-RUN] FUTURES LIMIT BUY {ticker} @ {price:,.2f} x {volume}")
            return None
        await self._rate_limit()
        symbol = self._to_binance_symbol(ticker)
        await self.setup_symbol(symbol)
        result = await asyncio.to_thread(
            self._client.futures_create_order,
            symbol=symbol, side="BUY", type="LIMIT",
            price=f"{price}", quantity=f"{volume}", timeInForce="GTC",
        )
        return self._parse_order(result)

    async def sell_limit_order(self, ticker: str, price: float, volume: float) -> OrderResult | None:
        if self._dry_run:
            logger.info(f"[DRY-RUN] FUTURES LIMIT SELL {ticker} @ {price:,.2f} x {volume}")
            return None
        await self._rate_limit()
        symbol = self._to_binance_symbol(ticker)
        await self.setup_symbol(symbol)
        result = await asyncio.to_thread(
            self._client.futures_create_order,
            symbol=symbol, side="SELL", type="LIMIT",
            price=f"{price}", quantity=f"{volume}", timeInForce="GTC",
        )
        return self._parse_order(result)

    async def get_order(self, uuid: str) -> dict | None:
        await self._rate_limit()
        try:
            result = await asyncio.to_thread(
                self._client.futures_get_order, orderId=int(uuid),
            )
            return result
        except Exception:
            return None

    async def cancel_order(self, uuid: str) -> dict | None:
        if self._dry_run:
            logger.info(f"[DRY-RUN] FUTURES CANCEL order {uuid}")
            return None
        await self._rate_limit()
        try:
            result = await asyncio.to_thread(
                self._client.futures_cancel_order, orderId=int(uuid),
            )
            return result
        except Exception:
            return None

    def _parse_order(self, raw: dict) -> OrderResult:
        return OrderResult(
            uuid=str(raw.get("orderId", "")),
            side=raw.get("side", "").lower(),
            market=raw.get("symbol", ""),
            price=float(raw["price"]) if raw.get("price") and float(raw["price"]) > 0 else None,
            volume=float(raw.get("origQty", 0)),
            executed_volume=float(raw.get("executedQty", 0)),
            paid_fee=float(raw.get("commission", 0)) if raw.get("commission") else 0,
            state=raw.get("status", "").lower(),
            created_at=str(raw.get("updateTime", "")),
            raw=raw,
        )
