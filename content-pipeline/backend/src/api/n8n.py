"""
n8n 연동용 API 엔드포인트.

외부 LLM API 키 없이 로컬 Claude CLI를 호출하는 FastAPI 서버.
"""
import asyncio
import json
import logging
import os
import re
import time

import httpx

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from src.config import Config
from src.pipeline.generator import ARTICLE_PROMPT, META_PROMPT, OUTLINE_PROMPT
from src.pipeline.publisher import create_draft_in_blog
from src.pipeline.reviewer import ai_review, calculate_readability, calculate_seo_score

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/n8n", tags=["n8n"])


# --- Dependency ---


def get_config() -> Config:
    """Dependency injection for Config (overridden in main.py)."""
    raise NotImplementedError


# --- Pydantic Models ---


class DiscoverKeywordsResponse(BaseModel):
    keyword: str
    reason: str
    search_volume: str
    competition: str


class EnrichKeywordRequest(BaseModel):
    keyword: str = Field(..., min_length=1, max_length=200, description="블로그 키워드")


class EnrichKeywordResponse(BaseModel):
    keyword: str
    context: str
    trend_data: dict
    search_insights: list[str]
    reasoning: str


class EnrichContextRequest(BaseModel):
    context: str = Field(..., min_length=10, max_length=5000, description="아이디어/컨텍스트")


class EnrichContextResponse(BaseModel):
    keywords: list[str]
    selected_keyword: str
    context: str
    trend_data: dict
    search_insights: list[str]
    reasoning: str


class GenerateRequest(BaseModel):
    keyword: str = Field(..., min_length=1, max_length=200, description="블로그 키워드")
    direction: str | None = Field(None, max_length=2000, description="창작 방향 (선택)")
    trend_data: dict | None = Field(None, description="트렌드 데이터 (선택)")
    search_insights: list[str] | None = Field(None, description="웹검색 인사이트 (선택)")


class GenerateResponse(BaseModel):
    title: str
    slug: str
    content: str
    excerpt: str
    outline: str
    tags: list[str]
    keyword: str


class ReviewRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    content: str = Field(..., min_length=100)
    keyword: str = Field(..., min_length=1, max_length=200)


class ReviewResponse(BaseModel):
    seo: dict
    readability: dict
    ai_review: dict | None = None


class ReviseRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    content: str = Field(..., min_length=100)
    keyword: str = Field(..., min_length=1, max_length=200)
    feedback: str | None = Field(None, max_length=3000, description="첨삭 방향 (선택)")


class ReviseResponse(BaseModel):
    revised_content: str
    changes_summary: str


class GenerateImagesRequest(BaseModel):
    content: str = Field(..., min_length=100, description="본문 마크다운")
    title: str = Field(..., min_length=1, max_length=200, description="글 제목")
    count: int = Field(3, ge=1, le=5, description="생성할 이미지 개수")


class GenerateImagesResponse(BaseModel):
    content_with_images: str
    image_prompts: list[str]
    image_count: int


class SaveDraftRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    slug: str = Field(..., min_length=1, max_length=100)
    content: str = Field(..., min_length=100)
    excerpt: str = Field(..., max_length=500)
    keyword: str = Field(..., min_length=1, max_length=200)
    tags: list[str] = Field(default_factory=list)
    outline: str | None = None


class SaveDraftResponse(BaseModel):
    draft_id: int
    status: str
    message: str


# --- Helper Functions ---


async def _run_claude_cli(prompt: str) -> str:
    """Run claude CLI with --print mode."""
    import os

    # Copy current environment and remove CLAUDECODE to avoid nested session error
    env = os.environ.copy()
    env.pop("CLAUDECODE", None)

    proc = await asyncio.create_subprocess_exec(
        "claude", "--print", "--dangerously-skip-permissions", prompt,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        env=env,
    )
    stdout, stderr = await proc.communicate()

    stdout_text = stdout.decode().strip()
    stderr_text = stderr.decode().strip()

    if proc.returncode != 0:
        logger.error(f"claude CLI failed (code {proc.returncode})")
        logger.error(f"stdout: {stdout_text}")
        logger.error(f"stderr: {stderr_text}")
        raise RuntimeError(f"claude CLI failed (code {proc.returncode}): stdout={stdout_text[:200]}, stderr={stderr_text[:200]}")

    return stdout_text


