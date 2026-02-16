"""Idle task strategies — weighted random selection. Port of agent-core/src/idle.ts"""

import random
from dataclasses import dataclass

from src.agent.goals import GoalStore
from src.agent.types import PROJECT_DIR_MAP

PROJECT_POOL = ["COIN", "BLOG", "DASH", "TRAIN", "TGBOT", "DCBOT"]


@dataclass
class IdleStrategy:
    id: str
    title: str
    category: str  # "maintenance" | "evolution"
    project: str  # ProjectCode or "RANDOM"
    prompt_template: str
    weight: float


DEFAULT_IDLE_STRATEGIES: list[IdleStrategy] = [
    IdleStrategy(
        id="code-review", title="코드 리뷰", category="maintenance",
        project="RANDOM", weight=3,
        prompt_template=(
            "{PROJECT} 프로젝트({PROJECT_DIR}/)의 코드를 리뷰해.\n\n"
            "다음 중 하나를 골라서 분석하고 짧게 보고해:\n"
            "- 에러 핸들링이 미흡한 곳\n- 타입 안전성 개선 가능한 곳\n"
            "- 중복 코드\n- 성능 개선 가능한 곳\n\n"
            "가장 중요한 이슈 1-2개만 보고. 코드를 실제로 읽고 분석해.\n{GOALS_CONTEXT}"
        ),
    ),
    IdleStrategy(
        id="dependency-check", title="의존성 점검", category="maintenance",
        project="RANDOM", weight=1,
        prompt_template=(
            "{PROJECT} 프로젝트({PROJECT_DIR}/)의 의존성을 점검해.\n"
            "- outdated 패키지가 있는지 확인\n- 보안 취약점이 있는지 확인\n"
            "- 불필요한 의존성이 있는지 확인\n\n결과를 간결하게 보고.\n{GOALS_CONTEXT}"
        ),
    ),
    IdleStrategy(
        id="doc-check", title="문서 점검", category="maintenance",
        project="RANDOM", weight=1,
        prompt_template=(
            "{PROJECT} 프로젝트({PROJECT_DIR}/)의 README.md와 CLAUDE.md를 확인하고 "
            "실제 코드와 일치하는지 점검해. 불일치하는 부분이 있으면 보고.\n{GOALS_CONTEXT}"
        ),
    ),
    IdleStrategy(
        id="test-check", title="테스트 점검", category="maintenance",
        project="RANDOM", weight=2,
        prompt_template=(
            "{PROJECT} 프로젝트({PROJECT_DIR}/)에 테스트가 있는지 확인하고, "
            "테스트가 없다면 가장 중요한 함수/모듈에 대해 테스트 추가를 제안해.\n"
            "테스트가 있다면 실행해서 결과를 보고.\n{GOALS_CONTEXT}"
        ),
    ),
    IdleStrategy(
        id="feature-idea", title="기능 제안", category="maintenance",
        project="RANDOM", weight=1,
        prompt_template=(
            "{PROJECT} 프로젝트({PROJECT_DIR}/)를 분석하고 구현하면 좋을 작은 개선 사항 1개를 제안해.\n\n"
            "제안에 포함할 내용:\n- 무엇을 왜 추가/변경할지\n- 코드 변경 범위\n\n"
            "작은 것부터 — 대규모 리팩터링은 피해.\n{GOALS_CONTEXT}"
        ),
    ),
    IdleStrategy(
        id="service-evolution", title="서비스 진화 제안", category="evolution",
        project="RANDOM", weight=3,
        prompt_template=(
            "{PROJECT} 프로젝트({PROJECT_DIR}/)를 서비스 관점에서 분석해.\n\n"
            "코드 품질이 아니라 사용자 가치와 서비스 성장을 기준으로 생각해:\n"
            "- 사용자 경험을 개선할 수 있는 점\n"
            "- 현재 기능을 확장하거나 조합해서 새로운 가치를 만들 수 있는 점\n"
            "- 비슷한 서비스들의 트렌드에서 배울 수 있는 점\n"
            "- 자동화하면 사용자가 편해질 수 있는 반복 작업\n\n"
            "가장 임팩트 있는 제안 1개를 구체적으로 설명해.\n{GOALS_CONTEXT}"
        ),
    ),
    IdleStrategy(
        id="user-flow-analysis", title="사용자 흐름 분석", category="evolution",
        project="RANDOM", weight=2,
        prompt_template=(
            "{PROJECT} 프로젝트({PROJECT_DIR}/)의 주요 사용자 흐름을 코드에서 추적해.\n\n"
            "- 사용자가 가장 자주 하는 동작은 무엇인지\n"
            "- 그 과정에서 불편하거나 단계가 많은 부분이 있는지\n"
            "- 더 직관적으로 바꿀 수 있는 UX가 있는지\n\n"
            "코드를 실제로 읽고 구체적인 개선안 1개를 제안.\n{GOALS_CONTEXT}"
        ),
    ),
    IdleStrategy(
        id="goal-next-step", title="목표 다음 단계 제안", category="evolution",
        project="RANDOM", weight=3,
        prompt_template=(
            "{PROJECT} 프로젝트({PROJECT_DIR}/)의 현재 상태와 목표를 분석해.\n{GOALS_CONTEXT}\n\n"
            "프로젝트 목표를 달성하기 위해 지금 바로 실행할 수 있는 구체적인 다음 단계 1개를 제안해.\n"
            "- 현재 어디까지 와 있는지 (코드 기반 판단)\n"
            "- 목표까지 무엇이 부족한지\n- 다음에 할 일과 그 이유\n\n"
            "추상적이지 않게, 실제 파일/함수 수준으로 구체적으로."
        ),
    ),
]

