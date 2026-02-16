import json
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException

from src.api.auth import get_db, verify_session
from src.db.connection import Database
from src.db.models import TaskCreate, TaskUpdate
from src.scheduler.engine import SchedulerEngine

router = APIRouter(prefix="/api/tasks")


def get_scheduler() -> SchedulerEngine:
    raise NotImplementedError


@router.get("")
def list_tasks(
    _=Depends(verify_session),
    db: Database = Depends(get_db),
):
    tasks = db.get_tasks()
    return {"tasks": tasks}


@router.post("")
def create_task(
    body: TaskCreate,
    _=Depends(verify_session),
    db: Database = Depends(get_db),
    scheduler: SchedulerEngine = Depends(get_scheduler),
):
    task_id = str(uuid4())
    task = db.create_task({
        "id": task_id,
        "name": body.name,
        "description": body.description,
        "task_type": body.task_type,
        "handler": body.handler,
        "config": json.dumps(body.config, ensure_ascii=False) if body.config else None,
        "cron_expr": body.cron_expr,
        "enabled": body.enabled,
    })
    scheduler.sync_task(task_id)
    return task


@router.get("/{task_id}")
def get_task(
    task_id: str,
    _=Depends(verify_session),
    db: Database = Depends(get_db),
):
    task = db.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


@router.put("/{task_id}")
def update_task(
    task_id: str,
    body: TaskUpdate,
    _=Depends(verify_session),
    db: Database = Depends(get_db),
    scheduler: SchedulerEngine = Depends(get_scheduler),
):
    updates = body.model_dump(exclude_none=True)
    if "config" in updates and updates["config"] is not None:
        updates["config"] = json.dumps(updates["config"], ensure_ascii=False)
    task = db.update_task(task_id, updates)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    scheduler.sync_task(task_id)
    return task


@router.delete("/{task_id}")
def delete_task(
    task_id: str,
    _=Depends(verify_session),
    db: Database = Depends(get_db),
    scheduler: SchedulerEngine = Depends(get_scheduler),
):
    scheduler.sync_task(task_id)  # remove job first
    if not db.delete_task(task_id):
        raise HTTPException(status_code=404, detail="Task not found")
    return {"ok": True}


@router.post("/{task_id}/run")
async def run_task(
    task_id: str,
    _=Depends(verify_session),
    db: Database = Depends(get_db),
    scheduler: SchedulerEngine = Depends(get_scheduler),
):
    task = db.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    history_id = await scheduler.run_now(task_id)
    if history_id is None:
        raise HTTPException(status_code=400, detail="No handler registered for this task")
    return {"ok": True, "history_id": history_id}


@router.get("/{task_id}/history")
def get_task_history(
    task_id: str,
    limit: int = 20,
    _=Depends(verify_session),
    db: Database = Depends(get_db),
):
    return {"history": db.get_task_history(task_id, limit)}