# --- API Endpoints ---


@router.post("/discover-keywords", response_model=DiscoverKeywordsResponse)
async def discover_keywords(config: Config = Depends(get_config)):
    """
    트렌드 분석을 통해 블로그에 적합한 키워드를 자동으로 발굴.

    - 크론잡 트리거에서 사용
    - 다양한 소스(Google Trends, Reddit, Naver News 등)에서 키워드 수집
    - 관련 검색어(Rising Queries) 분석
    - 블로그 주제와 관련성, 검색량, 경쟁도 분석
    - 가장 유망한 키워드 1개 추천
    """
    try:
        from src.pipeline.keyword import (
            collect_keywords,
            collect_google_trends,
            collect_google_related_queries,
            collect_reddit_trends,
            collect_naver_news_trends,
            collect_naver_realtime_keywords,
            collect_daum_realtime_keywords,
        )

        # Check if ai-blog DB exists to filter out already published keywords
        blog_db_path = config.blog_db_path if hasattr(config, 'blog_db_path') else None
        published_keywords = []

        if blog_db_path:
            try:
                import sqlite3
                conn = sqlite3.connect(blog_db_path)
                cursor = conn.execute("SELECT keyword FROM posts WHERE status != 'draft'")
                published_keywords = [row[0] for row in cursor.fetchall()]
                conn.close()
            except Exception as e:
                logger.warning(f"Could not load published keywords: {e}")

        # Collect keywords from multiple sources
        all_keywords = await collect_google_trends()
        logger.info(f"[discover-keywords] Collected {len(all_keywords)} Google Trends keywords")

        # Google Trends가 비어있으면 대안 소스 사용
        if not all_keywords:
            # Naver/Daum 실시간 검색어
            naver_realtime = await collect_naver_realtime_keywords()
            all_keywords.extend(naver_realtime)
            logger.info(f"[discover-keywords] Collected {len(naver_realtime)} Naver realtime keywords")

            daum_realtime = await collect_daum_realtime_keywords()
            all_keywords.extend(daum_realtime)
            logger.info(f"[discover-keywords] Collected {len(daum_realtime)} Daum realtime keywords")

        # Collect related queries from top keywords
        top_keywords = [kw["keyword"] for kw in all_keywords[:10]]
        if top_keywords:
            related = await collect_google_related_queries(top_keywords)
            all_keywords.extend(related)
            logger.info(f"[discover-keywords] Collected {len(related)} related queries")

        # Collect Reddit trends
        reddit_kws = await collect_reddit_trends()
        all_keywords.extend(reddit_kws)
        logger.info(f"[discover-keywords] Collected {len(reddit_kws)} Reddit keywords")

        # Collect Naver News
        naver_news = await collect_naver_news_trends()
        all_keywords.extend(naver_news)
        logger.info(f"[discover-keywords] Collected {len(naver_news)} Naver News keywords")

        # Format keyword list for prompt
        keyword_list = []
        seen = set()

        for kw in all_keywords:
            k = kw.get("keyword", "")
            if k and k not in seen and len(k) > 2:
                # Filter out already published
                if published_keywords and any(pub in k or k in pub for pub in published_keywords):
                    continue

                source = kw.get("source", "unknown")
                kw_type = kw.get("type", "")
                keyword_list.append(f"- {k} [{source}{' - ' + kw_type if kw_type else ''}]")
                seen.add(k)

                if len(keyword_list) >= 50:  # Limit to 50 keywords for prompt
                    break

        keywords_str = "\n".join(keyword_list) if keyword_list else "웹검색을 통해 트렌드 분석"

        published_str = ""
        if published_keywords:
            published_str = f"\n\n## 이미 작성한 키워드 (제외)\n{', '.join(published_keywords[:20])}"

        prompt = f"""당신은 블로그 콘텐츠 기획 전문가입니다.
다음 다양한 소스에서 수집한 트렌드 키워드를 분석하고, 블로그 글로 작성하기 가장 적합한 키워드 1개를 추천해주세요.

## 수집된 트렌드 키워드
{keywords_str}{published_str}

## 분석 기준
1. 여러 소스에서 공통으로 등장하거나 Rising(급상승) 표시된 키워드 우선
2. 블로그 글 형식으로 작성 가능한 주제 (뉴스, 이슈, 가이드, 리뷰, 튜토리얼 등)
3. 너무 전문적이거나 일시적 이슈가 아닌, 지속 관심을 받을 주제
4. 검색량 대비 경쟁이 낮은 롱테일 키워드 우선
5. 기술, 금융, 트렌드, 라이프스타일 등 다양한 주제 포함

## 출력 형식 (JSON만)
{{
  "keyword": "추천 키워드 (2-6단어)",
  "reason": "이 키워드를 추천하는 이유 (1-2문장)",
  "search_volume": "높음/보통/낮음 중 하나",
  "competition": "높음/보통/낮음 중 하나"
}}

다양한 소스의 키워드를 복합적으로 분석하고, 웹검색으로 최신 트렌드를 확인하여 가장 유망한 키워드를 추천하세요."""

        logger.info("[n8n/discover-keywords] Discovering trending keywords")
        result_text = await _run_claude_cli(prompt)

        # Parse JSON
        json_match = re.search(r"\{[\s\S]*\}", result_text)
        if not json_match:
            raise ValueError("No JSON found in response")

        result = json.loads(json_match.group())

        return DiscoverKeywordsResponse(
            keyword=result.get("keyword", ""),
            reason=result.get("reason", ""),
            search_volume=result.get("search_volume", "보통"),
            competition=result.get("competition", "보통"),
        )

    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        logger.error(f"[n8n/discover-keywords] Failed: {e}")
        raise HTTPException(status_code=500, detail="Keyword discovery failed")


