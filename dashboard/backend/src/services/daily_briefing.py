import logging
import os
import sqlite3
from datetime import datetime, timedelta
from html import escape as html_escape
from pathlib import Path

import httpx

from src.core.config import Config
from src.core.database import Database
from src.services.health_checker import check_all_services

logger = logging.getLogger(__name__)

BLOG_DB_PATH = os.environ.get(
    "BLOG_DB_PATH",
    "/Users/namwook/Documents/namukeu/ai-blog/data/blog.db",
)


async def collect_briefing_data(config: Config, db: Database) -> dict:
    """모든 서비스 상태 + 24시간 메트릭을 수집하여 브리핑 데이터 생성"""
    now = datetime.now()
    since_24h = now - timedelta(hours=24)
    data: dict = {"generated_at": now.isoformat(), "sections": {}}

    # 1. 서비스 상태
    try:
        results = await check_all_services(config.services)
        data["sections"]["services"] = results
    except Exception as e:
        logger.error(f"서비스 상태 수집 실패: {e}")
        data["sections"]["services"] = []

    # 2. 24시간 업타임 %
    uptimes = {}
    for svc in config.services:
        metrics = db.get_metrics(svc.name, since_24h)
        if metrics:
            total = len(metrics)
            running = sum(1 for m in metrics if m["status"] == "running")
            uptimes[svc.name] = {
                "display_name": svc.display_name,
                "percent": round((running / total) * 100, 1),
            }
        else:
            uptimes[svc.name] = {
                "display_name": svc.display_name,
                "percent": None,
            }
    data["sections"]["uptimes"] = uptimes

    # 3. 24시간 이벤트 요약
    events = db.get_events(since_24h, limit=500)
    event_summary = {"total": len(events), "by_severity": {}}
    for ev in events:
        sev = ev["severity"]
        event_summary["by_severity"][sev] = event_summary["by_severity"].get(sev, 0) + 1
    data["sections"]["events"] = event_summary

    # 4. 코인 수익 (proxy/coin → /status)
    data["sections"]["coin"] = await _fetch_coin_status(config)

    # 5. 블로그 트래픽
    data["sections"]["blog"] = _fetch_blog_traffic()

    # 6. 기차 예약
    data["sections"]["train"] = await _fetch_train_summary(config)

    # 7. Claude 사용량
    data["sections"]["claude"] = await _fetch_claude_usage()

    return data


async def _fetch_coin_status(config: Config) -> dict | None:
    svc = next((s for s in config.services if s.name == "coin-auto-trade"), None)
    if not svc or not svc.status_token:
        return None
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"http://127.0.0.1:{svc.port}/status",
                headers={"Authorization": f"Bearer {svc.status_token}"},
                timeout=5.0,
            )
            if resp.status_code == 200:
                return resp.json()
    except Exception as e:
        logger.warning(f"코인 상태 조회 실패: {e}")
    return None


def _fetch_blog_traffic() -> dict | None:
    if not Path(BLOG_DB_PATH).exists():
        return None
    try:
        conn = sqlite3.connect(f"file:{BLOG_DB_PATH}?mode=ro", uri=True)
        conn.row_factory = sqlite3.Row

        today = datetime.now().strftime("%Y-%m-%d")
        today_views = conn.execute(
            "SELECT COUNT(*) as cnt FROM page_views WHERE created_at >= ?", (today,)
        ).fetchone()["cnt"]
        total_views = conn.execute("SELECT COUNT(*) as cnt FROM page_views").fetchone()["cnt"]

        week_ago = (datetime.now() - timedelta(days=7)).strftime("%Y-%m-%d")
        week_views = conn.execute(
            "SELECT COUNT(*) as cnt FROM page_views WHERE created_at >= ?", (week_ago,)
        ).fetchone()["cnt"]

        conn.close()
        return {
            "today_views": today_views,
            "total_views": total_views,
            "week_views": week_views,
        }
    except Exception as e:
        logger.warning(f"블로그 트래픽 조회 실패: {e}")
        return None


async def _fetch_train_summary(config: Config) -> dict | None:
    svc = next((s for s in config.services if s.name == "train-go"), None)
    if not svc or not svc.status_token:
        return None
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"http://127.0.0.1:{svc.port}/status",
                headers={"Authorization": f"Bearer {svc.status_token}"},
                timeout=5.0,
            )
            if resp.status_code == 200:
                return resp.json()
    except Exception as e:
        logger.warning(f"기차 예약 조회 실패: {e}")
    return None


async def _fetch_claude_usage() -> dict | None:
    import json
    import subprocess

    try:
        proc = subprocess.run(
            ["security", "find-generic-password", "-s", "Claude Code-credentials", "-w"],
            capture_output=True, text=True, timeout=5,
        )
        if proc.returncode != 0:
            return None
        creds = json.loads(proc.stdout.strip())
        token = creds.get("claudeAiOauth", {}).get("accessToken")
        if not token:
            return None

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
            if resp.status_code == 200:
                return resp.json()
    except Exception as e:
        logger.warning(f"Claude 사용량 조회 실패: {e}")
    return None


