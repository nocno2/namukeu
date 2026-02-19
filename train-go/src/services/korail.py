import fnmatch
import json
import logging

from korail2 import Korail, ReserveOption
from korail2 import AdultPassenger, ChildPassenger, SeniorPassenger
from korail2.korail2 import KORAIL_CANCEL

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

    def _matches_train_name_filter(
        self, train_name: str | None, filter_pattern: str | None, exclude: bool
    ) -> bool:
        """열차명이 필터 패턴과 일치하는지 확인."""
        if not filter_pattern:
            return True
        if not train_name:
            return not exclude

        matches = fnmatch.fnmatch(train_name.lower(), filter_pattern.lower())
        return not matches if exclude else matches

    def _matches_price_filter(self, train, price_range: dict | None) -> bool:
        """열차 가격이 필터 범위와 일치하는지 확인."""
        if not price_range:
            return True

        price = None
        if hasattr(train, "price"):
            price = train.price
        elif hasattr(train, "tot_pay"):
            price = train.tot_pay

        if price is None:
            return True

        price_min = price_range.get("min")
        price_max = price_range.get("max")

        if price_min is not None and price < price_min:
            return False
        if price_max is not None and price > price_max:
            return False

        return True

    def search_and_reserve(
        self,
        dep: str,
        arr: str,
        date: str,
        time_range_start: str,
        time_range_end: str,
        passengers: dict,
        seat_type: str = "general",
        train_name: str | None = None,
        train_name_exclude: bool = False,
        seat_position: str = "any",
        price_range: dict | None = None,
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
            if "No Results" in str(e):
                return None
            logger.error(f"Korail 검색 실패: {e}")
            raise

        if seat_type == "special":
            seat_opt = ReserveOption.SPECIAL_FIRST
        else:
            seat_opt = ReserveOption.GENERAL_FIRST

        passenger_list = self._build_passengers(passengers)

        for train in trains:
            train_name_str = getattr(train, "train_type_name", None) or "KTX"

            # 열차명 필터
            if not self._matches_train_name_filter(train_name_str, train_name, train_name_exclude):
                logger.debug(f"열차명 필터 제외: {train_name_str}")
                continue

            dep_time = train.dep_time[:4]
            if dep_time > time_end:
                break
            if dep_time < time_range_start.replace(":", ""):
                continue

            # 매진 체크
            if seat_type == "special":
                if not train.has_special_seat:
                    continue
            else:
                if not train.has_general_seat:
                    continue

            # 가격대 필터
            if not self._matches_price_filter(train, price_range):
                logger.debug(f"가격대 필터 제외: {train}")
                continue

            try:
                if seat_position != "any":
                    logger.debug(f"좌석 위치 선호: {seat_position}")

                reservation = self._client.reserve(
                    train, passengers=passenger_list, option=seat_opt
                )
                logger.info(f"Korail 예약 성공: {reservation}")
                return {
                    "provider": "korail",
                    "train_name": train_name_str,
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

    def cancel_reservation(self, rsv_index: int = 0) -> bool:
        """예약 취소. korail2 cancel()에 버그가 있어서 직접 구현 (get에 params= 사용)"""
        self._ensure_logged_in()
        reservations = self._client.reservations()
        if rsv_index >= len(reservations):
            raise ValueError(f"예약 #{rsv_index} 없음 (총 {len(reservations)}건)")

        rsv = reservations[rsv_index]
        params = {
            "Device": self._client._device,
            "Version": self._client._version,
            "Key": self._client._key,
            "txtPnrNo": rsv.rsv_id,
            "txtJrnySqno": rsv.journey_no,
            "txtJrnyCnt": rsv.journey_cnt,
            "hidRsvChgNo": rsv.rsv_chg_no,
        }
        resp = self._client._session.get(KORAIL_CANCEL, params=params)
        result = json.loads(resp.text)
        if result.get("strResult") == "SUCC":
            logger.info(f"Korail 예약 취소 성공: {rsv.rsv_id}")
            return True
        raise RuntimeError(f"Korail 취소 실패: {result.get('h_msg_txt', 'unknown')}")

    def get_reservations(self) -> list:
        self._ensure_logged_in()
        return [str(r) for r in self._client.reservations()]
