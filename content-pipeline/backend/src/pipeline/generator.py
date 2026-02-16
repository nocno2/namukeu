import logging
import re

import anthropic

from src.config import Config

logger = logging.getLogger(__name__)

OUTLINE_SYSTEM = """You are a Korean tech/lifestyle blog content planner.
Create a detailed blog post outline for the given keyword.
The outline should include:
- A compelling title (SEO-friendly, 30-60 chars)
- 4-6 main sections with subpoints
- Target audience consideration
- Key points to cover

Respond in Korean. Format as Markdown."""

ARTICLE_SYSTEM = """You are a professional Korean blog writer.
Write a complete, well-structured blog post in Korean based on the given outline.

Requirements:
- Write in Korean, natural and engaging tone
- Use Markdown format
- Include H2 (##) and H3 (###) headings
- Each paragraph should be concise (3-5 sentences max)
- Include a compelling introduction and conclusion
- Target 1500-2500 words
- Use the target keyword naturally throughout (2-3% density)
- Include practical tips, examples, or data where appropriate

Do NOT include the title as H1 — start directly with the introduction."""

META_SYSTEM = """You are an SEO specialist. Given a blog post title and content, generate:
1. A URL-friendly slug (lowercase, hyphens, no Korean — use romanized/English keywords)
2. A concise excerpt (1-2 sentences, max 160 chars, in Korean)
3. 3-5 relevant tags (in Korean)

Respond in this exact JSON format:
{"slug": "...", "excerpt": "...", "tags": ["tag1", "tag2", "tag3"]}"""


async def generate_draft(keyword: str, config: Config) -> dict:
    """Generate a blog post draft using Claude API."""
    if not config.anthropic_api_key:
        raise ValueError("ANTHROPIC_API_KEY not configured")

    client = anthropic.AsyncAnthropic(api_key=config.anthropic_api_key)

    # Step 1: Generate outline
    logger.info(f"[generator] Generating outline for: {keyword}")
    outline_resp = await client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=1500,
        system=OUTLINE_SYSTEM,
        messages=[{"role": "user", "content": f"키워드: {keyword}\n\n이 키워드로 블로그 포스트 아웃라인을 작성해주세요."}],
    )
    outline = outline_resp.content[0].text

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
    article_resp = await client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=4000,
        system=ARTICLE_SYSTEM,
        messages=[{
            "role": "user",
            "content": f"키워드: {keyword}\n제목: {title}\n\n아웃라인:\n{outline}\n\n이 아웃라인을 바탕으로 완성된 블로그 글을 작성해주세요.",
        }],
    )
    content = article_resp.content[0].text

    # Step 3: Generate metadata
    logger.info("[generator] Generating metadata")
    meta_resp = await client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=500,
        system=META_SYSTEM,
        messages=[{
            "role": "user",
            "content": f"제목: {title}\n\n본문:\n{content[:2000]}",
        }],
    )
    meta_text = meta_resp.content[0].text

    # Parse meta JSON
    slug = keyword.lower().replace(" ", "-")[:50]
    excerpt = ""
    tags: list[str] = []
    try:
        import json
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
