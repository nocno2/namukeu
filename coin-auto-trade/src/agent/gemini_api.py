"""Gemini API 직접 호출 래퍼 — coin-auto-trade/src/agent/gemini_api.py"""

import asyncio
import logging
import time
from typing import Callable, TypedDict

import google.generativeai as genai
from google.generativeai.types import GenerateContentResponse

logger = logging.getLogger(__name__)

# 세션(채팅 세션) 저장을 위한 딕셔너리
_chat_sessions: dict[str, genai.ChatSession] = {}


class GeminiResult(TypedDict):
    success: bool
    result: str
    session_id: str
    error: str | None
    input_tokens: int | None
    output_tokens: int | None
    duration_ms: int | None


async def call_gemini(
    prompt: str,
    session_id: str,
    api_key: str,
    is_new_session: bool = True,
    model_name: str = "gemini-3.1-pro-preview",
    timeout: int = 180,
    response_schema: type | None = None,
    use_json_mode: bool = False,
) -> GeminiResult:
    """Gemini API를 호출한다. use_json_mode가 True이면 JSON 응답을 강제한다."""
    start_time = time.time()
    
    if not api_key:
        return GeminiResult(
            success=False,
            result="",
            session_id=session_id,
            error="Gemini API Key가 설정되지 않았습니다.",
            input_tokens=None,
            output_tokens=None,
            duration_ms=None,
        )

    try:
        # API 설정
        genai.configure(api_key=api_key)
        
        # JSON 응답 설정 (요청 시에만 활성화)
        generation_config = {}
        if use_json_mode:
            generation_config["response_mime_type"] = "application/json"

        model = genai.GenerativeModel(
            model_name=model_name,
            generation_config=generation_config
        )

        # 세션 관리 (구조화된 출력 사용 시 세션 히스토리와 충돌 가능성이 있으므로 유의)
        if is_new_session or session_id not in _chat_sessions:
            chat = model.start_chat(history=[])
            _chat_sessions[session_id] = chat
        else:
            chat = _chat_sessions[session_id]

        # 비동기 호출 (SDK가 블로킹이므로 런루프에서 실행)
        loop = asyncio.get_event_loop()
        
        def _send():
            return chat.send_message(prompt)

        response: GenerateContentResponse = await asyncio.wait_for(
            loop.run_in_executor(None, _send),
            timeout=timeout
        )

        duration_ms = int((time.time() - start_time) * 1000)
        
        # 토큰 정보 추출
        usage = response.usage_metadata
        input_tokens = usage.prompt_token_count
        output_tokens = usage.candidates_token_count

        return GeminiResult(
            success=True,
            result=response.text,
            session_id=session_id,
            error=None,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            duration_ms=duration_ms,
        )

    except asyncio.TimeoutError:
        return GeminiResult(
            success=False,
            result="",
            session_id=session_id,
            error=f"Gemini API 타임아웃 ({timeout}초 초과)",
            input_tokens=None,
            output_tokens=None,
            duration_ms=None,
        )
    except Exception as e:
        logger.error(f"Gemini API 호출 실패: {e}")
        return GeminiResult(
            success=False,
            result="",
            session_id=session_id,
            error=f"Gemini API 호출 실패: {str(e)}",
            input_tokens=None,
            output_tokens=None,
            duration_ms=None,
        )