# Recent execution history (deduplication)
_recent_history: list[str] = []
MAX_HISTORY = 3


def _record_history(strategy_id: str):
    _recent_history.append(strategy_id)
    if len(_recent_history) > MAX_HISTORY:
        _recent_history.pop(0)


def select_idle_strategy(
    strategies: list[IdleStrategy] | None = None,
    goal_store: GoalStore | None = None,
    project: str | None = None,
) -> tuple[IdleStrategy, str]:
    strats = strategies or DEFAULT_IDLE_STRATEGIES
    selected_project = project or random.choice(PROJECT_POOL)

    has_goals = False
    if goal_store:
        has_goals = len(goal_store.get_by_project(selected_project)) > 0

    evolution_boost = 2.5 if has_goals else 0.4

    adjusted: list[tuple[IdleStrategy, float]] = []
    for s in strats:
        w = s.weight
        if s.category == "evolution":
            w *= evolution_boost
        else:
            w *= (0.4 if has_goals else 2.5)

        # Penalize recently used strategies
        try:
            recent_idx = len(_recent_history) - 1 - _recent_history[::-1].index(s.id)
            recency = len(_recent_history) - recent_idx
            w *= 0.1 * recency
        except ValueError:
            pass

        if s.id == "goal-next-step" and not has_goals:
            w = 0

        adjusted.append((s, max(w, 0)))

    total_weight = sum(w for _, w in adjusted)
    if total_weight == 0:
        return strats[0], selected_project

    rand = random.random() * total_weight
    selected = adjusted[0][0]
    for s, w in adjusted:
        rand -= w
        if rand <= 0:
            selected = s
            break

    _record_history(selected.id)
    return selected, selected_project


def build_idle_prompt(
    strategy: IdleStrategy,
    project: str,
    goal_store: GoalStore | None = None,
) -> str:
    goals_context = ""
    if goal_store:
        goals = goal_store.get_by_project(project)
        if goals:
            goals_context = (
                "\n현재 프로젝트 목표:\n"
                + "\n".join(
                    f"- [{g['priority'].upper()}] {g['title']}"
                    + (f" (공유: {', '.join(g['projects'])})" if len(g["projects"]) > 1 else "")
                    for g in goals
                )
                + "\n\n이 목표들을 고려하여 분석/제안해."
            )

    chain_instruction = (
        "\n\n## 제안 실행\n"
        "제안할 내용이 있으면, 반드시 아래 태그로 구현 태스크를 등록해:\n"
        "[CHAIN: 태스크 제목 | PROMPT: 구체적인 구현 지시 | APPROVAL: true]\n"
        "APPROVAL: true로 설정하면 사용자 승인 후에만 실행됨.\n"
        "PROMPT에는 제안을 실행하기 위한 구체적인 지시를 넣어 (파일 경로, 변경 내용 등).\n"
        "제안 내용을 설명한 뒤 마지막에 태그를 넣어."
    )

    return (
        strategy.prompt_template
        .replace("{PROJECT}", project)
        .replace("{PROJECT_DIR}", PROJECT_DIR_MAP.get(project, "."))
        .replace("{GOALS_CONTEXT}", goals_context)
        + chain_instruction
    )
