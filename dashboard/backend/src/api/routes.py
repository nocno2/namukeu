import json
import logging
import os
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
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=500, detail="git log timed out")

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


@router.get("/services/{name}/uptime")
def service_uptime(
    name: str,
    hours: int = 24,
    _=Depends(verify_session),
    config: Config = Depends(get_config),
    db: Database = Depends(get_db),
):
    svc = next((s for s in config.services if s.name == name), None)
    if not svc:
        raise HTTPException(status_code=404, detail="Service not found")

    hours = min(hours, 168)  # max 7 days
    since = datetime.now() - timedelta(hours=hours)
    metrics = db.get_metrics(name, since)

    if not metrics:
        return {"service": name, "hours": hours, "blocks": [], "uptime_percent": None}

    # Divide the time range into blocks (1 block per 30 minutes for 24h = 48 blocks)
    block_minutes = 30
    total_blocks = (hours * 60) // block_minutes
    blocks = []

    for i in range(total_blocks):
        block_start = since + timedelta(minutes=i * block_minutes)
        block_end = block_start + timedelta(minutes=block_minutes)
        block_start_iso = block_start.isoformat()
        block_end_iso = block_end.isoformat()

        block_metrics = [
            m for m in metrics
            if block_start_iso <= m["timestamp"] < block_end_iso
        ]

        if not block_metrics:
            blocks.append({"status": "no_data", "start": block_start_iso})
        else:
            running = sum(1 for m in block_metrics if m["status"] == "running")
            down = sum(1 for m in block_metrics if m["status"] == "down")
            blocks.append({
                "status": "running" if running >= down else "down",
                "start": block_start_iso,
            })

    # Overall uptime percentage
    total_with_data = sum(1 for b in blocks if b["status"] != "no_data")
    running_blocks = sum(1 for b in blocks if b["status"] == "running")
    uptime_percent = round((running_blocks / total_with_data) * 100, 1) if total_with_data > 0 else None

    return {
        "service": name,
        "hours": hours,
        "blocks": blocks,
        "uptime_percent": uptime_percent,
    }


@router.get("/services/{name}/incidents")
def service_incidents(
    name: str,
    days: int = 30,
    _=Depends(verify_session),
    config: Config = Depends(get_config),
    db: Database = Depends(get_db),
):
    svc = next((s for s in config.services if s.name == name), None)
    if not svc:
        raise HTTPException(status_code=404, detail="Service not found")

    days = min(days, 90)
    since = datetime.now() - timedelta(days=days)
    incidents = db.get_incidents(name, since)

    return {"service": name, "days": days, "incidents": incidents}


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


CLAUDE_SETTINGS_PATH = Path.home() / ".claude" / "settings.json"


def _get_minimax_api_key() -> str:
    """load_dotenv() 이후에 호출되도록 런타임에 읽음."""
    return os.environ.get("MINIMAX_API_KEY", "")


def _read_claude_settings() -> dict:
    if CLAUDE_SETTINGS_PATH.exists():
        try:
            return json.loads(CLAUDE_SETTINGS_PATH.read_text())
        except Exception:
            pass
    return {}


def _write_claude_settings(settings: dict) -> None:
    CLAUDE_SETTINGS_PATH.parent.mkdir(parents=True, exist_ok=True)
    CLAUDE_SETTINGS_PATH.write_text(json.dumps(settings, indent=2))


@router.get("/claude/model")
def get_claude_model(_=Depends(verify_session)):
    settings = _read_claude_settings()
    env = settings.get("env", {})
    base_url = env.get("ANTHROPIC_BASE_URL", "")
    if "minimax" in base_url:
        return {"model": "minimax", "display": "MiniMax M2.5"}
    return {"model": "claude", "display": "Claude"}


class ModelSwitchBody(BaseModel):
    model: str  # "claude" or "minimax"


