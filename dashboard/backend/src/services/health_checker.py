import asyncio
import logging
import subprocess
import time
from datetime import datetime

import httpx

from src.core.config import ServiceDef

logger = logging.getLogger(__name__)


async def check_http_service(service: ServiceDef, client: httpx.AsyncClient) -> dict:
    result = {
        "name": service.name,
        "display_name": service.display_name,
        "description": service.description,
        "type": service.type,
        "port": service.port,
        "status": "down",
        "details": None,
        "dashboard_url": service.dashboard_url,
        "checked_at": datetime.now().isoformat(),
    }

    # Health check
    start_time = time.time()
    try:
        resp = await client.get(service.health_url, timeout=5.0)
        latency_ms = round((time.time() - start_time) * 1000)
        result["latency_ms"] = latency_ms
        if resp.status_code == 200:
            result["status"] = "running"
    except Exception:
        result["status"] = "down"
        result["latency_ms"] = round((time.time() - start_time) * 1000)
        return result

    # Status (detailed info)
    if service.status_url and service.status_token:
        try:
            resp = await client.get(
                service.status_url,
                headers={"Authorization": f"Bearer {service.status_token}"},
                timeout=5.0,
            )
            if resp.status_code == 200:
                result["details"] = resp.json()
        except Exception as e:
            logger.debug(f"Status check failed for {service.name}: {e}")

    return result


def check_process_service(service: ServiceDef) -> dict:
    result = {
        "name": service.name,
        "display_name": service.display_name,
        "description": service.description,
        "type": service.type,
        "port": service.port,
        "status": "down",
        "details": None,
        "dashboard_url": service.dashboard_url,
        "checked_at": datetime.now().isoformat(),
    }

    if not service.launchd_label and not service.process_cwd:
        return result

    # Try launchd first
    if service.launchd_label:
        try:
            proc = subprocess.run(
                ["launchctl", "list", service.launchd_label],
                capture_output=True,
                text=True,
                timeout=5,
            )
            if proc.returncode == 0:
                result["status"] = "running"
                for line in proc.stdout.strip().split("\n"):
                    if '"PID"' in line:
                        pid = line.split("=")[-1].strip().rstrip(";")
                        result["details"] = {"pid": pid}
                        break
                return result
        except Exception as e:
            logger.debug(f"launchd check failed for {service.name}: {e}")

    # Fallback: find bun process whose cwd matches service directory
    if service.process_cwd:
        try:
            proc = subprocess.run(
                ["/usr/sbin/lsof", "-d", "cwd", "-c", "bun", "-Fpn"],
                capture_output=True,
                text=True,
                timeout=5,
            )
            if proc.returncode == 0:
                current_pid = None
                for line in proc.stdout.split("\n"):
                    if line.startswith("p"):
                        current_pid = line[1:]
                    elif line.startswith("n") and current_pid:
                        if line[1:] == service.process_cwd:
                            result["status"] = "running"
                            result["details"] = {"pid": current_pid}
                            break
        except Exception as e:
            logger.debug(f"lsof check failed for {service.name}: {e}")

    return result


async def check_all_services(services: list[ServiceDef]) -> list[dict]:
    results = []
    async with httpx.AsyncClient() as client:
        tasks = []
        process_services = []

        for svc in services:
            if svc.type == "http":
                tasks.append(check_http_service(svc, client))
            elif svc.type == "process":
                process_services.append(svc)
            elif svc.type == "self":
                results.append({
                    "name": svc.name,
                    "display_name": svc.display_name,
                    "description": svc.description,
                    "type": svc.type,
                    "port": svc.port,
                    "status": "running",
                    "details": None,
                    "dashboard_url": svc.dashboard_url,
                    "checked_at": datetime.now().isoformat(),
                })

        # Run HTTP checks concurrently
        if tasks:
            http_results = await asyncio.gather(*tasks)
            results.extend(http_results)

        # Run process checks (sync, but fast)
        for svc in process_services:
            results.append(check_process_service(svc))

    return results
