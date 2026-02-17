import logging
from dataclasses import dataclass
from datetime import datetime

from src.core.database import Database

logger = logging.getLogger(__name__)


@dataclass
class RiskLimits:
    max_position_size_pct: float = 20.0
    max_positions: int = 5
    max_daily_loss_pct: float = 3.0
    max_total_loss_pct: float = 5.0
    stop_loss_pct: float = 5.0
    trailing_stop_pct: float | None = None
    min_order_value: float = 5000  # KRW for Upbit, USDT for Binance


class RiskManager:
    def __init__(self, db: Database, limits: RiskLimits):
        self.db = db
        self.limits = limits
        self._halted = False
        self._halt_reason = ""
        self._daily_pnl = 0.0
        self._daily_reset_date: str = ""
        self._initial_equity: float | None = None

    @property
    def is_halted(self) -> bool:
        return self._halted

    @property
    def halt_reason(self) -> str:
        return self._halt_reason

    def reset_halt(self):
        self._halted = False
        self._halt_reason = ""
        logger.info("Risk halt 해제")

    def set_initial_equity(self, equity: float):
        self._initial_equity = equity

    def check_can_trade(self) -> tuple[bool, str]:
        if self._halted:
            return False, self._halt_reason

        # 일일 리셋 확인
        today = datetime.now().strftime("%Y-%m-%d")
        if self._daily_reset_date != today:
            self._daily_pnl = 0.0
            self._daily_reset_date = today

        positions = self.db.get_positions()

        # 포지션 수 제한
        if len(positions) >= self.limits.max_positions:
            return False, f"최대 포지션 수 초과 ({len(positions)}/{self.limits.max_positions})"

        return True, ""

    def check_loss_limits(self, current_equity: float) -> tuple[bool, str]:
        if self._initial_equity is None:
            return True, ""

        total_pnl_pct = ((current_equity - self._initial_equity) / self._initial_equity) * 100

        if total_pnl_pct <= -self.limits.max_total_loss_pct:
            self._halted = True
            self._halt_reason = f"총 손실 한도 초과: {total_pnl_pct:.2f}% (한도: -{self.limits.max_total_loss_pct}%)"
            logger.warning(self._halt_reason)
            return False, self._halt_reason

        return True, ""

    def update_daily_pnl(self, pnl: float):
        today = datetime.now().strftime("%Y-%m-%d")
        if self._daily_reset_date != today:
            self._daily_pnl = 0.0
            self._daily_reset_date = today

        self._daily_pnl += pnl

        if self._initial_equity and self._initial_equity > 0:
            daily_loss_pct = (self._daily_pnl / self._initial_equity) * 100
            if daily_loss_pct <= -self.limits.max_daily_loss_pct:
                self._halted = True
                self._halt_reason = f"일일 손실 한도 초과: {daily_loss_pct:.2f}% (한도: -{self.limits.max_daily_loss_pct}%)"
                logger.warning(self._halt_reason)

    def calculate_position_size(self, available_balance: float, current_positions: int) -> float:
        if current_positions >= self.limits.max_positions:
            return 0
        max_per_position = available_balance * (self.limits.max_position_size_pct / 100)
        return max(self.limits.min_order_value, min(max_per_position, available_balance))

    def check_stop_loss(self, entry_price: float, current_price: float,
                        side: str = "long", leverage: int = 1) -> bool:
        if entry_price <= 0:
            return False
        if side == "short":
            loss_pct = ((current_price - entry_price) / entry_price) * 100
        else:
            loss_pct = ((entry_price - current_price) / entry_price) * 100
        effective_loss = loss_pct * leverage
        return effective_loss >= self.limits.stop_loss_pct

    def check_trailing_stop(self, high_price: float, current_price: float,
                            side: str = "long", leverage: int = 1) -> tuple[bool, float]:
        """Check if trailing stop is triggered.

        Returns (triggered, drop_pct) where drop_pct is the percentage drop
        from the high (for long) or rise from the low (for short).
        """
        if not self.limits.trailing_stop_pct or high_price <= 0:
            return False, 0.0

        if side == "short":
            # For shorts, high_price tracks the lowest price (best for short)
            rise_pct = ((current_price - high_price) / high_price) * 100
            effective_rise = rise_pct * leverage
            return effective_rise >= self.limits.trailing_stop_pct, rise_pct
        else:
            drop_pct = ((high_price - current_price) / high_price) * 100
            effective_drop = drop_pct * leverage
            return effective_drop >= self.limits.trailing_stop_pct, drop_pct