@router.post("/claude/model")
def set_claude_model(body: ModelSwitchBody, _=Depends(verify_session)):
    settings = _read_claude_settings()
    env = settings.get("env", {})

    if body.model == "minimax":
        # ANTHROPIC_AUTH_TOKEN 필수 — MiniMax는 Authorization 헤더로 인증
        env["ANTHROPIC_BASE_URL"] = "https://api.minimax.io/anthropic"
        env["ANTHROPIC_API_KEY"] = _get_minimax_api_key()
        env["ANTHROPIC_AUTH_TOKEN"] = _get_minimax_api_key()
        env["API_TIMEOUT_MS"] = "3000000"
        env["CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC"] = 1
        env["ANTHROPIC_MODEL"] = "MiniMax-M2.5"
        env["ANTHROPIC_SMALL_FAST_MODEL"] = "MiniMax-M2.5"
        env["ANTHROPIC_DEFAULT_SONNET_MODEL"] = "MiniMax-M2.5"
        env["ANTHROPIC_DEFAULT_OPUS_MODEL"] = "MiniMax-M2.5"
        env["ANTHROPIC_DEFAULT_HAIKU_MODEL"] = "MiniMax-M2.5"
    elif body.model == "claude":
        for key in [
            "ANTHROPIC_BASE_URL", "ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "API_TIMEOUT_MS",
            "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC", "ANTHROPIC_MODEL",
            "ANTHROPIC_SMALL_FAST_MODEL", "ANTHROPIC_DEFAULT_SONNET_MODEL",
            "ANTHROPIC_DEFAULT_OPUS_MODEL", "ANTHROPIC_DEFAULT_HAIKU_MODEL",
        ]:
            env.pop(key, None)
    else:
        raise HTTPException(status_code=400, detail="Invalid model. Use 'claude' or 'minimax'")

    if env:
        settings["env"] = env
    elif "env" in settings:
        del settings["env"]

    _write_claude_settings(settings)
    return {"ok": True, "model": body.model}


@router.get("/claude/usage")
async def claude_usage(_=Depends(verify_session)):
    token = _get_claude_token()
    if not token:
        raise HTTPException(status_code=500, detail="Claude token not found")

    try:
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
    except httpx.ConnectError:
        raise HTTPException(status_code=502, detail="Claude API unreachable")
    except httpx.TimeoutException:
        raise HTTPException(status_code=502, detail="Claude API timed out")


@router.get("/minimax/usage")
async def minimax_usage(_=Depends(verify_session)):
    api_key = _get_minimax_api_key()
    if not api_key:
        raise HTTPException(status_code=500, detail="MiniMax API key not found")

    try:
        async with httpx.AsyncClient(
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Accept": "application/json",
                "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
                "Referer": "https://www.minimax.io/",
            }
        ) as client:
            resp = await client.get(
                "https://www.minimax.io/v1/api/openplatform/coding_plan/remains",
                timeout=10.0,
            )
            if resp.status_code != 200:
                logger.warning(f"MiniMax API returned {resp.status_code}: {resp.text[:200]}")
                raise HTTPException(status_code=502, detail="MiniMax API error")

            data = resp.json()
            return data
    except httpx.HTTPError as e:
        logger.error(f"MiniMax API error: {e}")
        raise HTTPException(status_code=502, detail="MiniMax API error")


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

    try:
        conn = sqlite3.connect(f"file:{BLOG_DB_PATH}?mode=ro", uri=True)
        conn.row_factory = sqlite3.Row
    except sqlite3.Error as e:
        raise HTTPException(status_code=503, detail=f"Blog DB unavailable: {e}")

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
    except sqlite3.Error as e:
        raise HTTPException(status_code=503, detail=f"Blog DB query error: {e}")
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
        except (httpx.ConnectError, httpx.TimeoutException):
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


