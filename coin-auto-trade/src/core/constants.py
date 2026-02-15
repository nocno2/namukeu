from enum import Enum


class OrderSide(str, Enum):
    BUY = "buy"
    SELL = "sell"


class OrderType(str, Enum):
    MARKET = "market"
    LIMIT = "limit"


class OrderState(str, Enum):
    PENDING = "pending"
    DONE = "done"
    CANCELLED = "cancelled"


class StrategyStatus(str, Enum):
    ENABLED = "enabled"
    DISABLED = "disabled"


class TradingMode(str, Enum):
    DRY_RUN = "dry_run"
    LIVE = "live"


# Upbit 수수료율 (0.05%)
UPBIT_FEE_RATE = 0.0005

# Upbit 최소 주문 금액 (KRW)
UPBIT_MIN_ORDER_KRW = 5000

# Upbit API 호출 제한
UPBIT_QUOTATION_RATE_LIMIT = 9   # 호가 API: 초당 최대 9회
UPBIT_ORDER_RATE_LIMIT = 8       # 주문 API: 초당 최대 8회
