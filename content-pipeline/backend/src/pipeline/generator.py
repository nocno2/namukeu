import asyncio
import json
import logging
import re

from src.config import Config

logger = logging.getLogger(__name__)

OUTLINE_PROMPT = """당신은 한국어 블로그 콘텐츠 기획자입니다.
다음 키워드로 블로그 포스트 아웃라인을 작성해주세요.

키워드: {keyword}

아웃라인에 포함할 것:
- SEO 친화적인 제목 (30-60자)
- 4-6개 주요 섹션 (하위 포인트 포함)
- 타겟 독자 고려
- 다룰 핵심 포인트

마크다운 형식으로 한국어로 응답해주세요."""

ARTICLE_PROMPT = """당신은 전문 한국어 블로그 작가입니다.

키워드: {keyword}
제목: {title}

아웃라인:
{outline}

{direction_block}

이 아웃라인을 바탕으로 완성된 블로그 글을 작성해주세요.

## 필수 요구사항
- 한국어, ~다/~거든/~인 거다 스타일의 반말체 (친근하되 허술하지 않게)
- 마크다운 형식, H2 (##)와 H3 (###) 헤딩 사용
- 각 단락 3-5문장
- 1500-2500단어 목표
- 키워드를 자연스럽게 배치 (2-3% 밀도)
- 제목은 H1으로 넣지 말고, 서론부터 바로 시작

## 전문성 가이드라인
- 주장에는 구체적 수치, 벤치마크, 데이터를 근거로 제시할 것
- 비유/소재를 사용할 경우 전체 분량의 30% 이하로 제한하고, 나머지는 기술적 설명에 할당
- "~라고 한다", "~인 것 같다" 같은 애매한 표현 대신 단정적이고 자신감 있게 서술
- 독자가 글을 읽고 바로 실행할 수 있는 액션 아이템을 결론에 포함
- 개인 경험이나 실사용 후기가 있다면 `>` 인용블록으로 삽입

## 타겟 독자
- 기술에 관심 있는 일반인 ~ 입문 개발자 (난이도를 글 전체에서 일관되게 유지)"""

META_PROMPT = """다음 블로그 글의 메타데이터를 생성해주세요.

제목: {title}

본문:
{content_preview}

다음 JSON 형식으로만 응답하세요 (다른 텍스트 없이):
{{"slug": "영문-하이픈-slug", "excerpt": "한국어 요약 1-2문장 (160자 이내)", "tags": ["태그1", "태그2", "태그3"]}}"""


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


async def generate_draft(keyword: str, config: Config, direction: str = "") -> dict:
    """Generate a blog post draft using claude CLI."""
    # Step 1: Generate outline
    logger.info(f"[generator] Generating outline for: {keyword}")
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
    logger.info(f"[generator] Generating article: {title}")
    direction_block = f"## 창작 방향 (반드시 반영)\n{direction}" if direction else ""
    content = await _run_claude_cli(ARTICLE_PROMPT.format(
        keyword=keyword,
        title=title,
        outline=outline,
        direction_block=direction_block,
    ))

    # Step 3: Generate metadata
    logger.info("[generator] Generating metadata")
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
        logger.warning(f"[generator] Meta parsing failed: {e}")

    return {
        "keyword": keyword,
        "title": title,
        "slug": slug,
        "content": content,
        "excerpt": excerpt,
        "outline": outline,
        "tags": tags,
    }