@router.post("/enrich-keyword", response_model=EnrichKeywordResponse)
async def enrich_keyword(body: EnrichKeywordRequest):
    """
    키워드를 웹검색 + 트렌드 분석으로 풍부한 컨텍스트로 확장.

    - 키워드만 있을 때 사용
    - 웹검색으로 최신 정보 수집
    - 트렌드 분석으로 검색량/관련 키워드 확인
    - 창작 방향을 구체적으로 제시
    """
    try:
        prompt = f"""당신은 블로그 기획 전문가입니다.
다음 키워드를 웹검색과 트렌드 분석을 통해 풍부한 블로그 창작 방향으로 확장해주세요.

키워드: {body.keyword}

## 작업
1. 이 키워드와 관련된 최신 정보를 웹에서 검색
2. 현재 검색 트렌드, 관련 검색어 분석
3. 블로그 글로 어떻게 풀어낼지 구체적인 창작 방향 제시
4. 독자가 흥미를 느낄 만한 앵글, 비유, 스토리텔링 방향 제안

## 출력 형식 (JSON만)
{{
  "context": "확장된 창작 방향 (100-300자). 웹검색 결과와 트렌드를 반영한 구체적인 아이디어",
  "trend_data": {{
    "search_volume": "급상승/보통/낮음 중 하나",
    "related_keywords": ["관련 검색어1", "관련 검색어2", "관련 검색어3"],
    "trending": true/false
  }},
  "search_insights": [
    "웹검색에서 발견한 핵심 인사이트 1",
    "웹검색에서 발견한 핵심 인사이트 2",
    "웹검색에서 발견한 핵심 인사이트 3"
  ],
  "reasoning": "이 창작 방향을 제안한 이유 (1-2문장)"
}}

웹검색 기능을 적극 활용하여 최신 정보를 반영하세요."""

        logger.info(f"[n8n/enrich-keyword] Enriching keyword: {body.keyword}")
        result_text = await _run_claude_cli(prompt)

        # Parse JSON
        json_match = re.search(r"\{[\s\S]*\}", result_text)
        if not json_match:
            raise ValueError("No JSON found in response")

        result = json.loads(json_match.group())

        return EnrichKeywordResponse(
            keyword=body.keyword,
            context=result.get("context", ""),
            trend_data=result.get("trend_data", {}),
            search_insights=result.get("search_insights", []),
            reasoning=result.get("reasoning", ""),
        )

    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        logger.error(f"[n8n/enrich-keyword] Failed: {e}")
        raise HTTPException(status_code=500, detail="Keyword enrichment failed")


