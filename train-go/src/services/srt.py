import fnmatch
import logging

from SRT import SRT, SeatType
from SRT import Adult, Child, Senior

from src.core.errors import (
    TrainAPIError,
    LoginError,
    SessionExpiredError,
    SeatNotAvailableError,
    TrainNotFoundError,
    ReservationFailedError,
    NetworkError,
    RateLimitError,
    SystemMaintenanceError,
)

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
            raise LoginError("SRT 로그인이 필요합니다")

    def _classify_srt_error(self, error: Exception) -> TrainAPIError:
        """SRT 라이브러리 예외를 TrainAPIError 서브클래스로 변환."""
        error_msg = str(error)
        error_lower = error_msg.lower()

        # 로그인/인증 관련
        if any(kw in error_lower for kw in ["login", "로그인", "인증", "password", "unauthorized"]):
            if "만료" in error_msg or "expired" in error_lower:
                return SessionExpiredError(error_msg)
            return LoginError(error_msg)

        # 좌석 관련
        if any(kw in error_lower for kw in ["좌석", "seat", "매진", "sold", "no seat", "available"]):
            return SeatNotAvailableError(error_msg)

        # 열차 없음
        if any(kw in error_lower for kw in ["열차", "train", "결과가 없습니다", "no result", "not found"]):
            return TrainNotFoundError(error_msg)

        # Rate limit
        if any(kw in error_lower for kw in ["rate limit", "too many", "너무 많"]):
            return RateLimitError(error_msg)

        # 시스템 점검
        if any(kw in error_lower for kw in ["점검", "maintenance", "unavailable", "service"]):
            return SystemMaintenanceError(error_msg)

        # 네트워크
        if any(kw in error_lower for kw in ["timeout", "connection", "network", "networkerror"]):
            return NetworkError(error_msg)

        # 기본: 예약 실패로 처리
        return ReservationFailedError(error_msg)

    def _build_passengers(self, passengers: dict) -> list:
        result = []
        if passengers.get("adult", 0) > 0:
            result.append(Adult(passengers["adult"]))
        if passengers.get("child", 0) > 0:
            result.append(Child(passengers["child"]))
        if passengers.get("senior", 0) > 0:
            result.append(Senior(passengers["senior"]))
        return result or [Adult(1)]

    def _matches_train_name_filter(
        self, train_name: str | None, filter_pattern: str | None, exclude: bool
    ) -> bool:
        """열차명이 필터 패턴과 일치하는지 확인."""
        if not filter_pattern:
            return True
        if not train_name:
            return not exclude  # 열차명 없으면: 포함모드면 통과, 제외모드면 필터

        matches = fnmatch.fnmatch(train_name.lower(), filter_pattern.lower())
        return not matches if exclude else matches

    def _matches_price_filter(self, train, price_range: dict | None) -> bool:
        """열차 가격이 필터 범위와 일치하는지 확인."""
        if not price_range:
            return True

        # SRT 라이브러리에서 가격 정보 추출 시도
        price = None
        if hasattr(train, "price"):
            price = train.price
        elif hasattr(train, "fare"):
            price = train.fare
        elif hasattr(train, "total_fare"):
            price = train.total_fare

        if price is None:
            return True  # 가격 정보 없으면 필터 통과

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

        time_start = time_range_start.replace(":", "")[:4]  # "HHMM" (4자리)
        time_end = time_range_end.replace(":", "")[:4]  # "HHMM" (4자리)
        time_start_padded = time_start.ljust(6, "0")  # search_train용 6자리

        try:
            trains = self._client.search_train(
                dep=dep,
                arr=arr,
                date=date,
                time=time_start_padded,
                available_only=True,
            )
        except Exception as e:
            if "열차가 없습니다" in str(e) or "결과가 없습니다" in str(e):
                return None
            # 에러 타입 변환
            raised_error = self._classify_srt_error(e)
            logger.error(f"SRT 검색 실패: {raised_error}")
            raise raised_error from e

        special = SeatType.SPECIAL_FIRST if seat_type == "special" else SeatType.GENERAL_FIRST
        passenger_list = self._build_passengers(passengers)

        for train in trains:
            train_name_str = getattr(train, "train_name", None) or getattr(train, "train_name_kor", "SRT")

            # 열차명 필터
            if not self._matches_train_name_filter(train_name_str, train_name, train_name_exclude):
                logger.debug(f"열차명 필터 제외: {train_name_str}")
                continue

            dep_time = train.dep_time[:4]  # "HHMM" from "HHMMSS"
            if dep_time > time_end:
                break
            if dep_time < time_start:
                continue

            # 좌석 유형 가용성 체크
            # SRT API 응답에서 좌석 가용 여부 확인 (속성명: gnrm_rsv_psb_str=일반실, sprt_rsv_psb_str=특실)
            has_general = getattr(train, "gnrm_rsv_psb_str", "Y") == "Y"
            has_special = getattr(train, "sprt_rsv_psb_str", "Y") == "Y"

            if seat_type == "special":
                if not has_special:
                    logger.debug(f"SRT 특실 좌석 없음: {train_name_str} {dep_time}")
                    continue
            else:
                if not has_general:
                    logger.debug(f"SRT 일반실 좌석 없음: {train_name_str} {dep_time}")
                    continue

            # 가격대 필터
            if not self._matches_price_filter(train, price_range):
                logger.debug(f"가격대 필터 제외: {train}")
                continue

            try:
                # 좌석 위치 필터 (window/aisle)
                seat_preference = None
                if seat_position == "window":
                    seat_preference = " Window"
                elif seat_position == "aisle":
                    seat_preference = "Aisle"

                reservation = self._client.reserve(
                    train,
                    passengers=passenger_list,
                    special_seat=special,
                    seat_preference=seat_preference,
                )
                logger.info(f"SRT 예약 성공: {reservation}")
                return {
                    "provider": "srt",
                    "train_name": train_name_str,
                    "train_number": getattr(train, "train_number", ""),
                    "dep_station": dep,
                    "arr_station": arr,
                    "dep_date": train.dep_date,
                    "dep_time": train.dep_time,
                    "arr_time": train.arr_time,
                    "reservation": str(reservation),
                }
            except Exception as e:
                # 예약 시도 실패는 좌석 없음으로 인한 경우가 대부분이므로 debug 레벨로
                classified = self._classify_srt_error(e)
                logger.debug(f"SRT 예약 시도 실패 ({train.dep_time}): {classified}")
                continue

        return None

    def get_reservations(self) -> list:
        self._ensure_logged_in()
        return [str(r) for r in self._client.get_reservations()]
