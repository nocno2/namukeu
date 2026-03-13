"""에이전트 관련 API 엔드포인트"""

import asyncio
import logging
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException

from src.api.auth import verify
from src.core import runtime

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/agent", tags=["agent"], dependencies=[Depends(verify)])


@router.get("/status")
async def get_agent_status():
    """현재 에이전트 상태, 마지막/다음 사이클 정보."""
    orchestrator = runtime.cycle_orchestrator
    if not orchestrator:
        return {"status": "not_initialized", "message": "에이전트 시스템 미초기화"}

    db = runtime.agent_db
    cycles = db.get_recent_cycles(limit=1) if db else []
    last_cycle = cycles[0] if cycles else None

    # 다음 사이클 시간 계산
    config = runtime.config
    next_cycle_hour = None
    if config:
        now_hour = datetime.now().hour
        future_hours = [h for h in config.agent_cycle_hours if h > now_hour]
        next_cycle_hour = future_hours[0] if future_hours else config.agent_cycle_hours[0]

    return {
        "status": "running" if orchestrator.is_running else "idle",
        "last_cycle": {
            "cycle_id": last_cycle["cycle_id"],
            "started_at": last_cycle["started_at"],
            "finished_at": last_cycle.get("finished_at"),
            "status": last_cycle["status"],
            "trades_executed": last_cycle.get("trades_executed", 0),
            "total_cost_usd": last_cycle.get("total_cost_usd", 0),
        } if last_cycle else None,
        "next_cycle_hour": next_cycle_hour,
        "config": {
            "cycle_hours": config.agent_cycle_hours if config else [],
            "scan_top_n": config.agent_scan_top_n if config else 0,
            "max_positions": config.agent_max_positions if config else 0,
            "dry_run": config.dry_run if config else True,
        },
    }


@router.post("/cycle/trigger")
async def trigger_cycle():
    """수동으로 분석 사이클을 트리거한다."""
    orchestrator = runtime.cycle_orchestrator
    if not orchestrator:
        raise HTTPException(status_code=503, detail="에이전트 시스템 미초기화")

    if orchestrator.is_running:
        raise HTTPException(status_code=409, detail="이미 사이클 실행 중")

    # 비동기로 사이클 시작 (즉시 응답)
    asyncio.create_task(orchestrator.run_cycle())

    return {"message": "사이클 트리거됨", "status": "started"}


@router.get("/cycles")
async def get_cycles(limit: int = 10):
    """최근 사이클 목록."""
    db = runtime.agent_db
    if not db:
        return {"cycles": []}

    cycles = db.get_recent_cycles(limit=limit)
    return {"cycles": cycles}


@router.get("/cycles/{cycle_id}/decisions")
async def get_cycle_decisions(cycle_id: str):
    """특정 사이클의 에이전트 판단 기록."""
    db = runtime.agent_db
    if not db:
        return {"decisions": []}

    decisions = db.get_cycle_decisions(cycle_id)
    return {"decisions": decisions}


@router.get("/reports")
async def get_reports(report_type: str | None = None, limit: int = 10):
    """보고서 목록."""
    db = runtime.agent_db
    if not db:
        return {"reports": []}

    reports = db.get_recent_reports(report_type=report_type, limit=limit)
    return {"reports": reports}
