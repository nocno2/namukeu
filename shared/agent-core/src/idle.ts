import type { ProjectCode } from "./types";
import type { GoalStore } from "./goals";

export interface IdleStrategy {
  id: string;
  title: string;
  category: "maintenance" | "evolution";
  project: ProjectCode | "RANDOM";
  promptTemplate: string;
  weight: number;
}

export const DEFAULT_IDLE_STRATEGIES: IdleStrategy[] = [
  // ─── 유지보수 (maintenance) ───
  {
    id: "code-review",
    title: "코드 리뷰",
    category: "maintenance",
    project: "RANDOM",
    weight: 3,
    promptTemplate:
      "{PROJECT} 프로젝트({PROJECT_DIR}/)의 코드를 리뷰해.\n\n" +
      "다음 중 하나를 골라서 분석하고 짧게 보고해:\n" +
      "- 에러 핸들링이 미흡한 곳\n" +
      "- 타입 안전성 개선 가능한 곳\n" +
      "- 중복 코드\n" +
      "- 성능 개선 가능한 곳\n\n" +
      "가장 중요한 이슈 1-2개만 보고. 코드를 실제로 읽고 분석해.\n{GOALS_CONTEXT}",
  },
  {
    id: "dependency-check",
    title: "의존성 점검",
    category: "maintenance",
    project: "RANDOM",
    weight: 1,
    promptTemplate:
      "{PROJECT} 프로젝트({PROJECT_DIR}/)의 의존성을 점검해.\n" +
      "- outdated 패키지가 있는지 확인\n" +
      "- 보안 취약점이 있는지 확인\n" +
      "- 불필요한 의존성이 있는지 확인\n\n" +
      "결과를 간결하게 보고.\n{GOALS_CONTEXT}",
  },
  {
    id: "doc-check",
    title: "문서 점검",
    category: "maintenance",
    project: "RANDOM",
    weight: 1,
    promptTemplate:
      "{PROJECT} 프로젝트({PROJECT_DIR}/)의 README.md와 CLAUDE.md를 확인하고 " +
      "실제 코드와 일치하는지 점검해. 불일치하는 부분이 있으면 보고.\n{GOALS_CONTEXT}",
  },
  {
    id: "test-check",
    title: "테스트 점검",
    category: "maintenance",
    project: "RANDOM",
    weight: 2,
    promptTemplate:
      "{PROJECT} 프로젝트({PROJECT_DIR}/)에 테스트가 있는지 확인하고, " +
      "테스트가 없다면 가장 중요한 함수/모듈에 대해 테스트 추가를 제안해.\n" +
      "테스트가 있다면 실행해서 결과를 보고.\n{GOALS_CONTEXT}",
  },
  {
    id: "feature-idea",
    title: "기능 제안",
    category: "maintenance",
    project: "RANDOM",
    weight: 1,
    promptTemplate:
      "{PROJECT} 프로젝트({PROJECT_DIR}/)를 분석하고 구현하면 좋을 작은 개선 사항 1개를 제안해.\n\n" +
      "제안에 포함할 내용:\n" +
      "- 무엇을 왜 추가/변경할지\n" +
      "- 코드 변경 범위\n\n" +
      "작은 것부터 — 대규모 리팩터링은 피해.\n{GOALS_CONTEXT}",
  },

  // ─── 서비스 진화 (evolution) ───
  {
    id: "service-evolution",
    title: "서비스 진화 제안",
    category: "evolution",
    project: "RANDOM",
    weight: 3,
    promptTemplate:
      "{PROJECT} 프로젝트({PROJECT_DIR}/)를 서비스 관점에서 분석해.\n\n" +
      "코드 품질이 아니라 사용자 가치와 서비스 성장을 기준으로 생각해:\n" +
      "- 사용자 경험을 개선할 수 있는 점\n" +
      "- 현재 기능을 확장하거나 조합해서 새로운 가치를 만들 수 있는 점\n" +
      "- 비슷한 서비스들의 트렌드에서 배울 수 있는 점\n" +
      "- 자동화하면 사용자가 편해질 수 있는 반복 작업\n\n" +
      "가장 임팩트 있는 제안 1개를 구체적으로 설명해. 왜 그게 중요한지, 어떻게 구현할지까지.\n{GOALS_CONTEXT}",
  },
  {
    id: "user-flow-analysis",
    title: "사용자 흐름 분석",
    category: "evolution",
    project: "RANDOM",
    weight: 2,
    promptTemplate:
      "{PROJECT} 프로젝트({PROJECT_DIR}/)의 주요 사용자 흐름을 코드에서 추적해.\n\n" +
      "- 사용자가 가장 자주 하는 동작은 무엇인지\n" +
      "- 그 과정에서 불편하거나 단계가 많은 부분이 있는지\n" +
      "- 더 직관적으로 바꿀 수 있는 UX가 있는지\n\n" +
      "코드를 실제로 읽고 구체적인 개선안 1개를 제안.\n{GOALS_CONTEXT}",
  },
  {
    id: "goal-next-step",
    title: "목표 다음 단계 제안",
    category: "evolution",
    project: "RANDOM",
    weight: 3,
    promptTemplate:
      "{PROJECT} 프로젝트({PROJECT_DIR}/)의 현재 상태와 목표를 분석해.\n{GOALS_CONTEXT}\n\n" +
      "프로젝트 목표를 달성하기 위해 지금 바로 실행할 수 있는 구체적인 다음 단계 1개를 제안해.\n" +
      "- 현재 어디까지 와 있는지 (코드 기반 판단)\n" +
      "- 목표까지 무엇이 부족한지\n" +
      "- 다음에 할 일과 그 이유\n\n" +
      "추상적이지 않게, 실제 파일/함수 수준으로 구체적으로.",
  },
];

