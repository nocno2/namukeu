"""
n8n 연동용 API 엔드포인트.

외부 LLM API 키 없이 로컬 Claude CLI를 호출하는 FastAPI 서버.
"""
import asyncio
import json
import logging
import re

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from src.pipeline.generator import ARTICLE_PROMPT, META_PROMPT, OUTLINE_PROMPT
from src.pipeline.reviewer import ai_review, calculate_readability, calculate_seo_score

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/n8n", tags=["n8n"])


# --- Pydantic Models ---


class GenerateRequest(BaseModel):
    keyword: str = Field(..., min_length=1, max_length=200, description="블로그 키워드")
    direction: str | None = Field(None, max_length=2000, description="창작 방향 (선택)")


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


# --- Helper Functions ---


async def _run_claude_cli(prompt: str) -> str:
    """Run claude CLI with --print mode."""
    proc = await asyncio.create_subprocess_exec(
        "claude", "--print", "--dangerously-skip-permissions", prompt,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        env={
            "PATH": "/Users/namwook/.local/bin:/usr/local/bin:/usr/bin:/bin",
            "HOME": "/Users/namwook",
        },
    )
    stdout, stderr = await proc.communicate()

    if proc.returncode != 0:
        err_msg = stderr.decode().strip()
        raise RuntimeError(f"claude CLI failed (code {proc.returncode}): {err_msg}")

    return stdout.decode().strip()


# --- API Endpoints ---


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

        # Step 1: Generate outline
        logger.info(f"[n8n/generate] Generating outline for: {keyword}")
        outline_prompt = OUTLINE_PROMPT.format(keyword=keyword)
        if direction:
            outline_prompt += f"\n\n## 창작 방향\n{direction}"
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
        direction_block = f"## 창작 방향 (반드시 반영)\n{direction}" if direction else ""
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

첨삭된 전체 글을 마크다운으로 출력해주세요.
제목은 H1으로 넣지 말고, 서론부터 바로 시작하세요."""

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


# --- Health Check ---


@router.get("/health")
def health():
    """n8n 연동 API 상태 확인."""
    return {"status": "ok", "service": "content-pipeline-n8n"}
