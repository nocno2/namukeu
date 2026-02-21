from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from src.core.crypto import CryptoManager
from src.core.database import Database
from src.core.errors import TrainAPIError
from src.core.circuit_breaker import CircuitBreaker
from src.models.credential import CredentialCreate, CredentialResponse
from src.models.reservation import ReservationCreate, ReservationResponse, SearchStats, ErrorPatternStats, SearchLogResponse
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
        train_name=body.train_name,
        train_name_exclude=body.train_name_exclude,
        seat_position=body.seat_position.value,
        price_range=body.price_range.model_dump() if body.price_range else None,
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


@router.get("/reservations/{reservation_id}/error-stats", response_model=ErrorPatternStats)
def get_error_stats(
    reservation_id: int,
    _=Depends(verify),
    db: Database = Depends(get_db),
):
    """에러 패턴 분석. consecutive_errors, backoff_seconds, is_expected 기반 분석."""
    reservation = db.get_reservation(reservation_id)
    if not reservation:
        raise HTTPException(status_code=404, detail="Reservation not found")

    stats = db.get_error_stats(reservation_id)
    return ErrorPatternStats(**stats)


@router.get("/error-stats", response_model=ErrorPatternStats)
def get_all_error_stats(
    _=Depends(verify),
    db: Database = Depends(get_db),
):
    """전체 에러 패턴 분석. 모든 예약의 에러를 종합 분석."""
    stats = db.get_error_stats()
    return ErrorPatternStats(**stats)


@router.get("/reservations/{reservation_id}/search-logs", response_model=list[SearchLogResponse])
def get_search_logs(
    reservation_id: int,
    _=Depends(verify),
    db: Database = Depends(get_db),
):
    """특정 예약의 검색 로그 목록 조회.

    - 에러 발생 시 error_code, consecutive_errors, backoff_seconds, is_expected 포함
    - 성공 시 results_count > 0
    """
    reservation = db.get_reservation(reservation_id)
    if not reservation:
        raise HTTPException(status_code=404, detail="Reservation not found")

    logs = db.get_search_logs(reservation_id)
    return [SearchLogResponse(**log) for log in logs]


@router.delete("/logs/cleanup")
def cleanup_logs(
    keep_days: int = 7,
    _=Depends(verify),
    db: Database = Depends(get_db),
):
    """오래된 검색 로그 정리. keep_days 이내의 로그만 보관."""
    deleted = db.cleanup_old_logs(keep_days=keep_days)
    return {"message": f"{deleted}개 로그 삭제 완료", "keep_days": keep_days}


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

    # Circuit Breaker 상태 조회
    circuit_breakers = []
    for provider, cb in scheduler._circuit_breakers.items():
        circuit_breakers.append(cb.get_stats())

    return {
        "active_macros": scheduler.get_active_count(),
        "active_macro_ids": scheduler.get_active_ids(),
        "total_reservations": len(all_reservations),
        "by_status": _count_by_status(all_reservations),
        "circuit_breakers": circuit_breakers,
    }


@router.post("/circuit-breaker/reset")
def reset_circuit_breakers(
    _=Depends(verify),
    scheduler: ReservationScheduler = Depends(get_scheduler),
):
    """모든 Circuit Breaker 수동 리셋."""
    for cb in scheduler._circuit_breakers.values():
        cb.reset()
    return {"message": "모든 Circuit Breaker가 리셋되었습니다"}


@router.post("/circuit-breaker/{name}/reset")
def reset_circuit_breaker(
    name: str,
    _=Depends(verify),
    scheduler: ReservationScheduler = Depends(get_scheduler),
):
    """특정 Circuit Breaker만 이름으로 리셋."""
    if name not in scheduler._circuit_breakers:
        raise HTTPException(status_code=404, detail=f"Circuit Breaker '{name}'을 찾을 수 없습니다")

    scheduler._circuit_breakers[name].reset()
    return {"message": f"Circuit Breaker '{name}'이(가) 리셋되었습니다"}


@router.get("/circuit-breaker")
def list_circuit_breakers(
    _=Depends(verify),
    scheduler: ReservationScheduler = Depends(get_scheduler),
):
    """모든 Circuit Breaker 목록 및 상태 조회."""
    return {
        "breakers": [
            {
                "name": name,
                **cb.get_stats(),
            }
            for name, cb in scheduler._circuit_breakers.items()
        ]
    }


@router.get("/circuit-breaker/{name}")
def get_circuit_breaker(
    name: str,
    _=Depends(verify),
    scheduler: ReservationScheduler = Depends(get_scheduler),
):
    """특정 Circuit Breaker 상태 조회."""
    if name not in scheduler._circuit_breakers:
        raise HTTPException(status_code=404, detail=f"Circuit Breaker '{name}'을 찾을 수 없습니다")

    return scheduler._circuit_breakers[name].get_stats()


def _count_by_status(reservations: list[dict]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for r in reservations:
        s = r["status"]
        counts[s] = counts.get(s, 0) + 1
    return counts