@router.post("/enrich-context", response_model=EnrichContextResponse)
async def enrich_context(body: EnrichContextRequest):
    """
    아이디어 컨텍스트에서 키워드 추출 + 웹검색 + 트렌드 분석.

    - 아이디어/컨텍스트가 있을 때 사용
    - 키워드 추출하되 원본 컨텍스트 유지
    - 웹검색과 트렌드로 컨텍스트 보강
    """
    try:
        prompt = f"""당신은 블로그 기획 전문가입니다.
다음 아이디어/컨텍스트를 분석하여 SEO 친화적 키워드를 추출하고, 웹검색과 트렌드 분석으로 컨텍스트를 풍부하게 만들어주세요.

## 입력 컨텍스트
{body.context}

## 작업
1. 이 컨텍스트에서 블로그 글로 작성하기 좋은 키워드 3개 추출
2. 키워드와 관련된 최신 정보를 웹에서 검색
3. 현재 검색 트렌드, 관련 검색어 분석
4. 원본 아이디어를 유지하면서 웹검색 결과와 트렌드를 결합한 창작 방향 제시

## 출력 형식 (JSON만)
{{
  "keywords": ["키워드1", "키워드2", "키워드3"],
  "selected_keyword": "가장 적합한 키워드 1개",
  "context": "원본 아이디어 + 웹검색 결과 + 트렌드 분석을 결합한 풍부한 창작 방향 (200-400자)",
  "trend_data": {{
    "search_volume": "급상승/보통/낮음 중 하나",
    "related_keywords": ["관련 검색어1", "관련 검색어2", "관련 검색어3"],
    "trending": true/false
  }},
  "search_insights": [
    "웹검색에서 발견한 핵심 인사이트 1",
    "웹검색에서 발견한 핵심 인사이트 2",
    "웹검색에서 발견한 핵심 인사이트 3"
  ],
  "reasoning": "이 키워드와 창작 방향을 제안한 이유 (1-2문장)"
}}

웹검색 기능을 적극 활용하여 최신 정보를 반영하세요."""

        logger.info(f"[n8n/enrich-context] Enriching context ({len(body.context)} chars)")
        result_text = await _run_claude_cli(prompt)

        # Parse JSON
        json_match = re.search(r"\{[\s\S]*\}", result_text)
        if not json_match:
            raise ValueError("No JSON found in response")

        result = json.loads(json_match.group())

        return EnrichContextResponse(
            keywords=result.get("keywords", []),
            selected_keyword=result.get("selected_keyword", ""),
            context=result.get("context", ""),
            trend_data=result.get("trend_data", {}),
            search_insights=result.get("search_insights", []),
            reasoning=result.get("reasoning", ""),
        )

    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        logger.error(f"[n8n/enrich-context] Failed: {e}")
        raise HTTPException(status_code=500, detail="Context enrichment failed")


