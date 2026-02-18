"""
News service - fetches and manages news.
"""
import asyncio
from datetime import datetime
from typing import List, Optional
import httpx
from bs4 import BeautifulSoup
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession
from src.models import News, Stock
from src.config import USER_AGENT


class NewsService:
    """Service for fetching and managing news."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def fetch_naver_news(self, symbol: str, limit: int = 10) -> List[dict]:
        """Fetch news from Naver Finance."""
        try:
            url = f"https://finance.naver.com/item/news.naver?code={symbol}"
            headers = {"User-Agent": USER_AGENT}

            async with httpx.AsyncClient() as client:
                resp = await client.get(url, headers=headers, timeout=10)
                soup = BeautifulSoup(resp.text, "lxml")

                news_list = []
                articles = soup.select(".news_list li")[:limit]

                for article in articles:
                    title_elem = article.select_one(".tit")
                    if not title_elem:
                        continue

                    title = title_elem.text.strip()
                    link = "https://finance.naver.com" + title_elem.select_one("a")["href"]

                    # Get summary
                    summary_elem = article.select_one(".info")
                    summary = summary_elem.text if summary_elem else ""

                    # Get datetime
                    date_elem = article.select_one(".date")
                    date_str = date_elem.text if date_elem else ""

                    try:
                        # Parse date
                        if date_str:
                            if "." in date_str:
                                published_at = datetime.strptime(date_str.strip(), "%Y.%m.%d %H:%M:%S")
                            else:
                                published_at = datetime.now()
                        else:
                            published_at = datetime.now()
                    except:
                        published_at = datetime.now()

                    news_list.append({
                        "title": title,
                        "summary": summary,
                        "url": link,
                        "source": "Naver",
                        "published_at": published_at,
                    })

                return news_list
        except Exception as e:
            print(f"Error fetching Naver news for {symbol}: {e}")
            return []

    async def fetch_yahoo_news(self, symbol: str, limit: int = 10) -> List[dict]:
        """Fetch news from Yahoo Finance."""
        try:
            url = f"https://finance.yahoo.com/quote/{symbol}/news"
            headers = {"User-Agent": USER_AGENT}

            async with httpx.AsyncClient() as client:
                resp = await client.get(url, headers=headers, timeout=10)
                soup = BeautifulSoup(resp.text, "lxml")

                news_list = []
                articles = soup.select("li.js-stream-content h3")[:limit]

                for article in articles:
                    title = article.text.strip()
                    link_elem = article.select_one("a")
                    link = "https://finance.yahoo.com" + link_elem["href"] if link_elem and "href" in link_elem.attrs else ""

                    news_list.append({
                        "title": title,
                        "summary": "",
                        "url": link,
                        "source": "Yahoo",
                        "published_at": datetime.now(),
                    })

                return news_list
        except Exception as e:
            print(f"Error fetching Yahoo news for {symbol}: {e}")
            return []

    async def fetch_general_news(self, query: str = "주식", limit: int = 20) -> List[dict]:
        """Fetch general financial news."""
        try:
            # Using Naver news search
            url = "https://search.naver.com/search.naver"
            params = {
                "where": "news",
                "query": query,
                "sm": "tab_jum",
            }
            headers = {"User-Agent": USER_AGENT}

            async with httpx.AsyncClient() as client:
                resp = await client.get(url, params=params, headers=headers, timeout=10)
                soup = BeautifulSoup(resp.text, "lxml")

                news_list = []
                articles = soup.select(".news_area .news_item")[:limit]

                for article in articles:
                    title_elem = article.select_one(".news_tit")
                    if not title_elem:
                        continue

                    title = title_elem.text.strip()
                    link = title_elem.select_one("a")["href"]

                    # Get source
                    source_elem = article.select_one(".info_group .press")
                    source = source_elem.text if source_elem else "Unknown"

                    news_list.append({
                        "title": title,
                        "summary": "",
                        "url": link,
                        "source": source,
                        "published_at": datetime.now(),
                    })

                return news_list
        except Exception as e:
            print(f"Error fetching general news: {e}")
            return []

    async def save_news(self, news_items: List[dict], stock_id: Optional[int] = None) -> None:
        """Save news to database."""
        for item in news_items:
            news = News(
                stock_id=stock_id,
                title=item["title"],
                content=item.get("summary", ""),
                source=item["source"],
                url=item["url"],
                published_at=item["published_at"],
            )
            self.db.add(news)

        await self.db.commit()

    async def get_news(
        self,
        stock_id: Optional[int] = None,
        limit: int = 50,
    ) -> List[News]:
        """Get news from database."""
        query = select(News)

        if stock_id:
            query = query.where(News.stock_id == stock_id)

        query = query.order_by(desc(News.published_at)).limit(limit)

        result = await self.db.execute(query)
        return list(result.scalars().all())
