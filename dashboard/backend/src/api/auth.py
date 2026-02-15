import logging

import bcrypt
from fastapi import APIRouter, Cookie, Depends, HTTPException, Response
from pydantic import BaseModel

from src.core.config import Config
from src.core.database import Database

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/auth")


def get_db() -> Database:
    raise NotImplementedError


def get_config() -> Config:
    raise NotImplementedError


def verify_session(
    session_token: str | None = Cookie(None),
    db: Database = Depends(get_db),
) -> dict:
    if not session_token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    session = db.get_session(session_token)
    if not session:
        raise HTTPException(status_code=401, detail="Session expired")
    return session


class LoginRequest(BaseModel):
    username: str
    password: str


@router.post("/login")
def login(
    body: LoginRequest,
    response: Response,
    db: Database = Depends(get_db),
    config: Config = Depends(get_config),
):
    if body.username != config.admin_username:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    if not bcrypt.checkpw(
        body.password.encode(), config.admin_password_hash.encode()
    ):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    token = db.create_session(body.username, config.session_expire_hours)
    response.set_cookie(
        key="session_token",
        value=token,
        httponly=True,
        secure=True,
        samesite="lax",
        max_age=config.session_expire_hours * 3600,
    )
    logger.info(f"Login: {body.username}")
    return {"ok": True, "username": body.username}


@router.post("/logout")
def logout(
    response: Response,
    session_token: str | None = Cookie(None),
    db: Database = Depends(get_db),
):
    if session_token:
        db.delete_session(session_token)
    response.delete_cookie("session_token")
    return {"ok": True}


@router.get("/me")
def me(session: dict = Depends(verify_session)):
    return {"username": session["username"]}
