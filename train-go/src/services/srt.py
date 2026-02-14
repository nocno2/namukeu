import logging
from SRT import SRT, SeatType
from SRT import Adult, Child, Senior

logger = logging.getLogger(__name__)


class SRTService:
    def __init__(self):
        self._client: SRT | None = None

    def login(self, srt_id: str, srt_pw: str):
        self._client = SRT(srt_id, srt_pw)
        logger.info("SRT 로그인 성공")

    def logout(self):
        if self._client:
            try:
                self._client.logout()
            except Exception:
                pass
            self._client = None

    def _ensure_logged_in(self):
        if not self._client:
            raise RuntimeError("SRT 로그인이 필요합니다")

    def _build_passengers(self, passengers: dict) -> list:
        result = []
        if passengers.get("adult", 0) > 0:
            result.append(Adult(passengers["adult"]))
        if passengers.get("child", 0) > 0:
            result.append(Child(passengers["child"]))
        if passengers.get("senior", 0) > 0:
            result.append(Senior(passengers["senior"]))
        return result or [Adult(1)]

    def search_and_reserve(
        self,
        dep: str,
        arr: str,
        date: str,
        time_range_start: str,
        time_range_end: str,
        passengers: dict,
        seat_type: str = "general",
    ) -> dict | None:
        self._ensure_logged_in()

        time_start_padded = time_range_start.replace(":", "").ljust(6, "0")
        time_end = time_range_end.replace(":", "")

        try:
            trains = self._client.search_train(
                dep=dep,
                arr=arr,
                date=date,
                time=time_start_padded,
                available_only=True,
            )
        except Exception as e:
            logger.error(f"SRT 검색 실패: {e}")
            raise

        special = SeatType.SPECIAL_FIRST if seat_type == "special" else SeatType.GENERAL_FIRST
        passenger_list = self._build_passengers(passengers)

        for train in trains:
            dep_time = train.dep_time[:4]  # "HHMM" from "HHMMSS"
            if dep_time > time_end:
                break
            if dep_time < time_range_start.replace(":", ""):
                continue

            try:
                reservation = self._client.reserve(
                    train, passengers=passenger_list, special_seat=special
                )
                logger.info(f"SRT 예약 성공: {reservation}")
                return {
                    "provider": "srt",
                    "train_name": getattr(train, "train_name", "SRT"),
                    "train_number": getattr(train, "train_number", ""),
                    "dep_station": dep,
                    "arr_station": arr,
                    "dep_date": train.dep_date,
                    "dep_time": train.dep_time,
                    "arr_time": train.arr_time,
                    "reservation": str(reservation),
                }
            except Exception as e:
                logger.debug(f"SRT 예약 시도 실패 ({train.dep_time}): {e}")
                continue

        return None

    def get_reservations(self) -> list:
        self._ensure_logged_in()
        return [str(r) for r in self._client.get_reservations()]
