"""Circuit Breaker 패턴 구현.

연속 실패 시 시스템을 보호하고 자동으로 복구하는 메커니즘:
- Closed: 정상 동작, 실패 횟수 추적
- Open: 연속 실패 임계 초과, 요청 차단 (fail-fast)
- Half-Open: 일정 시간 후 제한적 요청 허용 (복구 시도)
"""

import asyncio
import logging
import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Callable

logger = logging.getLogger(__name__)


class CircuitState(Enum):
    """Circuit Breaker 상태."""
    CLOSED = "closed"      # 정상 동작
    OPEN = "open"          # 차단됨 (fail-fast)
    HALF_OPEN = "half_open"  # 복구 시도 중


@dataclass
class CircuitBreakerConfig:
    """Circuit Breaker 설정."""
    failure_threshold: int = 5          # Open으로 전환需要的 연속 실패 횟수
    success_threshold: int = 3           # Closed로 전환需要的 연속 성공 횟수 (half-open에서)
    timeout_seconds: float = 30.0        # Half-open으로 전환需要的 시간
    half_open_max_calls: int = 3        # Half-open에서 허용하는 최대 호출 횟수


@dataclass
class CircuitBreakerStats:
    """Circuit Breaker 통계."""
    total_calls: int = 0
    successful_calls: int = 0
    failed_calls: int = 0
    rejected_calls: int = 0
    state_changes: int = 0
    last_failure_time: float | None = None
    last_success_time: float | None = None
    consecutive_failures: int = 0
    consecutive_successes: int = 0


