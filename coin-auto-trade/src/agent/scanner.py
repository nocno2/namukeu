"""종목 스캐너 — 업비트 KRW 전 종목 조회 + Top N 선별"""

import logging

from src.services.exchange import UpbitExchange

logger = logging.getLogger(__name__)


class MarketScanner:
    """업비트 KRW 마켓 전 종목을 스캔하여 거래량/변동성 기준 Top N을 반환한다."""

    def __init__(self, exchange: UpbitExchange):
        self.exchange = exchange

    async def scan_market(self, top_n: int = 20) -> list[dict]:
        """KRW 마켓 전 종목을 조회하여 거래대금 기준 Top N을 반환한다.

        Returns:
            list[dict]: ticker, volume_krw, change_rate, high, low, current_price 포함
        """
        tickers = await self.exchange.get_tickers(fiat="KRW")
        if not tickers:
            logger.warning("종목 목록 조회 실패")
            return []

        logger.info(f"KRW 마켓 {len(tickers)}개 종목 조회")

        # 현재가 조회 (batch)
        prices = await self.exchange.get_current_price(tickers)
        if not prices or not isinstance(prices, dict):
            logger.warning("현재가 조회 실패")
            return []

        # 각 종목별 일봉 데이터로 거래량/변동성 수집
        ticker_data = []
        for ticker in tickers:
            try:
                df = await self.exchange.get_ohlcv(ticker, interval="day", count=2)
                if df is None or df.empty:
                    continue

                latest = df.iloc[-1]
                current_price = prices.get(ticker, 0)
                if not current_price or current_price <= 0:
                    continue

                volume_krw = float(latest["volume"]) * current_price
                high = float(latest["high"])
                low = float(latest["low"])
                change_rate = (high - low) / low * 100 if low > 0 else 0

                ticker_data.append({
                    "ticker": ticker,
                    "current_price": current_price,
                    "volume_krw": volume_krw,
                    "change_rate": round(change_rate, 2),
                    "high": high,
                    "low": low,
                })
            except Exception as e:
                logger.debug(f"{ticker} 데이터 수집 실패: {e}")
                continue

        # 거래대금 기준 정렬 후 Top N
        ticker_data.sort(key=lambda x: x["volume_krw"], reverse=True)
        top = ticker_data[:top_n]

        logger.info(
            f"Top {len(top)} 종목 선별 완료 "
            f"(최대 거래대금: {top[0]['ticker'] if top else 'N/A'})"
        )
        return top
