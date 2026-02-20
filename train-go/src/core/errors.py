"""에러 분류 및 처리 모듈."""

# 에러 유형별 복구 제안
RECOVERY_SUGGESTIONS = {
    "SEAT_NOT_AVAILABLE": "예상 결과입니다. 자동 재시도 중입니다. 좌석이 열리면 즉시 예약됩니다.",
    "TRAIN_NOT_FOUND": "예상 결과입니다. 지정한 시간대의 열차가 없습니다. 자동 재시도 중입니다.",
    "TIMEOUT_ERROR": "서버 응답이 느립니다. 잠시 대기 후 자동으로 재시도합니다. 네트워크 상태를 확인해 보세요.",
    "CONNECTION_ERROR": "서버 연결에 실패했습니다. 인터넷 연결을 확인하고 자동으로 재시도합니다.",
    "SSL_ERROR": "보안 인증서에 문제가 있습니다. 서버 상태를 확인하고 자동으로 재시도합니다.",
    "DNS_ERROR": "DNS 해석에 실패했습니다. 네트워크 연결을 확인하고 자동으로 재시도합니다.",
    "NETWORK_ERROR": "네트워크 연결에 문제가 있습니다. 인터넷 상태를 확인하고 자동으로 재시도합니다.",
    "SESSION_EXPIRED": "세션이 만료되어 재로그인합니다. 자동으로 재시도합니다.",
    "RATE_LIMIT": "요청이过多하여 제한되었습니다. 잠시 대기 후 자동으로 재시도합니다.",
    "MAINTENANCE": "서버 점검이 진행 중입니다. 점검이 끝나면 자동으로 재시도합니다.",
    "LOGIN_FAILED": "로그인에 실패했습니다. 로그인 정보를 확인하고 재설정해 주세요.",
    "RESERVATION_FAILED": "예약에 실패했습니다. 직접 사이트에서 예약 상황을 확인해 보세요.",
    "UNKNOWN": "알 수 없는 에러가 발생했습니다. 자동으로 재시도합니다.",
}


class TrainAPIError(Exception):
    """기차 예매 API 관련 기본 에러."""

    def __init__(self, message: str, code: str | None = None, recoverable: bool = True):
        super().__init__(message)
        self.code = code
        self.recoverable = recoverable


class LoginError(TrainAPIError):
    """로그인 실패 에러."""

    def __init__(self, message: str = "로그인 실패"):
        super().__init__(message, code="LOGIN_FAILED", recoverable=True)


class SessionExpiredError(TrainAPIError):
    """세션 만료 에러."""

    def __init__(self, message: str = "세션이 만료되었습니다"):
        super().__init__(message, code="SESSION_EXPIRED", recoverable=True)


class SeatNotAvailableError(TrainAPIError):
    """좌석 없음 에러."""

    def __init__(self, message: str = "좌석이 없습니다"):
        super().__init__(message, code="SEAT_NOT_AVAILABLE", recoverable=True)


class TrainNotFoundError(TrainAPIError):
    """열차 없음 에러."""

    def __init__(self, message: str = "열차가 없습니다"):
        super().__init__(message, code="TRAIN_NOT_FOUND", recoverable=True)


class ReservationFailedError(TrainAPIError):
    """예약 실패 에러."""

    def __init__(self, message: str, code: str | None = None):
        super().__init__(message, code=code or "RESERVATION_FAILED", recoverable=False)


class NetworkError(TrainAPIError):
    """네트워크 관련 에러."""

    def __init__(self, message: str = "네트워크 연결 실패", sub_type: str | None = None):
        super().__init__(message, code="NETWORK_ERROR", recoverable=True)
        self.sub_type = sub_type  # timeout, connection, ssl, dns 등


class RequestTimeoutError(NetworkError):
    """요청 시간 초과 에러."""

    def __init__(self, message: str = "요청 시간이 초과되었습니다"):
        super().__init__(message, sub_type="timeout")


class ServerConnectionError(NetworkError):
    """서버 연결 실패 에러."""

    def __init__(self, message: str = "서버에 연결할 수 없습니다"):
        super().__init__(message, sub_type="connection")


class SSLVerificationError(NetworkError):
    """SSL/TLS 인증서 에러."""

    def __init__(self, message: str = "보안 연결 실패"):
        super().__init__(message, sub_type="ssl")


class DNSResolutionError(NetworkError):
    """DNS 해석 실패 에러."""

    def __init__(self, message: str = "DNS 해석 실패"):
        super().__init__(message, sub_type="dns")


class RateLimitError(TrainAPIError):
    """API rate limit 초과 에러."""

    def __init__(self, message: str = "요청이 너무 많습니다. 잠시 후 재시도하세요."):
        super().__init__(message, code="RATE_LIMIT", recoverable=True)


class SystemMaintenanceError(TrainAPIError):
    """시스템 점검 에러."""

    def __init__(self, message: str = "시스템 점검 중"):
        super().__init__(message, code="MAINTENANCE", recoverable=True)


def classify_error(error: Exception) -> tuple[str, bool]:
    """에러를 분류하여 (에러 유형, 복구 가능 여부) 반환.

    Args:
        error: 분류할 예외

    Returns:
        (에러 코드, 복구 가능 여부)
    """
    error_type = type(error).__name__.lower()
    error_msg = str(error).lower()

    # 구체적인 네트워크 예외 타입 먼저 체크
    if "timeout" in error_type or "timeout" in error_msg:
        return ("TIMEOUT_ERROR", True)
    if "ssl" in error_type or "ssl" in error_msg or "certificate" in error_msg:
        return ("SSL_ERROR", True)
    if "dns" in error_type or "name or service not known" in error_msg:
        return ("DNS_ERROR", True)
    if "connection" in error_type or "connect" in error_msg:
        return ("CONNECTION_ERROR", True)

    # 로그인 관련
    if "login" in error_msg or "로그인" in error_msg or "인증" in error_msg:
        if "만료" in error_msg or "expired" in error_msg:
            return ("SESSION_EXPIRED", True)
        return ("LOGIN_FAILED", True)

    # 좌석 없음
    if "좌석" in error_msg or "seat" in error_msg or "매진" in error_msg:
        return ("SEAT_NOT_AVAILABLE", True)

    # 열차 없음
    if "열차" in error_msg or "train" in error_msg or "결과가 없습니다" in error_msg:
        return ("TRAIN_NOT_FOUND", True)

    # 예약 실패
    if "예약" in error_msg or "reserve" in error_msg:
        return ("RESERVATION_FAILED", False)

    # Rate limit
    if "너무 많" in error_msg or "too many" in error_msg or "rate limit" in error_msg:
        return ("RATE_LIMIT", True)

    # 시스템 점검
    if "점검" in error_msg or "maintenance" in error_msg or "service unavailable" in error_msg:
        return ("MAINTENANCE", True)

    # 네트워크 (기타)
    if "timeout" in error_msg or "connection" in error_msg or "network" in error_msg:
        return ("NETWORK_ERROR", True)

    # 기본
    return ("UNKNOWN", True)


def get_recovery_suggestion(error_code: str) -> str:
    """에러 코드에 해당하는 복구 제안 반환.

    Args:
        error_code: 에러 코드

    Returns:
        복구 제안 메시지
    """
    return RECOVERY_SUGGESTIONS.get(error_code, RECOVERY_SUGGESTIONS["UNKNOWN"])
