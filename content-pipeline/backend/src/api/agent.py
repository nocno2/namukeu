"""Agent API router — heartbeat control, tasks CRUD, goals, audit, forbidden."""

from datetime import datetime

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel

from src.agent.audit import AuditLog
from src.agent.config import AgentConfigStore
from src.agent.evolution import EvolutionEngine
from src.agent.forbidden import ForbiddenActions
from src.agent.goals import PROJECT_CODES, GoalStore
from src.agent.heartbeat import Heartbeat
from src.agent.tasks import TaskStore
from src.config import Config

router = APIRouter(prefix="/api")


# ─── Dependency stubs (overridden in main.py lifespan) ───


def get_goal_store() -> GoalStore:
    raise NotImplementedError


def get_config_store() -> AgentConfigStore:
    raise NotImplementedError


def get_config() -> Config:
    raise NotImplementedError


def get_heartbeat() -> Heartbeat | None:
    raise NotImplementedError


def get_task_store() -> TaskStore:
    raise NotImplementedError


def get_audit_log() -> AuditLog:
    raise NotImplementedError


def get_forbidden() -> ForbiddenActions:
    raise NotImplementedError


def get_evolution_engine() -> EvolutionEngine | None:
    raise NotImplementedError


def verify_agent_token(
    authorization: str | None = Header(None),
    config: Config = Depends(get_config),
):
    expected = f"Bearer {config.agent_api_token}"
    if not authorization or authorization != expected:
        raise HTTPException(status_code=401, detail="Unauthorized")


# ─── Status ───


@router.get("/status", dependencies=[Depends(verify_agent_token)])
async def agent_status(
    hb: Heartbeat | None = Depends(get_heartbeat),
):
    if hb:
        return await hb.get_status()
    return {
        "running": False,
        "runningTasks": [],
        "idleEnabled": False,
        "chainingEnabled": False,
        "monitorsEnabled": False,
        "evolutionEnabled": False,
        "todayTaskCount": 0,
        "todayCost": 0.0,
        "lastTaskExecutedAt": None,
        "monitorStatus": None,
    }


# ─── Toggles ───


class ToggleBody(BaseModel):
    enabled: bool


@router.post("/toggle/{feature}", dependencies=[Depends(verify_agent_token)])
def agent_toggle(
    feature: str,
    body: ToggleBody,
    cfg: AgentConfigStore = Depends(get_config_store),
    hb: Heartbeat | None = Depends(get_heartbeat),
):
    key_map = {"idle": "idle_enabled", "chain": "chaining_enabled", "monitors": "monitors_enabled", "evolution": "evolution_enabled"}
    key = key_map.get(feature)
    if not key:
        raise HTTPException(status_code=400, detail="Invalid feature")
    cfg.set_bool(key, body.enabled)

    # Sync to heartbeat
    if hb:
        if feature == "idle":
            hb.set_idle_enabled(body.enabled)
        elif feature == "chain":
            hb.set_chaining_enabled(body.enabled)
        elif feature == "monitors":
            hb.set_monitors_enabled(body.enabled)
        elif feature == "evolution":
            hb.set_evolution_enabled(body.enabled)

    return {"ok": True, feature: body.enabled}


# ─── Agent Tasks CRUD ───


class TaskCreate(BaseModel):
    title: str
    prompt: str
    type: str = "one-time"
    project: str = "GENERAL"
    schedule_cron: str | None = None
    schedule_at: str | None = None
    event_trigger: str | None = None
    notify_user: bool = True
    requires_approval: bool = False
    max_runs: int | None = None


@router.get("/agent-tasks", dependencies=[Depends(verify_agent_token)])
def list_agent_tasks(
    ts: TaskStore = Depends(get_task_store),
    active_only: bool = True,
):
    return ts.get_active() if active_only else ts.get_all()


