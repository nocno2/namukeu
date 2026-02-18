import logging
from dataclasses import dataclass
from datetime import datetime
from typing import NamedTuple

from src.core.database import Database

logger = logging.getLogger(__name__)


class EligibilityResult(NamedTuple):
    """라이브 트레이딩 전환 가능 여부 결과"""
    eligible: bool
    can_paper_trade: bool  # 페이퍼트레이딩 가능 여부
    reasons: list[str]  # 불가능한 이유 목록


@dataclass
class TradingChecklist:
    """전환 체크리스트 조건"""
    min_backtest_return_pct: float = 0.0  # 백테스트 최소 수익률
    min_backtest_win_rate_pct: float = 50.0  # 백테스트 최소 승률
    max_backtest_drawdown_pct: float = 10.0  # 백테스트 최대 낙폭
    min_backtest_trades: int = 10  # 최소 백테스트 거래 횟수


@dataclass
class RiskLimits:
    max_position_size_pct: float = 20.0
    max_positions: int = 5
    max_daily_loss_pct: float = 3.0
    max_total_loss_pct: float = 5.0
    stop_loss_pct: float = 5.0
    trailing_stop_pct: float | None = None
    partial_profit_take_pct: float | None = None  # 부분 익절 목표 수익률 (예: 5.0 = 5%)
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

    def check_partial_profit_take(self, entry_price: float, current_price: float,
                                   side: str = "long", leverage: int = 1) -> tuple[bool, float]:
        """Check if partial profit taking target is reached.

        Returns (triggered, profit_pct) where profit_pct is the current profit percentage.
        """
        if not self.limits.partial_profit_take_pct or entry_price <= 0:
            return False, 0.0

        if side == "short":
            profit_pct = ((entry_price - current_price) / entry_price) * 100
        else:
            profit_pct = ((current_price - entry_price) / entry_price) * 100

        effective_profit = profit_pct * leverage
        triggered = effective_profit >= self.limits.partial_profit_take_pct
        return triggered, profit_pct

    def validate_trading_eligibility(
        self,
        backtest_return_pct: float,
        backtest_win_rate_pct: float,
        backtest_drawdown_pct: float,
        backtest_total_trades: int,
        checklist: TradingChecklist | None = None,
    ) -> EligibilityResult:
        """백테스트 결과를 기반으로 라이브 트레이딩 전환 가능 여부 검증.

        Args:
            backtest_return_pct: 백테스트 수익률 (%)
            backtest_win_rate_pct: 백테스트 승률 (%)
            backtest_drawdown_pct: 백테스트 최대 낙폭 (%)
            backtest_total_trades: 백테스트 총 거래 횟수
            checklist: 검증 조건 (기본값: TradingChecklist)

        Returns:
            EligibilityResult: 전환 가능 여부 및 이유
        """
        if checklist is None:
            checklist = TradingChecklist()

        reasons = []

        # 1. 최소 거래 횟수 체크
        if backtest_total_trades < checklist.min_backtest_trades:
            reasons.append(
                f"백테스트 거래 횟수 부족: {backtest_total_trades}회 < {checklist.min_backtest_trades}회"
            )

        # 2. 수익률 체크 (라이브만)
        if backtest_return_pct <= checklist.min_backtest_return_pct:
            reasons.append(
                f"백테스트 수익률 미달: {backtest_return_pct:.2f}% <= {checklist.min_backtest_return_pct}%"
            )

        # 3. 승률 체크 (라이브만)
        if backtest_win_rate_pct < checklist.min_backtest_win_rate_pct:
            reasons.append(
                f"백테스트 승률 미달: {backtest_win_rate_pct:.2f}% < {checklist.min_backtest_win_rate_pct}%"
            )

        # 4. 최대 낙폭 체크 (라이브만)
        if backtest_drawdown_pct > checklist.max_backtest_drawdown_pct:
            reasons.append(
                f"백테스트 낙폭 초과: {backtest_drawdown_pct:.2f}% > {checklist.max_backtest_drawdown_pct}%"
            )

        # 라이브 전환 가능: 거래 횟수 충족 + 모든 조건 충족
        live_eligible = (
            backtest_total_trades >= checklist.min_backtest_trades
            and backtest_return_pct > checklist.min_backtest_return_pct
            and backtest_win_rate_pct >= checklist.min_backtest_win_rate_pct
            and backtest_drawdown_pct <= checklist.max_backtest_drawdown_pct
        )

        # 페이퍼트레이딩 가능: 거래 횟수 충족만 만족
        paper_eligible = backtest_total_trades >= checklist.min_backtest_trades

        if not paper_eligible:
            reasons.append(f"페이퍼트레이딩 불가: 거래 횟수 {backtest_total_trades}회 < {checklist.min_backtest_trades}회")

        logger.info(
            f"트레이딩 전환 검증: "
            f"수익률={backtest_return_pct:.2f}%, 승률={backtest_win_rate_pct:.2f}%, "
            f"낙폭={backtest_drawdown_pct:.2f}%, 거래={backtest_total_trades}회 → "
            f"라이브={live_eligible}, 페이퍼={paper_eligible}"
        )

        return EligibilityResult(
            eligible=live_eligible,
            can_paper_trade=paper_eligible,
            reasons=reasons if reasons else ["모든 조건 충족"],
        )