@router.delete("/train/reservations/{reservation_id}")
async def cancel_train_reservation(
    reservation_id: int,
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
            resp = await client.delete(
                f"{base_url}/reservations/{reservation_id}",
                headers=headers, timeout=5.0,
            )
            if resp.status_code == 404:
                raise HTTPException(status_code=404, detail="Reservation not found")
            if resp.status_code != 200:
                raise HTTPException(status_code=502, detail="Train cancel API error")
            return resp.json()
        except (httpx.ConnectError, httpx.TimeoutException):
            raise HTTPException(status_code=502, detail="Train service unavailable")


# --- Scheduled Tasks (crontab 기반) ---

import re
from datetime import datetime, timezone
from pathlib import Path

# crontab 주석 → 표시 이름/설명 매핑 (command 키워드로 매칭)
CRON_META: dict[str, dict[str, str]] = {
    "run-pipeline.sh": {
        "display_name": "블로그 자동 발행",
        "description": "AI 블로그 글 자동 생성·발행",
    },
    "check_ip.sh": {
        "display_name": "IP 변경 감지",
        "description": "공인 IP 변경 시 텔레그램 알림",
    },
}


def _normalize_command(command: str) -> str:
    """크론탭 명령어에서 리다이렉트 제거 후 정규화"""
    return re.sub(r"\s*>>.*$", "", command).strip()


def _command_id(command: str) -> str:
    """정규화된 명령어를 짧은 MD5 해시로 변환 (URL-safe ID)"""
    import hashlib
    normalized = _normalize_command(command)
    return hashlib.md5(normalized.encode()).hexdigest()[:12]


def _parse_cron_schedule(minute: str, hour: str, dom: str, month: str, dow: str) -> str:
    """크론 필드 5개를 사람이 읽기 쉬운 한글로 변환"""
    # */N 분마다
    m = re.match(r"^\*/(\d+)$", minute)
    if m and hour == "*" and dom == "*" and month == "*" and dow == "*":
        return f"{m.group(1)}분마다"

    # 특정 시각
    if dom == "*" and month == "*" and dow == "*":
        hours = hour.split(",") if "," in hour else [hour]
        minutes = minute.split(",") if "," in minute else [minute]
        if len(hours) == 1 and hours[0] == "*":
            return f"매시 {minute}분"
        times = []
        for h in hours:
            for mn in minutes:
                times.append(f"{int(h)}:{int(mn):02d}")
        if len(times) == 1:
            return f"매일 {times[0]}"
        return f"매일 {', '.join(times)}"

    return f"{minute} {hour} {dom} {month} {dow}"


def _get_log_mtime(log_path: str) -> str | None:
    """로그 파일의 마지막 수정 시간을 ISO 형식으로 반환"""
    try:
        p = Path(log_path)
        if p.exists():
            mtime = p.stat().st_mtime
            return datetime.fromtimestamp(mtime, tz=timezone.utc).isoformat()
    except Exception:
        pass
    return None


def _extract_log_path(command: str) -> str | None:
    """크론 명령어에서 >> 리다이렉트 로그 경로 추출"""
    m = re.search(r">>\s*(\S+)", command)
    return m.group(1) if m else None


def _parse_crontab() -> list[dict]:
    """crontab -l 결과를 파싱해서 태스크 목록 반환. 같은 명령은 스케줄 병합."""
    try:
        proc = subprocess.run(
            ["crontab", "-l"], capture_output=True, text=True, timeout=5,
        )
        if proc.returncode != 0:
            return []
    except Exception:
        return []

    # 명령어 기준으로 그룹핑 (같은 스크립트 여러 시각 → 하나로 병합)
    grouped: dict[str, dict] = {}  # key: 정규화된 명령어

    for line in proc.stdout.strip().split("\n"):
        original_line = line
        line = line.strip()
        if not line:
            continue

        # 주석 처리된 크론 라인도 파싱 (비활성화된 태스크)
        is_disabled = line.startswith("#")
        if is_disabled:
            line = line[1:].strip()

        # 빈 주석이거나 설명 주석은 건너뜀 (크론 시간 필드로 시작하지 않으면 설명 주석)
        if not line:
            continue
        # 크론 라인은 숫자나 *로 시작해야 함 (분 필드)
        first_char = line[0] if line else ""
        if not (first_char.isdigit() or first_char == "*"):
            continue

        parts = line.split(None, 5)
        if len(parts) < 6:
            continue

        minute, hour, dom, month, dow = parts[:5]
        command = parts[5]

        # 로그 리다이렉트 제거 후 명령어 정규화 (같은 스크립트 판별용)
        cmd_normalized = _normalize_command(command)

        if cmd_normalized not in grouped:
            # 메타 정보 매칭
            meta = {"display_name": cmd_normalized[:30], "description": ""}
            for keyword, m in CRON_META.items():
                if keyword in command:
                    meta = m
                    break

            log_path = _extract_log_path(command)
            grouped[cmd_normalized] = {
                "id": _command_id(command),  # 짧은 해시 ID (URL-safe)
                "command": cmd_normalized,
                "display_name": meta["display_name"],
                "description": meta["description"],
                "schedules": [],
                "log_path": log_path,
                "enabled": not is_disabled,
            }
        else:
            # 같은 명령어의 다른 스케줄이 하나라도 활성화되어 있으면 enabled=True
            if not is_disabled:
                grouped[cmd_normalized]["enabled"] = True

        grouped[cmd_normalized]["schedules"].append((minute, hour, dom, month, dow))

    # 결과 조립
    tasks = []
    for entry in grouped.values():
        # 스케줄 병합: 같은 분 패턴이면 시간만 합침
        schedules = entry["schedules"]
        if len(schedules) > 1:
            # 모든 엔트리가 같은 minute/dom/month/dow면 시간만 합침
            minutes = set(s[0] for s in schedules)
            doms = set(s[2] for s in schedules)
            months = set(s[3] for s in schedules)
            dows = set(s[4] for s in schedules)
            if len(minutes) == 1 and len(doms) == 1 and len(months) == 1 and len(dows) == 1:
                merged_hours = ",".join(s[1] for s in schedules)
                schedule_str = _parse_cron_schedule(
                    schedules[0][0], merged_hours, schedules[0][2], schedules[0][3], schedules[0][4],
                )
            else:
                schedule_str = " / ".join(
                    _parse_cron_schedule(*s) for s in schedules
                )
        else:
            schedule_str = _parse_cron_schedule(*schedules[0])

        tasks.append({
            "id": entry["id"],
            "display_name": entry["display_name"],
            "description": entry["description"],
            "schedule": schedule_str,
            "last_run": _get_log_mtime(entry["log_path"]) if entry["log_path"] else None,
            "enabled": entry["enabled"],
        })

    return tasks


@router.get("/system/launchagents")
def scheduled_tasks_status(_=Depends(verify_session)):
    return {"tasks": _parse_crontab()}


class CronToggleRequest(BaseModel):
    enabled: bool


@router.post("/system/launchagents/{task_id}/toggle")
def toggle_scheduled_task(
    task_id: str,
    body: CronToggleRequest,
    _=Depends(verify_session),
):
    """크론탭 태스크를 활성화/비활성화 (주석 처리)"""
    try:
        # 현재 crontab 읽기
        proc = subprocess.run(
            ["crontab", "-l"], capture_output=True, text=True, timeout=5,
        )
        if proc.returncode != 0:
            raise HTTPException(status_code=500, detail="Failed to read crontab")

        lines = proc.stdout.strip().split("\n")
        modified = False
        new_lines = []

        for line in lines:
            original = line
            stripped = line.strip()

            # 빈 줄이나 설명 주석은 그대로 유지
            if not stripped or (stripped.startswith("#") and not any(c.isdigit() or c == "*" for c in stripped[:25])):
                new_lines.append(original)
                continue

            # 크론 라인인지 확인
            is_disabled = stripped.startswith("#")
            cron_line = stripped[1:].strip() if is_disabled else stripped

            parts = cron_line.split(None, 5)
            if len(parts) < 6:
                new_lines.append(original)
                continue

            command = parts[5]

            # 해시로 매칭 (task_id는 짧은 MD5 해시)
            if _command_id(command) == task_id:
                modified = True
                if body.enabled and is_disabled:
                    # 활성화: # 제거
                    new_lines.append(cron_line)
                elif not body.enabled and not is_disabled:
                    # 비활성화: # 추가
                    new_lines.append(f"# {cron_line}")
                else:
                    new_lines.append(original)
            else:
                new_lines.append(original)

        if not modified:
            raise HTTPException(status_code=404, detail="Task not found")

        # 새 crontab 적용 (임시 파일 경유 — macOS에서 stdin 방식이 블로킹됨)
        import tempfile, os
        new_crontab = "\n".join(new_lines) + "\n"
        with tempfile.NamedTemporaryFile(mode="w", suffix=".crontab", delete=False) as tf:
            tf.write(new_crontab)
            tmp_path = tf.name
        try:
            proc = subprocess.run(
                ["crontab", tmp_path],
                capture_output=True, text=True, timeout=5,
            )
        finally:
            os.unlink(tmp_path)
        if proc.returncode != 0:
            raise HTTPException(status_code=500, detail=f"Failed to update crontab: {proc.stderr}")

        logger.info(f"Toggled cron task {task_id} -> enabled={body.enabled}")
        return {"ok": True, "enabled": body.enabled}

    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=500, detail="crontab command timed out")
    except Exception as e:
        logger.error(f"Error toggling cron task: {e}")
        raise HTTPException(status_code=500, detail=str(e))


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
        except (httpx.ConnectError, httpx.TimeoutException):
            raise HTTPException(status_code=502, detail="Agent API unavailable")


