"""Type definitions for the agent system."""

from typing import Literal, TypedDict

TaskType = Literal["one-time", "recurring", "event"]
TaskStatus = Literal["pending", "running", "completed", "failed", "paused"]
ProjectCode = Literal["COIN", "BLOG", "DASH", "TRAIN", "TGBOT", "DCBOT", "GENERAL"]

PROJECT_CODES = {"COIN", "BLOG", "DASH", "TRAIN", "TGBOT", "DCBOT", "GENERAL"}

PROJECT_DIR_MAP: dict[str, str] = {
    "COIN": "coin-auto-trade",
    "BLOG": "ai-blog",
    "DASH": "dashboard",
    "TRAIN": "train-go",
    "TGBOT": "claude-telegram",
    "DCBOT": "claude-discord",
    "GENERAL": ".",
}


class AgentTask(TypedDict):
    id: str
    type: TaskType
    status: TaskStatus
    title: str
    prompt: str
    project: str
    schedule_cron: str | None
    schedule_next: str | None
    event_trigger: str | None
    last_run_at: str | None
    last_result: str | None
    run_count: int
    max_runs: int | None
    notify_user: bool
    requires_approval: bool
    chain_depth: int
    chain_parent_id: str | None
    created_at: str
    updated_at: str


class ClaudeResult(TypedDict):
    success: bool
    result: str
    session_id: str
    error: str | None
    cost_usd: float | None
    duration_ms: int | None


class ForbiddenRule(TypedDict):
    id: str
    description: str
    pattern: str | None
    type: str | None  # "command" | "cost_limit" | "rate_limit"
    severity: str  # "critical" | "warning"
    max_cost_usd: float | None
    max_per_hour: int | None


class ForbiddenConfig(TypedDict):
    version: int
    rules: list[ForbiddenRule]
    updated_at: str


class Violation(TypedDict):
    rule: ForbiddenRule
    detail: str
    timestamp: str


class AuditEntry(TypedDict, total=False):
    ts: str
    type: str  # "heartbeat" | "reactive" | "system"
    task: str | None
    chat_id: str | None
    violations: list[Violation]
    cost: float | None
    duration: int | None


class HealthCheckEndpoint(TypedDict, total=False):
    name: str
    url: str
    timeout_ms: int
    project: str


class MonitorDefinition(TypedDict):
    id: str
    name: str
    event_name: str
    interval_sec: int
    enabled: bool
    endpoints: list[HealthCheckEndpoint]
    failure_threshold: int
