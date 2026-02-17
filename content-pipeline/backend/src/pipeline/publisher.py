import json
import logging
import sqlite3
from datetime import datetime

from src.config import Config

logger = logging.getLogger(__name__)


def create_draft_in_blog(draft_data: dict, config: Config) -> int | None:
    """Insert a draft directly into ai-blog's SQLite database."""
    if not config.blog_db_path:
        logger.error("[publisher] BLOG_DB_PATH not configured")
        return None

    try:
        conn = sqlite3.connect(config.blog_db_path)
        conn.row_factory = sqlite3.Row
        now = datetime.now().isoformat()

        cursor = conn.execute(
            """INSERT INTO drafts
            (keyword, topic, outline, source, title, slug, content, excerpt, tags, status, pipeline_id, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                draft_data["keyword"],
                draft_data.get("keyword", ""),  # topic = keyword for now
                draft_data.get("outline"),
                "pipeline",
                draft_data.get("title"),
                draft_data.get("slug"),
                draft_data.get("content"),
                draft_data.get("excerpt"),
                json.dumps(draft_data.get("tags", []), ensure_ascii=False),
                "reviewed",
                draft_data.get("pipeline_id"),
                now,
                now,
            ),
        )
        conn.commit()
        draft_id = cursor.lastrowid
        conn.close()

        logger.info(f"[publisher] Draft created in blog DB: id={draft_id}")
        return draft_id
    except Exception as e:
        logger.error(f"[publisher] Failed to create draft in blog DB: {e}")
        return None


def update_draft_in_blog(draft_id: int, updates: dict, config: Config) -> bool:
    """Update a draft in ai-blog's SQLite database."""
    if not config.blog_db_path:
        return False

    try:
        conn = sqlite3.connect(config.blog_db_path)
        fields = []
        params = []
        for key, val in updates.items():
            fields.append(f"{key} = ?")
            params.append(val)
        fields.append("updated_at = ?")
        params.append(datetime.now().isoformat())
        params.append(draft_id)

        conn.execute(f"UPDATE drafts SET {', '.join(fields)} WHERE id = ?", params)
        conn.commit()
        conn.close()
        return True
    except Exception as e:
        logger.error(f"[publisher] Failed to update draft: {e}")
        return False


def get_drafts_from_blog(config: Config, status: str | None = None) -> list[dict]:
    """Read drafts from ai-blog's SQLite database."""
    if not config.blog_db_path:
        return []

    try:
        conn = sqlite3.connect(config.blog_db_path)
        conn.row_factory = sqlite3.Row

        if status:
            rows = conn.execute(
                "SELECT * FROM drafts WHERE status = ? ORDER BY created_at DESC", (status,)
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM drafts ORDER BY created_at DESC"
            ).fetchall()

        conn.close()
        return [dict(r) for r in rows]
    except Exception as e:
        logger.error(f"[publisher] Failed to read drafts: {e}")
        return []


def get_draft_from_blog(draft_id: int, config: Config) -> dict | None:
    """Read a single draft from ai-blog's SQLite database."""
    if not config.blog_db_path:
        return None

    try:
        conn = sqlite3.connect(config.blog_db_path)
        conn.row_factory = sqlite3.Row
        row = conn.execute("SELECT * FROM drafts WHERE id = ?", (draft_id,)).fetchone()
        conn.close()
        return dict(row) if row else None
    except Exception as e:
        logger.error(f"[publisher] Failed to read draft: {e}")
        return None
