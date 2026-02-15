import type { TaskStore } from "@namukeu/agent-core";

/**
 * Seed initial autonomous tasks if none exist.
 * Called once on bot startup.
 */
export function seedInitialTasks(taskStore: TaskStore): void {
  const existing = taskStore.getAll();
  if (existing.length > 0) return; // Already has tasks

  console.log("[agent] Seeding initial autonomous tasks...");

  // Daily morning briefing — 매일 오전 9시 (CEO 총괄)
  taskStore.createTask({
    title: "일일 시스템 브리핑",
    prompt:
      "각 프로젝트 상태를 점검하고 간단한 일일 브리핑을 작성해.\n\n" +
      "점검 항목:\n" +
      "1. 서버 상태: coin-auto-trade(:8001), train-go(:8000), dashboard(:8002), ai-blog(:3100) 각각 health check\n" +
      "2. 최근 에러 로그 확인 (각 서버의 로그 파일)\n" +
      "3. coin-auto-trade: 현재 포지션과 수익률\n" +
      "4. ai-blog: 최근 게시글 현황\n\n" +
      "결과를 간결하게 요약해서 보고해.",
    type: "recurring",
    project: "GENERAL",
    scheduleCron: "0 9 * * *",
    notifyUser: true,
  });

  // BLOG 팀장 — 매주 월요일 10시에 블로그 개선점 분석
  taskStore.createTask({
    title: "BLOG 주간 개선 분석",
    prompt:
      "ai-blog 프로젝트를 분석하고 개선할 점을 찾아서 보고해.\n\n" +
      "분석 항목:\n" +
      "1. 코드 품질: 에러 처리, 타입 안전성, 중복 코드\n" +
      "2. SEO: sitemap, meta tags, structured data 상태\n" +
      "3. 성능: 번들 크기, 이미지 최적화, 캐싱\n" +
      "4. 콘텐츠: 기존 글 업데이트 필요 여부\n" +
      "5. 신규 기능 제안: 구현하면 좋을 기능 1-2개\n\n" +
      "각 항목에 대해 현 상태와 개선 제안을 간결하게 정리해.\n" +
      "실제 코드를 읽고 분석해. 추측하지 마.",
    type: "recurring",
    project: "BLOG",
    scheduleCron: "0 10 * * 1",
    notifyUser: true,
  });

  // COIN 팀장 — 매일 오후 6시 코인 전략 리뷰
  taskStore.createTask({
    title: "COIN 일일 전략 리뷰",
    prompt:
      "coin-auto-trade 프로젝트의 전략 성과를 분석해.\n\n" +
      "1. http://127.0.0.1:8001/status 로 현재 상태 확인\n" +
      "2. http://127.0.0.1:8001/positions 로 포지션 확인\n" +
      "3. http://127.0.0.1:8001/portfolio 로 포트폴리오 확인\n" +
      "4. 오늘의 거래 내역과 수익률 요약\n" +
      "5. 전략 개선 제안이 있으면 포함\n\n" +
      "Authorization: Bearer test-token-for-dev 헤더 사용.\n" +
      "결과를 간결하게 요약해서 보고해.",
    type: "recurring",
    project: "COIN",
    scheduleCron: "0 18 * * *",
    notifyUser: true,
  });

  console.log("[agent] 3 initial tasks seeded.");
}
