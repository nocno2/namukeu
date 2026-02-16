import re


def calculate_seo_score(title: str, content: str, keyword: str) -> dict:
    """Calculate basic SEO score for a draft."""
    checks: dict[str, bool] = {}

    # Title checks
    checks["title_length"] = 20 <= len(title) <= 70
    checks["keyword_in_title"] = keyword.lower() in title.lower()

    # Content checks
    words = content.split()
    word_count = len(words)
    checks["min_word_count"] = word_count >= 800

    headings = re.findall(r"^#{2,3}\s", content, re.MULTILINE)
    checks["has_headings"] = len(headings) >= 2
    checks["sufficient_headings"] = len(headings) >= 3

    # Keyword density
    keyword_count = content.lower().count(keyword.lower())
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

    score = sum(checks.values()) / len(checks) * 100

    return {
        "score": round(score),
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

    # Simple readability score (higher = more readable)
    score = 100
    if avg_sentence_length > 30:
        score -= 20
    if avg_sentence_length > 20:
        score -= 10
    if avg_paragraph_length > 100:
        score -= 15
    if len(paragraphs) < 5:
        score -= 10

    return {
        "score": max(score, 0),
        "sentence_count": len(sentences),
        "avg_sentence_length": round(avg_sentence_length, 1),
        "paragraph_count": len(paragraphs),
        "avg_paragraph_length": round(avg_paragraph_length, 1),
    }
