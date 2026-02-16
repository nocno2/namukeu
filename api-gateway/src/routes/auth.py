from __future__ import annotations

import logging

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from src.auth.jwt import create_token
from src.auth.middleware import get_jwt_algorithm, get_jwt_secret
from src.config import Config
from src.proxy import get_config, get_http_client

logger = logging.getLogger("gateway")
router = APIRouter(prefix="/auth", tags=["auth"])


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


@router.post("/login", response_model=TokenResponse)
async def login(
    body: LoginRequest,
    config: Config = Depends(get_config),
    secret: str = Depends(get_jwt_secret),
    algorithm: str = Depends(get_jwt_algorithm),
    client: httpx.AsyncClient = Depends(get_http_client),
):
    # Delegate authentication to DASH service
    dash_svc = next((s for s in config.services if s.name == "dash"), None)
    if dash_svc is None:
        raise HTTPException(status_code=503, detail="Auth service unavailable")

    try:
        resp = await client.post(
            f"{dash_svc.url}/api/auth/login",
            json={"username": body.username, "password": body.password},
            timeout=10.0,
        )
    except (httpx.ConnectError, httpx.TimeoutException):
        raise HTTPException(status_code=502, detail="Auth service unreachable")

    if resp.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    logger.info("Login via DASH: %s", body.username)

    token = create_token(
        payload={"sub": body.username, "role": "admin"},
        secret=secret,
        algorithm=algorithm,
        expire_hours=config.jwt_expire_hours,
    )
    return TokenResponse(access_token=token)