@router.post("/agent/toggle/{feature}")
async def agent_toggle(feature: str, body: dict, _=Depends(verify_session)):
    if feature not in ("idle", "chain", "monitors", "evolution"):
        raise HTTPException(status_code=400, detail="Invalid feature")
    async with httpx.AsyncClient() as client:
        try:
            r = await client.post(
                f"{AGENT_API_BASE}/api/toggle/{feature}",
                json=body, headers=_agent_headers(), timeout=5.0,
            )
            return r.json()
        except (httpx.ConnectError, httpx.TimeoutException):
            raise HTTPException(status_code=502, detail="Agent API unavailable")


@router.get("/agent/goals")
async def agent_goals(_=Depends(verify_session)):
    async with httpx.AsyncClient() as client:
        try:
            r = await client.get(f"{AGENT_API_BASE}/api/goals", headers=_agent_headers(), timeout=5.0)
            return r.json()
        except (httpx.ConnectError, httpx.TimeoutException):
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
        except (httpx.ConnectError, httpx.TimeoutException):
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
        except (httpx.ConnectError, httpx.TimeoutException):
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
        except (httpx.ConnectError, httpx.TimeoutException):
            raise HTTPException(status_code=502, detail="Agent API unavailable")


@router.post("/agent/goals/{goal_id}/approve")
async def agent_approve_goal(goal_id: str, _=Depends(verify_session)):
    async with httpx.AsyncClient() as client:
        try:
            r = await client.post(
                f"{AGENT_API_BASE}/api/goals/{goal_id}/approve",
                headers=_agent_headers(), timeout=5.0,
            )
            if r.status_code == 404:
                raise HTTPException(status_code=404, detail="Goal not found")
            return r.json()
        except (httpx.ConnectError, httpx.TimeoutException):
            raise HTTPException(status_code=502, detail="Agent API unavailable")


