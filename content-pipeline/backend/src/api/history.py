from fastapi import APIRouter, Depends

from src.api.auth import get_db, verify_session
from src.db.connection import Database

router = APIRouter(prefix="/api/history")


@router.get("")
def get_recent_history(
    limit: int = 50,
    _=Depends(verify_session),
    db: Database = Depends(get_db),
):
    return {"history": db.get_recent_history(limit)}


@router.get("/task/{task_id}")
def get_task_history(
    task_id: str,
    limit: int = 20,
    offset: int = 0,
    _=Depends(verify_session),
    db: Database = Depends(get_db),
):
    history = db.get_task_history(task_id, limit, offset)
    return {"history": history}


@router.get("/stats")
def get_history_stats(
    _=Depends(verify_session),
    db: Database = Depends(get_db),
):
    return db.get_history_stats()