def _e(text) -> str:
    """HTML 이스케이프"""
    return html_escape(str(text))


def format_briefing_message(data: dict) -> str:
    """브리핑 데이터를 텔레그램 HTML 메시지로 포맷"""
    now = datetime.now()
    lines = [f"📊 <b>일일 브리핑</b> — {_e(now.strftime('%Y-%m-%d %H:%M'))}", ""]

    # 서비스 상태
    services = data["sections"].get("services", [])
    lines.append("<b>🖥 서비스 상태</b>")
    for svc in services:
        emoji = "🟢" if svc.get("status") == "running" else "🔴"
        latency = svc.get("latency_ms")
        latency_str = f" ({latency}ms)" if latency else ""
        lines.append(f"  {emoji} {_e(svc['display_name'])}{latency_str}")
    lines.append("")

    # 업타임
    uptimes = data["sections"].get("uptimes", {})
    lines.append("<b>📈 24시간 업타임</b>")
    for name, info in uptimes.items():
        pct = info["percent"]
        if pct is None:
            pct_str = "N/A"
        elif pct >= 99.9:
            pct_str = f"✅ {pct}%"
        elif pct >= 95:
            pct_str = f"⚠️ {pct}%"
        else:
            pct_str = f"❌ {pct}%"
        lines.append(f"  {_e(info['display_name'])}: {pct_str}")
    lines.append("")

    # 이벤트 요약
    ev = data["sections"].get("events", {})
    total_events = ev.get("total", 0)
    by_sev = ev.get("by_severity", {})
    critical = by_sev.get("critical", 0)
    warning = by_sev.get("warning", 0)
    lines.append("<b>🔔 24시간 이벤트</b>")
    lines.append(f"  총 {total_events}건 (🔴 {critical} / ⚠️ {warning})")
    lines.append("")

    # 코인
    coin = data["sections"].get("coin")
    if coin:
        lines.append("<b>💰 코인 자동매매</b>")
        mode = _e(coin.get("trading_mode", coin.get("mode", "unknown")))
        strategies = coin.get("active_strategies", 0)
        positions = coin.get("active_positions", 0)
        lines.append(f"  모드: {mode} / 전략: {strategies}개 / 포지션: {positions}개")
        pnl = coin.get("pnl_24h") or coin.get("total_pnl")
        if pnl is not None:
            sign = "+" if pnl >= 0 else ""
            lines.append(f"  수익: {sign}{pnl:,.0f}원")
        lines.append("")

    # 블로그
    blog = data["sections"].get("blog")
    if blog:
        lines.append("<b>📝 블로그 트래픽</b>")
        lines.append(f"  오늘: {blog['today_views']}뷰 / 주간: {blog['week_views']}뷰")
        lines.append(f"  누적: {blog['total_views']:,}뷰")
        lines.append("")

    # 기차
    train = data["sections"].get("train")
    if train:
        lines.append("<b>🚄 기차 예약</b>")
        active = train.get("active_macros", 0)
        total = train.get("total_reservations", 0)
        lines.append(f"  활성 매크로: {active}개 / 전체: {total}건")
        lines.append("")

    # Claude 사용량
    claude = data["sections"].get("claude")
    if claude:
        lines.append("<b>🤖 Claude 사용량</b>")
        daily = claude.get("dailySpend")
        limit = claude.get("dailyLimit")
        if daily is not None and limit is not None:
            daily_f = float(daily)
            limit_f = float(limit)
            pct = (daily_f / limit_f * 100) if limit_f > 0 else 0
            lines.append(f"  일일: ${daily_f:.2f} / ${limit_f:.2f} ({pct:.0f}%)")
        monthly = claude.get("monthlySpend")
        monthly_limit = claude.get("monthlyLimit")
        if monthly is not None and monthly_limit is not None:
            monthly_f = float(monthly)
            monthly_limit_f = float(monthly_limit)
            lines.append(f"  월간: ${monthly_f:.2f} / ${monthly_limit_f:.2f}")

    return "\n".join(lines)


async def send_telegram(text: str) -> bool:
    """텔레그램으로 메시지 발송 (HTML 파싱 모드)"""
    bot_token = os.environ.get("TELEGRAM_BOT_TOKEN", "")
    chat_id = os.environ.get("TELEGRAM_CHAT_ID", "")

    if not bot_token or not chat_id:
        logger.error("TELEGRAM_BOT_TOKEN 또는 TELEGRAM_CHAT_ID 미설정")
        return False

    url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
    payload = {
        "chat_id": chat_id,
        "text": text,
        "parse_mode": "HTML",
    }

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(url, json=payload, timeout=10.0)
            if resp.status_code != 200:
                logger.error(f"텔레그램 발송 실패: {resp.status_code} {resp.text}")
                return False
            return True
    except Exception as e:
        logger.error(f"텔레그램 발송 에러: {e}")
        return False
