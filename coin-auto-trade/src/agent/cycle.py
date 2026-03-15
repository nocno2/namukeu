"""CycleOrchestrator — 분석 사이클 메인 루프"""

import asyncio
import logging
import time
from datetime import datetime

from src.agent.agents import AgentRunner
from src.agent.context_builder import ContextBuilder
from src.agent.knowledge_base import KnowledgeBase
from src.agent.models import RiskReview, StrategyDecisions
from src.agent.scanner import MarketScanner
from src.agent.telegram import TelegramReporter
from src.core.config import Config
from src.core.database import Database
from src.services.exchange import UpbitExchange
from src.services.portfolio import PortfolioTracker

logger = logging.getLogger(__name__)


class CycleOrchestrator:
    """분석 사이클을 순서대로 실행하는 오케스트레이터.

    Phase 1: 스캐닝 (MarketScanner)
    Phase 2: 병렬 분석 (리서처 + 테크니컬)
    Phase 3: 전략 판단 (전략가 → 리스크 매니저)
    Phase 4: 거래 실행 + 보고
    """

    def __init__(
        self,
        config: Config,
        db: Database,
        exchange: UpbitExchange,
        reporter: TelegramReporter,
    ):
        self.config = config
        self.db = db
        self.exchange = exchange
        self.reporter = reporter

        self.scanner = MarketScanner(exchange)
        self.context_builder = ContextBuilder(config, db, exchange)
        self.agent_runner = AgentRunner(config, db)
        self.knowledge_base = KnowledgeBase()
        self.portfolio = PortfolioTracker(db, exchange)

        self._running = False

    @property
    def is_running(self) -> bool:
        return self._running

    async def run_cycle(self) -> dict:
        """전체 분석 사이클을 실행한다."""
        if self._running:
            logger.warning("이미 사이클이 실행 중")
            return {"error": "사이클 실행 중"}

        self._running = True
        
        # [NEW] 거래소 잔고와 로컬 DB 강제 동기화 (수동 매매 내역 반영)
        await self.portfolio.sync_from_exchange()
        
        cycle_id = datetime.now().strftime("%Y%m%d-%H%M")
        start_time = time.time()
        total_cost = 0.0

        self.db.create_agent_cycle(cycle_id)
        logger.info(f"=== 사이클 {cycle_id} 시작 ===")

        try:
            # ── Phase 1: 스캐닝 ──
            logger.info("[Phase 1] 종목 스캐닝")
            scanned = await self.scanner.scan_market(top_n=self.config.agent_scan_top_n)
            if not scanned:
                raise RuntimeError("종목 스캐닝 실패: 데이터 없음")

            # 보유 포지션 종목도 분석 대상에 추가
            positions = self.db.get_positions()
            position_tickers = {p["ticker"] for p in positions}
            scanned_tickers = {t["ticker"] for t in scanned}
            for p in positions:
                if p["ticker"] not in scanned_tickers:
                    scanned.append({
                        "ticker": p["ticker"],
                        "current_price": p.get("current_price", 0) or 0,
                        "volume_krw": 0,
                        "change_rate": 0,
                        "high": 0,
                        "low": 0,
                    })

            # ── Phase 2: 병렬 분석 (리서처 + 테크니컬) ──
            logger.info("[Phase 2] 리서처 + 테크니컬 병렬 분석")
            researcher_ctx = await self.context_builder.build_researcher_context(scanned)
            technician_ctx = await self.context_builder.build_technician_context(scanned)

            research_result, technical_result = await asyncio.gather(
                self.agent_runner.run_researcher(cycle_id, researcher_ctx),
                self.agent_runner.run_technician(cycle_id, technician_ctx),
                return_exceptions=True,
            )

            # 예외 처리
            research = research_result if not isinstance(research_result, Exception) else None
            technical = technical_result if not isinstance(technical_result, Exception) else None

            if isinstance(research_result, Exception):
                logger.error(f"리서처 에이전트 예외: {research_result}")
            if isinstance(technical_result, Exception):
                logger.error(f"테크니컬 에이전트 예외: {technical_result}")

            # 둘 다 실패하면 사이클 중단
            if research is None and technical is None:
                raise RuntimeError("리서처와 테크니컬 모두 실패")

            # ── Phase 3: 전략가 → 리스크 매니저 ──
            logger.info("[Phase 3] 전략가 판단")
            relevant_tickers = [t["ticker"] for t in scanned[:10]]
            knowledge_ctx = self.knowledge_base.get_strategist_context(relevant_tickers)

            strategist_ctx = await self.context_builder.build_strategist_context(
                research, technical, knowledge_ctx
            )
            decisions = await self.agent_runner.run_strategist(cycle_id, strategist_ctx)

            executed_trades: list[dict] = []
            risk_review: RiskReview | None = None

            if decisions and decisions.decisions:
                # 리스크 매니저 검증
                logger.info("[Phase 3] 리스크 매니저 검증")
                risk_ctx = await self.context_builder.build_risk_context(decisions)
                risk_review = await self.agent_runner.run_risk_manager(cycle_id, risk_ctx)

                # ── Phase 4: 거래 실행 ──
                logger.info("[Phase 4] 거래 실행")
                executed_trades = await self._execute_trades(
                    cycle_id, decisions, risk_review
                )
            else:
                logger.info("[Phase 3] 전략가: 거래 판단 없음 (HOLD)")

            # ── 보고 ──
            duration_ms = int((time.time() - start_time) * 1000)

            # 비용 집계
            cycle_decisions = self.db.get_cycle_decisions(cycle_id)
            total_cost = sum(d.get("cost_usd", 0) or 0 for d in cycle_decisions)

            # 리포터 에이전트로 보고서 생성 (상세 자산 현황 포함)
            report_ctx = await self.context_builder.build_report_context(
                cycle_id, research, technical, decisions, risk_review,
                executed_trades, "cycle"
            )
            report_text = await self.agent_runner.run_reporter(cycle_id, report_ctx)

            if report_text:
                await self.reporter.send_cycle_report(report_text)
                self.db.add_report("cycle", report_text, datetime.now().isoformat())
            else:
                # 리포터 실패 시 간략 요약 발송
                await self.reporter.send_cycle_summary(
                    cycle_id, decisions, risk_review,
                    executed_trades, total_cost, duration_ms
                )

            # 지식베이스 업데이트
            await self._update_knowledge(decisions, risk_review, executed_trades)

            # 사이클 완료 기록
            self.db.finish_agent_cycle(
                cycle_id,
                status="completed",
                scanned=len(scanned),
                analyzed=len(scanned),
                trades=len(executed_trades),
                cost_usd=total_cost,
                duration_ms=duration_ms,
                summary=f"거래 {len(executed_trades)}건 실행",
            )

            logger.info(
                f"=== 사이클 {cycle_id} 완료 "
                f"(거래: {len(executed_trades)}건, "
                f"비용: ${total_cost:.4f}, "
                f"소요: {duration_ms / 1000:.1f}초) ==="
            )

            return {
                "cycle_id": cycle_id,
                "scanned": len(scanned),
                "trades": len(executed_trades),
                "cost_usd": total_cost,
                "duration_ms": duration_ms,
                "status": "completed",
            }

        except Exception as e:
            duration_ms = int((time.time() - start_time) * 1000)
            error_msg = str(e)
            logger.error(f"사이클 {cycle_id} 실패: {error_msg}")

            self.db.finish_agent_cycle(
                cycle_id, status="failed", error=error_msg[:500],
                cost_usd=total_cost, duration_ms=duration_ms,
            )

            # 텔레그램 경고
            try:
                await self.reporter.send_risk_alert(
                    f"사이클 {cycle_id} 실패\n원인: {error_msg[:200]}"
                )
            except Exception:
                pass

            return {
                "cycle_id": cycle_id,
                "status": "failed",
                "error": error_msg,
                "duration_ms": duration_ms,
            }
        finally:
            self._running = False

    async def _execute_trades(
        self,
        cycle_id: str,
        decisions: StrategyDecisions,
        risk_review: RiskReview | None,
    ) -> list[dict]:
        """리스크 검증을 통과한 거래를 실행한다. Python 하드코딩 리스크 한도도 강제."""
        executed = []

        # 리스크 결정 매핑
        risk_map: dict[str, dict] = {}
        if risk_review:
            for rd in risk_review.decisions:
                risk_map[rd.ticker] = {
                    "verdict": rd.verdict,
                    "adjusted_amount": rd.adjusted_amount_krw,
                    "reason": rd.rejection_reason,
                }
            # 강제 매도 처리
            for fa in risk_review.forced_actions:
                if fa.action == "SELL":
                    sold = await self._execute_sell(cycle_id, fa.ticker, fa.reason)
                    if sold:
                        executed.append({
                            "ticker": fa.ticker,
                            "side": "sell",
                            "amount_krw": 0,
                            "reason": f"강제매도: {fa.reason}",
                        })

        # Python 하드코딩 리스크 체크
        positions = self.db.get_positions()
        cash = await self.exchange.get_balance() or 0
        positions_value = sum(
            (p.get("current_price", 0) or 0) * p.get("volume", 0)
            for p in positions
        )
        total_equity = cash + positions_value

        # 일일/총 손실 한도 체크 (Python 강제)
        snapshots = self.db.get_performance_history(limit=1)
        if snapshots and total_equity > 0:
            latest = snapshots[0]
            daily_pnl = latest.get("daily_pnl", 0) or 0
            daily_loss_pct = abs(daily_pnl / total_equity * 100) if daily_pnl < 0 else 0
            total_pnl_pct = latest.get("total_pnl_pct", 0) or 0

            if daily_loss_pct >= self.config.agent_max_daily_loss_pct:
                logger.warning(
                    f"[리스크 한도] 일일 손실 한도 도달: {daily_loss_pct:.2f}% >= {self.config.agent_max_daily_loss_pct}%"
                )
                await self.reporter.send_risk_alert(
                    f"일일 손실 한도 도달 ({daily_loss_pct:.2f}%). 금일 추가 매수 중단."
                )
                return executed  # 매수 중단

            if total_pnl_pct < 0 and abs(total_pnl_pct) >= self.config.agent_max_total_loss_pct:
                logger.warning(
                    f"[리스크 한도] 총 손실 한도 도달: {abs(total_pnl_pct):.2f}% >= {self.config.agent_max_total_loss_pct}%"
                )
                await self.reporter.send_risk_alert(
                    f"총 손실 한도 도달 ({abs(total_pnl_pct):.2f}%). 추가 매수 중단."
                )
                return executed  # 매수 중단

        # 일일 거래 횟수 체크
        today = datetime.now().strftime("%Y-%m-%d")
        today_orders = [
            o for o in self.db.get_orders(limit=100)
            if o["created_at"].startswith(today)
        ]
        today_trade_count = len(today_orders)

        for decision in decisions.decisions:
            ticker = decision.ticker
            action = decision.action
            amount_krw = decision.amount_krw

            # 리스크 매니저 판단 적용
            risk_info = risk_map.get(ticker, {})
            verdict = risk_info.get("verdict", "APPROVE")

            if verdict == "REJECT":
                logger.info(f"[거래 거부] {ticker} {action}: {risk_info.get('reason', '')}")
                self.db.add_risk_review(
                    cycle_id, ticker, action, "REJECT",
                    rejection_reason=risk_info.get("reason", ""),
                )
                continue

            if verdict == "ADJUST" and risk_info.get("adjusted_amount"):
                amount_krw = risk_info["adjusted_amount"]
                logger.info(f"[거래 수정] {ticker}: 금액 조정 → {amount_krw:,} KRW")

            self.db.add_risk_review(cycle_id, ticker, action, verdict)

            # ── Python 하드코딩 리스크 한도 ──

            # 1. 최대 동시 포지션
            if action == "BUY" and len(positions) >= self.config.agent_max_positions:
                logger.warning(f"[리스크 한도] 최대 포지션 초과: {len(positions)}/{self.config.agent_max_positions}")
                continue

            # 2. 최소 현금 비율
            if action == "BUY" and total_equity > 0:
                cash_after = cash - amount_krw
                cash_ratio_after = (cash_after / total_equity) * 100
                if cash_ratio_after < self.config.agent_min_cash_ratio:
                    max_buy = cash - (total_equity * self.config.agent_min_cash_ratio / 100)
                    if max_buy < 5000:
                        logger.warning(f"[리스크 한도] 현금 비율 부족: {cash_ratio_after:.1f}% < {self.config.agent_min_cash_ratio}%")
                        continue
                    amount_krw = int(max_buy)
                    logger.info(f"[리스크 한도] 현금 비율 유지를 위해 금액 조정: {amount_krw:,} KRW")

            # 3. 종목당 최대 배분
            if action == "BUY" and total_equity > 0:
                max_position = total_equity * self.config.agent_max_position_pct / 100
                if amount_krw > max_position:
                    amount_krw = int(max_position)
                    logger.info(f"[리스크 한도] 종목당 최대 배분 적용: {amount_krw:,} KRW")

            # 4. 일일 거래 횟수
            if today_trade_count >= self.config.agent_max_trades_per_day:
                logger.warning(f"[리스크 한도] 일일 거래 초과: {today_trade_count}/{self.config.agent_max_trades_per_day}")
                continue

            # 5. 최소 주문 금액
            if action == "BUY" and amount_krw < 5000:
                logger.info(f"[스킵] {ticker}: 주문 금액 {amount_krw:,} KRW < 최소 5,000 KRW")
                continue

            # 거래 실행
            try:
                if action == "BUY":
                    result = await self.exchange.buy_market_order(ticker, amount_krw)
                    price = await self.exchange.get_current_price(ticker) or 0
                    if isinstance(price, dict):
                        price = price.get(ticker, 0)
                    self.db.create_order(
                        ticker=ticker, side="buy", order_type="market",
                        is_dry_run=self.config.dry_run, amount_krw=amount_krw,
                        price=price, signal_reason=decision.reasoning.catalyst,
                        signal_confidence=decision.confidence,
                    )
                    
                    if price > 0:
                        fee_rate = 0.0005  # Upbit KRW market basic fee
                        volume = amount_krw * (1 - fee_rate) / float(price)
                        self.db.upsert_position(
                            ticker=ticker,
                            volume=volume,
                            avg_entry_price=float(price),
                            strategy_id=None,  # Agent cycle does not use specific strategy IDs
                            current_price=float(price),
                            exchange="upbit"
                        )

                    executed.append({
                        "ticker": ticker, "side": "buy",
                        "amount_krw": amount_krw,
                        "reason": decision.reasoning.catalyst,
                    })
                    today_trade_count += 1

                    # 텔레그램 거래 알림
                    await self.reporter.send_trade_alert(
                        ticker, "BUY", amount_krw, price if isinstance(price, (int, float)) else 0,
                        decision.confidence, decision.reasoning.catalyst,
                    )

                elif action == "SELL":
                    sold = await self._execute_sell(cycle_id, ticker, decision.reasoning.catalyst)
                    if sold:
                        executed.append({
                            "ticker": ticker, "side": "sell",
                            "amount_krw": amount_krw,
                            "reason": decision.reasoning.catalyst,
                        })
                        today_trade_count += 1

            except Exception as e:
                logger.error(f"거래 실행 실패 {ticker} {action}: {e}")

        return executed

    async def _execute_sell(self, cycle_id: str, ticker: str, reason: str) -> bool:
        """보유 포지션을 매도한다. 성공 시 True 반환."""
        positions = self.db.get_positions()
        pos = next((p for p in positions if p["ticker"] == ticker), None)
        if not pos:
            logger.warning(f"매도 대상 포지션 없음: {ticker}")
            return False

        volume = pos["volume"]

        # 실거래 모드: 실제 거래소 잔고 확인
        if not self.config.dry_run:
            # KRW-BTC → BTC
            coin = ticker.split("-")[-1] if "-" in ticker else ticker
            real_balance = await self.exchange.get_balance(coin)
            if real_balance is None or real_balance <= 0:
                logger.warning(f"매도 불가: {ticker} 실제 거래소 잔고 없음 (DB 유령 포지션 정리)")
                self.db.delete_position(ticker)
                return False

        result = await self.exchange.sell_market_order(ticker, volume)

        # 매도 결과 검증 (실거래 모드)
        if not self.config.dry_run and result is None:
            logger.error(f"매도 실패: {ticker} 거래소 주문 거부")
            return False

        price = await self.exchange.get_current_price(ticker) or 0
        if isinstance(price, dict):
            price = price.get(ticker, 0)
        amount_krw = volume * (price if isinstance(price, (int, float)) else 0)

        self.db.create_order(
            ticker=ticker, side="sell", order_type="market",
            is_dry_run=self.config.dry_run, volume=volume,
            price=price if isinstance(price, (int, float)) else 0,
            amount_krw=amount_krw, signal_reason=reason,
        )
        self.db.delete_position(ticker)

        await self.reporter.send_trade_alert(
            ticker, "SELL", int(amount_krw), price if isinstance(price, (int, float)) else 0,
            1.0, reason,
        )
        return True

    async def _update_knowledge(
        self,
        decisions: StrategyDecisions | None,
        risk_review: RiskReview | None,
        executed_trades: list[dict],
    ) -> None:
        """사이클 결과를 지식베이스에 기록한다."""
        try:
            if decisions and decisions.self_reflection:
                self.knowledge_base.record_lesson(
                    decisions.self_reflection, source="strategist"
                )

            if risk_review:
                for warning in risk_review.warnings:
                    self.knowledge_base.record_lesson(warning, source="risk_manager")

                for rd in risk_review.decisions:
                    if rd.verdict == "REJECT" and rd.rejection_reason:
                        self.knowledge_base.record_ticker_note(
                            rd.ticker,
                            f"리스크 거부: {rd.rejection_reason}"
                        )
        except Exception as e:
            logger.warning(f"지식베이스 업데이트 실패: {e}")
