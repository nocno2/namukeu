import asyncio
import json
import logging
import random
from datetime import datetime, timedelta

from src.core.crypto import CryptoManager
from src.core.database import Database
from src.services.notifier import TelegramNotifier
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

    def __init__(
        self,
        db: Database,
        crypto: CryptoManager,
        notifier: TelegramNotifier,
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

    def _random_interval(self) -> float:
        """사람처럼 보이는 랜덤 간격 생성.
        - 기본: 가우시안 분포 (중앙값 근처에 밀집)
        - 10% 확률로 15~30초 긴 휴식 (사람이 잠깐 다른 거 하는 것처럼)
        - 최솟값 보장
        """
        if random.random() < 0.1:
            return random.uniform(15, 30)
        mid = (self.search_interval_min + self.search_interval_max) / 2
        std = (self.search_interval_max - self.search_interval_min) / 4
        interval = random.gauss(mid, std)
        return max(self.search_interval_min, min(self.search_interval_max, interval))

    def _error_backoff(self, consecutive_errors: int) -> float:
        """연속 에러 시 지수 백오프. 사람이 에러를 보고 점점 오래 쉬는 패턴."""
        base = self.ERROR_BACKOFF_BASE * (2 ** min(consecutive_errors, 6))
        jitter = random.uniform(0.5, 1.5)
        return min(base * jitter, self.ERROR_BACKOFF_MAX)

    def _next_session_refresh(self) -> int:
        """세션 갱신까지 남은 검색 횟수 (랜덤 편차 포함)"""
        return self.SESSION_REFRESH_INTERVAL + random.randint(
            -self.SESSION_REFRESH_JITTER, self.SESSION_REFRESH_JITTER
        )

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

            # 반복 검색
            while datetime.now() < deadline:
                try:
                    result = service.search_and_reserve(
                        dep=reservation["dep_station"],
                        arr=reservation["arr_station"],
                        date=reservation["date"],
                        time_range_start=reservation["time_range_start"],
                        time_range_end=reservation["time_range_end"],
                        passengers=passengers,
                        seat_type=reservation["seat_type"],
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

                    self.db.add_search_log(reservation_id, results_count=0)
                    logger.info(f"매크로 #{reservation_id} 검색 {search_count}회 — 좌석 없음")

                except Exception as e:
                    search_count += 1
                    consecutive_errors += 1
                    logger.error(f"매크로 #{reservation_id} 검색 에러: {e}")
                    self.db.add_search_log(reservation_id, error=str(e))

                    # 로그인 만료 시 재로그인 시도
                    if "로그인" in str(e) or "login" in str(e).lower():
                        try:
                            await asyncio.sleep(random.uniform(2, 5))
                            service.login(login_id, login_pw)
                            consecutive_errors = 0
                        except Exception:
                            pass

                    # 에러 시 지수 백오프 적용 후 다음 반복으로
                    backoff = self._error_backoff(consecutive_errors)
                    logger.info(f"매크로 #{reservation_id} 에러 백오프 {backoff:.1f}초")
                    await asyncio.sleep(backoff)

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
                interval = self._random_interval()
                await asyncio.sleep(interval)

            # 시간 초과
            self.db.update_reservation_status(
                reservation_id, "failed", error_message="검색 시간 초과"
            )
            await self.notifier.notify_reservation_failed(reservation, "검색 시간 초과")

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
