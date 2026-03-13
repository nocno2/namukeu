import json

from fastapi import APIRouter, Depends, HTTPException

from src.api.auth import verify
from src.core.database import Database
from src.models.strategy import (
    StrategyConfigCreate,
    StrategyConfigResponse,
    StrategyConfigUpdate,
    StrategyInfo,
)

router = APIRouter(tags=["strategy"])


def get_db() -> Database:
    raise NotImplementedError


@router.get("/strategies", response_model=list[StrategyInfo])
def list_strategies(_=Depends(verify)):
    # 전략 레지스트리 제거됨 — 에이전트 시스템으로 대체 예정
    return []


@router.get("/strategies/configs", response_model=list[StrategyConfigResponse])
def list_configs(
    _=Depends(verify),
    db: Database = Depends(get_db),
):
    configs = db.get_strategies()
    return [StrategyConfigResponse(**{**c, "enabled": bool(c["enabled"])}) for c in configs]


@router.post("/strategies/configs", response_model=StrategyConfigResponse)
def create_config(
    body: StrategyConfigCreate,
    _=Depends(verify),
    db: Database = Depends(get_db),
):
    # 전략 레지스트리 제거됨 — 에이전트 시스템으로 대체 예정
    try:
        strategy_id = db.create_strategy(body.name, body.ticker, body.params, body.interval, exchange=body.exchange)
    except Exception as e:
        if "UNIQUE constraint" in str(e):
            raise HTTPException(status_code=409, detail=f"{body.name}:{body.ticker} already exists")
        raise

    config = db.get_strategy(strategy_id)
    return StrategyConfigResponse(**{**config, "enabled": bool(config["enabled"])})


@router.put("/strategies/configs/{strategy_id}", response_model=StrategyConfigResponse)
def update_config(
    strategy_id: int,
    body: StrategyConfigUpdate,
    _=Depends(verify),
    db: Database = Depends(get_db),
):
    if not db.update_strategy(strategy_id, params=body.params, interval=body.interval):
        raise HTTPException(status_code=404, detail="Strategy config not found")

    config = db.get_strategy(strategy_id)
    return StrategyConfigResponse(**{**config, "enabled": bool(config["enabled"])})


@router.delete("/strategies/configs/{strategy_id}")
def delete_config(
    strategy_id: int,
    _=Depends(verify),
    db: Database = Depends(get_db),
):
    if not db.delete_strategy(strategy_id):
        raise HTTPException(status_code=404, detail="Strategy config not found")
    return {"message": "전략 설정 삭제 완료"}


@router.post("/strategies/configs/{strategy_id}/enable")
def enable_config(
    strategy_id: int,
    _=Depends(verify),
    db: Database = Depends(get_db),
):
    if not db.set_strategy_enabled(strategy_id, True):
        raise HTTPException(status_code=404, detail="Strategy config not found")
    return {"message": "전략 활성화 완료"}


@router.post("/strategies/configs/{strategy_id}/disable")
def disable_config(
    strategy_id: int,
    _=Depends(verify),
    db: Database = Depends(get_db),
):
    if not db.set_strategy_enabled(strategy_id, False):
        raise HTTPException(status_code=404, detail="Strategy config not found")
    return {"message": "전략 비활성화 완료"}