@router.post("/generate", response_model=GenerateResponse)
async def generate_content(body: GenerateRequest):
    """
    블로그 글 초안 생성.

    - 키워드를 기반으로 아웃라인 → 본문 → 메타데이터 생성
    - direction이 주어지면 창작 방향에 맞춰 생성
    """
    try:
        keyword = body.keyword
        direction = body.direction or ""

        # Build context from enrich data
        context_parts = []
        if direction:
            context_parts.append(f"## 창작 방향\n{direction}")

        if body.search_insights:
            insights = "\n".join(f"- {insight}" for insight in body.search_insights)
            context_parts.append(f"## 웹검색 인사이트\n{insights}")

        if body.trend_data:
            trend_info = f"검색량: {body.trend_data.get('search_volume', '보통')}"
            if body.trend_data.get('related_keywords'):
                trend_info += f"\n관련 키워드: {', '.join(body.trend_data['related_keywords'][:5])}"
            context_parts.append(f"## 트렌드 정보\n{trend_info}")

        context_block = "\n\n".join(context_parts) if context_parts else ""

        # Step 1: Generate outline
        logger.info(f"[n8n/generate] Generating outline for: {keyword}")
        outline_prompt = OUTLINE_PROMPT.format(keyword=keyword)
        if context_block:
            outline_prompt += f"\n\n{context_block}"
        outline = await _run_claude_cli(outline_prompt)

        # Extract title from outline
        title = keyword
        for line in outline.split("\n"):
            line = line.strip()
            if line.startswith("# "):
                title = line.lstrip("# ").strip()
                break
            if line.startswith("제목") or line.startswith("**제목"):
                title = re.sub(r"^[*#\s]*제목[:\s]*[*]*\s*", "", line).strip().strip("*")
                break

        # Step 2: Generate full article
        logger.info(f"[n8n/generate] Generating article: {title}")
        direction_block = context_block if context_block else ""
        content = await _run_claude_cli(ARTICLE_PROMPT.format(
            keyword=keyword,
            title=title,
            outline=outline,
            direction_block=direction_block,
        ))

        # Step 3: Generate metadata
        logger.info("[n8n/generate] Generating metadata")
        meta_text = await _run_claude_cli(META_PROMPT.format(
            title=title,
            content_preview=content[:2000],
        ))

        # Parse meta JSON
        slug = keyword.lower().replace(" ", "-")[:50]
        excerpt = ""
        tags: list[str] = []
        try:
            meta_match = re.search(r"\{.*\}", meta_text, re.DOTALL)
            if meta_match:
                meta = json.loads(meta_match.group())
                slug = meta.get("slug", slug)
                excerpt = meta.get("excerpt", "")
                tags = meta.get("tags", [])
        except Exception as e:
            logger.warning(f"[n8n/generate] Meta parsing failed: {e}")

        return GenerateResponse(
            keyword=keyword,
            title=title,
            slug=slug,
            content=content,
            excerpt=excerpt,
            outline=outline,
            tags=tags,
        )

    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        logger.error(f"[n8n/generate] Unexpected error: {e}")
        raise HTTPException(status_code=500, detail="Generation failed")


@router.post("/review", response_model=ReviewResponse)
async def review_content(body: ReviewRequest):
    """
    블로그 글 검토.

    - 룰 기반 SEO/가독성 점수 계산
    - AI 기반 콘텐츠 품질 리뷰
    """
    try:
        seo = calculate_seo_score(body.title, body.content, body.keyword)
        readability = calculate_readability(body.content)

        # AI content review
        ai_feedback = await ai_review(body.title, body.content, body.keyword)

        return ReviewResponse(
            seo=seo,
            readability=readability,
            ai_review=ai_feedback,
        )

    except Exception as e:
        logger.error(f"[n8n/review] Failed: {e}")
        raise HTTPException(status_code=500, detail="Review failed")


