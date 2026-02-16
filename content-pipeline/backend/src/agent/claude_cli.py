"""Claude CLI subprocess wrapper — asyncio port of claude-telegram/src/claude.ts"""

import asyncio
import json
import logging
import os
import re
import time
from typing import Callable

from src.agent.types import ClaudeResult

logger = logging.getLogger(__name__)

PROGRESS_INTERVAL_SEC = 30
INITIAL_FEEDBACK_SEC = 15
INACTIVITY_WARN_SEC = 180

HOME = os.environ.get("HOME", "")


def _build_args(
    claude_path: str,
    prompt: str,
    session_id: str,
    is_new_session: bool,
    system_prompt: str | None = None,
    model: str | None = None,
) -> list[str]:
    args = [
        claude_path,
        "-p", prompt,
        "--verbose",
        "--output-format", "stream-json",
        "--dangerously-skip-permissions",
    ]

    if is_new_session:
        args.extend(["--session-id", session_id])
    else:
        args.extend(["--resume", session_id])

    if system_prompt:
        args.extend(["--append-system-prompt", system_prompt])

    if model:
        args.extend(["--model", model])

    return args


def _build_env(project_dir: str | None = None) -> dict[str, str]:
    env = dict(os.environ)
    env.pop("CLAUDECODE", None)
    env["PATH"] = (
        f"{HOME}/.local/bin:{HOME}/.bun/bin:/usr/local/bin:/usr/bin:/bin:"
        + env.get("PATH", "")
    )
    return env


async def call_claude(
    prompt: str,
    session_id: str,
    is_new_session: bool = True,
    system_prompt: str | None = None,
    claude_path: str = "claude",
    cwd: str | None = None,
    model: str | None = None,
    on_progress: Callable[[str], None] | None = None,
) -> ClaudeResult:
    args = _build_args(claude_path, prompt, session_id, is_new_session, system_prompt, model)
    env = _build_env(cwd)

    try:
        proc = await asyncio.create_subprocess_exec(
            *args,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=cwd,
            env=env,
        )

        result = await _parse_stream(proc.stdout, on_progress)

        stderr_bytes = await proc.stderr.read() if proc.stderr else b""
        stderr = stderr_bytes.decode("utf-8", errors="replace")
        exit_code = await proc.wait()

        if exit_code != 0 and not result["result"]:
            logger.error(f"Claude CLI exited with code {exit_code}: {stderr[:200]}")

            if not is_new_session and _is_session_not_found(stderr):
                logger.info(f"Session {session_id} not found, creating new session")
                return await call_claude(
                    prompt, session_id, True, system_prompt,
                    claude_path, cwd, model, on_progress,
                )

            if _is_session_in_use(stderr):
                logger.warning(f"Session {session_id} already in use, retrying as new")
                return await call_claude(
                    prompt, session_id, True, system_prompt,
                    claude_path, cwd, model, on_progress,
                )

            return ClaudeResult(
                success=False, result="", session_id=session_id,
                error=(stderr or f"Claude exited with code {exit_code}")[:500],
                cost_usd=None, duration_ms=None,
            )

        return ClaudeResult(
            success=True,
            result=result["result"],
            session_id=result.get("session_id") or session_id,
            error=None,
            cost_usd=result.get("cost_usd"),
            duration_ms=result.get("duration_ms"),
        )

    except Exception as e:
        return ClaudeResult(
            success=False, result="", session_id=session_id,
            error=f"Could not run Claude CLI: {e}",
            cost_usd=None, duration_ms=None,
        )