const PROJECT_POOL: ProjectCode[] = ["COIN", "BLOG", "DASH", "TRAIN", "TGBOT", "DCBOT"];

const PROJECT_DIR_MAP: Record<ProjectCode, string> = {
  COIN: "coin-auto-trade",
  BLOG: "ai-blog",
  DASH: "dashboard",
  TRAIN: "train-go",
  TGBOT: "claude-telegram",
  DCBOT: "claude-discord",
  GENERAL: ".",
};

// ─── 최근 실행 히스토리 (연속 중복 방지) ───
const recentHistory: string[] = [];
const MAX_HISTORY = 3;

function recordHistory(strategyId: string): void {
  recentHistory.push(strategyId);
  if (recentHistory.length > MAX_HISTORY) recentHistory.shift();
}

export function selectIdleStrategy(
  strategies: IdleStrategy[] = DEFAULT_IDLE_STRATEGIES,
  goalStore?: GoalStore,
  project?: ProjectCode,
): { strategy: IdleStrategy; project: ProjectCode } {
  // 1. 프로젝트 먼저 선택
  const selectedProject = project ??
    PROJECT_POOL[Math.floor(Math.random() * PROJECT_POOL.length)];

  // 2. 목표 유무에 따라 카테고리 가중치 결정
  const hasGoals = goalStore
    ? goalStore.getByProject(selectedProject).length > 0
    : false;

  // 목표 있으면 evolution 70%, 없으면 maintenance 70%
  const evolutionBoost = hasGoals ? 2.5 : 0.4;

  // 3. 동적 가중치 계산
  const adjusted = strategies.map((s) => {
    let w = s.weight;

    // 카테고리 부스트
    if (s.category === "evolution") w *= evolutionBoost;
    else w *= (hasGoals ? 0.4 : 2.5);

    // 최근 실행된 전략 페널티 (연속 방지)
    const recentIndex = recentHistory.lastIndexOf(s.id);
    if (recentIndex >= 0) {
      // 최근일수록 강한 페널티
      const recency = recentHistory.length - recentIndex;
      w *= 0.1 * recency; // 가장 최근이면 0.1배, 2번째면 0.2배, 3번째면 0.3배
    }

    // goal-next-step은 목표가 없으면 0
    if (s.id === "goal-next-step" && !hasGoals) w = 0;

    return { strategy: s, weight: Math.max(w, 0) };
  });

  // 4. 가중치 기반 선택
  const totalWeight = adjusted.reduce((sum, a) => sum + a.weight, 0);
  if (totalWeight === 0) {
    // fallback
    return { strategy: strategies[0], project: selectedProject };
  }

  let rand = Math.random() * totalWeight;
  let selected = adjusted[0].strategy;

  for (const a of adjusted) {
    rand -= a.weight;
    if (rand <= 0) {
      selected = a.strategy;
      break;
    }
  }

  // 5. 히스토리 기록
  recordHistory(selected.id);

  return { strategy: selected, project: selectedProject };
}

export function buildIdlePrompt(
  strategy: IdleStrategy,
  project: ProjectCode,
  goalStore?: GoalStore
): string {
  let goalsContext = "";
  if (goalStore) {
    const goals = goalStore.getByProject(project);
    if (goals.length > 0) {
      goalsContext = "\n현재 프로젝트 목표:\n" +
        goals.map((g) => {
          const shared = g.projects.length > 1 ? ` (공유: ${g.projects.join(", ")})` : "";
          return `- [${g.priority.toUpperCase()}] ${g.title}${shared}`;
        }).join("\n") +
        "\n\n이 목표들을 고려하여 분석/제안해.";
    }
  }

  const chainInstruction =
    "\n\n## 제안 실행\n" +
    "제안할 내용이 있으면, 반드시 아래 태그로 구현 태스크를 등록해:\n" +
    "[CHAIN: 태스크 제목 | PROMPT: 구체적인 구현 지시 | APPROVAL: true]\n" +
    "APPROVAL: true로 설정하면 사용자 승인 후에만 실행됨.\n" +
    "PROMPT에는 제안을 실행하기 위한 구체적인 지시를 넣어 (파일 경로, 변경 내용 등).\n" +
    "제안 내용을 설명한 뒤 마지막에 태그를 넣어.";

  return strategy.promptTemplate
    .replace(/\{PROJECT\}/g, project)
    .replace(/\{PROJECT_DIR\}/g, PROJECT_DIR_MAP[project] || ".")
    .replace(/\{GOALS_CONTEXT\}/g, goalsContext) + chainInstruction;
}
