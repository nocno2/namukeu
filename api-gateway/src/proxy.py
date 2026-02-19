from __future__ import annotations

import httpx
from fastapi import APIRouter, Depends, Request, Response

from src.auth.middleware import verify_jwt
from src.config import Config, ServiceDef

router = APIRouter()

EXCLUDED_HEADERS = frozenset({
    "content-encoding",
    "content-length",
    "transfer-encoding",
    "connection",
})


# Placeholder — overridden via dependency_overrides
def get_config() -> Config:
    raise NotImplementedError


def get_http_client() -> httpx.AsyncClient:
    raise NotImplementedError


def _build_target_url(service: ServiceDef, path: str, query: str) -> str:
    url = f"{service.url}/{path}" if path else service.url
    if query:
        url += f"?{query}"
    return url


def _build_upstream_headers(
    request: Request,
    service: ServiceDef,
) -> dict[str, str]:
    headers: dict[str, str] = {}

    # Forward content-type
    if "content-type" in request.headers:
        headers["Content-Type"] = request.headers["content-type"]

    # Inject upstream Bearer token if the service has one
    if service.token:
        headers["Authorization"] = f"Bearer {service.token}"

    # Forward cookie for session-based services (DASH)
    if service.name == "dash" and "cookie" in request.headers:
        headers["Cookie"] = request.headers["cookie"]

    return headers


async def _proxy(
    request: Request,
    service: ServiceDef,
    path: str,
    client: httpx.AsyncClient,
) -> Response:
    target_url = _build_target_url(service, path, str(request.url.query))
    headers = _build_upstream_headers(request, service)

    body = None
    if request.method not in ("GET", "HEAD"):
        body = await request.body()

    try:
        resp = await client.request(
            method=request.method,
            url=target_url,
            headers=headers,
            content=body,
            timeout=30.0,
        )
    except httpx.ConnectError:
        return Response(
            content=f'{{"detail":"Service {service.name} unavailable"}}',
            status_code=502,
            media_type="application/json",
        )
    except httpx.TimeoutException:
        return Response(
            content=f'{{"detail":"Service {service.name} timeout"}}',
            status_code=504,
            media_type="application/json",
        )

    resp_headers = {
        k: v
        for k, v in resp.headers.items()
        if k.lower() not in EXCLUDED_HEADERS
    }

    return Response(
        content=resp.content,
        status_code=resp.status_code,
        headers=resp_headers,
    )


def _find_service(config: Config, prefix: str) -> ServiceDef | None:
    for svc in config.services:
        if svc.prefix == prefix:
            return svc
    return None


# --- COIN ---
@router.api_route(
    "/api/coin/{path:path}",
    methods=["GET", "POST", "PUT", "DELETE", "PATCH"],
)
async def proxy_coin(
    path: str,
    request: Request,
    _user: dict = Depends(verify_jwt),
    config: Config = Depends(get_config),
    client: httpx.AsyncClient = Depends(get_http_client),
) -> Response:
    svc = _find_service(config, "/api/coin")
    assert svc is not None
    return await _proxy(request, svc, path, client)


# --- TRAIN ---
@router.api_route(
    "/api/train/{path:path}",
    methods=["GET", "POST", "PUT", "DELETE", "PATCH"],
)
async def proxy_train(
    path: str,
    request: Request,
    _user: dict = Depends(verify_jwt),
    config: Config = Depends(get_config),
    client: httpx.AsyncClient = Depends(get_http_client),
) -> Response:
    svc = _find_service(config, "/api/train")
    assert svc is not None
    return await _proxy(request, svc, path, client)


# --- DASH ---
@router.api_route(
    "/api/dash/{path:path}",
    methods=["GET", "POST", "PUT", "DELETE", "PATCH"],
)
async def proxy_dash(
    path: str,
    request: Request,
    _user: dict = Depends(verify_jwt),
    config: Config = Depends(get_config),
    client: httpx.AsyncClient = Depends(get_http_client),
) -> Response:
    svc = _find_service(config, "/api/dash")
    assert svc is not None
    return await _proxy(request, svc, path, client)


# --- BLOG (public) ---
@router.api_route(
    "/blog/{path:path}",
    methods=["GET", "POST", "PUT", "DELETE", "PATCH"],
)
async def proxy_blog(
    path: str,
    request: Request,
    config: Config = Depends(get_config),
    client: httpx.AsyncClient = Depends(get_http_client),
) -> Response:
    svc = _find_service(config, "/blog")
    assert svc is not None
    return await _proxy(request, svc, path, client)


# --- TRADE ---
@router.api_route(
    "/api/trade/{path:path}",
    methods=["GET", "POST", "PUT", "DELETE", "PATCH"],
)
async def proxy_trade(
    path: str,
    request: Request,
    _user: dict = Depends(verify_jwt),
    config: Config = Depends(get_config),
    client: httpx.AsyncClient = Depends(get_http_client),
) -> Response:
    svc = _find_service(config, "/api/trade")
    assert svc is not None
    return await _proxy(request, svc, path, client)


# --- TGBOT (Telegram Bot - revenue data) ---
@router.api_route(
    "/api/tgbot/{path:path}",
    methods=["GET", "POST", "PUT", "DELETE", "PATCH"],
)
async def proxy_tgbot(
    path: str,
    request: Request,
    _user: dict = Depends(verify_jwt),
    config: Config = Depends(get_config),
    client: httpx.AsyncClient = Depends(get_http_client),
) -> Response:
    svc = _find_service(config, "/api/tgbot")
    assert svc is not None
    return await _proxy(request, svc, path, client)