@router.post("/agent-tasks", status_code=201, dependencies=[Depends(verify_agent_token)])
def create_agent_task(
    body: TaskCreate,
    ts: TaskStore = Depends(get_task_store),
):
    return ts.create_task(
        title=body.title,
        prompt=body.prompt,
        task_type=body.type,
        project=body.project,
        schedule_cron=body.schedule_cron,
        schedule_at=body.schedule_at,
        event_trigger=body.event_trigger,
        notify_user=body.notify_user,
        requires_approval=body.requires_approval,
        max_runs=body.max_runs,
    )


class TaskUpdate(BaseModel):
    title: str | None = None
    prompt: str | None = None
    project: str | None = None
    schedule_cron: str | None = None


@router.get("/agent-tasks/{task_id}", dependencies=[Depends(verify_agent_token)])
def get_agent_task(
    task_id: str,
    ts: TaskStore = Depends(get_task_store),
):
    task = ts.get_by_id(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


@router.put("/agent-tasks/{task_id}", dependencies=[Depends(verify_agent_token)])
def update_agent_task(
    task_id: str,
    body: TaskUpdate,
    ts: TaskStore = Depends(get_task_store),
):
    task = ts.get_by_id(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    updates = body.model_dump(exclude_none=True)
    if not updates:
        return task
    # Recalculate schedule_next if cron changed
    if "schedule_cron" in updates and updates["schedule_cron"]:
        from src.agent.cron import get_next_cron_time
        updates["schedule_next"] = get_next_cron_time(updates["schedule_cron"]).isoformat()
    ts.update_task(task_id, updates)
    return ts.get_by_id(task_id)


@router.delete("/agent-tasks/{task_id}", dependencies=[Depends(verify_agent_token)])
def delete_agent_task(
    task_id: str,
    ts: TaskStore = Depends(get_task_store),
):
    ts.delete_task(task_id)
    return {"ok": True}


@router.post("/agent-tasks/{task_id}/cancel", dependencies=[Depends(verify_agent_token)])
def cancel_agent_task(
    task_id: str,
    ts: TaskStore = Depends(get_task_store),
):
    # Support both full ID and 8-char prefix
    if len(task_id) < 36:
        all_tasks = ts.get_active()
        match = next((t for t in all_tasks if t["id"].startswith(task_id)), None)
        if match:
            task_id = match["id"]
    if not ts.cancel_task(task_id):
        raise HTTPException(status_code=404, detail="Task not found or already completed")
    return {"ok": True}


@router.post("/agent-tasks/{task_id}/approve", dependencies=[Depends(verify_agent_token)])
def approve_agent_task(
    task_id: str,
    ts: TaskStore = Depends(get_task_store),
):
    # Support 8-char prefix
    if len(task_id) < 36:
        all_tasks = ts.get_active()
        match = next((t for t in all_tasks if t["id"].startswith(task_id) and t["requires_approval"]), None)
        if not match:
            raise HTTPException(status_code=404, detail="Approval-pending task not found")
        task_id = match["id"]
    ts.update_task(task_id, {
        "requires_approval": False,
        "schedule_next": datetime.now().isoformat(),
    })
    return {"ok": True}


@router.post("/agent-tasks/approve-all", dependencies=[Depends(verify_agent_token)])
def approve_all_tasks(
    ts: TaskStore = Depends(get_task_store),
):
    pending = [t for t in ts.get_active() if t["requires_approval"]]
    now = datetime.now().isoformat()
    for t in pending:
        ts.update_task(t["id"], {"requires_approval": False, "schedule_next": now})
    return {"ok": True, "count": len(pending)}


# ─── Heartbeat Control ───


@router.post("/heartbeat/stop", dependencies=[Depends(verify_agent_token)])
def stop_heartbeat(hb: Heartbeat | None = Depends(get_heartbeat)):
    if hb:
        hb.stop()
        return {"ok": True, "status": "stopped"}
    raise HTTPException(status_code=500, detail="Heartbeat not initialized")


@router.post("/heartbeat/resume", dependencies=[Depends(verify_agent_token)])
async def resume_heartbeat(hb: Heartbeat | None = Depends(get_heartbeat)):
    if hb:
        await hb.resume()
        return {"ok": True, "status": "running"}
    raise HTTPException(status_code=500, detail="Heartbeat not initialized")


# ─── Events ───


class FireEventBody(BaseModel):
    event: str
    context: str | None = None


@router.post("/fire-event", dependencies=[Depends(verify_agent_token)])
async def fire_event(
    body: FireEventBody,
    hb: Heartbeat | None = Depends(get_heartbeat),
):
    if not hb:
        raise HTTPException(status_code=500, detail="Heartbeat not initialized")
    await hb.fire_event(body.event, body.context)
    return {"ok": True}


# ─── Audit ───


@router.get("/audit", dependencies=[Depends(verify_agent_token)])
def get_audit(
    limit: int = 20,
    audit: AuditLog = Depends(get_audit_log),
):
    return audit.get_recent(limit)


# ─── Forbidden ───


@router.get("/forbidden", dependencies=[Depends(verify_agent_token)])
def get_forbidden_rules(fb: ForbiddenActions = Depends(get_forbidden)):
    return fb.get_rules()


# ─── Monitors ───


@router.get("/monitors", dependencies=[Depends(verify_agent_token)])
def get_monitors(hb: Heartbeat | None = Depends(get_heartbeat)):
    if hb and hb._monitor_system:
        return hb._monitor_system.get_status()
    return {"monitors": []}


# ─── Goals CRUD ───


class GoalCreate(BaseModel):
    title: str
    description: str
    projects: list[str]
    priority: str = "medium"
    deadline: str | None = None


class GoalUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    projects: list[str] | None = None
    priority: str | None = None
    deadline: str | None = None
    progress: str | None = None
    status: str | None = None


@router.get("/goals", dependencies=[Depends(verify_agent_token)])
def list_goals(store: GoalStore = Depends(get_goal_store)):
    return store.get_all()


@router.get("/goals/{goal_id}", dependencies=[Depends(verify_agent_token)])
def get_goal(goal_id: str, store: GoalStore = Depends(get_goal_store)):
    if goal_id.upper() in PROJECT_CODES:
        return store.get_by_project(goal_id.upper())
    goal = store.get_by_id(goal_id)
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    return goal


@router.post("/goals", status_code=201, dependencies=[Depends(verify_agent_token)])
def create_goal(body: GoalCreate, store: GoalStore = Depends(get_goal_store)):
    return store.create_goal(
        title=body.title,
        description=body.description,
        projects=body.projects,
        priority=body.priority,
        deadline=body.deadline,
    )


@router.put("/goals/{goal_id}", dependencies=[Depends(verify_agent_token)])
def update_goal(goal_id: str, body: GoalUpdate, store: GoalStore = Depends(get_goal_store)):
    updates = body.model_dump(exclude_none=True)
    goal = store.update_goal(goal_id, updates)
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    return goal


@router.post("/goals/{goal_id}/approve", dependencies=[Depends(verify_agent_token)])
def approve_goal(goal_id: str, store: GoalStore = Depends(get_goal_store)):
    goal = store.get_by_id(goal_id)
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    if goal["status"] != "proposed":
        raise HTTPException(status_code=400, detail="Goal is not in proposed state")
    result = store.approve_goal(goal_id)
    return result


@router.delete("/goals/{goal_id}", dependencies=[Depends(verify_agent_token)])
def delete_goal(
    goal_id: str,
    store: GoalStore = Depends(get_goal_store),
    evo: EvolutionEngine | None = Depends(get_evolution_engine),
):
    goal = store.get_by_id(goal_id)
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    # Track rejected evolution proposals
    if evo and goal.get("source") == "evolution":
        for p in goal["projects"]:
            evo.record_rejected(p, goal["title"])
    if not store.delete_goal(goal_id):
        raise HTTPException(status_code=404, detail="Goal not found")
    return {"ok": True}


# ─── Evolution State ───


@router.get("/evolution/state", dependencies=[Depends(verify_agent_token)])
def evolution_state(evo: EvolutionEngine | None = Depends(get_evolution_engine)):
    if not evo:
        return {"states": []}
    return {"states": evo.get_all_states()}
