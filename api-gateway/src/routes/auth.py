from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from src.auth.jwt import create_token
from src.auth.middleware import get_jwt_algorithm, get_jwt_secret
from src.config import Config
from src.proxy import get_config

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
):
    # Gateway login — validates against DASH credentials via proxy
    # For Phase 1: simple env-based credentials
    admin_user = "admin"
    admin_pass = "admin"  # TODO: replace with env-based or DASH-delegated auth

    if body.username != admin_user or body.password != admin_pass:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    token = create_token(
        payload={"sub": body.username, "role": "admin"},
        secret=secret,
        algorithm=algorithm,
        expire_hours=config.jwt_expire_hours,
    )
    return TokenResponse(access_token=token)
