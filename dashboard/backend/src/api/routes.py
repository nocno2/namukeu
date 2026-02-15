import json
import logging
import sqlite3
import subprocess
from datetime import datetime, timedelta
from pathlib import Path

import httpx
import psutil
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from src.api.auth import verify_session
from src.core.config import Config
from src.core.database import Database
from src.services.health_checker import check_all_services

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api")


def get_config() -> Config:
    raise NotImplementedError


def get_db() -> Database:
    raise NotImplementedError


@router.get("/services")
async def list_services(
    _=Depends(verify_session),
    config: Config = Depends(get_config),
):
    results = await check_all_services(config.services)
    return {"services": results}


@router.get("/services/{name}/status")
async def service_status(
    name: str,
    _=Depends(verify_session),
    config: Config = Depends(get_config),
):
    svc = next((s for s in config.services if s.name == name), None)
    if not svc:
        raise HTTPException(status_code=404, detail="Service not found")

    results = await check_all_services([svc])
    return results[0] if results else {"error": "Check failed"}


@router.get("/services/{name}/commits")
def service_commits(
    name: str,
    limit: int = 10,
    _=Depends(verify_session),
    config: Config = Depends(get_config),
):
    svc = next((s for s in config.services if s.name == name), None)
    if not svc or not svc.git_dir:
        raise HTTPException(status_code=404, detail="Service not found")

    limit = min(limit, 50)

    cmd = [
        "git", "log",
        f"--max-count={limit}",
        "--format=%H%n%h%n%s%n%an%n%aI%n---",
    ]
    if svc.git_codename:
        cmd.extend(["--grep", f"^\\[{svc.git_codename}"])

    try:
        proc = subprocess.run(
            cmd,
            cwd=svc.git_dir,
            capture_output=True,
            text=True,
            timeout=5,
        )
        if proc.returncode != 0:
            raise HTTPException(status_code=500, detail="git log failed")
    except FileNotFoundError:
        raise HTTPException(status_code=500, detail="git not found")

    commits = []
    entries = proc.stdout.strip().split("\n---\n")
    for entry in entries:
        lines = entry.strip().split("\n")
        if len(lines) >= 5:
            commits.append({
                "hash": lines[0],
                "short_hash": lines[1],
                "message": lines[2],
                "author": lines[3],
                "date": lines[4],
            })

    return {"service": name, "commits": commits}


@router.post("/services/{name}/restart")
def restart_service(
    name: str,
    _=Depends(verify_session),
    config: Config = Depends(get_config),
):
    svc = next((s for s in config.services if s.name == name), None)
    if not svc or not svc.launchd_label:
        raise HTTPException(status_code=404, detail="Service not found")

    if svc.type == "self":
        raise HTTPException(status_code=400, detail="Cannot restart self")

    try:
        stop = subprocess.run(
            ["launchctl", "stop", svc.launchd_label],
            capture_output=True, text=True, timeout=10,
        )
        start = subprocess.run(
            ["launchctl", "start", svc.launchd_label],
            capture_output=True, text=True, timeout=10,
        )
        if stop.returncode != 0 or start.returncode != 0:
            raise HTTPException(
                status_code=500,
                detail=f"stop: {stop.stderr.strip()}, start: {start.stderr.strip()}",
            )
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=500, detail="Restart timed out")

    logger.info(f"Restarted service: {name} ({svc.launchd_label})")
    return {"ok": True, "service": name}


class CardPrefUpdate(BaseModel):
    card_id: str
    collapsed: bool | None = None
    pinned: bool | None = None
    pin_order: int | None = None


@router.get("/cards/preferences")
def get_card_preferences(
    session: dict = Depends(verify_session),
    db: Database = Depends(get_db),
):
    prefs = db.get_card_preferences(session["username"])
    return {"preferences": {p["card_id"]: p for p in prefs}}


@router.put("/cards/preferences")
def update_card_preference(
    body: CardPrefUpdate,
    session: dict = Depends(verify_session),
    db: Database = Depends(get_db),
):
    db.set_card_preference(
        session["username"], body.card_id,
        collapsed=body.collapsed, pinned=body.pinned, pin_order=body.pin_order,
    )
    return {"ok": True}


def _get_claude_token() -> str | None:
    try:
        proc = subprocess.run(
            ["security", "find-generic-password", "-s", "Claude Code-credentials", "-w"],
            capture_output=True, text=True, timeout=5,
        )
        if proc.returncode != 0:
            return None
        creds = json.loads(proc.stdout.strip())
        return creds.get("claudeAiOauth", {}).get("accessToken")
    except Exception:
        return None


@router.get("/claude/usage")
async def claude_usage(_=Depends(verify_session)):
    token = _get_claude_token()
    if not token:
        raise HTTPException(status_code=500, detail="Claude token not found")

    async with httpx.AsyncClient() as client:
        resp = await client.get(
            "https://api.anthropic.com/api/oauth/usage",
            headers={
                "Authorization": f"Bearer {token}",
                "anthropic-beta": "oauth-2025-04-20",
                "Content-Type": "application/json",
            },
            timeout=10.0,
        )
        if resp.status_code != 200:
            raise HTTPException(status_code=502, detail="Claude API error")

        return resp.json()


