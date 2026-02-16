import asyncio
import json
import logging
import re

logger = logging.getLogger(__name__)

AI_REVIEW_PROMPT = """당신은 테크 콘텐츠 시니어 에디터입니다.
아래 블로그 초안을 냉정하게 검수해주세요.

## 검수 대상
- 키워드: {keyword}
- 제목: {title}

## 본문
{content}

## 검수 원칙 (4가지)

1. **비유/소재의 적정성**: 비유가 기술적 본질을 왜곡하지 않는가? 비유와 실제 기술 설명의 비율이 적절한가? (비유 3 : 기술 7 이하 권장). 비유를 사용했다면 해당 소재에 대한 이해가 정확한가?

2. **기술적 깊이(Technical Edge)**: 누구나 아는 표면적 'How-to' 나열인가, 아니면 'Why'와 구체적 수치/데이터가 포함되어 있는가? 벤치마크, 아키텍처, 실제 경험 기반의 인사이트가 있는가?

3. **타겟 독자 일관성**: 글의 난이도와 어조가 특정 독자층에게 일관되게 맞춰져 있는가? 입문자와 전문가 양다리를 걸치다 이도 저도 아닌 부분이 있는가?

4. **결론의 실효성**: 독자가 읽고 즉시 실행할 수 있는 액션 아이템이나 사고를 전환하는 인사이트가 있는가? 감성적 마무리에 그치지 않았는가?

## 출력 형식 (반드시 이 JSON만 출력)
```json
{{
  "scores": {{
    "analogy_appropriateness": 0,
    "technical_depth": 0,
    "target_consistency": 0,
    "conclusion_effectiveness": 0
  }},
  "overall": 0,
  "sharp_criticisms": [
    "가장 힘이 빠지는 부분 또는 전문가답지 못한 부분 (최대 3개)"
  ],
  "technical_suggestions": [
    "추가하면 좋을 구체적 데이터, 수치, 기술 키워드 (최대 3개)"
  ],
  "one_liner": "이 글은 콘텐츠인가, 일기인가? 한 줄 평"
}}
```

점수는 모두 1~10 정수. overall은 4개 점수의 평균(반올림).
JSON 외의 텍스트는 절대 출력하지 마세요."""


async def ai_review(title: str, content: str, keyword: str) -> dict | None:
    """Run AI-based content quality review using Claude CLI."""
    import os

    prompt = AI_REVIEW_PROMPT.format(
        keyword=keyword,
        title=title,
        content=content[:6000],  # Limit to avoid token overflow
    )

    try:
        # Copy environment and remove CLAUDECODE to avoid nested session error
        env = os.environ.copy()
        env.pop("CLAUDECODE", None)

        proc = await asyncio.create_subprocess_exec(
            "claude", "--print", "--dangerously-skip-permissions", prompt,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=env,
        )
        stdout, stderr = await proc.communicate()

        if proc.returncode != 0:
            stderr_text = stderr.decode().strip()
            stdout_text = stdout.decode().strip()
            logger.error(f"[ai_review] Claude CLI failed (code {proc.returncode})")
            logger.error(f"[ai_review] stdout: {stdout_text[:200]}")
            logger.error(f"[ai_review] stderr: {stderr_text[:200]}")
            return None

        raw = stdout.decode().strip()
        # Extract JSON from response
        json_match = re.search(r"\{[\s\S]*\}", raw)
        if not json_match:
            logger.warning(f"[ai_review] No JSON found in response")
            return None

        result = json.loads(json_match.group())
        # Validate structure
        if "scores" not in result or "overall" not in result:
            logger.warning(f"[ai_review] Invalid structure: {list(result.keys())}")
            return None

        return result

    except Exception as e:
        logger.error(f"[ai_review] Failed: {e}")
        return None


def calculate_seo_score(title: str, content: str, keyword: str) -> dict:
    """Calculate basic SEO score for a draft."""
    checks: dict[str, bool] = {}

    # Title checks
    checks["title_length"] = 20 <= len(title) <= 70
    # Check if major keyword parts appear in title (split by space)
    kw_parts = [p for p in keyword.lower().split() if len(p) >= 2]
    if kw_parts:
        matched = sum(1 for p in kw_parts if p in title.lower())
        checks["keyword_in_title"] = matched >= len(kw_parts) * 0.5
    else:
        checks["keyword_in_title"] = keyword.lower() in title.lower()

    # Content checks
    words = content.split()
    word_count = len(words)
    checks["min_word_count"] = word_count >= 800

    headings = re.findall(r"^#{2,3}\s", content, re.MULTILINE)
    checks["has_headings"] = len(headings) >= 2
    checks["sufficient_headings"] = len(headings) >= 3

    # Keyword density (check individual keyword parts)
    content_lower = content.lower()
    if kw_parts:
        part_counts = [content_lower.count(p) for p in kw_parts]
        avg_count = sum(part_counts) / len(part_counts)
        density = avg_count / max(word_count, 1)
    else:
        keyword_count = content_lower.count(keyword.lower())
        density = keyword_count / max(word_count, 1)
    checks["keyword_density_ok"] = 0.005 <= density <= 0.04

    # Paragraph checks
    paragraphs = [p.strip() for p in content.split("\n\n") if p.strip() and not p.strip().startswith("#")]
    if paragraphs:
        avg_paragraph_words = sum(len(p.split()) for p in paragraphs) / len(paragraphs)
        checks["short_paragraphs"] = avg_paragraph_words <= 120
    else:
        checks["short_paragraphs"] = False

    # Has intro and conclusion pattern
    checks["has_structure"] = "##" in content

    score = sum(checks.values()) / len(checks) * 10

    return {
        "score": round(score, 1),
        "checks": checks,
        "word_count": word_count,
        "heading_count": len(headings),
        "keyword_density": round(density * 100, 2),
    }


def calculate_readability(content: str) -> dict:
    """Calculate readability metrics."""
    # Strip markdown syntax for analysis
    text = re.sub(r"#{1,6}\s.*", "", content)
    text = re.sub(r"\*\*|__", "", text)
    text = re.sub(r"\*|_", "", text)
    text = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", text)
    text = re.sub(r"```[\s\S]*?```", "", text)
    text = re.sub(r"`[^`]+`", "", text)

    sentences = [s.strip() for s in re.split(r"[.!?。]\s*", text) if s.strip()]
    words = text.split()
    paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]

    avg_sentence_length = len(words) / max(len(sentences), 1)
    avg_paragraph_length = len(words) / max(len(paragraphs), 1)

    # Simple readability score (higher = more readable, 0-10 scale)
    score = 10.0
    if avg_sentence_length > 30:
        score -= 2.0
    if avg_sentence_length > 20:
        score -= 1.0
    if avg_paragraph_length > 100:
        score -= 1.5
    if len(paragraphs) < 5:
        score -= 1.0

    return {
        "score": round(max(score, 0), 1),
        "sentence_count": len(sentences),
        "avg_sentence_length": round(avg_sentence_length, 1),
        "paragraph_count": len(paragraphs),
        "avg_paragraph_length": round(avg_paragraph_length, 1),
    }
