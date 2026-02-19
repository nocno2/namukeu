import os
from fastapi import Depends, HTTPException, Header
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

security = HTTPBearer()


def get_token() -> str:
    raise NotImplementedError


def verify(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    token: str = Depends(get_token),
):
    if credentials.credentials != token:
        raise HTTPException(status_code=401, detail="Invalid token")


def verify_internal(
    x_internal_key: str = Header(None),
):
    """Internal API verification for service-to-service communication."""
    expected_key = os.getenv("INTERNAL_API_KEY", "dev-secret")
    if x_internal_key != expected_key:
        raise HTTPException(status_code=401, detail="Invalid internal key")
