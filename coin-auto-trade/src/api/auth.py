from fastapi import Depends, HTTPException
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