# --- Agent Tasks Proxy ---


@router.get("/agent/tasks")
async def agent_tasks(active_only: bool = True, _=Depends(verify_session)):
    async with httpx.AsyncClient() as client:
        try:
            r = await client.get(
                f"{AGENT_API_BASE}/api/agent-tasks",
                params={"active_only": str(active_only).lower()},
                headers=_agent_headers(), timeout=5.0,
            )
            return r.json()
        except (httpx.ConnectError, httpx.TimeoutException):
            raise HTTPException(status_code=502, detail="Agent API unavailable")


@router.post("/agent/tasks")
async def agent_create_task(body: dict, _=Depends(verify_session)):
    async with httpx.AsyncClient() as client:
        try:
            r = await client.post(
                f"{AGENT_API_BASE}/api/agent-tasks",
                json=body,
                headers=_agent_headers(), timeout=5.0,
            )
            if r.status_code == 422:
                raise HTTPException(status_code=422, detail=r.json())
            return r.json()
        except (httpx.ConnectError, httpx.TimeoutException):
            raise HTTPException(status_code=502, detail="Agent API unavailable")


@router.post("/agent/tasks/approve-all")
async def agent_approve_all_tasks(_=Depends(verify_session)):
    async with httpx.AsyncClient() as client:
        try:
            r = await client.post(
                f"{AGENT_API_BASE}/api/agent-tasks/approve-all",
                headers=_agent_headers(), timeout=5.0,
            )
            return r.json()
        except (httpx.ConnectError, httpx.TimeoutException):
            raise HTTPException(status_code=502, detail="Agent API unavailable")


