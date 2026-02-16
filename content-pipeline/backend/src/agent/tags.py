"""Tag processing — [TASK:], [CHAIN:], [CANCEL_TASK:], [PROGRESS:],
[GOAL_PROPOSE:], [GOAL_PROGRESS:] from Claude responses.
Port of agent-core/src/tags.ts (memory tags excluded — handled by telegram bot)."""

import re

from src.agent.cron import is_valid_cron
from src.agent.goals import GoalStore
from src.agent.tasks import TaskStore


class TagProcessResult:
    def __init__(self):
        self.clean_text: str = ""
        self.tasks_created: list[str] = []
        self.tasks_cancelled: list[str] = []
        self.goals_proposed: list[str] = []
        self.goals_updated: list[str] = []


def process_tags(
    response: str,
    task_store: TaskStore | None = None,
    goal_store: GoalStore | None = None,
    current_project: str = "GENERAL",
    chain_depth: int = 0,
    max_chain_depth: int = 2,
) -> TagProcessResult:
    result = TagProcessResult()
    clean = response

    # [TASK: title | CRON: expr | PROMPT: text]
    for match in re.finditer(
        r"\[TASK:\s*(.+?)\s*\|\s*CRON:\s*(.+?)\s*\|\s*PROMPT:\s*(.+?)\]",
        response, re.IGNORECASE,
    ):
        if task_store and is_valid_cron(match.group(2).strip()):
            task = task_store.create_task(
                title=match.group(1).strip(),
                prompt=match.group(3).strip(),
                task_type="recurring",
                schedule_cron=match.group(2).strip(),
            )
            result.tasks_created.append(task["title"])
        clean = clean.replace(match.group(0), "")

    # [TASK: title | AT: datetime | PROMPT: text]
    for match in re.finditer(
        r"\[TASK:\s*(.+?)\s*\|\s*AT:\s*(.+?)\s*\|\s*PROMPT:\s*(.+?)\]",
        response, re.IGNORECASE,
    ):
        if task_store:
            task = task_store.create_task(
                title=match.group(1).strip(),
                prompt=match.group(3).strip(),
                task_type="one-time",
                schedule_at=match.group(2).strip(),
            )
            result.tasks_created.append(task["title"])
        clean = clean.replace(match.group(0), "")

    # [CANCEL_TASK: search text]
    for match in re.finditer(
        r"\[CANCEL_TASK:\s*(.+?)\]", response, re.IGNORECASE,
    ):
        if task_store:
            task = task_store.find_by_title(match.group(1).strip())
            if task and task_store.cancel_task(task["id"]):
                result.tasks_cancelled.append(task["title"])
        clean = clean.replace(match.group(0), "")

    # [CHAIN: title | PROMPT: text | DELAY: minutes | APPROVAL: true/false]
    for match in re.finditer(
        r"\[CHAIN:\s*(.+?)\s*\|\s*PROMPT:\s*(.+?)"
        r"(?:\s*\|\s*DELAY:\s*(\d+))?"
        r"(?:\s*\|\s*APPROVAL:\s*(true|false))?\]",
        response, re.IGNORECASE,
    ):
        if task_store and chain_depth < max_chain_depth:
            from datetime import datetime, timedelta
            delay_min = int(match.group(3) or "5")
            requires_approval = (match.group(4) or "").lower() == "true"
            schedule_at = (datetime.now() + timedelta(minutes=delay_min)).isoformat()
            task = task_store.create_task(
                title=match.group(1).strip(),
                prompt=match.group(2).strip(),
                task_type="one-time",
                project=current_project,
                schedule_at=schedule_at,
                notify_user=True,
                requires_approval=requires_approval,
                chain_depth=chain_depth + 1,
            )
            prefix = "\U0001f512" if requires_approval else "\u26d3"
            result.tasks_created.append(f"{prefix} {task['title']}")
        clean = clean.replace(match.group(0), "")

    # [GOAL_PROPOSE: title | DESC: description | PRIORITY: high/medium/low]
    for match in re.finditer(
        r"\[GOAL_PROPOSE:\s*(.+?)\s*\|\s*DESC:\s*(.+?)\s*\|\s*PRIORITY:\s*(high|medium|low)\]",
        response, re.IGNORECASE,
    ):
        if goal_store:
            projects = [current_project] if current_project != "GENERAL" else ["GENERAL"]
            goal = goal_store.create_goal(
                title=match.group(1).strip(),
                description=match.group(2).strip(),
                projects=projects,
                priority=match.group(3).strip().lower(),
                source="evolution",
            )
            result.goals_proposed.append(goal["title"])
        clean = clean.replace(match.group(0), "")

    # [GOAL_PROGRESS: search | PROGRESS: text]
    for match in re.finditer(
        r"\[GOAL_PROGRESS:\s*(.+?)\s*\|\s*PROGRESS:\s*(.+?)\]",
        response, re.IGNORECASE,
    ):
        if goal_store:
            search = match.group(1).strip().lower()
            progress_text = match.group(2).strip()
            all_goals = goal_store.get_active()
            target = next((g for g in all_goals if search in g["title"].lower()), None)
            if target:
                goal_store.update_goal(target["id"], {"progress": progress_text})
                result.goals_updated.append(target["title"])
        clean = clean.replace(match.group(0), "")

    # Strip [PROGRESS: ...] tags
    clean = re.sub(r"\[PROGRESS:\s*.+?\]", "", clean, flags=re.IGNORECASE)

    result.clean_text = clean.strip()
    return result