@router.post("/revise", response_model=ReviseResponse)
async def revise_content(body: ReviseRequest):
    """
    블로그 글 첨삭.

    - 기존 글을 받아 개선된 버전으로 재작성
    - feedback이 주어지면 특정 방향으로 첨삭
    """
    try:
        feedback_block = ""
        if body.feedback:
            feedback_block = f"\n\n## 첨삭 방향 (반드시 반영)\n{body.feedback}"

        revise_prompt = f"""당신은 전문 한국어 블로그 에디터입니다.
아래 글을 첨삭해주세요.

키워드: {body.keyword}
제목: {body.title}

## 원본 글
{body.content}

{feedback_block}

## 첨삭 요구사항
- 한국어, ~다/~거든/~인 거다 스타일의 반말체
- 마크다운 형식 유지 (H2, H3 헤딩 사용)
- SEO 최적화 (키워드 자연스럽게 배치, 2-3% 밀도)
- 전문성 강화 (구체적 수치/데이터 추가, 애매한 표현 제거)
- 가독성 향상 (각 단락 3-5문장, 문장 길이 적절하게)
- 개인 경험/의견은 `>` 인용블록으로 삽입
- **이미지 마크다운(`![alt](url)`)은 절대 삭제하지 말고 원래 위치 그대로 유지**

## 중요: 출력 형식
**절대로 다음과 같은 메타 설명을 포함하지 마세요:**
❌ "조치가 완료되었습니다"
❌ "요구사항을 반영해서 첨삭했습니다"
❌ "다음과 같이 수정했습니다"
❌ "첨삭 결과입니다"

**첨삭된 블로그 글 본문만 출력하세요.**
제목(H1)은 포함하지 말고, 서론의 첫 문장부터 바로 시작하세요.
마크다운 형식의 본문만 출력하고, 그 외 어떤 설명도 추가하지 마세요."""

        logger.info(f"[n8n/revise] Revising: {body.title}")
        revised_content = await _run_claude_cli(revise_prompt)

        # Generate change summary
        summary_prompt = f"""다음 원본 글과 첨삭된 글을 비교하고, 주요 변경 사항을 3-5개 항목으로 요약해주세요.

## 원본
{body.content[:1000]}...

## 첨삭본
{revised_content[:1000]}...

한국어로, 간결한 불릿 포인트로 응답하세요:
- 첫 번째 주요 변경
- 두 번째 주요 변경
..."""

        changes_summary = await _run_claude_cli(summary_prompt)

        return ReviseResponse(
            revised_content=revised_content,
            changes_summary=changes_summary,
        )

    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        logger.error(f"[n8n/revise] Failed: {e}")
        raise HTTPException(status_code=500, detail="Revision failed")


@router.post("/generate-images", response_model=GenerateImagesResponse)
async def generate_images(body: GenerateImagesRequest):
    """
    블로그 글에 이미지 삽입 위치 및 프롬프트 생성.

    - 본문을 분석해 이미지가 들어갈 적절한 위치 선정
    - 각 위치에 맞는 이미지 생성 프롬프트 작성
    - 마크다운에 `![alt](placeholder)` 형태로 삽입
    """
    try:
        prompt = f"""당신은 블로그 콘텐츠 에디터입니다.
다음 블로그 글에 이미지를 {body.count}개 삽입하려고 합니다.

제목: {body.title}

본문:
{body.content}

## 작업
1. 이미지가 들어가면 좋을 위치 {body.count}곳 선정 (각 섹션에 고르게 분산)
2. 각 위치에 맞는 이미지 생성 프롬프트 작성 (영문, DALL-E/Midjourney용)
3. 본문에 `![{{alt_text}}](image_{{n}}.png)` 형태로 삽입

## 출력 형식 (JSON만)
{{
  "content_with_images": "이미지 마크다운이 삽입된 전체 본문",
  "image_prompts": [
    "A modern minimalist illustration of...",
    "Photorealistic image of..."
  ]
}}

- alt_text는 한국어로 작성
- 이미지 프롬프트는 영문, 구체적이고 상세하게
- content_with_images는 원본 본문에 이미지만 추가 (텍스트 수정 금지)"""

        logger.info(f"[n8n/generate-images] Processing content ({len(body.content)} chars)")
        result_text = await _run_claude_cli(prompt)

        # Parse JSON
        json_match = re.search(r"\{[\s\S]*\}", result_text)
        if not json_match:
            raise ValueError("No JSON found in response")

        result = json.loads(json_match.group())
        content_with_images = result.get("content_with_images", "")
        image_prompts = result.get("image_prompts", [])

        if not content_with_images or not image_prompts:
            raise ValueError("Invalid response structure")

        return GenerateImagesResponse(
            content_with_images=content_with_images,
            image_prompts=image_prompts,
            image_count=len(image_prompts),
        )

    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        logger.error(f"[n8n/generate-images] Failed: {e}")
        raise HTTPException(status_code=500, detail="Image generation failed")


