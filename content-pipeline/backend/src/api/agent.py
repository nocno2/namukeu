"""Agent API router — dashboard integration for agent status & goals."""

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel

from src.agent.config import AgentConfigStore
from src.agent.goals import PROJECT_CODES, GoalStore
from src.config import Config

router = APIRouter(prefix="/api")


def get_goal_store() -> GoalStore:
    raise NotImplementedError


def get_config_store() -> AgentConfigStore:
    raise NotImplementedError


def get_config() -> Config:
    raise NotImplementedError


def verify_agent_token(
    authorization: str | None = Header(None),
    config: Config = Depends(get_config),
):
    expected = f"Bearer {config.agent_api_token}"
    if not authorization or authorization != expected:
        raise HTTPException(status_code=401, detail="Unauthorized")


# --- Status ---


@router.get("/status", dependencies=[Depends(verify_agent_token)])
def agent_status(cfg: AgentConfigStore = Depends(get_config_store)):
    return {
        "running": True,
        "runningTasks": [],
        "idleEnabled": cfg.get_bool("idle_enabled"),
        "chainingEnabled": cfg.get_bool("chaining_enabled"),
        "monitorsEnabled": cfg.get_bool("monitors_enabled"),
        "todayTaskCount": 0,
        "todayCost": 0.0,
        "lastTaskExecutedAt": None,
        "monitorStatus": None,
    }


# --- Toggles ---


class ToggleBody(BaseModel):
    enabled: bool


@router.post("/toggle/{feature}", dependencies=[Depends(verify_agent_token)])
def agent_toggle(
    feature: str,
    body: ToggleBody,
    cfg: AgentConfigStore = Depends(get_config_store),
):
    key_map = {"idle": "idle_enabled", "chain": "chaining_enabled", "monitors": "monitors_enabled"}
    key = key_map.get(feature)
    if not key:
        raise HTTPException(status_code=400, detail="Invalid feature")
    cfg.set_bool(key, body.enabled)
    return {"ok": True, feature: body.enabled}


# --- Goals CRUD ---


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


@router.delete("/goals/{goal_id}", dependencies=[Depends(verify_agent_token)])
def delete_goal(goal_id: str, store: GoalStore = Depends(get_goal_store)):
    if not store.delete_goal(goal_id):
        raise HTTPException(status_code=404, detail="Goal not found")
    return {"ok": True}
