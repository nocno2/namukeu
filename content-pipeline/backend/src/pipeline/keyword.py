import logging

import httpx
from pytrends.request import TrendReq

logger = logging.getLogger(__name__)


async def collect_google_trends(geo: str = "KR") -> list[dict]:
    """Collect trending keywords from Google Trends."""
    try:
        pt = TrendReq(hl="ko", tz=540, timeout=(10, 25))
        trending = pt.trending_searches(pn="south_korea")
        keywords = trending[0].tolist()
        return [{"keyword": kw, "source": "google_trends"} for kw in keywords[:30]]
    except Exception as e:
        logger.warning(f"Google Trends error: {e}")
        return []


async def collect_google_related_queries(keywords: list[str], timeframe: str = "today 1-m") -> list[dict]:
    """
    Google Trends에서 특정 키워드의 related queries (연관 검색어) 수집.
    rising: 급상승 검색어
    top: 인기 검색어
    """
    results = []
    try:
        pt = TrendReq(hl="ko", tz=540)

        for kw in keywords[:10]:  # 최대 10개 키워드
            try:
                pt.build_payload([kw], cat=0, timeframe=timeframe, geo="KR")
                related = pt.related_queries()

                if kw in related:
                    data = related[kw]

                    # rising (급상승) keywords
                    if "rising" in data:
                        for item in data["rising"].iloc[:10]:
                            if item and "query" in item:
                                results.append({
                                    "keyword": item["query"],
                                    "source": "google_trends_related",
                                    "parent_keyword": kw,
                                    "type": "rising",
                                    "value": item.get("value", 0),
                                })

                    # top (인기) keywords
                    if "top" in data:
                        for item in data["top"].iloc[:10]:
                            if item and "query" in item:
                                results.append({
                                    "keyword": item["query"],
                                    "source": "google_trends_related",
                                    "parent_keyword": kw,
                                    "type": "top",
                                    "value": item.get("value", 0),
                                })

            except Exception as e:
                logger.warning(f"Google Trends related queries error for '{kw}': {e}")
                continue

    except Exception as e:
        logger.error(f"Google Trends build_payload error: {e}")

    return results


async def collect_category_trends(category: str | None = None) -> list[dict]:
    """
    Google Trends에서 카테고리별 트렌드 수집.
    category: "computers" (기술), "finance" (금융), "society" (사회), "entertainment" (엔터테인먼트) 등
    """
    category_map = {
        "tech": 0,        # All categories
        "finance": 7,     # Finance
        "entertainment": 3,  # Entertainment
        "society": 12,    # Society
        "health": 45,     # Health
        "sports": 17,    # Sports
        "business": 12,   # Business
    }

    results = []
    try:
        pt = TrendReq(hl="ko", tz=540)

        # Daily trending searches
        trending = pt.trending_searches(pn="south_korea")
        keywords = trending[0].tolist()

        for kw in keywords:
            results.append({
                "keyword": kw,
                "source": "google_trends_daily",
                "category": category or "all",
            })

    except Exception as e:
        logger.error(f"Google Trends category error: {e}")

    return results


async def collect_naver_trends(client_id: str, client_secret: str, keywords: list[str] | None = None) -> list[dict]:
    """Collect search volume data from Naver DataLab."""
    if not client_id or not client_secret:
        return []

    if not keywords:
        return []

    try:
        groups = [{"groupName": kw, "keywords": [kw]} for kw in keywords[:5]]
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                "https://openapi.naver.com/v1/datalab/search",
                headers={
                    "X-Naver-Client-Id": client_id,
                    "X-Naver-Client-Secret": client_secret,
                },
                json={
                    "startDate": "2026-01-01",
                    "endDate": "2026-02-16",
                    "timeUnit": "week",
                    "keywordGroups": groups,
                },
            )
            resp.raise_for_status()
            data = resp.json()
            results = []
            for group in data.get("results", []):
                avg_ratio = sum(p["ratio"] for p in group.get("data", [])) / max(len(group.get("data", [])), 1)
                results.append({
                    "keyword": group["title"],
                    "source": "naver_datalab",
                    "score": round(avg_ratio, 1),
                })
            return results
    except Exception as e:
        logger.error(f"Naver DataLab error: {e}")
        return []


async def collect_reddit_trends(limit: int = 20) -> list[dict]:
    """Collect trending topics from Reddit (korea, technology, finance subreddits)."""
    import httpx

    subreddits = ["korea", "technology", "FinanceVPN", "AskReddit", "KoreaTech"]

    try:
        async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
            results = []

            for subreddit in subreddits:
                try:
                    resp = await client.get(
                        f"https://www.reddit.com/r/{subreddit}/hot.json",
                        params={"limit": min(limit, 25)},
                        headers={
                            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                            "Accept": "application/json",
                        },
                    )

                    if resp.status_code == 200:
                        data = resp.json()
                        posts = data.get("data", {}).get("children", [])

                        for post in posts[:10]:
                            title = post.get("data", {}).get("title", "")
                            if title and len(title) > 10:
                                results.append({
                                    "keyword": title,
                                    "source": "reddit",
                                    "subreddit": subreddit,
                                    "score": post.get("data", {}).get("score", 0),
                                })

                except Exception as e:
                    logger.warning(f"Reddit fetch error for r/{subreddit}: {e}")
                    continue

            return results

    except Exception as e:
        logger.warning(f"Reddit error: {e}")
        return []