async def _validate_and_clean_links(content: str, blog_db_path: str | None) -> tuple[str, list[str]]:
    """
    본문의 마크다운 링크를 검증하고 불량 링크를 제거한다.

    - /admin 으로 시작하는 내부 링크 → 즉시 제거
    - 그 외 내부 링크(/posts/, /blog/ 등) → DB에서 slug 존재 확인 → 없으면 제거
    - 외부 링크 → HEAD 요청으로 접근 가능 여부 확인 → 4xx면 제거 (관리자 알림용 목록 반환)

    반환: (정제된 content, 제거된 링크 목록)
    """
    import sqlite3
    import urllib.parse

    removed = []

    # 마크다운 링크 패턴: [텍스트](URL)
    link_pattern = re.compile(r'\[([^\]]+)\]\(([^)]+)\)')

    # DB에서 존재하는 slug 목록 로드
    existing_slugs: set[str] = set()
    if blog_db_path:
        try:
            conn = sqlite3.connect(blog_db_path)
            rows = conn.execute("SELECT slug FROM posts WHERE status = 'published'").fetchall()
            existing_slugs = {row[0] for row in rows}
            conn.close()
        except Exception as e:
            logger.warning(f"[link-validate] Could not load slugs: {e}")

    async def check_external(url: str) -> bool:
        try:
            async with httpx.AsyncClient(timeout=8, follow_redirects=True) as client:
                r = await client.head(url, headers={"User-Agent": "Mozilla/5.0"})
                if r.status_code == 405:
                    # HEAD 미지원 → GET으로 재시도
                    r = await client.get(url, headers={"User-Agent": "Mozilla/5.0"})
                return r.status_code < 400
        except Exception:
            return False

    async def validate_link(text: str, url: str) -> str:
        stripped = url.strip()

        # 내부 링크 판별
        parsed = urllib.parse.urlparse(stripped)
        is_internal = not parsed.scheme or parsed.netloc in ("", "blog.namukeu.com")

        if is_internal:
            path = parsed.path.rstrip("/")
            # /admin 링크 즉시 제거
            if path.startswith("/admin"):
                removed.append(f"[어드민 링크 제거] {stripped}")
                return text
            # slug 추출 (/posts/slug 또는 /blog/slug 또는 /slug)
            slug = path.split("/")[-1] if "/" in path else path.lstrip("/")
            if slug and existing_slugs and slug not in existing_slugs:
                removed.append(f"[내부 링크 없음] {stripped}")
                return text
            return f"[{text}]({url})"
        else:
            # 외부 링크 HEAD 검증
            ok = await check_external(stripped)
            if not ok:
                removed.append(f"[외부 링크 404] {stripped}")
                return text
            return f"[{text}]({url})"

    # 비동기 병렬 처리
    matches = list(link_pattern.finditer(content))
    if not matches:
        return content, []

    tasks = [validate_link(m.group(1), m.group(2)) for m in matches]
    results = await asyncio.gather(*tasks)

    # 역순으로 치환 (인덱스 꼬임 방지)
    for match, replacement in zip(reversed(matches), reversed(results)):
        content = content[:match.start()] + replacement + content[match.end():]

    return content, removed


async def _download_and_replace_images(content: str, uploads_dir: str) -> str:
    """
    마크다운 본문에서 DALL-E 임시 URL 이미지를 찾아 로컬에 다운로드하고
    /uploads/... 경로로 교체한다.
    """
    dalle_pattern = re.compile(
        r'(!\[[^\]]*\])\((https://oaidalleapiprodscus[^)]+)\)'
    )

    os.makedirs(uploads_dir, exist_ok=True)

    async def download_image(url: str) -> str | None:
        try:
            async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
                resp = await client.get(url)
                if resp.status_code != 200:
                    return None
                content_type = resp.headers.get("content-type", "")
                ext = "webp" if "webp" in content_type else "png" if "png" in content_type else "jpg"
                filename = f"{int(time.time() * 1000)}-{os.urandom(3).hex()}.{ext}"
                filepath = os.path.join(uploads_dir, filename)
                with open(filepath, "wb") as f:
                    f.write(resp.content)
                return f"/uploads/{filename}"
        except Exception as e:
            logger.warning(f"[image-download] Failed to download {url[:80]}...: {e}")
            return None

    matches = list(dalle_pattern.finditer(content))
    if not matches:
        return content

    tasks = [download_image(m.group(2)) for m in matches]
    local_paths = await asyncio.gather(*tasks)

    # 역순으로 교체 (인덱스 꼬임 방지)
    for match, local_path in zip(reversed(matches), reversed(local_paths)):
        if local_path:
            replacement = f"{match.group(1)}({local_path})"
        else:
            # 다운로드 실패 시 이미지 마크다운 자체를 제거
            replacement = ""
        content = content[:match.start()] + replacement + content[match.end():]

    downloaded = sum(1 for p in local_paths if p)
    failed = len(local_paths) - downloaded
    if downloaded or failed:
        logger.info(f"[image-download] {downloaded} downloaded, {failed} failed/removed")

    return content


