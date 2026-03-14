"""리포터 에이전트 — 일일/주간 보고서 생성 오케스트레이션"""

import logging
from datetime import datetime, timedelta

from src.agent.agents import AgentRunner
from src.agent.context_builder import ContextBuilder
from src.core.database import Database

logger = logging.getLogger(__name__)


async def generate_daily_report(
    runner: AgentRunner,
    db: Database,
    context_builder: ContextBuilder,
) -> str | None:
    """일일 보고서를 Gemini 리포터 에이전트로 생성한다."""
    cycle_id = f"daily-{datetime.now().strftime('%Y%m%d')}"

    # 오늘 거래 내역
    today = datetime.now().strftime("%Y-%m-%d")
    orders = [o for o in db.get_orders(limit=100) if o["created_at"].startswith(today)]

    # 최근 사이클 결과
    cycles = db.get_recent_cycles(limit=5)

    # 성과 스냅샷
    snapshots = db.get_performance_history(limit=1)

    lines = [
        "=== 일일 보고서 작성 요청 ===",
        f"날짜: {today}",
        "",
        f"오늘 거래: {len(orders)}건",
    ]
    for o in orders:
        lines.append(f"  {o['side'].upper()} {o['ticker']} {o.get('amount_krw', 0) or 0:,.0f} KRW")

    lines.append("")
    lines.append(f"오늘 분석 사이클: {len([c for c in cycles if c['started_at'].startswith(today)])}회")

    if snapshots:
        s = snapshots[0]
        lines.append(f"총 자산: {s.get('total_equity', 0):,.0f} KRW")
        lines.append(f"일일 손익: {s.get('daily_pnl', 0):,.0f} KRW")

    context = "\n".join(lines)
    return await runner.run_reporter(cycle_id, context)


async def generate_weekly_report(
    runner: AgentRunner,
    db: Database,
    context_builder: ContextBuilder,
) -> str | None:
    """주간 보고서를 Gemini 리포터 에이전트로 생성한다."""
    cycle_id = f"weekly-{datetime.now().strftime('%Y-W%W')}"

    week_ago = (datetime.now() - timedelta(days=7)).isoformat()
    orders = [o for o in db.get_orders(limit=500) if o["created_at"] >= week_ago]
    cycles = db.get_recent_cycles(limit=50)
    week_cycles = [c for c in cycles if c["started_at"] >= week_ago]
    snapshots = db.get_performance_history(limit=7)

    lines = [
        "=== 주간 보고서 작성 요청 ===",
        f"기간: {week_ago[:10]} ~ {datetime.now().strftime('%Y-%m-%d')}",
        "",
        f"주간 거래: {len(orders)}건",
        f"분석 사이클: {len(week_cycles)}회",
    ]

    # 종목별 거래 집계
    ticker_trades: dict[str, dict] = {}
    for o in orders:
        t = o["ticker"]
        if t not in ticker_trades:
            ticker_trades[t] = {"buy": 0, "sell": 0, "total_krw": 0}
        ticker_trades[t][o["side"]] = ticker_trades[t].get(o["side"], 0) + 1
        ticker_trades[t]["total_krw"] += o.get("amount_krw", 0) or 0

    if ticker_trades:
        lines.append("")
        lines.append("종목별 거래 현황:")
        for t, info in sorted(ticker_trades.items(), key=lambda x: x[1]["total_krw"], reverse=True):
            lines.append(f"  {t}: 매수 {info['buy']}건 / 매도 {info['sell']}건, 총 {info['total_krw']:,.0f} KRW")

    if snapshots:
        lines.append("")
        latest = snapshots[0]
        oldest = snapshots[-1] if len(snapshots) > 1 else snapshots[0]
        equity_change = latest.get("total_equity", 0) - oldest.get("total_equity", 0)
        lines.append(f"현재 총 자산: {latest.get('total_equity', 0):,.0f} KRW")
        lines.append(f"주간 자산 변동: {equity_change:+,.0f} KRW")

    context = "\n".join(lines)
    return await runner.run_reporter(cycle_id, context)
