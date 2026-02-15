from fastapi import APIRouter, Depends, HTTPException

from src.api.auth import verify
from src.core.crypto import CryptoManager
from src.core.database import Database
from src.core import runtime
from src.models.credential import CredentialCreate, CredentialResponse
from src.models.trading import ModeRequest, ModeResponse, OrderResponse, PositionResponse

router = APIRouter(tags=["trading"])


def get_db() -> Database:
    raise NotImplementedError


def get_crypto() -> CryptoManager:
    raise NotImplementedError


# --- Credentials ---


@router.post("/credentials", response_model=CredentialResponse)
def create_credential(
    body: CredentialCreate,
    _=Depends(verify),
    db: Database = Depends(get_db),
    crypto: CryptoManager = Depends(get_crypto),
):
    if body.provider not in ("upbit", "binance", "binance_futures"):
        raise HTTPException(status_code=400, detail=f"Unsupported provider: {body.provider}")
    encrypted_access = crypto.encrypt(body.access_key)
    encrypted_secret = crypto.encrypt(body.secret_key)
    db.save_credential(body.provider, encrypted_access, encrypted_secret)

    cred = db.get_credential(body.provider)
    return CredentialResponse(
        provider=cred["provider"],
        created_at=cred["created_at"],
        updated_at=cred["updated_at"],
    )


@router.delete("/credentials/{provider}")
def delete_credential(
    provider: str = "upbit",
    _=Depends(verify),
    db: Database = Depends(get_db),
):
    if not db.delete_credential(provider):
        raise HTTPException(status_code=404, detail="Credential not found")
    return {"message": f"{provider} 자격증명 삭제 완료"}


# --- Trading Mode ---


@router.get("/trading/mode", response_model=ModeResponse)
def get_mode(
    _=Depends(verify),
):
    if not runtime.config:
        raise HTTPException(status_code=503, detail="서버 초기화 중")
    config = runtime.config
    return ModeResponse(
        dry_run=config.dry_run,
        mode="dry_run" if config.dry_run else "live",
    )


@router.post("/trading/mode", response_model=ModeResponse)
def set_mode(
    body: ModeRequest,
    _=Depends(verify),
):
    if not runtime.config:
        raise HTTPException(status_code=503, detail="서버 초기화 중")
    config = runtime.config
    config.dry_run = body.dry_run
    for exc in runtime.exchanges.values():
        exc.dry_run = body.dry_run
    return ModeResponse(
        dry_run=config.dry_run,
        mode="dry_run" if config.dry_run else "live",
    )


# --- Orders & Positions ---


@router.get("/trading/orders", response_model=list[OrderResponse])
def list_orders(
    ticker: str | None = None,
    limit: int = 50,
    offset: int = 0,
    _=Depends(verify),
    db: Database = Depends(get_db),
):
    orders = db.get_orders(ticker=ticker, limit=limit, offset=offset)
    return [OrderResponse(**{**o, "is_dry_run": bool(o["is_dry_run"])}) for o in orders]


@router.get("/trading/positions", response_model=list[PositionResponse])
def list_positions(
    _=Depends(verify),
    db: Database = Depends(get_db),
):
    return db.get_positions()


# --- Trading Control ---


@router.post("/trading/start")
async def start_trading(exchange: str | None = None, _=Depends(verify)):
    if exchange:
        sched = runtime.schedulers.get(exchange)
        if not sched:
            raise HTTPException(status_code=503, detail=f"{exchange} 거래소가 초기화되지 않았습니다")
        await sched.restore_enabled()
        return {"message": f"[{exchange}] 활성 전략 매매 시작"}
    else:
        if not runtime.schedulers:
            raise HTTPException(status_code=503, detail="거래소 자격증명이 등록되지 않았습니다")
        for sched in runtime.schedulers.values():
            await sched.restore_enabled()
        return {"message": "전체 거래소 활성 전략 매매 시작"}


@router.post("/trading/stop")
async def stop_trading(exchange: str | None = None, _=Depends(verify)):
    if exchange:
        sched = runtime.schedulers.get(exchange)
        if not sched:
            raise HTTPException(status_code=503, detail=f"{exchange} 거래소가 초기화되지 않았습니다")
        await sched.stop_all()
        return {"message": f"[{exchange}] 매매 중단"}
    else:
        if not runtime.schedulers:
            raise HTTPException(status_code=503, detail="거래소 자격증명이 등록되지 않았습니다")
        for sched in runtime.schedulers.values():
            await sched.stop_all()
        return {"message": "전체 매매 중단"}