@router.get("/agent/tasks/{task_id}")
async def agent_task_detail(task_id: str, _=Depends(verify_session)):
    async with httpx.AsyncClient() as client:
        try:
            r = await client.get(
                f"{AGENT_API_BASE}/api/agent-tasks/{task_id}",
                headers=_agent_headers(), timeout=5.0,
            )
            if r.status_code == 404:
                raise HTTPException(status_code=404, detail="Task not found")
            return r.json()
        except (httpx.ConnectError, httpx.TimeoutException):
            raise HTTPException(status_code=502, detail="Agent API unavailable")


@router.put("/agent/tasks/{task_id}")
async def agent_update_task(task_id: str, body: dict, _=Depends(verify_session)):
    async with httpx.AsyncClient() as client:
        try:
            r = await client.put(
                f"{AGENT_API_BASE}/api/agent-tasks/{task_id}",
                json=body, headers=_agent_headers(), timeout=5.0,
            )
            if r.status_code == 404:
                raise HTTPException(status_code=404, detail="Task not found")
            return r.json()
        except (httpx.ConnectError, httpx.TimeoutException):
            raise HTTPException(status_code=502, detail="Agent API unavailable")


@router.post("/agent/tasks/{task_id}/approve")
async def agent_approve_task(task_id: str, _=Depends(verify_session)):
    async with httpx.AsyncClient() as client:
        try:
            r = await client.post(
                f"{AGENT_API_BASE}/api/agent-tasks/{task_id}/approve",
                headers=_agent_headers(), timeout=5.0,
            )
            if r.status_code == 404:
                raise HTTPException(status_code=404, detail="Task not found")
            return r.json()
        except (httpx.ConnectError, httpx.TimeoutException):
            raise HTTPException(status_code=502, detail="Agent API unavailable")


@router.post("/agent/tasks/{task_id}/cancel")
async def agent_cancel_task(task_id: str, _=Depends(verify_session)):
    async with httpx.AsyncClient() as client:
        try:
            r = await client.post(
                f"{AGENT_API_BASE}/api/agent-tasks/{task_id}/cancel",
                headers=_agent_headers(), timeout=5.0,
            )
            if r.status_code == 404:
                raise HTTPException(status_code=404, detail="Task not found")
            return r.json()
        except (httpx.ConnectError, httpx.TimeoutException):
            raise HTTPException(status_code=502, detail="Agent API unavailable")