async def collect_youtube_trends(region: str = "KR", category: int | None = None) -> list[dict]:
    """Collect trending videos from YouTube (requires API key, optional)."""
    # YouTube Data API key required - 이 기능은 config에 API key가 있을 때만 사용
    # 별도 구현 필요
    return []


async def collect_naver_realtime_keywords() -> list[dict]:
    """Collect real-time trending keywords from Naver."""
    import httpx

    try:
        async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
            # Naver 실시간 검색어 API
            resp = await client.get(
                "https://www.naver.com/srchrank?frm=tab",
                headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"},
            )

            if resp.status_code == 200:
                import re
                # XML 파싱
                keywords = re.findall(r'<keyword>([^<]+)</keyword>', resp.text)

                results = []
                for kw in keywords[:30]:
                    if kw and len(kw) > 1:
                        results.append({
                            "keyword": kw,
                            "source": "naver_realtime",
                        })

                return results

    except Exception as e:
        logger.warning(f"Naver realtime error: {e}")

    return []


async def collect_daum_realtime_keywords() -> list[dict]:
    """Collect real-time trending keywords from Daum (Kakao)."""
    import httpx

    try:
        async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
            resp = await client.get(
                "https://search.daum.net/search?w=tab",
                headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"},
            )

            if resp.status_code == 200:
                import re
                # Daum 실시간 검색어
                keywords = re.findall(r'"keyword":"([^"]+)"', resp.text)[:30]

                results = []
                for kw in keywords:
                    if kw and len(kw) > 1:
                        results.append({
                            "keyword": kw,
                            "source": "daum_realtime",
                        })

                return results

    except Exception as e:
        logger.warning(f"Daum realtime error: {e}")

    return []


async def collect_trendza_alternative() -> list[dict]:
    """Collect trending keywords from alternative sources when Google Trends fails."""
    results = []

    # Naver 실시간 검색어
    naver = await collect_naver_realtime_keywords()
    results.extend(naver)

    # Daum 실시간 검색어
    daum = await collect_daum_realtime_keywords()
    results.extend(daum)

    return results


async def collect_naver_news_trends() -> list[dict]:
    """Collect trending keywords from Naver News."""
    import httpx

    try:
        async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
            # Naver 뉴스 실시간 급상승 검색어
            resp = await client.get(
                "https://search.naver.com/ssearch/clk.naver?where=nexearch&sm=tab_jum&query=%EC%8B%9C%EC%8E%84+%ED%8A%B8%EB%A0%8C%EB%93%9C",
                headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"},
            )

            if resp.status_code == 200:
                # 간단한 파싱
                import re

                # 뉴스 헤드라인 추출 시도
                titles = re.findall(r'title":"([^"]+)"', resp.text)[:20]

                results = []
                for title in titles:
                    clean = title.strip()
                    if len(clean) > 5 and len(clean) < 100:
                        results.append({
                            "keyword": clean,
                            "source": "naver_news",
                        })

                # 대안: Ranking 뉴스
                if not results:
                    ranking_titles = re.findall(r'<div class="news_tit">([^<]+)</div>', resp.text)
                    for title in ranking_titles[:15]:
                        clean = title.strip()
                        if len(clean) > 5:
                            results.append({
                                "keyword": clean,
                                "source": "naver_news",
                            })

                return results

    except Exception as e:
        logger.warning(f"Naver News error: {e}")

    return []


async def collect_keywords(config: object) -> list[dict]:
    """Collect trending keywords from all configured sources."""
    keywords = await collect_google_trends()

    # Google Trends related queries
    google_kws = [kw["keyword"] for kw in keywords[:10]]
    if google_kws:
        related = await collect_google_related_queries(google_kws)
        keywords.extend(related)

    # Reddit trends
    reddit_kws = await collect_reddit_trends()
    keywords.extend(reddit_kws)

    # Naver News
    naver_news = await collect_naver_news_trends()
    keywords.extend(naver_news)

    # Naver DataLab (if credentials exist)
    if hasattr(config, "naver_client_id") and config.naver_client_id:
        google_kws_for_naver = [kw["keyword"] for kw in keywords[:5]]
        naver = await collect_naver_trends(config.naver_client_id, config.naver_client_secret, google_kws_for_naver)
        keywords.extend(naver)

    return keywords
