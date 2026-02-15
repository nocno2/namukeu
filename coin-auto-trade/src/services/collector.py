import asyncio
import logging

from src.core.database import Database
from src.services.exchange_base import Exchange

logger = logging.getLogger(__name__)


class DataCollector:
    def __init__(self, db: Database, exchange: Exchange, interval_minutes: int = 5):
        self.db = db
        self.exchange = exchange
        self.interval_minutes = interval_minutes
        self._task: asyncio.Task | None = None
        self._watched_tickers: set[str] = set()

    def add_ticker(self, ticker: str):
        self._watched_tickers.add(ticker)

    def remove_ticker(self, ticker: str):
        self._watched_tickers.discard(ticker)

    def start(self):
        if self._task is None or self._task.done():
            self._task = asyncio.create_task(self._collect_loop())
            logger.info(f"Data collector started (interval: {self.interval_minutes}m)")

    def stop(self):
        if self._task and not self._task.done():
            self._task.cancel()
            logger.info("Data collector stopped")

    async def _collect_loop(self):
        try:
            while True:
                for ticker in list(self._watched_tickers):
                    try:
                        # 1분봉 수집
                        df = await self.exchange.get_ohlcv(ticker, interval="minute1", count=5)
                        if df is not None and not df.empty:
                            self.db.bulk_insert_ohlcv(ticker, "minute1", df)

                        # 1시간봉 수집
                        df = await self.exchange.get_ohlcv(ticker, interval="minute60", count=3)
                        if df is not None and not df.empty:
                            self.db.bulk_insert_ohlcv(ticker, "minute60", df)

                    except Exception as e:
                        logger.error(f"Collect error ({ticker}): {e}")

                await asyncio.sleep(self.interval_minutes * 60)

        except asyncio.CancelledError:
            logger.info("Data collector cancelled")

    async def backfill(self, ticker: str, interval: str = "day", days: int = 365):
        """과거 데이터 수집. 200개 제한을 페이지네이션으로 처리."""
        logger.info(f"Backfill start: {ticker} {interval} {days}d")
        collected = 0
        to = None

        while collected < days * (24 if "minute60" in interval else 1440 if "minute1" in interval else 1):
            try:
                df = await self.exchange.get_ohlcv(ticker, interval=interval, count=200, to=to)
                if df is None or df.empty:
                    break

                self.db.bulk_insert_ohlcv(ticker, interval, df)
                collected += len(df)

                # 다음 페이지: 가장 오래된 데이터의 시점
                to = str(df.index[0])

                if len(df) < 200:
                    break

            except Exception as e:
                logger.error(f"Backfill error ({ticker}): {e}")
                break

        logger.info(f"Backfill done: {ticker} {interval} — {collected} candles")
        return collected