# --- System Resources ---

# Prime cpu_percent on import so first call returns real value
psutil.cpu_percent(interval=None)


@router.get("/system/resources")
def system_resources(_=Depends(verify_session)):
    cpu = psutil.cpu_percent(interval=None)
    mem = psutil.virtual_memory()
    disk = psutil.disk_usage("/")
    return {
        "cpu_percent": cpu,
        "memory": {
            "total_gb": round(mem.total / (1024**3), 1),
            "used_gb": round(mem.used / (1024**3), 1),
            "percent": mem.percent,
        },
        "disk": {
            "total_gb": round(disk.total / (1024**3), 1),
            "used_gb": round(disk.used / (1024**3), 1),
            "percent": round(disk.percent, 1),
        },
    }


# --- Service Logs ---

@router.get("/services/{name}/logs")
def service_logs(
    name: str,
    lines: int = 50,
    _=Depends(verify_session),
    config: Config = Depends(get_config),
):
    svc = next((s for s in config.services if s.name == name), None)
    if not svc or not svc.error_log_path:
        raise HTTPException(status_code=404, detail="Service or log not found")

    lines = min(lines, 200)
    log_path = Path(svc.error_log_path)
    if not log_path.exists():
        return {"service": name, "lines": [], "total_size": 0}

    try:
        proc = subprocess.run(
            ["tail", f"-{lines}", str(log_path)],
            capture_output=True, text=True, timeout=5,
        )
        log_lines = proc.stdout.strip().split("\n") if proc.stdout.strip() else []
        total_size = log_path.stat().st_size
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    return {"service": name, "lines": log_lines, "total_size": total_size}


# --- Blog Traffic ---

BLOG_DB_PATH = "/Users/namwook/Documents/namukeu/ai-blog/data/blog.db"


