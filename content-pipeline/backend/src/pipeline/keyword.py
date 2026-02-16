import logging

import httpx
from pytrends.request import TrendReq

logger = logging.getLogger(__name__)


async def collect_google_trends(geo: str = "KR") -> list[dict]:
    """Collect trending keywords from Google Trends."""
    try:
        pt = TrendReq(hl="ko", tz=540)
        trending = pt.trending_searches(pn="south_korea")
        keywords = trending[0].tolist()
        return [{"keyword": kw, "source": "google_trends"} for kw in keywords]
    except Exception as e:
        logger.error(f"Google Trends error: {e}")
        return []


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


async def collect_keywords(config: object) -> list[dict]:
    """Collect trending keywords from all configured sources."""
    keywords = await collect_google_trends()

    if hasattr(config, "naver_client_id") and config.naver_client_id:
        google_kws = [kw["keyword"] for kw in keywords[:5]]
        naver = await collect_naver_trends(config.naver_client_id, config.naver_client_secret, google_kws)
        keywords.extend(naver)

    return keywords
