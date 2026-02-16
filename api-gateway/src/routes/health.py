from __future__ import annotations

import httpx
from fastapi import APIRouter, Depends

from src.config import Config
from src.proxy import get_config, get_http_client

router = APIRouter()


async def _check_service(
    client: httpx.AsyncClient, name: str, url: str, token: str | None = None
) -> dict:
    headers = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    try:
        resp = await client.get(f"{url}/health", headers=headers, timeout=5.0)
        return {
            "name": name,
            "status": "ok" if resp.status_code == 200 else "degraded",
            "status_code": resp.status_code,
        }
    except httpx.ConnectError:
        return {"name": name, "status": "down", "status_code": None}
    except httpx.TimeoutException:
        return {"name": name, "status": "timeout", "status_code": None}


@router.get("/health")
async def health(
    config: Config = Depends(get_config),
    client: httpx.AsyncClient = Depends(get_http_client),
):
    results = []
    for svc in config.services:
        result = await _check_service(client, svc.name, svc.url, svc.token)
        results.append(result)

    all_ok = all(r["status"] == "ok" for r in results)
    return {
        "status": "ok" if all_ok else "degraded",
        "services": results,
    }