@router.get("/blog/traffic")
def blog_traffic(_=Depends(verify_session)):
    if not Path(BLOG_DB_PATH).exists():
        raise HTTPException(status_code=503, detail="Blog DB not found")

    conn = sqlite3.connect(f"file:{BLOG_DB_PATH}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    try:
        today = datetime.now().strftime("%Y-%m-%d")
        today_views = conn.execute(
            "SELECT COUNT(*) as cnt FROM page_views WHERE created_at >= ?", (today,)
        ).fetchone()["cnt"]

        total_views = conn.execute("SELECT COUNT(*) as cnt FROM page_views").fetchone()["cnt"]

        top_posts = conn.execute("""
            SELECT pv.slug, p.title, COUNT(*) as views
            FROM page_views pv
            LEFT JOIN posts p ON pv.post_id = p.id
            GROUP BY pv.slug
            ORDER BY views DESC
            LIMIT 10
        """).fetchall()

        week_ago = (datetime.now() - timedelta(days=7)).strftime("%Y-%m-%d")
        daily_trend = conn.execute("""
            SELECT DATE(created_at) as date, COUNT(*) as views
            FROM page_views WHERE created_at >= ?
            GROUP BY DATE(created_at) ORDER BY date
        """, (week_ago,)).fetchall()

        return {
            "today_views": today_views,
            "total_views": total_views,
            "top_posts": [{"slug": r["slug"], "title": r["title"] or r["slug"], "views": r["views"]} for r in top_posts],
            "daily_trend": [{"date": r["date"], "views": r["views"]} for r in daily_trend],
        }
    finally:
        conn.close()


# --- Train Reservation Status ---

@router.get("/train/summary")
async def train_summary(
    _=Depends(verify_session),
    config: Config = Depends(get_config),
):
    svc = next((s for s in config.services if s.name == "train-go"), None)
    if not svc or not svc.status_token:
        raise HTTPException(status_code=503, detail="Train service not configured")

    base_url = f"http://127.0.0.1:{svc.port}"
    headers = {"Authorization": f"Bearer {svc.status_token}"}

    async with httpx.AsyncClient() as client:
        try:
            status_resp = await client.get(f"{base_url}/status", headers=headers, timeout=5.0)
            if status_resp.status_code != 200:
                raise HTTPException(status_code=502, detail="Train status API error")
            status = status_resp.json()
        except httpx.ConnectError:
            raise HTTPException(status_code=502, detail="Train service unavailable")

        reservations = []
        try:
            res_resp = await client.get(f"{base_url}/reservations", headers=headers, timeout=5.0)
            if res_resp.status_code == 200:
                reservations = res_resp.json()
        except Exception:
            pass

    active_ids = set(status.get("active_macro_ids", []))
    active = [r for r in reservations if r.get("id") in active_ids]
    recent = sorted(reservations, key=lambda r: r.get("created_at", ""), reverse=True)[:10]
    return {
        "active_macros": status.get("active_macros", 0),
        "active_reservations": active,
        "total_reservations": status.get("total_reservations", 0),
        "by_status": status.get("by_status", {}),
        "recent_reservations": recent,
    }


# --- LaunchAgent Schedule ---

LAUNCHD_LABELS = [
    ("com.namukeu.dashboard", "Dashboard"),
    ("com.namukeu.train-go", "Train Go"),
    ("com.namukeu.claude-telegram", "Claude Telegram"),
    ("com.namukeu.claude-discord", "Claude Discord"),
    ("com.namukeu.cloudflared", "Cloudflared"),
    ("com.namukeu.check-ip", "IP 변경 감지"),
]


@router.get("/system/launchagents")
def launchagent_status(_=Depends(verify_session)):
    agents = []
    for label, display in LAUNCHD_LABELS:
        info = {"label": label, "display_name": display, "status": "unknown", "pid": None, "last_exit": None}
        try:
            proc = subprocess.run(
                ["launchctl", "list", label],
                capture_output=True, text=True, timeout=5,
            )
            if proc.returncode == 0:
                info["status"] = "loaded"
                for line in proc.stdout.strip().split("\n"):
                    if '"PID"' in line:
                        try:
                            info["pid"] = int(line.split("=")[-1].strip().rstrip(";"))
                        except ValueError:
                            pass
                    if '"LastExitStatus"' in line:
                        try:
                            info["last_exit"] = int(line.split("=")[-1].strip().rstrip(";"))
                        except ValueError:
                            pass
            else:
                info["status"] = "not_loaded"
        except Exception:
            info["status"] = "error"
        agents.append(info)
    return {"agents": agents}


# --- Agent Control Proxy ---

AGENT_API_BASE = "http://127.0.0.1:8003"
AGENT_API_TOKEN = "agent-api-token"


def _agent_headers():
    return {"Authorization": f"Bearer {AGENT_API_TOKEN}"}


@router.get("/agent/status")
async def agent_status(_=Depends(verify_session)):
    async with httpx.AsyncClient() as client:
        try:
            r = await client.get(f"{AGENT_API_BASE}/api/status", headers=_agent_headers(), timeout=5.0)
            if r.status_code != 200:
                raise HTTPException(status_code=502, detail="Agent API error")
            return r.json()
        except httpx.ConnectError:
            raise HTTPException(status_code=502, detail="Agent API unavailable")


@router.post("/agent/toggle/{feature}")
async def agent_toggle(feature: str, body: dict, _=Depends(verify_session)):
    if feature not in ("idle", "chain", "monitors"):
        raise HTTPException(status_code=400, detail="Invalid feature")
    async with httpx.AsyncClient() as client:
        try:
            r = await client.post(
                f"{AGENT_API_BASE}/api/toggle/{feature}",
                json=body, headers=_agent_headers(), timeout=5.0,
            )
            return r.json()
        except httpx.ConnectError:
            raise HTTPException(status_code=502, detail="Agent API unavailable")


@router.get("/agent/goals")
async def agent_goals(_=Depends(verify_session)):
    async with httpx.AsyncClient() as client:
        try:
            r = await client.get(f"{AGENT_API_BASE}/api/goals", headers=_agent_headers(), timeout=5.0)
            return r.json()
        except httpx.ConnectError:
            raise HTTPException(status_code=502, detail="Agent API unavailable")


@router.post("/agent/goals")
async def agent_create_goal(body: dict, _=Depends(verify_session)):
    async with httpx.AsyncClient() as client:
        try:
            r = await client.post(
                f"{AGENT_API_BASE}/api/goals",
                json=body, headers=_agent_headers(), timeout=5.0,
            )
            if r.status_code not in (200, 201):
                raise HTTPException(status_code=r.status_code, detail=r.text)
            return r.json()
        except httpx.ConnectError:
            raise HTTPException(status_code=502, detail="Agent API unavailable")


@router.put("/agent/goals/{goal_id}")
async def agent_update_goal(goal_id: str, body: dict, _=Depends(verify_session)):
    async with httpx.AsyncClient() as client:
        try:
            r = await client.put(
                f"{AGENT_API_BASE}/api/goals/{goal_id}",
                json=body, headers=_agent_headers(), timeout=5.0,
            )
            return r.json()
        except httpx.ConnectError:
            raise HTTPException(status_code=502, detail="Agent API unavailable")


@router.delete("/agent/goals/{goal_id}")
async def agent_delete_goal(goal_id: str, _=Depends(verify_session)):
    async with httpx.AsyncClient() as client:
        try:
            r = await client.delete(
                f"{AGENT_API_BASE}/api/goals/{goal_id}",
                headers=_agent_headers(), timeout=5.0,
            )
            return r.json()
        except httpx.ConnectError:
            raise HTTPException(status_code=502, detail="Agent API unavailable")
