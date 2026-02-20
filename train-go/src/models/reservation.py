from enum import Enum

from pydantic import BaseModel


class PassengerCount(BaseModel):
    adult: int = 1
    child: int = 0
    senior: int = 0


class SeatPosition(str, Enum):
    window = "window"
    aisle = "aisle"
    any = "any"


class PriceRange(BaseModel):
    min: int | None = None
    max: int | None = None


class ReservationCreate(BaseModel):
    provider: str  # "srt" or "korail"
    dep_station: str
    arr_station: str
    date: str  # YYYYMMDD
    time_range_start: str  # HHMM (e.g. "1400")
    time_range_end: str  # HHMM (e.g. "1700")
    passengers: PassengerCount = PassengerCount()
    seat_type: str = "general"  # "general" or "special"
    # 세분화된 필터 옵션
    train_name: str | None = None  # 열차명 필터 (예: "SRT", "SRT-*", "무임확인")
    train_name_exclude: bool = False  # True면 train_name 제외, False면 포함
    seat_position: SeatPosition = SeatPosition.any  # 좌석 위치 (window/aisle/any)
    price_range: PriceRange | None = None  # 가격대 필터 (원)


class SearchStats(BaseModel):
    total_searches: int = 0
    success_count: int = 0
    error_count: int = 0
    avg_interval_seconds: float | None = None


class ErrorPatternStats(BaseModel):
    error_by_code: dict[str, int] = {}
    max_consecutive_errors: int = 0
    avg_backoff_seconds: float = 0.0
    expected_error_count: int = 0
    unexpected_error_count: int = 0


class SearchLogResponse(BaseModel):
    """개별 검색 로그 응답."""
    id: int
    reservation_id: int
    searched_at: str
    results_count: int
    error: str | None = None
    error_code: str | None = None
    consecutive_errors: int = 0
    backoff_seconds: float = 0.0
    is_expected: bool = False


class ReservationResponse(BaseModel):
    id: int
    provider: str
    dep_station: str
    arr_station: str
    date: str
    time_range_start: str
    time_range_end: str
    passengers: str
    seat_type: str
    # 필터 옵션
    train_name: str | None = None
    train_name_exclude: bool = False
    seat_position: str = "any"
    price_range: str | None = None
    # 상태
    status: str
    train_info: str | None = None
    error_message: str | None = None
    created_at: str
    reserved_at: str | None = None
    search_stats: SearchStats | None = None
