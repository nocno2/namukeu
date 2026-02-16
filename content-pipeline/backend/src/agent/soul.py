"""SOUL.md loader + system prompt builder. Port of agent-core/src/soul.ts"""

from pathlib import Path


def load_soul(soul_path: str) -> str:
    try:
        return Path(soul_path).read_text("utf-8")
    except Exception:
        return ""


def build_agent_system_prompt(
    soul: str = "",
    forbidden_block: str = "",
    active_tasks_summary: str = "",
    user_name: str = "",
    current_time: str = "",
    goals_context: str = "",
    chaining_enabled: bool = False,
) -> str:
    parts: list[str] = []

    if soul:
        parts.append(soul)

    if user_name:
        parts.append(f"\nYou are speaking with {user_name}.")
    if current_time:
        parts.append(f"Current time: {current_time}")

    if forbidden_block:
        parts.append(f"\n{forbidden_block}")

    if goals_context:
        parts.append(f"\nPROJECT GOALS:\n{goals_context}")

    if active_tasks_summary:
        parts.append(f"\nACTIVE TASKS:\n{active_tasks_summary}")

    parts.append(
        "\nAUTONOMOUS MODE:"
        "\nYou are running as an autonomous agent. You are executing a scheduled task."
        "\nBe concise in your response. Focus on the task at hand."
        "\nYour response will be sent directly to the user via messaging."
    )

    if chaining_enabled:
        parts.append(
            "\nTASK CHAINING:"
            "\nIf your current task reveals a follow-up action needed, you can chain a new task:"
            "\n[CHAIN: task title | PROMPT: what to do | DELAY: minutes | APPROVAL: true/false]"
            "\nDELAY is optional (default: 5 minutes). APPROVAL: true requires user approval."
            "\nUse APPROVAL: true for significant changes. Use chaining sparingly."
            "\nChains are depth-limited to prevent infinite loops."
        )

    return "\n".join(parts)