@router.delete("/agent/tasks/{task_id}")
async def agent_delete_task(task_id: str, _=Depends(verify_session)):
    async with httpx.AsyncClient() as client:
        try:
            r = await client.delete(
                f"{AGENT_API_BASE}/api/agent-tasks/{task_id}",
                headers=_agent_headers(), timeout=5.0,
            )
            if r.status_code == 404:
                raise HTTPException(status_code=404, detail="Task not found")
            return r.json()
        except (httpx.ConnectError, httpx.TimeoutException):
            raise HTTPException(status_code=502, detail="Agent API unavailable")


@router.get("/agent/tasks/{task_id}/history")
async def agent_task_history(
    task_id: str,
    limit: int = 10,
    offset: int = 0,
    _=Depends(verify_session),
):
    async with httpx.AsyncClient() as client:
        try:
            r = await client.get(
                f"{AGENT_API_BASE}/api/history/task/{task_id}",
                params={"limit": limit, "offset": offset},
                headers=_agent_headers(), timeout=10.0,
            )
            if r.status_code == 404:
                raise HTTPException(status_code=404, detail="Task not found")
            return r.json()
        except (httpx.ConnectError, httpx.TimeoutException):
            raise HTTPException(status_code=502, detail="Agent API unavailable")


# --- n8n Status ---

N8N_BASE_URL = "https://n8n.namukeu.com"
N8N_API_KEY = os.environ.get("N8N_API_KEY", "")


def _get_n8n_headers() -> dict:
    headers = {"Content-Type": "application/json"}
    if N8N_API_KEY:
        headers["X-N8N-API-KEY"] = N8N_API_KEY
    return headers


@router.get("/n8n/status")
async def n8n_status(_=Depends(verify_session)):
    """n8n 상태 및 실행 통계 조회"""
    import logging
    logger = logging.getLogger(__name__)

    async with httpx.AsyncClient(verify=False) as client:
        # 1. Health check
        health_status = "down"
        try:
            resp = await client.get(f"{N8N_BASE_URL}/health", timeout=5.0)
            logger.info(f"n8n health response: {resp.status_code}, body: {resp.text[:100]}")
            if resp.status_code == 200:
                health_status = "running"
        except (httpx.ConnectError, httpx.TimeoutException) as e:
            logger.error(f"n8n health error: {e}")
            health_status = "down"

        if health_status == "down":
            return {"status": "down", "active_workflows": 0, "today_executions": 0, "last_execution": None}

        # 2. Get active workflows count
        active_workflows = 0
        try:
            resp = await client.get(
                f"{N8N_BASE_URL}/api/v1/workflows",
                params={"active": "true", "limit": 100},
                headers=_get_n8n_headers(),
                timeout=5.0,
            )
            logger.info(f"n8n workflows response: {resp.status_code}")
            if resp.status_code == 200:
                data = resp.json()
                logger.info(f"n8n workflows data: {data}")
                # n8n v1.x returns {"data": [...]}
                workflows = data.get("data", [])
                active_workflows = len(workflows)
        except Exception as e:
            logger.error(f"n8n workflows error: {e}")

        # 3. Get today's executions
        today = datetime.now().strftime("%Y-%m-%d")
        today_executions = 0
        success_count = 0
        fail_count = 0
        last_execution = None
        try:
            resp = await client.get(
                f"{N8N_BASE_URL}/api/v1/executions",
                params={"limit": 100},
                headers=_get_n8n_headers(),
                timeout=5.0,
            )
            if resp.status_code == 200:
                data = resp.json()
                for exec in data.get("data", []):
                    started = exec.get("startedAt", "")
                    if started.startswith(today):
                        today_executions += 1
                        status = exec.get("status", "")
                        if status == "success":
                            success_count += 1
                        elif status == "error":
                            fail_count += 1
                        if not last_execution:
                            last_execution = started
        except Exception:
            pass

        return {
            "status": health_status,
            "active_workflows": active_workflows,
            "today_executions": today_executions,
            "success_count": success_count,
            "fail_count": fail_count,
            "last_execution": last_execution,
        }
