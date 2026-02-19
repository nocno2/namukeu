"""전환 체크리스트 검증 서비스.

라이브 트레이딩 전환 조건을 자동으로 검증:
- 백테스트 수익률 > 0
- 페이퍼 트레이딩 승률 > 50%
- 최대낙폭 < 10%
"""
from dataclasses import dataclass

from src.core.database import Database


@dataclass
class TransitionCheck:
    """전환 가능성 체크 결과."""
    can_transition: bool
    backtest_valid: bool  # 수익률 > 0
    paper_win_rate_valid: bool  # 승률 > 50%
    max_drawdown_valid: bool  # 낙폭 < 10%
    details: dict


class TransitionChecker:
    """전환 조건 검증기."""

    # 전환 조건阈值
    MIN_BACKTEST_RETURN = 0.0  # %
    MIN_PAPER_WIN_RATE = 50.0  # %
    MAX_DRAWDOWN = 10.0  # %
    MIN_TRADES = 10  # 최소 거래 횟수

    def __init__(self, db: Database):
        self.db = db

    def check(self, strategy_name: str | None = None, ticker: str | None = None) -> TransitionCheck:
        """전환 조건 체크."""
        # 1. 백테스트 수익률 검증
        backtest_valid = self._check_backtest(strategy_name, ticker)

        # 2. 페이퍼 트레이딩 승률 검증
        paper_valid, paper_stats = self._check_paper_trading(ticker)

        # 3. 최대낙폭 검증
        drawdown_valid, max_drawdown = self._check_drawdown()

        can_transition = backtest_valid and paper_valid and drawdown_valid

        return TransitionCheck(
            can_transition=can_transition,
            backtest_valid=backtest_valid,
            paper_win_rate_valid=paper_valid,
            max_drawdown_valid=drawdown_valid,
            details={
                "backtest_valid": backtest_valid,
                "paper_win_rate": paper_stats.get("win_rate", 0),
                "paper_valid": paper_valid,
                "max_drawdown_pct": max_drawdown,
                "drawdown_valid": drawdown_valid,
                "paper_stats": paper_stats,
            },
        )

    def _check_backtest(self, strategy_name: str | None = None, ticker: str | None = None) -> bool:
        """백테스트가 페이퍼 트레이딩 조건을 만족하는지 검증.

        조건: 수익률 > 0, 승률 >= 50%, 최대낙폭 <= 10%, 거래 횟수 >= 10
        """
        query = """
            SELECT MAX(total_return_pct) as max_return
            FROM backtest_results
            WHERE total_return_pct > ?
              AND win_rate >= ?
              AND max_drawdown_pct <= ?
              AND total_trades >= ?
        """
        params: list = [
            self.MIN_BACKTEST_RETURN,  # 0.0
            self.MIN_PAPER_WIN_RATE,    # 50.0
            self.MAX_DRAWDOWN,          # 10.0
            self.MIN_TRADES,            # 10
        ]

        if strategy_name:
            query += " AND strategy_name = ?"
            params.append(strategy_name)
        if ticker:
            query += " AND ticker = ?"
            params.append(ticker)

        row = self.db.conn.execute(query, params).fetchone()
        if not row or row["max_return"] is None:
            return False  # 조건을 만족하는 백테스트가 없으면 False

        return True

    def _check_paper_trading(self, ticker: str | None = None) -> tuple[bool, dict]:
        """페이퍼 트레이딩 승률 > 50% 검증."""
        stats = self.db.get_paper_trading_pnl()

        # 거래가 있어야 검증 가능
        if stats.get("completed_trades", 0) < self.MIN_TRADES:
            return False, stats

        win_rate = stats.get("win_rate", 0)
        return win_rate > self.MIN_PAPER_WIN_RATE, stats

    def _check_drawdown(self) -> tuple[bool, float]:
        """최대낙폭 < 10% 검증."""
        # performance_snapshots에서 최대 낙폭 계산 (0 equity 제외)
        rows = self.db.conn.execute("""
            SELECT total_equity FROM performance_snapshots
            WHERE total_equity > 0
            ORDER BY timestamp ASC
        """).fetchall()

        if not rows:
            # 유효한 스냅샷이 없으면 기본값 (추정)
            return True, 0.0

        peak = rows[0]["total_equity"]
        max_drawdown = 0.0

        for row in rows:
            equity = row["total_equity"]
            if equity > peak:
                peak = equity
            drawdown = ((peak - equity) / peak * 100) if peak > 0 else 0
            max_drawdown = max(max_drawdown, drawdown)

        return max_drawdown < self.MAX_DRAWDOWN, max_drawdown

    def get_readiness_report(self) -> dict:
        """준비 상태 종합 리포트."""
        # 전체 백테스트 통과 여부
        all_backtest = self.db.conn.execute("""
            SELECT COUNT(*) as total,
                   SUM(CASE WHEN total_return_pct > 0 THEN 1 ELSE 0 END) as profitable
            FROM backtest_results
        """).fetchone()

        # 페이퍼 트레이딩 전체 통계
        paper_stats = self.db.get_paper_trading_pnl()

        # 최근 스냅샷 기반 낙폭
        drawdown_valid, max_dd = self._check_drawdown()

        return {
            "backtest": {
                "total": all_backtest["total"] or 0,
                "profitable": all_backtest["profitable"] or 0,
                "profitable_rate": (all_backtest["profitable"] / all_backtest["total"] * 100)
                if all_backtest["total"] else 0,
            },
            "paper_trading": paper_stats,
            "drawdown": {
                "current_max": round(max_dd, 2),
                "valid": drawdown_valid,
                "threshold": self.MAX_DRAWDOWN,
            },
            "ready_for_live": (
                (all_backtest["profitable"] or 0) > 0
                and paper_stats.get("win_rate", 0) > self.MIN_PAPER_WIN_RATE
                and drawdown_valid
            ),
        }
