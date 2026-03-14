import logging

import httpx
from fastapi import APIRouter, Depends, Request, Response

from src.api.auth import verify_session
from src.core.config import Config

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/proxy")


def get_config() -> Config:
    raise NotImplementedError


@router.api_route(
    "/coin/{path:path}",
    methods=["GET", "POST", "PUT", "DELETE"],
)
async def proxy_coin(
    path: str,
    request: Request,
    _=Depends(verify_session),
    config: Config = Depends(get_config),
):
    """Reverse proxy to coin-auto-trade, injecting Bearer token."""
    svc = next((s for s in config.services if s.name == "coin-auto-trade"), None)
    if not svc or not svc.status_token:
        return Response(content="Service not configured", status_code=503)

    base_url = f"http://127.0.0.1:{svc.port}"
    target_url = f"{base_url}/{path}"

    if request.url.query:
        target_url += f"?{request.url.query}"

    headers = {"Authorization": f"Bearer {svc.status_token}"}
    if "content-type" in request.headers:
        headers["Content-Type"] = request.headers["content-type"]

    body = None
    if request.method != "GET":
        body = await request.body()

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.request(
                method=request.method,
                url=target_url,
                headers=headers,
                content=body,
                timeout=30.0,
            )
    except (httpx.ConnectError, httpx.TimeoutException):
        return Response(content="Service unavailable", status_code=502)

    content_type = resp.headers.get("content-type", "")
    response_body = resp.content

    if "text/html" in content_type:
        text = resp.text
        # Rewrite absolute paths to go through proxy
        text = text.replace('href="/', 'href="/proxy/coin/')
        text = text.replace("href='/", "href='/proxy/coin/")
        text = text.replace('src="/static/', 'src="/proxy/coin/static/')
        text = text.replace('action="/', 'action="/proxy/coin/')
        # Rewrite JS fetch and HTMX URLs
        text = text.replace("fetch('/", "fetch('/proxy/coin/")
        text = text.replace('hx-get="/', 'hx-get="/proxy/coin/')
        text = text.replace('hx-post="/', 'hx-post="/proxy/coin/')
        text = text.replace('hx-swap="none"', 'hx-swap="none"')
        response_body = text.encode("utf-8")

    excluded_headers = {"content-encoding", "content-length", "transfer-encoding"}
    response_headers = {
        k: v for k, v in resp.headers.items()
        if k.lower() not in excluded_headers
    }

    return Response(
        content=response_body,
        status_code=resp.status_code,
        headers=response_headers,
    )


@router.api_route(
    "/tgbot/{path:path}",
    methods=["GET", "POST", "PUT", "DELETE"],
)
async def proxy_tgbot(
    path: str,
    request: Request,
    _=Depends(verify_session),
    config: Config = Depends(get_config),
):
    """Reverse proxy to claude-telegram."""
    svc = next((s for s in config.services if s.name == "claude-telegram"), None)
    if not svc or not svc.status_token:
        return Response(content="Service not configured", status_code=503)

    base_url = f"http://127.0.0.1:{svc.port}"
    target_url = f"{base_url}/{path}"

    if request.url.query:
        target_url += f"?{request.url.query}"

    headers = {"Authorization": f"Bearer {svc.status_token}"}
    if "content-type" in request.headers:
        headers["Content-Type"] = request.headers["content-type"]

    body = None
    if request.method != "GET":
        body = await request.body()

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.request(
                method=request.method,
                url=target_url,
                headers=headers,
                content=body,
                timeout=30.0,
            )
    except (httpx.ConnectError, httpx.TimeoutException):
        return Response(content="Service unavailable", status_code=502)

    response_body = resp.content
    excluded_headers = {"content-encoding", "content-length", "transfer-encoding"}
    response_headers = {
        k: v for k, v in resp.headers.items()
        if k.lower() not in excluded_headers
    }

    return Response(
        content=response_body,
        status_code=resp.status_code,
        headers=response_headers,
    )
