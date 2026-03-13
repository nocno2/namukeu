"""텔레그램 보고 시스템 — TelegramReporter"""

import logging
from datetime import datetime

from src.agent.models import RiskReview, StrategyDecisions
from src.core.database import Database
from src.services.notifier import TelegramNotifier

logger = logging.getLogger(__name__)

MAX_MESSAGE_LENGTH = 4096


def _truncate(text: str, max_len: int = MAX_MESSAGE_LENGTH) -> str:
    if len(text) <= max_len:
        return text
    return text[: max_len - 20] + "\n\n...(truncated)"


class TelegramReporter:
    """텔레그램을 통한 구조화된 보고 시스템."""

    def __init__(self, notifier: TelegramNotifier, db: Database):
        self.notifier = notifier
        self.db = db

    async def send_trade_alert(
        self,
        ticker: str,
        side: str,
        amount_krw: int,
        price: float,
        confidence: float,
        reason: str,
    ) -> None:
        """매수/매도 거래 알림."""
        emoji = "🟢" if side.upper() == "BUY" else "🔴"
        action = "매수" if side.upper() == "BUY" else "매도"

        text = (
            f"{emoji} *{action} 체결*\n\n"
            f"종목: `{ticker}`\n"
            f"금액: {amount_krw:,} KRW\n"
            f"가격: {price:,.0f} KRW\n"
            f"확신도: {confidence:.0%}\n"
            f"근거: {reason}"
        )
        await self.notifier.send_message(_truncate(text))

    async def send_cycle_report(self, report_text: str) -> None:
        """사이클 완료 보고서 발송."""
        if not report_text:
            return
        text = f"📊 *사이클 분석 완료*\n\n{report_text}"
        await self.notifier.send_message(_truncate(text))

    async def send_daily_report(self, report_text: str) -> None:
        """일일 리포트 발송."""
        text = f"📈 *일일 리포트*\n\n{report_text}"
        await self.notifier.send_message(_truncate(text))
        self.db.add_report("daily", report_text, datetime.now().isoformat())

    async def send_weekly_report(self, report_text: str) -> None:
        """주간 리포트 발송."""
        text = f"📋 *주간 리포트*\n\n{report_text}"
        await self.notifier.send_message(_truncate(text))
        self.db.add_report("weekly", report_text, datetime.now().isoformat())

    async def send_risk_alert(self, warning: str) -> None:
        """리스크 경고 즉시 발송."""
        text = f"🚨 *리스크 경고*\n\n{warning}"
        await self.notifier.send_message(_truncate(text))

    async def send_cycle_summary(
        self,
        cycle_id: str,
        decisions: StrategyDecisions | None,
        risk_review: RiskReview | None,
        executed_trades: list[dict],
        total_cost_usd: float,
        duration_ms: int,
    ) -> None:
        """사이클 간략 요약 (리포터 에이전트 없이 직접 생성)."""
        now = datetime.now().strftime("%Y-%m-%d %H:%M")
        lines = [
            f"📊 *사이클 완료* ({now})",
            f"ID: `{cycle_id}`",
            "",
        ]

        if decisions:
            lines.append(f"시장 평가: {decisions.market_assessment[:100]}")
            buy_count = sum(1 for d in decisions.decisions if d.action == "BUY")
            sell_count = sum(1 for d in decisions.decisions if d.action == "SELL")
            hold_count = len(decisions.hold_positions)
            lines.append(f"판단: 매수 {buy_count} / 매도 {sell_count} / 유지 {hold_count}")
            lines.append("")

        if risk_review:
            lines.append(f"리스크 점수: {risk_review.portfolio_risk_score}/100")
            approved = sum(1 for d in risk_review.decisions if d.verdict == "APPROVE")
            rejected = sum(1 for d in risk_review.decisions if d.verdict == "REJECT")
            adjusted = sum(1 for d in risk_review.decisions if d.verdict == "ADJUST")
            lines.append(f"승인: {approved} / 수정: {adjusted} / 거부: {rejected}")
            lines.append("")

        if executed_trades:
            lines.append(f"실행된 거래: {len(executed_trades)}건")
            for t in executed_trades:
                lines.append(
                    f"  {t.get('side', '').upper()} {t.get('ticker', '')} "
                    f"{t.get('amount_krw', 0):,.0f} KRW"
                )
            lines.append("")

        lines.append(f"비용: ${total_cost_usd:.4f} / 소요시간: {duration_ms / 1000:.1f}초")

        text = "\n".join(lines)
        await self.notifier.send_message(_truncate(text))
