from __future__ import annotations

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from src.auth.jwt import verify_token

security = HTTPBearer(auto_error=False)

# Placeholder — overridden via dependency_overrides in main.py
def get_jwt_secret() -> str:
    raise NotImplementedError


def get_jwt_algorithm() -> str:
    return "HS256"


def verify_jwt(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    secret: str = Depends(get_jwt_secret),
    algorithm: str = Depends(get_jwt_algorithm),
) -> dict:
    if credentials is None:
        raise HTTPException(status_code=401, detail="Missing authorization header")
    payload = verify_token(credentials.credentials, secret, algorithm)
    if payload is None:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return payload


# Public routes that skip JWT check
PUBLIC_PATHS: set[str] = {
    "/health",
    "/auth/login",
    "/docs",
    "/openapi.json",
    "/redoc",
}

PUBLIC_PREFIXES: tuple[str, ...] = (
    "/blog/",
)
