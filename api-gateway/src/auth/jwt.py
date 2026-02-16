from __future__ import annotations

from datetime import datetime, timedelta, timezone

import jwt as pyjwt


def create_token(
    payload: dict,
    secret: str,
    algorithm: str = "HS256",
    expire_hours: int = 24,
) -> str:
    data = payload.copy()
    data["exp"] = datetime.now(timezone.utc) + timedelta(hours=expire_hours)
    data["iat"] = datetime.now(timezone.utc)
    return pyjwt.encode(data, secret, algorithm=algorithm)


def verify_token(token: str, secret: str, algorithm: str = "HS256") -> dict | None:
    try:
        return pyjwt.decode(token, secret, algorithms=[algorithm])
    except pyjwt.PyJWTError:
        return None
