"""Runtime state shared across modules.

This module holds mutable runtime references that are set during app lifespan.
Import this module (not variables from it) to access current state:

    from src.core import runtime
    scheduler = runtime.schedulers.get("binance")
"""
from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from src.agent.cycle import CycleOrchestrator
    from src.core.config import Config
    from src.core.database import Database
    from src.services.collector import DataCollector
    from src.services.exchange_base import Exchange
    from src.services.scheduler import TradingScheduler

config: Config | None = None

# Dry-run override: if set, this takes precedence over config.dry_run
# None = use config.dry_run, True = force dry-run, False = force live
dry_run_override: bool | None = None

# Multi-exchange support: keyed by provider name ("upbit", "binance")
exchanges: dict[str, Exchange] = {}
schedulers: dict[str, TradingScheduler] = {}
collectors: dict[str, DataCollector] = {}

# Backward compatibility: first available exchange
exchange: Exchange | None = None
scheduler: TradingScheduler | None = None
collector: DataCollector | None = None

backtester = None

# 에이전트 시스템
cycle_orchestrator: "CycleOrchestrator | None" = None
agent_db: "Database | None" = None
