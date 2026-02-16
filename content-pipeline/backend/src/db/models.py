from pydantic import BaseModel


class TaskCreate(BaseModel):
    name: str
    description: str | None = None
    task_type: str  # 'cron' | 'one-time' | 'pipeline'
    handler: str
    config: dict | None = None
    cron_expr: str | None = None
    enabled: bool = True


class TaskUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    task_type: str | None = None
    handler: str | None = None
    config: dict | None = None
    cron_expr: str | None = None
    enabled: bool | None = None


class PipelineRunRequest(BaseModel):
    keyword: str | None = None
    direction: str | None = None


class LoginRequest(BaseModel):
    username: str
    password: str
