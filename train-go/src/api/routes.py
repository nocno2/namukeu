from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from src.core.crypto import CryptoManager
from src.core.database import Database
from src.models.credential import CredentialCreate, CredentialResponse
from src.models.reservation import ReservationCreate, ReservationResponse, SearchStats
from src.services.scheduler import ReservationScheduler

router = APIRouter()
security = HTTPBearer()

# 의존성 — main.py에서 app.state에 주입
def get_db(credentials: HTTPAuthorizationCredentials = Depends(security)) -> Database:
    # 실제 의존성은 main.py에서 오버라이드
    raise NotImplementedError


def get_crypto() -> CryptoManager:
    raise NotImplementedError


def get_scheduler() -> ReservationScheduler:
    raise NotImplementedError


def get_token() -> str:
    raise NotImplementedError


def verify(credentials: HTTPAuthorizationCredentials = Depends(security), token: str = Depends(get_token)):
    if credentials.credentials != token:
        raise HTTPException(status_code=401, detail="Invalid token")


# --- Credentials ---


@router.post("/credentials", response_model=CredentialResponse)
def create_credential(
    body: CredentialCreate,
    _=Depends(verify),
    db: Database = Depends(get_db),
    crypto: CryptoManager = Depends(get_crypto),
):
    if body.provider not in ("srt", "korail"):
        raise HTTPException(status_code=400, detail="provider must be 'srt' or 'korail'")

    encrypted_id = crypto.encrypt(body.login_id)
    encrypted_pw = crypto.encrypt(body.password)
    db.save_credential(body.provider, encrypted_id, encrypted_pw)

    cred = db.get_credential(body.provider)
    return CredentialResponse(
        provider=cred["provider"],
        created_at=cred["created_at"],
        updated_at=cred["updated_at"],
    )


@router.delete("/credentials/{provider}")
def delete_credential(
    provider: str,
    _=Depends(verify),
    db: Database = Depends(get_db),
):
    if not db.delete_credential(provider):
        raise HTTPException(status_code=404, detail="Credential not found")
    return {"message": f"{provider} 자격증명 삭제 완료"}


# --- Reservations ---


@router.post("/reservations", response_model=ReservationResponse)
async def create_reservation(
    body: ReservationCreate,
    _=Depends(verify),
    db: Database = Depends(get_db),
    scheduler: ReservationScheduler = Depends(get_scheduler),
):
    if body.provider not in ("srt", "korail"):
        raise HTTPException(status_code=400, detail="provider must be 'srt' or 'korail'")

    cred = db.get_credential(body.provider)
    if not cred:
        raise HTTPException(
            status_code=400,
            detail=f"{body.provider} 로그인 정보가 등록되지 않았습니다. POST /credentials 먼저 호출하세요.",
        )

    reservation_id = db.create_reservation(
        provider=body.provider,
        dep_station=body.dep_station,
        arr_station=body.arr_station,
        date=body.date,
        time_range_start=body.time_range_start,
        time_range_end=body.time_range_end,
        passengers=body.passengers.model_dump(),
        seat_type=body.seat_type,
    )

    scheduler.start_search(reservation_id)

    reservation = db.get_reservation(reservation_id)
    return ReservationResponse(**reservation)


@router.get("/reservations", response_model=list[ReservationResponse])
def list_reservations(
    status: str | None = None,
    _=Depends(verify),
    db: Database = Depends(get_db),
):
    return [ReservationResponse(**r) for r in db.get_reservations(status=status)]


@router.get("/reservations/{reservation_id}", response_model=ReservationResponse)
def get_reservation(
    reservation_id: int,
    _=Depends(verify),
    db: Database = Depends(get_db),
):
    reservation = db.get_reservation(reservation_id)
    if not reservation:
        raise HTTPException(status_code=404, detail="Reservation not found")

    # 검색 통계 계산
    logs = db.get_search_logs(reservation_id)
    total_searches = len(logs)
    success_count = sum(1 for log in logs if log.get("results_count", 0) > 0)
    error_count = sum(1 for log in logs if log.get("error"))

    # 평균 검색 간격 계산
    avg_interval = None
    if len(logs) >= 2:
        from datetime import datetime
        intervals = []
        for i in range(1, len(logs)):
            prev = datetime.fromisoformat(logs[i-1]["searched_at"])
            curr = datetime.fromisoformat(logs[i]["searched_at"])
            intervals.append((curr - prev).total_seconds())
        avg_interval = sum(intervals) / len(intervals) if intervals else None

    search_stats = SearchStats(
        total_searches=total_searches,
        success_count=success_count,
        error_count=error_count,
        avg_interval_seconds=avg_interval,
    )

    return ReservationResponse(**reservation, search_stats=search_stats)


@router.delete("/reservations/{reservation_id}")
def cancel_reservation(
    reservation_id: int,
    _=Depends(verify),
    db: Database = Depends(get_db),
    scheduler: ReservationScheduler = Depends(get_scheduler),
):
    reservation = db.get_reservation(reservation_id)
    if not reservation:
        raise HTTPException(status_code=404, detail="Reservation not found")

    scheduler.stop_search(reservation_id)
    db.update_reservation_status(reservation_id, "cancelled")
    return {"message": f"예약 #{reservation_id} 취소 완료"}


# --- System ---


@router.get("/health")
def health():
    return {"status": "ok"}


@router.get("/status")
def status(
    _=Depends(verify),
    db: Database = Depends(get_db),
    scheduler: ReservationScheduler = Depends(get_scheduler),
):
    all_reservations = db.get_reservations()
    return {
        "active_macros": scheduler.get_active_count(),
        "active_macro_ids": scheduler.get_active_ids(),
        "total_reservations": len(all_reservations),
        "by_status": _count_by_status(all_reservations),
    }


def _count_by_status(reservations: list[dict]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for r in reservations:
        s = r["status"]
        counts[s] = counts.get(s, 0) + 1
    return counts
