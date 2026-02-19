import asyncio
import json
import logging
import random
from datetime import datetime, timedelta

from src.core.crypto import CryptoManager
from src.core.database import Database
from src.core.errors import classify_error
from src.services.notifier import CompositeNotifier, TelegramNotifier
from src.services.srt import SRTService
from src.services.korail import KorailService

logger = logging.getLogger(__name__)


class ReservationScheduler:
    # 스텔스 상수
    SESSION_REFRESH_INTERVAL = 50  # N회 검색마다 세션 갱신 (로그아웃→로그인)
    SESSION_REFRESH_JITTER = 15    # 갱신 주기에 ±N 랜덤 편차
    ERROR_BACKOFF_BASE = 2.0       # 지수 백오프 기본 배수 (초)
    ERROR_BACKOFF_MAX = 120.0      # 최대 백오프 (초)
    STARTUP_DELAY_MIN = 2.0        # 매크로 시작 시 초기 지연 최소 (초)
    STARTUP_DELAY_MAX = 8.0        # 매크로 시작 시 초기 지연 최대 (초)
    MAX_CONSECUTIVE_ERRORS = 20   # 연속 에러 시 매크로 자동 중단

    # 에러 유형별 재시도 정책 (초)
    RETRY_POLICIES = {
        # 예상 결과 - 백오프 불필요, 즉시 재시도
        "SEAT_NOT_AVAILABLE": {"backoff": 0, "max_retries": None},
        "TRAIN_NOT_FOUND": {"backoff": 0, "max_retries": None},
        # 일시적 오류 - 짧은 백오프
        "SESSION_EXPIRED": {"backoff": 2, "max_retries": 5},
        "NETWORK_ERROR": {"backoff": 3, "max_retries": 10},
        "RATE_LIMIT": {"backoff": 15, "max_retries": 8},
        "MAINTENANCE": {"backoff": 30, "max_retries": 5},
        # 치명적 오류 - 긴 백오프, 제한된 재시도
        "LOGIN_FAILED": {"backoff": 10, "max_retries": 3},
        "RESERVATION_FAILED": {"backoff": 5, "max_retries": 2},
        # 알 수 없는 오류
        "UNKNOWN": {"backoff": 5, "max_retries": 5},
    }

    # 예상 결과 에러 코드 집합 (연속 에러 카운트에 포함 안 함)
    EXPECTED_OUTCOMES = {"SEAT_NOT_AVAILABLE", "TRAIN_NOT_FOUND"}

    def __init__(
        self,
        db: Database,
        crypto: CryptoManager,
        notifier: TelegramNotifier | CompositeNotifier,
        search_interval_min: int = 3,
        search_interval_max: int = 8,
        max_duration_hours: int = 24,
        progress_report_minutes: int = 10,
    ):
        self.db = db
        self.crypto = crypto
        self.notifier = notifier
        self.search_interval_min = search_interval_min
        self.search_interval_max = search_interval_max
        self.max_duration_hours = max_duration_hours
        self.progress_report_minutes = progress_report_minutes
        self._tasks: dict[int, asyncio.Task] = {}

    def start_search(self, reservation_id: int):
        if reservation_id in self._tasks:
            logger.warning(f"매크로 #{reservation_id} 이미 실행 중")
            return
        task = asyncio.create_task(self._search_loop(reservation_id))
        self._tasks[reservation_id] = task
        logger.info(f"매크로 #{reservation_id} 시작")

    def stop_search(self, reservation_id: int) -> asyncio.Task | None:
        task = self._tasks.pop(reservation_id, None)
        if task:
            task.cancel()
            logger.info(f"매크로 #{reservation_id} 중단")
        return task

    def get_active_count(self) -> int:
        return len(self._tasks)

    def get_active_ids(self) -> list[int]:
        return list(self._tasks.keys())

    def _random_interval(self, minutes_until_departure: int | None = None) -> float:
        """사람처럼 보이는 랜덤 간격 생성.
        - 기본: 가우시안 분포 (중앙값 근처에 밀집)
        - 10% 확률로 15~30초 긴 휴식 (사람이 잠깐 다른 거 하는 것처럼)
        - 최솟값 보장
        - minutes_until_departure: 출발까지 남은 시간(분). None이면 기본 간격.
        """
        # 적응형 간격: 출발 시간逼近시 더 자주 검색
        if minutes_until_departure is not None:
            if minutes_until_departure < 30:
                # 30분 미만: 1~3초 (积极)
                base_min, base_max = 1, 3
            elif minutes_until_departure < 60:
                # 1시간 미만: 2~5초
                base_min, base_max = 2, 5
            else:
                # 1시간 이상: 기본 간격
                base_min, base_max = self.search_interval_min, self.search_interval_max
        else:
            base_min, base_max = self.search_interval_min, self.search_interval_max

        if random.random() < 0.1:
            return random.uniform(15, 30)
        mid = (base_min + base_max) / 2
        std = (base_max - base_min) / 4
        interval = random.gauss(mid, std)
        return max(base_min, min(base_max, interval))

    def _error_backoff(self, consecutive_errors: int, error_code: str = "UNKNOWN") -> float:
        """에러 유형별 백오프 계산.

        - SEAT_NOT_AVAILABLE, TRAIN_NOT_FOUND: 즉시 재시도 (백오프 0)
        - 정책에 정의된 에러: 정책의 백오프 값 사용
        - 그 외: 기본 지수 백오프
        """
        policy = self.RETRY_POLICIES.get(error_code, self.RETRY_POLICIES["UNKNOWN"])

        # 예상 결과면 즉시 재시도
        if policy["backoff"] == 0:
            return 0

        # 정책의 백오프 적용 (연속 에러 횟수에 따라 증가)
        base = policy["backoff"] * (2 ** min(consecutive_errors - 1, 4))
        jitter = random.uniform(0.5, 1.5)
        return min(base * jitter, self.ERROR_BACKOFF_MAX)

    def _next_session_refresh(self) -> int:
        """세션 갱신까지 남은 검색 횟수 (랜덤 편차 포함)"""
        return self.SESSION_REFRESH_INTERVAL + random.randint(
            -self.SESSION_REFRESH_JITTER, self.SESSION_REFRESH_JITTER
        )

    def _get_minutes_until_departure(self, date: str, time_start: str) -> int | None:
        """출발 시간까지 남은分钟수 계산. 유효하지 않으면 None 반환."""
        try:
            # date: YYYYMMDD, time_start: HH:MM
            dep_datetime = datetime.strptime(f"{date} {time_start}", "%Y%m%d %H:%M")
            now = datetime.now()
            delta = dep_datetime - now
            return max(0, int(delta.total_seconds() // 60))
        except (ValueError, TypeError):
            return None

    async def _refresh_session(self, service, login_id: str, login_pw: str, reservation_id: int):
        """세션 갱신: 로그아웃 후 잠시 쉬고 재로그인 (장기 세션 탐지 회피)"""
        logger.info(f"매크로 #{reservation_id} 세션 갱신 시작")
        service.logout()
        await asyncio.sleep(random.uniform(3, 8))
        service.login(login_id, login_pw)
        logger.info(f"매크로 #{reservation_id} 세션 갱신 완료")

    async def restore_pending(self):
        """서버 재시작 시 pending/searching 상태 예약 복원"""
        pending_reservations = []
        for status in ("pending", "searching"):
            for res in self.db.get_reservations(status=status):
                pending_reservations.append(res["id"])

        # 각 예약에 랜덤 대기로 분산 시작 (봇 패턴 탐지 회피)
        for rid in pending_reservations:
            delay = random.uniform(self.STARTUP_DELAY_MIN, self.STARTUP_DELAY_MAX)
            await asyncio.sleep(delay)
            self.start_search(rid)

    async def _search_loop(self, reservation_id: int):
        reservation = self.db.get_reservation(reservation_id)
        if not reservation:
            return

        self.db.update_reservation_status(reservation_id, "searching")
        await self.notifier.notify_search_started(reservation)

        deadline = datetime.now() + timedelta(hours=self.max_duration_hours)
        service = None

        try:
            # 로그인
            cred = self.db.get_credential(reservation["provider"])
            if not cred:
                self.db.update_reservation_status(
                    reservation_id, "failed", error_message="로그인 정보 없음"
                )
                await self.notifier.notify_reservation_failed(reservation, "로그인 정보가 등록되지 않았습니다")
                return

            login_id = self.crypto.decrypt(cred["encrypted_id"])
            login_pw = self.crypto.decrypt(cred["encrypted_pw"])

            if reservation["provider"] == "srt":
                service = SRTService()
                service.login(login_id, login_pw)
            else:
                service = KorailService()
                service.login(login_id, login_pw)

            passengers = json.loads(reservation["passengers"])
            search_count = 0
            consecutive_errors = 0
            last_report = datetime.now()
            next_refresh_at = self._next_session_refresh()

            # 사람처럼 시작 전 잠시 대기 (즉시 검색은 봇 패턴)
            startup_delay = random.uniform(self.STARTUP_DELAY_MIN, self.STARTUP_DELAY_MAX)
            await asyncio.sleep(startup_delay)

            # 필터 옵션 파싱
            train_name = reservation.get("train_name")
            train_name_exclude = bool(reservation.get("train_name_exclude", 0))
            seat_position = reservation.get("seat_position", "any")
            price_range = None
            if reservation.get("price_range"):
                try:
                    price_range = json.loads(reservation["price_range"])
                except (json.JSONDecodeError, TypeError):
                    pass

            # 반복 검색
            while datetime.now() < deadline:
                try:
                    # 검색 타임아웃 30초 - 무한 대기를 방지
                    result = await asyncio.wait_for(
                        service.search_and_reserve(
                            dep=reservation["dep_station"],
                            arr=reservation["arr_station"],
                            date=reservation["date"],
                            time_range_start=reservation["time_range_start"],
                            time_range_end=reservation["time_range_end"],
                            passengers=passengers,
                            seat_type=reservation["seat_type"],
                            train_name=train_name,
                            train_name_exclude=train_name_exclude,
                            seat_position=seat_position,
                            price_range=price_range,
                        ),
                        timeout=30.0,
                    )

                    search_count += 1
                    consecutive_errors = 0  # 성공 시 에러 카운터 리셋

                    if result:
                        self.db.update_reservation_status(
                            reservation_id, "reserved", train_info=result
                        )
                        self.db.add_search_log(reservation_id, results_count=1)
                        await self.notifier.notify_reservation_success(reservation, result)
                        return

                    self.db.add_search_log(
                        reservation_id,
                        results_count=0,
                        error_code="SEAT_NOT_AVAILABLE",
                        consecutive_errors=consecutive_errors,
                        backoff_seconds=0,
                        is_expected=True,
                    )
                    logger.info(f"매크로 #{reservation_id} 검색 {search_count}회 — 좌석 없음")

                except Exception as e:
                    search_count += 1
                    error_code, recoverable = classify_error(e)
                    logger.error(f"매크로 #{reservation_id} 검색 에러 [{error_code}]: {e}")

                    # 예상 결과 여부 및 백오프 계산
                    is_expected = error_code in self.EXPECTED_OUTCOMES
                    if is_expected:
                        backoff = 0
                        logger.info(f"매크로 #{reservation_id} 예상 결과: {error_code}")
                    else:
                        consecutive_errors += 1
                        backoff = self._error_backoff(consecutive_errors, error_code)

                    # 에러 코드와 함께 로그 저장 (메타데이터 포함)
                    self.db.add_search_log(
                        reservation_id,
                        error=str(e),
                        error_code=error_code,
                        consecutive_errors=consecutive_errors,
                        backoff_seconds=backoff,
                        is_expected=is_expected,
                    )

                    # 에러 유형별 처리
                    if error_code == "SESSION_EXPIRED":
                        # 세션 만료: 재로그인 시도
                        try:
                            logger.info(f"매크로 #{reservation_id} 세션 재로그인 시도")
                            await asyncio.sleep(random.uniform(2, 5))
                            service.login(login_id, login_pw)
                            consecutive_errors = 0
                        except Exception as reauth_error:
                            logger.warning(f"매크로 #{reservation_id} 재로그인 실패: {reauth_error}")
                            await self.notifier.notify_error(reservation, error_code, str(reauth_error))

                    elif error_code == "RATE_LIMIT":
                        # Rate limit: 긴 백오프 적용 + 알림
                        backoff = self._error_backoff(consecutive_errors, error_code)
                        logger.info(f"매크로 #{reservation_id} Rate limit 감지, 백오프 {backoff:.1f}초")
                        await self.notifier.notify_error(reservation, error_code, f"백오프 {backoff:.1f}초")
                        if backoff > 0:
                            await asyncio.sleep(backoff)

                    elif error_code == "MAINTENANCE":
                        # 시스템 점검: 백오프 후 재시도 + 알림
                        backoff = self._error_backoff(consecutive_errors, error_code)
                        logger.info(f"매크로 #{reservation_id} 시스템 점검 중, 백오프 {backoff:.1f}초")
                        await self.notifier.notify_error(reservation, error_code, f"백오프 {backoff:.1f}초")
                        if backoff > 0:
                            await asyncio.sleep(backoff)

                    elif error_code == "NETWORK_ERROR":
                        # 네트워크 에러: 백오프 후 재시도 + 알림
                        backoff = self._error_backoff(consecutive_errors, error_code)
                        logger.info(f"매크로 #{reservation_id} 네트워크 에러, 백오프 {backoff:.1f}초")
                        await self.notifier.notify_error(reservation, error_code, str(e)[:100])
                        if backoff > 0:
                            await asyncio.sleep(backoff)

                    elif error_code in ("SEAT_NOT_AVAILABLE", "TRAIN_NOT_FOUND"):
                        # 예상 결과: 즉시 재시도 (백오프 없음)
                        logger.debug(f"매크로 #{reservation_id} {error_code}, 즉시 재시도")

                    else:
                        # 기타 에러: 정책 기반 백오프 + 알림
                        backoff = self._error_backoff(consecutive_errors, error_code)
                        logger.info(f"매크로 #{reservation_id} 에러 [{error_code}] 백오프 {backoff:.1f}초")
                        await self.notifier.notify_error(reservation, error_code, str(e)[:100])
                        if backoff > 0:
                            await asyncio.sleep(backoff)

                    # 연속 에러 한계 초과 시 매크로 중단
                    if consecutive_errors >= self.MAX_CONSECUTIVE_ERRORS:
                        logger.warning(
                            f"매크로 #{reservation_id} 연속 에러 {consecutive_errors}회 초과, 중단"
                        )
                        self.db.update_reservation_status(
                            reservation_id, "failed",
                            error_message=f"연속 에러 {consecutive_errors}회 초과"
                        )
                        await self.notifier.notify_reservation_failed(
                            reservation, f"연속 에러 {consecutive_errors}회 초과로 중단"
                        )
                        # 치명적 에러: 이메일 알림도 전송
                        await self.notifier.notify_critical_error(
                            reservation, "연속 에러 초과", f"{consecutive_errors}회 연속 에러 발생으로 매크로 중단"
                        )
                        return

                    # 주기적 진행 알림 체크 (에러 경로에서도)
                    now = datetime.now()
                    if (now - last_report).total_seconds() >= self.progress_report_minutes * 60:
                        elapsed = now - (deadline - timedelta(hours=self.max_duration_hours))
                        elapsed_min = int(elapsed.total_seconds() // 60)
                        await self.notifier.notify_progress(reservation, search_count, elapsed_min)
                        last_report = now
                    continue

                # 세션 주기적 갱신 (장기 세션 탐지 회피)
                if search_count >= next_refresh_at:
                    try:
                        await self._refresh_session(service, login_id, login_pw, reservation_id)
                        next_refresh_at = search_count + self._next_session_refresh()
                    except Exception as e:
                        logger.warning(f"매크로 #{reservation_id} 세션 갱신 실패: {e}")

                # 주기적 진행 알림
                now = datetime.now()
                if (now - last_report).total_seconds() >= self.progress_report_minutes * 60:
                    elapsed = now - (deadline - timedelta(hours=self.max_duration_hours))
                    elapsed_min = int(elapsed.total_seconds() // 60)
                    await self.notifier.notify_progress(reservation, search_count, elapsed_min)
                    last_report = now

                # 랜덤 간격 대기 (가우시안 분포 + 가끔 긴 휴식)
                # 출발 시간까지 남은 시간 계산 (적응형 간격用)
                minutes_until = self._get_minutes_until_departure(
                    reservation["date"], reservation["time_range_start"]
                )
                interval = self._random_interval(minutes_until)
                logger.debug(f"매크로 #{reservation_id} 출발까지 {minutes_until}분, 간격 {interval:.1f}초")
                await asyncio.sleep(interval)

            # 시간 초과
            self.db.update_reservation_status(
                reservation_id, "failed", error_message="검색 시간 초과"
            )
            await self.notifier.notify_reservation_failed(reservation, "검색 시간 초과")
            # 시간 초과 시에도 이메일 알림
            await self.notifier.notify_critical_error(
                reservation, "시간 초과", f"{self.max_duration_hours}시간 동안 좌석을 찾지 못했습니다"
            )

        except asyncio.CancelledError:
            self.db.update_reservation_status(reservation_id, "cancelled")
            logger.info(f"매크로 #{reservation_id} 취소됨")
        except Exception as e:
            logger.error(f"매크로 #{reservation_id} 오류: {e}")
            self.db.update_reservation_status(
                reservation_id, "failed", error_message=str(e)
            )
            await self.notifier.notify_reservation_failed(reservation, str(e))
        finally:
            if service:
                service.logout()
            self._tasks.pop(reservation_id, None)