async def _send_telegram(bot_token: str, chat_id: str, text: str) -> None:
    """텔레그램 메시지 전송 (실패해도 무시)."""
    try:
        url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
        async with httpx.AsyncClient(timeout=10) as client:
            await client.post(url, json={"chat_id": chat_id, "text": text, "parse_mode": "HTML"})
    except Exception as e:
        logger.warning(f"[telegram] Failed to send notification: {e}")


@router.post("/save-draft", response_model=SaveDraftResponse)
async def save_draft(body: SaveDraftRequest, config: Config = Depends(get_config)):
    """
    완성된 블로그 글을 ai-blog DB에 draft로 저장.

    - n8n 워크플로우의 마지막 단계
    - reviewed 상태로 저장 → 관리자 페이지에서 승인/반려 가능
    """
    try:
        content = body.content

        # DALL-E 임시 URL 이미지를 로컬에 다운로드하여 교체
        uploads_path = getattr(config, "blog_uploads_path", "")
        if uploads_path and "oaidalleapiprodscus" in content:
            content = await _download_and_replace_images(content, uploads_path)

        # 링크 검증 및 정제
        blog_db_path = config.blog_db_path if hasattr(config, "blog_db_path") else None
        cleaned_content, removed_links = await _validate_and_clean_links(content, blog_db_path)
        if removed_links:
            logger.warning(f"[n8n/save-draft] Removed {len(removed_links)} invalid links: {removed_links}")

        draft_data = {
            "keyword": body.keyword,
            "title": body.title,
            "slug": body.slug,
            "content": cleaned_content,
            "excerpt": body.excerpt,
            "tags": body.tags,
            "outline": body.outline or "",
        }

        draft_id = create_draft_in_blog(draft_data, config)
        if not draft_id:
            raise HTTPException(status_code=500, detail="Failed to save draft to blog DB")

        logger.info(f"[n8n/save-draft] Draft saved: id={draft_id}, title={body.title}")

        # 텔레그램 알림
        if config.telegram_bot_token and config.telegram_chat_id:
            import html
            admin_url = f"https://blog.namukeu.com/admin/drafts/{draft_id}"
            removed_notice = ""
            if removed_links:
                removed_notice = f"\n\n⚠️ <b>제거된 링크 {len(removed_links)}개</b>\n" + "\n".join(
                    f"• {html.escape(l)}" for l in removed_links
                )
            msg = (
                f"📝 <b>새 블로그 초안이 생성되었습니다</b>\n\n"
                f"제목: {html.escape(body.title)}\n"
                f"키워드: {html.escape(body.keyword)}"
                f"{removed_notice}\n\n"
                f"<a href=\"{admin_url}\">👉 검토하러 가기</a>"
            )
            await _send_telegram(config.telegram_bot_token, config.telegram_chat_id, msg)

        return SaveDraftResponse(
            draft_id=draft_id,
            status="reviewed",
            message=f"Draft saved successfully (ID: {draft_id}). Awaiting approval in admin panel.",
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[n8n/save-draft] Failed: {e}")
        raise HTTPException(status_code=500, detail="Draft save failed")


# --- Health Check ---


@router.get("/health")
def health():
    """n8n 연동 API 상태 확인."""
    return {"status": "ok", "service": "content-pipeline-n8n"}
