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

    async def restore_pending(self):
        """서버 재시작 시 pending/searching 상태 예약 복원"""
        for status in ("pending", "searching"):
            for res in self.db.get_reservations(status=status):
                self.start_search(res["id"])

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
            last_report = datetime.now()

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
                    logger.error(f"매크로 #{reservation_id} 검색 에러: {e}")
                    self.db.add_search_log(reservation_id, error=str(e))
                    # 로그인 만료 시 재로그인 시도
                    if "로그인" in str(e) or "login" in str(e).lower():
                        try:
                            service.login(login_id, login_pw)
                        except Exception:
                            pass

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
