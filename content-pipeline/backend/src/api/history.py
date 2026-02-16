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


@router.get("/stats")
def get_history_stats(
    _=Depends(verify_session),
    db: Database = Depends(get_db),
):
    return db.get_history_stats()
