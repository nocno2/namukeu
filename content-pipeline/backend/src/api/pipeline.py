import asyncio
import json
import logging
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException

from src.api.auth import get_config, get_db, verify_session
from src.config import Config
from src.db.connection import Database
from src.db.models import PipelineRunRequest
from src.pipeline.generator import generate_draft
from src.pipeline.keyword import collect_keywords
from src.pipeline.publisher import (
    create_draft_in_blog,
    get_draft_from_blog,
    get_drafts_from_blog,
    update_draft_in_blog,
)
from src.pipeline.reviewer import calculate_readability, calculate_seo_score

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/pipeline")


# --- Pipeline Runs ---


@router.get("/runs")
def list_runs(
    limit: int = 20,
    _=Depends(verify_session),
    db: Database = Depends(get_db),
):
    return {"runs": db.get_pipeline_runs(limit)}


@router.post("/run")
async def trigger_pipeline(
    body: PipelineRunRequest,
    _=Depends(verify_session),
    db: Database = Depends(get_db),
    config: Config = Depends(get_config),
):
    run_id = str(uuid4())
    db.create_pipeline_run(run_id)

    asyncio.create_task(_run_pipeline(run_id, body.keyword, db, config))
    return {"run_id": run_id, "status": "started"}


@router.get("/runs/{run_id}")
def get_run(
    run_id: str,
    _=Depends(verify_session),
    db: Database = Depends(get_db),
):
    run = db.get_pipeline_run(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    return run


# --- Keywords ---


@router.get("/keywords")
async def get_keywords(
    _=Depends(verify_session),
    config: Config = Depends(get_config),
):
    keywords = await collect_keywords(config)
    return {"keywords": keywords}


# --- Drafts (proxy to ai-blog DB) ---


@router.get("/drafts")
def list_drafts(
    status: str | None = None,
    _=Depends(verify_session),
    config: Config = Depends(get_config),
):
    drafts = get_drafts_from_blog(config, status)
    return {"drafts": drafts}


@router.get("/drafts/{draft_id}")
def get_draft(
    draft_id: int,
    _=Depends(verify_session),
    config: Config = Depends(get_config),
):
    draft = get_draft_from_blog(draft_id, config)
    if not draft:
        raise HTTPException(status_code=404, detail="Draft not found")
    return draft


@router.put("/drafts/{draft_id}")
def update_draft(
    draft_id: int,
    body: dict,
    _=Depends(verify_session),
    config: Config = Depends(get_config),
):
    allowed = {"title", "slug", "content", "excerpt", "tags", "revisedContent"}
    updates = {k: v for k, v in body.items() if k in allowed}
    if not updates:
        raise HTTPException(status_code=400, detail="No valid fields to update")

    if "tags" in updates and isinstance(updates["tags"], list):
        updates["tags"] = json.dumps(updates["tags"], ensure_ascii=False)

    if not update_draft_in_blog(draft_id, updates, config):
        raise HTTPException(status_code=500, detail="Failed to update draft")
    return {"ok": True}


@router.post("/drafts/{draft_id}/review")
def review_draft(
    draft_id: int,
    _=Depends(verify_session),
    config: Config = Depends(get_config),
):
    """Run automated quality review on a draft."""
    draft = get_draft_from_blog(draft_id, config)
    if not draft:
        raise HTTPException(status_code=404, detail="Draft not found")

    content = draft.get("revisedContent") or draft.get("content") or ""
    title = draft.get("title") or ""
    keyword = draft.get("keyword") or ""

    seo = calculate_seo_score(title, content, keyword)
    readability = calculate_readability(content)

    review_feedback = json.dumps({
        "seo": seo,
        "readability": readability,
    }, ensure_ascii=False)

    update_draft_in_blog(draft_id, {
        "status": "reviewed",
        "review_score": seo["score"],
        "review_feedback": review_feedback,
    }, config)

    return {"seo": seo, "readability": readability}


@router.post("/drafts/{draft_id}/approve")
async def approve_draft(
    draft_id: int,
    _=Depends(verify_session),
    config: Config = Depends(get_config),
):
    """Approve draft via ai-blog API."""
    import httpx

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{config.blog_api_url}/api/drafts/{draft_id}/approve",
                cookies={"auth_token": config.blog_jwt_secret} if config.blog_jwt_secret else {},
                timeout=30,
            )
            resp.raise_for_status()
            return resp.json()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Blog API error: {e}")


@router.post("/drafts/{draft_id}/reject")
def reject_draft(
    draft_id: int,
    body: dict,
    _=Depends(verify_session),
    config: Config = Depends(get_config),
):
    """Reject a draft with reason."""
    reason = body.get("reason", "")
    update_draft_in_blog(draft_id, {
        "status": "rejected",
        "reject_reason": reason,
    }, config)
    return {"ok": True}


# --- Pipeline Orchestration ---


async def _run_pipeline(run_id: str, keyword: str | None, db: Database, config: Config):
    """Full pipeline: keyword → generate → review."""
    try:
        # Step 1: Collect keywords (or use provided)
        if not keyword:
            db.update_pipeline_run(run_id, {"status": "keyword_collecting"})
            keywords = await collect_keywords(config)
            if not keywords:
                db.update_pipeline_run(run_id, {
                    "status": "failed",
                    "error": "No keywords collected",
                    "completed_at": __import__("datetime").datetime.now().isoformat(),
                })
                return
            keyword = keywords[0]["keyword"]
            db.update_pipeline_run(run_id, {
                "keywords": json.dumps([k["keyword"] for k in keywords[:10]], ensure_ascii=False),
                "selected_keyword": keyword,
            })

        db.update_pipeline_run(run_id, {
            "status": "generating",
            "selected_keyword": keyword,
        })

        # Step 2: Generate draft
        draft_data = await generate_draft(keyword, config)
        draft_data["pipeline_id"] = run_id

        # Step 3: Save to blog DB
        draft_id = create_draft_in_blog(draft_data, config)
        if not draft_id:
            db.update_pipeline_run(run_id, {
                "status": "failed",
                "error": "Failed to save draft to blog DB",
                "completed_at": __import__("datetime").datetime.now().isoformat(),
            })
            return

        # Step 4: Auto-review
        db.update_pipeline_run(run_id, {"status": "reviewing", "blog_draft_id": draft_id})

        content = draft_data.get("content", "")
        title = draft_data.get("title", "")
        seo = calculate_seo_score(title, content, keyword)
        readability = calculate_readability(content)

        review_feedback = json.dumps({"seo": seo, "readability": readability}, ensure_ascii=False)
        update_draft_in_blog(draft_id, {
            "status": "reviewed",
            "review_score": seo["score"],
            "review_feedback": review_feedback,
        }, config)

        # Done
        db.update_pipeline_run(run_id, {
            "status": "completed",
            "blog_draft_id": draft_id,
            "seo_score": seo["score"],
            "readability_score": readability["score"],
            "review_notes": review_feedback,
            "completed_at": __import__("datetime").datetime.now().isoformat(),
        })
        logger.info(f"[pipeline] Run {run_id} completed: draft_id={draft_id}, seo={seo['score']}")

    except Exception as e:
        logger.error(f"[pipeline] Run {run_id} failed: {e}")
        db.update_pipeline_run(run_id, {
            "status": "failed",
            "error": str(e),
            "completed_at": __import__("datetime").datetime.now().isoformat(),
        })
