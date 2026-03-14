"""에이전트별 Claude CLI 호출 관리 — AgentRunner"""

import json
import logging
import uuid
from datetime import datetime

from src.agent.gemini_api import GeminiResult, call_gemini
from src.agent.models import (
    ResearchReport,
    RiskReview,
    StrategyDecisions,
    TechnicalReport,
)
from src.agent.prompts import (
    RESEARCHER_SYSTEM_PROMPT,
    REPORTER_SYSTEM_PROMPT,
    RISK_MANAGER_SYSTEM_PROMPT,
    STRATEGIST_SYSTEM_PROMPT,
    TECHNICIAN_SYSTEM_PROMPT,
)
from src.core.config import Config
from src.core.database import Database

logger = logging.getLogger(__name__)

# JSON 파싱 최대 재시도 횟수
MAX_PARSE_RETRIES = 1


def _extract_json(text: str) -> str:
    """텍스트에서 JSON 블록을 추출한다. ```json ... ``` 또는 { ... } 형태."""
    text = text.strip()
    # ```json ... ``` 블록 추출
    if "```json" in text:
        start = text.index("```json") + 7
        try:
            end = text.index("```", start)
            return text[start:end].strip()
        except ValueError:
            return text[start:].strip()
    if "```" in text:
        start = text.index("```") + 3
        try:
            end = text.index("```", start)
            return text[start:end].strip()
        except ValueError:
            return text[start:].strip()
    # { ... } 블록 추출
    first_brace = text.find("{")
    if first_brace >= 0:
        depth = 0
        for i in range(first_brace, len(text)):
            if text[i] == "{":
                depth += 1
            elif text[i] == "}":
                depth -= 1
                if depth == 0:
                    return text[first_brace : i + 1]
    return text