class CircuitBreaker:
    """Circuit Breaker 구현.

    사용 예시:
        cb = CircuitBreaker("srt_service", CircuitBreakerConfig(failure_threshold=5))

        async with cb:
            await srt_service.search_train(...)
    """

    def __init__(self, name: str, config: CircuitBreakerConfig | None = None):
        self.name = name
        self.config = config or CircuitBreakerConfig()
        self._state = CircuitState.CLOSED
        self._stats = CircuitBreakerStats()
        self._last_state_change_time = time.time()
        self._half_open_calls = 0
        self._lock = asyncio.Lock()

    @property
    def state(self) -> CircuitState:
        """현재 상태 반환 (필요시 half-open으로 자동 전환)."""
        return self._get_state()

    def _get_state(self) -> CircuitState:
        """시간 경과에 따른 상태 자동 전환."""
        now = time.time()

        if self._state == CircuitState.OPEN:
            # 타임아웃 후 half-open으로 전환
            if now - self._last_state_change_time >= self.config.timeout_seconds:
                self._transition_to(CircuitState.HALF_OPEN)
                self._half_open_calls = 0

        elif self._state == CircuitState.HALF_OPEN:
            # 최대 호출 횟수 초과 시 open으로 복귀
            if self._half_open_calls >= self.config.half_open_max_calls:
                self._transition_to(CircuitState.OPEN)

        return self._state

    def _transition_to(self, new_state: CircuitState):
        """상태 전환."""
        old_state = self._state
        self._state = new_state
        self._last_state_change_time = time.time()
        self._stats.state_changes += 1
        logger.info(
            f"CircuitBreaker [{self.name}]: {old_state.value} -> {new_state.value}"
        )

        # 상태 전환 시 통계 리셋
        if new_state == CircuitState.CLOSED:
            self._stats.consecutive_failures = 0
        elif new_state == CircuitState.HALF_OPEN:
            self._half_open_calls = 0
            self._stats.consecutive_successes = 0

    def _record_success(self):
        """성공 기록."""
        self._stats.successful_calls += 1
        self._stats.consecutive_successes += 1
        self._stats.consecutive_failures = 0
        self._stats.last_success_time = time.time()

        # Half-open에서 연속 성공 임계 도달 시 closed로
        if self._state == CircuitState.HALF_OPEN:
            if self._stats.consecutive_successes >= self.config.success_threshold:
                self._transition_to(CircuitState.CLOSED)

    def _record_failure(self):
        """실패 기록."""
        self._stats.failed_calls += 1
        self._stats.consecutive_failures += 1
        self._stats.consecutive_successes = 0
        self._stats.last_failure_time = time.time()

        # Closed에서 연속 실패 임계 도달 시 open으로
        if self._state == CircuitState.CLOSED:
            if self._stats.consecutive_failures >= self.config.failure_threshold:
                self._transition_to(CircuitState.OPEN)

        # Half-open에서 실패 시 open으로 즉시 복귀
        elif self._state == CircuitState.HALF_OPEN:
            self._transition_to(CircuitState.OPEN)

    def _record_rejection(self):
        """차단된 호출 기록."""
        self._stats.rejected_calls += 1
        self._stats.total_calls += 1

    def _record_call(self):
        """호출 기록."""
        self._stats.total_calls += 1
        if self._state == CircuitState.HALF_OPEN:
            self._half_open_calls += 1

    async def call(self, func: Callable, *args, **kwargs):
        """Circuit Breaker로 함수 실행.

        Args:
            func: 실행할 비동기 함수
            *args, **kwargs: 함수 인자

        Returns:
            함수의 반환값

        Raises:
            CircuitBreakerOpenError: Circuit이 open 상태일 때
        """
        async with self._lock:
            current_state = self._get_state()

            if current_state == CircuitState.OPEN:
                self._record_rejection()
                raise CircuitBreakerOpenError(
                    f"CircuitBreaker [{self.name}] is OPEN - "
                    f"연속 {self._stats.consecutive_failures}회 실패로 요청이 차단되었습니다. "
                    f"{(self.config.timeout_seconds - (time.time() - self._last_state_change_time)):.1f}초 후 재시도하세요."
                )

            self._record_call()

        try:
            result = await func(*args, **kwargs)
            self._record_success()
            return result
        except Exception as e:
            self._record_failure()
            raise

    def get_stats(self) -> dict:
        """통계 반환."""
        return {
            "name": self.name,
            "state": self._state.value,
            "total_calls": self._stats.total_calls,
            "successful_calls": self._stats.successful_calls,
            "failed_calls": self._stats.failed_calls,
            "rejected_calls": self._stats.rejected_calls,
            "state_changes": self._stats.state_changes,
            "consecutive_failures": self._stats.consecutive_failures,
            "consecutive_successes": self._stats.consecutive_successes,
            "last_failure_time": self._stats.last_failure_time,
            "last_success_time": self._stats.last_success_time,
        }

    def reset(self):
        """Circuit Breaker 리셋 (수동 복구)."""
        self._state = CircuitState.CLOSED
        self._stats = CircuitBreakerStats()
        self._last_state_change_time = time.time()
        self._half_open_calls = 0
        logger.info(f"CircuitBreaker [{self.name}] 수동 리셋됨")


class CircuitBreakerOpenError(Exception):
    """Circuit이 열려있을 때 발생하는 에러."""
    pass


class CircuitBreakerManager:
    """여러 Circuit Breaker를 관리하는 매니저."""

    def __init__(self):
        self._breakers: dict[str, CircuitBreaker] = {}
        self._lock = asyncio.Lock()

    def get_or_create(self, name: str, config: CircuitBreakerConfig | None = None) -> CircuitBreaker:
        """이름으로 Circuit Breaker 가져오거나 생성."""
        if name not in self._breakers:
            self._breakers[name] = CircuitBreaker(name, config)
        return self._breakers[name]

    def get_all_stats(self) -> list[dict]:
        """모든 Circuit Breaker 통계 반환."""
        return [cb.get_stats() for cb in self._breakers.values()]

    def reset_all(self):
        """모든 Circuit Breaker 리셋."""
        for cb in self._breakers.values():
            cb.reset()
