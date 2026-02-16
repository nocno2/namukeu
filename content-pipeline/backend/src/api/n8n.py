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


class ExtractKeywordsRequest(BaseModel):
    context: str = Field(..., min_length=10, max_length=5000, description="아이디어/컨텍스트")
    count: int = Field(3, ge=1, le=10, description="추출할 키워드 개수")


class ExtractKeywordsResponse(BaseModel):
    keywords: list[str]
    reasoning: str


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


class GenerateImagesRequest(BaseModel):
    content: str = Field(..., min_length=100, description="본문 마크다운")
    title: str = Field(..., min_length=1, max_length=200, description="글 제목")
    count: int = Field(3, ge=1, le=5, description="생성할 이미지 개수")


class GenerateImagesResponse(BaseModel):
    content_with_images: str
    image_prompts: list[str]
    image_count: int


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


@router.post("/extract-keywords", response_model=ExtractKeywordsResponse)
async def extract_keywords(body: ExtractKeywordsRequest):
    """
    아이디어/컨텍스트에서 블로그 키워드 추출.

    - 사용자가 제공한 긴 문장/아이디어에서 SEO 친화적 키워드 추출
    - 트렌드 및 검색 의도를 고려한 키워드 제안
    """
    try:
        prompt = f"""당신은 SEO 전문가입니다.
다음 아이디어/컨텍스트에서 블로그 글로 작성하기 좋은 키워드를 {body.count}개 추출해주세요.

## 입력 컨텍스트
{body.context}

## 추출 기준
- SEO 친화적 (검색량이 있을 법한)
- 구체적이고 명확한 주제
- 블로그 글 한 편으로 다룰 수 있는 범위
- 타겟 독자가 명확한 키워드

다음 JSON 형식으로만 응답하세요:
{{
  "keywords": ["키워드1", "키워드2", "키워드3"],
  "reasoning": "이 키워드들을 선택한 이유 (1-2문장)"
}}"""

        logger.info(f"[n8n/extract-keywords] Extracting from context ({len(body.context)} chars)")
        result_text = await _run_claude_cli(prompt)

        # Parse JSON
        json_match = re.search(r"\{[\s\S]*\}", result_text)
        if not json_match:
            raise ValueError("No JSON found in response")

        result = json.loads(json_match.group())
        keywords = result.get("keywords", [])
        reasoning = result.get("reasoning", "")

        if not keywords:
            raise ValueError("No keywords extracted")

        return ExtractKeywordsResponse(
            keywords=keywords[:body.count],
            reasoning=reasoning,
        )

    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        logger.error(f"[n8n/extract-keywords] Failed: {e}")
        raise HTTPException(status_code=500, detail="Keyword extraction failed")


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


# --- Health Check ---


@router.get("/health")
def health():
    """n8n 연동 API 상태 확인."""
    return {"status": "ok", "service": "content-pipeline-n8n"}
