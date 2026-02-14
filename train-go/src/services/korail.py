import logging
from korail2 import Korail, ReserveOption
from korail2 import AdultPassenger, ChildPassenger, SeniorPassenger

logger = logging.getLogger(__name__)


class KorailService:
    def __init__(self):
        self._client: Korail | None = None

    def login(self, korail_id: str, korail_pw: str):
        self._client = Korail(korail_id, korail_pw)
        logger.info("Korail 로그인 성공")

    def logout(self):
        self._client = None

    def _ensure_logged_in(self):
        if not self._client:
            raise RuntimeError("Korail 로그인이 필요합니다")

    def _build_passengers(self, passengers: dict) -> list:
        result = []
        if passengers.get("adult", 0) > 0:
            result.append(AdultPassenger(passengers["adult"]))
        if passengers.get("child", 0) > 0:
            result.append(ChildPassenger(passengers["child"]))
        if passengers.get("senior", 0) > 0:
            result.append(SeniorPassenger(passengers["senior"]))
        return result or [AdultPassenger(1)]

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
            trains = self._client.search_train_allday(
                dep=dep,
                arr=arr,
                date=date,
                time=time_start_padded,
            )
        except Exception as e:
            logger.error(f"Korail 검색 실패: {e}")
            raise

        if seat_type == "special":
            seat_opt = ReserveOption.SPECIAL_FIRST
        else:
            seat_opt = ReserveOption.GENERAL_FIRST

        passenger_list = self._build_passengers(passengers)

        for train in trains:
            dep_time = train.dep_time[:4]
            if dep_time > time_end:
                break
            if dep_time < time_range_start.replace(":", ""):
                continue

            # 매진 체크
            if seat_type == "special":
                if not hasattr(train, "special_seat_available") or train.special_seat_available == "0":
                    continue
            else:
                if not hasattr(train, "general_seat_available") or train.general_seat_available == "0":
                    continue

            try:
                reservation = self._client.reserve(
                    train, passengers=passenger_list, option=seat_opt
                )
                logger.info(f"Korail 예약 성공: {reservation}")
                return {
                    "provider": "korail",
                    "train_name": getattr(train, "train_type_name", "KTX"),
                    "train_number": getattr(train, "train_no", ""),
                    "dep_station": dep,
                    "arr_station": arr,
                    "dep_date": train.dep_date,
                    "dep_time": train.dep_time,
                    "arr_time": train.arr_time,
                    "reservation": str(reservation),
                }
            except Exception as e:
                logger.debug(f"Korail 예약 시도 실패 ({train.dep_time}): {e}")
                continue

        return None

    def get_reservations(self) -> list:
        self._ensure_logged_in()
        return [str(r) for r in self._client.reservations()]
