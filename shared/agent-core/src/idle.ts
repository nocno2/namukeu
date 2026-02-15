import type { ProjectCode } from "./types";
import type { GoalStore } from "./goals";

export interface IdleStrategy {
  id: string;
  title: string;
  project: ProjectCode | "RANDOM";
  promptTemplate: string;
  weight: number;
}

export const DEFAULT_IDLE_STRATEGIES: IdleStrategy[] = [
  {
    id: "code-review",
    title: "코드 리뷰",
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
    project: "RANDOM",
    weight: 1,
    promptTemplate:
      "{PROJECT} 프로젝트({PROJECT_DIR}/)의 README.md와 CLAUDE.md를 확인하고 " +
      "실제 코드와 일치하는지 점검해. 불일치하는 부분이 있으면 보고.\n{GOALS_CONTEXT}",
  },
  {
    id: "test-check",
    title: "테스트 점검",
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
    project: "RANDOM",
    weight: 1,
    promptTemplate:
      "{PROJECT} 프로젝트({PROJECT_DIR}/)를 분석하고 구현하면 좋을 작은 개선 사항 1개를 제안해.\n\n" +
      "제안에 포함할 내용:\n" +
      "- 무엇을 왜 추가/변경할지\n" +
      "- 코드 변경 범위\n\n" +
      "작은 것부터 — 대규모 리팩터링은 피해.\n{GOALS_CONTEXT}",
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

export function selectIdleStrategy(
  strategies: IdleStrategy[] = DEFAULT_IDLE_STRATEGIES
): { strategy: IdleStrategy; project: ProjectCode } {
  const totalWeight = strategies.reduce((sum, s) => sum + s.weight, 0);
  let rand = Math.random() * totalWeight;
  let selected = strategies[0];

  for (const s of strategies) {
    rand -= s.weight;
    if (rand <= 0) {
      selected = s;
      break;
    }
  }

  const project =
    selected.project === "RANDOM"
      ? PROJECT_POOL[Math.floor(Math.random() * PROJECT_POOL.length)]
      : selected.project;

  return { strategy: selected, project };
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

  return strategy.promptTemplate
    .replace(/\{PROJECT\}/g, project)
    .replace(/\{PROJECT_DIR\}/g, PROJECT_DIR_MAP[project] || ".")
    .replace(/\{GOALS_CONTEXT\}/g, goalsContext);
}
