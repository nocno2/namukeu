from pydantic import BaseModel


class PassengerCount(BaseModel):
    adult: int = 1
    child: int = 0
    senior: int = 0


class ReservationCreate(BaseModel):
    provider: str  # "srt" or "korail"
    dep_station: str
    arr_station: str
    date: str  # YYYYMMDD
    time_range_start: str  # HHMM (e.g. "1400")
    time_range_end: str  # HHMM (e.g. "1700")
    passengers: PassengerCount = PassengerCount()
    seat_type: str = "general"  # "general" or "special"


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
    status: str
    train_info: str | None = None
    error_message: str | None = None
    created_at: str
    reserved_at: str | None = None