async def _parse_stream(
    stdout: asyncio.StreamReader | None,
    on_progress: Callable[[str], None] | None = None,
) -> dict:
    if not stdout:
        return {"result": "", "session_id": None, "cost_usd": None, "duration_ms": None}

    session_id = None
    final_result = None
    cost_usd = None
    duration_ms = None
    text_blocks: list[str] = []

    last_progress_time = time.time()
    recent_activities: list[str] = []
    last_data_time = time.time()
    inactivity_warned = False
    initial_feedback_sent = False
    completed = False

    # Initial feedback timer
    initial_task = None
    watchdog_task = None

    async def initial_feedback():
        nonlocal initial_feedback_sent
        await asyncio.sleep(INITIAL_FEEDBACK_SEC)
        if not completed and not initial_feedback_sent and on_progress:
            initial_feedback_sent = True
            on_progress("\u23f3 처리 중입니다...")

    async def watchdog():
        nonlocal inactivity_warned
        while not completed:
            await asyncio.sleep(30)
            if completed:
                break
            elapsed = time.time() - last_data_time
            if elapsed >= INACTIVITY_WARN_SEC and not inactivity_warned and on_progress:
                inactivity_warned = True
                mins = int(elapsed / 60)
                on_progress(f"\u26a0\ufe0f 응답 대기 중... ({mins}분 이상 활동 없음)")

    if on_progress:
        initial_task = asyncio.create_task(initial_feedback())
        watchdog_task = asyncio.create_task(watchdog())

    def check_progress():
        nonlocal last_progress_time, recent_activities
        if not on_progress:
            return
        now = time.time()
        if now - last_progress_time >= PROGRESS_INTERVAL_SEC and recent_activities:
            summary = " → ".join(recent_activities[-3:])
            on_progress(f"\u23f3 {summary}")
            recent_activities = []
            last_progress_time = now

    def process_event(event: dict):
        nonlocal session_id, final_result, cost_usd, duration_ms
        nonlocal last_progress_time

        if event.get("type") == "system" and event.get("subtype") == "init":
            session_id = event.get("session_id")
            return

        if event.get("type") == "assistant":
            message = event.get("message", {})
            for block in message.get("content", []):
                if block.get("type") == "tool_use":
                    activity = _describe_tool_use(block.get("name", ""), block.get("input", {}))
                    recent_activities.append(activity)
                    check_progress()
                if block.get("type") == "text" and block.get("text"):
                    text_blocks.append(block["text"])
                    if on_progress:
                        for m in re.finditer(r"\[PROGRESS:\s*(.+?)\]", block["text"], re.I):
                            on_progress(f"\u23f3 {m.group(1)}")
                            last_progress_time = time.time()

        if event.get("type") == "result":
            final_result = event.get("result", "")
            session_id = event.get("session_id") or session_id
            cost_usd = event.get("total_cost_usd")
            duration_ms = event.get("duration_ms")

    try:
        buffer = ""
        while True:
            chunk = await stdout.read(8192)
            if not chunk:
                break

            last_data_time = time.time()
            inactivity_warned = False

            buffer += chunk.decode("utf-8", errors="replace")
            lines = buffer.split("\n")
            buffer = lines.pop()

            for line in lines:
                trimmed = line.strip()
                if not trimmed:
                    continue
                try:
                    event = json.loads(trimmed)
                    process_event(event)
                except json.JSONDecodeError:
                    pass

        # Process remaining buffer
        if buffer.strip():
            try:
                event = json.loads(buffer.strip())
                process_event(event)
            except json.JSONDecodeError:
                pass
    finally:
        completed = True
        if initial_task:
            initial_task.cancel()
        if watchdog_task:
            watchdog_task.cancel()

    result = final_result or "\n\n".join(text_blocks) or ""

    return {
        "result": result,
        "session_id": session_id,
        "cost_usd": cost_usd,
        "duration_ms": duration_ms,
    }


def _describe_tool_use(name: str, input_data: dict) -> str:
    match name:
        case "Bash":
            return f"Running: {(input_data.get('command', ''))[:60]}"
        case "Read":
            return f"Reading: {_short_path(input_data.get('file_path'))}"
        case "Edit":
            return f"Editing: {_short_path(input_data.get('file_path'))}"
        case "Write":
            return f"Writing: {_short_path(input_data.get('file_path'))}"
        case "Glob":
            return f"Searching: {input_data.get('pattern', 'files')}"
        case "Grep":
            return f"Searching: {(input_data.get('pattern', ''))[:40]}"
        case "WebSearch":
            return f"Searching web: {(input_data.get('query', ''))[:40]}"
        case "WebFetch":
            return f"Fetching: {(input_data.get('url', ''))[:50]}"
        case "Task":
            return f"Running sub-task: {(input_data.get('description', ''))[:40]}"
        case _:
            return f"Using {name}"


def _short_path(path: str | None) -> str:
    if not path:
        return "file"
    parts = path.split("/")
    return "/".join(parts[-2:]) if len(parts) > 2 else path


def _is_session_not_found(stderr: str) -> bool:
    lower = stderr.lower()
    return any(s in lower for s in [
        "no conversation found",
        "session not found",
        "could not find session",
    ])


def _is_session_in_use(stderr: str) -> bool:
    return "is already in use" in stderr
