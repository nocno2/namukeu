"""에이전트 입력 컨텍스트 빌더"""

import logging
from datetime import datetime

import pandas_ta_classic as ta

from src.core.config import Config
from src.core.database import Database
from src.agent.models import ResearchReport, RiskReview, StrategyDecisions, TechnicalReport
from src.services.exchange import UpbitExchange

logger = logging.getLogger(__name__)


class ContextBuilder:
    """각 에이전트에게 전달할 텍스트 컨텍스트를 구성한다."""

    def __init__(self, config: Config, db: Database, exchange: UpbitExchange):
        self.config = config
        self.db = db
        self.exchange = exchange

    async def build_researcher_context(self, scanned_tickers: list[dict]) -> str:
        """리서처에게 전달할 시장 개요 컨텍스트."""
        now = datetime.now().strftime("%Y-%m-%d %H:%M")
        lines = [
            f"=== 시장 분석 요청 ({now}) ===",
            "",
            f"분석 대상 종목 (거래대금 상위 {len(scanned_tickers)}개):",
        ]
        for i, t in enumerate(scanned_tickers[:10], 1):
            lines.append(
                f"  {i}. {t['ticker']} — "
                f"현재가: {t['current_price']:,.0f} KRW, "
                f"거래대금: {t['volume_krw']:,.0f} KRW, "
                f"일중 변동: {t['change_rate']}%"
            )

        # 보유 포지션 정보
        positions = self.db.get_positions()
        if positions:
            lines.append("")
            lines.append("현재 보유 포지션:")
            for p in positions:
                pnl_pct = p.get("unrealized_pnl_pct", 0) or 0
                lines.append(
                    f"  - {p['ticker']}: 평단가 {p['avg_entry_price']:,.0f}, "
                    f"수량 {p['volume']:.6f}, "
                    f"평가손익 {pnl_pct:+.2f}%"
                )

        return "\n".join(lines)

    async def build_technician_context(self, tickers: list[dict]) -> str:
        """테크니컬 에이전트에게 전달할 차트+지표 컨텍스트."""
        now = datetime.now().strftime("%Y-%m-%d %H:%M")
        lines = [f"=== 기술적 분석 요청 ({now}) ===", ""]

        for t in tickers:
            ticker = t["ticker"]
            try:
                chart_text = await self._build_ticker_chart(ticker)
                if chart_text:
                    lines.append(chart_text)
                    lines.append("")
            except Exception as e:
                logger.debug(f"{ticker} 차트 빌드 실패: {e}")

        return "\n".join(lines)

    async def build_strategist_context(
        self,
        research: ResearchReport | None,
        technical: TechnicalReport | None,
        knowledge_context: str = "",
    ) -> str:
        """전략가에게 전달할 종합 컨텍스트."""
        now = datetime.now().strftime("%Y-%m-%d %H:%M")
        lines = [f"=== 전략 판단 요청 ({now}) ===", ""]

        # 리서치 보고서
        if research:
            lines.append("## 시장 리서치 보고서")
            lines.append(f"시장 심리: {research.market_sentiment}")
            if research.fear_greed_index is not None:
                lines.append(f"공포탐욕지수: {research.fear_greed_index}")
            if research.btc_dominance is not None:
                lines.append(f"BTC 도미넌스: {research.btc_dominance}%")
            lines.append(f"시장 개요: {research.market_overview}")
            if research.key_news:
                lines.append("주요 뉴스:")
                for news in research.key_news[:5]:
                    lines.append(f"  - [{news.impact}] {news.headline} ({news.source})")
            if research.macro_events:
                lines.append("거시경제 이벤트:")
                for event in research.macro_events:
                    lines.append(f"  - {event.date}: {event.event}")
            lines.append("")

        # 기술적 분석 보고서
        if technical:
            lines.append("## 기술적 분석 보고서")
            for ta_item in technical.tickers:
                lines.append(
                    f"  {ta_item.ticker}: 추세={ta_item.trend}({ta_item.trend_strength:.1f}), "
                    f"모멘텀={ta_item.momentum}, 변동성={ta_item.volatility}, "
                    f"점수={ta_item.technical_score}"
                )
                if ta_item.support_levels:
                    lines.append(f"    지지: {', '.join(f'{s:,.0f}' for s in ta_item.support_levels[:3])}")
                if ta_item.resistance_levels:
                    lines.append(f"    저항: {', '.join(f'{r:,.0f}' for r in ta_item.resistance_levels[:3])}")
            lines.append("")

        # 포트폴리오 현황
        portfolio = await self._build_portfolio_summary()
        lines.append("## 현재 포트폴리오")
        lines.append(portfolio)
        lines.append("")

        # 최근 거래 내역
        recent_orders = self.db.get_orders(limit=10)
        if recent_orders:
            lines.append("## 최근 거래 내역 (최근 10건)")
            for o in recent_orders:
                lines.append(
                    f"  {o['created_at'][:16]} {o['side'].upper()} {o['ticker']} "
                    f"{o.get('amount_krw', 0) or 0:,.0f} KRW — {o.get('signal_reason', '') or ''}"
                )
            lines.append("")

        # 지식베이스 컨텍스트
        if knowledge_context:
            lines.append("## 의사결정 지식베이스")
            lines.append(knowledge_context)
            lines.append("")

        return "\n".join(lines)

    async def build_risk_context(self, decisions: StrategyDecisions) -> str:
        """리스크 매니저에게 전달할 거래 제안 + 포트폴리오 리스크 컨텍스트."""
        lines = ["=== 리스크 검증 요청 ===", ""]

        # 거래 제안
        lines.append("## 전략가 거래 제안")
        lines.append(f"시장 평가: {decisions.market_assessment}")
        for d in decisions.decisions:
            lines.append(
                f"  - {d.ticker} {d.action} {d.amount_krw:,} KRW "
                f"(확신도: {d.confidence:.0%}, 리스크: {d.risk_level}, 긴급도: {d.urgency})"
            )
            if d.stop_loss_price:
                lines.append(f"    손절가: {d.stop_loss_price:,.0f}")
            if d.target_price:
                lines.append(f"    목표가: {d.target_price:,.0f}")
        lines.append("")

        # 포트폴리오 현황
        portfolio = await self._build_portfolio_summary()
        lines.append("## 포트폴리오 현황")
        lines.append(portfolio)
        lines.append("")

        # 일일 거래 횟수
        today = datetime.now().strftime("%Y-%m-%d")
        today_orders = [
            o for o in self.db.get_orders(limit=100)
            if o["created_at"].startswith(today)
        ]
        lines.append(f"오늘 거래 횟수: {len(today_orders)} / {self.config.agent_max_trades_per_day}")

        # 성과 스냅샷 (최근)
        snapshots = self.db.get_performance_history(limit=3)
        if snapshots:
            latest = snapshots[0]
            lines.append(f"최근 일일 손익: {latest.get('daily_pnl', 0):,.0f} KRW")
            lines.append(f"최대 낙폭: {latest.get('max_drawdown_pct', 0):.2f}%")

        # 하드코딩 리스크 제한
        lines.append("")
        lines.append("## Python 하드코딩 리스크 한도 (LLM 판단 무관 강제)")
        lines.append(f"  - 일일 최대 손실: {self.config.agent_max_daily_loss_pct}%")
        lines.append(f"  - 총 최대 손실: {self.config.agent_max_total_loss_pct}%")
        lines.append(f"  - 최대 동시 포지션: {self.config.agent_max_positions}개")
        lines.append(f"  - 최소 현금 비율: {self.config.agent_min_cash_ratio}%")
        lines.append(f"  - 포지션별 손절: {self.config.agent_stop_loss_pct}%")

        return "\n".join(lines)

    def build_report_context(
        self,
        cycle_id: str,
        research: ResearchReport | None,
        technical: TechnicalReport | None,
        decisions: StrategyDecisions | None,
        risk_review: RiskReview | None,
        executed_trades: list[dict],
        report_type: str = "cycle",
    ) -> str:
        """리포터에게 전달할 보고서 생성 컨텍스트."""
        lines = [f"=== {report_type} 보고서 작성 요청 ===", ""]
        lines.append(f"사이클 ID: {cycle_id}")
        lines.append(f"보고서 유형: {report_type}")
        lines.append("")

        if research:
            lines.append(f"시장 심리: {research.market_sentiment}")
            lines.append(f"시장 개요: {research.market_overview}")
            lines.append("")

        if decisions:
            lines.append(f"시장 평가: {decisions.market_assessment}")
            lines.append(f"거래 판단 {len(decisions.decisions)}건:")
            for d in decisions.decisions:
                lines.append(f"  - {d.ticker} {d.action} {d.amount_krw:,} KRW (확신도: {d.confidence:.0%})")
            lines.append("")

        if risk_review:
            lines.append(f"리스크 점수: {risk_review.portfolio_risk_score}/100")
            lines.append(f"리스크 평가: {risk_review.overall_assessment}")
            for rd in risk_review.decisions:
                lines.append(f"  - {rd.ticker}: {rd.verdict} {rd.risk_notes}")
            lines.append("")

        if executed_trades:
            lines.append(f"실행된 거래 {len(executed_trades)}건:")
            for t in executed_trades:
                lines.append(f"  - {t.get('side', '').upper()} {t.get('ticker', '')} {t.get('amount_krw', 0):,.0f} KRW")
            lines.append("")

        if decisions and decisions.self_reflection:
            lines.append(f"자기 반성: {decisions.self_reflection}")

        return "\n".join(lines)

    # ── 내부 헬퍼 ──

    async def _build_ticker_chart(self, ticker: str) -> str | None:
        """종목별 OHLCV + 기술지표 텍스트를 구성한다."""
        # DB에서 시간봉 데이터 조회
        df = self.db.get_ohlcv(ticker, "minute60", limit=100)
        if df.empty:
            # DB에 없으면 API에서 직접 조회
            df = await self.exchange.get_ohlcv(ticker, interval="minute60", count=100)
            if df is None or df.empty:
                return None

        lines = [f"### {ticker}"]

        # 최근 5봉 OHLCV
        recent = df.tail(5)
        lines.append("최근 5봉 (시간봉):")
        for idx, row in recent.iterrows():
            ts = str(idx)[:16]
            lines.append(
                f"  {ts} O={row['open']:,.0f} H={row['high']:,.0f} "
                f"L={row['low']:,.0f} C={row['close']:,.0f} V={row['volume']:,.1f}"
            )

        # 기술지표 계산
        try:
            rsi = ta.rsi(df["close"], length=14)
            if rsi is not None and not rsi.empty:
                lines.append(f"RSI(14): {rsi.iloc[-1]:.1f}")

            macd_df = ta.macd(df["close"])
            if macd_df is not None and not macd_df.empty:
                macd_val = macd_df.iloc[-1, 0]
                signal_val = macd_df.iloc[-1, 1]
                hist_val = macd_df.iloc[-1, 2]
                lines.append(f"MACD: {macd_val:.2f}, Signal: {signal_val:.2f}, Hist: {hist_val:.2f}")

            bb = ta.bbands(df["close"], length=20)
            if bb is not None and not bb.empty:
                upper = bb.iloc[-1, 2]
                mid = bb.iloc[-1, 1]
                lower = bb.iloc[-1, 0]
                current = df["close"].iloc[-1]
                pos = "UPPER" if current > upper else ("LOWER" if current < lower else "MIDDLE")
                lines.append(f"BB(20): 상단={upper:,.0f} 중단={mid:,.0f} 하단={lower:,.0f} 위치={pos}")

            ema20 = ta.ema(df["close"], length=20)
            ema50 = ta.ema(df["close"], length=50)
            if ema20 is not None and ema50 is not None and not ema20.empty and not ema50.empty:
                lines.append(f"EMA20: {ema20.iloc[-1]:,.0f}, EMA50: {ema50.iloc[-1]:,.0f}")
                alignment = "BULLISH" if ema20.iloc[-1] > ema50.iloc[-1] else "BEARISH"
                lines.append(f"EMA 정렬: {alignment}")
        except Exception as e:
            lines.append(f"(지표 계산 일부 실패: {e})")

        # 거래량 분석
        if len(df) >= 20:
            avg_vol = df["volume"].tail(20).mean()
            last_vol = df["volume"].iloc[-1]
            vol_ratio = last_vol / avg_vol if avg_vol > 0 else 1.0
            vol_signal = "SPIKE" if vol_ratio > 2.0 else ("INCREASING" if vol_ratio > 1.2 else "NORMAL")
            lines.append(f"거래량: 현재={last_vol:,.1f}, 20봉평균={avg_vol:,.1f}, 비율={vol_ratio:.1f}x ({vol_signal})")

        return "\n".join(lines)

    async def _build_portfolio_summary(self) -> str:
        """현재 포트폴리오 요약 텍스트."""
        positions = self.db.get_positions()
        cash = await self.exchange.get_balance() or 0

        positions_value = sum(
            (p.get("current_price", 0) or 0) * p.get("volume", 0)
            for p in positions
        )
        total = cash + positions_value
        cash_ratio = (cash / total * 100) if total > 0 else 100

        lines = [
            f"총 자산: {total:,.0f} KRW",
            f"현금: {cash:,.0f} KRW ({cash_ratio:.1f}%)",
            f"포지션 가치: {positions_value:,.0f} KRW",
            f"보유 종목 수: {len(positions)} / {self.config.agent_max_positions}",
        ]

        for p in positions:
            pnl_pct = p.get("unrealized_pnl_pct", 0) or 0
            curr = p.get("current_price", 0) or 0
            val = curr * p.get("volume", 0)
            weight = (val / total * 100) if total > 0 else 0
            lines.append(
                f"  - {p['ticker']}: {val:,.0f} KRW ({weight:.1f}%), "
                f"평단 {p['avg_entry_price']:,.0f}, 손익 {pnl_pct:+.2f}%"
            )

        return "\n".join(lines)