class AgentRunner:
    """에이전트별 Gemini CLI 호출을 관리한다."""

    def __init__(self, config: Config, db: Database):
        self.config = config
        self.db = db
        self._project_dir = str(__import__("pathlib").Path(__file__).parent.parent.parent)

    async def run_researcher(
        self, cycle_id: str, market_context: str
    ) -> ResearchReport | None:
        """리서처 에이전트: 웹 검색으로 시장 뉴스/이벤트를 수집한다."""
        session_id = str(uuid.uuid4())
        prompt = (
            f"{RESEARCHER_SYSTEM_PROMPT}\n\n"
            "아래 시장 현황을 참고하여 암호화폐 시장 리서치를 수행하라.\n\n"
            f"{market_context}\n\n"
            "반드시 웹 검색을 수행하여 최신 정보를 수집하라."
        )

        result = await self._call_agent(
            agent_type="researcher",
            cycle_id=cycle_id,
            session_id=session_id,
            prompt=prompt,
            model=self.config.researcher_model,
            input_summary=f"시장 컨텍스트 {len(market_context)}자",
            response_schema=ResearchReport,
        )
        if not result:
            return None

        return await self._parse_model_with_retry(
            result, ResearchReport, "researcher",
            cycle_id, session_id,
        )

    async def run_technician(
        self, cycle_id: str, chart_context: str
    ) -> TechnicalReport | None:
        """테크니컬 에이전트: 차트 데이터 기반 기술적 분석."""
        session_id = str(uuid.uuid4())
        prompt = (
            f"{TECHNICIAN_SYSTEM_PROMPT}\n\n"
            "아래 차트 데이터와 기술지표를 분석하여 각 종목의 기술적 상태를 평가하라.\n\n"
            f"{chart_context}"
        )

        result = await self._call_agent(
            agent_type="technician",
            cycle_id=cycle_id,
            session_id=session_id,
            prompt=prompt,
            model=self.config.technician_model,
            input_summary=f"차트 데이터 {len(chart_context)}자",
            response_schema=TechnicalReport,
        )
        if not result:
            return None

        return await self._parse_model_with_retry(
            result, TechnicalReport, "technician",
            cycle_id, session_id,
        )

    async def run_strategist(
        self, cycle_id: str, strategy_context: str
    ) -> StrategyDecisions | None:
        """전략가 에이전트: 리서치+테크니컬 보고서를 종합하여 거래 판단. 연속 세션 지원."""
        # 전략가는 연속 세션으로 이전 판단을 기억한다
        existing = self.db.get_active_session("strategist")
        if existing:
            session_id = existing["session_id"]
            is_new = False
        else:
            session_id = str(uuid.uuid4())
            is_new = True

        system_instructions = STRATEGIST_SYSTEM_PROMPT.format(
            max_positions=self.config.agent_max_positions,
            max_position_pct=self.config.agent_max_position_pct,
            min_cash_ratio=self.config.agent_min_cash_ratio,
            max_trades_per_day=self.config.agent_max_trades_per_day,
        )

        prompt = (
            f"{system_instructions if is_new else ''}\n\n"
            "아래 분석 결과를 종합하여 거래 판단을 내려라.\n\n"
            f"{strategy_context}"
        )

        result = await self._call_agent(
            agent_type="strategist",
            cycle_id=cycle_id,
            session_id=session_id,
            prompt=prompt,
            is_new_session=is_new,
            model=self.config.strategist_model,
            input_summary=f"전략 컨텍스트 {len(strategy_context)}자",
            response_schema=StrategyDecisions,
        )
        if not result:
            return None

        # 세션 기록
        self.db.upsert_agent_session("strategist", result.get("session_id") or session_id)

        return await self._parse_model_with_retry(
            result, StrategyDecisions, "strategist",
            cycle_id, session_id,
        )

    async def run_risk_manager(
        self, cycle_id: str, risk_context: str
    ) -> RiskReview | None:
        """리스크 매니저: 거래 제안을 검증하고 APPROVE/ADJUST/REJECT."""
        session_id = str(uuid.uuid4())
        prompt = (
            f"{RISK_MANAGER_SYSTEM_PROMPT}\n\n"
            "아래 거래 제안과 포트폴리오 상태를 검증하라.\n\n"
            f"{risk_context}"
        )

        result = await self._call_agent(
            agent_type="risk_manager",
            cycle_id=cycle_id,
            session_id=session_id,
            prompt=prompt,
            model=self.config.risk_manager_model,
            input_summary=f"리스크 컨텍스트 {len(risk_context)}자",
            response_schema=RiskReview,
        )
        if not result:
            return None

        return await self._parse_model_with_retry(
            result, RiskReview, "risk_manager",
            cycle_id, session_id,
        )

    async def run_reporter(
        self, cycle_id: str, report_context: str
    ) -> str | None:
        """리포터 에이전트: 텔레그램용 보고서 생성. 텍스트 반환."""
        session_id = str(uuid.uuid4())
        prompt = (
            f"{REPORTER_SYSTEM_PROMPT}\n\n"
            "아래 사이클 결과를 기반으로 텔레그램 보고서를 작성하라.\n\n"
            f"{report_context}"
        )

        result = await self._call_agent(
            agent_type="reporter",
            cycle_id=cycle_id,
            session_id=session_id,
            prompt=prompt,
            model=self.config.reporter_model,
            input_summary=f"보고서 컨텍스트 {len(report_context)}자",
        )
        if not result:
            return None

        return result.get("text", "")

    # ── 내부 헬퍼 ──

    async def _call_agent(
        self,
        agent_type: str,
        cycle_id: str,
        session_id: str,
        prompt: str,
        is_new_session: bool = True,
        model: str | None = None,
        input_summary: str | None = None,
        response_schema: type | None = None,
    ) -> dict | None:
        """Gemini API를 호출하고 결과를 DB에 기록한다."""
        agent_model = model or self.config.strategist_model # Fallback
        
        # 프롬프트에 JSON 스키마 요구사항 명시 (Structured Output 대체)
        if response_schema:
            schema_json = json.dumps(response_schema.model_json_schema(), indent=2, ensure_ascii=False)
            prompt += f"\n\n반드시 아래 JSON 스키마 형식을 엄격히 지켜서 답변하라. 다른 설명 없이 순수 JSON만 출력하라:\n{schema_json}"

        logger.info(f"[{agent_type}] Gemini API 호출 시작 (model={agent_model})")

        cli_result: GeminiResult = await call_gemini(
            prompt=prompt,
            session_id=session_id,
            api_key=self.config.gemini_api_key,
            is_new_session=is_new_session,
            model_name=agent_model,
            timeout=self.config.agent_cycle_timeout,
            response_schema=None, 
            use_json_mode=True if response_schema else False, # 스키마 있을 때만 JSON 모드 활성화
        )

        if not cli_result["success"]:
            logger.error(f"[{agent_type}] Gemini API 실패: {cli_result.get('error', 'unknown')}")
            # 실패도 기록
            self.db.add_agent_decision(
                cycle_id=cycle_id,
                agent_type=agent_type,
                output_json=json.dumps({"error": cli_result.get("error", "unknown")}),
                session_id=session_id,
                input_summary=input_summary,
                duration_ms=cli_result.get("duration_ms"),
            )
            return None

        text = cli_result["result"]
        tokens_info = f"in={cli_result.get('input_tokens', 0)}, out={cli_result.get('output_tokens', 0)}"
        logger.info(
            f"[{agent_type}] 완료 ({tokens_info}, duration={cli_result.get('duration_ms', 0) or 0}ms)"
        )

        # DB 기록
        self.db.add_agent_decision(
            cycle_id=cycle_id,
            agent_type=agent_type,
            output_json=text[:10000],
            session_id=cli_result.get("session_id") or session_id,
            input_summary=input_summary,
            cost_usd=0, # Gemini API에서 비용 정보는 토큰으로 대체
            duration_ms=cli_result.get("duration_ms"),
        )

        return {
            "text": text,
            "session_id": cli_result.get("session_id") or session_id,
            "input_tokens": cli_result.get("input_tokens"),
            "output_tokens": cli_result.get("output_tokens"),
            "duration_ms": cli_result.get("duration_ms"),
        }

    async def _parse_model_with_retry(
        self, result: dict, model_class: type, agent_type: str,
        cycle_id: str, session_id: str,
    ):
        """JSON 결과를 Pydantic 모델로 파싱한다. 실패 시 재시도."""
        text = result.get("text", "")
        try:
            json_str = _extract_json(text)
            data = json.loads(json_str)
            return model_class.model_validate(data)
        except Exception as e:
            logger.warning(f"[{agent_type}] JSON 파싱 실패 (재시도 예정): {e}")

            if MAX_PARSE_RETRIES > 0:
                retry_result = await self._call_agent(
                    agent_type=agent_type,
                    cycle_id=cycle_id,
                    session_id=session_id,
                    prompt="이전 응답이 올바른 JSON 형식이 아니었다. 다른 텍스트 없이 순수 JSON만 다시 출력하라. (예: ```json ... ```)",
                    is_new_session=False,
                    input_summary="JSON 재시도",
                )
                if retry_result:
                    try:
                        json_str = _extract_json(retry_result.get("text", ""))
                        data = json.loads(json_str)
                        return model_class.model_validate(data)
                    except Exception as e2:
                        logger.error(f"[{agent_type}] JSON 재시도도 실패: {e2}")

            logger.error(f"[{agent_type}] JSON 파싱 최종 실패\n원문 (앞 500자): {text[:500]}")
            return None

    def _parse_model(self, result: dict, model_class: type, agent_type: str):
        """JSON 결과를 Pydantic 모델로 파싱한다 (동기 버전, fallback)."""
        text = result.get("text", "")
        try:
            json_str = _extract_json(text)
            data = json.loads(json_str)
            return model_class.model_validate(data)
        except Exception as e:
            logger.error(f"[{agent_type}] JSON 파싱 실패: {e}\n원문 (앞 500자): {text[:500]}")
            return None
